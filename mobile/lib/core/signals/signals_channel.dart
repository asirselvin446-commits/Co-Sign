import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/services.dart';

import '../api/models.dart';

/// Bridge to the native signal plugin (Kotlin on Android, Swift on iOS).
abstract class SignalsChannel {
  /// Raw device snapshot: call, remoteAccess, screen, sim, coverage. Missing parts are omitted.
  Future<Json> snapshot(List<String> remoteAccessPackages);
  Future<Map<String, bool>> permissionStatus();
  Future<bool> requestPermissions(List<String> groups);
  Future<void> openUsageAccessSettings();
  Future<void> setSecure(bool secure);
  Future<String?> integrityToken(String cloudProjectNumber, String requestHash);
  Future<bool?> isDeviceSecure();
  Stream<Json> get events;
  String get platform;

  // Family protection (Android background monitoring).
  Future<bool> monitorConfigure({required String baseUrl, required String? token, required bool enabled, required String lang});
  Future<Map<String, bool>> monitorStatus();
  Future<void> monitorOpen(String what);
  Future<bool> requestCallScreening();

  // Sign-in help and link checks (Android).
  /// Checks a message or link on the phone for scam wording and fake or risky links.
  Future<LinkCheck> analyzeText(String text);
  /// Tells the guardians about a scam message the person checked (kinds and domain only).
  Future<void> reportScamText(String text);
  /// Text shared to Co-Sign ("Check a link"), once.
  Future<String?> takeSharedText();
  /// Guardian side: seal a sign-in to the asking phone's one-time key.
  Future<String> signinSeal({required String publicKey, required String plaintext, required String requestId, required String? package, required String? host});
  Future<({bool supported, bool enabled})> autofillStatus();
  Future<void> openAutofillSettings();
  /// Installed bank, payment, email and social apps, for "Sign in with help".
  Future<List<({String package, String label, String category})>> signInApps();
  Future<void> startShowSignIn(String package, String label);
}

class NativeSignalsChannel implements SignalsChannel {
  static const _methods = MethodChannel('app.cosign/signals');
  static const _events = EventChannel('app.cosign/signals/events');

  Stream<Json>? _stream;

  @override
  String get platform => Platform.isIOS ? 'ios' : 'android';

  @override
  Future<Json> snapshot(List<String> remoteAccessPackages) async {
    try {
      final r = await _methods.invokeMapMethod<String, Object?>('getSnapshot', {'remoteAccessPackages': remoteAccessPackages});
      return _deepCast(r ?? const {});
    } on PlatformException {
      return const {};
    } on MissingPluginException {
      return const {};
    }
  }

  @override
  Future<Map<String, bool>> permissionStatus() async {
    try {
      final r = await _methods.invokeMapMethod<String, Object?>('permissionStatus');
      return {for (final e in (r ?? const {}).entries) e.key: e.value == true};
    } on Object {
      return const {};
    }
  }

  @override
  Future<bool> requestPermissions(List<String> groups) async {
    try {
      return await _methods.invokeMethod<bool>('requestPermissions', {'groups': groups}) ?? false;
    } on Object {
      return false;
    }
  }

  @override
  Future<void> openUsageAccessSettings() async {
    try {
      await _methods.invokeMethod<void>('openUsageAccessSettings');
    } on Object {
      // Not available on this platform.
    }
  }

  @override
  Future<void> setSecure(bool secure) async {
    try {
      await _methods.invokeMethod<void>('setSecure', {'secure': secure});
    } on Object {
      // iOS has no FLAG_SECURE; sensitive screens rely on the system screenshot notification instead.
    }
  }

  @override
  Future<String?> integrityToken(String cloudProjectNumber, String requestHash) async {
    try {
      return await _methods.invokeMethod<String>('integrityToken', {'cloudProjectNumber': cloudProjectNumber, 'requestHash': requestHash});
    } on Object {
      return null;
    }
  }

