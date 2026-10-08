import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Column encryption with AES-256-GCM. Ciphertext format: `<keyId>.<iv>.<ciphertext>.<tag>` (base64url parts).
 * The key ID lets us rotate keys: new writes use the current key; reads accept any configured key.
 * `context` is bound as additional authenticated data so a ciphertext copied into another column or row fails.
 */
export class FieldCipher {
  private readonly keys = new Map<string, Buffer>();

  constructor(
    private readonly currentKeyId: string,
    currentKey: Buffer,
    oldKeys: ReadonlyArray<string> = [],
  ) {
    if (currentKey.length !== 32) throw new Error('encryption key must be 32 bytes');
    this.keys.set(currentKeyId, currentKey);
    for (const entry of oldKeys) {
      const [id, b64] = entry.split(':');
      if (!id || !b64) throw new Error('DATA_ENCRYPTION_OLD_KEYS entries must look like id:base64key');
      const key = Buffer.from(b64, 'base64');
      if (key.length !== 32) throw new Error(`old key ${id} must be 32 bytes`);
      this.keys.set(id, key);
    }
  }

  encrypt(plaintext: string, context: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.keys.get(this.currentKeyId)!, iv);
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [this.currentKeyId, iv.toString('base64url'), ct.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.');
  }

  decrypt(payload: string, context: string): string {
    const [keyId, ivB64, ctB64, tagB64] = payload.split('.');
    const key = keyId ? this.keys.get(keyId) : undefined;
    if (!key || !ivB64 || ctB64 === undefined || !tagB64) throw new Error('unreadable ciphertext');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64url')), decipher.final()]).toString('utf8');
  }

  encryptJson(value: unknown, context: string): string {
    return this.encrypt(JSON.stringify(value), context);
  }

  decryptJson<T>(payload: string, context: string): T {
    return JSON.parse(this.decrypt(payload, context)) as T;
  }
}

/** Keyed blind index, so equality lookups work on encrypted columns without exposing plaintext. */
export class BlindIndex {
  constructor(private readonly key: Buffer) {}
  of(purpose: string, value: string): string {
    return createHmac('sha256', this.key).update(`${purpose}\u0000${value}`).digest('base64url');
  }
}

export const sha256 = (data: string | Buffer): Buffer => createHash('sha256').update(data).digest();
export const sha256Hex = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');
export const sha256B64url = (data: string | Buffer): string => createHash('sha256').update(data).digest('base64url');

export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

/** Uniformly random numeric code of `digits` length (no modulo bias). */
export function randomDigits(digits: number): string {
  let out = '';
  while (out.length < digits) {
    const b = randomBytes(1)[0]!;
    if (b < 250) out += String(b % 10);
  }
  return out;
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
