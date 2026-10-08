package app.cosign.mobile.monitor

import android.content.Context
import android.content.SharedPreferences
import android.os.Handler
import android.os.HandlerThread
import app.cosign.mobile.signals.CallStateTracker
import app.cosign.mobile.signals.NumberKnown
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.SecureRandom
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Process-wide state for family protection: configuration, the current call, the event queue and
 * uploads. Services (accessibility, notification listener, call screening, foreground service) and
 * the Flutter plugin all report through here.
 */
object MonitorHub {
    private const val PREFS = "cosign_monitor"
    private const val QUEUE_MAX = 200
    private const val DEDUPE_MS = 30_000L

    @Volatile var context: Context? = null
        private set
    private lateinit var prefs: SharedPreferences
    private val worker by lazy { HandlerThread("cosign-monitor").apply { start() } }
    private val handler by lazy { Handler(worker.looper) }

    /** Shared with the signals plugin so in-app checks and background monitoring agree. */
    val callTracker: CallStateTracker get() = CallWatcher.tracker

    private var screenedCaller: String? = null
    private var screenedAt = 0L
    private var screenedRepeat = 0
    private val recent = HashMap<String, Long>()
    var repeatTracker: RepeatCallTracker? = null
        private set

    fun init(ctx: Context) {
        if (context != null) return
        context = ctx.applicationContext
        prefs = ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        repeatTracker = RepeatCallTracker(salt())
    }

    private fun salt(): String = prefs.getString("salt", null) ?: ByteArray(32).also { SecureRandom().nextBytes(it) }
        .joinToString("") { "%02x".format(it) }.also { prefs.edit().putString("salt", it).apply() }

    // ------------------------------------------------------------------ configuration

    val enabled: Boolean get() = context != null && prefs.getBoolean("enabled", false) && token != null
    private val baseUrl: String? get() = prefs.getString("baseUrl", null)
    private val token: String? get() = prefs.getString("token", null)
    val language: String get() = prefs.getString("lang", "en") ?: "en"

    fun configure(baseUrl: String?, token: String?, enabled: Boolean, lang: String?) {
        prefs.edit()
            .putString("baseUrl", baseUrl)
            .putString("token", token)
            .putBoolean("enabled", enabled && token != null)
            .putString("lang", lang ?: "en")
            .apply()
        if (!enabled) prefs.edit().remove("queue").apply()
    }

    // ------------------------------------------------------------------ calls

    /** Called by the call-screening service before the phone rings. */
    fun onScreened(caller: String, repeatCount: Int) {
        screenedCaller = caller
        screenedAt = System.currentTimeMillis()
        screenedRepeat = repeatCount
    }

    fun currentCall(): MonitorRules.Call? {
        val s = callTracker.snapshot()
        if (!s.active) return null
        // Prefer the screening result for this call (accurate even without call-log permission).
        val fresh = screenedCaller != null && System.currentTimeMillis() - screenedAt < s.durationSec * 1000 + 3 * 60_000
        val caller = if (fresh) screenedCaller!! else when (s.numberKnown) {
            NumberKnown.KNOWN -> CallerClassifier.KNOWN
            NumberKnown.UNKNOWN -> CallerClassifier.UNKNOWN
            NumberKnown.UNAVAILABLE -> CallerClassifier.UNAVAILABLE
        }
        return MonitorRules.Call(true, s.durationSec, caller, if (fresh) screenedRepeat else 0)
    }

    // ------------------------------------------------------------------ events

