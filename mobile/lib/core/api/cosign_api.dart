import 'package:uuid/uuid.dart';

import 'api_client.dart';
import 'models.dart';

/// Everything the app asks of the backend. The HTTP implementation is below; widget and
/// integration tests substitute an in-memory implementation.
abstract class CoSignApi {
  // auth
  Future<Json> registerOptions({required String handle, required String displayName, required String locale, required Json device});
  Future<AuthResult> registerVerify(Json response);
  Future<Json> loginOptions();
  Future<AuthResult> loginVerify(Json response, {String? deviceId, required Json device});
  Future<void> logout(String refreshToken);

  // account
  Future<Me> me();
  Future<void> updateMe({String? locale, String? displayName});
  Future<Account> account();
  Future<List<ActivityItem>> activity();
  Future<List<Payee>> payees();
  Future<void> removePayee(String id);
  Future<({String transferId, BigInt balanceMinor})> transfer({required String payeeId, required BigInt amountMinor, String? memo, required String idempotencyKey});
  Future<void> lowerLimit(BigInt newLimitMinor);

  // devices
  Future<List<DeviceView>> devices();
  Future<void> removeDevice(String id);
  Future<void> registerPushToken(String token);
  Future<void> registerExtraPasskey(Json response);
  Future<Json> deviceLinkOptions(String code, Json device);
  Future<AuthResult> deviceLinkVerify(Json response);
  Future<void> verifyPhone(String code);

  // step-up
  Future<StepupStart> startStepup(String action, Json params, Json? signals);
  Future<StepupView> stepup(String id);
  Future<List<StepupView>> openStepups();
  Future<Json> stepupOptions(String id);
  Future<StepupView> verifyStepup(String id, Json response);
  Future<StepupView> cancelStepup(String id);

  // guardians (as the protected user)
  Future<GuardianList> guardians();
  Future<InviteInfo> createInvite();
  Future<void> cancelGuardianChange(String linkId);

  // guardian role
  Future<({String name, DateTime expiresAt})> previewInvite({String? token, String? code});
  Future<DateTime> acceptInvite({String? token, String? code});
  Future<List<Person>> people();
  Future<void> resign(String linkId);
  Future<GuardianInbox> inbox();
  Future<GuardianRequest> guardianRequest(String id);
  Future<Json> decisionOptions(String id, String decision);
  Future<String> decide(String id, Json response);
  Future<GuardianRecovery> guardianRecovery(String id);
  Future<Json> recoveryDecisionOptions(String id);
  Future<void> recoveryDecide(String id, String decision, Json response);

  // recovery (new phone)
  Future<RecoveryStart> startRecovery(String handle, Json device);
  Future<RecoveryStatus> recoveryStatus(String id, String pollToken);
  Future<void> recoveryCode(String id, String pollToken, String code);
  Future<Json> recoveryRegisterOptions(String id, String pollToken);
  Future<AuthResult> recoveryRegisterVerify(String id, String pollToken, Json response);
  // recovery (existing phone)
  Future<ActiveRecovery?> activeRecovery();
  Future<void> cancelRecovery(String id);

  // signals and privacy
  Future<SignalsConfig> signalsConfig();
  Future<String> integrityChallenge();
  Future<Json> streamSignals(Json signals, {String? stepupId});
  Future<ConsentState> consent();
  Future<void> setConsent(bool granted, String version);
  Future<Json> exportData();

  // family protection
  Future<MonitorStatus> monitorStatus();
  Future<void> setMonitorConsent(bool granted, String version);
  Future<String> issueMonitorToken();
  Future<void> revokeMonitorToken();
  Future<List<GuardianAlert>> guardianAlerts();
  Future<void> acknowledgeAlert(String id);
  Future<void> releasePause(String pauseId);
}

class HttpCoSignApi implements CoSignApi {
  HttpCoSignApi(this.http);
  final ApiClient http;

  @override
  Future<Json> registerOptions({required String handle, required String displayName, required String locale, required Json device}) async =>
      (await http.post('/v1/auth/register/options', {'handle': handle, 'displayName': displayName, 'locale': locale, 'device': device}))['options']! as Json;

  @override
  Future<AuthResult> registerVerify(Json response) async => AuthResult.fromJson(await http.post('/v1/auth/register/verify', {'response': response}));

  @override
  Future<Json> loginOptions() async => (await http.post('/v1/auth/login/options'))['options']! as Json;

  @override
  Future<AuthResult> loginVerify(Json response, {String? deviceId, required Json device}) async =>
      AuthResult.fromJson(await http.post('/v1/auth/login/verify', {'response': response, 'deviceId': ?deviceId, 'device': device}));

  @override
  Future<void> logout(String refreshToken) => http.post('/v1/auth/logout', {'refreshToken': refreshToken});

