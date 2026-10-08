import 'package:flutter_tts/flutter_tts.dart';

/// Reads explanations aloud in the person's language (en-IN, ta-IN, hi-IN). If the phone has no
/// voice for that language, [canSpeak] is false and the UI shows text only.
abstract class Voice {
  Future<bool> canSpeak(String lang);
  Future<bool> speak(String text, String lang);
  Future<void> stop();
}

const _ttsLocale = {'en': 'en-IN', 'ta': 'ta-IN', 'hi': 'hi-IN'};

class TtsVoice implements Voice {
  TtsVoice([FlutterTts? tts]) : _tts = tts ?? FlutterTts();
  final FlutterTts _tts;
  final Map<String, bool> _available = {};

  @override
  Future<bool> canSpeak(String lang) async {
    final locale = _ttsLocale[lang] ?? 'en-IN';
    if (_available.containsKey(locale)) return _available[locale]!;
    bool ok;
    try {
      final r = await _tts.isLanguageAvailable(locale);
      ok = r == true || r == 1;
    } on Object {
      ok = false;
    }
    return _available[locale] = ok;
  }

  @override
  Future<bool> speak(String text, String lang) async {
    if (text.trim().isEmpty || !await canSpeak(lang)) return false;
    try {
      await _tts.stop();
      await _tts.setLanguage(_ttsLocale[lang] ?? 'en-IN');
      // Slightly slower than default: easier to follow for older listeners.
      await _tts.setSpeechRate(0.45);
      await _tts.speak(text);
      return true;
    } on Object {
      return false;
    }
  }

  @override
  Future<void> stop() async {
    try {
      await _tts.stop();
    } on Object {
      // nothing to stop
    }
  }
}

/// Used in tests and when voice is turned off.
class SilentVoice implements Voice {
  final List<String> spoken = [];
  @override
  Future<bool> canSpeak(String lang) async => true;
  @override
  Future<bool> speak(String text, String lang) async {
    spoken.add(text);
    return true;
  }

  @override
  Future<void> stop() async {}
}
