import 'dart:async';

import 'package:cosign/core/api/cosign_api.dart';
import 'package:cosign/core/api/models.dart';
import 'package:cosign/core/errors/failure.dart';
import 'package:cosign/core/passkeys/passkey_service.dart';
import 'package:cosign/core/push/push.dart';
import 'package:cosign/core/realtime/realtime.dart';
import 'package:cosign/core/signals/signals_channel.dart';
import 'package:cosign/generated/catalog.g.dart';

// TEST ONLY. An in-memory stand-in for the backend so widget tests can drive the real screens
// without a server. It lives under test/ and is never compiled into the app.

/// What the fake phone "reports". Tests flip it to drive the guardian co-sign flow.
class FakeScenario {
  bool scamCall = false;
}

class FakeSignalsChannel implements SignalsChannel {
  FakeSignalsChannel(this.scenario);
  final FakeScenario scenario;

  @override
  String get platform => 'android';

  @override
  Future<Json> snapshot(List<String> remoteAccessPackages) async => {
        'call': {'active': scenario.scamCall, 'durationSec': scenario.scamCall ? 734 : 0, 'numberKnown': scenario.scamCall ? 'unknown' : 'unavailable'},
        'remoteAccess': {'installed': scenario.scamCall, 'active': scenario.scamCall},
        'screen': {'captureDetected': false, 'recordingActive': false},
        'coverage': {'phoneState': true, 'callLog': true, 'contacts': true, 'usageStats': true},
      };

  @override
  Future<Map<String, bool>> permissionStatus() async => {'phoneState': true, 'callLog': true, 'contacts': true, 'usageStats': true};
  @override
  Future<bool> requestPermissions(List<String> groups) async => true;
  @override
  Future<void> openUsageAccessSettings() async {}
  @override
  Future<void> setSecure(bool secure) async {}
  @override
  Future<String?> integrityToken(String cloudProjectNumber, String requestHash) async => null;
  @override
  Future<bool?> isDeviceSecure() async => true;
  @override
  Stream<Json> get events => const Stream.empty();

  bool monitorOn = false;

  @override
  Future<bool> monitorConfigure({required String baseUrl, required String? token, required bool enabled, required String lang}) async => monitorOn = enabled && token != null;

  @override
  Future<Map<String, bool>> monitorStatus() async => {
        'enabled': monitorOn,
        'usageAccess': true,
        'notificationAccess': true,
        'callScreening': true,
        'contacts': true,
        'phoneState': true,
        'accessibility': false,
        'overlay': true,
        'batteryUnrestricted': false,
      };

  @override
  Future<void> monitorOpen(String what) async {}

  @override
  Future<bool> requestCallScreening() async => true;
}

/// Stands in for the fingerprint / screen-lock prompt.
class FakePasskeyService implements PasskeyService {
  @override
  Future<Json> register(Json creationOptions) async {
    await Future<void>.delayed(const Duration(milliseconds: 700));
    return {'test': true};
  }

  @override
  Future<Json> authenticate(Json requestOptions) async {
    await Future<void>.delayed(const Duration(milliseconds: 700));
    return {'test': true};
  }
}

class FakeRealtime implements Realtime {
  final _controller = StreamController<RealtimeEvent>.broadcast();
  void emit(String name, Json data) => _controller.add(RealtimeEvent(name, data));
  @override
  Stream<RealtimeEvent> get events => _controller.stream;
  @override
  void connect(String Function() token) {}
  @override
  void disconnect() {}
}

class FakePush extends NoPush {}

class _Payee {
  _Payee(this.id, this.nickname, this.handle, this.name);
  final String id;
  final String nickname;
  final String handle;
  final String name;
}

class _Guardian {
  _Guardian(this.linkId, this.name, this.handle, this.status, {this.activatesAt});
  final String linkId;
  final String name;
  final String handle;
  String status;
  DateTime? activatesAt;
  DateTime? removesAt;
}

