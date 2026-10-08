import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { BlindIndex, FieldCipher, randomDigits, safeEqual } from '../../src/lib/crypto.js';

describe('FieldCipher', () => {
  const key = randomBytes(32);
  const cipher = new FieldCipher('k1', key);

  it('round-trips text and JSON', () => {
    const ct = cipher.encrypt('ரமேஷ் — रमेश', 'user.name:1');
    expect(ct.startsWith('k1.')).toBe(true);
    expect(cipher.decrypt(ct, 'user.name:1')).toBe('ரமேஷ் — रमेश');
    const j = cipher.encryptJson({ a: 1, b: [true] }, 'ctx');
    expect(cipher.decryptJson(j, 'ctx')).toEqual({ a: 1, b: [true] });
  });

  it('produces different ciphertext for the same plaintext', () => {
    expect(cipher.encrypt('x', 'c')).not.toBe(cipher.encrypt('x', 'c'));
  });

  it('refuses ciphertext moved to another context (AAD binding)', () => {
    const ct = cipher.encrypt('secret', 'user.phone:1');
    expect(() => cipher.decrypt(ct, 'user.phone:2')).toThrow();
  });

  it('detects tampering', () => {
    const ct = cipher.encrypt('secret', 'c');
    const parts = ct.split('.');
    const body = Buffer.from(parts[2]!, 'base64url');
    body[0] = body[0]! ^ 1;
    parts[2] = body.toString('base64url');
    expect(() => cipher.decrypt(parts.join('.'), 'c')).toThrow();
  });

  it('reads data written with a rotated-out key', () => {
    const oldKey = randomBytes(32);
    const old = new FieldCipher('k0', oldKey);
    const ct = old.encrypt('legacy', 'c');
    const rotated = new FieldCipher('k1', key, [`k0:${oldKey.toString('base64')}`]);
    expect(rotated.decrypt(ct, 'c')).toBe('legacy');
    expect(rotated.encrypt('new', 'c').startsWith('k1.')).toBe(true);
  });

  it('rejects keys of the wrong size', () => {
    expect(() => new FieldCipher('k1', randomBytes(16))).toThrow();
  });
});

describe('BlindIndex', () => {
  it('is deterministic per purpose and key', () => {
    const b = new BlindIndex(randomBytes(32));
    expect(b.of('email', 'a@b.c')).toBe(b.of('email', 'a@b.c'));
    expect(b.of('email', 'a@b.c')).not.toBe(b.of('phone', 'a@b.c'));
    expect(new BlindIndex(randomBytes(32)).of('email', 'a@b.c')).not.toBe(b.of('email', 'a@b.c'));
  });
});

describe('helpers', () => {
  it('randomDigits returns only ASCII digits of the right length', () => {
    for (let i = 0; i < 50; i++) expect(randomDigits(8)).toMatch(/^[0-9]{8}$/);
  });
  it('safeEqual compares in constant time and handles length mismatch', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
