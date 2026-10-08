package app.cosign.mobile.monitor

import app.cosign.mobile.signals.SimFingerprint

/** Who is calling, as one of: known, unknown, hidden, international, unavailable. */
object CallerClassifier {
    const val KNOWN = "known"
    const val UNKNOWN = "unknown"
    const val HIDDEN = "hidden"
    const val INTERNATIONAL = "international"
    const val UNAVAILABLE = "unavailable"

    private val callingCodes = mapOf(
        "in" to "91", "us" to "1", "ca" to "1", "gb" to "44", "ae" to "971", "sa" to "966", "sg" to "65", "my" to "60",
        "lk" to "94", "np" to "977", "bd" to "880", "au" to "61", "qa" to "974", "kw" to "965", "om" to "968",
    )

    /**
     * @param number the caller's number as the system reports it, or null
     * @param restricted the network marked the number as private/restricted
     * @param simCountryIso this phone's SIM country (e.g. "in")
     * @param isContact true/false if contacts could be checked, null without permission
     */
    fun classify(number: String?, restricted: Boolean, simCountryIso: String?, isContact: Boolean?): String {
        if (restricted) return HIDDEN
        val n = number?.filter { it.isDigit() || it == '+' }.orEmpty()
        if (n.isEmpty()) return HIDDEN
        if (isContact == true) return KNOWN
        if (isInternational(n, simCountryIso)) return INTERNATIONAL
        return if (isContact == false) UNKNOWN else UNAVAILABLE
    }

    fun isInternational(n: String, simCountryIso: String?): Boolean {
        val home = callingCodes[simCountryIso?.lowercase()] ?: return false
        return when {
            n.startsWith("+") -> !n.removePrefix("+").startsWith(home)
            n.startsWith("00") -> !n.removePrefix("00").startsWith(home)
            else -> false
        }
    }
}

/**
 * Counts calls from the same unknown number within two hours. Numbers are kept only as salted
 * hashes in memory, never stored or sent.
 */
class RepeatCallTracker(private val salt: String, private val clock: () -> Long = System::currentTimeMillis) {
    private val seen = ArrayDeque<Pair<String, Long>>()
    private val windowMs = 2 * 60 * 60 * 1000L

    @Synchronized
    fun record(number: String): Int {
        val now = clock()
        while (seen.isNotEmpty() && now - seen.first().second > windowMs) seen.removeFirst()
        val h = SimFingerprint.sha256Hex("$salt\u0000${number.filter { it.isDigit() }.takeLast(10)}")
        seen.addLast(h to now)
        return seen.count { it.first == h }
    }
}
