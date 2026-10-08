#!/usr/bin/env node
// Generates typed catalogue code for the backend (TypeScript) and the mobile app (Dart)
// from shared/catalog.json. Run with --check in CI to fail when generated files are stale.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const catalog = JSON.parse(readFileSync(join(root, 'shared/catalog.json'), 'utf8'));
const langs = catalog.languages;

function validate() {
  const problems = [];
  for (const [code, e] of Object.entries(catalog.errors)) {
    if (!/^[A-Z][A-Z0-9_]+$/.test(code)) problems.push(`bad error code ${code}`);
    if (!['public', 'detailed'].includes(e.tier)) problems.push(`${code}: tier must be public|detailed`);
    if (e.tier === 'detailed' && !catalog.errors[e.generic]) problems.push(`${code}: detailed error needs an existing generic fallback`);
    if (e.generic && catalog.errors[e.generic]?.tier !== 'public') problems.push(`${code}: generic fallback must be public`);
    for (const l of langs) {
      if (!e[l]?.cause || !e[l]?.next) problems.push(`${code}: missing ${l} cause/next`);
      for (const p of e.params ?? []) {
        const text = `${e[l]?.cause} ${e[l]?.next}`;
        if (!text.includes(`{${p}}`)) problems.push(`${code}: ${l} text does not use {${p}}`);
      }
    }
  }
  for (const [key, r] of Object.entries(catalog.riskRules)) {
    if (!Number.isInteger(r.weight)) problems.push(`rule ${key}: weight must be an integer`);
    for (const l of langs) if (!r[l]) problems.push(`rule ${key}: missing ${l} reason`);
  }
  for (const [key, r] of Object.entries(catalog.monitorRules)) {
    if (!Number.isInteger(r.weight)) problems.push(`monitor rule ${key}: weight must be an integer`);
    for (const l of langs) if (!r[l]) problems.push(`monitor rule ${key}: missing ${l} reason`);
  }
  for (const section of ['actions', 'terms']) {
    for (const [key, t] of Object.entries(catalog[section])) {
      for (const l of langs) if (!t[l]) problems.push(`${section}.${key}: missing ${l}`);
    }
  }
  for (const [key, n] of Object.entries(catalog.notifications)) {
    for (const l of langs) if (!n[l]?.title || !n[l]?.body) problems.push(`notifications.${key}: missing ${l}`);
  }
  if (problems.length) {
    console.error('catalog.json is invalid:\n  ' + problems.join('\n  '));
    process.exit(1);
  }
}

const header = '// GENERATED FILE. Do not edit by hand.\n// Source: shared/catalog.json. Regenerate with `pnpm catalog:gen`.\n';

function genTs() {
  const errors = {};
  for (const [code, e] of Object.entries(catalog.errors)) {
    errors[code] = {
      http: e.http,
      tier: e.tier,
      generic: e.generic ?? null,
      origin: e.origin,
      params: e.params ?? [],
      text: Object.fromEntries(langs.map((l) => [l, e[l]])),
    };
  }
  const rules = {};
  for (const [key, r] of Object.entries(catalog.riskRules)) {
    rules[key] = { weight: r.weight, reasons: Object.fromEntries(langs.map((l) => [l, r[l]])) };
  }
  const monitor = {};
  for (const [key, r] of Object.entries(catalog.monitorRules)) {
    monitor[key] = { weight: r.weight, reasons: Object.fromEntries(langs.map((l) => [l, r[l]])) };
  }
  const j = (v) => JSON.stringify(v, null, 2);
  return `${header}
export const LANGUAGES = ${JSON.stringify(langs)} as const;
export type Lang = (typeof LANGUAGES)[number];

export interface ErrorText { cause: string; next: string }
export interface ErrorEntry {
  http: number;
  tier: 'public' | 'detailed';
  generic: string | null;
  origin: 'client' | 'server' | 'both';
  params: readonly string[];
  text: Record<Lang, ErrorText>;
}

export const ERROR_CATALOG = ${j(errors)} as const satisfies Record<string, ErrorEntry>;
export type ErrorCode = keyof typeof ERROR_CATALOG;

export const RISK_RULE_DEFAULTS = ${j(rules)} as const;
export type RiskRuleKey = keyof typeof RISK_RULE_DEFAULTS;

export const MONITOR_RULES = ${j(monitor)} as const;
export type MonitorRuleKey = keyof typeof MONITOR_RULES;

export const ACTION_LABELS = ${j(catalog.actions)} as const;
export type ActionKey = keyof typeof ACTION_LABELS;

export const NOTIFICATIONS = ${j(catalog.notifications)} as const;
export type NotificationKey = keyof typeof NOTIFICATIONS;

export const TERMS = ${j(catalog.terms)} as const;
`;
}

