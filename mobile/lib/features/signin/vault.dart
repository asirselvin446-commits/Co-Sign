import 'dart:convert';
import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/models.dart';
import '../../core/providers.dart';
import '../../core/session/session_store.dart';

/// A sign-in a guardian keeps for someone they guard. Stored only on the guardian's phone, in the
/// Android Keystore-backed secure storage; it is sent to the person's phone only sealed to that
/// phone's one-time key, and never to Co-Sign's server in readable form.
class SavedSignin {
  const SavedSignin({required this.id, required this.label, required this.packages, required this.domains, required this.username, required this.password});
  factory SavedSignin.fromJson(Json j) => SavedSignin(
        id: j['id']! as String,
        label: j['label']! as String,
        packages: (j['packages'] as List<Object?>? ?? const []).cast<String>(),
        domains: (j['domains'] as List<Object?>? ?? const []).cast<String>(),
        username: j['username'] as String? ?? '',
        password: j['password']! as String,
      );
  final String id;
  final String label;

  /// Apps this sign-in is for (package names).
  final List<String> packages;

  /// Websites this sign-in is for (registrable domains, e.g. onlinesbi.sbi).
  final List<String> domains;
  final String username;
  final String password;

  Json toJson() => {'id': id, 'label': label, 'packages': packages, 'domains': domains, 'username': username, 'password': password};

  /// Not yet tied to an app or website (added by hand).
  bool get unbound => packages.isEmpty && domains.isEmpty;

  /// Only the exact app, or the exact website, it was saved for. A browser request matches by
  /// website, never by the browser's own package, so a fake site in the same browser never matches.
  bool matches(SigninTarget t) => t.isWebsite ? (t.domain != null && domains.contains(t.domain)) : (t.package != null && packages.contains(t.package));

  /// Tied to something else: never offered for this request.
  bool conflicts(SigninTarget t) => !unbound && !matches(t);

  SavedSignin boundTo(SigninTarget t) => SavedSignin(
        id: id,
        label: label,
        packages: {...packages, if (!t.isWebsite && t.package != null) t.package!}.toList(),
        domains: {...domains, if (t.isWebsite && t.domain != null) t.domain!}.toList(),
        username: username,
        password: password,
      );
}

class SigninVault {
  SigninVault(this._store);
  final SecretStore _store;

  static String _key(String linkId) => 'cosign.vault.v1.$linkId';

  Future<List<SavedSignin>> list(String linkId) async {
    final raw = await _store.read(_key(linkId));
    if (raw == null) return const [];
    return (jsonDecode(raw) as List<Object?>).cast<Json>().map(SavedSignin.fromJson).toList();
  }

  Future<void> _write(String linkId, List<SavedSignin> all) => _store.write(_key(linkId), jsonEncode([for (final s in all) s.toJson()]));

  Future<void> save(String linkId, SavedSignin entry) async {
    final all = [...await list(linkId)]..removeWhere((e) => e.id == entry.id);
    await _write(linkId, [...all, entry]);
  }

  Future<void> delete(String linkId, String id) async => _write(linkId, [...await list(linkId)]..removeWhere((e) => e.id == id));

  static String newId() {
    final r = Random.secure();
    return List.generate(12, (_) => r.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
  }
}

final vaultProvider = Provider<SigninVault>((ref) => SigninVault(ref.watch(secretStoreProvider)));
final savedSigninsProvider = FutureProvider.autoDispose.family<List<SavedSignin>, String>((ref, linkId) => ref.watch(vaultProvider).list(linkId));
