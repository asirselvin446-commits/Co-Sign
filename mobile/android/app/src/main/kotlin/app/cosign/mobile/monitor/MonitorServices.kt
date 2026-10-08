package app.cosign.mobile.monitor

import android.Manifest
import android.accessibilityservice.AccessibilityService
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.ContactsContract
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.telecom.Call
import android.telecom.CallScreeningService
import android.telecom.TelecomManager
import android.telephony.TelephonyManager
import android.view.accessibility.AccessibilityEvent
import androidx.core.content.ContextCompat
import app.cosign.mobile.MainActivity
import app.cosign.mobile.R

/**
 * Accessibility service. Reports only *which kind of screen* is in front: a categorised app
 * (bank, UPI, wallet, email, remote control), a sign-in field, or a payment PIN pad. It never
 * reads window contents (canRetrieveWindowContent=false) and never sees what is typed.
 */
class CoSignAccessibilityService : AccessibilityService() {
    private var lastPackage: String? = null

    override fun onServiceConnected() {
        MonitorHub.init(this)
        PauseController.accessibilityContext = this
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        event ?: return
        val pkg = event.packageName?.toString() ?: return
        if (pkg == packageName) return
        val category = AppCatalog.categoryOf(pkg)
        when (event.eventType) {
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                if (pkg != lastPackage) {
                    lastPackage = pkg
                    if (category != null) MonitorHub.report("app_foreground", pkg, category)
                }
                if (isPinPad(event.className?.toString()) && category != null) MonitorHub.report("payment_screen", pkg, category)
            }
            AccessibilityEvent.TYPE_VIEW_FOCUSED -> {
                // isPassword is a property of the event itself: no screen content is read.
                if (event.isPassword && category != null) {
                    val kind = if (AppCatalog.isSensitive(category) && isPinPad(event.className?.toString())) "payment_screen" else "login_screen"
                    MonitorHub.report(kind, pkg, category)
                }
            }
        }
    }

    /** UPI apps embed NPCI's common PIN library; its activities are recognisable by class name. */
    private fun isPinPad(className: String?): Boolean {
        val c = className?.lowercase() ?: return false
        return "npci" in c || "upipin" in c || "pinactivity" in c || "mpin" in c
    }

    override fun onInterrupt() {}

    override fun onDestroy() {
        PauseController.accessibilityContext = null
        super.onDestroy()
    }
}

/**
 * Notification listener: classifies bank, UPI, OTP and sign-in alerts on the phone. Only the
 * category and an amount range are reported; the text is discarded immediately.
 */
class CoSignNotificationListener : NotificationListenerService() {
    override fun onListenerConnected() {
        MonitorHub.init(this)
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        sbn ?: return
        if (sbn.packageName == packageName || sbn.isOngoing) return
        val extras = sbn.notification?.extras ?: return
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()
        val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString()
        val result = NotificationClassifier.classify(title, text) ?: return
        // SMS apps carry bank messages; report the event without naming the messaging app.
        val category = AppCatalog.categoryOf(sbn.packageName)
        MonitorHub.report(result.kind.wire, if (category != null) sbn.packageName else null, category, result.amountBucket)
    }
}

/**
 * Call screening (Android 10+, when the person makes Co-Sign the call-screening app). Every call
 * is allowed through; Co-Sign only classifies the caller so warnings are accurate even without
 * call-log access. The number is used in memory for a contacts lookup and a salted hash, then dropped.
 */
class CoSignCallScreeningService : CallScreeningService() {
    override fun onScreenCall(details: Call.Details) {
        MonitorHub.init(this)
        try {
            if (details.callDirection == Call.Details.DIRECTION_INCOMING) {
                val number = details.handle?.schemeSpecificPart
                val restricted = details.handlePresentation != TelecomManager.PRESENTATION_ALLOWED
                val tm = getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
                val caller = CallerClassifier.classify(number, restricted, tm.simCountryIso, isContact(number))
                val repeats = if (caller != CallerClassifier.KNOWN && number != null) MonitorHub.repeatTracker?.record(number) ?: 0 else 0
                MonitorHub.onScreened(caller, repeats)
            }
        } finally {
            respondToCall(details, CallResponse.Builder().build())
        }
    }

