import 'package:shared_preferences/shared_preferences.dart';

/// Non-secret preferences: language, voice, text size, onboarding progress.
class AppSettings {
  const AppSettings({
    required this.language,
    required this.voiceOn,
    required this.textScale,
    required this.languageChosen,
    required this.consentAsked,
  });

  static const defaults = AppSettings(language: 'en', voiceOn: true, textScale: 1.0, languageChosen: false, consentAsked: false);

  final String language;
  final bool voiceOn;

  /// Multiplies the system text scale, so people who already use large fonts get even larger.
  final double textScale;
  final bool languageChosen;
  final bool consentAsked;

  AppSettings copyWith({String? language, bool? voiceOn, double? textScale, bool? languageChosen, bool? consentAsked}) => AppSettings(
        language: language ?? this.language,
        voiceOn: voiceOn ?? this.voiceOn,
        textScale: textScale ?? this.textScale,
        languageChosen: languageChosen ?? this.languageChosen,
        consentAsked: consentAsked ?? this.consentAsked,
      );
}

abstract class SettingsStore {
  Future<AppSettings> load();
  Future<void> save(AppSettings s);
}

class PrefsSettingsStore implements SettingsStore {
  @override
  Future<AppSettings> load() async {
    final p = await SharedPreferences.getInstance();
    return AppSettings(
      language: p.getString('language') ?? AppSettings.defaults.language,
      voiceOn: p.getBool('voiceOn') ?? true,
      textScale: p.getDouble('textScale') ?? 1.0,
      languageChosen: p.getBool('languageChosen') ?? false,
      consentAsked: p.getBool('consentAsked') ?? false,
    );
  }

  @override
  Future<void> save(AppSettings s) async {
    final p = await SharedPreferences.getInstance();
    await p.setString('language', s.language);
    await p.setBool('voiceOn', s.voiceOn);
    await p.setDouble('textScale', s.textScale);
    await p.setBool('languageChosen', s.languageChosen);
    await p.setBool('consentAsked', s.consentAsked);
  }
}

class MemorySettingsStore implements SettingsStore {
  MemorySettingsStore([this.value = AppSettings.defaults]);
  AppSettings value;
  @override
  Future<AppSettings> load() async => value;
  @override
  Future<void> save(AppSettings s) async => value = s;
}
