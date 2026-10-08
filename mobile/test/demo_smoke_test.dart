import 'package:cosign/app.dart';
import 'package:cosign/core/providers.dart';
import 'package:cosign/core/session/session_controller.dart';
import 'package:cosign/core/settings/settings.dart';
import 'package:cosign/core/voice/voice.dart';
import 'package:cosign/demo/demo.dart';
import 'package:cosign/router.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

class _MemorySettings implements SettingsStore {
  AppSettings value = AppSettings.defaults;
  @override
  Future<AppSettings> load() async => value;
  @override
  Future<void> save(AppSettings s) async => value = s;
}

class _SilentVoice implements Voice {
  @override
  Future<bool> canSpeak(String lang) async => false;
  @override
  Future<bool> speak(String text, String lang) async => false;
  @override
  Future<void> stop() async {}
}

/// Loading spinners animate forever, so pump a bounded number of frames instead of pumpAndSettle.
Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 20; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  setUpAll(() => initializeDateFormatting('en_IN'));

  for (final lang in ['en', 'ta', 'hi']) {
    testWidgets('demo build: sign in and open every screen ($lang)', (tester) async {
      tester.view.physicalSize = const Size(1080, 2400);
      tester.view.devicePixelRatio = 2.75;
      addTearDown(tester.view.reset);
      final settings = AppSettings.defaults.copyWith(language: lang, languageChosen: true, consentAsked: true);
      final container = ProviderContainer(overrides: [
        ...demoOverrides(),
        initialSettingsProvider.overrideWithValue(settings),
        settingsStoreProvider.overrideWithValue(_MemorySettings()),
        voiceProvider.overrideWithValue(_SilentVoice()),
        deviceInfoProvider.overrideWithValue(() async => {'platform': 'android', 'name': 'Pixel 8'}),
      ]);
      addTearDown(container.dispose);
      await tester.pumpWidget(UncontrolledProviderScope(container: container, child: const DemoBanner(child: CoSignApp(enableDeepLinks: false))));
      await _settle(tester);

      final api = container.read(apiProvider);
      // Demo calls pause on real timers; the test clock only moves when frames are pumped.
      final login = (await tester.runAsync(() => api.loginVerify(const {}, device: {'platform': 'android', 'name': 'Pixel 8'})))!;
      await tester.runAsync(() => container.read(sessionProvider.notifier).completeAuth(login));
      await _settle(tester);
      expect(tester.takeException(), isNull);
      if (lang == 'en') expect(find.textContaining('48,250.00'), findsWidgets);

      final router = container.read(routerProvider);
      for (final path in [
        '/home',
        '/transfer',
        '/payees',
        '/payees/add',
        '/devices',
        '/guardians',
        '/guardians/invite',
        '/guardian/inbox',
        '/guardian/request/r-appa',
        '/settings',
        '/settings/permissions',
        '/consent',
      ]) {
        router.go(path);
        await _settle(tester);
        expect(tester.takeException(), isNull, reason: path);
        expect(find.byType(ErrorWidget), findsNothing, reason: path);
      }

      // The scam-pause scenario renders its reasons and waits for the person's passkey.
      final start = (await tester.runAsync(() => api.startStepup('transfer_above_limit', {'payeeId': 'p2', 'amountMinor': '2500000'}, null)))!;
      expect(start.request.score, 70);
      expect(start.request.needsGuardian, isTrue);
      router.go('/stepup/${start.request.id}', extra: start);
      await _settle(tester);
      expect(tester.takeException(), isNull);
      if (lang == 'en') expect(find.textContaining('not in your contacts'), findsWidgets);
      router.go('/home');
      await _settle(tester);
      await tester.pumpWidget(const SizedBox());
    });
  }
}
