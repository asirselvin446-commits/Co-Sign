import '../errors/failure.dart';

typedef Json = Map<String, Object?>;

DateTime _date(Object? v) => DateTime.parse(v! as String);
DateTime? _dateOrNull(Object? v) => v == null ? null : DateTime.parse(v as String);
List<Json> _list(Object? v) => (v as List<Object?>? ?? const []).cast<Json>();

class UserSummary {
  const UserSummary({required this.id, required this.handle, required this.displayName, required this.locale});
  factory UserSummary.fromJson(Json j) =>
      UserSummary(id: j['id']! as String, handle: j['handle']! as String, displayName: j['displayName']! as String, locale: j['locale']! as String);
  final String id;
  final String handle;
  final String displayName;
  final String locale;
}

class SessionTokens {
  const SessionTokens({required this.accessToken, required this.refreshToken});
  factory SessionTokens.fromJson(Json j) => SessionTokens(accessToken: j['accessToken']! as String, refreshToken: j['refreshToken']! as String);
  final String accessToken;
  final String refreshToken;
}

class AuthResult {
  const AuthResult({required this.user, required this.deviceId, required this.newDevice, required this.session});
  factory AuthResult.fromJson(Json j) => AuthResult(
        user: UserSummary.fromJson(j['user']! as Json),
        deviceId: j['deviceId']! as String,
        newDevice: j['newDevice']! as bool,
        session: SessionTokens.fromJson(j['session']! as Json),
      );
  final UserSummary user;
  final String deviceId;
  final bool newDevice;
  final SessionTokens session;
}

class Me {
  const Me({required this.user, required this.email, required this.phone, required this.guardians, required this.guarding});
  factory Me.fromJson(Json j) => Me(
        user: UserSummary.fromJson(j),
        email: j['email'] as String?,
        phone: j['phone'] as String?,
        guardians: (j['guardians']! as num).toInt(),
        guarding: (j['guarding']! as num).toInt(),
      );
  final UserSummary user;
  final String? email;
  final String? phone;
  final int guardians;
  final int guarding;
}

class DeviceView {
  const DeviceView({required this.id, required this.platform, required this.name, required this.enrolledAt, required this.lastSeenAt, required this.current});
  factory DeviceView.fromJson(Json j) => DeviceView(
        id: j['id']! as String,
        platform: j['platform']! as String,
        name: j['name']! as String,
        enrolledAt: _date(j['enrolledAt']),
        lastSeenAt: _date(j['lastSeenAt']),
        current: j['current']! as bool,
      );
  final String id;
  final String platform;
  final String name;
  final DateTime enrolledAt;
  final DateTime lastSeenAt;
  final bool current;
}

class GuardianView {
  const GuardianView({required this.linkId, required this.displayName, required this.handle, required this.status, required this.activatesAt, required this.removesAt, this.undoUntil});
  factory GuardianView.fromJson(Json j) => GuardianView(
        linkId: j['linkId']! as String,
        displayName: j['displayName']! as String,
        handle: j['handle']! as String,
        status: j['status']! as String,
        activatesAt: _dateOrNull(j['activatesAt']),
        removesAt: _dateOrNull(j['removesAt']),
        undoUntil: _dateOrNull(j['undoUntil']),
      );
  final String linkId;
  final String displayName;
  final String handle;
  final String status;
  final DateTime? activatesAt;
  final DateTime? removesAt;

  /// A guardian who started recently can be removed at once until then ("I did not add them").
  final DateTime? undoUntil;

  bool get canUndo => undoUntil != null && undoUntil!.isAfter(DateTime.now());
}

class GuardianList {
  const GuardianList(this.max, this.guardians);
  final int max;
  final List<GuardianView> guardians;
}

class InviteInfo {
  const InviteInfo({required this.url, required this.code, required this.expiresAt});
  factory InviteInfo.fromJson(Json j) => InviteInfo(url: j['url']! as String, code: j['code']! as String, expiresAt: _date(j['expiresAt']));
  final String url;
  final String code;
  final DateTime expiresAt;
}

class Reason {
  const Reason(this.key, this.weight, this.text);
  factory Reason.fromJson(Json j) => Reason(j['key']! as String, (j['weight']! as num).toInt(), j['reason']! as String);
  final String key;
  final int weight;
  final String text;
}

