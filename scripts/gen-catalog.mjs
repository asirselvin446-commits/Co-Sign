#!/usr/bin/env node
// Generates typed catalogue code for the backend (TypeScript), the mobile app (Dart) and the
// Android side (Kotlin, string resources) from shared/catalog.json and shared/link-rules.json.
// Run with --check in CI to fail when generated files are stale.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const catalog = JSON.parse(readFileSync(join(root, 'shared/catalog.json'), 'utf8'));
const linkRules = JSON.parse(readFileSync(join(root, 'shared/link-rules.json'), 'utf8'));
const langs = catalog.languages;

function validateLinkRules() {
  const problems = [];
  const domain = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
  for (const [id, b] of Object.entries(linkRules.brands)) {
    if (!/^[a-z0-9]+$/.test(id)) problems.push(`brand id ${id}`);
    if (!b.name || !Array.isArray(b.domains) || b.domains.length === 0) problems.push(`brand ${id}: needs a name and domains`);
    for (const d of b.domains) if (!domain.test(d)) problems.push(`brand ${id}: bad domain ${d}`);
    for (const k of b.keywords) if (!/^[a-z0-9]+$/.test(k)) problems.push(`brand ${id}: bad keyword ${k}`);
  }
  for (const list of ['multiPartSuffixes', 'shorteners']) for (const d of linkRules[list]) if (!domain.test(d)) problems.push(`${list}: bad ${d}`);
  for (const list of ['riskyTlds', 'linkTlds']) for (const t of linkRules[list]) if (!/^[a-z]+$/.test(t)) problems.push(`${list}: bad ${t}`);
  for (const t of linkRules.riskyTlds) if (!linkRules.linkTlds.includes(t)) problems.push(`riskyTlds: ${t} must also be in linkTlds`);
  for (const [kind, phrases] of Object.entries(linkRules.scamPhrases)) {
    if (!/^[a-z_]+$/.test(kind)) problems.push(`scamPhrases kind ${kind}`);
    for (const p of phrases) if (p !== p.toLowerCase() || p.trim() !== p || !p) problems.push(`scamPhrases.${kind}: "${p}" must be lowercase and trimmed`);
  }
  if (problems.length) {
    console.error('link-rules.json is invalid:\n  ' + problems.join('\n  '));
    process.exit(1);
  }
}

/** Kotlin copy of shared/link-rules.json for the phone's link analyser. */
function genKotlinLinkRules() {
  const ks = (s) => JSON.stringify(s).replace(/\$/g, '\\$');
  const list = (xs) => `listOf(${xs.map(ks).join(', ')})`;
  const brands = Object.entries(linkRules.brands)
    .map(([id, b]) => `        Brand(${ks(id)}, ${ks(b.name)}, ${list(b.domains)}, ${list(b.keywords)}),`)
    .join('\n');
  const phrases = Object.entries(linkRules.scamPhrases)
    .map(([kind, ps]) => `        ${ks(kind)} to ${list(ps)},`)
    .join('\n');
  return `// GENERATED FILE. Do not edit by hand.
// Source: shared/link-rules.json. Regenerate with \`pnpm catalog:gen\`.
package app.cosign.mobile.generated

object LinkRulesData {
    data class Brand(val id: String, val name: String, val domains: List<String>, val keywords: List<String>)

    val BRANDS: List<Brand> = listOf(
${brands}
    )
    val MULTI_PART_SUFFIXES: Set<String> = setOf(${linkRules.multiPartSuffixes.map(ks).join(', ')})
    val SHORTENERS: Set<String> = setOf(${linkRules.shorteners.map(ks).join(', ')})
    val RISKY_TLDS: Set<String> = setOf(${linkRules.riskyTlds.map(ks).join(', ')})
    val LINK_TLDS: Set<String> = setOf(${linkRules.linkTlds.map(ks).join(', ')})
    val SCAM_PHRASES: Map<String, List<String>> = linkedMapOf(
${phrases}
    )
}
`;
}

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

/** From shared/link-rules.json: fake-site, risky-link and scam-message rules. */
export const LINK_RULES = ${j({ brands: linkRules.brands, multiPartSuffixes: linkRules.multiPartSuffixes, shorteners: linkRules.shorteners, riskyTlds: linkRules.riskyTlds, linkTlds: linkRules.linkTlds, scamPhrases: linkRules.scamPhrases })} as const;
export type ScamPhraseKind = keyof typeof LINK_RULES.scamPhrases;
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

/** Android string resources for the native pause screen (it runs without Flutter). */
function genAndroidStrings(lang) {
  const esc = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
  const rows = Object.entries(catalog.monitorRules).map(([key, r]) => `    <string name="rule_${key}">${esc(r[lang])}</string>`);
  return `<?xml version="1.0" encoding="utf-8"?>\n<!-- GENERATED from shared/catalog.json by scripts/gen-catalog.mjs. Do not edit. -->\n<resources>\n${rows.join('\n')}\n</resources>\n`;
}

validate();
validateLinkRules();
const androidRes = join(root, 'mobile/android/app/src/main/res');
const outputs = [
  [join(root, 'mobile/android/app/src/main/kotlin/app/cosign/mobile/generated/LinkRulesData.kt'), genKotlinLinkRules()],
  [join(root, 'backend/src/generated/catalog.ts'), genTs()],
  [join(root, 'mobile/lib/generated/catalog.g.dart'), genDart()],
  [join(androidRes, 'values/monitor_rules.xml'), genAndroidStrings('en')],
  [join(androidRes, 'values-ta/monitor_rules.xml'), genAndroidStrings('ta')],
  [join(androidRes, 'values-hi/monitor_rules.xml'), genAndroidStrings('hi')],
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
