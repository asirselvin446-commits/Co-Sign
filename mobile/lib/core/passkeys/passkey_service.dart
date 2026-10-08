import 'package:flutter/services.dart';
import 'package:passkeys/authenticator.dart';
import 'package:passkeys/types.dart';

import '../../generated/catalog.g.dart';
import '../api/models.dart';
import '../errors/failure.dart';

/// Native passkeys (Android Credential Manager, iOS AuthenticationServices).
///
/// Takes the server's WebAuthn options JSON as-is and returns the standard response JSON. Every
/// platform error is translated into a catalogue code so it can be explained and read aloud.
abstract class PasskeyService {
  Future<Json> register(Json creationOptions);
  Future<Json> authenticate(Json requestOptions);
}

class NativePasskeyService implements PasskeyService {
  NativePasskeyService({PasskeyAuthenticator? authenticator, this.isDeviceSecure}) : _auth = authenticator ?? PasskeyAuthenticator();

  final PasskeyAuthenticator _auth;

  /// Optional pre-check (screen lock configured?) supplied by the native signals plugin.
  final Future<bool?> Function()? isDeviceSecure;

  @override
  Future<Json> register(Json creationOptions) async {
    if (await isDeviceSecure?.call() == false) throw AppFailure(ErrorCodes.NO_SCREEN_LOCK);
    try {
      final request = RegisterRequestType.fromJson(normaliseCredentialLists(creationOptions));
      final response = await _auth.register(request);
      return response.toJson();
    } on Object catch (e) {
      throw mapPasskeyError(e, registering: true);
    }
  }

  @override
  Future<Json> authenticate(Json requestOptions) async {
    try {
      final request = AuthenticateRequestType.fromJson(
        normaliseCredentialLists(requestOptions),
        preferImmediatelyAvailableCredentials: false,
      );
      final response = await _auth.authenticate(request);
      return response.toJson();
    } on Object catch (e) {
      throw mapPasskeyError(e, registering: false);
    }
  }
}

/// The plugin requires a `transports` list on every credential descriptor; the server may omit it.
Json normaliseCredentialLists(Json options) {
  Json fix(Object? c) {
    final m = Map<String, Object?>.from(c! as Map<String, Object?>);
    m['transports'] ??= <String>[];
    m['type'] ??= 'public-key';
    return m;
  }

  final out = Map<String, Object?>.from(options);
  for (final key in const ['allowCredentials', 'excludeCredentials']) {
    final list = out[key];
    if (list is List<Object?>) out[key] = list.map(fix).toList();
  }
  return out;
}

/// Translate passkey plugin errors into catalogue codes.
AppFailure mapPasskeyError(Object e, {required bool registering}) {
  if (e is AppFailure) return e;
  final code = switch (e) {
    PasskeyAuthCancelledException() => ErrorCodes.PASSKEY_CANCELLED,
    TimeoutException() => ErrorCodes.PASSKEY_TIMED_OUT,
    NoCredentialsAvailableException() => ErrorCodes.PASSKEY_NOT_ON_DEVICE,
    ExcludeCredentialsCanNotBeRegisteredException() => ErrorCodes.CREDENTIAL_ALREADY_REGISTERED,
    // Android reports "no create option" when there is no screen lock to protect a new passkey.
    NoCreateOptionException() => registering ? ErrorCodes.NO_SCREEN_LOCK : ErrorCodes.PASSKEY_FAILED,
    DeviceNotSupportedException() => ErrorCodes.PASSKEY_UNSUPPORTED,
    PasskeyUnsupportedException() => ErrorCodes.PASSKEY_UNSUPPORTED,
    MissingGoogleSignInException() => ErrorCodes.PASSKEY_UNSUPPORTED,
    SyncAccountNotAvailableException() => ErrorCodes.PASSKEY_UNSUPPORTED,
    PlatformException(code: final c) when c.contains('cancel') => ErrorCodes.PASSKEY_CANCELLED,
    _ => ErrorCodes.PASSKEY_FAILED,
  };
  return AppFailure(code);
}
