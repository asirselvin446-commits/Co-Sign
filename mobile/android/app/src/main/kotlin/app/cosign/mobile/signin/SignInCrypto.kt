package app.cosign.mobile.signin

import org.json.JSONObject
import java.security.KeyFactory
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.PrivateKey
import java.security.PublicKey
import java.security.SecureRandom
import java.security.spec.ECGenParameterSpec
import java.security.spec.PKCS8EncodedKeySpec
import java.security.spec.X509EncodedKeySpec
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * End-to-end sealing of a sign-in answer between the guardian's phone and the asking phone.
 *
 * ECDH P-256 between the sender's one-time key and the asking phone's one-time key, HKDF-SHA256
 * (no salt, info "co-sign signin v1") to a 256-bit key, AES-256-GCM with the request bound as
 * additional data (request id, app package and website). The sealed answer is base64 of
 * JSON {v:1, epk, iv, ct}. The server only ever relays it. Matches backend/test/helpers/seal.ts and
 * shared/signin-crypto-vector.json.
 */
object SignInCrypto {
    private val INFO = "co-sign signin v1".toByteArray(Charsets.UTF_8)
    private val b64 = Base64.getEncoder()
    private val unb64 = Base64.getDecoder()

    fun newKeyPair(): KeyPair = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()

    fun publicKeyB64(kp: KeyPair): String = b64.encodeToString(kp.public.encoded)

    fun aad(requestId: String, packageName: String?, host: String?): ByteArray = "$requestId|${packageName ?: ""}|${host ?: ""}".toByteArray(Charsets.UTF_8)

    fun publicKeyFromB64(spki: String): PublicKey = KeyFactory.getInstance("EC").generatePublic(X509EncodedKeySpec(unb64.decode(spki)))

    fun privateKeyFromPkcs8B64(pkcs8: String): PrivateKey = KeyFactory.getInstance("EC").generatePrivate(PKCS8EncodedKeySpec(unb64.decode(pkcs8)))

    private fun hkdf(shared: ByteArray): ByteArray {
        val extract = Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(ByteArray(32), "HmacSHA256")) }.doFinal(shared)
        val expand = Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(extract, "HmacSHA256")) }
        expand.update(INFO)
        expand.update(1.toByte())
        return expand.doFinal().copyOf(32)
    }

    private fun agree(private: PrivateKey, public: PublicKey): ByteArray =
        KeyAgreement.getInstance("ECDH").apply {
            init(private)
            doPhase(public, true)
        }.generateSecret()

    /** Guardian side: seal [plaintext] to the asking phone's public key. */
    fun seal(recipientSpkiB64: String, plaintext: String, aad: ByteArray): String {
        val eph = newKeyPair()
        val key = hkdf(agree(eph.private, publicKeyFromB64(recipientSpkiB64)))
        val iv = ByteArray(12).also { SecureRandom().nextBytes(it) }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
            init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv))
            updateAAD(aad)
        }
        val ct = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))
        key.fill(0)
        val box = JSONObject().put("v", 1).put("epk", b64.encodeToString(eph.public.encoded)).put("iv", b64.encodeToString(iv)).put("ct", b64.encodeToString(ct))
        return b64.encodeToString(box.toString().toByteArray(Charsets.UTF_8))
    }

    /** Asking phone: open a sealed answer with its one-time private key. Throws if anything was changed. */
    fun open(recipient: PrivateKey, sealed: String, aad: ByteArray): String {
        val box = JSONObject(String(unb64.decode(sealed), Charsets.UTF_8))
        require(box.getInt("v") == 1) { "unknown version" }
        val key = hkdf(agree(recipient, publicKeyFromB64(box.getString("epk"))))
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
            init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, unb64.decode(box.getString("iv"))))
            updateAAD(aad)
        }
        val plain = cipher.doFinal(unb64.decode(box.getString("ct")))
        key.fill(0)
        return String(plain, Charsets.UTF_8)
    }
}
