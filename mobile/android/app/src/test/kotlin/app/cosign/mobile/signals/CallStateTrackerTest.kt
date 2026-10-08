package app.cosign.mobile.signals

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CallStateTrackerTest {
    private var now = 1_000_000L
    private val contacts = setOf("+919800000001")

    private fun tracker(canReadContacts: Boolean = true) = CallStateTracker(
        clock = { now },
        isKnownContact = { number -> if (canReadContacts) number in contacts else null },
    )

    @Test
    fun idleReportsNoCall() {
        val s = tracker().snapshot()
        assertFalse(s.active)
        assertEquals(0, s.durationSec)
    }

    @Test
    fun incomingCallFromUnknownNumberIsUnknownAndTimed() {
        val t = tracker()
        t.onTelephonyState(CallStateTracker.State.RINGING, "+911400000999")
        t.onTelephonyState(CallStateTracker.State.OFFHOOK, null)
        now += 125_000
        val s = t.snapshot()
        assertTrue(s.active)
        assertEquals(125, s.durationSec)
        assertEquals(NumberKnown.UNKNOWN, s.numberKnown)
    }

    @Test
    fun incomingCallFromSavedContactIsKnown() {
        val t = tracker()
        t.onTelephonyState(CallStateTracker.State.RINGING, "+919800000001")
        t.onTelephonyState(CallStateTracker.State.OFFHOOK, null)
        assertEquals(NumberKnown.KNOWN, t.snapshot().numberKnown)
    }

    @Test
    fun withoutContactsPermissionTheNumberIsUnavailable() {
        val t = tracker(canReadContacts = false)
        t.onTelephonyState(CallStateTracker.State.RINGING, "+919800000001")
        t.onTelephonyState(CallStateTracker.State.OFFHOOK, null)
        assertEquals(NumberKnown.UNAVAILABLE, t.snapshot().numberKnown)
    }

    @Test
    fun withoutCallLogPermissionNoNumberMeansUnavailable() {
        val t = tracker()
        t.onTelephonyState(CallStateTracker.State.OFFHOOK, null)
        val s = t.snapshot()
        assertTrue(s.active)
        assertEquals(NumberKnown.UNAVAILABLE, s.numberKnown)
    }

    @Test
    fun ringingAloneIsNotACall() {
        val t = tracker()
        t.onTelephonyState(CallStateTracker.State.RINGING, "+911400000999")
        assertFalse(t.snapshot().active)
    }

    @Test
    fun hangingUpResetsEverything() {
        val t = tracker()
        t.onTelephonyState(CallStateTracker.State.RINGING, "+911400000999")
        t.onTelephonyState(CallStateTracker.State.OFFHOOK, null)
        t.onTelephonyState(CallStateTracker.State.IDLE, null)
        val s = t.snapshot()
        assertFalse(s.active)
        assertEquals(NumberKnown.UNAVAILABLE, s.numberKnown)
        // A later outgoing call must not inherit the earlier caller number.
        t.onTelephonyState(CallStateTracker.State.OFFHOOK, null)
        assertEquals(NumberKnown.UNAVAILABLE, t.snapshot().numberKnown)
    }

    @Test
    fun voipCallsAreDetectedFromAudioModeWithoutPermissions() {
        val t = tracker()
        t.onAudioMode(true)
        now += 61_000
        val s = t.snapshot()
        assertTrue(s.active)
        assertEquals(61, s.durationSec)
        assertEquals(NumberKnown.UNAVAILABLE, s.numberKnown)
        t.onAudioMode(false)
        assertFalse(t.snapshot().active)
    }

    @Test
    fun durationIsMeasuredFromOffHookNotRinging() {
        val t = tracker()
        t.onTelephonyState(CallStateTracker.State.RINGING, "+911400000999")
        now += 20_000
        t.onTelephonyState(CallStateTracker.State.OFFHOOK, null)
        now += 10_000
        assertEquals(10, t.snapshot().durationSec)
    }
}