class _Stepup {
  _Stepup({required this.id, required this.action, required this.params, required this.score, required this.reasons, required this.needsGuardian});
  final String id;
  final String action;
  final Json params;
  final int score;
  final List<String> reasons;
  final bool needsGuardian;
  String status = 'pending_user';
  DateTime createdAt = DateTime.now();
  DateTime expiresAt = DateTime.now().add(const Duration(minutes: 5));
  DateTime? coolOffUntil;
  int responded = 0;
  Json? result;
  String? failureCode;
}

class FakeCoSignApi implements CoSignApi {
  FakeCoSignApi({required this.language, required this.realtime});

  final String Function() language;
  final FakeRealtime realtime;
  static const currency = 'XTS';
  static const guardianDelay = Duration(seconds: 7);

  int _seq = 0;
  String _id(String p) => '$p-${++_seq}';

  UserSummary _user = const UserSummary(id: 'test-user', handle: 'asha', displayName: 'Asha', locale: 'en');
  String? _email;
  String? _phone;
  BigInt _balance = BigInt.from(5000000);
  BigInt _limit = BigInt.from(1000000);
  bool _consent = true;
  final List<ActivityItem> _activity = [];
  final List<_Payee> _payees = [
    _Payee('payee-ravi', 'Ravi (son)', 'ravi', 'Ravi Kumar'),
    _Payee('payee-meena', 'Meena Stores', 'meena.stores', 'Meena Stores'),
  ];
  final List<_Guardian> _guardians = [
    _Guardian('link-ravi', 'Ravi Kumar', 'ravi', 'active'),
    _Guardian('link-divya', 'Divya', 'divya', 'pending_activation', activatesAt: DateTime.now().add(const Duration(hours: 20))),
  ];
  final List<DeviceView> _devices = [];
  final Map<String, _Stepup> _stepups = {};
  final Map<String, GuardianRequest> _requests = {};
  final Map<String, int> _recoveryPolls = {};
  bool _monitorConsent = false;
  bool _monitorEnabled = false;
  final List<GuardianAlert> _alerts = [];

  void _seed() {
    final now = DateTime.now();
    _activity
      ..clear()
      ..addAll([
        ActivityItem(id: 'a1', outgoing: true, amountMinor: BigInt.from(125000), currency: currency, counterpartyName: 'Meena Stores', counterpartyHandle: 'meena.stores', memo: 'Groceries', createdAt: now.subtract(const Duration(hours: 3))),
        ActivityItem(id: 'a2', outgoing: false, amountMinor: BigInt.from(1500000), currency: currency, counterpartyName: 'Ravi Kumar', counterpartyHandle: 'ravi', memo: 'Pension top-up', createdAt: now.subtract(const Duration(days: 1, hours: 2))),
        ActivityItem(id: 'a3', outgoing: true, amountMinor: BigInt.from(48000), currency: currency, counterpartyName: 'Meena Stores', counterpartyHandle: 'meena.stores', memo: null, createdAt: now.subtract(const Duration(days: 2))),
      ]);
    _devices
      ..clear()
      ..addAll([
        DeviceView(id: 'device-this', platform: 'android', name: 'This phone', enrolledAt: now.subtract(const Duration(days: 40)), lastSeenAt: now, current: true),
        DeviceView(id: 'device-tab', platform: 'android', name: 'Samsung Galaxy Tab', enrolledAt: now.subtract(const Duration(days: 12)), lastSeenAt: now.subtract(const Duration(days: 2)), current: false),
      ]);
    _alerts
      ..clear()
      ..addAll([
        _alert('alert-1', 'Amma', 'payment_screen', 'upi', 'com.phonepe.app', 'critical', ['payment_screen_during_call', 'long_unknown_call'], now.subtract(const Duration(minutes: 4)), pause: 'active'),
        _alert('alert-2', 'Arun (grandson)', 'notification_login', 'social', 'com.instagram.android', 'warn', ['new_login_alert', 'late_night_activity'], now.subtract(const Duration(hours: 9))),
        _alert('alert-3', 'Amma', 'call_update', null, null, 'critical', ['long_unknown_call', 'repeated_unknown_caller', 'very_long_unknown_call'], now.subtract(const Duration(days: 1)), acknowledged: true),
      ]);
    // Someone this person guards needs help: shows the guardian approval screen.
    _requests['guard-req-1'] = GuardianRequest(
      id: 'guard-req-1',
      requesterName: 'Amma',
      requesterHandle: 'amma',
      action: 'transfer_above_limit',
      actionLabel: _label('transfer_above_limit'),
      summary: '45,000.00 XTS → @quick.refund.desk',
      score: 70,
      reasons: _reasons(['call_unknown_number', 'remote_access_app']),
      status: 'pending_guardians',
      createdAt: now.subtract(const Duration(minutes: 2)),
      expiresAt: now.add(const Duration(minutes: 8)),
      myDecision: null,
    );
  }

