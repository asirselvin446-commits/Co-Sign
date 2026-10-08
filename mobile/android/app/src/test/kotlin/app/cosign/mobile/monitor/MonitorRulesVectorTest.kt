package app.cosign.mobile.monitor

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The phone's monitoring rules must score every shared vector exactly like the backend does
 * (backend/test/unit/monitor-engine.test.ts runs the same file).
 */
class MonitorRulesVectorTest {
    private fun vectorsFile(): File {
        // Gradle runs unit tests from the module directory (mobile/android/app).
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val f = File(dir, "shared/monitor-vectors.json")
            if (f.exists()) return f
            dir = dir.parentFile
        }
        error("shared/monitor-vectors.json not found")
    }

    @Test
    fun matchesBackendOnEverySharedVector() {
        val vectors = JSONObject(vectorsFile().readText()).getJSONArray("vectors")
        assertTrue(vectors.length() >= 15)
        for (i in 0 until vectors.length()) {
            val v = vectors.getJSONObject(i)
            val e = v.getJSONObject("event")
            val app = e.optJSONObject("app")
            val call = e.optJSONObject("call")
            val event = MonitorRules.Event(
                kind = e.getString("kind"),
                appCategory = app?.getString("category"),
                amountBucket = if (e.isNull("amountBucket")) null else e.getString("amountBucket"),
                call = call?.let { MonitorRules.Call(it.getBoolean("active"), it.getLong("durationSec"), it.getString("caller"), it.optInt("repeatCount", 0)) },
                localHour = e.getInt("localHour"),
                sinceOtpSec = if (e.isNull("sinceOtpSec")) null else e.getInt("sinceOtpSec"),
                attempts = if (e.isNull("attempts")) null else e.getInt("attempts"),
                installer = if (e.isNull("installer")) null else e.getString("installer"),
                grant = if (e.isNull("grant")) null else e.getString("grant"),
            )
            val ctx = v.getJSONObject("context")
            val usual = if (ctx.isNull("usualMaxDebitBucket")) null else ctx.getString("usualMaxDebitBucket")
            val got = MonitorRules.assess(event, usual)
            val want = v.getJSONObject("expect")
            val wantRules = want.getJSONArray("rules").let { a -> (0 until a.length()).map { a.getString(it) } }
            val name = v.getString("name")
            assertEquals(name, want.getInt("score"), got.score)
            assertEquals(name, want.getString("severity"), got.severity)
            assertEquals(name, wantRules, got.rules)
            assertEquals(name, want.getBoolean("pause"), got.pause)
        }
    }

    @Test
    fun weightsMatchTheSharedCatalogue() {
        var dir: File? = File("").absoluteFile
        var catalog: File? = null
        while (dir != null && catalog == null) {
            File(dir, "shared/catalog.json").takeIf { it.exists() }?.let { catalog = it }
            dir = dir.parentFile
        }
        val rules = JSONObject(catalog!!.readText()).getJSONObject("monitorRules")
        assertEquals(rules.length(), MonitorRules.WEIGHTS.size)
        for (key in rules.keys()) assertEquals(key, rules.getJSONObject(key).getInt("weight"), MonitorRules.WEIGHTS[key])
    }
}
