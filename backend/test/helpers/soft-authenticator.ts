import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';

interface StoredKey {
  id: Buffer;
  privateKey: KeyObject;
  rpId: string;
  userHandle: Buffer;
  counter: number;
}

const b64u = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url');
const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest();

/**
 * A software FIDO2 authenticator: real P-256 keys, real CBOR attestation objects and real
 * signatures, so tests exercise the exact verification path used with phones. Credentials are
 * discoverable (resident) and every operation reports user presence and user verification.
 */
export class SoftAuthenticator {
  readonly keys: StoredKey[] = [];
  /** Origin to report in clientDataJSON (e.g. android:apk-key-hash:...). */
  constructor(public origin: string) {}

  create(options: PublicKeyCredentialCreationOptionsJSON): RegistrationResponseJSON {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const jwk = publicKey.export({ format: 'jwk' });
    const id = randomBytes(32);
    const rpId = options.rp.id!;
    const userHandle = Buffer.from(options.user.id, 'base64url');
    this.keys.push({ id, privateKey, rpId, userHandle, counter: 0 });

    const cose = isoCBOR.encode(
      new Map<number, number | Uint8Array>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, Buffer.from(jwk.x!, 'base64url')],
        [-3, Buffer.from(jwk.y!, 'base64url')],
      ]),
    );
    const credIdLen = Buffer.alloc(2);
    credIdLen.writeUInt16BE(id.length);
    const authData = Buffer.concat([
      sha256(rpId),
      Buffer.from([0x01 | 0x04 | 0x40]), // UP | UV | AT
      Buffer.alloc(4), // sign count 0
      Buffer.alloc(16), // AAGUID
      credIdLen,
      id,
      Buffer.from(cose),
    ]);
    const attestationObject = isoCBOR.encode(
      new Map<string, unknown>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', new Uint8Array(authData)],
      ]) as unknown as Parameters<typeof isoCBOR.encode>[0],
    );
    const clientDataJSON = Buffer.from(
      JSON.stringify({ type: 'webauthn.create', challenge: options.challenge, origin: this.origin, crossOrigin: false }),
    );
    return {
      id: b64u(id),
      rawId: b64u(id),
      type: 'public-key',
      response: {
        clientDataJSON: b64u(clientDataJSON),
        attestationObject: b64u(attestationObject),
        transports: ['internal', 'hybrid'],
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    };
  }

  /** Discoverable assertion: uses the first matching credential (or the one named in allowCredentials). */
  get(options: PublicKeyCredentialRequestOptionsJSON, opts: { credentialIndex?: number } = {}): AuthenticationResponseJSON {
    const rpId = options.rpId!;
    const allowed = (options.allowCredentials ?? []).map((c) => c.id);
    const candidates = this.keys.filter((k) => k.rpId === rpId && (allowed.length === 0 || allowed.includes(b64u(k.id))));
    const key = candidates[opts.credentialIndex ?? 0];
    if (!key) throw new Error('NotAllowedError: no credential for this RP');
    key.counter += 1;
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(key.counter);
    const authData = Buffer.concat([sha256(rpId), Buffer.from([0x01 | 0x04]), counter]);
    const clientDataJSON = Buffer.from(
      JSON.stringify({ type: 'webauthn.get', challenge: options.challenge, origin: this.origin, crossOrigin: false }),
    );
    const signature = sign('sha256', Buffer.concat([authData, sha256(clientDataJSON)]), key.privateKey);
    return {
      id: b64u(key.id),
      rawId: b64u(key.id),
      type: 'public-key',
      response: {
        clientDataJSON: b64u(clientDataJSON),
        authenticatorData: b64u(authData),
        signature: b64u(signature),
        userHandle: b64u(key.userHandle),
      },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    };
  }
}