  GuardianAlert _alert(String id, String name, String kind, String? category, String? package, String severity, List<String> rules, DateTime at, {String? pause, bool acknowledged = false}) =>
      GuardianAlert(
        id: id,
        personName: name,
        kind: kind,
        appCategory: category,
        appPackage: package,
        amountBucket: null,
        severity: severity,
        score: rules.fold(0, (sum, r) => sum + (kMonitorWeights[r] ?? 0)),
        reasons: [for (final r in rules) Reason(r, kMonitorWeights[r] ?? 0, kMonitorReasons[r]?[_lang] ?? r)],
        occurredAt: at,
        acknowledged: acknowledged,
        pauseId: pause == null ? null : 'pause-$id',
        pauseStatus: pause,
      );

  String get _lang => language();
  String _label(String action) => kActionLabels[action]?[_lang] ?? action;
  List<Reason> _reasons(List<String> keys) => [
        for (final k in keys) Reason(k, _weights[k] ?? 0, kRiskReasons[k]?[_lang] ?? k),
      ];

  static const _weights = {
    'call_unknown_number': 40,
    'remote_access_app': 30,
    'screen_capture': 30,
    'sim_changed_72h': 30,
    'code_pasted': 15,
    'new_device_24h': 20,
    'late_night': 10,
    'repeated_failures': 15,
    'integrity_failed': 40,
  };

  /// Same rules and weights as the backend's default rule set.
  ({int score, List<String> keys}) _assess(Json? s) {
    final keys = <String>[];
    final call = s?['call'] as Json?;
    if (call?['active'] == true && call?['numberKnown'] != 'known') keys.add('call_unknown_number');
    final ra = s?['remoteAccess'] as Json?;
    if (ra?['installed'] == true || ra?['active'] == true) keys.add('remote_access_app');
    final sc = s?['screen'] as Json?;
    if (sc?['captureDetected'] == true || sc?['recordingActive'] == true) keys.add('screen_capture');
    final b = s?['behaviour'] as Json?;
    if (b?['codePasted'] == true) keys.add('code_pasted');
    final hour = b?['localHour'];
    if (hour is int && hour < 5) keys.add('late_night');
    return (score: keys.fold(0, (sum, k) => sum + (_weights[k] ?? 0)), keys: keys);
  }

  AuthResult _auth({String? handle, String? name}) {
    _user = UserSummary(id: 'test-user', handle: handle ?? _user.handle, displayName: name ?? _user.displayName, locale: _lang);
    _seed();
    return AuthResult(user: _user, deviceId: 'device-this', newDevice: false, session: const SessionTokens(accessToken: 'test', refreshToken: 'test-refresh-token'));
  }

  Future<T> _later<T>(T Function() fn) async {
    await Future<void>.delayed(const Duration(milliseconds: 350));
    return fn();
  }

  // ------------------------------------------------------------------ auth

  @override
  Future<Json> registerOptions({required String handle, required String displayName, required String locale, required Json device}) => _later(() {
        if (!RegExp(r'^[a-z][a-z0-9._]{2,29}$').hasMatch(handle) || displayName.isEmpty) throw AppFailure(ErrorCodes.INVALID_INPUT);
        _pendingHandle = handle;
        _pendingName = displayName;
        return <String, Object?>{};
      });
  String? _pendingHandle;
  String? _pendingName;

