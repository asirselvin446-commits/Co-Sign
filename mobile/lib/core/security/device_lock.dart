import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:local_auth/local_auth.dart';

import '../../generated/catalog.g.dart';
import '../errors/failure.dart';

/// The phone's own screen lock (fingerprint, face, PIN or pattern).
///
/// A guardian confirms "fill this password in" with it, so a phone left unlocked on a table cannot
/// be used to send someone's password. No passkey, no QR code, nothing to set up in Co-Sign.
abstract class DeviceLock {
  /// Returns normally once the owner confirmed; throws [AppFailure] otherwise.
  Future<void> confirm(String reason);
}

class NativeDeviceLock implements DeviceLock {
  NativeDeviceLock([LocalAuthentication? auth]) : _auth = auth ?? LocalAuthentication();
  final LocalAuthentication _auth;

  @override
  Future<void> confirm(String reason) async {
    final bool ok;
    try {
      if (!await _auth.isDeviceSupported()) throw AppFailure(ErrorCodes.NO_SCREEN_LOCK);
      ok = await _auth.authenticate(localizedReason: reason);
    } on LocalAuthException catch (e) {
      throw AppFailure(mapLockError(e.code));
    }
    if (!ok) throw AppFailure(ErrorCodes.SCREEN_LOCK_CANCELLED);
  }
}

/// Plugin failure → catalogue code that can be explained and read aloud.
String mapLockError(LocalAuthExceptionCode code) => switch (code) {
      LocalAuthExceptionCode.noCredentialsSet || LocalAuthExceptionCode.noBiometricHardware || LocalAuthExceptionCode.noBiometricsEnrolled => ErrorCodes.NO_SCREEN_LOCK,
      LocalAuthExceptionCode.temporaryLockout || LocalAuthExceptionCode.biometricLockout => ErrorCodes.SCREEN_LOCK_LOCKED_OUT,
      _ => ErrorCodes.SCREEN_LOCK_CANCELLED,
    };

final deviceLockProvider = Provider<DeviceLock>((_) => NativeDeviceLock());