const dartStr = (s) => JSON.stringify(s).replace(/\$/g, '\\$');

function dartLangMap(obj, valueFn) {
  return `{${langs.map((l) => `'${l}': ${valueFn(obj[l])}`).join(', ')}}`;
}

function genDart() {
  const lines = [];
  lines.push(header.replace(/\/\//g, '//'));
  lines.push('// ignore_for_file: lines_longer_than_80_chars, constant_identifier_names\n');
  lines.push(`const List<String> kCatalogLanguages = <String>[${langs.map((l) => `'${l}'`).join(', ')}];\n`);
  lines.push(`class ErrorText {
  const ErrorText(this.cause, this.next);
  final String cause;
  final String next;
}

class ErrorEntry {
  const ErrorEntry({
    required this.code,
    required this.http,
    required this.tier,
    required this.generic,
    required this.origin,
    required this.params,
    required this.text,
  });
  final String code;
  final int http;
  final String tier;
  final String? generic;
  final String origin;
  final List<String> params;
  final Map<String, ErrorText> text;
}

class ErrorCodes {
  ErrorCodes._();
${Object.keys(catalog.errors).map((c) => `  static const String ${c} = '${c}';`).join('\n')}
}
`);
  lines.push('const Map<String, ErrorEntry> kErrorCatalog = <String, ErrorEntry>{');
  for (const [code, e] of Object.entries(catalog.errors)) {
    lines.push(`  '${code}': ErrorEntry(
    code: '${code}',
    http: ${e.http},
    tier: '${e.tier}',
    generic: ${e.generic ? `'${e.generic}'` : 'null'},
    origin: '${e.origin}',
    params: <String>[${(e.params ?? []).map((p) => `'${p}'`).join(', ')}],
    text: <String, ErrorText>{
${langs.map((l) => `      '${l}': ErrorText(${dartStr(e[l].cause)}, ${dartStr(e[l].next)}),`).join('\n')}
    },
  ),`);
  }
  lines.push('};\n');
  lines.push('const Map<String, Map<String, String>> kRiskReasons = <String, Map<String, String>>{');
  for (const [key, r] of Object.entries(catalog.riskRules)) {
    lines.push(`  '${key}': <String, String>${dartLangMap(r, dartStr)},`);
  }
  lines.push('};\n');
  lines.push('/// Monitoring rules: weight and reason per language. Must match the backend engine.');
  lines.push('const Map<String, int> kMonitorWeights = <String, int>{');
  for (const [key, r] of Object.entries(catalog.monitorRules)) lines.push(`  '${key}': ${r.weight},`);
  lines.push('};\n');
  lines.push('const Map<String, Map<String, String>> kMonitorReasons = <String, Map<String, String>>{');
  for (const [key, r] of Object.entries(catalog.monitorRules)) {
    lines.push(`  '${key}': <String, String>${dartLangMap(r, dartStr)},`);
  }
  lines.push('};\n');
  lines.push('const Map<String, Map<String, String>> kActionLabels = <String, Map<String, String>>{');
  for (const [key, a] of Object.entries(catalog.actions)) {
    lines.push(`  '${key}': <String, String>${dartLangMap(a, dartStr)},`);
  }
  lines.push('};');
  return lines.join('\n') + '\n';
}

validate();
const outputs = [
  [join(root, 'backend/src/generated/catalog.ts'), genTs()],
  [join(root, 'mobile/lib/generated/catalog.g.dart'), genDart()],
];
let stale = false;
for (const [file, content] of outputs) {
  if (check) {
    const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
    if (current !== content) {
      console.error(`stale generated file: ${file}`);
      stale = true;
    }
  } else {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
    console.log(`wrote ${file}`);
  }
}
if (stale) {
  console.error('Run `pnpm catalog:gen` and commit the result.');
  process.exit(1);
}
