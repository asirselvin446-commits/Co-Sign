package app.cosign.mobile.monitor

/**
 * Which apps matter for family protection, by category. Only these packages are ever reported, so
 * the guardian never learns about the rest of the person's phone use.
 */
object AppCatalog {
    const val BANK = "bank"
    const val UPI = "upi"
    const val WALLET = "wallet"
    const val EMAIL = "email"
    const val SOCIAL = "social"
    /** Chat and SMS apps: where people are asked to send a one-time code. */
    const val MESSAGING = "messaging"
    const val REMOTE_ACCESS = "remote_access"

    private val builtIn: Map<String, String> = buildMap {
        // Payments (UPI)
        listOf(
            "com.google.android.apps.nbu.paisa.user", // Google Pay
            "com.phonepe.app",
            "net.one97.paytm",
            "in.org.npci.upiapp", // BHIM
            "com.dreamplug.androidapp", // CRED
            "in.amazon.mShop.android.shopping",
            "com.whatsapp.w4b",
            "com.mobikwik_new",
            "com.freecharge.android",
        ).forEach { put(it, UPI) }
        // Banks
        listOf(
            "com.sbi.lotusintouch", // SBI YONO
            "com.sbi.SBIFreedomPlus",
            "com.csam.icici.bank.imobile",
            "com.snapwork.hdfc",
            "com.hdfcbank.payzapp",
            "com.axis.mobile",
            "com.msf.kbank.mobile", // Kotak
            "com.bankofbaroda.mconnect",
            "com.infrasofttech.indianbank",
            "com.canarabank.mobility",
            "com.pnb.pnbone",
            "com.unionbankofindia.vyom",
            "com.iob.mobilebanking",
            "com.fss.ucobank",
            "com.idbibank.abhay_card",
            "com.yesbank",
            "com.indusind.mobile",
            "com.fedmobile",
            "com.tmb.mobilebanking",
            "com.cub.wallet.gui",
        ).forEach { put(it, BANK) }
        // Wallets and investing
        listOf("com.zerodha.kite3", "com.nextbillion.groww", "com.upstox.pro", "com.angelbroking.angelwealth").forEach { put(it, WALLET) }
        // Email (account takeover usually starts here)
        listOf("com.google.android.gm", "com.microsoft.office.outlook", "com.yahoo.mobile.client.android.mail").forEach { put(it, EMAIL) }
        // Social (sign-in alerts)
        listOf("com.instagram.android", "com.facebook.katana", "com.twitter.android").forEach { put(it, SOCIAL) }
        // Chat and SMS (codes are sent onwards from here)
        listOf(
            "com.whatsapp",
            "org.telegram.messenger",
            "org.thoughtcrime.securesms", // Signal
            "com.google.android.apps.messaging", // Google Messages
            "com.samsung.android.messaging",
            "com.android.mms",
            "com.facebook.orca", // Messenger
        ).forEach { put(it, MESSAGING) }
        // Screen control
        listOf(
            "com.anydesk.anydeskandroid",
            "com.teamviewer.quicksupport.market",
            "com.teamviewer.teamviewer.market.mobile",
            "com.rustdesk.rustdesk",
            "com.airdroid.remote.support",
        ).forEach { put(it, REMOTE_ACCESS) }
    }

    @Volatile
    private var extra: Map<String, String> = emptyMap()

    /** Server-delivered additions, e.g. "com.example.bank=bank". */
    fun setExtra(entries: Map<String, String>) {
        extra = entries.filterValues { it in setOf(BANK, UPI, WALLET, EMAIL, SOCIAL, MESSAGING, REMOTE_ACCESS) }
    }

    fun categoryOf(packageName: String?): String? = packageName?.let { extra[it] ?: builtIn[it] }

    fun isSensitive(category: String?) = category == BANK || category == UPI || category == WALLET
}
