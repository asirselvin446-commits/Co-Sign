package app.cosign.mobile.monitor

import app.cosign.mobile.generated.LinkRulesData

/**
 * On-phone copy of backend/src/modules/links/link.engine.ts: spots fake sites, risky links and
 * scam wording. Both implementations are checked against shared/link-vectors.json. Message text
 * is only read here, on the phone, and never stored or sent.
 */
object LinkAnalyzer {
    data class Link(val host: String?, val registrableDomain: String?, val flags: List<String>, val brand: String?, val verdict: String)

    data class Message(val phrases: List<String>, val links: List<Link>, val worst: Link?, val linkFlags: List<String>, val scam: Boolean)

    const val OFFICIAL = "official"
    const val UNKNOWN = "unknown"
    const val SUSPICIOUS = "suspicious"
    const val LOOKALIKE = "lookalike"

    private val SUSPICIOUS_FLAGS = setOf("apk_download", "hidden_host", "ip_address", "many_subdomains", "punycode", "risky_tld", "shortener", "upi_collect")
    private val RANK = mapOf(OFFICIAL to 0, UNKNOWN to 1, SUSPICIOUS to 2, LOOKALIKE to 3)
    private val STANDALONE = setOf("police_threat", "prize_lottery", "share_code")
    private val IPV4 = Regex("^\\d{1,3}(\\.\\d{1,3}){3}$")
    private val SCHEME = Regex("^[a-z][a-z0-9+.-]*://")
    private val PORT = Regex(":\\d+$")
    private val DIGITS = Regex("^\\d+$")
    private val SPACES = Regex("(?U)\\s+")
    private val BARE = Regex("(?U)^[a-z0-9-]+(\\.[a-z0-9-]+)+(/\\S*)?$")
    private val PRINTABLE_ASCII = Regex("^[\\x20-\\x7e]+$")
    private val LEADING = setOf('(', '[', '{', '<', '"', '\'', '“', '‘')
    private val TRAILING = setOf('.', ',', ';', ':', '!', '?', ')', ']', '}', '>', '"', '\'', '”', '’')

    /** Optimal string alignment distance (Levenshtein plus adjacent transpositions). */
    fun osaDistance(a: String, b: String): Int {
        val d = Array(a.length + 1) { i -> IntArray(b.length + 1) { j -> if (i == 0) j else if (j == 0) i else 0 } }
        for (i in 1..a.length) {
            for (j in 1..b.length) {
                val cost = if (a[i - 1] == b[j - 1]) 0 else 1
                var v = minOf(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
                if (i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1]) v = minOf(v, d[i - 2][j - 2] + 1)
                d[i][j] = v
            }
        }
        return d[a.length][b.length]
    }

    fun registrableDomain(host: String): String {
        if (IPV4.matches(host)) return host
        val labels = host.split('.')
        if (labels.size >= 3 && labels.takeLast(2).joinToString(".") in LinkRulesData.MULTI_PART_SUFFIXES) return labels.takeLast(3).joinToString(".")
        return labels.takeLast(2).joinToString(".")
    }

