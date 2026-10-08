package app.cosign.mobile.monitor

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.ContactsContract
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import androidx.core.content.ContextCompat
import app.cosign.mobile.signals.CallStateTracker
import java.util.concurrent.Executor

/**
 * Feeds call state into the shared [CallStateTracker] for both the in-app safety checks and
 * background family protection. Safe to start more than once; restart after permissions change.
 */
object CallWatcher {
    private val main = Handler(Looper.getMainLooper())
    private val executor = Executor { main.post(it) }
    private var telephonyCallback: Any? = null
    private var phoneStateListener: PhoneStateListener? = null
    private var audioListener: Any? = null
    private var started = false

    /** The tracker everybody reads. Contacts are checked only when the person allowed it. */
    val tracker: CallStateTracker by lazy { CallStateTracker(isKnownContact = ::lookupContact) }

    private fun granted(ctx: Context, p: String) = ContextCompat.checkSelfPermission(ctx, p) == PackageManager.PERMISSION_GRANTED

    private fun lookupContact(number: String): Boolean? {
        val ctx = MonitorHub.context ?: return null
        if (!granted(ctx, Manifest.permission.READ_CONTACTS)) return null
        val uri = Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(number))
        return try {
            ctx.contentResolver.query(uri, arrayOf(ContactsContract.PhoneLookup._ID), null, null, null)?.use { it.count > 0 } ?: false
        } catch (_: SecurityException) {
            null
        }
    }

    private fun mapState(state: Int) = when (state) {
        TelephonyManager.CALL_STATE_RINGING -> CallStateTracker.State.RINGING
        TelephonyManager.CALL_STATE_OFFHOOK -> CallStateTracker.State.OFFHOOK
        else -> CallStateTracker.State.IDLE
    }

    private fun isCallMode(mode: Int) = mode == AudioManager.MODE_IN_CALL || mode == AudioManager.MODE_IN_COMMUNICATION

    var onCallState: ((Boolean) -> Unit)? = null

    @Synchronized
    fun start(context: Context) {
        val ctx = context.applicationContext
        MonitorHub.init(ctx)
        if (started) return
        started = true
        val tm = ctx.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
        if (granted(ctx, Manifest.permission.READ_PHONE_STATE)) {
            if (granted(ctx, Manifest.permission.READ_CALL_LOG) || Build.VERSION.SDK_INT < 31) {
                // The only API that hands over the incoming number (needs READ_CALL_LOG). It is used
                // for the local contacts lookup and then dropped.
                @Suppress("DEPRECATION")
                val l = object : PhoneStateListener(executor) {
                    @Deprecated("Deprecated in Java")
                    override fun onCallStateChanged(state: Int, phoneNumber: String?) {
                        tracker.onTelephonyState(mapState(state), phoneNumber)
                        onCallState?.invoke(state == TelephonyManager.CALL_STATE_OFFHOOK)
                    }
                }
                @Suppress("DEPRECATION")
                tm.listen(l, PhoneStateListener.LISTEN_CALL_STATE)
                phoneStateListener = l
            } else {
                val cb = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
                    override fun onCallStateChanged(state: Int) {
                        tracker.onTelephonyState(mapState(state), null)
                        onCallState?.invoke(state == TelephonyManager.CALL_STATE_OFFHOOK)
                    }
                }
                tm.registerTelephonyCallback(executor, cb)
                telephonyCallback = cb
            }
        }
        val audio = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        if (Build.VERSION.SDK_INT >= 31) {
            val l = AudioManager.OnModeChangedListener { mode -> tracker.onAudioMode(isCallMode(mode)) }
            audio.addOnModeChangedListener(executor, l)
            audioListener = l
        }
        tracker.onAudioMode(isCallMode(audio.mode))
    }

    @SuppressLint("MissingPermission")
    @Synchronized
    fun restart(context: Context) {
        val ctx = context.applicationContext
        val tm = ctx.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
        phoneStateListener?.let {
            @Suppress("DEPRECATION")
            tm.listen(it, PhoneStateListener.LISTEN_NONE)
        }
        if (Build.VERSION.SDK_INT >= 31) {
            (telephonyCallback as? TelephonyCallback)?.let { tm.unregisterTelephonyCallback(it) }
            (audioListener as? AudioManager.OnModeChangedListener)?.let {
                (ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager).removeOnModeChangedListener(it)
            }
        }
        phoneStateListener = null
        telephonyCallback = null
        audioListener = null
        started = false
        start(ctx)
    }

    /** Refresh the permission-free in-call signal right before a snapshot. */
    fun refreshAudio(context: Context) {
        val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        tracker.onAudioMode(isCallMode(audio.mode))
    }
}
