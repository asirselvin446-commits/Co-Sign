import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import pino, { type Logger } from 'pino';
import type { Config } from './config.js';
import { BlindIndex, FieldCipher } from './lib/crypto.js';
import { Limiter } from './lib/limiter.js';
import { AuditService } from './modules/audit/audit.service.js';
import { FcmPushSender, type PushSender } from './modules/push/push.service.js';
import { DisabledSmsSender, TwilioSmsSender, type SmsSender } from './modules/push/sms.js';
import { RealtimeHub } from './modules/realtime/hub.js';
import { DisabledIntegrityVerifier, PlayIntegrityVerifier, type IntegrityVerifier } from './modules/risk/integrity.js';

export interface Deps {
  config: Config;
  log: Logger;
  prisma: PrismaClient;
  redis: Redis;
  cipher: FieldCipher;
  blind: BlindIndex;
  limiter: Limiter;
  audit: AuditService;
  push: PushSender;
  sms: SmsSender;
  realtime: RealtimeHub;
  integrity: IntegrityVerifier;
}

export interface DepOverrides {
  push?: PushSender;
  sms?: SmsSender;
  integrity?: IntegrityVerifier;
  log?: Logger;
}

export function createLogger(config: Config): Logger {
  return pino({
    level: config.LOG_LEVEL,
    base: { service: 'co-sign-backend' },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.refreshToken',
        '*.accessToken',
        '*.token',
        '*.code',
      ],
      censor: '[redacted]',
    },
  });
}

export async function createDeps(config: Config, overrides: DepOverrides = {}): Promise<Deps> {
  const log = overrides.log ?? createLogger(config);
  const prisma = new PrismaClient({ datasourceUrl: config.DATABASE_URL });
  await prisma.$connect();
  const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 3, enableAutoPipelining: true });
  await redis.ping();

  const cipher = new FieldCipher(
    config.DATA_ENCRYPTION_KEY_ID,
    Buffer.from(config.DATA_ENCRYPTION_KEY, 'base64'),
    config.DATA_ENCRYPTION_OLD_KEYS,
  );
  const blind = new BlindIndex(Buffer.from(config.BLIND_INDEX_KEY, 'base64'));

  const push = overrides.push ?? new FcmPushSender(prisma, cipher, log, config.FIREBASE_SERVICE_ACCOUNT_BASE64);
  if (!push.enabled) log.warn('FIREBASE_SERVICE_ACCOUNT_BASE64 not set: guardians will only be alerted while the app is open');

  const sms =
    overrides.sms ??
    (config.SMS_PROVIDER === 'twilio'
      ? new TwilioSmsSender(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN, config.TWILIO_FROM, log)
      : new DisabledSmsSender());

  const integritySa = config.PLAY_INTEGRITY_SERVICE_ACCOUNT_BASE64 || config.FIREBASE_SERVICE_ACCOUNT_BASE64;
  const integrity =
    overrides.integrity ??
    (config.PLAY_INTEGRITY_ENABLED && integritySa && config.ANDROID_PACKAGE
      ? new PlayIntegrityVerifier(
          {
            packageName: config.ANDROID_PACKAGE,
            certFingerprints: config.ANDROID_SHA256_CERT_FINGERPRINTS,
            serviceAccountB64: integritySa,
            requirePlayRecognized: config.PLAY_INTEGRITY_REQUIRE_PLAY_RECOGNIZED,
          },
          log,
        )
      : new DisabledIntegrityVerifier());

  return {
    config,
    log,
    prisma,
    redis,
    cipher,
    blind,
    limiter: new Limiter(redis),
    audit: new AuditService(prisma),
    push,
    sms,
    realtime: new RealtimeHub(),
    integrity,
  };
}

export async function closeDeps(deps: Deps): Promise<void> {
  await Promise.allSettled([deps.prisma.$disconnect(), deps.redis.quit()]);
}
