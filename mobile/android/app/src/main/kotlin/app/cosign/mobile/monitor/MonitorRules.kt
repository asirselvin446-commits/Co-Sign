package app.cosign.mobile.monitor

/**
 * On-phone copy of the backend monitoring engine (backend/src/modules/monitor/monitor.engine.ts).
 * It decides instantly, even offline, whether to show the safety pause. Both implementations are
 * tested against shared/monitor-vectors.json so they always agree.
 */
object MonitorRules {
    val WEIGHTS: Map<String, Int> = mapOf(
        "payment_screen_during_call" to 70,
        "login_screen_during_call" to 60,
        "otp_during_call" to 60,
        "sensitive_app_during_call" to 50,
        "remote_access_active" to 40,
        "remote_access_during_call" to 30,
        "new_login_alert" to 30,
        "login_alert_during_call" to 30,
        "unusual_debit" to 30,
        "long_unknown_call" to 30,
        "large_debit" to 20,
        "very_long_unknown_call" to 20,
        "repeated_unknown_caller" to 20,
        "hidden_or_international_caller" to 15,
        "late_night_activity" to 10,
    )
    private const val WARN_AT = 30
    private const val CRITICAL_AT = 60
    val BUCKETS = listOf("lt_1k", "1k_10k", "10k_50k", "50k_1l", "gt_1l")

    data class Call(val active: Boolean, val durationSec: Long, val caller: String, val repeatCount: Int = 0)

    data class Event(
        val kind: String,
        val appCategory: String?,
        val amountBucket: String?,
        val call: Call?,
        val localHour: Int,
    )

    data class Assessment(val score: Int, val severity: String, val rules: List<String>, val pause: Boolean)

    fun riskyCall(c: Call?) = c != null && c.active && c.caller != CallerClassifier.KNOWN && c.durationSec >= 60

    fun assess(e: Event, usualMaxDebitBucket: String?): Assessment {
        val hit = linkedSetOf<String>()
        val onRiskyCall = riskyCall(e.call)
        val cat = e.appCategory
        when (e.kind) {
            "payment_screen" -> if (onRiskyCall) hit += "payment_screen_during_call"
            "login_screen" -> if (onRiskyCall && cat in setOf("bank", "upi", "wallet", "email")) hit += "login_screen_during_call"
            "app_foreground" ->
                if (cat == AppCatalog.REMOTE_ACCESS) {
                    hit += "remote_access_active"
                    if (onRiskyCall) hit += "remote_access_during_call"
                } else if (onRiskyCall && AppCatalog.isSensitive(cat)) {
                    hit += "sensitive_app_during_call"
                }
            "notification_otp" -> if (onRiskyCall) hit += "otp_during_call"
            "notification_login" -> {
                hit += "new_login_alert"
                if (onRiskyCall) hit += "login_alert_during_call"
            }
            "notification_debit" -> {
                val idx = BUCKETS.indexOf(e.amountBucket)
                if (idx >= BUCKETS.indexOf("10k_50k")) hit += "large_debit"
                val usual = usualMaxDebitBucket
                if ((usual != null && idx > BUCKETS.indexOf(usual)) || (usual == null && idx >= BUCKETS.indexOf("50k_1l"))) hit += "unusual_debit"
            }
        }
        val c = e.call
        if (c != null && c.active && c.caller != CallerClassifier.KNOWN) {
            if (c.durationSec >= 15 * 60 && c.caller != CallerClassifier.UNAVAILABLE) hit += "long_unknown_call"
            if (c.durationSec >= 45 * 60 && c.caller != CallerClassifier.UNAVAILABLE) hit += "very_long_unknown_call"
            if (c.caller == CallerClassifier.HIDDEN || c.caller == CallerClassifier.INTERNATIONAL) hit += "hidden_or_international_caller"
            if (c.repeatCount >= 3) hit += "repeated_unknown_caller"
        }
        if (hit.isNotEmpty() && e.localHour < 5) hit += "late_night_activity"

        val rules = hit.sortedWith(compareByDescending<String> { WEIGHTS.getValue(it) }.thenBy { it })
        val score = rules.sumOf { WEIGHTS.getValue(it) }
        val severity = when {
            score >= CRITICAL_AT -> "critical"
            score >= WARN_AT -> "warn"
            else -> "info"
        }
        val sensitiveMoment = e.kind == "payment_screen" || e.kind == "login_screen" || e.kind == "notification_otp" ||
            (e.kind == "app_foreground" && cat != null && cat != "other")
        return Assessment(score, severity, rules, severity == "critical" && sensitiveMoment)
    }
}
