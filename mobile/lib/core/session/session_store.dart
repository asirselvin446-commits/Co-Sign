import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Key/value storage for secrets. Backed by the Android Keystore / iOS Keychain in the app,
/// and by memory in tests.
abstract class SecretStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

class SecureSecretStore implements SecretStore {
  const SecureSecretStore([this._storage = const FlutterSecureStorage()]);
  final FlutterSecureStorage _storage;

  @override
  Future<String?> read(String key) => _storage.read(key: key);
  @override
  Future<void> write(String key, String value) => _storage.write(key: key, value: value);
  @override
  Future<void> delete(String key) => _storage.delete(key: key);
}

class MemorySecretStore implements SecretStore {
  final Map<String, String> values = {};
  @override
  Future<String?> read(String key) async => values[key];
  @override
  Future<void> write(String key, String value) async => values[key] = value;
  @override
  Future<void> delete(String key) async => values.remove(key);
}

/// What survives an app restart: who is signed in on this phone, this phone's device ID and the
/// (rotating, device-bound) refresh token. The short-lived access token is kept in memory only.
class StoredSession {
  const StoredSession({
    required this.userId,
    required this.handle,
    required this.displayName,
    required this.locale,
    required this.deviceId,
    required this.refreshToken,
  });

  factory StoredSession.fromJson(Map<String, Object?> j) => StoredSession(
        userId: j['userId']! as String,
        handle: j['handle']! as String,
        displayName: j['displayName']! as String,
        locale: j['locale']! as String,
        deviceId: j['deviceId']! as String,
        refreshToken: j['refreshToken']! as String,
      );

  final String userId;
  final String handle;
  final String displayName;
  final String locale;
  final String deviceId;
  final String refreshToken;

  StoredSession copyWith({String? refreshToken, String? displayName, String? locale}) => StoredSession(
        userId: userId,
        handle: handle,
        displayName: displayName ?? this.displayName,
        locale: locale ?? this.locale,
        deviceId: deviceId,
        refreshToken: refreshToken ?? this.refreshToken,
      );

  Map<String, Object?> toJson() => {
        'userId': userId,
        'handle': handle,
        'displayName': displayName,
        'locale': locale,
        'deviceId': deviceId,
        'refreshToken': refreshToken,
      };
}

class SessionStore {
  SessionStore(this._store);
  final SecretStore _store;
  static const _key = 'cosign.session.v1';
  static const _deviceKey = 'cosign.device.v1';

  Future<StoredSession?> load() async {
    final raw = await _store.read(_key);
    if (raw == null) return null;
    try {
      return StoredSession.fromJson(jsonDecode(raw) as Map<String, Object?>);
    } on Object {
      await _store.delete(_key);
      return null;
    }
  }

  Future<void> save(StoredSession s) async {
    await _store.write(_key, jsonEncode(s.toJson()));
    // Remember the device ID even after sign-out, so signing in again keeps the same device.
    await _store.write(_deviceKey, s.deviceId);
  }

  Future<void> clear() => _store.delete(_key);

  Future<String?> knownDeviceId() => _store.read(_deviceKey);
  Future<void> forgetDevice() => _store.delete(_deviceKey);
}
