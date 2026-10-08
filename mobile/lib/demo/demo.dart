import 'dart:async';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart';

import '../core/api/cosign_api.dart';
import '../core/api/models.dart';
import '../core/config.dart';
import '../core/errors/failure.dart';
import '../core/passkeys/passkey_service.dart';
import '../core/providers.dart';
import '../core/push/push.dart';
import '../core/realtime/realtime.dart';
import '../core/session/session_store.dart';
import '../generated/catalog.g.dart';

/// Demo build (`--dart-define=DEMO=true`): the whole app runs on the phone with sample data, so it
/// can be shown without a server. The phone's real risk signals still drive the safety check, and
/// guardian approval, cool-off and recovery play out on a short timeline.
const bool kDemoMode = bool.fromEnvironment('DEMO');

List<Override> demoOverrides() {
  final realtime = DemoRealtime();
  return [
    configProvider.overrideWithValue(const AppConfig(apiBaseUrl: 'https://demo.cosign.local')),
    secretStoreProvider.overrideWithValue(MemorySecretStore()),
    realtimeProvider.overrideWithValue(realtime),
    pushProvider.overrideWithValue(NoPush()),
    passkeysProvider.overrideWithValue(DemoPasskeyService()),
    apiProvider.overrideWith((ref) => DemoCoSignApi(realtime: realtime, language: () => ref.read(settingsProvider).language)),
  ];
}

