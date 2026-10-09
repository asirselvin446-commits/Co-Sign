package app.cosign.mobile.signin

import android.app.ActivityOptions
import android.app.PendingIntent
import android.app.assist.AssistStructure
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.CancellationSignal
import android.service.autofill.AutofillService
import android.service.autofill.Dataset
import android.service.autofill.FillCallback
import android.service.autofill.FillRequest
import android.service.autofill.FillResponse
import android.service.autofill.SaveCallback
import android.service.autofill.SaveRequest
import android.view.View
import android.view.autofill.AutofillId
import android.widget.RemoteViews
import app.cosign.mobile.R
import app.cosign.mobile.monitor.AppCatalog
import app.cosign.mobile.monitor.LinkAnalyzer
import app.cosign.mobile.monitor.MonitorHub

/**
 * Co-Sign as the phone's autofill service. On any sign-in screen (apps, and browsers that support
 * autofill) it offers "Ask my guardian to sign me in". The guardian fills the password on their own
 * phone and it arrives sealed to this phone only. On a fake website it offers a warning instead and
 * alerts the guardian. Co-Sign never saves passwords on this phone.
 */
class CoSignAutofillService : AutofillService() {
    override fun onFillRequest(request: FillRequest, cancellationSignal: CancellationSignal, callback: FillCallback) {
        MonitorHub.init(this)
        val structure = request.fillContexts.lastOrNull()?.structure ?: return callback.onSuccess(null)
        val pkg = structure.activityComponent.packageName
        if (pkg == packageName) return callback.onSuccess(null)

        val nodes = ArrayList<AutofillFields.Node<AutofillId>>()
        var webDomain: String? = null
        for (i in 0 until structure.windowNodeCount) {
            walk(structure.getWindowNodeAt(i).rootViewNode) { n ->
                if (webDomain == null && !n.webDomain.isNullOrBlank()) webDomain = n.webDomain
                val id = n.autofillId
                if (id != null && n.autofillType == View.AUTOFILL_TYPE_TEXT && n.visibility == View.VISIBLE) {
                    val attrs = n.htmlInfo?.attributes.orEmpty().associate { it.first.lowercase() to it.second }
                    nodes += AutofillFields.Node(
                        id = id,
                        hints = n.autofillHints?.toList().orEmpty(),
                        inputType = n.inputType,
                        htmlType = attrs["type"],
                        htmlAutocomplete = attrs["autocomplete"],
                        idEntry = n.idEntry ?: attrs["name"] ?: attrs["id"],
                        hint = n.hint?.toString(),
                    )
                }
            }
        }
        val fields = AutofillFields.pick(nodes) ?: return callback.onSuccess(null)
        val isBrowser = AppCatalog.categoryOf(pkg) == AppCatalog.BROWSER
        // In a browser, Co-Sign must know which website this is; without it, it stays quiet.
        if (isBrowser && webDomain == null) return callback.onSuccess(null)
        val link = webDomain?.let(LinkAnalyzer::analyzeLink)

        val ids = listOfNotNull(fields.username, fields.password)
        val fake = link != null && (link.verdict == LinkAnalyzer.LOOKALIKE || (link.verdict == LinkAnalyzer.SUSPICIOUS && link.flags.any { it in FAKE_FLAGS }))
        val dataset = if (fake) {
            MonitorHub.onPhishingPage(pkg, link!!)
            datasetWithAuth(ids, getString(R.string.signin_fake_title), AssistedSignInActivity.warningIntent(this, link.registrableDomain ?: link.host ?: "", link.brand))
        } else {
            val label = link?.host ?: appLabel(pkg)
            datasetWithAuth(ids, getString(R.string.signin_ask_title), AssistedSignInActivity.fillIntent(this, pkg, link?.host, label, fields.username, fields.password))
        }
        callback.onSuccess(FillResponse.Builder().addDataset(dataset).build())
    }

    private fun datasetWithAuth(ids: List<AutofillId>, title: String, intent: Intent): Dataset {
        val view = RemoteViews(packageName, R.layout.autofill_item).apply { setTextViewText(R.id.autofill_text, title) }
        val pending = PendingIntent.getActivity(this, (System.nanoTime() and 0x7fffffff).toInt(), intent, PendingIntent.FLAG_CANCEL_CURRENT or PendingIntent.FLAG_MUTABLE, creatorOptions())
        val b = Dataset.Builder(view)
        @Suppress("DEPRECATION")
        for (id in ids) b.setValue(id, null, view)
        b.setAuthentication(pending.intentSender)
        return b.build()
    }

    /**
     * The app being signed in to opens this screen when the person taps the suggestion. Since Android 14
     * (and by default for apps targeting 15+) that is blocked unless Co-Sign, which made the link, allows
     * it; without this the tap silently did nothing and no request reached the guardian.
     */
    private fun creatorOptions(): Bundle? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return null
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.BAKLAVA) {
            ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOW_ALWAYS
        } else {
            @Suppress("DEPRECATION")
            ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED
        }
        return ActivityOptions.makeBasic().setPendingIntentCreatorBackgroundActivityStartMode(mode).toBundle()
    }

    private fun appLabel(pkg: String): String = try {
        packageManager.getApplicationLabel(packageManager.getApplicationInfo(pkg, 0)).toString()
    } catch (_: Exception) {
        pkg
    }

    private fun walk(node: AssistStructure.ViewNode, visit: (AssistStructure.ViewNode) -> Unit) {
        visit(node)
        for (i in 0 until node.childCount) walk(node.getChildAt(i), visit)
    }

    /** Co-Sign never stores passwords on this phone. */
    override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) = callback.onSuccess()

    companion object {
        /** Link problems that make a sign-in page a fake on their own. */
        private val FAKE_FLAGS = setOf("ip_address", "punycode", "hidden_host")
    }
}
