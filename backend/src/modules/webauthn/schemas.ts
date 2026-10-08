import { z } from 'zod';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';

const b64url = z.string().regex(/^[A-Za-z0-9_-]+$/).max(8192);

export const registrationResponseSchema = z
  .object({
    id: b64url,
    rawId: b64url,
    type: z.literal('public-key'),
    response: z.looseObject({
      clientDataJSON: b64url,
      attestationObject: b64url,
      transports: z.array(z.string().max(32)).max(10).optional(),
    }),
    clientExtensionResults: z.record(z.string(), z.unknown()).default({}),
    authenticatorAttachment: z.enum(['platform', 'cross-platform']).optional(),
  })
  .transform((v) => v as unknown as RegistrationResponseJSON);

export const authenticationResponseSchema = z
  .object({
    id: b64url,
    rawId: b64url,
    type: z.literal('public-key'),
    response: z.looseObject({
      clientDataJSON: b64url,
      authenticatorData: b64url,
      signature: b64url,
      // Some Android providers send an empty string instead of omitting the field.
      userHandle: z.string().regex(/^[A-Za-z0-9_-]*$/).max(1024).optional().nullable().transform((v) => (v ? v : undefined)),
    }),
    clientExtensionResults: z.record(z.string(), z.unknown()).default({}),
    authenticatorAttachment: z.enum(['platform', 'cross-platform']).optional(),
  })
  .transform((v) => v as unknown as AuthenticationResponseJSON);

export const deviceInfoSchema = z.object({
  platform: z.enum(['android', 'ios']),
  name: z.string().trim().min(1).max(80),
  appVersion: z.string().max(40).optional(),
});

// WebAuthn options are produced by @simplewebauthn/server; documented loosely in OpenAPI.
export const creationOptionsSchema = z.looseObject({
  challenge: z.string(),
  rp: z.looseObject({}),
  user: z.looseObject({}),
}) as unknown as z.ZodType<PublicKeyCredentialCreationOptionsJSON>;
export const requestOptionsSchema = z.looseObject({ challenge: z.string() }) as unknown as z.ZodType<PublicKeyCredentialRequestOptionsJSON>;

export const sessionSchema = z.object({
  accessToken: z.string(),
  accessTokenExpiresIn: z.number(),
  refreshToken: z.string(),
  refreshTokenExpiresAt: z.string(),
});
