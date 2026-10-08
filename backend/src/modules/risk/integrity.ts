import type { Logger } from 'pino';

export type IntegrityStatus = 'pass' | 'fail' | 'unavailable';

export interface IntegrityVerdict {
  status: IntegrityStatus;
  /** Machine-readable reasons, for audit and the dashboard. Never shown to end users. */
  reasons: string[];
}

export interface IntegrityVerifier {
  readonly enabled: boolean;
  verify(token: string, expectedRequestHash: string): Promise<IntegrityVerdict>;
}

export interface PlayIntegrityOptions {
  packageName: string;
  /** SHA-256 signing-certificate fingerprints, colon hex as printed by keytool. */
  certFingerprints: string[];
  serviceAccountB64: string;
  /** When false, apps installed outside Google Play pass if they carry our signing certificate. */
  requirePlayRecognized: boolean;
  maxTokenAgeMs?: number;
}

interface DecodedPayload {
  requestDetails?: { requestPackageName?: string; requestHash?: string; timestampMillis?: string };
  appIntegrity?: { appRecognitionVerdict?: string; packageName?: string; certificateSha256Digest?: string[] };
  deviceIntegrity?: { deviceRecognitionVerdict?: string[] };
  accountDetails?: { appLicensingVerdict?: string };
}

/** Convert "AB:CD:..." to the unpadded base64url form Play Integrity reports. */
export function fingerprintToDigest(fp: string): string {
  return Buffer.from(fp.replace(/:/g, ''), 'hex').toString('base64url');
}

/** Pure verdict evaluation, separated from the network call so it is unit-testable. */
export function evaluateIntegrityPayload(
  payload: DecodedPayload,
  opts: Pick<PlayIntegrityOptions, 'packageName' | 'certFingerprints' | 'requirePlayRecognized'> & { maxTokenAgeMs: number },
  expectedRequestHash: string,
  now = Date.now(),
): IntegrityVerdict {
  const reasons: string[] = [];
  const rd = payload.requestDetails ?? {};
  if (rd.requestPackageName !== opts.packageName) reasons.push('package_mismatch');
  if (rd.requestHash !== expectedRequestHash) reasons.push('request_hash_mismatch');
  const ts = Number(rd.timestampMillis ?? 0);
  if (!ts || Math.abs(now - ts) > opts.maxTokenAgeMs) reasons.push('stale_token');

  const app = payload.appIntegrity ?? {};
  const allowedDigests = new Set(opts.certFingerprints.map(fingerprintToDigest));
  const certOk = (app.certificateSha256Digest ?? []).some((d) => allowedDigests.has(d.replace(/=+$/, '')));
  if (app.appRecognitionVerdict === 'PLAY_RECOGNIZED') {
    // Play-recognised builds are signed by Play App Signing; certificate already vouched for by Google.
  } else if (app.appRecognitionVerdict === 'UNRECOGNIZED_VERSION' && !opts.requirePlayRecognized && certOk) {
    // Sideloaded release build signed with our own certificate.
  } else {
    reasons.push(`app_${(app.appRecognitionVerdict ?? 'unevaluated').toLowerCase()}`);
  }

  const device = payload.deviceIntegrity?.deviceRecognitionVerdict ?? [];
  if (!device.includes('MEETS_DEVICE_INTEGRITY') && !device.includes('MEETS_STRONG_INTEGRITY')) {
    reasons.push('device_integrity_not_met');
  }
  return { status: reasons.length ? 'fail' : 'pass', reasons };
}

export class PlayIntegrityVerifier implements IntegrityVerifier {
  readonly enabled = true;
  private client: { request: (opts: object) => Promise<{ data: unknown }> } | null = null;

  constructor(
    private readonly opts: PlayIntegrityOptions,
    private readonly log: Logger,
  ) {}

  private async http() {
    if (this.client) return this.client;
    const { GoogleAuth } = await import('google-auth-library');
    const credentials = JSON.parse(Buffer.from(this.opts.serviceAccountB64, 'base64').toString('utf8'));
    const auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/playintegrity'] });
    this.client = (await auth.getClient()) as unknown as { request: (opts: object) => Promise<{ data: unknown }> };
    return this.client;
  }

  async verify(token: string, expectedRequestHash: string): Promise<IntegrityVerdict> {
    try {
      const client = await this.http();
      const res = await client.request({
        url: `https://playintegrity.googleapis.com/v1/${encodeURIComponent(this.opts.packageName)}:decodeIntegrityToken`,
        method: 'POST',
        data: { integrity_token: token },
        timeout: 5000,
      });
      const payload = (res.data as { tokenPayloadExternal?: DecodedPayload }).tokenPayloadExternal ?? {};
      return evaluateIntegrityPayload(
        payload,
        { ...this.opts, maxTokenAgeMs: this.opts.maxTokenAgeMs ?? 5 * 60 * 1000 },
        expectedRequestHash,
      );
    } catch (err) {
      // An outage at Google must not punish the user: report "unavailable", which scores zero.
      this.log.warn({ err }, 'play integrity decode failed');
      return { status: 'unavailable', reasons: ['decode_failed'] };
    }
  }
}

export class DisabledIntegrityVerifier implements IntegrityVerifier {
  readonly enabled = false;
  async verify(): Promise<IntegrityVerdict> {
    return { status: 'unavailable', reasons: ['not_configured'] };
  }
}
