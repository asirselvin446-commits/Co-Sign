package app.cosign.mobile.monitor

/**
 * Reads a notification on the phone and reduces it to a category. Only the category, the app's
 * category and an amount range ever leave the phone: never the text, the sender or the code.
 *
 * Keywords cover English, Hindi and Tamil wording used by Indian banks, UPI apps and big platforms.
 */
object NotificationClassifier {
    enum class Kind(val wire: String) { OTP("notification_otp"), LOGIN("notification_login"), DEBIT("notification_debit"), CREDIT("notification_credit") }

    data class Result(val kind: Kind, val amountBucket: String?)

    private val otpWords = listOf(
        "otp", "one time password", "one-time password", "verification code", "security code", "login code", "passcode",
        "ओटीपी", "सत्यापन कोड", "ஓடிபி", "சரிபார்ப்புக் குறியீடு",
    )
    private val loginWords = listOf(
        "new sign-in", "new sign in", "new login", "logged in", "login attempt", "signed in", "new device", "unusual login",
        "suspicious login", "someone logged", "new session", "नया लॉगिन", "साइन इन किया", "புதிய உள்நுழைவு",
    )
    private val debitWords = listOf(
        "debited", "debit of", "spent", "paid to", "sent to", "withdrawn", "transferred to", "payment of", "purchase of",
        "डेबिट", "भुगतान", "भेजे गए", "பற்று", "செலுத்தப்பட்டது", "அனுப்பப்பட்டது",
    )
    private val creditWords = listOf("credited", "received from", "deposited", "refund", "क्रेडिट", "प्राप्त", "வரவு", "பெறப்பட்டது")

    private val digitsCode = Regex("(?<!\\d)\\d{4,8}(?!\\d)")
    private val amountRe = Regex("(?:rs\\.?|inr|₹|रु\\.?)\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)", RegexOption.IGNORE_CASE)

    fun classify(title: String?, text: String?): Result? {
        val body = listOfNotNull(title, text).joinToString(" ").lowercase()
        if (body.isBlank()) return null
        val amount = amountRe.find(body)?.groupValues?.get(1)?.replace(",", "")?.toDoubleOrNull()
        // Order matters: an OTP message often mentions an amount too ("OTP for txn of Rs 5000").
        return when {
            otpWords.any { it in body } && digitsCode.containsMatchIn(body) -> Result(Kind.OTP, null)
            loginWords.any { it in body } -> Result(Kind.LOGIN, null)
            amount != null && creditWords.any { it in body } && debitWords.none { it in body } -> Result(Kind.CREDIT, bucket(amount))
            amount != null && debitWords.any { it in body } -> Result(Kind.DEBIT, bucket(amount))
            else -> null
        }
    }

    /** Rupee ranges; exact amounts never leave the phone. */
    fun bucket(amount: Double): String = when {
        amount < 1_000 -> "lt_1k"
        amount < 10_000 -> "1k_10k"
        amount < 50_000 -> "10k_50k"
        amount < 100_000 -> "50k_1l"
        else -> "gt_1l"
    }
}
