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

    /** Link problems worth reporting even without scam wording. */
    private val STRONG_LINK_FLAGS = setOf("apk_download", "hidden_host", "ip_address", "punycode", "upi_collect")

    @Volatile var context: Context? = null
        private set
    private lateinit var prefs: SharedPreferences
    internal val worker by lazy { HandlerThread("cosign-monitor").apply { start() } }
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

    // ------------------------------------------------------------------ counters

    @Volatile private var lastOtpAt = 0L
    @Volatile private var lastScamLinkAt = 0L
    private val failedLogins = AttemptCounter(30 * 60_000L)
    private val failedUnlocks = AttemptCounter(15 * 60_000L)

    /** Seconds since the last one-time-code notification, if it was in the last ten minutes. */
    fun secondsSinceOtp(now: Long = System.currentTimeMillis()): Int? {
        val t = lastOtpAt
        if (t == 0L) return null
        val s = ((now - t) / 1000).toInt()
        return if (s in 0..600) s else null
    }

    /** Seconds since a scam message with a link arrived, if it was in the last ten minutes. */
    fun secondsSinceScamLink(now: Long = System.currentTimeMillis()): Int? {
        val t = lastScamLinkAt
        if (t == 0L) return null
        val s = ((now - t) / 1000).toInt()
        return if (s in 0..MonitorRules.SCAM_LINK_WINDOW_SEC) s else null
    }

    /**
     * A message (SMS, chat, email) was checked on the phone. Only scam wording kinds, link flags and
     * the domain of a worrying link are reported; the text itself is never kept or sent.
     */
    fun onMessage(text: String, packageName: String?, category: String?) {
        val m = LinkAnalyzer.analyzeMessage(text)
        val worst = m.worst
        val dangerousLink = worst != null && (worst.verdict == LinkAnalyzer.LOOKALIKE || (worst.verdict == LinkAnalyzer.SUSPICIOUS && worst.flags.any { it in STRONG_LINK_FLAGS }))
        if (!m.scam && !dangerousLink) return
        if (worst != null && worst.verdict != LinkAnalyzer.OFFICIAL) lastScamLinkAt = System.currentTimeMillis()
        val worrying = worst != null && (worst.verdict == LinkAnalyzer.LOOKALIKE || worst.verdict == LinkAnalyzer.SUSPICIOUS)
        report(
            "notification_scam",
            packageName,
            category,
            scamPhrases = m.phrases,
            linkFlags = m.linkFlags,
            linkVerdict = worst?.verdict,
            linkDomain = if (worrying) worst?.registrableDomain else null,
            dedupeKey = "notification_scam|" + text.hashCode(),
        )
    }

    /** Co-Sign autofill saw a password field on a fake or risky website. */
    fun onPhishingPage(browserPackage: String, link: LinkAnalyzer.Link) {
        report(
            "phishing_page",
            browserPackage,
            AppCatalog.categoryOf(browserPackage) ?: AppCatalog.BROWSER,
            linkFlags = link.flags,
            linkVerdict = link.verdict,
            linkDomain = link.registrableDomain,
            dedupeKey = "phishing_page|" + link.registrableDomain,
        )
    }

    /** A notification was classified on the phone. */
    fun onNotification(kind: NotificationClassifier.Kind, packageName: String?, category: String?, amountBucket: String?) {
        when (kind) {
            NotificationClassifier.Kind.OTP -> lastOtpAt = System.currentTimeMillis()
            NotificationClassifier.Kind.FAILED_LOGIN -> {
                report(kind.wire, packageName, category, attempts = failedLogins.add(), dedupe = false)
                return
            }
            else -> Unit
        }
        report(kind.wire, packageName, category, amountBucket)
    }

    /** A wrong screen-lock PIN, pattern or password (from the device-admin receiver). */
    fun onUnlockFailed() {
        val n = failedUnlocks.add()
        // Report at 3 and 5 wrong tries, then every 5 more, so the guardian hears about it without a flood.
        if (n == 3 || n == 5 || (n > 5 && n % 5 == 0)) report("unlock_failed", null, null, attempts = n, dedupe = false)
    }

    fun onUnlockSucceeded() = failedUnlocks.clear()

    // ------------------------------------------------------------------ events

    /**
     * Record something that happened. Scores it on the phone first: if it is critical at a sensitive
     * moment, the pause screen appears immediately, then the event is uploaded for the guardian.
     */
    fun report(
        kind: String,
        packageName: String?,
        category: String?,
        amountBucket: String? = null,
        attempts: Int? = null,
        installer: String? = null,
        grant: String? = null,
        dedupe: Boolean = true,
        scamPhrases: List<String> = emptyList(),
        linkFlags: List<String> = emptyList(),
        linkVerdict: String? = null,
        linkDomain: String? = null,
        dedupeKey: String? = null,
    ) {
        if (!enabled) return
        val key = dedupeKey ?: "$kind|$packageName"
        val now = System.currentTimeMillis()
        if (dedupe) {
            synchronized(recent) {
                if (now - (recent[key] ?: 0) < DEDUPE_MS) return
                recent[key] = now
            }
        }
        val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
        val call = currentCall()
        val sinceOtp = if (kind == "app_foreground") secondsSinceOtp(now) else null
        val sinceScamLink = if (kind == "login_screen" || (kind == "app_foreground" && category == AppCatalog.BROWSER)) secondsSinceScamLink(now) else null
        val assessment = MonitorRules.assess(
            MonitorRules.Event(kind, category, amountBucket, call, hour, sinceOtp, attempts, installer, grant, scamPhrases, linkFlags, linkVerdict, sinceScamLink),
            null,
        )
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
            .put("sinceOtpSec", sinceOtp ?: JSONObject.NULL)
            .put("attempts", attempts ?: JSONObject.NULL)
            .put("installer", installer ?: JSONObject.NULL)
            .put("grant", grant ?: JSONObject.NULL)
            .put("scamPhrases", JSONArray(scamPhrases))
            .put("linkFlags", JSONArray(linkFlags))
            .put("linkVerdict", linkVerdict ?: JSONObject.NULL)
            .put("linkDomain", linkDomain ?: JSONObject.NULL)
            .put("sinceScamLinkSec", sinceScamLink ?: JSONObject.NULL)
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

    /** "Ask my guardian to let me continue", from the pause screen. */
    fun askRelease(pauseId: String, done: (Boolean) -> Unit) = handler.post {
        val base = baseUrl
        val tok = token
        val ok = base != null && tok != null && request("POST", "$base/v1/monitor/pauses/$pauseId/ask", tok, "{}") != null
        done(ok)
    }

    /** "I need help": tells every guardian. */
    fun help(done: (Boolean) -> Unit) = handler.post {
        val base = baseUrl
        val tok = token
        done(base != null && tok != null && request("POST", "$base/v1/monitor/help", tok, "{}") != null)
    }

    data class Commands(val pauseId: String?, val pauseRules: List<String>, val byGuardian: Boolean, val lock: Boolean)

    /** What the server wants this phone to do now (a guardian pause or lock). Null when offline. */
    fun commands(): Commands? {
        val base = baseUrl ?: return null
        val tok = token ?: return null
        val body = request("GET", "$base/v1/monitor/commands", tok, null) ?: return null
        val json = JSONObject(body)
        val pause = json.optJSONObject("pause")
        val rules = pause?.optJSONArray("rules")?.let { a -> (0 until a.length()).map { a.getString(it) } } ?: emptyList()
        return Commands(pause?.getString("id"), rules, pause?.optBoolean("byGuardian") ?: false, json.optBoolean("lock"))
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

    /** A server reply: HTTP status and JSON body (also for errors, which carry text in the chosen language). */
    data class Reply(val code: Int, val body: JSONObject?)

    /** Call the server with this phone's monitor token. Null when protection is off or the phone is offline. */
    fun call(method: String, path: String, body: JSONObject?): Reply? {
        val base = baseUrl ?: return null
        val tok = token ?: return null
        return try {
            val c = URL(base + path).openConnection() as HttpURLConnection
            c.requestMethod = method
            c.connectTimeout = 10_000
            c.readTimeout = 15_000
            c.setRequestProperty("x-monitor-token", tok)
            c.setRequestProperty("x-cosign-lang", language)
            c.setRequestProperty("accept", "application/json")
            if (body != null) {
                c.doOutput = true
                c.setRequestProperty("content-type", "application/json")
                c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val code = c.responseCode
            if (code == 401) configure(baseUrl, null, false, language)
            val stream = if (code in 200..299) c.inputStream else c.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() }
            Reply(code, text?.takeIf { it.isNotBlank() }?.let { runCatching { JSONObject(it) }.getOrNull() })
        } catch (_: Exception) {
            null
        }
    }

    /** The current call as the server expects it, or null. */
    fun currentCallJson(): Any = currentCall()?.let {
        JSONObject().put("active", it.active).put("durationSec", it.durationSec).put("caller", it.caller).put("repeatCount", it.repeatCount)
    } ?: JSONObject.NULL
}
