import 'dart:async';

import 'package:flutter/services.dart';

import '../api/cosign_api.dart';
import '../api/models.dart';
import 'signals_channel.dart';

/// Remembers whether the person pasted (rather than typed) a code or amount recently.
/// Attach [PasteDetectingFormatter] to sensitive text fields.
class PasteTracker {
  DateTime? _lastPaste;
  void markPasted() => _lastPaste = DateTime.now();
  bool get recentlyPasted => _lastPaste != null && DateTime.now().difference(_lastPaste!) < const Duration(minutes: 10);
  void reset() => _lastPaste = null;
}

/// Flags input that arrives several characters at once (paste or autofill from another app)
/// instead of keystroke by keystroke. Pasting is always allowed; it only adds a risk signal.
class PasteDetectingFormatter extends TextInputFormatter {
  PasteDetectingFormatter(this.tracker);
  final PasteTracker tracker;

  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    if (newValue.text.length - oldValue.text.length > 1) tracker.markPasted();
    return newValue;
  }
}

/// Builds the device-signals JSON the backend expects (see backend deviceSignalsSchema).
class SignalCollector {
  SignalCollector({required this.channel, required this.api, required this.paste, DateTime Function()? clock}) : _clock = clock ?? DateTime.now;

  final SignalsChannel channel;
  final CoSignApi api;
  final PasteTracker paste;
  final DateTime Function() _clock;
  SignalsConfig? _config;

  Future<SignalsConfig?> config() async {
    if (_config != null) return _config;
    try {
      return _config = await api.signalsConfig();
    } on Object {
      return null;
    }
  }

  /// Collect a snapshot. Never throws: missing permissions or platform support just mean fewer fields.
  Future<Json> collect({bool withIntegrity = false}) async {
    final cfg = await config();
    final native = await channel.snapshot(cfg?.remoteAccessPackages ?? const []);
    final now = _clock();
    final signals = buildSignals(native: native, platform: channel.platform, now: now, codePasted: paste.recentlyPasted);
    if (withIntegrity && cfg != null && cfg.integrityEnabled && cfg.cloudProjectNumber.isNotEmpty && channel.platform == 'android') {
      try {
        final hash = await api.integrityChallenge();
        final token = await channel.integrityToken(cfg.cloudProjectNumber, hash);
        if (token != null) signals['integrity'] = {'token': token, 'requestHash': hash};
      } on Object {
        // Integrity is best effort; "unavailable" never adds risk.
      }
    }
    return signals;
  }
}

/// Pure mapping from the native snapshot to the wire format; unit tested.
Json buildSignals({required Json native, required String platform, required DateTime now, required bool codePasted}) {
  Json? pick(String key, List<String> fields) {
    final v = native[key];
    if (v is! Map<String, Object?>) return null;
    if (!fields.every(v.containsKey)) return null;
    return {for (final f in fields) f: v[f]};
  }

  final call = pick('call', ['active', 'durationSec', 'numberKnown']);
  if (call != null) call['durationSec'] = (call['durationSec']! as num).toInt();
  return {
    'collectedAt': now.toUtc().toIso8601String(),
    'platform': platform,
    'call': ?call,
    'remoteAccess': ?pick('remoteAccess', ['installed', 'active']),
    'screen': ?pick('screen', ['captureDetected', 'recordingActive']),
    'sim': ?pick('sim', ['fingerprint']),
    'coverage': ?pick('coverage', ['phoneState', 'callLog', 'contacts', 'usageStats']),
    'behaviour': {'codePasted': codePasted, 'localHour': now.toLocal().hour},
  };
}

/// While a sensitive screen is open: block screenshots (FLAG_SECURE) and stream signals every
/// 15 seconds so a waiting guardian sees whether the risky situation is still going on.
class SensitiveSession {
  SensitiveSession({required this.collector, required this.api, this.stepupId});
  final SignalCollector collector;
  final CoSignApi api;
  String? stepupId;
  Timer? _timer;
  StreamSubscription<Json>? _events;
  bool _disposed = false;

  Future<void> start() async {
    await collector.channel.setSecure(true);
    final cfg = await collector.config();
    final every = cfg?.streamInterval ?? const Duration(seconds: 15);
    _timer = Timer.periodic(every, (_) => unawaited(_send()));
    // A screenshot or recording starting while the screen is open is reported straight away.
    _events = collector.channel.events.listen((e) {
      if (e['type'] == 'screen_captured' || e['type'] == 'screen_recording') unawaited(_send());
    });
  }

  Future<void> _send() async {
    if (_disposed) return;
    try {
      await api.streamSignals(await collector.collect(), stepupId: stepupId);
    } on Object {
      // Streaming is advisory; a dropped sample is fine.
    }
  }

  Future<void> stop() async {
    _disposed = true;
    _timer?.cancel();
    await _events?.cancel();
    await collector.channel.setSecure(false);
  }
}
