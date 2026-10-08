package app.cosign.mobile.signals

/**
 * Tracks whether the phone is in a call, for how long, and whether the other party is a saved
 * contact. Pure logic: Android callbacks feed it states, a lookup function answers "is this number
 * in my contacts?". The number itself is only ever held in memory for that lookup.
 */
class CallStateTracker(
    private val clock: () -> Long = System::currentTimeMillis,
    /** Returns true/false when contacts can be checked, null when permission is missing. */
    private val isKnownContact: (String) -> Boolean? = { null },
) {
    enum class State { IDLE, RINGING, OFFHOOK }

    private var state = State.IDLE
    private var callStartedAt: Long? = null
    private var ringingNumber: String? = null
    private var numberKnown = NumberKnown.UNAVAILABLE
    /** Set when an in-call audio mode (cellular or VoIP) is observed without telephony callbacks. */
    private var audioInCall = false
    private var audioSince: Long? = null

    @Synchronized
    fun onTelephonyState(newState: State, incomingNumber: String?) {
        when (newState) {
            State.RINGING -> {
                state = State.RINGING
                if (!incomingNumber.isNullOrBlank()) ringingNumber = incomingNumber
            }
            State.OFFHOOK -> {
                if (state != State.OFFHOOK) {
                    callStartedAt = clock()
                    val number = ringingNumber ?: incomingNumber?.takeIf { it.isNotBlank() }
                    numberKnown = classify(number)
                }
                state = State.OFFHOOK
            }
            State.IDLE -> reset()
        }
    }

    /** AudioManager MODE_IN_CALL / MODE_IN_COMMUNICATION: catches VoIP calls and needs no permission. */
    @Synchronized
    fun onAudioMode(inCall: Boolean) {
        if (inCall && !audioInCall) audioSince = clock()
        if (!inCall) audioSince = null
        audioInCall = inCall
    }

    @Synchronized
    fun snapshot(): CallSignal {
        val now = clock()
        return when {
            state == State.OFFHOOK -> CallSignal(true, ((now - (callStartedAt ?: now)) / 1000).coerceAtLeast(0), numberKnown)
            // Ringing is not yet "in a call", but an unanswered scam call is not risky by itself.
            audioInCall -> CallSignal(true, ((now - (audioSince ?: now)) / 1000).coerceAtLeast(0), NumberKnown.UNAVAILABLE)
            else -> CallSignal(false, 0, NumberKnown.UNAVAILABLE)
        }
    }

    private fun classify(number: String?): NumberKnown {
        if (number.isNullOrBlank()) return NumberKnown.UNAVAILABLE
        return when (isKnownContact(number)) {
            true -> NumberKnown.KNOWN
            false -> NumberKnown.UNKNOWN
            null -> NumberKnown.UNAVAILABLE
        }
    }

    private fun reset() {
        state = State.IDLE
        callStartedAt = null
        ringingNumber = null
        numberKnown = NumberKnown.UNAVAILABLE
    }
}
