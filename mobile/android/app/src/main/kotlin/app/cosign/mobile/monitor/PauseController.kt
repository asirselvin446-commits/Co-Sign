package app.cosign.mobile.monitor

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import app.cosign.mobile.MainActivity
import app.cosign.mobile.R

/**
 * The safety pause: a full-screen warning shown over a payment or sign-in screen when the moment
 * looks like a scam. The person can always continue after a short countdown (never a lockout);
 * a guardian can release it remotely sooner.
 */
@SuppressLint("StaticFieldLeak")
object PauseController {
    private const val COUNTDOWN_SECONDS = 60
    private val main = Handler(Looper.getMainLooper())
    private var view: View? = null
    private var windowManager: WindowManager? = null
    private var clientId: String? = null
    private var serverPauseId: String? = null
    private var secondsLeft = COUNTDOWN_SECONDS
    private var strings: Context? = null

    /** Strings in the language chosen inside Co-Sign, not the phone's system language. */
    private fun localized(ctx: Context): Context {
        val config = android.content.res.Configuration(ctx.resources.configuration)
        config.setLocale(java.util.Locale.forLanguageTag(MonitorHub.language))
        return ctx.createConfigurationContext(config)
    }

    private fun str(id: Int, vararg args: Any): String = (strings ?: MonitorHub.context!!).getString(id, *args)

    /** Set by the accessibility service: its overlay works without the draw-over-apps permission. */
    @Volatile var accessibilityContext: Context? = null

    fun show(forClientId: String, rules: List<String>) = main.post {
        if (view != null) return@post
        val ctx = accessibilityContext ?: MonitorHub.context ?: return@post
        val type = when {
            accessibilityContext != null -> WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY
            Settings.canDrawOverlays(ctx) -> WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else -> {
                openApp(ctx)
                return@post
            }
        }
        clientId = forClientId
        serverPauseId = null
        secondsLeft = COUNTDOWN_SECONDS
        val wm = ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        strings = localized(ctx)
        val root = buildView(ctx, rules)
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            type,
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or WindowManager.LayoutParams.FLAG_SECURE,
            PixelFormat.OPAQUE,
        )
        wm.addView(root, params)
        view = root
        windowManager = wm
        tick()
    }

    fun attachServerPause(forClientId: String, pauseId: String) = main.post {
        if (forClientId == clientId) {
            serverPauseId = pauseId
            poll()
        }
    }

    private fun buildView(ctx: Context, rules: List<String>): View {
        val dp = ctx.resources.displayMetrics.density
        fun text(s: String, size: Float, bold: Boolean = false) = TextView(ctx).apply {
            text = s
            textSize = size
            setTextColor(Color.WHITE)
            if (bold) setTypeface(typeface, android.graphics.Typeface.BOLD)
            setPadding(0, (8 * dp).toInt(), 0, (8 * dp).toInt())
        }
        val reasons = rules.mapNotNull { MonitorStrings.reason(strings ?: ctx, it) }
        return LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(Color.parseColor("#B3261E"))
            setPadding((24 * dp).toInt(), (48 * dp).toInt(), (24 * dp).toInt(), (48 * dp).toInt())
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
            addView(text(str(R.string.pause_title), 28f, bold = true))
            addView(text(str(R.string.pause_body), 19f))
            reasons.forEach { addView(text("• $it", 17f)) }
            addView(text(str(R.string.pause_advice), 19f, bold = true))
            val status = text(str(R.string.pause_wait, COUNTDOWN_SECONDS), 17f).apply { tag = "status" }
            addView(status)
            addView(
                Button(ctx).apply {
                    text = str(R.string.pause_open_app)
                    textSize = 18f
                    minHeight = (56 * dp).toInt()
                    setOnClickListener {
                        hide()
                        openApp(ctx)
                    }
                },
            )
            addView(
                Button(ctx).apply {
                    tag = "continue"
                    text = str(R.string.pause_continue)
                    textSize = 18f
                    minHeight = (56 * dp).toInt()
                    isEnabled = false
                    setOnClickListener {
                        serverPauseId?.let(MonitorHub::dismissPause)
                        hide()
                    }
                },
            )
        }
    }

    private fun tick() {
        val v = view ?: return
        val ctx = v.context
        if (secondsLeft > 0) {
            (v.findViewWithTag<TextView>("status")).text = str(R.string.pause_wait, secondsLeft)
            secondsLeft--
            main.postDelayed({ tick() }, 1000)
        } else {
            (v.findViewWithTag<TextView>("status")).text = str(R.string.pause_can_continue)
            v.findViewWithTag<Button>("continue").isEnabled = true
        }
    }

    /** While shown, ask the server every 5 seconds whether a guardian released the pause. */
    private fun poll() {
        val id = serverPauseId ?: return
        if (view == null) return
        MonitorHub.runOnWorker {
            val status = MonitorHub.pauseStatus(id)
            main.post {
                if (status == "released") {
                    val v = view
                    v?.findViewWithTag<TextView>("status")?.text = str(R.string.pause_released)
                    main.postDelayed({ hide() }, 2500)
                } else if (status == null || status == "active") {
                    main.postDelayed({ poll() }, 5000)
                } else {
                    hide()
                }
            }
        }
    }

    fun hide() = main.post {
        val v = view ?: return@post
        try {
            windowManager?.removeView(v)
        } catch (_: Exception) {
            // already gone
        }
        view = null
        clientId = null
        serverPauseId = null
    }

    private fun openApp(ctx: Context) {
        val intent = Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        try {
            ctx.startActivity(intent)
        } catch (_: Exception) {
            // Background activity starts can be blocked; the guardian is still alerted.
        }
    }

    @Suppress("unused")
    private val sdk = Build.VERSION.SDK_INT
}

/** Pause-screen reason text in the phone's chosen language (mirrors the shared catalogue). */
object MonitorStrings {
    fun reason(ctx: Context, rule: String): String? {
        val id = ctx.resources.getIdentifier("rule_$rule", "string", ctx.packageName)
        return if (id == 0) null else ctx.getString(id)
    }
}
