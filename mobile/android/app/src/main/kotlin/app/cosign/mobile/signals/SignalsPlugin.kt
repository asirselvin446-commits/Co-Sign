package app.cosign.mobile.signals

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.AppOpsManager
import android.app.role.RoleManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.Process
import android.provider.Settings
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
import android.view.WindowManager
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import app.cosign.mobile.monitor.AppCatalog
import app.cosign.mobile.generated.LinkRulesData
import app.cosign.mobile.monitor.CallWatcher
import app.cosign.mobile.monitor.LinkAnalyzer
import app.cosign.mobile.signin.AssistedSignInActivity
import app.cosign.mobile.signin.SignInCrypto
import app.cosign.mobile.monitor.CoSignDeviceAdmin
import app.cosign.mobile.monitor.MonitorForegroundService
import app.cosign.mobile.monitor.MonitorHub
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.StandardIntegrityManager.PrepareIntegrityTokenRequest
import com.google.android.play.core.integrity.StandardIntegrityManager.StandardIntegrityTokenRequest
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.embedding.engine.plugins.activity.ActivityAware
import io.flutter.embedding.engine.plugins.activity.ActivityPluginBinding
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugin.common.PluginRegistry
import java.security.SecureRandom
import java.util.concurrent.Executor
import java.util.function.Consumer

/**
 * Native scam-signal collection for Co-Sign.
 *
 * Channel "app.cosign/signals" (methods) and "app.cosign/signals/events" (stream).
 * Every signal degrades gracefully: if a permission is denied, the matching field reports
 * "unavailable" instead of failing, and the app keeps working with fewer signals.
 */
