package app.cosign.mobile.monitor

/**
 * Small, pure detectors used by the monitoring services. Kept free of Android types so they are
 * unit-tested on the JVM (ClassifierTests.kt).
 */

/** Counts events (wrong PINs, failed sign-ins) inside a sliding time window. */
class AttemptCounter(private val windowMs: Long, private val clock: () -> Long = System::currentTimeMillis) {
    private val times = ArrayDeque<Long>()

    /** Record one attempt and return how many fall inside the window, including this one. */
    @Synchronized
    fun add(): Int {
        val now = clock()
        while (times.isNotEmpty() && now - times.first() > windowMs) times.removeFirst()
        times.addLast(now)
        return times.size
    }

    @Synchronized
    fun clear() = times.clear()
}

/**
 * The system dialog that asks "Start recording or casting?" / "Share your screen?" belongs to
 * System UI and is recognisable by its window class name. Seeing it means screen sharing is about
 * to start; no screen content is read.
 */
object ScreenShareDetector {
    private val systemUi = setOf("com.android.systemui", "com.samsung.android.systemui")

    fun isSharePrompt(packageName: String?, className: String?): Boolean {
        if (packageName !in systemUi) return false
        val c = className?.lowercase() ?: return false
        return "mediaprojection" in c || "screenrecord" in c || "screenshare" in c
    }
}

/** Where an installed app came from: an app store, or a downloaded file ("unknown" source). */
object InstallClassifier {
    private val stores = setOf(
        "com.android.vending", // Google Play
        "com.sec.android.app.samsungapps", // Galaxy Store
        "com.huawei.appmarket",
        "com.xiaomi.market",
        "com.xiaomi.mipicks",
        "com.heytap.market", // OPPO / realme
        "com.oppo.market",
        "com.bbk.appstore", // vivo
        "com.vivo.appstore",
        "com.amazon.venezia",
    )

    fun installer(installingPackage: String?): String = if (installingPackage in stores) "store" else "unknown"
}

/**
 * Notices when another app is newly given screen-control (accessibility) or device-administrator
 * access. Compares the current set of granted components with the last one seen.
 */
object AccessWatch {
    /** Packages that appear in [current] but not in [previous], excluding Co-Sign itself. */
    fun newlyGranted(previous: Set<String>, current: Set<String>, ownPackage: String): Set<String> =
        (current - previous).filter { it != ownPackage }.toSet()

    /** "pkg/.Service:pkg2/pkg2.Other" (Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) to package names. */
    fun packagesFromSetting(setting: String?): Set<String> =
        setting.orEmpty().split(':').mapNotNull { it.substringBefore('/').trim().takeIf(String::isNotEmpty) }.toSet()
}
