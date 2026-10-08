package app.cosign.mobile.signin

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.service.autofill.Dataset
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.autofill.AutofillId
import android.view.autofill.AutofillManager
import android.view.autofill.AutofillValue
import android.widget.Button
import android.widget.LinearLayout
import android.widget.RemoteViews
import android.widget.ScrollView
import android.widget.TextView
import app.cosign.mobile.R
import app.cosign.mobile.generated.LinkRulesData
import app.cosign.mobile.monitor.MonitorHub
import org.json.JSONObject
import java.security.KeyPair
import java.util.Locale

/**
 * Shown over a sign-in screen after the person taps "Ask my guardian to sign me in".
 *
 * 1. Makes a one-time key pair (kept in memory only) and asks the server to tell the guardians.
 * 2. Waits, polling every 2 seconds, while saying plainly who will see what.
 * 3. When a guardian fills it, opens the sealed answer with the one-time key and hands it to
 *    Android autofill, which types it into the sign-in screen. Nothing is stored.
 *
 * "show" mode (apps that block autofill) shows the sign-in for 60 seconds instead, if the guardian
 * allowed it. "warning" mode explains that the page is a fake website.
 */
class AssistedSignInActivity : Activity() {
    private val main = Handler(Looper.getMainLooper())
    private lateinit var strings: Context
    private lateinit var status: TextView
    private lateinit var column: LinearLayout
    private var keyPair: KeyPair? = null
    private var requestId: String? = null
    private var finished = false
    private var secondsLeft = SHOW_SECONDS

