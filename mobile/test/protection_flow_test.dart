import 'package:cosign/app.dart';
import 'package:cosign/core/providers.dart';
import 'package:cosign/core/settings/settings.dart';
import 'package:cosign/core/voice/voice.dart';
import 'package:cosign/router.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'support/fake_backend.dart';
import 'support/fake_overrides.dart';

/// End-to-end flows against the in-memory fake: the protected person turns protection on and asks
/// for help; a guardian approves from a notification in one tap; a risky account change during a
/// scam call waits for a guardian.
void main() {
  setUpAll(() async {
    await initializeDateFormatting('en_IN');
  });

  late FakeScenario scenario;

  Widget app() {
    scenario = FakeScenario();
    return ProviderScope(
      overrides: [
        ...fakeOverrides(),
        fakeScenarioProvider.overrideWithValue(scenario),
        initialSettingsProvider.overrideWithValue(AppSettings.defaults.copyWith(languageChosen: true, consentAsked: true)),
        settingsStoreProvider.overrideWithValue(MemorySettingsStore()),
        voiceProvider.overrideWithValue(SilentVoice()),
        deviceInfoProvider.overrideWithValue(() async => {'platform': 'android', 'name': 'Test phone'}),
      ],
      child: const CoSignApp(enableDeepLinks: false),
    );
  }

  /// Let the fake's simulated network and passkey delays pass.
  Future<void> wait(WidgetTester tester, {int seconds = 3}) async {
    for (var i = 0; i < seconds * 10; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    await tester.pumpAndSettle();
  }

  ProviderContainer container(WidgetTester tester) => ProviderScope.containerOf(tester.element(find.byType(CoSignApp)));

  Future<void> start(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();
  }

  testWidgets('turn on protection, see "You are protected", and ask guardians for help', (tester) async {
    await start(tester);
    expect(find.text('Protection is off'), findsOneWidget);
    await tester.tap(find.text('Turn on protection'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Turn on family protection'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Turn on family protection'));
    await tester.pumpAndSettle();
    await tester.pageBack();
    await tester.pumpAndSettle();

    expect(find.text('You are protected'), findsOneWidget);
    expect(find.textContaining('Ravi Kumar will be told'), findsOneWidget);
    await tester.tap(find.text('I need help'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Your guardians have been told'), findsOneWidget);
    expect((container(tester).read(apiProvider) as FakeCoSignApi).helpRequests, 1);
  });

  testWidgets('Approve from a notification opens the passkey prompt straight away', (tester) async {
    await start(tester);
    // What tapping the notification's Approve button does.
    container(tester).read(routerProvider).go('/guardian/request/guard-req-1?act=approve');
    await wait(tester);
    await tester.scrollUntilVisible(find.text('You approved this.'), 200, scrollable: find.byType(Scrollable).first);
    expect(find.text('You approved this.'), findsOneWidget);
  });

  testWidgets('"Let them continue" from a notification releases the pause in one tap', (tester) async {
    await start(tester);
    container(tester).read(routerProvider).go('/guardian/pause/pause-alert-1?act=release');
    await wait(tester);
    await tester.scrollUntilVisible(find.text('Amma can continue now.'), 200, scrollable: find.byType(Scrollable).first);
    expect(find.text('Amma can continue now.'), findsOneWidget);
  });

  testWidgets('changing the sign-in email during a scam call waits for a guardian', (tester) async {
    await start(tester);
    scenario.scamCall = true;
    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('Account')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Settings'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Change email'), 200, scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Change email'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, 'asha.new@mail.test');
    await tester.tap(find.text('Continue').last);
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
    // Approved: the safety check closes and the change is made.
    expect(find.text('Settings'), findsWidgets);
    expect((container(tester).read(apiProvider) as FakeCoSignApi).email, 'asha.new@mail.test');
  });
}
