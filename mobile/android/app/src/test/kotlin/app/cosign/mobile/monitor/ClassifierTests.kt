package app.cosign.mobile.monitor

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationClassifierTest {
    private fun kind(title: String?, text: String?) = NotificationClassifier.classify(title, text)?.kind

    @Test
    fun recognisesOneTimeCodesInSeveralLanguages() {
        assertEquals(NotificationClassifier.Kind.OTP, kind("HDFC Bank", "Your OTP for login is 482913. Do not share it with anyone."))
        assertEquals(NotificationClassifier.Kind.OTP, kind(null, "123456 is your verification code for Google"))
        assertEquals(NotificationClassifier.Kind.OTP, kind("SBI", "आपका ओटीपी 7781 है"))
        assertEquals(NotificationClassifier.Kind.OTP, kind(null, "உங்கள் ஓடிபி 552190"))
    }

    @Test
    fun anOtpThatMentionsAnAmountIsStillAnOtp() {
        assertEquals(NotificationClassifier.Kind.OTP, kind("ICICI", "OTP 908712 for txn of Rs. 45,000 at FLIPKART"))
    }

    @Test
    fun recognisesNewSignInAlerts() {
        assertEquals(NotificationClassifier.Kind.LOGIN, kind("Google", "New sign-in on Windows. If this was not you, check activity."))
        assertEquals(NotificationClassifier.Kind.LOGIN, kind("Instagram", "We noticed a new login from a device near Lagos"))
    }

    @Test
    fun recognisesFailedSignInsAndWrongPins() {
        assertEquals(NotificationClassifier.Kind.FAILED_LOGIN, kind("SBI YONO", "Incorrect MPIN entered. 2 attempts remaining."))
        assertEquals(NotificationClassifier.Kind.FAILED_LOGIN, kind("Google", "Sign-in attempt was blocked"))
        // "failed login attempt" also says "login attempt"; it must count as a failure, not a sign-in.
        assertEquals(NotificationClassifier.Kind.FAILED_LOGIN, kind("Bank", "Failed login attempt on your account"))
        assertEquals(NotificationClassifier.Kind.FAILED_LOGIN, kind(null, "आपने गलत पिन डाला है"))
        assertEquals(NotificationClassifier.Kind.FAILED_LOGIN, kind(null, "தவறான கடவுச்சொல் உள்ளிடப்பட்டது"))
    }

    @Test
    fun debitsCarryOnlyAnAmountRange() {
        val r = NotificationClassifier.classify("SBI", "Rs.45,000.00 debited from A/c XX1234 on 08-10-26 to VPA scam@upi")!!
        assertEquals(NotificationClassifier.Kind.DEBIT, r.kind)
        assertEquals("10k_50k", r.amountBucket)
        assertEquals("gt_1l", NotificationClassifier.classify(null, "INR 1,20,000 sent to Ramesh via UPI")!!.amountBucket)
        assertEquals("lt_1k", NotificationClassifier.classify(null, "₹250 paid to Meena Stores")!!.amountBucket)
    }

    @Test
    fun creditsAreSeparateFromDebits() {
        assertEquals(NotificationClassifier.Kind.CREDIT, kind("Axis", "Rs 5,000 credited to your account"))
    }

    @Test
    fun ignoresOrdinaryMessages() {
        assertNull(kind("Amma", "Call me when you are free"))
        assertNull(kind("Swiggy", "Your order is on the way"))
        assertNull(kind(null, null))
        // A code without any OTP wording is not treated as an OTP.
        assertNull(kind("Cricket", "India 245/3 in 42 overs"))
    }

    @Test
    fun bucketsUseRupeeRanges() {
        assertEquals("lt_1k", NotificationClassifier.bucket(999.0))
        assertEquals("1k_10k", NotificationClassifier.bucket(1000.0))
        assertEquals("10k_50k", NotificationClassifier.bucket(49_999.0))
        assertEquals("50k_1l", NotificationClassifier.bucket(50_000.0))
        assertEquals("gt_1l", NotificationClassifier.bucket(100_000.0))
    }
}

