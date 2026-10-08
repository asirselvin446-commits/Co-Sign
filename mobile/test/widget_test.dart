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

/// Widget tests run the real screens against the in-memory fake backend in test/support.
void main() {
  setUpAll(() async {
    await initializeDateFormatting('en_IN');
    await initializeDateFormatting('ta_IN');
  });

  Widget app({String language = 'en', bool languageChosen = true}) => ProviderScope(
        overrides: [
          ...fakeOverrides(),
          initialSettingsProvider.overrideWithValue(AppSettings.defaults.copyWith(language: language, languageChosen: languageChosen, consentAsked: true)),
          settingsStoreProvider.overrideWithValue(MemorySettingsStore()),
          voiceProvider.overrideWithValue(SilentVoice()),
          deviceInfoProvider.overrideWithValue(() async => {'platform': 'android', 'name': 'Test phone'}),
        ],
        child: const CoSignApp(enableDeepLinks: false),
      );

  FakeCoSignApi api(WidgetTester tester) => ProviderScope.containerOf(tester.element(find.byType(CoSignApp))).read(apiProvider) as FakeCoSignApi;

  /// A typical phone screen (360 x 800 logical pixels).
  void phone(WidgetTester tester) {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
  }

  Future<void> signIn(WidgetTester tester) async {
    await tester.scrollUntilVisible(find.text('Sign in'), 150, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();
  }

  Future<void> openTab(WidgetTester tester, String label) async {
    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text(label)));
    await tester.pumpAndSettle();
  }

  testWidgets('first launch asks for a language and switches the whole app to Tamil', (tester) async {
    phone(tester);
    await tester.pumpWidget(app(languageChosen: false));
    await tester.pumpAndSettle();
    expect(find.text('Choose your language'), findsOneWidget);
    await tester.tap(find.text('தமிழ்'));
    await tester.pumpAndSettle();
    expect(find.text('உங்கள் மொழியைத் தேர்ந்தெடுங்கள்'), findsOneWidget);
    await tester.tap(find.text('தொடர்'));
    await tester.pumpAndSettle();
    expect(find.text('பாதுகாப்பாக உள்நுழையுங்கள்'), findsOneWidget);
  });

  testWidgets('home has no money: three tabs for protection, family and account', (tester) async {
    phone(tester);
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();
    await signIn(tester);
    expect(find.byType(NavigationBar), findsOneWidget);
    for (final gone in ['Balance', 'Send money', 'Payees']) {
      expect(find.text(gone), findsNothing);
    }
    // Protection is off on this phone, so the status band says so and offers to turn it on.
    expect(find.text('Protection is off'), findsOneWidget);
    expect(find.text('Turn on protection'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Recent warnings on this phone'), 200, scrollable: find.byType(Scrollable).first);
    expect(find.textContaining('remote-control app was just installed'), findsOneWidget);
  });

  testWidgets('a guardian sees who is paused and lets them continue in one tap', (tester) async {
    phone(tester);
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();
    await signIn(tester);
    await openTab(tester, 'Family');
    expect(find.text('Amma'), findsWidgets);
    expect(find.text('Their phone is paused'), findsOneWidget);
    await tester.tap(find.text('Let them continue').first);
    await tester.pumpAndSettle();
    expect(find.text('Amma can continue now.'), findsOneWidget);
    expect(find.text('Their phone is paused'), findsNothing);
  });

  testWidgets('a guardian can pause or lock a phone after a plain confirmation', (tester) async {
    phone(tester);
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();
    await signIn(tester);
    await openTab(tester, 'Family');
    // Arun is protected and not paused.
    await tester.ensureVisible(find.text('Pause their phone').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Pause their phone').first);
    await tester.pumpAndSettle();
    expect(find.textContaining('Pause Arun (grandson)'), findsOneWidget);
    await tester.tap(find.descendant(of: find.byType(AlertDialog), matching: find.text('Pause their phone')));
    await tester.pumpAndSettle();
    expect(find.textContaining("Arun (grandson)'s phone will pause"), findsOneWidget);

    await tester.ensureVisible(find.text('Lock their screen').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Lock their screen').last);
    await tester.pumpAndSettle();
    await tester.tap(find.descendant(of: find.byType(AlertDialog), matching: find.text('Lock their screen')));
    await tester.pumpAndSettle();
    expect(api(tester).locked, ['link-arun']);
  });

  testWidgets('an urgent alert explains why and offers the controls', (tester) async {
    phone(tester);
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();
    await signIn(tester);
    await openTab(tester, 'Family');
    // Two of Amma's alerts are urgent: scroll to the list, then open the newest.
    await tester.scrollUntilVisible(find.text('Alerts'), 200, scrollable: find.byType(Scrollable).first);
    await tester.ensureVisible(find.text('Urgent · Amma').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Urgent · Amma').first);
    await tester.pumpAndSettle();
    expect(find.textContaining('payment PIN screen'), findsWidgets);
    expect(find.textContaining('Their phone is paused'), findsOneWidget);
    await tester.ensureVisible(find.text('Release the pause'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Release the pause'));
    await tester.pumpAndSettle();
    expect(find.text('Pause released.'), findsOneWidget);
  });

  testWidgets('family protection is explained, needs consent, and lists 8 protections', (tester) async {
    phone(tester);
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();
    await signIn(tester);
    await tester.tap(find.text('Turn on protection'));
    await tester.pumpAndSettle();
    expect(find.textContaining('never the message'), findsOneWidget);
    await tester.ensureVisible(find.text('Turn on family protection'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Turn on family protection'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Protection is on'), findsOneWidget);
    expect(find.text('5 of 8 protections ready'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Tell my guardian about wrong PIN attempts, and let them lock my screen'), 200, scrollable: find.byType(Scrollable).first);
    expect(find.text('Tell my guardian about wrong PIN attempts, and let them lock my screen'), findsOneWidget);
  });

  testWidgets('a guardian added by mistake can be removed at once, without waiting a day', (tester) async {
    phone(tester);
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();
    await signIn(tester);
    await openTab(tester, 'Account');
    await tester.tap(find.text('Guardians').first);
    await tester.pumpAndSettle();
    expect(find.textContaining('New guardian. You can remove them at once'), findsOneWidget);
    await tester.ensureVisible(find.text('Remove now: I did not add them'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Remove now: I did not add them'));
    await tester.pumpAndSettle();
    await tester.tap(find.descendant(of: find.byType(AlertDialog), matching: find.text('Remove now: I did not add them')));
    // Let the removal and the refreshed list arrive.
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    await tester.pumpAndSettle();
    expect(find.text('Divya'), findsNothing);
    expect(find.text('Ravi Kumar'), findsOneWidget);
  });

  testWidgets('key screens meet Android accessibility guidelines', (tester) async {
    phone(tester);
    final handle = tester.ensureSemantics();
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    await signIn(tester);
    for (final tab in ['Protection', 'Family', 'Account']) {
      await openTab(tester, tab);
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(textContrastGuideline));
    }
    handle.dispose();
  });

  testWidgets('large system text still lays out without overflow', (tester) async {
    phone(tester);
    tester.platformDispatcher.textScaleFactorTestValue = 2.0;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();
    await signIn(tester);
    expect(tester.takeException(), isNull);
    expect(find.text('Protection is off'), findsOneWidget);
    await openTab(tester, 'Family');
    expect(tester.takeException(), isNull);
  });
}