enum StepupStatus { pendingUser, pendingGuardians, cooloff, readyToConfirm, approved, completed, denied, cancelled, expired, failed }

StepupStatus parseStepupStatus(String s) => switch (s) {
      'pending_user' => StepupStatus.pendingUser,
      'pending_guardians' => StepupStatus.pendingGuardians,
      'cooloff' => StepupStatus.cooloff,
      'ready_to_confirm' => StepupStatus.readyToConfirm,
      'approved' => StepupStatus.approved,
      'completed' => StepupStatus.completed,
      'denied' => StepupStatus.denied,
      'cancelled' => StepupStatus.cancelled,
      'expired' => StepupStatus.expired,
      _ => StepupStatus.failed,
    };

class StepupView {
  const StepupView({
    required this.id,
    required this.action,
    required this.actionLabel,
    required this.status,
    required this.score,
    required this.needsGuardian,
    required this.reasons,
    required this.createdAt,
    required this.expiresAt,
    required this.coolOffUntil,
    required this.guardiansTotal,
    required this.guardiansResponded,
    required this.failure,
    required this.result,
  });

  factory StepupView.fromJson(Json j) {
    final failure = j['failure'] as Json?;
    final g = j['guardians']! as Json;
    return StepupView(
      id: j['id']! as String,
      action: j['action']! as String,
      actionLabel: j['actionLabel']! as String,
      status: parseStepupStatus(j['status']! as String),
      score: (j['score']! as num).toInt(),
      needsGuardian: j['needsGuardian']! as bool,
      reasons: _list(j['reasons']).map(Reason.fromJson).toList(),
      createdAt: _date(j['createdAt']),
      expiresAt: _date(j['expiresAt']),
      coolOffUntil: _dateOrNull(j['coolOffUntil']),
      guardiansTotal: (g['total']! as num).toInt(),
      guardiansResponded: (g['responded']! as num).toInt(),
      failure: failure == null ? null : AppFailure(failure['code']! as String),
      result: j['result'] as Json?,
    );
  }

  final String id;
  final String action;
  final String actionLabel;
  final StepupStatus status;
  final int score;
  final bool needsGuardian;
  final List<Reason> reasons;
  final DateTime createdAt;
  final DateTime expiresAt;
  final DateTime? coolOffUntil;
  final int guardiansTotal;
  final int guardiansResponded;
  final AppFailure? failure;
  final Json? result;

  bool get isOpen => const {StepupStatus.pendingUser, StepupStatus.pendingGuardians, StepupStatus.cooloff, StepupStatus.readyToConfirm}.contains(status);
}

class StepupStart {
  const StepupStart(this.request, this.options);
  final StepupView request;
  final Json options;
}

class GuardianRequest {
  const GuardianRequest({
    required this.id,
    required this.requesterName,
    required this.requesterHandle,
    required this.action,
    required this.actionLabel,
    required this.summary,
    required this.score,
    required this.reasons,
    required this.status,
    required this.createdAt,
    required this.expiresAt,
    required this.myDecision,
  });
  factory GuardianRequest.fromJson(Json j) {
    final r = j['requester']! as Json;
    return GuardianRequest(
      id: j['id']! as String,
      requesterName: r['displayName']! as String,
      requesterHandle: r['handle']! as String,
      action: j['action']! as String,
      actionLabel: j['actionLabel']! as String,
      summary: j['summary'] as String?,
      score: (j['score']! as num).toInt(),
      reasons: _list(j['reasons']).map(Reason.fromJson).toList(),
      status: j['status']! as String,
      createdAt: _date(j['createdAt']),
      expiresAt: _date(j['expiresAt']),
      myDecision: j['myDecision'] as String?,
    );
  }
  final String id;
  final String requesterName;
  final String requesterHandle;
  final String action;
  final String actionLabel;
  final String? summary;
  final int score;
  final List<Reason> reasons;
  final String status;
  final DateTime createdAt;
  final DateTime expiresAt;
  final String? myDecision;
}

