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

  static Json _deepCast(Map<Object?, Object?> m) => m.map(
        (k, v) => MapEntry(k! as String, v is Map<Object?, Object?> ? _deepCast(v) : v),
      );
}
