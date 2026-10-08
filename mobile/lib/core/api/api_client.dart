import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../../generated/catalog.g.dart';
import '../errors/failure.dart';
import '../session/session_store.dart';
import 'models.dart';

/// HTTP client for the Co-Sign API.
///  - Sends the 10-minute access token and the user's language.
///  - On SESSION_EXPIRED, rotates the device-bound refresh token once and retries.
///  - Turns every failure into an [AppFailure] from the shared catalogue
///    (network problems become NETWORK_ERROR).
class ApiClient {
  ApiClient({
    required this.baseUrl,
    required this._sessions,
    required this.language,
    http.Client? client,
    this.onSessionLost,
    this.timeout = const Duration(seconds: 20),
  }) : _http = client ?? http.Client();

  final String baseUrl;
  final SessionStore _sessions;
  final http.Client _http;
  final String Function() language;
  final Duration timeout;

  /// Called when the refresh token is rejected (revoked phone, reuse detected, recovered account).
  void Function(AppFailure reason)? onSessionLost;

  String? _accessToken;
  Future<bool>? _refreshing;

  String? get accessToken => _accessToken;
  void setAccessToken(String? token) => _accessToken = token;

  Future<Json> get(String path, {Map<String, String>? query}) => _send('GET', path, query: query);
  Future<Json> post(String path, [Object? body, Map<String, String>? headers]) => _send('POST', path, body: body ?? const <String, Object?>{}, headers: headers);
  Future<Json> put(String path, [Object? body]) => _send('PUT', path, body: body ?? const <String, Object?>{});
  Future<Json> patch(String path, [Object? body]) => _send('PATCH', path, body: body ?? const <String, Object?>{});
  Future<Json> delete(String path) => _send('DELETE', path);

  Future<Json> _send(
    String method,
    String path, {
    Object? body,
    Map<String, String>? headers,
    Map<String, String>? query,
    bool retried = false,
  }) async {
    final uri = Uri.parse('$baseUrl$path').replace(queryParameters: query);
    final request = http.Request(method, uri)
      ..headers.addAll({
        'accept': 'application/json',
        'x-cosign-lang': language(),
        if (_accessToken != null) 'authorization': 'Bearer $_accessToken',
        ...?headers,
      });
    if (body != null) {
      request.headers['content-type'] = 'application/json';
      request.body = jsonEncode(body);
    }

    http.Response res;
    try {
      res = await http.Response.fromStream(await _http.send(request).timeout(timeout));
    } on SocketException {
      throw AppFailure(ErrorCodes.NETWORK_ERROR);
    } on TimeoutException {
      throw AppFailure(ErrorCodes.NETWORK_ERROR);
    } on http.ClientException {
      throw AppFailure(ErrorCodes.NETWORK_ERROR);
    } on HandshakeException {
      throw AppFailure(ErrorCodes.NETWORK_ERROR);
    }

    if (res.statusCode == 204) return const {};
    Json decoded;
    try {
      decoded = res.body.isEmpty ? const {} : jsonDecode(utf8.decode(res.bodyBytes)) as Json;
    } on FormatException {
      throw AppFailure(ErrorCodes.INTERNAL_ERROR, status: res.statusCode);
    }
    if (res.statusCode >= 200 && res.statusCode < 300) return decoded;

    final failure = AppFailure.fromServer(decoded, res.statusCode);
    final authFailure = failure.code == ErrorCodes.SESSION_EXPIRED || failure.code == ErrorCodes.DEVICE_REVOKED;
    if (authFailure && !retried && !path.startsWith('/v1/auth/')) {
      if (await refresh()) {
        return _send(method, path, body: body, headers: headers, query: query, retried: true);
      }
    }
    throw failure;
  }

  /// Rotate the refresh token (single flight). Returns false if the session is gone.
  Future<bool> refresh() {
    return _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);
  }

  Future<bool> _doRefresh() async {
    final s = await _sessions.load();
    if (s == null) return false;
    try {
      final res = await _send('POST', '/v1/auth/refresh', body: {'refreshToken': s.refreshToken, 'deviceId': s.deviceId}, retried: true);
      final session = res['session']! as Json;
      _accessToken = session['accessToken']! as String;
      await _sessions.save(s.copyWith(refreshToken: session['refreshToken']! as String));
      return true;
    } on AppFailure catch (f) {
      if (f.code == ErrorCodes.NETWORK_ERROR) rethrow;
      _accessToken = null;
      await _sessions.clear();
      onSessionLost?.call(f);
      return false;
    }
  }

  void close() => _http.close();
}
