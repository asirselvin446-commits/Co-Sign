package app.cosign.mobile.signals

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SimFingerprintAndSnapshotTest {
    private val sub1 = SimFingerprint.Subscription(subscriptionId = 3, slotIndex = 0, carrierId = 1862, mccMnc = "40445")
    private val sub2 = SimFingerprint.Subscription(subscriptionId = 7, slotIndex = 1, carrierId = 2001, mccMnc = "40410")

    @Test
    fun stableForTheSameSimsRegardlessOfOrder() {
        val a = SimFingerprint.compute("salt", listOf(sub1, sub2), null, null)
        val b = SimFingerprint.compute("salt", listOf(sub2, sub1), null, null)
        assertEquals(a, b)
        assertTrue(a!!.matches(Regex("^[0-9a-f]{64}$")))
    }

    @Test
    fun changesWhenASimIsSwapped() {
        val before = SimFingerprint.compute("salt", listOf(sub1), null, null)
        val swapped = SimFingerprint.compute("salt", listOf(sub1.copy(subscriptionId = 9)), null, null)
        assertNotEquals(before, swapped)
    }

    @Test
    fun saltPreventsCrossAppCorrelation() {
        assertNotEquals(SimFingerprint.compute("a", listOf(sub1), null, null), SimFingerprint.compute("b", listOf(sub1), null, null))
    }

    @Test
    fun fallsBackToCarrierWithoutPhonePermission() {
        val fp = SimFingerprint.compute("salt", null, 1862, "40445")
        assertNotNull(fp)
        assertNotEquals(fp, SimFingerprint.compute("salt", null, 2001, "40410"))
        assertNull(SimFingerprint.compute("salt", null, -1, ""))
    }

    @Test
    fun snapshotMapMatchesTheBackendSchemaAndCarriesNoIdentifiers() {
        val snapshot = SignalSnapshot(
            call = CallSignal(true, 300, NumberKnown.UNKNOWN),
            remoteAccess = RemoteAccessSignal(true, false),
            screen = ScreenSignal(false, true),
            simFingerprint = "f".repeat(64),
            coverage = Coverage(phoneState = true, callLog = false, contacts = true, usageStats = false),
        )
        val m = snapshot.toChannelMap()
        assertEquals(mapOf("active" to true, "durationSec" to 300L, "numberKnown" to "unknown"), m["call"])
        assertEquals(mapOf("installed" to true, "active" to false), m["remoteAccess"])
        assertEquals(mapOf("captureDetected" to false, "recordingActive" to true), m["screen"])
        assertEquals(mapOf("fingerprint" to "f".repeat(64)), m["sim"])
        val flat = m.toString()
        assertFalse(flat.contains("+91"))
        assertFalse(flat.contains("anydesk"))
    }

    @Test
    fun snapshotOmitsSimWhenUnknown() {
        val m = SignalSnapshot(
            CallSignal(false, 0, NumberKnown.UNAVAILABLE),
            RemoteAccessSignal(false, false),
            ScreenSignal(false, false),
            null,
            Coverage(false, false, false, false),
        ).toChannelMap()
        assertFalse(m.containsKey("sim"))
    }
}
