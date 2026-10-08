package app.cosign.mobile.signals

/**
 * Everything the signal plugin reports. Only booleans, durations and a salted hash leave the
 * phone: never phone numbers, contact names or the list of installed apps.
 */
enum class NumberKnown(val wire: String) {
    KNOWN("known"),
    UNKNOWN("unknown"),
    UNAVAILABLE("unavailable"),
}

data class CallSignal(val active: Boolean, val durationSec: Long, val numberKnown: NumberKnown)

data class RemoteAccessSignal(val installed: Boolean, val active: Boolean)

data class ScreenSignal(val captureDetected: Boolean, val recordingActive: Boolean)

data class Coverage(
    val phoneState: Boolean,
    val callLog: Boolean,
    val contacts: Boolean,
    val usageStats: Boolean,
)

data class SignalSnapshot(
    val call: CallSignal,
    val remoteAccess: RemoteAccessSignal,
    val screen: ScreenSignal,
    /** Salted SHA-256 (hex) of the SIM identity, or null if nothing could be read. */
    val simFingerprint: String?,
    val coverage: Coverage,
) {
    /** The exact map sent over the platform channel; mirrors the backend's deviceSignals schema. */
    fun toChannelMap(): Map<String, Any?> = buildMap {
        put(
            "call",
            mapOf(
                "active" to call.active,
                "durationSec" to call.durationSec,
                "numberKnown" to call.numberKnown.wire,
            ),
        )
        put("remoteAccess", mapOf("installed" to remoteAccess.installed, "active" to remoteAccess.active))
        put("screen", mapOf("captureDetected" to screen.captureDetected, "recordingActive" to screen.recordingActive))
        if (simFingerprint != null) put("sim", mapOf("fingerprint" to simFingerprint))
        put(
            "coverage",
            mapOf(
                "phoneState" to coverage.phoneState,
                "callLog" to coverage.callLog,
                "contacts" to coverage.contacts,
                "usageStats" to coverage.usageStats,
            ),
        )
    }
}