class SignalsPlugin :
    FlutterPlugin,
    ActivityAware,
    MethodChannel.MethodCallHandler,
    EventChannel.StreamHandler,
    PluginRegistry.RequestPermissionsResultListener,
    PluginRegistry.ActivityResultListener {

    private lateinit var context: Context
    private lateinit var methods: MethodChannel
    private lateinit var events: EventChannel
    private var activity: Activity? = null
    private var binding: ActivityPluginBinding? = null
    private var sink: EventChannel.EventSink? = null
    private val main = Handler(Looper.getMainLooper())
    private val mainExecutor = Executor { main.post(it) }


    private var screenshotSeenAt: Long = 0
    private var recordingActive = false
    private var screenCaptureCallback: Any? = null
    private var recordingCallback: Consumer<Int>? = null

    private var pendingPermissionResult: MethodChannel.Result? = null
    private var pendingPermissions: Array<String> = emptyArray()

    // ------------------------------------------------------------------ lifecycle

    override fun onAttachedToEngine(b: FlutterPlugin.FlutterPluginBinding) {
        context = b.applicationContext
        methods = MethodChannel(b.binaryMessenger, "app.cosign/signals")
        events = EventChannel(b.binaryMessenger, "app.cosign/signals/events")
        methods.setMethodCallHandler(this)
        events.setStreamHandler(this)
        CallWatcher.start(context)
        CallWatcher.onCallState = { active -> emit(mapOf("type" to "call_state", "active" to active)) }
    }

    override fun onDetachedFromEngine(b: FlutterPlugin.FlutterPluginBinding) {
        CallWatcher.onCallState = null
        methods.setMethodCallHandler(null)
        events.setStreamHandler(null)
    }

    override fun onAttachedToActivity(b: ActivityPluginBinding) {
        binding = b
        activity = b.activity
        b.addRequestPermissionsResultListener(this)
        b.addActivityResultListener(this)
        startScreenMonitoring()
    }

    override fun onDetachedFromActivity() {
        stopScreenMonitoring()
        binding?.removeRequestPermissionsResultListener(this)
        binding?.removeActivityResultListener(this)
        binding = null
        activity = null
    }

    override fun onReattachedToActivityForConfigChanges(b: ActivityPluginBinding) = onAttachedToActivity(b)
    override fun onDetachedFromActivityForConfigChanges() = onDetachedFromActivity()

    override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
        sink = events
    }

    override fun onCancel(arguments: Any?) {
        sink = null
    }

    private fun emit(event: Map<String, Any?>) = main.post { sink?.success(event) }

    // ------------------------------------------------------------------ method calls

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        try {
            when (call.method) {
                "getSnapshot" -> {
                    val extra = call.argument<List<String>>("remoteAccessPackages") ?: emptyList()
                    result.success(snapshot(RemoteAccessDetector.BUILT_IN + extra).toChannelMap())
                }
                "permissionStatus" -> result.success(coverage().let {
                    mapOf("phoneState" to it.phoneState, "callLog" to it.callLog, "contacts" to it.contacts, "usageStats" to it.usageStats)
                })
                "requestPermissions" -> requestPermissions(call.argument<List<String>>("groups") ?: emptyList(), result)
                "openUsageAccessSettings" -> {
                    val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(intent)
                    result.success(true)
                }
                "setSecure" -> {
                    val secure = call.argument<Boolean>("secure") ?: true
                    val act = activity
                    if (act == null) result.success(false) else {
                        act.runOnUiThread {
                            if (secure) act.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                            else act.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                        }
                        result.success(true)
                    }
                }
                "integrityToken" -> integrityToken(
                    call.argument<String>("cloudProjectNumber")?.toLongOrNull(),
                    call.argument<String>("requestHash"),
                    result,
                )
                "isDeviceSecure" -> {
                    val km = context.getSystemService(Context.KEYGUARD_SERVICE) as android.app.KeyguardManager
                    result.success(km.isDeviceSecure)
                }
                "monitorConfigure" -> {
                    MonitorHub.init(context)
                    val enabled = call.argument<Boolean>("enabled") ?: false
                    AppCatalog.setExtra(call.argument<Map<String, String>>("extraApps") ?: emptyMap())
                    MonitorHub.configure(call.argument("baseUrl"), call.argument("token"), enabled, call.argument("lang"))
                    if (MonitorHub.enabled) MonitorForegroundService.start(context) else MonitorForegroundService.stop(context)
                    result.success(MonitorHub.enabled)
                }
                "monitorStatus" -> result.success(monitorStatus())
                "monitorOpen" -> {
                    openMonitorSetting(call.argument<String>("what") ?: "")
                    result.success(true)
                }
                "monitorRequestCallScreening" -> requestCallScreeningRole(result)
                "analyzeText" -> result.success(analyzeText(call.argument<String>("text") ?: ""))
                "reportScamText" -> {
                    MonitorHub.init(context)
                    MonitorHub.onMessage(call.argument<String>("text") ?: "", null, null)
                    MonitorHub.flush()
                    result.success(true)
                }
                "takeSharedText" -> {
                    val t = sharedText
                    sharedText = null
                    result.success(t)
                }
                "signinSeal" -> {
                    val pub = call.argument<String>("publicKey") ?: return result.error("bad-args", "publicKey", null)
                    val plain = call.argument<String>("plaintext") ?: return result.error("bad-args", "plaintext", null)
                    val aad = SignInCrypto.aad(call.argument<String>("requestId") ?: "", call.argument<String>("package"), call.argument<String>("host"))
                    // Sealing runs off the UI thread; the plaintext is never logged or kept.
                    MonitorHub.init(context)
                    MonitorHub.runOnWorker {
                        val sealed = runCatching { SignInCrypto.seal(pub, plain, aad) }
                        main.post { sealed.fold({ result.success(it) }, { result.error("seal-failed", it.message, null) }) }
                    }
                }
                "autofillStatus" -> result.success(autofillStatus())
                "openAutofillSettings" -> {
                    openAutofillSettings()
                    result.success(true)
                }
                "signInApps" -> result.success(signInApps())
                "startShowSignIn" -> {
                    MonitorHub.init(context)
                    context.startActivity(AssistedSignInActivity.showIntent(context, call.argument<String>("package") ?: "", call.argument<String>("label") ?: ""))
                    result.success(true)
                }
                "monitorFlush" -> {
                    MonitorHub.flush()
                    result.success(true)
                }
                "platformInfo" -> result.success(
                    mapOf(
                        "sdkInt" to Build.VERSION.SDK_INT,
                        "screenshotDetection" to (Build.VERSION.SDK_INT >= 34),
                        "recordingDetection" to (Build.VERSION.SDK_INT >= 35),
                    ),
                )
                else -> result.notImplemented()
            }
        } catch (e: Exception) {
            result.error("signals-error", e.message, null)
        }
    }

    // ------------------------------------------------------------------ snapshot

    private fun snapshot(remotePackages: List<String>): SignalSnapshot {
        CallWatcher.refreshAudio(context)
        val detector = RemoteAccessDetector(
            isInstalled = ::isInstalled,
            enabledAccessibilityServices = {
                RemoteAccessDetector.parseAccessibilitySetting(
                    Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES),
                )
            },
            lastUsedMillis = ::lastUsed,
        )
        val recentScreenshot = System.currentTimeMillis() - screenshotSeenAt < 2 * 60 * 1000
        return SignalSnapshot(
            call = CallWatcher.tracker.snapshot(),
            remoteAccess = detector.detect(remotePackages),
            screen = ScreenSignal(captureDetected = recentScreenshot, recordingActive = recordingActive),
            simFingerprint = simFingerprint(),
            coverage = coverage(),
        )
    }

    private fun granted(permission: String) =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    private fun coverage() = Coverage(
        phoneState = granted(Manifest.permission.READ_PHONE_STATE),
        callLog = granted(Manifest.permission.READ_CALL_LOG),
        contacts = granted(Manifest.permission.READ_CONTACTS),
        usageStats = hasUsageAccess(),
    )

    private fun isInstalled(pkg: String): Boolean = try {
        if (Build.VERSION.SDK_INT >= 33) {
            context.packageManager.getPackageInfo(pkg, PackageManager.PackageInfoFlags.of(0))
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.getPackageInfo(pkg, 0)
        }
        true
    } catch (_: PackageManager.NameNotFoundException) {
        false
    }

    private fun hasUsageAccess(): Boolean {
        val ops = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= 29) {
            ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
        } else {
            @Suppress("DEPRECATION")
            ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }

    private fun lastUsed(packages: List<String>): Map<String, Long>? {
        if (!hasUsageAccess()) return null
        val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val now = System.currentTimeMillis()
        val stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, now - 60 * 60 * 1000, now) ?: return emptyMap()
        return stats.filter { it.packageName in packages }.associate { it.packageName to it.lastTimeUsed }
    }

    // ------------------------------------------------------------------ SIM

    private fun installSalt(): String {
        val prefs = context.getSharedPreferences("cosign_signals", Context.MODE_PRIVATE)
        prefs.getString("salt", null)?.let { return it }
        val bytes = ByteArray(32).also { SecureRandom().nextBytes(it) }
        val salt = bytes.joinToString("") { "%02x".format(it) }
        prefs.edit().putString("salt", salt).apply()
        return salt
    }

    @SuppressLint("MissingPermission")
    private fun simFingerprint(): String? {
        val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
        val subs = if (granted(Manifest.permission.READ_PHONE_STATE)) {
            try {
                val sm = context.getSystemService(SubscriptionManager::class.java)
                sm?.activeSubscriptionInfoList?.map {
                    val mccMnc = if (Build.VERSION.SDK_INT >= 29) "${it.mccString}${it.mncString}" else ""
                    val carrierId = if (Build.VERSION.SDK_INT >= 29) it.carrierId else -1
                    SimFingerprint.Subscription(it.subscriptionId, it.simSlotIndex, carrierId, mccMnc)
                }
            } catch (_: SecurityException) {
                null
            }
        } else {
            null
        }
        val carrierId = if (Build.VERSION.SDK_INT >= 28) tm.simCarrierId else -1
        return SimFingerprint.compute(installSalt(), subs, carrierId, tm.simOperator)
    }

    // ------------------------------------------------------------------ screen capture

    private fun startScreenMonitoring() {
        val act = activity ?: return
        if (Build.VERSION.SDK_INT >= 34) {
            val cb = Activity.ScreenCaptureCallback {
                screenshotSeenAt = System.currentTimeMillis()
                emit(mapOf("type" to "screen_captured"))
            }
            act.registerScreenCaptureCallback(mainExecutor, cb)
            screenCaptureCallback = cb
        }
        if (Build.VERSION.SDK_INT >= 35) {
            val wm = act.windowManager
            val consumer = Consumer<Int> { state ->
                recordingActive = state == WindowManager.SCREEN_RECORDING_STATE_VISIBLE
                emit(mapOf("type" to "screen_recording", "active" to recordingActive))
            }
            val initial = wm.addScreenRecordingCallback(mainExecutor, consumer)
            recordingActive = initial == WindowManager.SCREEN_RECORDING_STATE_VISIBLE
            recordingCallback = consumer
        }
    }

    private fun stopScreenMonitoring() {
        val act = activity ?: return
        if (Build.VERSION.SDK_INT >= 34) {
            (screenCaptureCallback as? Activity.ScreenCaptureCallback)?.let { act.unregisterScreenCaptureCallback(it) }
        }
        if (Build.VERSION.SDK_INT >= 35) {
            recordingCallback?.let { act.windowManager.removeScreenRecordingCallback(it) }
        }
        screenCaptureCallback = null
        recordingCallback = null
    }

    // ------------------------------------------------------------------ family protection

    private fun monitorStatus(): Map<String, Any> {
        val notificationAccess = NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)
        val accessibility = Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)
            ?.split(':')?.any { it.startsWith(context.packageName + "/") } == true
        val callScreening = if (Build.VERSION.SDK_INT >= 29) {
            context.getSystemService(RoleManager::class.java)?.isRoleHeld(RoleManager.ROLE_CALL_SCREENING) == true
        } else {
            false
        }
        val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        return mapOf(
            "enabled" to MonitorHub.enabled,
            "usageAccess" to hasUsageAccess(),
            "notificationAccess" to notificationAccess,
            "accessibility" to accessibility,
            "callScreening" to callScreening,
            "overlay" to Settings.canDrawOverlays(context),
            "batteryUnrestricted" to power.isIgnoringBatteryOptimizations(context.packageName),
            "phoneState" to granted(Manifest.permission.READ_PHONE_STATE),
            "contacts" to granted(Manifest.permission.READ_CONTACTS),
            "deviceAdmin" to CoSignDeviceAdmin.isActive(context),
            "autofill" to (context.getSystemService(android.view.autofill.AutofillManager::class.java)?.hasEnabledAutofillServices() == true),
        )
    }

    private fun openMonitorSetting(what: String) {
        val pkgUri = Uri.parse("package:" + context.packageName)
        val intent = when (what) {
            "usageAccess" -> Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
            "notificationAccess" -> Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
            "accessibility" -> Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            "overlay" -> Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, pkgUri)
            "battery" -> Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, pkgUri)
            "deviceAdmin" -> Intent(android.app.admin.DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN)
                .putExtra(android.app.admin.DevicePolicyManager.EXTRA_DEVICE_ADMIN, CoSignDeviceAdmin.component(context))
                .putExtra(android.app.admin.DevicePolicyManager.EXTRA_ADD_EXPLANATION, context.getString(app.cosign.mobile.R.string.device_admin_description))
            else -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkgUri)
        }.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(intent)
        } catch (_: Exception) {
            context.startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }

    private var pendingRoleResult: MethodChannel.Result? = null

    private fun requestCallScreeningRole(result: MethodChannel.Result) {
        val act = activity
        if (Build.VERSION.SDK_INT < 29 || act == null) {
            result.success(false)
            return
        }
        val rm = act.getSystemService(RoleManager::class.java)
        if (rm == null || !rm.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING)) {
            result.success(false)
            return
        }
        if (rm.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)) {
            result.success(true)
            return
        }
        pendingRoleResult = result
        act.startActivityForResult(rm.createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING), ROLE_REQUEST_CODE)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?): Boolean {
        if (requestCode != ROLE_REQUEST_CODE) return false
        pendingRoleResult?.success(resultCode == Activity.RESULT_OK)
        pendingRoleResult = null
        return true
    }

    // ------------------------------------------------------------------ permissions

    private fun requestPermissions(groups: List<String>, result: MethodChannel.Result) {
        val act = activity
        if (act == null || pendingPermissionResult != null) {
            result.error("no-activity", "No foreground activity to ask for permission", null)
            return
        }
        val wanted = groups.flatMap {
            when (it) {
                "phone" -> listOf(Manifest.permission.READ_PHONE_STATE)
                "callLog" -> listOf(Manifest.permission.READ_CALL_LOG)
                "contacts" -> listOf(Manifest.permission.READ_CONTACTS)
                else -> emptyList()
            }
        }.filterNot(::granted).distinct().toTypedArray()
        if (wanted.isEmpty()) {
            result.success(true)
            return
        }
        pendingPermissionResult = result
        pendingPermissions = wanted
        act.requestPermissions(wanted, REQUEST_CODE)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray): Boolean {
        if (requestCode != REQUEST_CODE) return false
        val result = pendingPermissionResult ?: return true
        pendingPermissionResult = null
        // Re-register so newly granted permissions take effect immediately.
        CallWatcher.restart(context)
        result.success(pendingPermissions.all(::granted))
        return true
    }

    // ------------------------------------------------------------------ Play Integrity

    private fun integrityToken(cloudProjectNumber: Long?, requestHash: String?, result: MethodChannel.Result) {
        if (cloudProjectNumber == null || requestHash.isNullOrBlank()) {
            result.error("integrity-unavailable", "Play Integrity is not configured", null)
            return
        }
        val manager = IntegrityManagerFactory.createStandard(context)
        manager.prepareIntegrityToken(PrepareIntegrityTokenRequest.builder().setCloudProjectNumber(cloudProjectNumber).build())
            .addOnSuccessListener { provider ->
                provider.request(StandardIntegrityTokenRequest.builder().setRequestHash(requestHash).build())
                    .addOnSuccessListener { token -> result.success(token.token()) }
                    .addOnFailureListener { e -> result.error("integrity-failed", e.message, null) }
            }
            .addOnFailureListener { e -> result.error("integrity-failed", e.message, null) }
    }

    companion object {
        private const val REQUEST_CODE = 0x5157
        private const val ROLE_REQUEST_CODE = 0x5158

        @Volatile private var sharedText: String? = null

        /** Text shared to Co-Sign ("Check a link"), kept until the app reads it. */
        fun offerSharedText(text: String) {
            sharedText = text
        }
    }

    // ------------------------------------------------------------------ sign-in help and link checks

    private fun linkMap(l: LinkAnalyzer.Link): Map<String, Any?> = mapOf(
        "host" to l.host,
        "domain" to l.registrableDomain,
        "flags" to l.flags,
        "brand" to l.brand,
        "brandName" to LinkRulesData.BRANDS.firstOrNull { it.id == l.brand }?.name,
        "verdict" to l.verdict,
    )

    private fun analyzeText(text: String): Map<String, Any?> {
        val m = LinkAnalyzer.analyzeMessage(text)
        return mapOf("phrases" to m.phrases, "scam" to m.scam, "links" to m.links.map(::linkMap), "worst" to m.worst?.let(::linkMap))
    }

    /** Co-Sign is the phone's autofill service (needed for guardian sign-in). */
    private fun autofillStatus(): Map<String, Boolean> {
        val am = context.getSystemService(android.view.autofill.AutofillManager::class.java)
        return mapOf("supported" to (am?.isAutofillSupported == true), "enabled" to (am?.hasEnabledAutofillServices() == true))
    }

    private fun openAutofillSettings() {
        val intent = Intent(Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE, Uri.parse("package:" + context.packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            (activity ?: context).startActivity(intent)
        } catch (_: Exception) {
            context.startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }

    /** Installed apps Co-Sign knows (banks, payments, email, social), for "Sign in with help". */
    private fun signInApps(): List<Map<String, String>> {
        val pm = context.packageManager
        return pm.getInstalledApplications(0).mapNotNull { info ->
            val cat = AppCatalog.categoryOf(info.packageName) ?: return@mapNotNull null
            if (cat == AppCatalog.REMOTE_ACCESS || cat == AppCatalog.BROWSER || cat == AppCatalog.MESSAGING) return@mapNotNull null
            mapOf("package" to info.packageName, "label" to pm.getApplicationLabel(info).toString(), "category" to cat)
        }.sortedBy { it["label"] }
    }
}