  @override
  Future<AuthResult> registerVerify(Json response) => _later(() => _auth(handle: _pendingHandle, name: _pendingName));
  @override
  Future<Json> loginOptions() => _later(() => <String, Object?>{});
  @override
  Future<AuthResult> loginVerify(Json response, {String? deviceId, required Json device}) => _later(_auth);
  @override
  Future<void> logout(String refreshToken) async {}

  // ------------------------------------------------------------------ account

  @override
  Future<Me> me() => _later(() => Me(user: _user, email: _email, phone: _phone, guardians: _guardians.length, guarding: 1));
  @override
  Future<void> updateMe({String? locale, String? displayName}) async {}

  BigInt get _usedToday => _activity
      .where((a) => a.outgoing && DateTime.now().difference(a.createdAt) < const Duration(hours: 24))
      .fold(BigInt.zero, (s, a) => s + a.amountMinor);

  @override
  Future<Account> account() => _later(() {
        final used = _usedToday;
        final remaining = _limit > used ? _limit - used : BigInt.zero;
        return Account(currency: currency, balanceMinor: _balance, transferLimitMinor: _limit, usedTodayMinor: used, remainingTodayMinor: remaining);
      });

  @override
  Future<List<ActivityItem>> activity() => _later(() => List.of(_activity)..sort((a, b) => b.createdAt.compareTo(a.createdAt)));
  @override
  Future<List<Payee>> payees() => _later(() => [for (final p in _payees) Payee(id: p.id, nickname: p.nickname, handle: p.handle, displayName: p.name)]);
  @override
  Future<void> removePayee(String id) => _later(() => _payees.removeWhere((p) => p.id == id));

  void _move(String payeeId, BigInt amount, String? memo) {
    final p = _payees.firstWhere((x) => x.id == payeeId, orElse: () => throw AppFailure(ErrorCodes.NOT_FOUND));
    if (amount > _balance) throw AppFailure(ErrorCodes.INSUFFICIENT_FUNDS);
    _balance -= amount;
    _activity.add(ActivityItem(id: _id('t'), outgoing: true, amountMinor: amount, currency: currency, counterpartyName: p.name, counterpartyHandle: p.handle, memo: memo, createdAt: DateTime.now()));
    realtime.emit('account.updated', {});
  }

  @override
  Future<({String transferId, BigInt balanceMinor})> transfer({required String payeeId, required BigInt amountMinor, String? memo, required String idempotencyKey}) => _later(() {
        final remaining = _limit - _usedToday;
        if (amountMinor > remaining) throw AppFailure(ErrorCodes.LIMIT_STEPUP_REQUIRED, extra: {'action': 'transfer_above_limit'});
        _move(payeeId, amountMinor, memo);
        return (transferId: _id('t'), balanceMinor: _balance);
      });

  @override
  Future<void> lowerLimit(BigInt newLimitMinor) => _later(() {
        if (newLimitMinor > _limit) throw AppFailure(ErrorCodes.INVALID_INPUT);
        _limit = newLimitMinor;
      });

  // ------------------------------------------------------------------ devices

  @override
  Future<List<DeviceView>> devices() => _later(() => List.of(_devices));
  @override
  Future<void> removeDevice(String id) => _later(() => _devices.removeWhere((d) => d.id == id));
  @override
  Future<void> registerPushToken(String token) async {}
  @override
  Future<void> registerExtraPasskey(Json response) async {}
  @override
  Future<Json> deviceLinkOptions(String code, Json device) => _later(() {
        if (!RegExp(r'^\d{8}$').hasMatch(code)) throw AppFailure(ErrorCodes.CODE_INVALID);
        return <String, Object?>{};
      });
  @override
  Future<AuthResult> deviceLinkVerify(Json response) => _later(_auth);
  @override
  Future<void> verifyPhone(String code) async {}

  // ------------------------------------------------------------------ step-up

  StepupView _view(_Stepup s) => StepupView(
        id: s.id,
        action: s.action,
        actionLabel: _label(s.action),
        status: parseStepupStatus(s.status),
        score: s.score,
        needsGuardian: s.needsGuardian,
        reasons: _reasons(s.reasons),
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        coolOffUntil: s.coolOffUntil,
        guardiansTotal: s.needsGuardian ? _guardians.where((g) => g.status != 'pending_activation').length : 0,
        guardiansResponded: s.responded,
        failure: s.failureCode == null ? null : AppFailure(s.failureCode!),
        result: s.result,
      );

