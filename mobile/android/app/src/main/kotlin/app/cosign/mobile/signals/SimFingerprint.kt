package app.cosign.mobile.signals

import java.security.MessageDigest

/**
 * A SIM identity reduced to a salted hash. A change since the last session (new subscription ID,
 * different carrier) is a risk signal for SIM-swap fraud. The salt is random per installation, so
 * the value cannot be correlated across apps or devices.
 */
object SimFingerprint {
    data class Subscription(val subscriptionId: Int, val slotIndex: Int, val carrierId: Int, val mccMnc: String)

    /**
     * With READ_PHONE_STATE we hash every active subscription. Without it we fall back to the
     * carrier ID and operator code, which still change when a SIM from another network goes in.
     */
    fun compute(salt: String, subscriptions: List<Subscription>?, fallbackCarrierId: Int?, fallbackMccMnc: String?): String? {
        val material = when {
            !subscriptions.isNullOrEmpty() ->
                subscriptions
                    .sortedWith(compareBy({ it.slotIndex }, { it.subscriptionId }))
                    .joinToString("|") { "s:${it.subscriptionId}:${it.slotIndex}:${it.carrierId}:${it.mccMnc}" }
            fallbackCarrierId != null && fallbackCarrierId >= 0 || !fallbackMccMnc.isNullOrBlank() ->
                "c:${fallbackCarrierId ?: -1}:${fallbackMccMnc.orEmpty()}"
            else -> return null
        }
        return sha256Hex("$salt\u0000$material")
    }

    fun sha256Hex(s: String): String =
        MessageDigest.getInstance("SHA-256").digest(s.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
}
