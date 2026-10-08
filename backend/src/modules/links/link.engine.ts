import { LINK_RULES, type ScamPhraseKind } from '../../generated/catalog.js';

/**
 * Spots fake sites, risky links and scam messages. The phone runs an identical Kotlin copy
 * (monitor/LinkAnalyzer.kt); both are checked against shared/link-vectors.json.
 *
 * Everything here is deterministic string work: no network lookups, nothing leaves the device or
 * the server.
 */

export type LinkVerdict = 'official' | 'unknown' | 'suspicious' | 'lookalike';
export const LINK_VERDICTS = ['official', 'unknown', 'suspicious', 'lookalike'] as const;
export const LINK_FLAGS = [
  'apk_download',
  'hidden_host',
  'ip_address',
  'lookalike_brand',
  'many_subdomains',
  'punycode',
  'risky_tld',
  'shortener',
  'upi_collect',
] as const;
export type LinkFlag = (typeof LINK_FLAGS)[number];
export const SCAM_PHRASE_KINDS = Object.keys(LINK_RULES.scamPhrases) as [ScamPhraseKind, ...ScamPhraseKind[]];

export interface LinkAnalysis {
  host: string | null;
  registrableDomain: string | null;
  flags: LinkFlag[];
  /** Brand the site is (official) or pretends to be (lookalike). */
  brand: string | null;
  verdict: LinkVerdict;
}

const SUSPICIOUS: ReadonlyArray<LinkFlag> = ['apk_download', 'hidden_host', 'ip_address', 'many_subdomains', 'punycode', 'risky_tld', 'shortener', 'upi_collect'];
const RANK: Record<LinkVerdict, number> = { official: 0, unknown: 1, suspicious: 2, lookalike: 3 };
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const multiPart = new Set<string>(LINK_RULES.multiPartSuffixes);
const shorteners = new Set<string>(LINK_RULES.shorteners);
const riskyTlds = new Set<string>(LINK_RULES.riskyTlds);
const linkTlds = new Set<string>(LINK_RULES.linkTlds);
const brands = Object.entries(LINK_RULES.brands) as Array<[string, { name: string; domains: readonly string[]; keywords: readonly string[] }]>;

/** Optimal string alignment distance (Levenshtein plus adjacent transpositions). */
export function osaDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
    }
  }
  return d[a.length]![b.length]!;
}

/** example.co.in for www.example.co.in, example.com for a.b.example.com. */
export function registrableDomain(host: string): string {
  if (IPV4.test(host)) return host;
  const labels = host.split('.');
  if (labels.length >= 3 && multiPart.has(labels.slice(-2).join('.'))) return labels.slice(-3).join('.');
  return labels.slice(-2).join('.');
}

