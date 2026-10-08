import { createCipheriv, createDecipheriv, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes, type KeyObject } from 'node:crypto';

/**
 * Test copy of the sealed-answer format used between the guardian's and the person's phones
 * (Kotlin SignInCrypto): ECDH P-256 → HKDF-SHA256 (no salt, info "co-sign signin v1") → AES-256-GCM.
 * The sealed answer is base64 of JSON {v:1, epk, iv, ct}; epk is the sender's one-time SPKI key.
 */
const INFO = Buffer.from('co-sign signin v1');

export function signinAad(requestId: string, pkg: string | null, host: string | null): Buffer {
  return Buffer.from(`${requestId}|${pkg ?? ''}|${host ?? ''}`, 'utf8');
}

export function newRecipient(): { privateKey: KeyObject; publicKeySpkiB64: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return { privateKey, publicKeySpkiB64: publicKey.export({ type: 'spki', format: 'der' }).toString('base64') };
}

function key(shared: Buffer): Buffer {
  return Buffer.from(hkdfSync('sha256', shared, Buffer.alloc(0), INFO, 32));
}

export function seal(recipientSpkiB64: string, plaintext: string, aad: Buffer): string {
  const recipient = createPublicKey({ key: Buffer.from(recipientSpkiB64, 'base64'), format: 'der', type: 'spki' });
  const eph = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const shared = diffieHellman({ privateKey: eph.privateKey, publicKey: recipient });
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(shared), iv);
  c.setAAD(aad);
  const ct = Buffer.concat([c.update(plaintext, 'utf8'), c.final(), c.getAuthTag()]);
  const epk = eph.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  return Buffer.from(JSON.stringify({ v: 1, epk, iv: iv.toString('base64'), ct: ct.toString('base64') })).toString('base64');
}

export function open(recipient: KeyObject, sealed: string, aad: Buffer): string {
  const box = JSON.parse(Buffer.from(sealed, 'base64').toString('utf8')) as { v: number; epk: string; iv: string; ct: string };
  const epk = createPublicKey({ key: Buffer.from(box.epk, 'base64'), format: 'der', type: 'spki' });
  const shared = diffieHellman({ privateKey: recipient, publicKey: epk });
  const ct = Buffer.from(box.ct, 'base64');
  const d = createDecipheriv('aes-256-gcm', key(shared), Buffer.from(box.iv, 'base64'));
  d.setAAD(aad);
  d.setAuthTag(ct.subarray(ct.length - 16));
  return Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]).toString('utf8');
}
