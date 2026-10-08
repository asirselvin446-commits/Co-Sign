package app.cosign.mobile.monitor

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** The phone's link analyser must match the backend on every shared vector. */
class LinkAnalyzerVectorTest {
    private fun shared(name: String): File {
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val f = File(dir, "shared/$name")
            if (f.exists()) return f
            dir = dir.parentFile
        }
        error("shared/$name not found")
    }

    private fun strings(a: JSONArray) = (0 until a.length()).map { a.getString(it) }
    private fun opt(o: JSONObject, k: String): String? = if (o.isNull(k)) null else o.getString(k)

    @Test
    fun linksMatchTheBackend() {
        val links = JSONObject(shared("link-vectors.json").readText()).getJSONArray("links")
        assertTrue(links.length() >= 20)
        for (i in 0 until links.length()) {
            val c = links.getJSONObject(i)
            val input = c.getString("input")
            val e = c.getJSONObject("expect")
            val got = LinkAnalyzer.analyzeLink(input)
            assertEquals(input, opt(e, "host"), got.host)
            assertEquals(input, opt(e, "registrableDomain"), got.registrableDomain)
            assertEquals(input, strings(e.getJSONArray("flags")), got.flags)
            assertEquals(input, opt(e, "brand"), got.brand)
            assertEquals(input, e.getString("verdict"), got.verdict)
        }
    }

    @Test
    fun messagesMatchTheBackend() {
        val messages = JSONObject(shared("link-vectors.json").readText()).getJSONArray("messages")
        for (i in 0 until messages.length()) {
            val c = messages.getJSONObject(i)
            val input = c.getString("input")
            val e = c.getJSONObject("expect")
            val got = LinkAnalyzer.analyzeMessage(input)
            assertEquals(input, strings(e.getJSONArray("phrases")), got.phrases)
            assertEquals(input, strings(e.getJSONArray("linkFlags")), got.linkFlags)
            assertEquals(input, opt(e, "worstVerdict"), got.worst?.verdict)
            assertEquals(input, opt(e, "worstDomain"), got.worst?.registrableDomain)
            assertEquals(input, e.getBoolean("scam"), got.scam)
        }
    }

    @Test
    fun helpersAgreeWithTheBackend() {
        assertEquals(1, LinkAnalyzer.osaDistance("google", "googel"))
        assertEquals(2, LinkAnalyzer.osaDistance("phone", "phonepe"))
        assertEquals("example.co.in", LinkAnalyzer.registrableDomain("netbanking.example.co.in"))
        assertEquals(listOf("www.example.com", "bit.ly/x"), LinkAnalyzer.extractLinks("Pay Rs.500 by 5.30pm at (www.example.com). Or bit.ly/x!"))
        assertEquals(emptyList<String>(), LinkAnalyzer.extractLinks("mail me at amma@gmail.com"))
    }
}
