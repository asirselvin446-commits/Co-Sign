import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api/api_client.dart';
import 'api/cosign_api.dart';
import 'config.dart';
import 'passkeys/passkey_service.dart';
import 'push/push.dart';
import 'realtime/realtime.dart';
import 'session/session_controller.dart';
import 'session/session_store.dart';
import 'settings/settings.dart';
import 'signals/signal_collector.dart';
import 'signals/signals_channel.dart';
import 'voice/voice.dart';

// Everything platform-specific is a provider, so tests can override it with in-memory versions.

final configProvider = Provider<AppConfig>((_) => AppConfig.fromEnvironment());
final secretStoreProvider = Provider<SecretStore>((_) => const SecureSecretStore());
final sessionStoreProvider = Provider<SessionStore>((ref) => SessionStore(ref.watch(secretStoreProvider)));
final settingsStoreProvider = Provider<SettingsStore>((_) => PrefsSettingsStore());

/// Loaded before runApp and injected with an override (see main.dart).
final initialSettingsProvider = Provider<AppSettings>((_) => AppSettings.defaults);

final settingsProvider = NotifierProvider<SettingsController, AppSettings>(SettingsController.new);

class SettingsController extends Notifier<AppSettings> {
  @override
  AppSettings build() => ref.watch(initialSettingsProvider);

  Future<void> update(AppSettings next) async {
    state = next;
    await ref.read(settingsStoreProvider).save(next);
  }
}

final apiClientProvider = Provider<ApiClient>((ref) {
  final client = ApiClient(
    baseUrl: ref.watch(configProvider).apiBaseUrl,
    sessions: ref.watch(sessionStoreProvider),
    language: () => ref.read(settingsProvider).language,
  );
  client.onSessionLost = (reason) => ref.read(sessionProvider.notifier).lost(reason);
  ref.onDispose(client.close);
  return client;
});

final apiProvider = Provider<CoSignApi>((ref) => HttpCoSignApi(ref.watch(apiClientProvider)));

final signalsChannelProvider = Provider<SignalsChannel>((_) => NativeSignalsChannel());

final passkeysProvider = Provider<PasskeyService>(
  (ref) => NativePasskeyService(isDeviceSecure: ref.watch(signalsChannelProvider).isDeviceSecure),
);

final pasteTrackerProvider = Provider<PasteTracker>((_) => PasteTracker());

final signalCollectorProvider = Provider<SignalCollector>(
  (ref) => SignalCollector(channel: ref.watch(signalsChannelProvider), api: ref.watch(apiProvider), paste: ref.watch(pasteTrackerProvider)),
);

final voiceProvider = Provider<Voice>((_) => TtsVoice());

final realtimeProvider = Provider<Realtime>((ref) {
  final rt = SocketRealtime(ref.watch(configProvider).apiBaseUrl);
  ref.onDispose(rt.disconnect);
  return rt;
});

final pushProvider = Provider<Push>((_) => FirebasePush());

/// Device description sent when enrolling this phone (model name and app version only).
final deviceInfoProvider = Provider<Future<Map<String, Object?>> Function()>((_) => defaultDeviceInfo);