  @override
  Future<StepupStart> startStepup(String action, Json params, Json? signals) => _later(() {
        if (action == 'add_payee') {
          final handle = '${params['handle']}';
          if (_payees.any((p) => p.handle == handle)) throw AppFailure(ErrorCodes.PAYEE_EXISTS);
        }
        if (action == 'raise_transfer_limit' && BigInt.parse('${params['newLimitMinor']}') <= _limit) throw AppFailure(ErrorCodes.LIMIT_NOT_HIGHER);
        final a = _assess(signals);
        final s = _Stepup(id: _id('stepup'), action: action, params: params, score: a.score, reasons: a.keys, needsGuardian: a.score >= 50);
        _stepups[s.id] = s;
        return StepupStart(_view(s), const {});
      });

  _Stepup _get(String id) => _stepups[id] ?? (throw AppFailure(ErrorCodes.NOT_FOUND));

  @override
  Future<StepupView> stepup(String id) => _later(() => _view(_get(id)));
  @override
  Future<List<StepupView>> openStepups() => _later(() => [for (final s in _stepups.values) if (const {'pending_user', 'pending_guardians', 'cooloff', 'ready_to_confirm'}.contains(s.status)) _view(s)]);
  @override
  Future<Json> stepupOptions(String id) => _later(() => <String, Object?>{});

  @override
  Future<StepupView> verifyStepup(String id, Json response) => _later(() {
        final s = _get(id);
        if (s.status == 'ready_to_confirm' || !s.needsGuardian) {
          _execute(s);
        } else if (s.status == 'pending_user') {
          s.status = 'pending_guardians';
          s.expiresAt = DateTime.now().add(const Duration(minutes: 10));
          // The simulated guardian (Ravi) checks with the person and approves after a few seconds.
          Timer(guardianDelay, () {
            if (s.status != 'pending_guardians') return;
            s.responded = 1;
            _execute(s);
            realtime.emit('stepup.updated', {'requestId': s.id, 'status': s.status});
          });
        }
        return _view(s);
      });

  void _execute(_Stepup s) {
    final p = s.params;
    try {
      switch (s.action) {
        case 'add_payee':
          final id = _id('payee');
          _payees.add(_Payee(id, '${p['nickname']}', '${p['handle']}', '${p['nickname']}'));
          s.result = {'payeeId': id};
        case 'transfer_above_limit':
          _move('${p['payeeId']}', BigInt.parse('${p['amountMinor']}'), p['memo'] as String?);
          s.result = {'transferId': _id('t')};
        case 'raise_transfer_limit':
          _limit = BigInt.parse('${p['newLimitMinor']}');
          s.result = {'transferLimitMinor': '$_limit'};
        case 'remove_guardian':
          final g = _guardians.firstWhere((x) => x.linkId == p['linkId']);
          g
            ..status = 'pending_removal'
            ..removesAt = DateTime.now().add(const Duration(hours: 24));
          s.result = {};
        case 'change_phone':
          _phone = '${p['phone']}';
          s.result = {'verificationSent': false};
        case 'change_email':
          _email = '${p['email']}';
          s.result = {};
        case 'add_device':
          s.result = {'code': '48213907'};
        case 'add_passkey':
          s.result = {'registrationOptions': <String, Object?>{}};
        case 'view_recovery_codes':
          s.result = {'codes': ['K7Q2M-HX9RD', 'P4TZ8-WN3JC', 'V2MB6-RQ7XE', 'A9HC3-TF5KW', 'Y6DN2-ZP8GU', 'E3RW7-MK4QS', 'B8XJ5-HV2NT', 'Q5GZ9-CW6PD', 'T2KV4-NR8MY', 'H7PF3-XB5ZQ']};
        default:
          s.result = {};
      }
      s.status = 'completed';
    } on AppFailure catch (f) {
      s
        ..status = 'failed'
        ..failureCode = f.code;
    }
  }