  @override
  Future<bool?> isDeviceSecure() async {
    try {
      return await _methods.invokeMethod<bool>('isDeviceSecure');
    } on Object {
      return null;
    }
  }

  @override
  Stream<Json> get events => _stream ??= _events.receiveBroadcastStream().map((e) => _deepCast(e as Map<Object?, Object?>)).handleError((Object _) {});

  @override
  Future<bool> monitorConfigure({required String baseUrl, required String? token, required bool enabled, required String lang}) async {
    try {
      return await _methods.invokeMethod<bool>('monitorConfigure', {'baseUrl': baseUrl, 'token': token, 'enabled': enabled, 'lang': lang}) ?? false;
    } on Object {
      return false;
    }
  }

  @override
  Future<Map<String, bool>> monitorStatus() async {
    try {
      final r = await _methods.invokeMapMethod<String, Object?>('monitorStatus');
      return {for (final e in (r ?? const {}).entries) e.key: e.value == true};
    } on Object {
      return const {};
    }
  }

  @override
  Future<void> monitorOpen(String what) async {
    try {
      await _methods.invokeMethod<void>('monitorOpen', {'what': what});
    } on Object {
      // not available on this platform
    }
  }

  @override
  Future<bool> requestCallScreening() async {
    try {
      return await _methods.invokeMethod<bool>('monitorRequestCallScreening') ?? false;
    } on Object {
      return false;
    }
  }

  @override
  Future<LinkCheck> analyzeText(String text) async {
    final r = await _methods.invokeMethod<Object?>('analyzeText', {'text': text});
    return LinkCheck.fromJson(_deepAny(r)! as Json);
  }

  @override
  Future<void> reportScamText(String text) async {
    try {
      await _methods.invokeMethod<void>('reportScamText', {'text': text});
    } on Object {
      // Protection off on this phone: nothing to report to.
    }
  }

  @override
  Future<String?> takeSharedText() async {
    try {
      return await _methods.invokeMethod<String>('takeSharedText');
    } on Object {
      return null;
    }
  }

  @override
  Future<String> signinSeal({required String publicKey, required String plaintext, required String requestId, required String? package, required String? host}) async =>
      (await _methods.invokeMethod<String>('signinSeal', {'publicKey': publicKey, 'plaintext': plaintext, 'requestId': requestId, 'package': package, 'host': host}))!;

  @override
  Future<({bool supported, bool enabled})> autofillStatus() async {
    try {
      final r = await _methods.invokeMapMethod<String, Object?>('autofillStatus');
      return (supported: r?['supported'] == true, enabled: r?['enabled'] == true);
    } on Object {
      return (supported: false, enabled: false);
    }
  }

  @override
  Future<void> openAutofillSettings() async {
    try {
      await _methods.invokeMethod<void>('openAutofillSettings');
    } on Object {
      // not available on this platform
    }
  }

  @override
  Future<List<({String package, String label, String category})>> signInApps() async {
    try {
      final r = await _methods.invokeListMethod<Object?>('signInApps') ?? const [];
      return [
        for (final a in r.whereType<Map<Object?, Object?>>()) (package: '${a['package']}', label: '${a['label']}', category: '${a['category']}'),
      ];
    } on Object {
      return const [];
    }
  }

  @override
  Future<void> startShowSignIn(String package, String label) => _methods.invokeMethod<void>('startShowSignIn', {'package': package, 'label': label});

  static Object? _deepAny(Object? v) => switch (v) {
        final Map<Object?, Object?> m => m.map((k, x) => MapEntry(k! as String, _deepAny(x))),
        final List<Object?> l => l.map(_deepAny).toList(),
        _ => v,
      };

  static Json _deepCast(Map<Object?, Object?> m) => m.map(
        (k, v) => MapEntry(k! as String, v is Map<Object?, Object?> ? _deepCast(v) : v),
      );
}