    fun analyzeLink(raw: String): Link {
        val s = raw.trim().lowercase()
        if (s.startsWith("upi://")) return Link(null, null, listOf("upi_collect"), null, SUSPICIOUS)
        val rest = s.replaceFirst(SCHEME, "")
        var end = rest.length
        for (c in listOf('/', '?', '#')) {
            val i = rest.indexOf(c)
            if (i in 0 until end) end = i
        }
        var authority = rest.substring(0, end)
        val path = rest.substring(end)
        val flags = sortedSetOf<String>()
        if ('@' in authority) {
            flags += "hidden_host"
            authority = authority.substring(authority.lastIndexOf('@') + 1)
        }
        val host = authority.replaceFirst(PORT, "").removeSuffix(".")
        if (host.isEmpty()) return Link(null, null, flags.toList(), null, if (flags.isEmpty()) UNKNOWN else SUSPICIOUS)
        val labels = host.split('.')
        val reg = registrableDomain(host)
        if (IPV4.matches(host)) {
            flags += "ip_address"
        } else {
            if (labels.any { it.startsWith("xn--") }) flags += "punycode"
            if (labels.last() in LinkRulesData.RISKY_TLDS) flags += "risky_tld"
            if (reg in LinkRulesData.SHORTENERS || host in LinkRulesData.SHORTENERS) flags += "shortener"
            if (labels.size - reg.split('.').size >= 3) flags += "many_subdomains"
        }
        if (path.split('?', '#')[0].endsWith(".apk")) flags += "apk_download"

        var brand: String? = null
        var official = false
        if ("ip_address" !in flags) {
            for (b in LinkRulesData.BRANDS) {
                if (b.domains.any { host == it || host.endsWith(".$it") }) {
                    brand = b.id
                    official = true
                    break
                }
            }
        }
        if (!official && "ip_address" !in flags) {
            val tokens = host.split('.', '-')
            val sld = reg.split('.')[0]
            for (b in LinkRulesData.BRANDS) {
                val keywordHit = tokens.any { t -> b.keywords.any { k -> t == k || (k.length >= 4 && t.startsWith(k) && DIGITS.matches(t.substring(k.length))) } }
                val nearMiss = b.domains.any { d ->
                    val dsld = d.split('.')[0]
                    dsld.length >= 5 && sld.length >= 5 && sld != dsld && osaDistance(sld, dsld) == 1
                }
                if (keywordHit || nearMiss) {
                    flags += "lookalike_brand"
                    brand = b.id
                    break
                }
            }
        }
        val verdict = when {
            official -> OFFICIAL
            "lookalike_brand" in flags -> LOOKALIKE
            flags.any { it in SUSPICIOUS_FLAGS } -> SUSPICIOUS
            else -> UNKNOWN
        }
        return Link(host, reg, flags.toList(), brand, verdict)
    }

    /** Links in a message: http(s)://, www., upi:// or bare domains with a known ending. */
    fun extractLinks(text: String): List<String> {
        val out = ArrayList<String>()
        for (raw in text.lowercase().split(SPACES)) {
            var t = raw
            while (t.isNotEmpty() && t[0] in LEADING) t = t.substring(1)
            while (t.isNotEmpty() && t[t.length - 1] in TRAILING) t = t.substring(0, t.length - 1)
            if (t.isEmpty()) continue
            if (t.startsWith("http://") || t.startsWith("https://") || t.startsWith("www.") || t.startsWith("upi://")) {
                out += t
            } else if (BARE.matches(t)) {
                val host = t.substringBefore('/')
                if (host.substringAfterLast('.') in LinkRulesData.LINK_TLDS) out += t
            }
        }
        return out
    }

    private fun isWordChar(c: Char?) = c != null && (c in 'a'..'z' || c in '0'..'9')

    /** Phrase present as a whole word or words (ASCII boundaries); other scripts match as substrings. */
    fun hasPhrase(text: String, phrase: String): Boolean {
        val ascii = PRINTABLE_ASCII.matches(phrase)
        var from = 0
        while (true) {
            val i = text.indexOf(phrase, from)
            if (i < 0) return false
            if (!ascii || (!isWordChar(text.getOrNull(i - 1)) && !isWordChar(text.getOrNull(i + phrase.length)))) return true
            from = i + 1
        }
    }

    fun analyzeMessage(text: String): Message {
        val lower = text.lowercase()
        val phrases = LinkRulesData.SCAM_PHRASES.filter { (_, ps) -> ps.any { hasPhrase(lower, it) } }.keys.sorted()
        val links = extractLinks(text).map(::analyzeLink)
        var worst: Link? = null
        for (l in links) if (worst == null || RANK.getValue(l.verdict) > RANK.getValue(worst.verdict)) worst = l
        val linkFlags = links.flatMap { it.flags }.toSortedSet().toList()
        val strong = phrases.filter { it != "urgent_action" }
        val urgent = "urgent_action" in phrases
        val nonOfficial = links.any { it.verdict != OFFICIAL }
        val scam = worst?.verdict == LOOKALIKE ||
            "apk_download" in linkFlags ||
            phrases.any { it in STANDALONE } ||
            (strong.isNotEmpty() && (nonOfficial || urgent)) ||
            strong.size >= 2 ||
            ("upi_collect" in linkFlags && phrases.isNotEmpty())
        return Message(phrases, links, worst, linkFlags, scam)
    }
}