  @override
  Future<StepupView> cancelStepup(String id) => _later(() {
        final s = _get(id)..status = 'cancelled';
        return _view(s);
      });

  // ------------------------------------------------------------------ guardians

  @override
  Future<GuardianList> guardians() => _later(() => GuardianList(5, [
        for (final g in _guardians)
          GuardianView(linkId: g.linkId, displayName: g.name, handle: g.handle, status: g.status, activatesAt: g.activatesAt, removesAt: g.removesAt),
      ]));

  @override
  Future<InviteInfo> createInvite() => _later(() => InviteInfo(url: 'https://cosign.example.com/invite/test-invite-token', code: '27461958', expiresAt: DateTime.now().add(const Duration(hours: 48))));

  @override
  Future<void> cancelGuardianChange(String linkId) => _later(() {
        final g = _guardians.firstWhere((x) => x.linkId == linkId);
        if (g.status == 'pending_activation') {
          _guardians.remove(g);
        } else {
          g
            ..status = 'active'
            ..removesAt = null;
        }
      });

  @override
  Future<({String name, DateTime expiresAt})> previewInvite({String? token, String? code}) => _later(() {
        if (code != null && !RegExp(r'^\d{8}$').hasMatch(code)) throw AppFailure(ErrorCodes.CODE_INVALID);
        return (name: 'Lakshmi', expiresAt: DateTime.now().add(const Duration(hours: 40)));
      });

  @override
  Future<DateTime> acceptInvite({String? token, String? code}) => _later(() => DateTime.now().add(const Duration(hours: 24)));
  @override
  Future<List<Person>> people() => _later(() => const [
        Person(linkId: 'link-amma', displayName: 'Amma', status: 'active'),
        Person(linkId: 'link-arun', displayName: 'Arun (grandson)', status: 'active'),
      ]);
  @override
  Future<void> resign(String linkId) async {}

  @override
  Future<GuardianInbox> inbox() => _later(() => GuardianInbox([for (final r in _requests.values) if (r.status == 'pending_guardians' && r.myDecision == null) r], const []));

  @override
  Future<GuardianRequest> guardianRequest(String id) => _later(() => _requests[id] ?? (throw AppFailure(ErrorCodes.NOT_FOUND)));
  @override
  Future<Json> decisionOptions(String id, String decision) => _later(() {
        _pendingDecision = decision;
        return <String, Object?>{};
      });

  String? _pendingDecision;
  @override
  Future<String> decide(String id, Json response) => _later(() {
        final r = _requests[id]!;
        final decision = _pendingDecision ?? 'deny';
        _requests[id] = GuardianRequest(
          id: r.id,
          requesterName: r.requesterName,
          requesterHandle: r.requesterHandle,
          action: r.action,
          actionLabel: r.actionLabel,
          summary: r.summary,
          score: r.score,
          reasons: r.reasons,
          status: decision == 'approve' ? 'completed' : 'denied',
          createdAt: r.createdAt,
          expiresAt: r.expiresAt,
          myDecision: decision,
        );
        _pendingDecision = null;
        return decision;
      });

  @override
  Future<GuardianRecovery> guardianRecovery(String id) => _later(() => throw AppFailure(ErrorCodes.NOT_FOUND));
  @override
  Future<Json> recoveryDecisionOptions(String id) => _later(() => <String, Object?>{});
  @override
  Future<void> recoveryDecide(String id, String decision, Json response) async {}

  // ------------------------------------------------------------------ recovery (new phone)

  @override
  Future<RecoveryStart> startRecovery(String handle, Json device) => _later(() {
        _recoveryPolls['rec-1'] = 0;
        return const RecoveryStart('rec-1', 'test-poll');
      });

  @override
  Future<RecoveryStatus> recoveryStatus(String id, String pollToken) => _later(() {
        final n = (_recoveryPolls[id] ?? 0) + 1;
        _recoveryPolls[id] = n;
        // Compressed timeline for tests: two guardian approvals, a short cancel window, then ready.
        if (n == 1) return const RecoveryStatus('pending_approvals', 1, null);
        if (n == 2) return RecoveryStatus('cancel_window', 2, DateTime.now().add(const Duration(seconds: 10)));
        return const RecoveryStatus('ready', 2, null);
      });