    /**
     * Record something that happened. Scores it on the phone first: if it is critical at a sensitive
     * moment, the pause screen appears immediately, then the event is uploaded for the guardian.
     */
    fun report(kind: String, packageName: String?, category: String?, amountBucket: String? = null) {
        if (!enabled) return
        val key = "$kind|$packageName"
        val now = System.currentTimeMillis()
        synchronized(recent) {
            if (now - (recent[key] ?: 0) < DEDUPE_MS) return
            recent[key] = now
        }
        val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
        val call = currentCall()
        val assessment = MonitorRules.assess(MonitorRules.Event(kind, category, amountBucket, call, hour), null)
        val clientId = newClientId()
        if (assessment.pause) PauseController.show(clientId, assessment.rules)
        val event = JSONObject()
            .put("clientId", clientId)
            .put("kind", kind)
            .put("occurredAt", iso(now))
            .put("app", if (packageName != null && category != null) JSONObject().put("package", packageName).put("category", category) else JSONObject.NULL)
            .put("amountBucket", amountBucket ?: JSONObject.NULL)
            .put(
                "call",
                call?.let { JSONObject().put("active", it.active).put("durationSec", it.durationSec).put("caller", it.caller).put("repeatCount", it.repeatCount) }
                    ?: JSONObject.NULL,
            )
            .put("localHour", hour)
            .put("paused", assessment.pause)
        enqueue(event)
        handler.post { upload() }
    }

    private fun newClientId(): String = ByteArray(12).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }

    private fun iso(ms: Long): String = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date(ms))

    @Synchronized
    private fun enqueue(e: JSONObject) {
        val q = JSONArray(prefs.getString("queue", "[]"))
        q.put(e)
        val trimmed = JSONArray()
        val start = maxOf(0, q.length() - QUEUE_MAX)
        for (i in start until q.length()) trimmed.put(q.get(i))
        prefs.edit().putString("queue", trimmed.toString()).apply()
    }

    fun flush() = handler.post { upload() }

    /** Upload queued events in batches of 50. Failures stay queued for the next attempt. */
    @Synchronized
    private fun upload() {
        val base = baseUrl ?: return
        val tok = token ?: return
        val q = JSONArray(prefs.getString("queue", "[]"))
        if (q.length() == 0) return
        val batch = JSONArray()
        for (i in 0 until minOf(50, q.length())) batch.put(q.get(i))
        val response = request("POST", "$base/v1/monitor/events", tok, JSONObject().put("events", batch).toString()) ?: return
        val results = JSONObject(response).optJSONArray("results") ?: JSONArray()
        for (i in 0 until results.length()) {
            val r = results.getJSONObject(i)
            if (!r.isNull("pauseId")) PauseController.attachServerPause(r.getString("clientId"), r.getString("pauseId"))
        }
        val rest = JSONArray()
        for (i in batch.length() until q.length()) rest.put(q.get(i))
        prefs.edit().putString("queue", rest.toString()).apply()
        if (rest.length() > 0) handler.post { upload() }
    }

    fun pauseStatus(pauseId: String): String? {
        val base = baseUrl ?: return null
        val tok = token ?: return null
        return request("GET", "$base/v1/monitor/pauses/$pauseId", tok, null)?.let { JSONObject(it).optString("status") }
    }

    fun dismissPause(pauseId: String) = handler.post {
        val base = baseUrl ?: return@post
        val tok = token ?: return@post
        request("POST", "$base/v1/monitor/pauses/$pauseId/dismiss", tok, "{}")
    }

    private fun request(method: String, url: String, tok: String, body: String?): String? = try {
        val c = URL(url).openConnection() as HttpURLConnection
        c.requestMethod = method
        c.connectTimeout = 10_000
        c.readTimeout = 15_000
        c.setRequestProperty("x-monitor-token", tok)
        c.setRequestProperty("accept", "application/json")
        if (body != null) {
            c.doOutput = true
            c.setRequestProperty("content-type", "application/json")
            c.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
        }
        val code = c.responseCode
        if (code == 401) {
            // Token revoked (consent withdrawn or phone removed): stop monitoring on this phone.
            configure(baseUrl, null, false, language)
            null
        } else if (code in 200..299) {
            c.inputStream.bufferedReader().use { it.readText() }
        } else {
            null
        }
    } catch (_: Exception) {
        null
    }

    fun runOnWorker(block: () -> Unit) = handler.post(block)
}
