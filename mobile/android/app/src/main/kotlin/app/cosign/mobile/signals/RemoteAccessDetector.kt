package app.cosign.mobile.signals

/**
 * Detects screen-control apps (AnyDesk, TeamViewer QuickSupport, RustDesk, AirDroid...). Only the
 * packages declared in the manifest's <queries> (plus any server-delivered names that happen to be
 * visible) can be seen: the app does not use QUERY_ALL_PACKAGES.
 *
 * "Active" means one of them holds an enabled accessibility service (how remote control works on
 * Android) or was used recently, where the person granted usage access.
 */
class RemoteAccessDetector(
    private val isInstalled: (String) -> Boolean,
    /** Enabled accessibility services, as "package/class" component strings. */
    private val enabledAccessibilityServices: () -> List<String>,
    /** Last time each package was in the foreground, or null when usage access is not granted. */
    private val lastUsedMillis: (List<String>) -> Map<String, Long>?,
    private val clock: () -> Long = System::currentTimeMillis,
    private val recentWindowMillis: Long = 30 * 60 * 1000L,
) {
    fun detect(packages: List<String>): RemoteAccessSignal {
        val candidates = packages.map { it.trim() }.filter { it.matches(PACKAGE_RE) }.distinct()
        if (candidates.isEmpty()) return RemoteAccessSignal(installed = false, active = false)
        val installed = candidates.filter { runCatching { isInstalled(it) }.getOrDefault(false) }
        if (installed.isEmpty()) return RemoteAccessSignal(installed = false, active = false)

        val accessibilityActive = enabledAccessibilityServices().any { component ->
            installed.any { pkg -> component.substringBefore('/') == pkg }
        }
        val usage = lastUsedMillis(installed)
        val recentlyUsed = usage?.values?.any { clock() - it in 0..recentWindowMillis } ?: false
        return RemoteAccessSignal(installed = true, active = accessibilityActive || recentlyUsed)
    }

    companion object {
        private val PACKAGE_RE = Regex("^[a-zA-Z][a-zA-Z0-9_]*(\\.[a-zA-Z][a-zA-Z0-9_]*)+$")

        /** Same list as the manifest <queries> block and the backend's built-in list. */
        val BUILT_IN = listOf(
            "com.anydesk.anydeskandroid",
            "com.teamviewer.quicksupport.market",
            "com.teamviewer.teamviewer.market.mobile",
            "com.rustdesk.rustdesk",
            "com.airdroid.remote.support",
        )

        /** Parse Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES (colon-separated components). */
        fun parseAccessibilitySetting(value: String?): List<String> =
            value?.split(':')?.map { it.trim() }?.filter { it.isNotEmpty() } ?: emptyList()
    }
}
