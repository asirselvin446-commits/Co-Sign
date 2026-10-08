import 'package:intl/intl.dart';

import '../../generated/catalog.g.dart';

/// Every failure the app shows is one of the shared catalogue codes (backend and app use the
/// same list), plus parameters such as the exact wait time.
class AppFailure implements Exception {
  AppFailure(this.code, {this.params = const {}, this.extra = const {}, this.status});

  /// Builds a failure from the backend's error body: `{error: {code, params, ...}}`.
  factory AppFailure.fromServer(Map<String, Object?> body, int status) {
    final error = body['error'];
    if (error is! Map<String, Object?>) return AppFailure(ErrorCodes.INTERNAL_ERROR, status: status);
    final code = error['code'];
    final known = code is String && kErrorCatalog.containsKey(code) ? code : ErrorCodes.INTERNAL_ERROR;
    final rawParams = error['params'];
    return AppFailure(
      known,
      params: rawParams is Map<String, Object?> ? rawParams : const {},
      extra: Map<String, Object?>.from(error)..removeWhere((k, _) => const {'code', 'cause', 'next', 'lang', 'params'}.contains(k)),
      status: status,
    );
  }

  final String code;
  final Map<String, Object?> params;
  final Map<String, Object?> extra;
  final int? status;

  int? get retryAfterSeconds => (extra['retryAfterSeconds'] as num?)?.toInt();
  String? get convertedCode => extra['converted'] as String?;
  String? get until => extra['until'] as String?;

  @override
  String toString() => 'AppFailure($code)';
}

/// A failure worded for a person: one cause, one next step.
class Explained {
  const Explained(this.code, this.cause, this.next);
  final String code;
  final String cause;
  final String next;

  /// What text-to-speech reads.
  String get spoken => '$cause $next';
}

const _units = {
  'en': {'s': ['second', 'seconds'], 'm': ['minute', 'minutes'], 'h': ['hour', 'hours']},
  'ta': {'s': ['வினாடி', 'வினாடிகள்'], 'm': ['நிமிடம்', 'நிமிடங்கள்'], 'h': ['மணி நேரம்', 'மணி நேரம்']},
  'hi': {'s': ['सेकंड', 'सेकंड'], 'm': ['मिनट', 'मिनट'], 'h': ['घंटा', 'घंटे']},
};

/// "2 minutes" / "2 நிமிடங்கள்" / "2 मिनट". Rounds up, never tells someone to wait too little.
String formatWait(int seconds, String lang) {
  final u = _units[lang] ?? _units['en']!;
  final s = seconds < 1 ? 1 : seconds;
  String pick(int n, List<String> pair) => '$n ${n == 1 ? pair[0] : pair[1]}';
  if (s < 60) return pick(s, u['s']!);
  if (s < 3600) return pick((s / 60).ceil(), u['m']!);
  return pick((s / 3600).ceil(), u['h']!);
}

String formatClock(DateTime t, String lang) => DateFormat.jm(_intlLocale(lang)).format(t.toLocal());

String _intlLocale(String lang) => switch (lang) {
      'ta' => 'ta_IN',
      'hi' => 'hi_IN',
      _ => 'en_IN',
    };

/// Turn a failure into catalogue text in [lang]. Placeholders such as {wait} and {until} are
/// filled from the failure; anything unknown falls back to the generic internal error.
Explained explain(AppFailure f, String lang) {
  final entry = kErrorCatalog[f.code] ?? kErrorCatalog[ErrorCodes.INTERNAL_ERROR]!;
  final text = entry.text[lang] ?? entry.text['en']!;
  final values = <String, String>{
    for (final e in f.params.entries) e.key: '${e.value}',
  };
  final retry = f.retryAfterSeconds;
  if (retry != null) values['wait'] = formatWait(retry, lang);
  final until = f.until;
  if (until != null) {
    final t = DateTime.tryParse(until);
    if (t != null) values['until'] = formatClock(t, lang);
  }
  String fill(String s) => s.replaceAllMapped(RegExp(r'\{(\w+)\}'), (m) => values[m.group(1)] ?? '');
  return Explained(entry.code, fill(text.cause), fill(text.next));
}

// ----------------------------------------------------------------------------- digits

final _tamilDigits = RegExp('[௦-௯]');
final _devanagariDigits = RegExp('[०-९]');

bool hasNonAsciiDigits(String s) => _tamilDigits.hasMatch(s) || _devanagariDigits.hasMatch(s);

/// ௧௨௩ / १२३ → 123. Other characters are kept.
String toAsciiDigits(String s) => s
    .replaceAllMapped(_tamilDigits, (m) => '${m[0]!.codeUnitAt(0) - 0x0BE6}')
    .replaceAllMapped(_devanagariDigits, (m) => '${m[0]!.codeUnitAt(0) - 0x0966}');
