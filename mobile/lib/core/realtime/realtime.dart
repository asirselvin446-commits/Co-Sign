import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import '../api/models.dart';

class RealtimeEvent {
  const RealtimeEvent(this.name, this.data);
  final String name;
  final Json data;
}

/// Live updates over Socket.io: step-up status, guardian requests, recovery alerts.
/// Falls back silently to polling in the screens when the socket is down.
abstract class Realtime {
  Stream<RealtimeEvent> get events;
  void connect(String Function() token);
  void disconnect();
}

const realtimeEvents = [
  'stepup.updated',
  'guardian.request',
  'guardian.request.closed',
  'guardian.request.live',
  'guardian.recovery',
  'recovery.alert',
  'recovery.updated',
  'guardians.changed',
  'guarding.changed',
  'account.updated',
  'device.added',
  'device.removed',
  'session.revoked',
];

class SocketRealtime implements Realtime {
  SocketRealtime(this.baseUrl);
  final String baseUrl;
  final _controller = StreamController<RealtimeEvent>.broadcast();
  io.Socket? _socket;

  @override
  Stream<RealtimeEvent> get events => _controller.stream;

  @override
  void connect(String Function() token) {
    disconnect();
    final socket = io.io(
      baseUrl,
      io.OptionBuilder()
          .setPath('/socket.io')
          .setTransports(['websocket'])
          .disableAutoConnect()
          .enableReconnection()
          // A fresh token on every (re)connect: access tokens only live 10 minutes.
          .setAuthFn((cb) => cb({'token': token()}))
          .build(),
    );
    for (final name in realtimeEvents) {
      socket.on(name, (data) {
        _controller.add(RealtimeEvent(name, data is Map ? Map<String, Object?>.from(data) : const {}));
      });
    }
    socket.connect();
    _socket = socket;
  }

  @override
  void disconnect() {
    _socket?.dispose();
    _socket = null;
  }
}
