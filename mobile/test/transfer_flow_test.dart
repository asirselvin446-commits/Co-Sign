import 'package:cosign/app.dart';
import 'package:cosign/core/providers.dart';
import 'package:cosign/core/settings/settings.dart';
import 'package:cosign/core/voice/voice.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'support/fake_backend.dart';
import 'support/fake_overrides.dart';

/// Walks the main screens against the in-memory fake backend: sign in, home, and a high-risk
/// transfer that waits for (and gets) a guardian's approval.
void main() {
  setUpAll(() async {
    await initializeDateFormatting('en_IN');
  });

  testWidgets('sign in, see the balance, and co-sign a risky transfer', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final scenario = FakeScenario();
    await tester.pumpWidget(ProviderScope(
      overrides: [
        ...fakeOverrides(),
        fakeScenarioProvider.overrideWithValue(scenario),
        initialSettingsProvider.overrideWithValue(AppSettings.defaults.copyWith(languageChosen: true, consentAsked: true)),
        settingsStoreProvider.overrideWithValue(MemorySettingsStore()),
        voiceProvider.overrideWithValue(SilentVoice()),
        deviceInfoProvider.overrideWithValue(() async => {'platform': 'android', 'name': 'Test phone'}),
      ],
      child: const CoSignApp(enableDeepLinks: false),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Sign in safely'), findsOneWidget);

    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();
    expect(find.text('Balance'), findsOneWidget);
    expect(find.textContaining('50,000.00 XTS'), findsOneWidget);

    // The phone reports an unknown caller plus a screen-control app, then the user sends more than the limit.
    scenario.scamCall = true;
    await tester.tap(find.text('Send money'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Choose a payee'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ravi (son) (@ravi)').last);
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, '15000');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Send'));
    await tester.pumpAndSettle();

    expect(find.text('Safety check'), findsOneWidget);
    expect(find.text('Why we paused this'), findsOneWidget);
    await tester.tap(find.text('Confirm with passkey'));
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('Waiting for your guardian'), findsOneWidget);

    // The fake guardian approves after a few seconds.
    await tester.pump(const Duration(seconds: 8));
    await tester.pumpAndSettle(const Duration(seconds: 2));
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();
    expect(find.text('Balance'), findsOneWidget);
    expect(find.textContaining('35,000.00 XTS'), findsOneWidget);
  });
}