    private fun isContact(number: String?): Boolean? {
        if (number.isNullOrBlank()) return null
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) return null
        val uri = Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(number))
        return try {
            contentResolver.query(uri, arrayOf(ContactsContract.PhoneLookup._ID), null, null, null)?.use { it.count > 0 } ?: false
        } catch (_: SecurityException) {
            null
        }
    }
}

/**
 * Keeps protection running with a visible, permanent notification (monitoring is never hidden).
 * Watches long calls and, when the accessibility service is off, which app is in front via
 * usage access. Also retries uploads.
 */
class MonitorForegroundService : Service() {
    private val main = Handler(Looper.getMainLooper())
    private var lastForeground: String? = null
    private var lastUsageQuery = System.currentTimeMillis()
    private var reportedCallMinutes = 0L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        MonitorHub.init(this)
        if (!MonitorHub.enabled) {
            stopSelf()
            return START_NOT_STICKY
        }
        startInForeground()
        CallWatcher.start(this)
        main.removeCallbacksAndMessages(null)
        main.post(loop)
        return START_STICKY
    }

    private val loop = object : Runnable {
        override fun run() {
            if (!MonitorHub.enabled) {
                stopSelf()
                return
            }
            if (PauseController.accessibilityContext == null) watchForegroundApp()
            watchCall()
            main.postDelayed(this, 3000)
        }
    }

    private fun watchForegroundApp() {
        val usm = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val now = System.currentTimeMillis()
        val events = try {
            usm.queryEvents(lastUsageQuery, now)
        } catch (_: SecurityException) {
            return
        }
        lastUsageQuery = now
        val e = UsageEvents.Event()
        while (events.hasNextEvent()) {
            events.getNextEvent(e)
            if (e.eventType == UsageEvents.Event.ACTIVITY_RESUMED && e.packageName != packageName && e.packageName != lastForeground) {
                lastForeground = e.packageName
                AppCatalog.categoryOf(e.packageName)?.let { MonitorHub.report("app_foreground", e.packageName, it) }
            }
        }
    }

    /** Report a long call at 15 and 45 minutes, even if nothing else happens on the phone. */
    private fun watchCall() {
        val call = MonitorHub.currentCall()
        if (call == null) {
            reportedCallMinutes = 0
            return
        }
        val minutes = call.durationSec / 60
        val threshold = listOf(15L, 45L).lastOrNull { minutes >= it } ?: return
        if (threshold > reportedCallMinutes) {
            reportedCallMinutes = threshold
            MonitorHub.report("call_update", null, null)
        }
    }

    private fun startInForeground() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(NotificationChannel(CHANNEL, getString(R.string.monitor_channel), NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val n = Notification.Builder(this, CHANNEL)
            .setContentTitle(getString(R.string.monitor_notification_title))
            .setContentText(getString(R.string.monitor_notification_body))
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setContentIntent(open)
            .build()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIFICATION_ID, n)
        }
    }

    override fun onDestroy() {
        main.removeCallbacksAndMessages(null)
        super.onDestroy()
    }

    companion object {
        private const val CHANNEL = "cosign_protection"
        private const val NOTIFICATION_ID = 0x5157

        fun start(ctx: Context) {
            ContextCompat.startForegroundService(ctx, Intent(ctx, MonitorForegroundService::class.java))
        }

        fun stop(ctx: Context) {
            ctx.stopService(Intent(ctx, MonitorForegroundService::class.java))
        }
    }
}

/** Restart protection after the phone reboots, if it was on. */
class MonitorBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        MonitorHub.init(context)
        if (MonitorHub.enabled) MonitorForegroundService.start(context)
    }
}
