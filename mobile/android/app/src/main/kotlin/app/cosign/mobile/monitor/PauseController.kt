package app.cosign.mobile.monitor

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import app.cosign.mobile.MainActivity
import app.cosign.mobile.R

/**
 * The safety pause: a full-screen warning shown over a payment, sign-in or chat screen when the
 * moment looks like a scam, or when a guardian pauses the phone. The person can ask their guardian
 * to let them continue, and can always continue themselves after a short countdown (never a
 * lockout); a guardian can release it remotely sooner.
 */
@SuppressLint("StaticFieldLeak")
object PauseController {
    private const val COUNTDOWN_SECONDS = 60
    private val main = Handler(Looper.getMainLooper())
    private var view: View? = null
    private var windowManager: WindowManager? = null
    private var clientId: String? = null
    private var serverPauseId: String? = null
    private var askWhenAttached = false
    private var secondsLeft = COUNTDOWN_SECONDS
    private var strings: Context? = null

    /** Pauses the person has already moved past on this phone; never shown again from a poll. */
    private val handled = LinkedHashSet<String>()

    /** Local pauses the person continued past before the server knew about them. */
    private val dismissedClientIds = LinkedHashSet<String>()

    /** Strings in the language chosen inside Co-Sign, not the phone's system language. */
    private fun localized(ctx: Context): Context {
        val config = android.content.res.Configuration(ctx.resources.configuration)
        config.setLocale(java.util.Locale.forLanguageTag(MonitorHub.language))
        return ctx.createConfigurationContext(config)
    }

    private fun str(id: Int, vararg args: Any): String = (strings ?: MonitorHub.context!!).getString(id, *args)

    /** Set by the accessibility service: its overlay works without the draw-over-apps permission. */
    @Volatile var accessibilityContext: Context? = null

    /** A pause decided on this phone by the rules (shown instantly, even offline). */
    fun show(forClientId: String, rules: List<String>) = main.post { open(rules, byGuardian = false, localClientId = forClientId, pauseId = null) }

    /** A pause the server knows about (a guardian paused the phone, or a pause from another app session). */
    fun showServer(pauseId: String, rules: List<String>, byGuardian: Boolean) = main.post {
        if (pauseId in handled || pauseId == serverPauseId) return@post
        open(rules, byGuardian, localClientId = null, pauseId = pauseId)
    }

    private fun open(rules: List<String>, byGuardian: Boolean, localClientId: String?, pauseId: String?) {
        if (view != null) return
        val ctx = accessibilityContext ?: MonitorHub.context ?: return
        val type = when {
            accessibilityContext != null -> WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY
            Settings.canDrawOverlays(ctx) -> WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else -> {
                openApp(ctx)
                return
            }
        }
        clientId = localClientId
        serverPauseId = pauseId
        askWhenAttached = false
        secondsLeft = COUNTDOWN_SECONDS
        val wm = ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        strings = localized(ctx)
        val root = buildView(ctx, rules, byGuardian)
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
        if (pauseId != null) poll()
    }

    fun attachServerPause(forClientId: String, pauseId: String) = main.post {
        if (forClientId in dismissedClientIds) {
            // The person already continued before the upload finished: close it on the server too.
            dismissedClientIds.remove(forClientId)
            handled += pauseId
            MonitorHub.dismissPause(pauseId)
            return@post
        }
        if (forClientId == clientId) {
            serverPauseId = pauseId
            if (askWhenAttached) ask()
            poll()
        }
    }

