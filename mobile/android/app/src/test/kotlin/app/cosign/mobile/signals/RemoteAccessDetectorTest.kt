package app.cosign.mobile.signals

import org.junit.Assert.assertEquals
import org.junit.Test

class RemoteAccessDetectorTest {
    private val now = 10_000_000_000L

    private fun detector(
        installed: Set<String> = emptySet(),
        accessibility: List<String> = emptyList(),
        usage: Map<String, Long>? = null,
    ) = RemoteAccessDetector(
        isInstalled = { it in installed },
        enabledAccessibilityServices = { accessibility },
        lastUsedMillis = { pkgs -> usage?.filterKeys { it in pkgs } },
        clock = { now },
    )

    @Test
    fun nothingInstalled() {
        assertEquals(RemoteAccessSignal(false, false), detector().detect(RemoteAccessDetector.BUILT_IN))
    }

    @Test
    fun installedButIdle() {
        val d = detector(installed = setOf("com.anydesk.anydeskandroid"))
        assertEquals(RemoteAccessSignal(installed = true, active = false), d.detect(RemoteAccessDetector.BUILT_IN))
    }

    @Test
    fun activeWhenItsAccessibilityServiceIsOn() {
        val d = detector(
            installed = setOf("com.teamviewer.quicksupport.market"),
            accessibility = listOf("com.teamviewer.quicksupport.market/com.teamviewer.quicksupport.addon.AccessibilityService"),
        )
        assertEquals(RemoteAccessSignal(installed = true, active = true), d.detect(RemoteAccessDetector.BUILT_IN))
    }

    @Test
    fun accessibilityServiceOfAnUnrelatedAppDoesNotCount() {
        val d = detector(
            installed = setOf("com.rustdesk.rustdesk"),
            accessibility = listOf("com.google.android.marvin.talkback/.TalkBackService"),
        )
        assertEquals(RemoteAccessSignal(installed = true, active = false), d.detect(RemoteAccessDetector.BUILT_IN))
    }

    @Test
    fun activeWhenUsedInTheLast30Minutes() {
        val recent = detector(installed = setOf("com.rustdesk.rustdesk"), usage = mapOf("com.rustdesk.rustdesk" to now - 5 * 60_000))
        assertEquals(true, recent.detect(RemoteAccessDetector.BUILT_IN).active)
        val old = detector(installed = setOf("com.rustdesk.rustdesk"), usage = mapOf("com.rustdesk.rustdesk" to now - 3 * 3600_000))
        assertEquals(false, old.detect(RemoteAccessDetector.BUILT_IN).active)
    }

    @Test
    fun serverDeliveredPackagesAreCheckedAndInvalidNamesIgnored() {
        val d = detector(installed = setOf("com.example.remotehelp"))
        assertEquals(true, d.detect(listOf("com.example.remotehelp", "not a package", "")).installed)
    }

    @Test
    fun checkerFailuresAreTreatedAsNotInstalled() {
        val d = RemoteAccessDetector(
            isInstalled = { throw SecurityException("hidden") },
            enabledAccessibilityServices = { emptyList() },
            lastUsedMillis = { null },
        )
        assertEquals(RemoteAccessSignal(false, false), d.detect(RemoteAccessDetector.BUILT_IN))
    }

    @Test
    fun parsesTheAccessibilitySetting() {
        assertEquals(listOf("a.b/.S", "c.d/e.F"), RemoteAccessDetector.parseAccessibilitySetting("a.b/.S:c.d/e.F"))
        assertEquals(emptyList<String>(), RemoteAccessDetector.parseAccessibilitySetting(null))
    }
}
