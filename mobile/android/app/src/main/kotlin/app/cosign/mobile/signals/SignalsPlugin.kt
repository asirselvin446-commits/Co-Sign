package app.cosign.mobile.signals

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.AppOpsManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.provider.ContactsContract
import android.provider.Settings
import android.telephony.PhoneStateListener
import android.telephony.SubscriptionManager
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import android.view.WindowManager
import androidx.core.content.ContextCompat
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
    PluginRegistry.RequestPermissionsResultListener {

    private lateinit var context: Context
    private lateinit var methods: MethodChannel
    private lateinit var events: EventChannel
    private var activity: Activity? = null
    private var binding: ActivityPluginBinding? = null
    private var sink: EventChannel.EventSink? = null
    private val main = Handler(Looper.getMainLooper())
    private val mainExecutor = Executor { main.post(it) }

    private lateinit var callTracker: CallStateTracker
    private var telephonyCallback: Any? = null
    private var phoneStateListener: PhoneStateListener? = null
    private var audioModeListener: Any? = null

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
        callTracker = CallStateTracker(isKnownContact = ::lookupContact)
        startCallMonitoring()
    }

    override fun onDetachedFromEngine(b: FlutterPlugin.FlutterPluginBinding) {
        stopCallMonitoring()
        methods.setMethodCallHandler(null)
        events.setStreamHandler(null)
    }

    override fun onAttachedToActivity(b: ActivityPluginBinding) {
        binding = b
        activity = b.activity
        b.addRequestPermissionsResultListener(this)
        startScreenMonitoring()
    }

    override fun onDetachedFromActivity() {
        stopScreenMonitoring()
        binding?.removeRequestPermissionsResultListener(this)
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
        updateAudioMode()
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
            call = callTracker.snapshot(),
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

    // ------------------------------------------------------------------ calls

    private fun lookupContact(number: String): Boolean? {
        if (!granted(Manifest.permission.READ_CONTACTS)) return null
        val uri = Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(number))
        return try {
            context.contentResolver.query(uri, arrayOf(ContactsContract.PhoneLookup._ID), null, null, null)?.use { it.count > 0 } ?: false
        } catch (_: SecurityException) {
            null
        }
    }

    private fun mapState(state: Int) = when (state) {
        TelephonyManager.CALL_STATE_RINGING -> CallStateTracker.State.RINGING
        TelephonyManager.CALL_STATE_OFFHOOK -> CallStateTracker.State.OFFHOOK
        else -> CallStateTracker.State.IDLE
    }

    private fun onCallState(state: Int, number: String?) {
        callTracker.onTelephonyState(mapState(state), number)
        emit(mapOf("type" to "call_state", "active" to (state == TelephonyManager.CALL_STATE_OFFHOOK)))
    }

    @SuppressLint("MissingPermission")
    private fun startCallMonitoring() {
        stopCallMonitoring()
        val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
        if (granted(Manifest.permission.READ_PHONE_STATE)) {
            if (granted(Manifest.permission.READ_CALL_LOG) || Build.VERSION.SDK_INT < 31) {
                // PhoneStateListener is the only API that hands us the incoming number (needs
                // READ_CALL_LOG); the number is used for the local contacts lookup and then dropped.
                @Suppress("DEPRECATION")
                val listener = object : PhoneStateListener(mainExecutor) {
                    @Deprecated("Deprecated in Java")
                    override fun onCallStateChanged(state: Int, phoneNumber: String?) = onCallState(state, phoneNumber)
                }
                @Suppress("DEPRECATION")
                tm.listen(listener, PhoneStateListener.LISTEN_CALL_STATE)
                phoneStateListener = listener
            } else {
                val cb = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
                    override fun onCallStateChanged(state: Int) = onCallState(state, null)
                }
                tm.registerTelephonyCallback(mainExecutor, cb)
                telephonyCallback = cb
            }
        }
        if (Build.VERSION.SDK_INT >= 31) {
            val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            val l = AudioManager.OnModeChangedListener { mode -> callTracker.onAudioMode(isCallMode(mode)) }
            audio.addOnModeChangedListener(mainExecutor, l)
            audioModeListener = l
        }
        updateAudioMode()
    }

    private fun isCallMode(mode: Int) = mode == AudioManager.MODE_IN_CALL || mode == AudioManager.MODE_IN_COMMUNICATION

    private fun updateAudioMode() {
        val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        callTracker.onAudioMode(isCallMode(audio.mode))
    }

    private fun stopCallMonitoring() {
        val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
        phoneStateListener?.let {
            @Suppress("DEPRECATION")
            tm.listen(it, PhoneStateListener.LISTEN_NONE)
        }
        phoneStateListener = null
        if (Build.VERSION.SDK_INT >= 31) {
            (telephonyCallback as? TelephonyCallback)?.let { tm.unregisterTelephonyCallback(it) }
            (audioModeListener as? AudioManager.OnModeChangedListener)?.let {
                (context.getSystemService(Context.AUDIO_SERVICE) as AudioManager).removeOnModeChangedListener(it)
            }
        }
        telephonyCallback = null
        audioModeListener = null
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
        startCallMonitoring()
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
    }
}