class GuardianRecovery {
  const GuardianRecovery({required this.id, required this.requesterName, required this.newDeviceName, required this.status, required this.createdAt, required this.expiresAt, required this.myDecision});
  factory GuardianRecovery.fromJson(Json j) => GuardianRecovery(
        id: j['id']! as String,
        requesterName: (j['requester']! as Json)['displayName']! as String,
        newDeviceName: (j['newDevice']! as Json)['name']! as String,
        status: j['status']! as String,
        createdAt: _date(j['createdAt']),
        expiresAt: _date(j['expiresAt']),
        myDecision: j['myDecision'] as String?,
      );
  final String id;
  final String requesterName;
  final String newDeviceName;
  final String status;
  final DateTime createdAt;
  final DateTime expiresAt;
  final String? myDecision;
}

class GuardianInbox {
  const GuardianInbox(this.requests, this.recoveries);
  final List<GuardianRequest> requests;
  final List<GuardianRecovery> recoveries;
  bool get isEmpty => requests.isEmpty && recoveries.isEmpty;
}

/// Someone I guard, with their protection status (null while my guardian link is not active yet).
class Person {
  const Person({required this.linkId, required this.displayName, required this.handle, required this.status, required this.activatesAt, this.protection});
  factory Person.fromJson(Json j) => Person(
        linkId: j['linkId']! as String,
        displayName: j['displayName']! as String,
        handle: j['handle'] as String? ?? '',
        status: j['status']! as String,
        activatesAt: _dateOrNull(j['activatesAt']),
        protection: j['protection'] == null ? null : Protection.fromJson(j['protection']! as Json),
      );
  final String linkId;
  final String displayName;
  final String handle;
  final String status;
  final DateTime? activatesAt;
  final Protection? protection;

  bool get canAct => status == 'active' || status == 'pending_removal';
}

class Protection {
  const Protection({required this.on, required this.lastSeenAt, required this.pauseId, required this.pausedByGuardian, required this.lastAlertSeverity, required this.lastAlertAt, required this.lastAlertId});
  factory Protection.fromJson(Json j) {
    final pause = j['activePause'] as Json?;
    final alert = j['lastAlert'] as Json?;
    return Protection(
      on: j['on']! as bool,
      lastSeenAt: _dateOrNull(j['lastSeenAt']),
      pauseId: pause?['id'] as String?,
      pausedByGuardian: pause?['byGuardian'] as bool? ?? false,
      lastAlertSeverity: alert?['severity'] as String?,
      lastAlertAt: _dateOrNull(alert?['occurredAt']),
      lastAlertId: alert?['id'] as String?,
    );
  }
  final bool on;
  final DateTime? lastSeenAt;
  final String? pauseId;
  final bool pausedByGuardian;
  final String? lastAlertSeverity;
  final DateTime? lastAlertAt;
  final String? lastAlertId;

  bool get paused => pauseId != null;
}

class RecoveryStart {
  const RecoveryStart(this.recoveryId, this.pollToken);
  final String recoveryId;
  final String pollToken;
}

class RecoveryStatus {
  const RecoveryStatus(this.status, this.approvals, this.completesAt);
  factory RecoveryStatus.fromJson(Json j) => RecoveryStatus(j['status']! as String, (j['approvals']! as num).toInt(), _dateOrNull(j['completesAt']));
  final String status;
  final int approvals;
  final DateTime? completesAt;
}

class ActiveRecovery {
  const ActiveRecovery({required this.id, required this.status, required this.completesAt, required this.newDeviceName});
  factory ActiveRecovery.fromJson(Json j) => ActiveRecovery(
        id: j['id']! as String,
        status: j['status']! as String,
        completesAt: _dateOrNull(j['completesAt']),
        newDeviceName: (j['newDevice']! as Json)['name']! as String,
      );
  final String id;
  final String status;
  final DateTime? completesAt;
  final String newDeviceName;
}

class SignalsConfig {
  const SignalsConfig({required this.remoteAccessPackages, required this.streamInterval, required this.integrityEnabled, required this.cloudProjectNumber, required this.consentVersion});
  factory SignalsConfig.fromJson(Json j) {
    final integrity = j['integrity']! as Json;
    return SignalsConfig(
      remoteAccessPackages: (j['remoteAccessPackages']! as List<Object?>).cast<String>(),
      streamInterval: Duration(seconds: (j['streamIntervalSeconds']! as num).toInt()),
      integrityEnabled: integrity['enabled']! as bool,
      cloudProjectNumber: integrity['cloudProjectNumber']! as String,
      consentVersion: j['consentVersion']! as String,
    );
  }
  final List<String> remoteAccessPackages;
  final Duration streamInterval;
  final bool integrityEnabled;
  final String cloudProjectNumber;
  final String consentVersion;
}

