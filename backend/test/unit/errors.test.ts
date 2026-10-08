import { describe, expect, it } from 'vitest';
import { AppError, formatDuration, pickLang, renderError } from '../../src/lib/errors.js';
import { ERROR_CATALOG, LANGUAGES } from '../../src/generated/catalog.js';

describe('error catalogue', () => {
  it('has a cause and a next step in every language for every code', () => {
    for (const [code, entry] of Object.entries(ERROR_CATALOG)) {
      for (const lang of LANGUAGES) {
        expect(entry.text[lang].cause, `${code}/${lang}`).toMatch(/\S/);
        expect(entry.text[lang].next, `${code}/${lang}`).toMatch(/\S/);
      }
    }
  });

  it('covers the required failure cases', () => {
    for (const code of [
      'PASSKEY_CANCELLED',
      'PASSKEY_TIMED_OUT',
      'NO_SCREEN_LOCK',
      'PASSKEY_NOT_ON_DEVICE',
      'CREDENTIAL_ALREADY_REGISTERED',
      'CODE_NON_ASCII_DIGITS',
      'CODE_EXPIRED',
      'TOO_MANY_ATTEMPTS',
      'NETWORK_ERROR',
      'GUARDIAN_DENIED',
      'COOLOFF_ACTIVE',
      'RECOVERY_PENDING',
    ]) {
      expect(ERROR_CATALOG).toHaveProperty(code);
    }
  });
});

describe('renderError tiering', () => {
  it('shows detailed reasons to trusted devices', () => {
    const { status, body } = renderError(new AppError('GUARDIAN_DENIED'), 'en', true);
    expect(status).toBe(403);
    expect(body.error.code).toBe('GUARDIAN_DENIED');
  });

  it('replaces detailed reasons with the generic message for unknown devices', () => {
    const { body } = renderError(new AppError('COOLOFF_ACTIVE', {}, { until: new Date().toISOString() }), 'hi', false);
    expect(body.error.code).toBe('ACTION_NOT_COMPLETED');
    expect(body.error).not.toHaveProperty('until');
    expect(body.error.lang).toBe('hi');
  });

  it('fills the exact wait time in the user language', () => {
    const en = renderError(new AppError('TOO_MANY_ATTEMPTS', {}, { retryAfterSeconds: 125 }), 'en', false);
    expect(en.body.error.next).toBe('Wait 3 minutes and try again.');
    const ta = renderError(new AppError('TOO_MANY_ATTEMPTS', {}, { retryAfterSeconds: 30 }), 'ta', false);
    expect(ta.body.error.next).toContain('30 வினாடிகள்');
  });

  it('words the cool-off end time as a clock time', () => {
    const { body } = renderError(new AppError('COOLOFF_ACTIVE', {}, { until: '2026-03-01T10:30:00Z' }), 'en', true, 'Asia/Kolkata');
    expect(body.error.cause).toContain('4:00');
  });
});

describe('formatDuration', () => {
  it('rounds up and pluralises', () => {
    expect(formatDuration(1, 'en')).toBe('1 second');
    expect(formatDuration(59, 'en')).toBe('59 seconds');
    expect(formatDuration(61, 'en')).toBe('2 minutes');
    expect(formatDuration(3600, 'en')).toBe('1 hour');
    expect(formatDuration(3601, 'hi')).toBe('2 घंटे');
  });
});

describe('pickLang', () => {
  it('reads the first supported language from headers', () => {
    expect(pickLang('fr-FR,hi;q=0.8')).toBe('hi');
    expect(pickLang(undefined, 'ta-IN')).toBe('ta');
    expect(pickLang('de')).toBe('en');
  });
});
