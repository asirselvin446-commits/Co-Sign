import 'dart:async';
import 'dart:convert';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

const _channel = AndroidNotificationChannel(
  'cosign_alerts',
  'Co-Sign alerts',
  description: 'Guardian requests, safety pauses and account alerts',
  importance: Importance.max,
);

final _local = FlutterLocalNotificationsPlugin();

/// Where a notification should take the person, from its data payload and (if they pressed one)
/// the notification button. Buttons are one-tap: Approve/Deny open the passkey prompt straight
/// away, "Pause their phone" and "Let them continue" act as soon as the screen opens.
String? routeForPush(Map<String, Object?> data, {String? actionId}) {
  final screen = data['screen'];
  final requestId = data['requestId'];
  final recoveryId = data['recoveryId'];
  final alertId = data['alertId'];
  final pauseId = data['pauseId'];
  final linkId = data['linkId'];
  final signinId = data['signinId'];
  if ((actionId == 'fill' || actionId == 'deny') && signinId is String) return '/guardian/signin/$signinId?act=$actionId';
  if (actionId == 'release' && pauseId is String) return '/guardian/pause/$pauseId?act=release';
  if (actionId == 'pause' && linkId is String) return '/guardian/person/$linkId?act=pause';
  return switch (screen) {
    'guardian_request' when requestId is String && (actionId == 'approve' || actionId == 'deny') => '/guardian/request/$requestId?act=$actionId',
    'guardian_request' when requestId is String => '/guardian/request/$requestId',
    'guardian_recovery' when recoveryId is String => '/guardian/recovery/$recoveryId',
    'guardian_alert' when alertId is String => '/guardian/alerts/$alertId',
    'guardian_pause' when pauseId is String => '/guardian/pause/$pauseId',
    'guardian_signin' when signinId is String => '/guardian/signin/$signinId',
    'guardian_person' when linkId is String => '/guardian/person/$linkId',
    'family' => '/home?tab=family',
    'stepup' when requestId is String => '/stepup/$requestId',
    'recovery_alert' => '/home',
    'guardians' => '/guardians',
    'devices' => '/devices',
    _ => null,
  };
}

/// The buttons the server asked for, e.g. [("approve", "Approve"), ("deny", "Deny")].
List<(String, String)> pushActions(Map<String, Object?> data) {
  final raw = data['actions'];
  if (raw is! String || raw.isEmpty) return const [];
  try {
    return (jsonDecode(raw) as List<Object?>)
        .whereType<Map<Object?, Object?>>()
        .map((a) => (a['id'], a['label']))
        .where((a) => a.$1 is String && a.$2 is String)
        .map((a) => (a.$1! as String, a.$2! as String))
        .toList();
  } on FormatException {
    return const [];
  }
}

Future<void> _showLocal(RemoteMessage m) async {
  final data = m.data;
  final title = data['title'] as String? ?? m.notification?.title;
  final body = data['body'] as String? ?? m.notification?.body;
  if (title == null) return;
  await _local.show(
    id: m.messageId.hashCode,
    title: title,
    body: body,
    notificationDetails: NotificationDetails(
      android: AndroidNotificationDetails(
        _channel.id,
        _channel.name,
        channelDescription: _channel.description,
        importance: Importance.max,
        priority: Priority.high,
        category: AndroidNotificationCategory.message,
        visibility: NotificationVisibility.private,
        styleInformation: BigTextStyleInformation(body ?? ''),
        // Each button opens the app (unlocking the phone first), so a stranger holding a locked
        // phone cannot approve anything; approvals still need the guardian's passkey.
        actions: [
          for (final (id, label) in pushActions(data)) AndroidNotificationAction(id, label, showsUserInterface: true, cancelNotification: true),
        ],
      ),
      iOS: const DarwinNotificationDetails(),
    ),
    payload: jsonEncode(data),
  );
}

/// Runs in a background isolate when a data message arrives while the app is closed.
@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage message) async {
  try {
    await Firebase.initializeApp();
  } on Object {
    return;
  }
  await _initLocal(null);
  await _showLocal(message);
}

Future<void> _initLocal(void Function(String route)? onOpen) async {
  await _local.initialize(
    settings: const InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      iOS: DarwinInitializationSettings(requestAlertPermission: false, requestBadgePermission: false, requestSoundPermission: false),
    ),
    onDidReceiveNotificationResponse: (r) {
      final payload = r.payload;
      if (payload == null || onOpen == null) return;
      final route = routeForPush((jsonDecode(payload) as Map).cast<String, Object?>(), actionId: r.actionId);
      if (route != null) onOpen(route);
    },
  );
  await _local.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()?.createNotificationChannel(_channel);
}

/// Push notifications. If the build has no Firebase configuration, [available] is false and the
/// app relies on realtime updates while open.
abstract class Push {
  bool get available;
  Future<void> init({required void Function(String route) onOpen, required void Function(Map<String, Object?> data) onForeground});
  Future<String?> token();
  Stream<String> get tokenRefresh;
}

class FirebasePush implements Push {
  bool _available = false;
  @override
  bool get available => _available;

  @override
  Future<void> init({required void Function(String route) onOpen, required void Function(Map<String, Object?> data) onForeground}) async {
    try {
      await Firebase.initializeApp();
    } on Object catch (e) {
      debugPrint('Push disabled: Firebase is not configured for this build ($e)');
      return;
    }
    _available = true;
    FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler);
    await _initLocal(onOpen);
    await FirebaseMessaging.instance.requestPermission(alert: true, badge: true, sound: true);
    FirebaseMessaging.onMessage.listen((m) {
      onForeground(m.data);
      unawaited(_showLocal(m));
    });
    FirebaseMessaging.onMessageOpenedApp.listen((m) {
      final route = routeForPush(m.data);
      if (route != null) onOpen(route);
    });
    final initial = await FirebaseMessaging.instance.getInitialMessage();
    final launch = await _local.getNotificationAppLaunchDetails();
    final route = initial != null
        ? routeForPush(initial.data)
        : launch?.didNotificationLaunchApp == true && launch?.notificationResponse?.payload != null
            ? routeForPush((jsonDecode(launch!.notificationResponse!.payload!) as Map).cast<String, Object?>(), actionId: launch.notificationResponse!.actionId)
            : null;
    if (route != null) onOpen(route);
  }

  @override
  Future<String?> token() async => _available ? FirebaseMessaging.instance.getToken() : null;

  @override
  Stream<String> get tokenRefresh => _available ? FirebaseMessaging.instance.onTokenRefresh : const Stream.empty();
}

class NoPush implements Push {
  @override
  bool get available => false;
  @override
  Future<void> init({required void Function(String route) onOpen, required void Function(Map<String, Object?> data) onForeground}) async {}
  @override
  Future<String?> token() async => null;
  @override
  Stream<String> get tokenRefresh => const Stream.empty();
}