  @override
  Future<Me> me() async => Me.fromJson(await http.get('/v1/me'));

  @override
  Future<void> updateMe({String? locale, String? displayName}) => http.patch('/v1/me', {'locale': ?locale, 'displayName': ?displayName});

  @override
  Future<Account> account() async => Account.fromJson(await http.get('/v1/account'));

  @override
  Future<List<ActivityItem>> activity() async =>
      ((await http.get('/v1/account/activity'))['items']! as List<Object?>).cast<Json>().map(ActivityItem.fromJson).toList();

  @override
  Future<List<Payee>> payees() async => ((await http.get('/v1/payees'))['payees']! as List<Object?>).cast<Json>().map(Payee.fromJson).toList();

  @override
  Future<void> removePayee(String id) => http.delete('/v1/payees/$id');

  @override
  Future<({String transferId, BigInt balanceMinor})> transfer({required String payeeId, required BigInt amountMinor, String? memo, required String idempotencyKey}) async {
    final r = await http.post(
      '/v1/transfers',
      {'payeeId': payeeId, 'amountMinor': amountMinor.toString(), if (memo != null && memo.isNotEmpty) 'memo': memo},
      {'idempotency-key': idempotencyKey},
    );
    return (transferId: r['transferId']! as String, balanceMinor: BigInt.parse(r['balanceMinor']! as String));
  }

  @override
  Future<void> lowerLimit(BigInt newLimitMinor) => http.post('/v1/account/limit/lower', {'newLimitMinor': newLimitMinor.toString()});

  @override
  Future<List<DeviceView>> devices() async => ((await http.get('/v1/devices'))['devices']! as List<Object?>).cast<Json>().map(DeviceView.fromJson).toList();

  @override
  Future<void> removeDevice(String id) => http.delete('/v1/devices/$id');

  @override
  Future<void> registerPushToken(String token) => http.put('/v1/devices/current/push-token', {'token': token});

  @override
  Future<void> registerExtraPasskey(Json response) => http.post('/v1/passkeys/register', {'response': response});

  @override
  Future<Json> deviceLinkOptions(String code, Json device) async => (await http.post('/v1/device-link/options', {'code': code, 'device': device}))['options']! as Json;

  @override
  Future<AuthResult> deviceLinkVerify(Json response) async => AuthResult.fromJson(await http.post('/v1/device-link/verify', {'response': response}));

  @override
  Future<void> verifyPhone(String code) => http.post('/v1/me/phone/verify', {'code': code});

  @override
  Future<StepupStart> startStepup(String action, Json params, Json? signals) async {
    final r = await http.post('/v1/stepup', {'action': action, 'params': params, 'signals': ?signals});
    return StepupStart(StepupView.fromJson(r['request']! as Json), r['options']! as Json);
  }

  @override
  Future<StepupView> stepup(String id) async => StepupView.fromJson(await http.get('/v1/stepup/$id'));

  @override
  Future<List<StepupView>> openStepups() async => ((await http.get('/v1/stepup'))['requests']! as List<Object?>).cast<Json>().map(StepupView.fromJson).toList();

  @override
  Future<Json> stepupOptions(String id) async => (await http.post('/v1/stepup/$id/options'))['options']! as Json;

  @override
  Future<StepupView> verifyStepup(String id, Json response) async => StepupView.fromJson(await http.post('/v1/stepup/$id/verify', {'response': response}));

  @override
  Future<StepupView> cancelStepup(String id) async => StepupView.fromJson(await http.post('/v1/stepup/$id/cancel'));

  @override
  Future<GuardianList> guardians() async {
    final r = await http.get('/v1/guardians');
    return GuardianList((r['max']! as num).toInt(), (r['guardians']! as List<Object?>).cast<Json>().map(GuardianView.fromJson).toList());
  }

  @override
  Future<InviteInfo> createInvite() async => InviteInfo.fromJson(await http.post('/v1/guardians/invites'));

  @override
  Future<void> cancelGuardianChange(String linkId) => http.post('/v1/guardians/$linkId/cancel-change');

  @override
  Future<({String name, DateTime expiresAt})> previewInvite({String? token, String? code}) async {
    final r = await http.post('/v1/guardian/invites/preview', {'token': ?token, 'code': ?code});
    return (name: (r['inviter']! as Json)['displayName']! as String, expiresAt: DateTime.parse(r['inviteExpiresAt']! as String));
  }

  @override
  Future<DateTime> acceptInvite({String? token, String? code}) async =>
      DateTime.parse((await http.post('/v1/guardian/invites/accept', {'token': ?token, 'code': ?code}))['activatesAt']! as String);

  @override
  Future<List<Person>> people() async => ((await http.get('/v1/guardian/people'))['people']! as List<Object?>).cast<Json>().map(Person.fromJson).toList();

