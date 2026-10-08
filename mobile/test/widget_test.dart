import 'package:cosign/app.dart';
import 'package:cosign/core/providers.dart';
import 'package:cosign/core/settings/settings.dart';
import 'package:cosign/core/voice/voice.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

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

  testWidgets('a guardian sees an urgent alert, reads why, and releases the pause', (tester) async {
    phone(tester);
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();
    await signIn(tester);
    await tester.ensureVisible(find.text('Guardian requests').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Guardian requests').last);
    await tester.pumpAndSettle();
    expect(find.text('Alerts'), findsOneWidget);
    expect(find.text('Urgent · Amma'), findsNWidgets(2));
    await tester.tap(find.text('Urgent · Amma').first);
    await tester.pumpAndSettle();
    expect(find.textContaining('payment PIN screen'), findsWidgets);
    expect(find.textContaining('Their phone is paused'), findsOneWidget);
    await tester.ensureVisible(find.text('Release the pause'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Release the pause'));
    await tester.pumpAndSettle();
    expect(find.text('Pause released.'), findsOneWidget);
    expect(find.text('Release the pause'), findsNothing);
  });

  testWidgets('family protection is explained, needs consent, and shows what is set up', (tester) async {
    phone(tester);
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();
    await signIn(tester);
    await tester.ensureVisible(find.text('Family protection'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Family protection'));
    await tester.pumpAndSettle();
    expect(find.textContaining('never the message'), findsOneWidget);
    await tester.ensureVisible(find.text('Turn on family protection'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Turn on family protection'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Protection is on'), findsOneWidget);
    expect(find.text('5 of 7 protections ready'), findsOneWidget);
    expect(find.textContaining('never read'), findsOneWidget);
    await tester.ensureVisible(find.text('Turn off family protection'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Turn off family protection'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Turn on family protection'), 200, scrollable: find.byType(Scrollable).last);
    expect(find.text('Turn on family protection'), findsOneWidget);
  });

  testWidgets('key screens meet Android accessibility guidelines', (tester) async {
    phone(tester);
    final handle = tester.ensureSemantics();
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    await signIn(tester);
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));
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
    expect(find.text('Balance'), findsOneWidget);
  });
}
