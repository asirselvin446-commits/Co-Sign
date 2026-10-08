import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { guardianChallenge } from '../../src/modules/stepup/stepup.service.js';
import { recoveryChallenge } from '../../src/modules/recovery/recovery.service.js';
import { assertAsciiCode, toAsciiDigits } from '../../src/modules/guardians/guardians.service.js';
import { generateRecoveryCode, normaliseRecoveryCode } from '../../src/modules/recovery/codes.js';
import { AppError } from '../../src/lib/errors.js';

const base = {
  id: '6f8a7d1e-1c2b-4d5e-9f00-112233445566',
  action: 'change_email' as const,
  userId: '0b1c2d3e-4f50-4617-8293-a4b5c6d7e8f9',
  expiresAt: new Date('2026-10-08T10:10:00.000Z'),
};

describe('guardian challenge binding', () => {
  it('is exactly base64url(sha256(requestId|action|userId|expiresAt|nonce))', () => {
    const expected = createHash('sha256')
      .update(`${base.id}|${base.action}|${base.userId}|2026-10-08T10:10:00.000Z|nonce-1`)
      .digest('base64url');
    expect(guardianChallenge(base, 'nonce-1').toString('base64url')).toBe(expected);
  });

  it('changes if any bound field changes, so a signature cannot be moved to another request', () => {
    const c = guardianChallenge(base, 'n').toString('base64url');
    expect(guardianChallenge({ ...base, id: base.id.replace('6f', '7f') }, 'n').toString('base64url')).not.toBe(c);
    expect(guardianChallenge({ ...base, action: 'add_device' }, 'n').toString('base64url')).not.toBe(c);
    expect(guardianChallenge({ ...base, userId: base.userId.replace('0b', '1b') }, 'n').toString('base64url')).not.toBe(c);
    expect(guardianChallenge({ ...base, expiresAt: new Date(base.expiresAt.getTime() + 1) }, 'n').toString('base64url')).not.toBe(c);
    expect(guardianChallenge(base, 'm').toString('base64url')).not.toBe(c);
  });

  it('separates recovery approvals from step-up approvals', () => {
    const r = recoveryChallenge({ id: base.id, userId: base.userId, expiresAt: base.expiresAt }, 'n');
    expect(r.equals(guardianChallenge(base, 'n'))).toBe(false);
  });
});

describe('code entry helpers', () => {
  it('converts Tamil and Devanagari digits to ASCII', () => {
    expect(toAsciiDigits('௧௨௩௪')).toBe('1234');
    expect(toAsciiDigits('५६७८९०')).toBe('567890');
    expect(toAsciiDigits('12௩४')).toBe('1234');
  });

  it('rejects non-ASCII digits with a fixable error carrying the converted code', () => {
    try {
      assertAsciiCode('௧௨௩௪ ௫௬௭௮');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe('CODE_NON_ASCII_DIGITS');
      expect((e as AppError).extra.converted).toBe('12345678');
    }
    expect(assertAsciiCode('1234-5678')).toBe('12345678');
  });
});

describe('recovery codes', () => {
  it('generates readable recovery codes and normalises input', () => {
    for (let i = 0; i < 100; i++) expect(generateRecoveryCode()).toMatch(/^[2-9A-HJKMNP-Z]{5}-[2-9A-HJKMNP-Z]{5}$/);
    expect(normaliseRecoveryCode(' abcde-fghjk ')).toBe('ABCDEFGHJK');
  });
});
