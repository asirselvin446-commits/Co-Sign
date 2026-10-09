import 'dart:async';

import 'package:cosign/app.dart';
import 'package:cosign/core/api/models.dart';
import 'package:cosign/core/providers.dart';
import 'package:cosign/core/push/push.dart';
import 'package:cosign/core/settings/settings.dart';
import 'package:cosign/core/voice/voice.dart';
import 'package:cosign/features/signin/vault.dart';
import 'package:cosign/router.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'support/fake_backend.dart';
import 'support/fake_overrides.dart';

/// Guardian-assisted sign-in and link checks, against the in-memory fake.
void main() {
  setUpAll(() async {
    await initializeDateFormatting('en_IN');
  });

  group('saved sign-ins match only the exact app or website', () {
    const sbiApp = SigninTarget(package: 'com.sbi.lotusintouch', host: null, domain: null, appLabel: 'YONO SBI', verdict: 'app');
    const sbiSite = SigninTarget(package: 'com.android.chrome', host: 'retail.onlinesbi.sbi', domain: 'onlinesbi.sbi', appLabel: 'Chrome', verdict: 'official');
    const otherSite = SigninTarget(package: 'com.android.chrome', host: 'shop.example.org', domain: 'example.org', appLabel: 'Chrome', verdict: 'unknown');
    const typed = SavedSignin(id: '1', label: 'SBI', packages: [], domains: [], username: 'amma', password: 'p');

    test('a sign-in saved from the bank app is offered for that app only', () {
      final bound = typed.boundTo(sbiApp);
      expect(bound.packages, ['com.sbi.lotusintouch']);
      expect(bound.matches(sbiApp), isTrue);
      expect(bound.conflicts(sbiSite), isTrue);
    });

    test('a website sign-in matches by website, never by the browser app', () {
      final bound = typed.boundTo(sbiSite);
      expect(bound.domains, ['onlinesbi.sbi']);
      expect(bound.packages, isEmpty, reason: 'the browser package must not be saved');
      expect(bound.matches(sbiSite), isTrue);
      // Another site in the same browser is a different sign-in.
      expect(bound.matches(otherSite), isFalse);
      expect(bound.conflicts(otherSite), isTrue);
    });

    test('a hand-added sign-in can be used anywhere until it is first used', () {
      expect(typed.unbound, isTrue);
      expect(typed.conflicts(otherSite), isFalse);
    });
  });

  group('notification buttons', () {
    test('Fill and Deny open the sign-in request ready to act', () {
      final data = {'screen': 'guardian_signin', 'signinId': 's1'};
      expect(routeForPush(data), '/guardian/signin/s1');
      expect(routeForPush(data, actionId: 'fill'), '/guardian/signin/s1?act=fill');
      expect(routeForPush(data, actionId: 'deny'), '/guardian/signin/s1?act=deny');
    });
  });

  late ProviderContainer container;

  Future<void> start(WidgetTester tester, {void Function(ProviderContainer c)? beforeSignIn}) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(ProviderScope(
      overrides: [
        ...fakeOverrides(),
        initialSettingsProvider.overrideWithValue(AppSettings.defaults.copyWith(languageChosen: true, consentAsked: true)),
        settingsStoreProvider.overrideWithValue(MemorySettingsStore()),
        voiceProvider.overrideWithValue(SilentVoice()),
        deviceInfoProvider.overrideWithValue(() async => {'platform': 'android', 'name': 'Test phone'}),
      ],
      child: const CoSignApp(enableDeepLinks: false),
    ));
    await tester.pumpAndSettle();
    container = ProviderScope.containerOf(tester.element(find.byType(CoSignApp)));
    beforeSignIn?.call(container);
    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();
  }

  Future<void> wait(WidgetTester tester, {int seconds = 3}) async {
    for (var i = 0; i < seconds * 10; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    await tester.pumpAndSettle();
  }

  FakeCoSignApi api() => container.read(apiProvider) as FakeCoSignApi;
  FakeSignalsChannel channel() => container.read(signalsChannelProvider) as FakeSignalsChannel;
  FakeDeviceLock lock() => container.read(fakeDeviceLockProvider);

  testWidgets('the person turns on guardian sign-in and sees who signed them in', (tester) async {
    await start(tester);
    expect(find.text("Sign in with your guardian's help"), findsOneWidget);
    expect(find.textContaining('Turn this on so that on any sign-in screen'), findsOneWidget);
    // Choosing Co-Sign for autofill must not cost the person their Co-Sign passkey.
    expect(find.textContaining('check that Google is still turned on'), findsOneWidget);
    await tester.ensureVisible(find.text('Turn on'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Turn on'));
    await wait(tester);
    expect(find.textContaining('Ready. On any sign-in screen'), findsOneWidget);
    expect(find.textContaining('turn Google back on in passkey settings'), findsOneWidget);
    await tester.ensureVisible(find.text('Open passkey settings'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Open passkey settings'));
    await tester.pumpAndSettle();
    expect(channel().openedPasskeySettings, isTrue);
    expect(find.text('Gmail'), findsOneWidget);
    expect(find.textContaining('Filled by Ravi Kumar'), findsOneWidget);
  });

  testWidgets('when the phone cannot find the passkey, it says why and opens passkey settings', (tester) async {
    await start(tester, beforeSignIn: (c) => (c.read(passkeysProvider) as FakePasskeyService).failNext = 'PASSKEY_NOT_ON_DEVICE');
    await wait(tester, seconds: 1);
    expect(find.text('This phone could not find your Co-Sign passkey.'), findsOneWidget);
    expect(find.textContaining('check that Google is turned on'), findsOneWidget);
    await tester.ensureVisible(find.text('Open passkey settings'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Open passkey settings'));
    await tester.pumpAndSettle();
    expect(channel().openedPasskeySettings, isTrue);
  });

  testWidgets('a guardian fills a sign-in, saving it on their own phone for that app', (tester) async {
    await start(tester);
    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('Family')));
    await wait(tester);
    expect(find.text('Sign-in requests'), findsOneWidget);
    expect(find.text('Amma wants to sign in to YONO SBI'), findsOneWidget);
    await tester.tap(find.text('Fill password').first);
    await wait(tester);

    // Nothing saved yet: the guardian types it once.
    await tester.scrollUntilVisible(find.widgetWithText(TextField, 'Password or PIN'), 200, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Username, email or phone'), 'amma1950');
    await tester.enterText(find.widgetWithText(TextField, 'Password or PIN'), 'S3cret-Pin');
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Fill password'));
    await wait(tester);
    expect(find.text("Done. It has been filled in on Amma's phone."), findsOneWidget);
    expect(channel().lastSealedPlaintext, '{"u":"amma1950","p":"S3cret-Pin"}');
    expect(api().answeredSignins.single, 'signin-1:filled:sealed-for-signin-1');
    // Confirmed with the guardian's own fingerprint or PIN, not a passkey.
    expect(lock().asked, ['Confirm it is you to send Amma the password']);

    final saved = await container.read(vaultProvider).list('link-amma');
    expect(saved.single.packages, ['com.sbi.lotusintouch']);
    expect(saved.single.username, 'amma1950');
  });

  testWidgets('with a saved sign-in, Fill from the notification is one tap', (tester) async {
    await start(tester);
    await container.read(vaultProvider).save(
          'link-amma',
          const SavedSignin(id: 'v1', label: 'YONO SBI', packages: ['com.sbi.lotusintouch'], domains: [], username: 'amma1950', password: 'S3cret-Pin'),
        );
    unawaited(container.read(routerProvider).push('/guardian/signin/signin-1?act=fill'));
    await wait(tester);
    expect(find.text("Done. It has been filled in on Amma's phone."), findsOneWidget);
    expect(api().answeredSignins.single, startsWith('signin-1:filled'));
    expect(lock().asked, hasLength(1));
  });

  testWidgets('if the guardian cancels the screen lock, nothing is sent', (tester) async {
    await start(tester);
    await container.read(vaultProvider).save(
          'link-amma',
          const SavedSignin(id: 'v1', label: 'YONO SBI', packages: ['com.sbi.lotusintouch'], domains: [], username: 'amma1950', password: 'S3cret-Pin'),
        );
    lock().refuse = true;
    unawaited(container.read(routerProvider).push('/guardian/signin/signin-1?act=fill'));
    await wait(tester);
    expect(api().answeredSignins, isEmpty);
    expect(channel().lastSealedPlaintext, isNull);
    expect(find.textContaining('You closed the fingerprint or PIN check'), findsOneWidget);

    lock().refuse = false;
    await tester.tap(find.widgetWithText(FilledButton, 'Fill password'));
    await wait(tester);
    expect(api().answeredSignins.single, startsWith('signin-1:filled'));
  });

  testWidgets('a saved sign-in for a different app is never offered', (tester) async {
    await start(tester);
    await container.read(vaultProvider).save(
          'link-amma',
          const SavedSignin(id: 'v2', label: 'Fake', packages: ['com.fake.yono'], domains: [], username: 'x', password: 'y'),
        );
    unawaited(container.read(routerProvider).push('/guardian/signin/signin-1?act=fill'));
    await wait(tester);
    expect(api().answeredSignins, isEmpty);
    expect(find.text('Saved sign-in: Fake'), findsNothing);
    await tester.scrollUntilVisible(find.widgetWithText(TextField, 'Password or PIN'), 200, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextField, 'Password or PIN'), findsOneWidget);
  });

  testWidgets('Deny from the notification answers at once', (tester) async {
    await start(tester);
    unawaited(container.read(routerProvider).push('/guardian/signin/signin-1?act=deny'));
    await wait(tester);
    expect(find.text('You said no. Amma has been told.'), findsOneWidget);
    expect(api().answeredSignins.single, 'signin-1:denied:');
    // Saying no never needs a fingerprint, PIN or passkey.
    expect(lock().asked, isEmpty);
  });

  testWidgets('checking a message finds the fake bank site and tells the guardian', (tester) async {
    await start(tester);
    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('Account')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Check a message or link'));
    await tester.pumpAndSettle();
    const scam = 'Your SBI account will be blocked. Update KYC: http://sbi-kyc-update.xyz/login';
    await tester.enterText(find.byType(TextField), scam);
    await tester.tap(find.text('Check'));
    await tester.pumpAndSettle();
    expect(find.text('Fake website: do not open it'), findsOneWidget);
    expect(find.textContaining('sbi-kyc-update.xyz pretends to be SBI'), findsOneWidget);
    await scrollTo(tester, find.text('Tell my guardian'));
    await tester.tap(find.text('Tell my guardian'));
    await tester.pumpAndSettle();
    expect(find.text('Your guardians have been told.'), findsOneWidget);
    expect(channel().reported.single, scam);
  });

  testWidgets('a message shared to Co-Sign opens the check straight away', (tester) async {
    await start(tester);
    channel().sharedText = 'Login at https://www.onlinesbi.sbi';
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await wait(tester, seconds: 1);
    expect(find.text('This is the real website of SBI'), findsOneWidget);
  });
}

/// Scroll the page down until [finder] has been built (lists build lazily), then bring it on screen.
Future<void> scrollTo(WidgetTester tester, Finder finder) async {
  for (var i = 0; i < 20 && finder.evaluate().isEmpty; i++) {
    await tester.drag(find.byType(Scrollable).first, const Offset(0, -300));
    await tester.pumpAndSettle();
  }
  await tester.ensureVisible(finder.first);
  await tester.pumpAndSettle();
}
