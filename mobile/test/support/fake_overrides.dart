import 'package:cosign/core/config.dart';
import 'package:cosign/core/providers.dart';
import 'package:cosign/core/security/device_lock.dart';
import 'package:cosign/core/session/session_store.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;

import 'fake_backend.dart';

/// What the fake phone reports. Tests set `scamCall` to drive the guardian co-sign flow.
final fakeScenarioProvider = Provider<FakeScenario>((_) => FakeScenario());
/// The phone's screen lock. Tests set `refuse` to act as if the guardian cancelled the fingerprint check.
final fakeDeviceLockProvider = Provider<FakeDeviceLock>((_) => FakeDeviceLock());
final _fakeRealtimeProvider = Provider<FakeRealtime>((_) => FakeRealtime());

/// Swap every network and platform dependency for the in-memory fake.
List<Override> fakeOverrides() => [
      configProvider.overrideWithValue(const AppConfig(apiBaseUrl: 'http://fake.invalid')),
      secretStoreProvider.overrideWithValue(MemorySecretStore()),
      realtimeProvider.overrideWith((ref) => ref.watch(_fakeRealtimeProvider)),
      apiProvider.overrideWith((ref) => FakeCoSignApi(language: () => ref.read(settingsProvider).language, realtime: ref.watch(_fakeRealtimeProvider))),
      passkeysProvider.overrideWithValue(FakePasskeyService()),
      deviceLockProvider.overrideWith((ref) => ref.watch(fakeDeviceLockProvider)),
      signalsChannelProvider.overrideWith((ref) => FakeSignalsChannel(ref.watch(fakeScenarioProvider))),
      pushProvider.overrideWithValue(FakePush()),
    ];