  @override
  Future<void> recoveryCode(String id, String pollToken, String code) => _later(() => _recoveryPolls[id] = 1);
  @override
  Future<Json> recoveryRegisterOptions(String id, String pollToken) => _later(() => <String, Object?>{});
  @override
  Future<AuthResult> recoveryRegisterVerify(String id, String pollToken, Json response) => _later(_auth);
  @override
  Future<ActiveRecovery?> activeRecovery() async => null;
  @override
  Future<void> cancelRecovery(String id) async {}

  // ------------------------------------------------------------------ signals and privacy

  @override
  Future<SignalsConfig> signalsConfig() async =>
      const SignalsConfig(remoteAccessPackages: [], streamInterval: Duration(seconds: 15), integrityEnabled: false, cloudProjectNumber: '', consentVersion: '2026-10');
  @override
  Future<String> integrityChallenge() async => '';
  @override
  Future<Json> streamSignals(Json signals, {String? stepupId}) async {
    final a = _assess(signals);
    return {'score': a.score, 'needsGuardian': a.score >= 50, 'reasons': <Object?>[], 'consented': _consent};
  }

  @override
  Future<ConsentState> consent() => _later(() => ConsentState(_consent, '2026-10'));
  @override
  Future<void> setConsent(bool granted, String version) => _later(() => _consent = granted);
  @override
  Future<Json> exportData() => _later(() => {
        'test': true,
        'profile': {'handle': _user.handle, 'displayName': _user.displayName, 'email': _email, 'phone': _phone},
        'payees': [for (final p in _payees) p.handle],
      });


  // ------------------------------------------------------------------ family protection

  @override
  Future<MonitorStatus> monitorStatus() => _later(() => MonitorStatus(
        consented: _monitorConsent,
        consentVersion: '2026-10',
        enabledOnThisPhone: _monitorEnabled,
        guardians: _guardians.where((g) => g.status != 'pending_activation').length,
        eventsLast24h: _monitorEnabled ? 12 : 0,
        activePauseId: null,
      ));

  @override
  Future<void> setMonitorConsent(bool granted, String version) => _later(() {
        _monitorConsent = granted;
        if (!granted) _monitorEnabled = false;
      });

  @override
  Future<String> issueMonitorToken() => _later(() {
        _monitorEnabled = true;
        return 'test-monitor-token';
      });

  @override
  Future<void> revokeMonitorToken() => _later(() => _monitorEnabled = false);

  @override
  Future<List<GuardianAlert>> guardianAlerts() => _later(() => List.of(_alerts));

  @override
  Future<void> acknowledgeAlert(String id) => _later(() {
        final i = _alerts.indexWhere((a) => a.id == id);
        final a = _alerts[i];
        _alerts[i] = GuardianAlert(
          id: a.id,
          personName: a.personName,
          kind: a.kind,
          appCategory: a.appCategory,
          appPackage: a.appPackage,
          amountBucket: a.amountBucket,
          severity: a.severity,
          score: a.score,
          reasons: a.reasons,
          occurredAt: a.occurredAt,
          acknowledged: true,
          pauseId: a.pauseId,
          pauseStatus: a.pauseStatus,
        );
      });

  @override
  Future<void> releasePause(String pauseId) => _later(() {
        final i = _alerts.indexWhere((a) => a.pauseId == pauseId);
        final a = _alerts[i];
        _alerts[i] = GuardianAlert(
          id: a.id,
          personName: a.personName,
          kind: a.kind,
          appCategory: a.appCategory,
          appPackage: a.appPackage,
          amountBucket: a.amountBucket,
          severity: a.severity,
          score: a.score,
          reasons: a.reasons,
          occurredAt: a.occurredAt,
          acknowledged: true,
          pauseId: a.pauseId,
          pauseStatus: 'released',
        );
        realtime.emit('guardian.alert', {'pauseId': pauseId, 'status': 'released'});
      });
}