export function analyzeLink(raw: string): LinkAnalysis {
  const s = raw.trim().toLowerCase();
  if (s.startsWith('upi://')) return { host: null, registrableDomain: null, flags: ['upi_collect'], brand: null, verdict: 'suspicious' };
  const rest = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  let end = rest.length;
  for (const c of ['/', '?', '#']) {
    const i = rest.indexOf(c);
    if (i >= 0 && i < end) end = i;
  }
  let authority = rest.slice(0, end);
  const path = rest.slice(end);
  const flags = new Set<LinkFlag>();
  if (authority.includes('@')) {
    flags.add('hidden_host');
    authority = authority.slice(authority.lastIndexOf('@') + 1);
  }
  const host = authority.replace(/:\d+$/, '').replace(/\.$/, '');
  if (!host) return { host: null, registrableDomain: null, flags: [...flags].sort(), brand: null, verdict: flags.size ? 'suspicious' : 'unknown' };
  const labels = host.split('.');
  const reg = registrableDomain(host);
  if (IPV4.test(host)) {
    flags.add('ip_address');
  } else {
    if (labels.some((l) => l.startsWith('xn--'))) flags.add('punycode');
    if (riskyTlds.has(labels[labels.length - 1]!)) flags.add('risky_tld');
    if (shorteners.has(reg) || shorteners.has(host)) flags.add('shortener');
    if (labels.length - reg.split('.').length >= 3) flags.add('many_subdomains');
  }
  const pathOnly = path.split(/[?#]/)[0]!;
  if (pathOnly.endsWith('.apk')) flags.add('apk_download');

  let brand: string | null = null;
  let official = false;
  if (!flags.has('ip_address')) {
    for (const [id, b] of brands) {
      if (b.domains.some((d) => host === d || host.endsWith(`.${d}`))) {
        brand = id;
        official = true;
        break;
      }
    }
  }
  if (!official && !flags.has('ip_address')) {
    const tokens = host.split(/[.-]/);
    const sld = reg.split('.')[0]!;
    for (const [id, b] of brands) {
      const keywordHit = tokens.some((t) => b.keywords.some((k) => t === k || (k.length >= 4 && t.startsWith(k) && /^\d+$/.test(t.slice(k.length)))));
      const nearMiss = b.domains.some((d) => {
        const dsld = d.split('.')[0]!;
        return dsld.length >= 5 && sld.length >= 5 && sld !== dsld && osaDistance(sld, dsld) === 1;
      });
      if (keywordHit || nearMiss) {
        flags.add('lookalike_brand');
        brand = id;
        break;
      }
    }
  }
  const sorted = [...flags].sort();
  const verdict: LinkVerdict = official ? 'official' : flags.has('lookalike_brand') ? 'lookalike' : sorted.some((f) => SUSPICIOUS.includes(f)) ? 'suspicious' : 'unknown';
  return { host, registrableDomain: reg, flags: sorted, brand, verdict };
}

const LEADING = new Set(['(', '[', '{', '<', '"', "'", '“', '‘']);
const TRAILING = new Set(['.', ',', ';', ':', '!', '?', ')', ']', '}', '>', '"', "'", '”', '’']);
const BARE = /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/;

/** Links in a message: http(s)://, www., upi:// or bare domains with a known ending. */
export function extractLinks(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().split(/\s+/)) {
    let t = raw;
    while (t.length > 0 && LEADING.has(t[0]!)) t = t.slice(1);
    while (t.length > 0 && TRAILING.has(t[t.length - 1]!)) t = t.slice(0, -1);
    if (!t) continue;
    if (t.startsWith('http://') || t.startsWith('https://') || t.startsWith('www.') || t.startsWith('upi://')) {
      out.push(t);
    } else if (BARE.test(t)) {
      const host = t.split('/')[0]!;
      const tld = host.slice(host.lastIndexOf('.') + 1);
      if (linkTlds.has(tld)) out.push(t);
    }
  }
  return out;
}

/** Wording that is a scam on its own, link or not (prizes, police threats, asking for a code). */
const STANDALONE: ReadonlyArray<string> = ['police_threat', 'prize_lottery', 'share_code'];

const isWordChar =(c: string | undefined) => c !== undefined && /[a-z0-9]/.test(c);

/** Phrase present as a whole word or words (ASCII boundaries); other scripts match as substrings. */
export function hasPhrase(text: string, phrase: string): boolean {
  const ascii = /^[\x20-\x7e]+$/.test(phrase);
  let from = 0;
  for (;;) {
    const i = text.indexOf(phrase, from);
    if (i < 0) return false;
    if (!ascii || (!isWordChar(text[i - 1]) && !isWordChar(text[i + phrase.length]))) return true;
    from = i + 1;
  }
}

export interface MessageAnalysis {
  /** Scam phrase kinds found, sorted. */
  phrases: ScamPhraseKind[];
  links: LinkAnalysis[];
  /** The most worrying link, if any. */
  worst: LinkAnalysis | null;
  /** All flags across the links, sorted. */
  linkFlags: LinkFlag[];
  scam: boolean;
}

export function analyzeMessage(text: string): MessageAnalysis {
  const lower = text.toLowerCase();
  const phrases = SCAM_PHRASE_KINDS.filter((kind) => LINK_RULES.scamPhrases[kind].some((p) => hasPhrase(lower, p))).sort();
  const links = extractLinks(text).map(analyzeLink);
  let worst: LinkAnalysis | null = null;
  for (const l of links) if (!worst || RANK[l.verdict] > RANK[worst.verdict]) worst = l;
  const linkFlags = [...new Set(links.flatMap((l) => l.flags))].sort();
  const strong = phrases.filter((p) => p !== 'urgent_action');
  const urgent = phrases.includes('urgent_action');
  const nonOfficial = links.some((l) => l.verdict !== 'official');
  const scam =
    worst?.verdict === 'lookalike' ||
    linkFlags.includes('apk_download') ||
    phrases.some((p) => STANDALONE.includes(p)) ||
    (strong.length >= 1 && (nonOfficial || urgent)) ||
    strong.length >= 2 ||
    (linkFlags.includes('upi_collect') && phrases.length >= 1);
  return { phrases, links, worst, linkFlags, scam };
}
