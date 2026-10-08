import { ERROR_CATALOG, LANGUAGES, type ErrorCode, type Lang } from '../generated/catalog.js';

export type ErrorParams = Record<string, string | number>;

/** A failure the user should see. The code is resolved against the shared catalogue at response time. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly params: ErrorParams = {},
    readonly extra: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = 'AppError';
  }

  get http(): number {
    return ERROR_CATALOG[this.code].http;
  }

  /** Lets Fastify plugins (e.g. the rate limiter) read the HTTP status like any Fastify error. */
  get statusCode(): number {
    return this.http;
  }
}

export interface ErrorBody {
  error: {
    code: ErrorCode;
    cause: string;
    next: string;
    lang: Lang;
    params: ErrorParams;
  } & Record<string, unknown>;
}

const units: Record<Lang, { s: [string, string]; m: [string, string]; h: [string, string] }> = {
  en: { s: ['second', 'seconds'], m: ['minute', 'minutes'], h: ['hour', 'hours'] },
  ta: { s: ['வினாடி', 'வினாடிகள்'], m: ['நிமிடம்', 'நிமிடங்கள்'], h: ['மணி நேரம்', 'மணி நேரம்'] },
  hi: { s: ['सेकंड', 'सेकंड'], m: ['मिनट', 'मिनट'], h: ['घंटा', 'घंटे'] },
};

/** "2 minutes" / "2 நிமிடங்கள்" / "2 मिनट". Rounds up so we never tell people to wait less than needed. */
export function formatDuration(totalSeconds: number, lang: Lang): string {
  const s = Math.max(1, Math.ceil(totalSeconds));
  const u = units[lang];
  const pick = (n: number, pair: [string, string]) => `${n} ${n === 1 ? pair[0] : pair[1]}`;
  if (s < 60) return pick(s, u.s);
  if (s < 3600) return pick(Math.ceil(s / 60), u.m);
  return pick(Math.ceil(s / 3600), u.h);
}

export function pickLang(...candidates: Array<string | null | undefined>): Lang {
  for (const c of candidates) {
    if (!c) continue;
    for (const part of c.split(',')) {
      const tag = part.split(';')[0]!.trim().toLowerCase().slice(0, 2);
      if ((LANGUAGES as readonly string[]).includes(tag)) return tag as Lang;
    }
  }
  return 'en';
}

function fill(template: string, params: ErrorParams): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
}

/**
 * Render an error for a client. Detailed errors are only shown to enrolled, authenticated devices;
 * everyone else gets the catalogue's generic fallback so failures never leak account state.
 */
const intlLocale: Record<Lang, string> = { en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN' };

export function formatClock(iso: string, lang: Lang, timeZone: string): string {
  return new Intl.DateTimeFormat(intlLocale[lang], { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(iso));
}

export function renderError(
  err: AppError,
  lang: Lang,
  trustedDevice: boolean,
  timeZone = 'Asia/Kolkata',
): { status: number; body: ErrorBody } {
  let code = err.code;
  let params: ErrorParams = { ...err.params };
  let extra = err.extra;
  if (typeof extra.retryAfterSeconds === 'number' && params.wait === undefined) {
    params.wait = formatDuration(extra.retryAfterSeconds, lang);
  }
  if (typeof extra.until === 'string' && params.until === undefined) {
    params.until = formatClock(extra.until, lang, timeZone);
  }
  const entry = ERROR_CATALOG[code];
  if (entry.tier === 'detailed' && !trustedDevice && entry.generic) {
    code = entry.generic as ErrorCode;
    params = {};
    extra = {};
  }
  const resolved = ERROR_CATALOG[code];
  const text = resolved.text[lang];
  return {
    status: resolved.http,
    body: {
      error: { code, cause: fill(text.cause, params), next: fill(text.next, params), lang, params, ...extra },
    },
  };
}