/// A corner ribbon so nobody mistakes the sample data for a live account.
class DemoBanner extends StatelessWidget {
  const DemoBanner({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => Directionality(
        textDirection: TextDirection.ltr,
        child: Banner(message: 'DEMO', location: BannerLocation.topEnd, color: const Color(0xFF0B5CAD), child: child),
      );
}

class MemorySecretStore implements SecretStore {
  final _values = <String, String>{};
  @override
  Future<String?> read(String key) async => _values[key];
  @override
  Future<void> write(String key, String value) async => _values[key] = value;
  @override
  Future<void> delete(String key) async => _values.remove(key);
}

class DemoRealtime implements Realtime {
  final _controller = StreamController<RealtimeEvent>.broadcast();
  @override
  Stream<RealtimeEvent> get events => _controller.stream;
  @override
  void connect(String Function() token) {}
  @override
  void disconnect() {}
  void emit(String name, Json data) => _controller.add(RealtimeEvent(name, data));
}

/// Stands in for the system passkey sheet: a short pause, then success.
class DemoPasskeyService implements PasskeyService {
  static final _rng = Random();
  Json _credential() => {'id': 'demo-${_rng.nextInt(1 << 30)}', 'type': 'public-key', 'response': const <String, Object?>{}};

  @override
  Future<Json> register(Json creationOptions) async {
    await Future<void>.delayed(const Duration(milliseconds: 700));
    return _credential();
  }

  @override
  Future<Json> authenticate(Json requestOptions) async {
    await Future<void>.delayed(const Duration(milliseconds: 600));
    return _credential();
  }
}

// ------------------------------------------------------------------ sample data and behaviour

const _weights = {
  'call_unknown_number': 40,
  'remote_access_app': 30,
  'screen_capture': 30,
  'code_pasted': 15,
  'late_night': 10,
};
const _threshold = 50;

class _Stepup {
  _Stepup({required this.id, required this.action, required this.params, required this.reasonKeys, required this.score});
  final String id;
  final String action;
  final Json params;
  final List<String> reasonKeys;
  final int score;
  final DateTime createdAt = DateTime.now();
  late final DateTime expiresAt = createdAt.add(const Duration(minutes: 10));
  StepupStatus status = StepupStatus.pendingUser;
  DateTime? coolOffUntil;
  int responded = 0;
  Json? result;
  bool get needsGuardian => score >= _threshold;
}

class _Recovery {
  final DateTime started = DateTime.now();
}

class DemoCoSignApi implements CoSignApi {
  DemoCoSignApi({required this.realtime, required this.language});
  final DemoRealtime realtime;
  final String Function() language;

  static const _currency = 'INR';
  static final _minor = BigInt.from(100);
  final _rng = Random();

  String _displayName = 'Lakshmi Sundaram';
  String _handle = 'lakshmi';
  String? _phone = '+91 98••• ••210';
  String? _email;
  bool _consent = true;
  BigInt _balance = BigInt.from(48250) * _minor;
  BigInt _limit = BigInt.from(10000) * _minor;
  BigInt _usedToday = BigInt.from(1500) * _minor;
  String _deviceName = 'This phone';

  final _activity = <ActivityItem>[
    ActivityItem(id: 'a1', outgoing: true, amountMinor: BigInt.from(1500) * _minor, currency: _currency, counterpartyName: 'Murugan Stores', counterpartyHandle: 'murugan.stores', memo: 'Groceries', createdAt: DateTime.now().subtract(const Duration(hours: 3))),
    ActivityItem(id: 'a2', outgoing: false, amountMinor: BigInt.from(5000) * _minor, currency: _currency, counterpartyName: 'Ravi Kumar', counterpartyHandle: 'ravi', memo: 'For medicines', createdAt: DateTime.now().subtract(const Duration(days: 1, hours: 2))),
    ActivityItem(id: 'a3', outgoing: true, amountMinor: BigInt.from(1240) * _minor, currency: _currency, counterpartyName: 'TN Electricity Board', counterpartyHandle: 'tneb.bills', memo: 'EB bill', createdAt: DateTime.now().subtract(const Duration(days: 3))),
    ActivityItem(id: 'a4', outgoing: false, amountMinor: BigInt.from(18000) * _minor, currency: _currency, counterpartyName: 'Pension Office', counterpartyHandle: 'pension.tn', memo: 'Monthly pension', createdAt: DateTime.now().subtract(const Duration(days: 7))),
  ];
  final _payees = <Payee>[
    const Payee(id: 'p1', nickname: 'Murugan Stores', handle: 'murugan.stores', displayName: 'Murugan Stores'),
    const Payee(id: 'p2', nickname: 'Ravi (son)', handle: 'ravi', displayName: 'Ravi Kumar'),
    const Payee(id: 'p3', nickname: 'EB bill', handle: 'tneb.bills', displayName: 'TN Electricity Board'),
  ];
  final _devices = <DeviceView>[];
  final _guardians = <GuardianView>[
    GuardianView(linkId: 'g1', displayName: 'Ravi Kumar', handle: 'ravi', status: 'active', activatesAt: DateTime.now().subtract(const Duration(days: 40)), removesAt: null),
    GuardianView(linkId: 'g2', displayName: 'Priya Sundaram', handle: 'priya', status: 'active', activatesAt: DateTime.now().subtract(const Duration(days: 12)), removesAt: null),
  ];
  final _people = <Person>[const Person(linkId: 'w1', displayName: 'Sundaram (Appa)', status: 'active')];
  late final _requests = <GuardianRequest>[_appaRequest()];
  final _stepups = <String, _Stepup>{};
  final _recoveries = <String, _Recovery>{};

  String _id(String prefix) => '$prefix-${DateTime.now().microsecondsSinceEpoch}-${_rng.nextInt(9999)}';
  String _lang() => language();
  String _reason(String key) => kRiskReasons[key]?[_lang()] ?? kRiskReasons[key]?['en'] ?? key;
  String _label(String action) => kActionLabels[action]?[_lang()] ?? kActionLabels[action]?['en'] ?? action;
  Future<T> _later<T>(T value, [int ms = 250]) => Future<T>.delayed(Duration(milliseconds: ms), () => value);

  GuardianRequest _appaRequest() => GuardianRequest(
        id: 'r-appa',
        requesterName: 'Sundaram (Appa)',
        requesterHandle: 'sundaram',
        action: 'transfer_above_limit',
        actionLabel: _label('transfer_above_limit'),
        summary: '₹25,000.00 → "KYC Update Desk"',
        score: 70,
        reasons: [Reason('call_unknown_number', 40, _reason('call_unknown_number')), Reason('remote_access_app', 30, _reason('remote_access_app'))],
        status: 'pending_guardians',
        createdAt: DateTime.now().subtract(const Duration(minutes: 2)),
        expiresAt: DateTime.now().add(const Duration(minutes: 8)),
        myDecision: null,
      );

  AuthResult _auth({bool newDevice = false}) => AuthResult(
        user: UserSummary(id: 'u-demo', handle: _handle, displayName: _displayName, locale: _lang()),
        deviceId: 'd-current',
        newDevice: newDevice,
        session: const SessionTokens(accessToken: 'demo', refreshToken: 'demo'),
      );

  void _rememberDevice(Json device) {
    _deviceName = (device['name'] as String?) ?? _deviceName;
    _devices
      ..clear()
      ..add(DeviceView(id: 'd-current', platform: (device['platform'] as String?) ?? 'android', name: _deviceName, enrolledAt: DateTime.now().subtract(const Duration(days: 60)), lastSeenAt: DateTime.now(), current: true))
      ..add(DeviceView(id: 'd-old', platform: 'android', name: 'Redmi Note 9 (old phone)', enrolledAt: DateTime.now().subtract(const Duration(days: 400)), lastSeenAt: DateTime.now().subtract(const Duration(days: 30)), current: false));
  }

  // ---------------------------------------------------------------- auth

  @override
  Future<Json> registerOptions({required String handle, required String displayName, required String locale, required Json device}) {
    _handle = handle.trim().toLowerCase().replaceAll('@', '');
    _displayName = displayName.trim().isEmpty ? _displayName : displayName.trim();
    _rememberDevice(device);
    return _later(const {'challenge': 'demo'});
  }

  @override
  Future<AuthResult> registerVerify(Json response) => _later(_auth(newDevice: true), 500);

  @override
  Future<Json> loginOptions() => _later(const {'challenge': 'demo'});

  @override
  Future<AuthResult> loginVerify(Json response, {String? deviceId, required Json device}) {
    _rememberDevice(device);
    return _later(_auth(), 500);
  }

  @override
  Future<void> logout(String refreshToken) => _later(null);

  // ---------------------------------------------------------------- account

  @override
  Future<Me> me() => _later(Me(
        user: UserSummary(id: 'u-demo', handle: _handle, displayName: _displayName, locale: _lang()),
        email: _email,
        phone: _phone,
        guardians: _guardians.where((g) => g.status != 'removed').length,
        guarding: _people.length,
      ));

  @override
  Future<void> updateMe({String? locale, String? displayName}) async {
    if (displayName != null) _displayName = displayName;
  }

  @override
  Future<Account> account() {
    final remaining = _limit - _usedToday;
    return _later(Account(currency: _currency, balanceMinor: _balance, transferLimitMinor: _limit, usedTodayMinor: _usedToday, remainingTodayMinor: remaining.isNegative ? BigInt.zero : remaining));
  }

  @override
  Future<List<ActivityItem>> activity() => _later(List.of(_activity));

  @override
  Future<List<Payee>> payees() => _later(List.of(_payees));

  @override
  Future<void> removePayee(String id) async => _payees.removeWhere((p) => p.id == id);

  void _send(String payeeId, BigInt amount, String? memo) {
    if (amount > _balance) throw AppFailure(ErrorCodes.INSUFFICIENT_FUNDS);
    final p = _payees.firstWhere((p) => p.id == payeeId, orElse: () => _payees.first);
    _balance -= amount;
    _usedToday += amount;
    _activity.insert(0, ActivityItem(id: _id('a'), outgoing: true, amountMinor: amount, currency: _currency, counterpartyName: p.displayName, counterpartyHandle: p.handle, memo: memo, createdAt: DateTime.now()));
    realtime.emit('account.updated', const {});
  }

  @override
  Future<({String transferId, BigInt balanceMinor})> transfer({required String payeeId, required BigInt amountMinor, String? memo, required String idempotencyKey}) async {
    await Future<void>.delayed(const Duration(milliseconds: 500));
    if (amountMinor > _limit - _usedToday) throw AppFailure(ErrorCodes.LIMIT_STEPUP_REQUIRED);
    _send(payeeId, amountMinor, memo);
    return (transferId: _id('t'), balanceMinor: _balance);
  }

  @override
  Future<void> lowerLimit(BigInt newLimitMinor) async => _limit = newLimitMinor;

  // ---------------------------------------------------------------- devices

  @override
  Future<List<DeviceView>> devices() {
    if (_devices.isEmpty) _rememberDevice(const {'name': 'This phone'});
    return _later(List.of(_devices));
  }

  @override
  Future<void> removeDevice(String id) async => _devices.removeWhere((d) => d.id == id);
  @override
  Future<void> registerPushToken(String token) async {}
  @override
  Future<void> registerExtraPasskey(Json response) => _later(null, 400);
  @override
  Future<Json> deviceLinkOptions(String code, Json device) {
    _rememberDevice(device);
    return _later(const {'challenge': 'demo'});
  }

  @override
  Future<AuthResult> deviceLinkVerify(Json response) => _later(_auth(newDevice: true), 500);
  @override
  Future<void> verifyPhone(String code) => _later(null, 400);

  // ---------------------------------------------------------------- step-up

  StepupView _view(_Stepup s) => StepupView(
        id: s.id,
        action: s.action,
        actionLabel: _label(s.action),
        status: s.status,
        score: s.score,
        needsGuardian: s.needsGuardian,
        reasons: [for (final k in s.reasonKeys) Reason(k, _weights[k] ?? 0, _reason(k))],
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        coolOffUntil: s.coolOffUntil,
        guardiansTotal: _guardians.where((g) => g.status == 'active').length,
        guardiansResponded: s.responded,
        failure: null,
        result: s.result,
      );

  /// The phone's real signals, scored with the server's default weights.
  List<String> _matched(Json? signals) {
    if (signals == null) return const [];
    final keys = <String>[];
    final call = signals['call'];
    if (call is Map && call['active'] == true && call['numberKnown'] != 'known') keys.add('call_unknown_number');
    final remote = signals['remoteAccess'];
    if (remote is Map && (remote['installed'] == true || remote['active'] == true)) keys.add('remote_access_app');
    final screen = signals['screen'];
    if (screen is Map && (screen['captureDetected'] == true || screen['recordingActive'] == true)) keys.add('screen_capture');
    final behaviour = signals['behaviour'];
    if (behaviour is Map) {
      if (behaviour['codePasted'] == true) keys.add('code_pasted');
      final hour = behaviour['localHour'];
      if (hour is int && hour < 5) keys.add('late_night');
    }
    return keys;
  }

  @override
  Future<StepupStart> startStepup(String action, Json params, Json? signals) async {
    await Future<void>.delayed(const Duration(milliseconds: 600));
    var keys = _matched(signals);
    // The showcase scenario: a large transfer while a "bank officer" is on the line with screen control.
    if (action == 'transfer_above_limit' && keys.fold<int>(0, (n, k) => n + (_weights[k] ?? 0)) < _threshold) {
      keys = {...keys, 'call_unknown_number', 'remote_access_app'}.toList();
    }
    keys.sort((a, b) => (_weights[b] ?? 0).compareTo(_weights[a] ?? 0));
    final s = _Stepup(id: _id('s'), action: action, params: params, reasonKeys: keys, score: keys.fold(0, (n, k) => n + (_weights[k] ?? 0)));
    _stepups[s.id] = s;
    return StepupStart(_view(s), const {'challenge': 'demo'});
  }

  @override
  Future<StepupView> stepup(String id) => _later(_view(_find(id)), 150);

  @override
  Future<List<StepupView>> openStepups() => _later(_stepups.values.map(_view).where((v) => v.isOpen).toList());

  @override
  Future<Json> stepupOptions(String id) => _later(const {'challenge': 'demo'});

  _Stepup _find(String id) => _stepups[id] ?? (throw AppFailure(ErrorCodes.NOT_FOUND));

  void _changed(_Stepup s) => realtime.emit('stepup.updated', {'requestId': s.id});

  @override
  Future<StepupView> verifyStepup(String id, Json response) async {
    final s = _find(id);
    await Future<void>.delayed(const Duration(milliseconds: 400));
    if (s.status == StepupStatus.pendingUser && s.needsGuardian) {
      s.status = StepupStatus.pendingGuardians;
      _runGuardianTimeline(s);
    } else if (s.status == StepupStatus.pendingUser || s.status == StepupStatus.readyToConfirm) {
      _complete(s);
    }
    return _view(s);
  }

  /// Ravi approves after a few seconds, then a short cool-off before the person confirms.
  void _runGuardianTimeline(_Stepup s) {
    Timer(const Duration(seconds: 6), () {
      if (s.status != StepupStatus.pendingGuardians) return;
      s.responded = 1;
      s.status = StepupStatus.cooloff;
      s.coolOffUntil = DateTime.now().add(const Duration(seconds: 15));
      _changed(s);
      Timer(const Duration(seconds: 15), () {
        if (s.status != StepupStatus.cooloff) return;
        s.status = StepupStatus.readyToConfirm;
        _changed(s);
      });
    });
  }

  void _complete(_Stepup s) {
    final p = s.params;
    switch (s.action) {
      case 'transfer_above_limit':
        _send(p['payeeId']! as String, BigInt.parse(p['amountMinor']! as String), p['memo'] as String?);
      case 'add_payee':
        final handle = (p['handle'] as String? ?? 'new.payee').replaceAll('@', '');
        final payee = Payee(id: _id('p'), nickname: p['nickname'] as String? ?? handle, handle: handle, displayName: p['nickname'] as String? ?? handle);
        _payees.add(payee);
        s.result = {'payeeId': payee.id};
      case 'raise_transfer_limit':
        _limit = BigInt.parse(p['newLimitMinor']! as String);
      case 'change_phone':
        _phone = p['phone'] as String?;
        s.result = {'verificationSent': true};
      case 'change_email':
        _email = p['email'] as String?;
      case 'view_recovery_codes':
        s.result = {'codes': ['7KQ2-9XHM', 'P4TR-2NWD', 'C8ZL-5JUE', 'M3VB-6YKA', 'H9FS-1QGT', 'W5NC-8RPX', 'B2JD-4LTZ', 'E6GH-7VMQ']};
      case 'add_device':
        s.result = {'code': '${100000 + _rng.nextInt(899999)}'};
      case 'add_passkey':
        s.result = {'registrationOptions': const {'challenge': 'demo'}};
      case 'remove_guardian':
        final i = _guardians.indexWhere((g) => g.linkId == p['linkId']);
        if (i >= 0) {
          final g = _guardians[i];
          _guardians[i] = GuardianView(linkId: g.linkId, displayName: g.displayName, handle: g.handle, status: 'pending_removal', activatesAt: g.activatesAt, removesAt: DateTime.now().add(const Duration(hours: 24)));
        }
    }
    s.status = StepupStatus.completed;
    _changed(s);
  }

  @override
  Future<StepupView> cancelStepup(String id) async {
    final s = _find(id);
    if (s.status != StepupStatus.completed) s.status = StepupStatus.cancelled;
    return _view(s);
  }

  // ---------------------------------------------------------------- guardians

  @override
  Future<GuardianList> guardians() => _later(GuardianList(5, _guardians.where((g) => g.status != 'removed').toList()));

  @override
  Future<InviteInfo> createInvite() => _later(InviteInfo(url: 'https://cosign.app/invite/demo-${_rng.nextInt(99999)}', code: '${10000000 + _rng.nextInt(89999999)}', expiresAt: DateTime.now().add(const Duration(hours: 48))), 400);

  @override
  Future<void> cancelGuardianChange(String linkId) async {
    final i = _guardians.indexWhere((g) => g.linkId == linkId);
    if (i < 0) return;
    final g = _guardians[i];
    _guardians[i] = GuardianView(linkId: g.linkId, displayName: g.displayName, handle: g.handle, status: 'active', activatesAt: g.activatesAt, removesAt: null);
  }

  @override
  Future<({String name, DateTime expiresAt})> previewInvite({String? token, String? code}) =>
      _later((name: 'Meena Raghavan', expiresAt: DateTime.now().add(const Duration(hours: 40))));

  @override
  Future<DateTime> acceptInvite({String? token, String? code}) async {
    _people.add(const Person(linkId: 'w2', displayName: 'Meena Raghavan', status: 'pending_activation'));
    return DateTime.now().add(const Duration(hours: 24));
  }

  @override
  Future<List<Person>> people() => _later(List.of(_people));

  @override
  Future<void> resign(String linkId) async => _people.removeWhere((p) => p.linkId == linkId);

  @override
  Future<GuardianInbox> inbox() => _later(GuardianInbox(_requests.where((r) => r.myDecision == null).toList(), const []));

  @override
  Future<GuardianRequest> guardianRequest(String id) => _later(_requests.firstWhere((r) => r.id == id, orElse: () => throw AppFailure(ErrorCodes.NOT_FOUND)));

  String? _pendingDecision;

  @override
  Future<Json> decisionOptions(String id, String decision) {
    _pendingDecision = decision;
    return _later(const {'challenge': 'demo'});
  }

  @override
  Future<String> decide(String id, Json response) async {
    await Future<void>.delayed(const Duration(milliseconds: 400));
    final decision = _pendingDecision ?? 'deny';
    final i = _requests.indexWhere((r) => r.id == id);
    if (i >= 0) {
      final r = _requests[i];
      _requests[i] = GuardianRequest(
        id: r.id,
        requesterName: r.requesterName,
        requesterHandle: r.requesterHandle,
        action: r.action,
        actionLabel: r.actionLabel,
        summary: r.summary,
        score: r.score,
        reasons: r.reasons,
        status: decision == 'approve' ? 'cooloff' : 'denied',
        createdAt: r.createdAt,
        expiresAt: r.expiresAt,
        myDecision: decision,
      );
      realtime.emit('guardian.request.closed', {'requestId': id});
    }
    return decision;
  }

  @override
  Future<GuardianRecovery> guardianRecovery(String id) => throw AppFailure(ErrorCodes.NOT_FOUND);
  @override
  Future<Json> recoveryDecisionOptions(String id) => _later(const {'challenge': 'demo'});
  @override
  Future<void> recoveryDecide(String id, String decision, Json response) => _later(null);

  // ---------------------------------------------------------------- recovery (new phone)

  @override
  Future<RecoveryStart> startRecovery(String handle, Json device) async {
    _handle = handle.trim().toLowerCase().replaceAll('@', '');
    _rememberDevice(device);
    final id = _id('rec');
    _recoveries[id] = _Recovery();
    return _later(RecoveryStart(id, 'demo'), 500);
  }

  /// Two guardians approve over ~8 seconds, then a short cancel window for the old phone.
  @override
  Future<RecoveryStatus> recoveryStatus(String id, String pollToken) {
    final r = _recoveries[id] ?? _Recovery();
    final s = DateTime.now().difference(r.started).inSeconds;
    final status = s < 4
        ? const RecoveryStatus('pending_approvals', 0, null)
        : s < 8
            ? const RecoveryStatus('pending_approvals', 1, null)
            : s < 18
                ? RecoveryStatus('cancel_window', 2, r.started.add(const Duration(seconds: 18)))
                : const RecoveryStatus('ready', 2, null);
    return _later(status, 150);
  }

  @override
  Future<void> recoveryCode(String id, String pollToken, String code) => _later(null, 400);
  @override
  Future<Json> recoveryRegisterOptions(String id, String pollToken) => _later(const {'challenge': 'demo'});
  @override
  Future<AuthResult> recoveryRegisterVerify(String id, String pollToken, Json response) => _later(_auth(newDevice: true), 500);
  @override
  Future<ActiveRecovery?> activeRecovery() => _later(null, 100);
  @override
  Future<void> cancelRecovery(String id) => _later(null);

  // ---------------------------------------------------------------- signals and privacy

  @override
  Future<SignalsConfig> signalsConfig() => _later(
        const SignalsConfig(
          remoteAccessPackages: [
            'com.anydesk.anydeskandroid',
            'com.teamviewer.quicksupport.market',
            'com.teamviewer.teamviewer.market.mobile',
            'com.rustdesk.rustdesk',
            'com.airdroid.remote.support',
          ],
          streamInterval: Duration(seconds: 15),
          integrityEnabled: false,
          cloudProjectNumber: '',
          consentVersion: '2026-10',
        ),
        50,
      );

  @override
  Future<String> integrityChallenge() => _later('demo');
  @override
  Future<Json> streamSignals(Json signals, {String? stepupId}) {
    final keys = _matched(signals);
    final score = keys.fold<int>(0, (n, k) => n + (_weights[k] ?? 0));
    return _later({'score': score, 'needsGuardian': score >= _threshold, 'reasons': [for (final k in keys) {'key': k, 'weight': _weights[k], 'reason': _reason(k)}], 'consented': _consent}, 50);
  }

  @override
  Future<ConsentState> consent() => _later(ConsentState(_consent, '2026-10'));
  @override
  Future<void> setConsent(bool granted, String version) async => _consent = granted;
  @override
  Future<Json> exportData() => _later({
        'user': {'handle': _handle, 'displayName': _displayName, 'phone': _phone, 'email': _email},
        'account': {'currency': _currency, 'balanceMinor': _balance.toString(), 'transferLimitMinor': _limit.toString()},
        'payees': [for (final p in _payees) {'nickname': p.nickname, 'handle': p.handle}],
        'guardians': [for (final g in _guardians) {'displayName': g.displayName, 'status': g.status}],
      }, 400);
}
