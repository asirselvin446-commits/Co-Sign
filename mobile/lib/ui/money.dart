import 'package:intl/intl.dart';

import '../core/errors/failure.dart';

String _locale(String lang) => switch (lang) { 'ta' => 'ta_IN', 'hi' => 'hi_IN', _ => 'en_IN' };

/// Minor units (1/100) to "12,34,567.89 XTS" using Indian digit grouping. No floating point.
String formatMoney(BigInt minor, String currency, String lang) {
  final negative = minor.isNegative;
  final abs = minor.abs();
  final whole = (abs ~/ BigInt.from(100)).toInt();
  final cents = (abs % BigInt.from(100)).toInt().toString().padLeft(2, '0');
  final grouped = NumberFormat.decimalPattern(_locale(lang)).format(whole);
  return '${negative ? '-' : ''}$grouped.$cents $currency';
}

/// Parse what a person typed ("250", "250.5", "1,000.00", Tamil or Devanagari digits) into minor
/// units. Returns null for anything that is not a positive amount with at most two decimals.
BigInt? parseAmount(String input) {
  final cleaned = toAsciiDigits(input).replaceAll(',', '').replaceAll(' ', '').trim();
  final m = RegExp(r'^(\d{1,13})(?:\.(\d{1,2}))?$').firstMatch(cleaned);
  if (m == null) return null;
  final whole = BigInt.parse(m.group(1)!);
  final frac = BigInt.parse((m.group(2) ?? '0').padRight(2, '0'));
  final value = whole * BigInt.from(100) + frac;
  return value > BigInt.zero ? value : null;
}
