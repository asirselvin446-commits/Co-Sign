import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import type { Deps } from '../../deps.js';
import { AppError } from '../../lib/errors.js';

export type OriginKind = 'app' | 'web';

/** Data stored server-side with each issued challenge; consumed exactly once. */
export type ChallengeRecord =
  | { purpose: 'user_register'; handle: string; displayName: string; locale: string; webauthnUserId: string; device: DeviceInfo }
  | { purpose: 'user_login' }
  | { purpose: 'user_add_passkey'; userId: string; deviceId: string; stepupId: string }
  | { purpose: 'device_link'; userId: string; linkId: string; device: DeviceInfo }
  | { purpose: 'admin_register'; inviteId: string; handle: string; displayName: string; webauthnUserId: string }
  | { purpose: 'admin_login' }
  | { purpose: 'stepup_user'; requestId: string; userId: string; deviceId: string }
  | { purpose: 'guardian_decision'; requestId: string; guardianId: string; decision: 'approve' | 'deny'; nonce: string }
  | { purpose: 'recovery_approval'; recoveryId: string; guardianId: string; nonce: string }
  | { purpose: 'recovery_register'; recoveryId: string }
  | { purpose: 'signin_answer'; requestId: string; guardianId: string; decision: 'fill' | 'deny'; ciphertextSha256: string | null; nonce: string };

export interface DeviceInfo {
  platform: 'android' | 'ios' | 'web';
  name: string;
  appVersion?: string | undefined;
}

export interface StoredCredential {
  id: string;
  publicKey: Uint8Array;
  counter: bigint;
  transports: string[];
}

const CHALLENGE_TTL_SECONDS = 300;
const key = (challenge: string) => `wa:chal:${challenge}`;

/** "AB:CD:..." SHA-256 certificate fingerprint to the WebAuthn origin Android reports for native apps. */
export function androidOrigin(fingerprint: string): string {
  return `android:apk-key-hash:${Buffer.from(fingerprint.replace(/:/g, ''), 'hex').toString('base64url')}`;
}

export function challengeFromClientData(clientDataJSON: string): string {
  try {
    const parsed = JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString('utf8')) as { challenge?: unknown };
    if (typeof parsed.challenge !== 'string' || parsed.challenge.length < 16) throw new Error('no challenge');
    return parsed.challenge;
  } catch {
    throw new AppError('SIGN_IN_FAILED');
  }
}

export class WebAuthnService {
  constructor(private readonly deps: Deps) {}

  get rpId(): string {
    return this.deps.config.RP_ID;
  }

  /** Native apps: Android reports its signing-key hash; iOS reports the associated domain. */
  origins(kind: OriginKind): string[] {
    const c = this.deps.config;
    if (kind === 'web') return c.WEB_ORIGINS;
    return [...c.ANDROID_SHA256_CERT_FINGERPRINTS.map(androidOrigin), `https://${c.RP_ID}`];
  }

  async storeChallenge(challenge: string, record: ChallengeRecord, ttlSeconds = CHALLENGE_TTL_SECONDS): Promise<void> {
    await this.deps.redis.set(key(challenge), JSON.stringify(record), 'EX', ttlSeconds);
  }

  /** Atomically read and delete: a challenge can be answered once. */
  async takeChallenge(challenge: string): Promise<ChallengeRecord | null> {
    const raw = await this.deps.redis.getdel(key(challenge));
    return raw ? (JSON.parse(raw) as ChallengeRecord) : null;
  }

  async takeChallengeFor<P extends ChallengeRecord['purpose']>(
    clientDataJSON: string,
    purpose: P,
  ): Promise<{ challenge: string; record: Extract<ChallengeRecord, { purpose: P }> }> {
    const challenge = challengeFromClientData(clientDataJSON);
    const record = await this.takeChallenge(challenge);
    if (!record || record.purpose !== purpose) throw new AppError('SIGN_IN_FAILED');
    return { challenge, record: record as Extract<ChallengeRecord, { purpose: P }> };
  }

  async registrationOptions(opts: {
    userId: Uint8Array;
    userName: string;
    displayName: string;
    exclude?: Array<{ id: string; transports?: string[] }>;
  }): Promise<PublicKeyCredentialCreationOptionsJSON> {
    return generateRegistrationOptions({
      rpName: this.deps.config.RP_NAME,
      rpID: this.rpId,
      userID: new Uint8Array(opts.userId),
      userName: opts.userName,
      userDisplayName: opts.displayName,
      attestationType: 'none',
      timeout: 120_000,
      excludeCredentials: (opts.exclude ?? []).map((c) => ({
        id: c.id,
        transports: c.transports as AuthenticatorTransportFuture[],
      })),
      authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
      supportedAlgorithmIDs: [-7, -257, -8],
    });
  }

  async verifyRegistration(response: RegistrationResponseJSON, expectedChallenge: string, kind: OriginKind) {
    let result;
    try {
      result = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.origins(kind),
        expectedRPID: this.rpId,
        requireUserVerification: true,
      });
    } catch (err) {
      this.deps.log.info({ err: (err as Error).message }, 'registration verification failed');
      throw new AppError('SIGN_IN_FAILED');
    }
    if (!result.verified) throw new AppError('SIGN_IN_FAILED');
    const info = result.registrationInfo;
    return {
      credentialId: info.credential.id,
      publicKey: new Uint8Array(info.credential.publicKey),
      counter: BigInt(info.credential.counter),
      transports: (response.response.transports ?? []) as string[],
      deviceType: info.credentialDeviceType,
      backedUp: info.credentialBackedUp,
      aaguid: info.aaguid,
    };
  }

  /**
   * Assertion options. `challenge` may be supplied when it must be derived from request data
   * (guardian co-sign), otherwise a random one is generated.
   */
  async authenticationOptions(opts: {
    challenge?: Uint8Array<ArrayBuffer>;
    allowCredentials?: Array<{ id: string; transports?: string[] }>;
  } = {}): Promise<PublicKeyCredentialRequestOptionsJSON> {
    return generateAuthenticationOptions({
      rpID: this.rpId,
      timeout: 120_000,
      userVerification: 'required',
      ...(opts.challenge ? { challenge: opts.challenge } : {}),
      allowCredentials: (opts.allowCredentials ?? []).map((c) => ({
        id: c.id,
        transports: c.transports as AuthenticatorTransportFuture[],
      })),
    });
  }

  async verifyAuthentication(
    response: AuthenticationResponseJSON,
    expectedChallenge: string,
    credential: StoredCredential,
    kind: OriginKind,
  ): Promise<{ newCounter: bigint; backedUp: boolean }> {
    let result;
    try {
      result = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.origins(kind),
        expectedRPID: this.rpId,
        requireUserVerification: true,
        credential: {
          id: credential.id,
          publicKey: new Uint8Array(credential.publicKey),
          counter: Number(credential.counter),
          transports: credential.transports as AuthenticatorTransportFuture[],
        },
      });
    } catch (err) {
      this.deps.log.info({ err: (err as Error).message }, 'assertion verification failed');
      throw new AppError('SIGN_IN_FAILED');
    }
    if (!result.verified) throw new AppError('SIGN_IN_FAILED');
    return { newCounter: BigInt(result.authenticationInfo.newCounter), backedUp: result.authenticationInfo.credentialBackedUp };
  }
}