class CallerClassifierTest {
    @Test
    fun classifiesCallers() {
        assertEquals(CallerClassifier.HIDDEN, CallerClassifier.classify(null, restricted = true, simCountryIso = "in", isContact = null))
        assertEquals(CallerClassifier.HIDDEN, CallerClassifier.classify("", restricted = false, simCountryIso = "in", isContact = null))
        assertEquals(CallerClassifier.KNOWN, CallerClassifier.classify("+919800000001", false, "in", true))
        assertEquals(CallerClassifier.INTERNATIONAL, CallerClassifier.classify("+447700900123", false, "in", false))
        assertEquals(CallerClassifier.INTERNATIONAL, CallerClassifier.classify("0092300123456", false, "in", null))
        assertEquals(CallerClassifier.UNKNOWN, CallerClassifier.classify("+919811111111", false, "in", false))
        assertEquals(CallerClassifier.UNAVAILABLE, CallerClassifier.classify("9811111111", false, "in", null))
    }

    @Test
    fun aSavedForeignContactIsKnown() {
        assertEquals(CallerClassifier.KNOWN, CallerClassifier.classify("+14155550100", false, "in", true))
    }

    @Test
    fun unknownHomeCountryCannotFlagInternational() {
        assertEquals(CallerClassifier.UNKNOWN, CallerClassifier.classify("+447700900123", false, "zz", false))
    }
}

class RepeatCallTrackerTest {
    @Test
    fun countsRepeatsWithinTwoHoursOnly() {
        var now = 0L
        val t = RepeatCallTracker("salt") { now }
        assertEquals(1, t.record("+91 98111 11111"))
        now += 30 * 60_000
        assertEquals(2, t.record("09811111111"))
        assertEquals(1, t.record("+919822222222"))
        now += 60 * 60_000
        assertEquals(3, t.record("9811111111"))
        now += 3 * 60 * 60_000
        assertEquals(1, t.record("9811111111"))
    }
}

class DetectorTest {
    @Test
    fun countsAttemptsInsideTheWindowOnly() {
        var now = 0L
        val c = AttemptCounter(15 * 60_000L) { now }
        assertEquals(1, c.add())
        now += 5 * 60_000
        assertEquals(2, c.add())
        now += 5 * 60_000
        assertEquals(3, c.add())
        now += 11 * 60_000 // the first two fall out of the window
        assertEquals(2, c.add())
        c.clear()
        assertEquals(1, c.add())
    }

    @Test
    fun recognisesTheSystemScreenSharePrompt() {
        assertTrue(ScreenShareDetector.isSharePrompt("com.android.systemui", "com.android.systemui.mediaprojection.permission.MediaProjectionPermissionActivity"))
        assertTrue(ScreenShareDetector.isSharePrompt("com.android.systemui", "com.android.systemui.media.MediaProjectionPermissionActivity"))
        assertFalse(ScreenShareDetector.isSharePrompt("com.android.systemui", "com.android.systemui.statusbar.phone.StatusBar"))
        // Only System UI can show the real prompt; an app naming a class like it is ignored.
        assertFalse(ScreenShareDetector.isSharePrompt("com.fake.app", "MediaProjectionPermissionActivity"))
    }

    @Test
    fun tellsStoreInstallsFromDownloadedApps() {
        assertEquals("store", InstallClassifier.installer("com.android.vending"))
        assertEquals("store", InstallClassifier.installer("com.sec.android.app.samsungapps"))
        assertEquals("unknown", InstallClassifier.installer("com.google.android.packageinstaller"))
        assertEquals("unknown", InstallClassifier.installer("com.whatsapp"))
        assertEquals("unknown", InstallClassifier.installer(null))
    }

    @Test
    fun findsNewlyGrantedScreenControlApps() {
        val before = AccessWatch.packagesFromSetting("com.google.android.marvin.talkback/.TalkBackService:app.cosign.mobile/app.cosign.mobile.monitor.CoSignAccessibilityService")
        assertEquals(setOf("com.google.android.marvin.talkback", "app.cosign.mobile"), before)
        val after = before + "com.anydesk.anydeskandroid"
        assertEquals(setOf("com.anydesk.anydeskandroid"), AccessWatch.newlyGranted(before, after, "app.cosign.mobile"))
        assertEquals(emptySet<String>(), AccessWatch.newlyGranted(after, after, "app.cosign.mobile"))
        assertEquals(emptySet<String>(), AccessWatch.packagesFromSetting(null))
    }

    @Test
    fun chatAppsAreTheirOwnCategory() {
        assertEquals(AppCatalog.MESSAGING, AppCatalog.categoryOf("com.whatsapp"))
        assertEquals(AppCatalog.MESSAGING, AppCatalog.categoryOf("com.google.android.apps.messaging"))
        assertEquals(AppCatalog.SOCIAL, AppCatalog.categoryOf("com.instagram.android"))
    }
}
