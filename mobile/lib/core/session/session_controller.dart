import 'dart:async';
import 'dart:io' show Platform;

import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../api/models.dart';
import '../errors/failure.dart';
import '../providers.dart';
import 'session_store.dart';

enum SessionStatus { loading, signedOut, signedIn }

class SessionState {
  const SessionState(this.status, {this.user, this.deviceId, this.lostReason});
  final SessionStatus status;
  final UserSummary? user;
  final String? deviceId;

  /// Why the session ended unexpectedly (phone removed, account recovered elsewhere).
  final AppFailure? lostReason;
}

Future<Map<String, Object?>> defaultDeviceInfo() async {
  String name = 'Phone';
  try {
    final info = DeviceInfoPlugin();
    if (Platform.isAndroid) {
      final a = await info.androidInfo;
      name = '${a.manufacturer} ${a.model}'.trim();
    } else if (Platform.isIOS) {
      final i = await info.iosInfo;
      name = i.utsname.machine;
    }
  } on Object {
    // keep the generic name
  }
  String? version;
  try {
    final p = await PackageInfo.fromPlatform();
    version = '${p.version}+${p.buildNumber}';
  } on Object {
    version = null;
  }
  return {
    'platform': Platform.isIOS ? 'ios' : 'android',
    'name': name.length > 80 ? name.substring(0, 80) : name,
    'appVersion': ?version,
  };
}

final sessionProvider = NotifierProvider<SessionController, SessionState>(SessionController.new);

class SessionController extends Notifier<SessionState> {
  StreamSubscription<String>? _tokenRefresh;

  @override
  SessionState build() {
    ref.onDispose(() => _tokenRefresh?.cancel());
    return const SessionState(SessionStatus.loading);
  }

  SessionStore get _store => ref.read(sessionStoreProvider);

  /// On app start: restore the stored session and get a fresh access token.
  Future<void> restore() async {
    final stored = await _store.load();
    if (stored == null) {
      state = const SessionState(SessionStatus.signedOut);
      return;
    }
    try {
      final ok = await ref.read(apiClientProvider).refresh();
      if (!ok) return; // lost() already moved us to signedOut with a reason
    } on AppFailure {
      // Offline: stay signed in; the next request retries the refresh.
    }
    _signedIn(stored);
  }

  /// After registration, sign-in, device link or recovery.
  Future<void> completeAuth(AuthResult r) async {
    final stored = StoredSession(
      userId: r.user.id,
      handle: r.user.handle,
      displayName: r.user.displayName,
      locale: r.user.locale,
      deviceId: r.deviceId,
      refreshToken: r.session.refreshToken,
    );
    await _store.save(stored);
    ref.read(apiClientProvider).setAccessToken(r.session.accessToken);
    _signedIn(stored);
    // Keep the server's language (used for push text) in step with the app.
    final lang = ref.read(settingsProvider).language;
    if (lang != r.user.locale) unawaited(ref.read(apiProvider).updateMe(locale: lang).catchError((Object _) {}));
  }

  void _signedIn(StoredSession s) {
    state = SessionState(
      SessionStatus.signedIn,
      user: UserSummary(id: s.userId, handle: s.handle, displayName: s.displayName, locale: s.locale),
      deviceId: s.deviceId,
    );
    final client = ref.read(apiClientProvider);
    ref.read(realtimeProvider).connect(() => client.accessToken ?? '');
    unawaited(_registerPush());
  }

  Future<void> _registerPush() async {
    final push = ref.read(pushProvider);
    if (!push.available) return;
    final api = ref.read(apiProvider);
    final token = await push.token();
    if (token != null) await api.registerPushToken(token).catchError((Object _) {});
    await _tokenRefresh?.cancel();
    _tokenRefresh = push.tokenRefresh.listen((t) => unawaited(api.registerPushToken(t).catchError((Object _) {})));
  }

  Future<void> signOut() async {
    final stored = await _store.load();
    if (stored != null) {
      await ref.read(apiProvider).logout(stored.refreshToken).catchError((Object _) {});
    }
    await _endLocally(null);
  }

  /// Called by the API client when the server rejects this phone's session.
  void lost(AppFailure reason) => unawaited(_endLocally(reason));

  Future<void> _endLocally(AppFailure? reason) async {
    await _store.clear();
    ref.read(apiClientProvider).setAccessToken(null);
    ref.read(realtimeProvider).disconnect();
    state = SessionState(SessionStatus.signedOut, lostReason: reason);
  }
}
