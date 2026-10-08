package app.cosign.mobile.signin

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.File
import java.util.Base64

class SignInCryptoTest {
    private fun shared(name: String): File {
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val f = File(dir, "shared/$name")
            if (f.exists()) return f
            dir = dir.parentFile
        }
        error("shared/$name not found")
    }

    @Test
    fun opensTheAnswerSealedByTheOtherImplementation() {
        val v = JSONObject(shared("signin-crypto-vector.json").readText())
        val key = SignInCrypto.privateKeyFromPkcs8B64(v.getString("recipientPkcs8"))
        val aad = SignInCrypto.aad(v.getString("requestId"), v.getString("package"), v.getString("host"))
        assertEquals(v.getString("plaintext"), SignInCrypto.open(key, v.getString("sealed"), aad))
    }

    @Test
    fun sealsSoOnlyTheAskingPhoneCanOpen() {
        val phone = SignInCrypto.newKeyPair()
        val aad = SignInCrypto.aad("req-1", "com.sbi.lotusintouch", null)
        val secret = """{"u":"amma","p":"Pa55-வணக்கம்"}"""
        val sealed = SignInCrypto.seal(SignInCrypto.publicKeyB64(phone), secret, aad)
        assertEquals(secret, SignInCrypto.open(phone.private, sealed, aad))
        // Another phone cannot open it.
        assertThrows(Exception::class.java) { SignInCrypto.open(SignInCrypto.newKeyPair().private, sealed, aad) }
    }

    @Test
    fun anAnswerForOneAppCannotBeUsedForAnother() {
        val phone = SignInCrypto.newKeyPair()
        val sealed = SignInCrypto.seal(SignInCrypto.publicKeyB64(phone), "{}", SignInCrypto.aad("req-1", "com.sbi.lotusintouch", null))
        assertThrows(Exception::class.java) { SignInCrypto.open(phone.private, sealed, SignInCrypto.aad("req-1", "com.fake.yono", null)) }
        assertThrows(Exception::class.java) { SignInCrypto.open(phone.private, sealed, SignInCrypto.aad("req-2", "com.sbi.lotusintouch", null)) }
    }

    @Test
    fun aTamperedAnswerIsRejected() {
        val phone = SignInCrypto.newKeyPair()
        val aad = SignInCrypto.aad("req-1", null, "accounts.google.com")
        val sealed = SignInCrypto.seal(SignInCrypto.publicKeyB64(phone), """{"u":"a","p":"b"}""", aad)
        val box = JSONObject(String(Base64.getDecoder().decode(sealed)))
        val ct = Base64.getDecoder().decode(box.getString("ct"))
        ct[0] = (ct[0].toInt() xor 1).toByte()
        box.put("ct", Base64.getEncoder().encodeToString(ct))
        val tampered = Base64.getEncoder().encodeToString(box.toString().toByteArray())
        assertThrows(Exception::class.java) { SignInCrypto.open(phone.private, tampered, aad) }
    }
}
