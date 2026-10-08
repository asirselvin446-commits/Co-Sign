import 'dart:convert';

import 'package:cosign/core/api/api_client.dart';
import 'package:cosign/core/errors/failure.dart';
import 'package:cosign/core/passkeys/passkey_service.dart';
import 'package:cosign/core/push/push.dart';
import 'package:cosign/core/session/session_store.dart';
import 'package:cosign/core/signals/signal_collector.dart';
import 'package:cosign/generated/catalog.g.dart';
import 'package:cosign/ui/money.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:passkeys/types.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('en_IN');
    await initializeDateFormatting('ta_IN');
    await initializeDateFormatting('hi_IN');
  });

  group('failure explainer', () {
    test('every catalogue code has a cause and a next step in all three languages', () {
      for (final e in kErrorCatalog.values) {
        for (final lang in kCatalogLanguages) {
          expect(e.text[lang]!.cause, isNotEmpty, reason: '${e.code}/$lang');
          expect(e.text[lang]!.next, isNotEmpty, reason: '${e.code}/$lang');
        }
      }
    });

    test('states the exact wait time, in the person\'s language', () {
      final f = AppFailure(ErrorCodes.TOO_MANY_ATTEMPTS, extra: {'retryAfterSeconds': 125});
      expect(explain(f, 'en').next, 'Wait 3 minutes and try again.');
      expect(explain(f, 'ta').next, contains('3 நிமிடங்கள்'));
      expect(explain(f, 'hi').next, contains('3 मिनट'));
    });

    test('words the cool-off end time as a clock time', () {
      final f = AppFailure(ErrorCodes.COOLOFF_ACTIVE, extra: {'until': DateTime(2026, 3, 1, 16, 5).toUtc().toIso8601String()});
      expect(explain(f, 'en').cause, contains('4:05'));
    });

    test('unknown server codes fall back to a safe generic message', () {
      final f = AppFailure.fromServer({'error': {'code': 'SOMETHING_NEW'}}, 500);
      expect(f.code, ErrorCodes.INTERNAL_ERROR);
    });

    test('speaks cause then next step', () {
      final e = explain(AppFailure(ErrorCodes.NETWORK_ERROR), 'en');
      expect(e.spoken, '${e.cause} ${e.next}');
    });
  });

  group('codes typed in other scripts', () {
    test('detects and converts Tamil and Devanagari digits', () {
      expect(hasNonAsciiDigits('௧௨௩௪'), isTrue);
      expect(hasNonAsciiDigits('१२३४'), isTrue);
      expect(hasNonAsciiDigits('1234'), isFalse);
      expect(toAsciiDigits('௧௨௩௪ ५६७८'), '1234 5678');
    });
  });

  group('money', () {
    test('formats minor units with Indian grouping and no floating point', () {
      expect(formatMoney(BigInt.parse('1234567890'), 'XTS', 'en'), '1,23,45,678.90 XTS');
      expect(formatMoney(BigInt.from(5), 'XTS', 'en'), '0.05 XTS');
    });

    test('parses amounts people type, including Tamil and Devanagari digits', () {
      expect(parseAmount('250'), BigInt.from(25000));
      expect(parseAmount('250.5'), BigInt.from(25050));
      expect(parseAmount('1,000.00'), BigInt.from(100000));
      expect(parseAmount('௨௫௦'), BigInt.from(25000));
      expect(parseAmount('२५०.७५'), BigInt.from(25075));
      expect(parseAmount('0'), isNull);
      expect(parseAmount('12.345'), isNull);
      expect(parseAmount('abc'), isNull);
    });
  });

  group('device signals', () {
    test('maps the native snapshot to the backend schema and adds behaviour', () {
      final now = DateTime.utc(2026, 10, 8, 20, 30);
      final s = buildSignals(
        native: {
          'call': {'active': true, 'durationSec': 734, 'numberKnown': 'unknown'},
          'remoteAccess': {'installed': true, 'active': false},
          'screen': {'captureDetected': false, 'recordingActive': true},
          'sim': {'fingerprint': 'f' * 64},
          'coverage': {'phoneState': true, 'callLog': false, 'contacts': true, 'usageStats': false},
        },
        platform: 'android',
        now: now,
        codePasted: true,
      );
      expect(s['collectedAt'], '2026-10-08T20:30:00.000Z');
      expect(s['call'], {'active': true, 'durationSec': 734, 'numberKnown': 'unknown'});
      expect((s['behaviour']! as Map)['codePasted'], isTrue);
      expect(s.keys, isNot(contains('phoneNumber')));
    });

    test('omits parts the phone could not provide', () {
      final s = buildSignals(native: {'call': {'active': true}}, platform: 'ios', now: DateTime.now(), codePasted: false);
      expect(s.containsKey('call'), isFalse);
      expect(s.containsKey('sim'), isFalse);
    });

    test('flags pasted input but never blocks it', () {
      final tracker = PasteTracker();
      final f = PasteDetectingFormatter(tracker);
      f.formatEditUpdate(const TextEditingValue(text: '1'), const TextEditingValue(text: '12'));
      expect(tracker.recentlyPasted, isFalse);
      final out = f.formatEditUpdate(const TextEditingValue(text: ''), const TextEditingValue(text: '48213907'));
      expect(out.text, '48213907');
      expect(tracker.recentlyPasted, isTrue);
    });
  });

  group('passkeys', () {
    test('maps platform errors to explainable codes', () {
      expect(mapPasskeyError(PasskeyAuthCancelledException(), registering: false).code, ErrorCodes.PASSKEY_CANCELLED);
      expect(mapPasskeyError(NoCredentialsAvailableException(), registering: false).code, ErrorCodes.PASSKEY_NOT_ON_DEVICE);
      expect(mapPasskeyError(ExcludeCredentialsCanNotBeRegisteredException(), registering: true).code, ErrorCodes.CREDENTIAL_ALREADY_REGISTERED);
      expect(mapPasskeyError(NoCreateOptionException('x'), registering: true).code, ErrorCodes.NO_SCREEN_LOCK);
      expect(mapPasskeyError(PlatformException(code: 'weird'), registering: false).code, ErrorCodes.PASSKEY_FAILED);
    });

    test('adds missing transports so server options parse', () {
      final o = normaliseCredentialLists({
        'challenge': 'abc',
        'allowCredentials': [
          {'id': 'cred1'},
        ],
      });
      expect((o['allowCredentials']! as List).first, {'id': 'cred1', 'transports': <String>[], 'type': 'public-key'});
    });
  });

  group('API client', () {
    Future<SessionStore> store() async {
      final s = SessionStore(MemorySecretStore());
      await s.save(const StoredSession(userId: 'u', handle: 'h', displayName: 'H', locale: 'en', deviceId: 'd', refreshToken: 'old-refresh'));
      return s;
    }

    test('refreshes an expired access token once and retries the request', () async {
      var refreshes = 0;
      final client = MockClient((req) async {
        if (req.url.path == '/v1/auth/refresh') {
          refreshes++;
          expect(jsonDecode(req.body), {'refreshToken': 'old-refresh', 'deviceId': 'd'});
          return http.Response(jsonEncode({'session': {'accessToken': 'new-access', 'refreshToken': 'new-refresh'}}), 200);
        }
        if (req.headers['authorization'] == 'Bearer new-access') return http.Response(jsonEncode({'ok': true}), 200);
        return http.Response(jsonEncode({'error': {'code': 'SESSION_EXPIRED'}}), 401);
      });
      final sessions = await store();
      final api = ApiClient(baseUrl: 'https://x', sessions: sessions, language: () => 'ta', client: client)..setAccessToken('stale');
      expect(await api.get('/v1/me'), {'ok': true});
      expect(refreshes, 1);
      expect((await sessions.load())!.refreshToken, 'new-refresh');
    });

    test('a rejected refresh token ends the session and says why', () async {
      AppFailure? lost;
      final client = MockClient((req) async => http.Response(jsonEncode({'error': {'code': 'SESSION_EXPIRED'}}), 401));
      final sessions = await store();
      final api = ApiClient(baseUrl: 'https://x', sessions: sessions, language: () => 'en', client: client, onSessionLost: (f) => lost = f);
      await expectLater(api.get('/v1/me'), throwsA(isA<AppFailure>()));
      expect(lost?.code, ErrorCodes.SESSION_EXPIRED);
      expect(await sessions.load(), isNull);
    });

    test('network problems become NETWORK_ERROR and send the chosen language', () async {
      String? lang;
      final client = MockClient((req) async {
        lang = req.headers['x-cosign-lang'];
        throw http.ClientException('offline');
      });
      final api = ApiClient(baseUrl: 'https://x', sessions: await store(), language: () => 'hi', client: client);
      await expectLater(api.get('/v1/account'), throwsA(predicate((e) => e is AppFailure && e.code == ErrorCodes.NETWORK_ERROR)));
      expect(lang, 'hi');
    });
  });

  group('push routing', () {
    test('opens the right screen from a notification', () {
      expect(routeForPush({'screen': 'guardian_request', 'requestId': 'r1'}), '/guardian/request/r1');
      expect(routeForPush({'screen': 'guardian_alert', 'alertId': 'a1'}), '/guardian/alerts/a1');
      expect(routeForPush({'screen': 'stepup', 'requestId': 's1'}), '/stepup/s1');
      expect(routeForPush({'screen': 'recovery_alert'}), '/home');
      expect(routeForPush({'screen': 'unknown'}), isNull);
    });
  });

  group('shared monitoring catalogue', () {
    test('every monitoring rule has a weight and reasons in all languages', () {
      expect(kMonitorWeights.keys.toSet(), kMonitorReasons.keys.toSet());
      for (final r in kMonitorReasons.values) {
        for (final lang in kCatalogLanguages) {
          expect(r[lang], isNotEmpty);
        }
      }
    });
  });
}
