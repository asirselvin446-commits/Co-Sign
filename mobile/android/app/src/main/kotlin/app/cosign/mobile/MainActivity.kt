package app.cosign.mobile

import android.content.Intent
import android.os.Bundle
import app.cosign.mobile.signals.SignalsPlugin
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine

class MainActivity : FlutterFragmentActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        flutterEngine.plugins.add(SignalsPlugin())
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        keepShared(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        keepShared(intent)
    }

    /** A message or link shared to Co-Sign ("Check a link"); the app reads it once. */
    private fun keepShared(intent: Intent?) {
        if (intent?.action != Intent.ACTION_SEND || intent.type != "text/plain") return
        val text = intent.getStringExtra(Intent.EXTRA_TEXT)?.take(4000) ?: return
        SignalsPlugin.offerSharedText(text)
    }
}