    private fun buildView(ctx: Context, rules: List<String>, byGuardian: Boolean): View {
        val dp = ctx.resources.displayMetrics.density
        fun text(s: String, size: Float, bold: Boolean = false) = TextView(ctx).apply {
            text = s
            textSize = size
            setTextColor(Color.WHITE)
            if (bold) setTypeface(typeface, android.graphics.Typeface.BOLD)
            setPadding(0, (8 * dp).toInt(), 0, (8 * dp).toInt())
        }
        fun button(label: String, tagName: String, primary: Boolean, onClick: () -> Unit) = Button(ctx).apply {
            tag = tagName
            text = label
            textSize = 18f
            isAllCaps = false
            minHeight = (60 * dp).toInt()
            setTextColor(if (primary) Color.parseColor("#7A1A14") else Color.WHITE)
            setBackgroundColor(if (primary) Color.WHITE else Color.parseColor("#8C1D18"))
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                topMargin = (12 * dp).toInt()
            }
            setOnClickListener { onClick() }
        }
        val reasons = rules.mapNotNull { MonitorStrings.reason(strings ?: ctx, it) }
        val column = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding((24 * dp).toInt(), (48 * dp).toInt(), (24 * dp).toInt(), (48 * dp).toInt())
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
            addView(text(str(if (byGuardian) R.string.pause_guardian_title else R.string.pause_title), 28f, bold = true))
            if (!byGuardian) addView(text(str(R.string.pause_body), 19f))
            reasons.forEach { addView(text(if (byGuardian) it else "• $it", 17f)) }
            addView(text(str(R.string.pause_advice), 19f, bold = true))
            addView(text(str(R.string.pause_wait, COUNTDOWN_SECONDS), 17f).apply { tag = "status" })
            addView(button(str(R.string.pause_ask), "ask", primary = true) { ask() })
            addView(
                button(str(R.string.pause_open_app), "open", primary = false) {
                    serverPauseId?.let { handled += it }
                    hide()
                    openApp(ctx)
                },
            )
            addView(
                button(str(R.string.pause_continue), "continue", primary = false) {
                    val id = serverPauseId
                    if (id != null) {
                        handled += id
                        MonitorHub.dismissPause(id)
                    } else {
                        clientId?.let { dismissedClientIds += it }
                    }
                    hide()
                }.apply { isEnabled = false; alpha = 0.5f },
            )
        }
        return ScrollView(ctx).apply {
            setBackgroundColor(Color.parseColor("#B3261E"))
            isFillViewport = true
            addView(column)
        }
    }

    /** Tell the guardian the person wants to continue. Waits for the server ID if needed. */
    private fun ask() {
        val v = view ?: return
        v.findViewWithTag<Button>("ask")?.isEnabled = false
        v.findViewWithTag<TextView>("status")?.text = str(R.string.pause_asking)
        val id = serverPauseId
        if (id == null) {
            askWhenAttached = true
            return
        }
        MonitorHub.askRelease(id) { ok ->
            main.post {
                val current = view ?: return@post
                current.findViewWithTag<TextView>("status")?.text = str(if (ok) R.string.pause_asked else R.string.pause_ask_failed)
                current.findViewWithTag<Button>("ask")?.isEnabled = !ok
            }
        }
    }

    private fun tick() {
        val v = view ?: return
        val status = v.findViewWithTag<TextView>("status")
        val asked = v.findViewWithTag<Button>("ask")?.isEnabled == false
        if (secondsLeft > 0) {
            if (!asked) status.text = str(R.string.pause_wait, secondsLeft)
            secondsLeft--
            main.postDelayed({ tick() }, 1000)
        } else {
            if (!asked) status.text = str(R.string.pause_can_continue)
            v.findViewWithTag<Button>("continue").apply {
                isEnabled = true
                alpha = 1f
            }
        }
    }

    /** While shown, ask the server every 5 seconds whether a guardian released the pause. */
    private fun poll() {
        val id = serverPauseId ?: return
        if (view == null) return
        MonitorHub.runOnWorker {
            val status = MonitorHub.pauseStatus(id)
            main.post {
                if (serverPauseId != id) return@post
                if (status == "released") {
                    handled += id
                    view?.findViewWithTag<TextView>("status")?.text = str(R.string.pause_released)
                    main.postDelayed({ hide() }, 2500)
                } else if (status == null || status == "active") {
                    main.postDelayed({ poll() }, 5000)
                } else {
                    handled += id
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
        askWhenAttached = false
    }

    private fun openApp(ctx: Context) {
        val intent = Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        try {
            ctx.startActivity(intent)
        } catch (_: Exception) {
            // Background activity starts can be blocked; the guardian is still alerted.
        }
    }
}

/** Pause-screen reason text in the phone's chosen language (mirrors the shared catalogue). */
object MonitorStrings {
    fun reason(ctx: Context, rule: String): String? {
        val id = ctx.resources.getIdentifier("rule_$rule", "string", ctx.packageName)
        return if (id == 0) null else ctx.getString(id)
    }
}
