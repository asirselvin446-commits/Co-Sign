import { randomBytes } from 'node:crypto';
import type { BlindIndex } from '../../lib/crypto.js';

// No 0/O, 1/I/L, so codes can be read aloud and copied by hand without confusion.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const RECOVERY_CODE_COUNT = 10;

export function generateRecoveryCode(): string {
  let out = '';
  while (out.length < 10) {
    const b = randomBytes(1)[0]!;
    if (b < 248) out += ALPHABET[b % ALPHABET.length];
  }
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

export function normaliseRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function recoveryCodeHash(blind: BlindIndex, code: string): string {
  return blind.of('recovery-code', normaliseRecoveryCode(code));
}
