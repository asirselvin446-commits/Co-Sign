import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

const csv = z
  .string()
  .default('')
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

const base64Key = (name: string) =>
  z.string().refine((v) => Buffer.from(v, 'base64').length === 32, {
    message: `${name} must be 32 random bytes, base64 encoded (openssl rand -base64 32)`,
  });

const seconds = (def: number) => z.coerce.number().int().positive().default(def);

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().default(8080),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    TRUST_PROXY: z.string().default('false'),

    PUBLIC_BASE_URL: z.url(),
    /** Where staff open the dashboard (defaults to PUBLIC_BASE_URL, which serves it in production). */
    DASHBOARD_URL: z.string().default(''),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    DATA_ENCRYPTION_KEY: base64Key('DATA_ENCRYPTION_KEY'),
    DATA_ENCRYPTION_KEY_ID: z.string().regex(/^[a-z0-9]{1,8}$/).default('k1'),
    DATA_ENCRYPTION_OLD_KEYS: csv,
    BLIND_INDEX_KEY: base64Key('BLIND_INDEX_KEY'),

    RP_ID: z.string().min(1),
    RP_NAME: z.string().default('Co-Sign'),
    WEB_ORIGINS: csv,
    CORS_ORIGINS: csv,
    ANDROID_PACKAGE: z.string().default(''),
    ANDROID_SHA256_CERT_FINGERPRINTS: csv,
    APPLE_TEAM_ID: z.string().default(''),
    IOS_BUNDLE_ID: z.string().default(''),

    FIREBASE_SERVICE_ACCOUNT_BASE64: z.string().default(''),
    PLAY_INTEGRITY_ENABLED: bool.default(false),
    PLAY_INTEGRITY_SERVICE_ACCOUNT_BASE64: z.string().default(''),
    PLAY_INTEGRITY_REQUIRE_PLAY_RECOGNIZED: bool.default(true),
    GOOGLE_CLOUD_PROJECT_NUMBER: z.string().regex(/^\d*$/).default(''),

    SMS_PROVIDER: z.enum(['none', 'twilio']).default('none'),
    TWILIO_ACCOUNT_SID: z.string().default(''),
    TWILIO_AUTH_TOKEN: z.string().default(''),
    TWILIO_FROM: z.string().default(''),

    ACCESS_TOKEN_TTL_SECONDS: seconds(600),
    REFRESH_TOKEN_TTL_SECONDS: seconds(30 * 24 * 3600),
    ADMIN_REFRESH_TOKEN_TTL_SECONDS: seconds(12 * 3600),
    STEPUP_GUARDIAN_WINDOW_SECONDS: seconds(600),
    COOLOFF_SECONDS: seconds(1800),
    /** Removing a guardian waits this long, so nobody can quietly take a person's guardians away. */
    GUARDIAN_CHANGE_DELAY_SECONDS: seconds(24 * 3600),
    /** A new guardian starts after this delay (0 = at once). */
    GUARDIAN_ACTIVATION_DELAY_SECONDS: z.coerce.number().int().min(0).default(0),
    /** For this long after a guardian starts, the protected person can remove them instantly. */
    GUARDIAN_UNDO_WINDOW_SECONDS: seconds(24 * 3600),
    INVITE_TTL_SECONDS: seconds(48 * 3600),
    RECOVERY_APPROVAL_WINDOW_SECONDS: seconds(24 * 3600),
    RECOVERY_CANCEL_WINDOW_SECONDS: seconds(24 * 3600),
    SIGNAL_RETENTION_DAYS: seconds(30),
    MAX_GUARDIANS: z.coerce.number().int().min(1).max(5).default(5),
    REMOTE_ACCESS_PACKAGES_EXTRA: csv,

    DISPLAY_TIMEZONE: z.string().default('Asia/Kolkata'),
    DASHBOARD_DIST: z.string().default(''),
    JOBS_ENABLED: bool.default(true),
    JOB_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  })
  .superRefine((c, ctx) => {
    if (c.NODE_ENV === 'production') {
      if (!c.PUBLIC_BASE_URL.startsWith('https://')) {
        ctx.addIssue({ code: 'custom', path: ['PUBLIC_BASE_URL'], message: 'must be https in production' });
      }
      if (c.WEB_ORIGINS.some((o) => !o.startsWith('https://'))) {
        ctx.addIssue({ code: 'custom', path: ['WEB_ORIGINS'], message: 'must be https in production' });
      }
    }
    if (c.SMS_PROVIDER === 'twilio' && (!c.TWILIO_ACCOUNT_SID || !c.TWILIO_AUTH_TOKEN || !c.TWILIO_FROM)) {
      ctx.addIssue({ code: 'custom', path: ['SMS_PROVIDER'], message: 'twilio needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM' });
    }
    if (c.ANDROID_SHA256_CERT_FINGERPRINTS.some((f) => !/^([0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2}$/.test(f))) {
      ctx.addIssue({
        code: 'custom',
        path: ['ANDROID_SHA256_CERT_FINGERPRINTS'],
        message: 'each fingerprint must be 32 colon-separated hex bytes (keytool -list -v output)',
      });
    }
  });

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join('\n')}`);
  }
  return parsed.data;
}

/** TRUST_PROXY: "true", "false", a hop count, or a comma-separated list of proxy addresses/CIDRs. */
export function trustProxyValue(c: Config): boolean | string | ((addr: string, hop: number) => boolean) {
  if (c.TRUST_PROXY === 'true') return true;
  if (c.TRUST_PROXY === 'false') return false;
  const n = Number(c.TRUST_PROXY);
  if (Number.isInteger(n)) return (_addr: string, hop: number) => hop < n;
  return c.TRUST_PROXY;
}
