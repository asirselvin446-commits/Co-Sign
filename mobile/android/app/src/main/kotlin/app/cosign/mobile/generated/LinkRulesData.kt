// GENERATED FILE. Do not edit by hand.
// Source: shared/link-rules.json. Regenerate with `pnpm catalog:gen`.
package app.cosign.mobile.generated

object LinkRulesData {
    data class Brand(val id: String, val name: String, val domains: List<String>, val keywords: List<String>)

    val BRANDS: List<Brand> = listOf(
        Brand("sbi", "SBI", listOf("onlinesbi.sbi", "sbi.co.in", "onlinesbi.com", "sbiyono.sbi", "sbicard.com"), listOf("sbi", "yono", "onlinesbi")),
        Brand("hdfc", "HDFC Bank", listOf("hdfcbank.com", "hdfc.com", "payzapp.in"), listOf("hdfc", "hdfcbank")),
        Brand("icici", "ICICI Bank", listOf("icicibank.com", "icicidirect.com"), listOf("icici", "icicibank")),
        Brand("axis", "Axis Bank", listOf("axisbank.com", "axis.bank.in"), listOf("axisbank")),
        Brand("kotak", "Kotak Bank", listOf("kotak.com", "kotaksecurities.com"), listOf("kotak")),
        Brand("pnb", "PNB", listOf("pnbindia.in", "netpnb.com", "pnb.co.in"), listOf("pnb", "pnbindia")),
        Brand("bob", "Bank of Baroda", listOf("bankofbaroda.in", "bobibanking.com", "bankofbaroda.com"), listOf("bankofbaroda", "barodabank")),
        Brand("canara", "Canara Bank", listOf("canarabank.com", "canarabank.in"), listOf("canara", "canarabank")),
        Brand("indianbank", "Indian Bank", listOf("indianbank.in", "indianbank.net.in"), listOf("indianbank")),
        Brand("union", "Union Bank", listOf("unionbankofindia.co.in", "unionbankonline.co.in"), listOf("unionbank", "unionbankofindia")),
        Brand("npci", "UPI / BHIM", listOf("npci.org.in", "bhimupi.org.in"), listOf("npci", "bhim", "bhimupi")),
        Brand("paytm", "Paytm", listOf("paytm.com", "paytm.in", "paytmbank.com"), listOf("paytm")),
        Brand("phonepe", "PhonePe", listOf("phonepe.com"), listOf("phonepe")),
        Brand("gpay", "Google Pay", listOf("pay.google.com"), listOf("gpay", "googlepay")),
        Brand("google", "Google", listOf("google.com", "google.co.in", "gmail.com", "youtube.com", "googleapis.com", "gstatic.com", "android.com", "googleusercontent.com", "goo.gl", "g.co"), listOf("google", "gmail")),
        Brand("microsoft", "Microsoft", listOf("microsoft.com", "live.com", "outlook.com", "office.com", "microsoftonline.com"), listOf("microsoft", "outlook", "hotmail")),
        Brand("amazon", "Amazon", listOf("amazon.in", "amazon.com", "amazonpay.in", "amzn.to", "amzn.in"), listOf("amazon", "amazonpay")),
        Brand("flipkart", "Flipkart", listOf("flipkart.com", "fkrt.it"), listOf("flipkart")),
        Brand("whatsapp", "WhatsApp", listOf("whatsapp.com", "whatsapp.net", "wa.me"), listOf("whatsapp")),
        Brand("meta", "Facebook / Instagram", listOf("facebook.com", "fb.com", "instagram.com", "messenger.com", "meta.com"), listOf("facebook", "instagram")),
        Brand("incometax", "Income Tax", listOf("incometax.gov.in", "incometaxindia.gov.in"), listOf("incometax", "itrefund")),
        Brand("epfo", "EPFO", listOf("epfindia.gov.in", "epfo.gov.in"), listOf("epfo", "epfindia")),
        Brand("uidai", "Aadhaar (UIDAI)", listOf("uidai.gov.in", "myaadhaar.uidai.gov.in"), listOf("uidai", "aadhaar", "aadhar")),
        Brand("indiapost", "India Post", listOf("indiapost.gov.in", "ippbonline.com"), listOf("indiapost", "ippb")),
        Brand("govin", "Government of India", listOf("gov.in", "nic.in", "india.gov.in"), listOf()),
    )
    val MULTI_PART_SUFFIXES: Set<String> = setOf("co.in", "net.in", "org.in", "gov.in", "nic.in", "ac.in", "edu.in", "res.in", "firm.in", "gen.in", "ind.in", "bank.in", "co.uk", "org.uk", "com.au", "co.jp", "com.br", "com.sg")
    val SHORTENERS: Set<String> = setOf("bit.ly", "tinyurl.com", "cutt.ly", "rb.gy", "is.gd", "t.ly", "shorturl.at", "rebrand.ly", "tiny.cc", "ow.ly", "s.id", "v.gd", "shrtco.de", "t.co", "lnkd.in", "bitly.com", "u.to", "clck.ru")
    val RISKY_TLDS: Set<String> = setOf("xyz", "top", "click", "buzz", "icu", "cyou", "rest", "sbs", "cfd", "lol", "monster", "quest", "bond", "tk", "ml", "ga", "cf", "gq", "zip", "mov", "country", "kim", "work", "loan", "win", "bid", "party", "review", "date", "racing", "stream", "download", "fit", "gdn", "vip", "live", "shop", "online", "site", "fun", "space", "pw")
    val LINK_TLDS: Set<String> = setOf("com", "in", "net", "org", "co", "info", "io", "me", "app", "dev", "biz", "us", "uk", "ly", "gl", "to", "it", "id", "de", "ru", "cn", "sbi", "bank", "gov", "edu", "xyz", "top", "click", "buzz", "icu", "cyou", "rest", "sbs", "cfd", "lol", "monster", "quest", "bond", "tk", "ml", "ga", "cf", "gq", "zip", "mov", "country", "kim", "work", "loan", "win", "bid", "party", "review", "date", "racing", "stream", "download", "fit", "gdn", "vip", "live", "shop", "online", "site", "fun", "space", "pw", "link", "store", "tech", "cc", "ws")
    val SCAM_PHRASES: Map<String, List<String>> = linkedMapOf(
        "kyc_threat" to listOf("kyc", "pan card update", "pan update", "update your pan", "aadhaar link", "link your aadhaar", "re-kyc", "ekyc", "केवाईसी", "पैन अपडेट", "கேஒய்சி", "பான் அப்டேட்"),
        "account_blocked" to listOf("account will be blocked", "account has been blocked", "account is blocked", "account suspended", "account will be suspended", "account will be closed", "card blocked", "card will be blocked", "sim will be blocked", "sim card will be deactivated", "deactivated today", "खाता बंद", "खाता ब्लॉक", "कार्ड ब्लॉक", "கணக்கு முடக்கப்படும்", "கணக்கு தடுக்கப்பட்டது", "கணக்கு முடக்கப்பட்டது"),
        "prize_lottery" to listOf("you have won", "congratulations you", "lottery", "lucky draw", "cash prize", "jackpot", "kbc", "reward points expire", "redeem your reward", "लॉटरी", "इनाम", "आपने जीता", "லாட்டரி", "பரிசு வென்றீர்கள்", "நீங்கள் வென்றீர்கள்"),
        "refund" to listOf("refund of rs", "refund is pending", "claim your refund", "tax refund", "income tax refund", "cashback of rs", "रिफंड", "ரீஃபண்ட்", "பணத்தைத் திரும்பப் பெற"),
        "job_offer" to listOf("work from home", "part time job", "part-time job", "earn rs", "daily income", "earn daily", "salary per day", "like youtube videos", "rate hotels", "telegram task", "घर बैठे कमाएं", "पार्ट टाइम जॉब", "வீட்டிலிருந்தே சம்பாதி", "பகுதி நேர வேலை"),
        "electricity_cut" to listOf("electricity will be disconnected", "power will be disconnected", "electricity connection will be", "electricity bill not paid", "bijli", "बिजली कनेक्शन", "बिजली काट", "மின் இணைப்பு துண்டிக்கப்படும்", "மின்சாரம் துண்டிக்கப்படும்"),
        "parcel_customs" to listOf("parcel is on hold", "parcel has been held", "customs duty", "courier is pending", "delivery failed", "your package could not be delivered", "illegal items", "पार्सल", "பார்சல்"),
        "police_threat" to listOf("digital arrest", "cbi officer", "narcotics", "money laundering", "arrest warrant", "cyber crime department", "police case against you", "डिजिटल अरेस्ट", "गिरफ्तारी", "டிஜிட்டல் கைது", "கைது வாரண்ட்"),
        "urgent_action" to listOf("click the link", "click here", "click on the link", "within 24 hours", "immediately", "urgent", "last date today", "verify now", "update now", "तुरंत", "लिंक पर क्लिक", "உடனடியாக", "இணைப்பைக் கிளிக்"),
        "share_code" to listOf("share the otp", "share otp", "tell the otp", "send the otp", "forward the code", "ओटीपी बताएं", "ओटीपी शेयर", "ஓடிபியைப் பகிர", "ஓடிபி சொல்லுங்கள்"),
    )
}