class ConsentState {
  const ConsentState(this.granted, this.currentVersion);
  final bool granted;
  final String currentVersion;
}

// ----------------------------------------------------------------------------- family protection

class MonitorStatus {
  const MonitorStatus({required this.consented, required this.consentVersion, required this.enabledOnThisPhone, required this.guardians, required this.eventsLast24h, required this.activePauseId});
  factory MonitorStatus.fromJson(Json j) => MonitorStatus(
        consented: j['consented']! as bool,
        consentVersion: j['consentVersion']! as String,
        enabledOnThisPhone: j['enabledOnThisPhone']! as bool,
        guardians: (j['guardians']! as num).toInt(),
        eventsLast24h: (j['eventsLast24h']! as num).toInt(),
        activePauseId: (j['activePause'] as Json?)?['id'] as String?,
      );
  final bool consented;
  final String consentVersion;
  final bool enabledOnThisPhone;
  final int guardians;
  final int eventsLast24h;
  final String? activePauseId;
}

class GuardianAlert {
  const GuardianAlert({
    required this.id,
    required this.personName,
    this.personLinkId,
    required this.kind,
    required this.appCategory,
    required this.appPackage,
    required this.amountBucket,
    required this.severity,
    required this.score,
    required this.reasons,
    required this.occurredAt,
    required this.acknowledged,
    required this.pauseId,
    required this.pauseStatus,
  });
  factory GuardianAlert.fromJson(Json j) {
    final app = j['app'] as Json?;
    final pause = j['pause'] as Json?;
    return GuardianAlert(
      id: j['id']! as String,
      personName: (j['person']! as Json)['displayName']! as String,
      personLinkId: (j['person']! as Json)['linkId'] as String?,
      kind: j['kind']! as String,
      appCategory: app?['category'] as String?,
      appPackage: app?['package'] as String?,
      amountBucket: j['amountBucket'] as String?,
      severity: j['severity']! as String,
      score: (j['score']! as num).toInt(),
      reasons: _list(j['reasons']).map(Reason.fromJson).toList(),
      occurredAt: _date(j['occurredAt']),
      acknowledged: j['acknowledged']! as bool,
      pauseId: pause?['id'] as String?,
      pauseStatus: pause?['status'] as String?,
    );
  }
  final String id;
  final String personName;
  final String? personLinkId;
  final String kind;
  final String? appCategory;
  final String? appPackage;
  final String? amountBucket;
  final String severity;
  final int score;
  final List<Reason> reasons;
  final DateTime occurredAt;
  final bool acknowledged;
  final String? pauseId;
  final String? pauseStatus;

  bool get critical => severity == 'critical';
  bool get pauseActive => pauseStatus == 'active';
}

/// One of my own recent warnings (the protected person sees what their guardians see).
class MyAlert {
  const MyAlert({required this.id, required this.kind, required this.severity, required this.reasons, required this.occurredAt, required this.paused});
  factory MyAlert.fromJson(Json j) => MyAlert(
        id: j['id']! as String,
        kind: j['kind']! as String,
        severity: j['severity']! as String,
        reasons: _list(j['reasons']).map(Reason.fromJson).toList(),
        occurredAt: _date(j['occurredAt']),
        paused: j['paused']! as bool,
      );
  final String id;
  final String kind;
  final String severity;
  final List<Reason> reasons;
  final DateTime occurredAt;
  final bool paused;

  bool get critical => severity == 'critical';
}

/// A safety pause as the guardian sees it (from "asking to continue").
class PauseView {
  const PauseView({required this.id, required this.status, required this.byGuardian, required this.personName, required this.reasons, required this.expiresAt});
  factory PauseView.fromJson(Json j) => PauseView(
        id: j['id']! as String,
        status: j['status']! as String,
        byGuardian: j['byGuardian']! as bool,
        personName: (j['person']! as Json)['displayName']! as String,
        reasons: _list(j['reasons']).map(Reason.fromJson).toList(),
        expiresAt: _date(j['expiresAt']),
      );
  final String id;
  final String status;
  final bool byGuardian;
  final String personName;
  final List<Reason> reasons;
  final DateTime expiresAt;

  bool get active => status == 'active';
}