  @override
  Future<void> resign(String linkId) => http.post('/v1/guardian/people/$linkId/resign');

  @override
  Future<GuardianInbox> inbox() async {
    final r = await http.get('/v1/guardian/inbox');
    return GuardianInbox(
      (r['requests']! as List<Object?>).cast<Json>().map(GuardianRequest.fromJson).toList(),
      (r['recoveries']! as List<Object?>).cast<Json>().map(GuardianRecovery.fromJson).toList(),
    );
  }

  @override
  Future<GuardianRequest> guardianRequest(String id) async => GuardianRequest.fromJson(await http.get('/v1/guardian/requests/$id'));

  @override
  Future<Json> decisionOptions(String id, String decision) async => (await http.post('/v1/guardian/requests/$id/options', {'decision': decision}))['options']! as Json;

  @override
  Future<String> decide(String id, Json response) async => (await http.post('/v1/guardian/requests/$id/decision', {'response': response}))['decision']! as String;

  @override
  Future<GuardianRecovery> guardianRecovery(String id) async => GuardianRecovery.fromJson(await http.get('/v1/guardian/recoveries/$id'));

  @override
  Future<Json> recoveryDecisionOptions(String id) async => (await http.post('/v1/guardian/recoveries/$id/options'))['options']! as Json;

  @override
  Future<void> recoveryDecide(String id, String decision, Json response) => http.post('/v1/guardian/recoveries/$id/decision', {'decision': decision, 'response': response});

  @override
  Future<RecoveryStart> startRecovery(String handle, Json device) async {
    final r = await http.post('/v1/recovery/start', {'handle': handle, 'device': device});
    return RecoveryStart(r['recoveryId']! as String, r['pollToken']! as String);
  }

  @override
  Future<RecoveryStatus> recoveryStatus(String id, String pollToken) async => RecoveryStatus.fromJson(await http.post('/v1/recovery/$id/status', {'pollToken': pollToken}));

  @override
  Future<void> recoveryCode(String id, String pollToken, String code) => http.post('/v1/recovery/$id/code', {'pollToken': pollToken, 'code': code});

  @override
  Future<Json> recoveryRegisterOptions(String id, String pollToken) async =>
      (await http.post('/v1/recovery/$id/register/options', {'pollToken': pollToken}))['options']! as Json;

  @override
  Future<AuthResult> recoveryRegisterVerify(String id, String pollToken, Json response) async =>
      AuthResult.fromJson(await http.post('/v1/recovery/$id/register/verify', {'pollToken': pollToken, 'response': response}));

  @override
  Future<ActiveRecovery?> activeRecovery() async {
    final r = (await http.get('/v1/recovery/active'))['recovery'] as Json?;
    return r == null ? null : ActiveRecovery.fromJson(r);
  }

  @override
  Future<void> cancelRecovery(String id) => http.post('/v1/recovery/$id/cancel');

  @override
  Future<SignalsConfig> signalsConfig() async => SignalsConfig.fromJson(await http.get('/v1/signals/config'));

  @override
  Future<String> integrityChallenge() async => (await http.post('/v1/signals/integrity-challenge'))['requestHash']! as String;

  @override
  Future<Json> streamSignals(Json signals, {String? stepupId}) => http.post('/v1/signals', {'signals': signals, 'stepupId': ?stepupId});

  @override
  Future<ConsentState> consent() async {
    final r = await http.get('/v1/consents');
    return ConsentState((r['riskSignals']! as Json)['granted']! as bool, r['currentVersion']! as String);
  }

  @override
  Future<void> setConsent(bool granted, String version) => http.put('/v1/consents/risk-signals', {'granted': granted, 'version': version});

  @override
  Future<Json> exportData() => http.get('/v1/me/export');

  @override
  Future<MonitorStatus> monitorStatus() async => MonitorStatus.fromJson(await http.get('/v1/monitor/status'));

  @override
  Future<void> setMonitorConsent(bool granted, String version) => http.put('/v1/monitor/consent', {'granted': granted, 'version': version});

  @override
  Future<String> issueMonitorToken() async => (await http.post('/v1/monitor/token'))['token']! as String;

  @override
  Future<void> revokeMonitorToken() => http.delete('/v1/monitor/token');

  @override
  Future<List<GuardianAlert>> guardianAlerts() async =>
      ((await http.get('/v1/guardian/alerts'))['alerts']! as List<Object?>).cast<Json>().map(GuardianAlert.fromJson).toList();

  @override
  Future<void> acknowledgeAlert(String id) => http.post('/v1/guardian/alerts/$id/ack');

  @override
  Future<void> releasePause(String pauseId) => http.post('/v1/guardian/pauses/$pauseId/release');
}

const _uuid = Uuid();
String newIdempotencyKey() => _uuid.v4();
