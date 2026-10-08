import 'package:flutter/foundation.dart';

/// Build-time configuration, passed with --dart-define.
class AppConfig {
  const AppConfig({required this.apiBaseUrl});

  /// e.g. https://cosign.example.com. Release builds must set it; debug builds default to the
  /// Android emulator's alias for the development machine.
  final String apiBaseUrl;

  static AppConfig fromEnvironment() {
    const defined = String.fromEnvironment('API_BASE_URL');
    if (defined.isNotEmpty) return AppConfig(apiBaseUrl: defined.replaceAll(RegExp(r'/+$'), ''));
    return AppConfig(apiBaseUrl: kReleaseMode ? '' : 'http://10.0.2.2:8080');
  }

  bool get isConfigured => apiBaseUrl.isNotEmpty;
}