    private val mode get() = intent.getStringExtra(EXTRA_MODE) ?: MODE_FILL
    private val pkg get() = intent.getStringExtra(EXTRA_PACKAGE)
    private val host get() = intent.getStringExtra(EXTRA_HOST)
    private val label get() = intent.getStringExtra(EXTRA_LABEL) ?: pkg ?: ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        MonitorHub.init(this)
        strings = createConfigurationContext(Configuration(resources.configuration).apply { setLocale(Locale.forLanguageTag(MonitorHub.language)) })
        buildUi()
        when {
            mode == MODE_WARNING -> showWarning()
            !MonitorHub.enabled -> done(str(R.string.signin_off), ok = false)
            else -> start()
        }
    }

    private fun str(id: Int, vararg args: Any): String = strings.getString(id, *args)

    private fun buildUi() {
        val dp = resources.displayMetrics.density
        column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding((24 * dp).toInt(), (40 * dp).toInt(), (24 * dp).toInt(), (40 * dp).toInt())
        }
        status = text("", 20f)
        setContentView(ScrollView(this).apply {
            isFillViewport = true
            setBackgroundColor(Color.parseColor(if (mode == MODE_WARNING) "#B3261E" else "#1B2559"))
            addView(column)
        })
    }

    private fun text(s: String, size: Float, bold: Boolean = false): TextView = TextView(this).apply {
        text = s
        textSize = size
        setTextColor(Color.WHITE)
        if (bold) setTypeface(typeface, Typeface.BOLD)
        setPadding(0, 12, 0, 12)
    }

    private fun button(label: String, primary: Boolean, onClick: () -> Unit) = Button(this).apply {
        text = label
        textSize = 18f
        isAllCaps = false
        minHeight = (60 * resources.displayMetrics.density).toInt()
        setTextColor(if (primary) Color.parseColor("#1B2559") else Color.WHITE)
        setBackgroundColor(if (primary) Color.WHITE else Color.parseColor("#2B3670"))
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = 24 }
        setOnClickListener { onClick() }
    }

    // ---------------------------------------------------------------- fake website

    private fun showWarning() {
        val brand = LinkRulesData.BRANDS.firstOrNull { it.id == intent.getStringExtra(EXTRA_BRAND) }?.name
        column.addView(text(str(R.string.signin_fake_title), 26f, bold = true))
        column.addView(text(str(R.string.signin_fake_body, host ?: "", brand ?: str(R.string.signin_fake_brand_unknown)), 19f))
        column.addView(button(str(R.string.signin_close), primary = true) { cancel() })
    }

    // ---------------------------------------------------------------- ask the guardian

    private fun start() {
        column.addView(text(str(if (mode == MODE_SHOW) R.string.signin_show_ask_title else R.string.signin_ask_title), 26f, bold = true))
        column.addView(text(str(R.string.signin_they_see, label), 18f))
        column.addView(status)
        status.text = str(R.string.signin_asking)
        column.addView(button(str(R.string.signin_cancel), primary = false) { cancel() })
        MonitorHub.runOnWorker {
            val kp = SignInCrypto.newKeyPair()
            keyPair = kp
            val body = JSONObject()
                .put("mode", mode)
                .put("target", JSONObject().put("package", pkg ?: JSONObject.NULL).put("webDomain", host ?: JSONObject.NULL).put("appLabel", label.take(80)))
                .put("publicKey", SignInCrypto.publicKeyB64(kp))
                .put("call", MonitorHub.currentCallJson())
            val reply = MonitorHub.call("POST", "/v1/signin", body)
            main.post {
                when {
                    reply == null -> done(str(R.string.signin_offline), ok = false)
                    reply.code == 200 -> {
                        requestId = reply.body?.optString("id")
                        status.text = str(R.string.signin_waiting)
                        poll()
                    }
                    else -> done(errorText(reply), ok = false)
                }
            }
        }
    }

    private fun errorText(reply: MonitorHub.Reply): String {
        val e = reply.body?.optJSONObject("error") ?: return str(R.string.signin_offline)
        return listOf(e.optString("cause"), e.optString("next")).filter { it.isNotBlank() }.joinToString("\n\n")
    }

    private fun poll() {
        val id = requestId ?: return
        if (finished) return
        MonitorHub.runOnWorker {
            val reply = MonitorHub.call("GET", "/v1/signin/$id", null)
            main.post {
                if (finished) return@post
                val b = reply?.body
                when (b?.optString("status")) {
                    "filled", "delivered" -> {
                        val sealed = b.optString("ciphertext").takeIf { it.isNotBlank() && !b.isNull("ciphertext") }
                        if (sealed == null) done(str(R.string.signin_expired), ok = false) else answer(sealed, b.optString("guardianName"))
                    }
                    "denied" -> done(str(R.string.signin_denied, b.optString("guardianName").ifBlank { str(R.string.signin_your_guardian) }), ok = false)
                    "expired" -> done(str(R.string.signin_expired), ok = false)
                    "cancelled" -> done("", ok = false)
                    else -> main.postDelayed({ poll() }, 2000)
                }
            }
        }
    }

    private fun answer(sealed: String, guardian: String) {
        val kp = keyPair ?: return
        val id = requestId ?: return
        val creds = try {
            JSONObject(SignInCrypto.open(kp.private, sealed, SignInCrypto.aad(id, pkg, host)))
        } catch (_: Exception) {
            return done(str(R.string.signin_offline), ok = false)
        }
        keyPair = null
        val user = creds.optString("u")
        val pass = creds.optString("p")
        if (mode == MODE_SHOW) return reveal(user, pass)

        @Suppress("DEPRECATION")
        val passwordId = intent.getParcelableExtra<AutofillId>(EXTRA_PASSWORD_ID) ?: return done(str(R.string.signin_offline), ok = false)
        @Suppress("DEPRECATION")
        val usernameId = intent.getParcelableExtra<AutofillId>(EXTRA_USERNAME_ID)
        val view = RemoteViews(packageName, R.layout.autofill_item).apply { setTextViewText(R.id.autofill_text, str(R.string.signin_filled_by, guardian)) }
        val b = Dataset.Builder(view)
        @Suppress("DEPRECATION")
        run {
            if (usernameId != null && user.isNotEmpty()) b.setValue(usernameId, AutofillValue.forText(user), view)
            b.setValue(passwordId, AutofillValue.forText(pass), view)
        }
        finished = true
        setResult(RESULT_OK, Intent().putExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT, b.build()))
        finish()
    }

    /** "Show for 1 minute": only when the guardian allowed it and the person is not on a risky call. */
    private fun reveal(user: String, pass: String) {
        finished = true
        column.removeAllViews()
        column.addView(text(str(R.string.signin_show_title), 22f, bold = true))
        column.addView(text(str(R.string.signin_username), 16f))
        column.addView(text(user, 28f, bold = true).apply { textDirection = View.TEXT_DIRECTION_LTR })
        column.addView(text(str(R.string.signin_password), 16f))
        column.addView(text(pass, 28f, bold = true).apply { textDirection = View.TEXT_DIRECTION_LTR })
        val countdown = text(str(R.string.signin_show_hides, SHOW_SECONDS), 17f)
        column.addView(countdown)
        column.addView(button(str(R.string.signin_close), primary = true) { cancel() })
        fun tick() {
            if (isFinishing) return
            if (secondsLeft <= 0) return cancel()
            countdown.text = str(R.string.signin_show_hides, secondsLeft)
            secondsLeft--
            main.postDelayed({ tick() }, 1000)
        }
        tick()
    }

    private fun done(message: String, ok: Boolean) {
        finished = true
        keyPair = null
        if (message.isEmpty()) return cancel()
        column.removeAllViews()
        column.addView(text(message, 20f, bold = !ok))
        column.addView(button(str(R.string.signin_close), primary = true) { cancel() })
    }

    private fun cancel() {
        val id = requestId
        if (!finished && id != null) MonitorHub.runOnWorker { MonitorHub.call("POST", "/v1/signin/$id/cancel", JSONObject()) }
        finished = true
        keyPair = null
        setResult(RESULT_CANCELED)
        finish()
    }

    override fun onDestroy() {
        main.removeCallbacksAndMessages(null)
        keyPair = null
        super.onDestroy()
    }

    @Deprecated("Back cancels the request")
    override fun onBackPressed() = cancel()

    companion object {
        const val MODE_FILL = "fill"
        const val MODE_SHOW = "show"
        const val MODE_WARNING = "warning"
        private const val SHOW_SECONDS = 60
        private const val EXTRA_MODE = "mode"
        private const val EXTRA_PACKAGE = "package"
        private const val EXTRA_HOST = "host"
        private const val EXTRA_LABEL = "label"
        private const val EXTRA_BRAND = "brand"
        private const val EXTRA_USERNAME_ID = "usernameId"
        private const val EXTRA_PASSWORD_ID = "passwordId"

        fun fillIntent(ctx: Context, pkg: String, host: String?, label: String, usernameId: AutofillId?, passwordId: AutofillId): Intent =
            Intent(ctx, AssistedSignInActivity::class.java)
                .putExtra(EXTRA_MODE, MODE_FILL)
                .putExtra(EXTRA_PACKAGE, pkg)
                .putExtra(EXTRA_HOST, host)
                .putExtra(EXTRA_LABEL, label)
                .putExtra(EXTRA_USERNAME_ID, usernameId)
                .putExtra(EXTRA_PASSWORD_ID, passwordId)

        fun warningIntent(ctx: Context, domain: String, brand: String?): Intent =
            Intent(ctx, AssistedSignInActivity::class.java).putExtra(EXTRA_MODE, MODE_WARNING).putExtra(EXTRA_HOST, domain).putExtra(EXTRA_BRAND, brand)

        /** From the Co-Sign app, for apps that block autofill. */
        fun showIntent(ctx: Context, pkg: String, label: String): Intent =
            Intent(ctx, AssistedSignInActivity::class.java)
                .putExtra(EXTRA_MODE, MODE_SHOW)
                .putExtra(EXTRA_PACKAGE, pkg)
                .putExtra(EXTRA_LABEL, label)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
}
