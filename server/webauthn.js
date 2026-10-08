// Thin wrapper around SimpleWebAuthn that knows how we store credentials.
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

const RP_NAME = process.env.RP_NAME || 'SaathiAuth';

/**
 * Relying-party identity, derived from the request so the same build works on
 * localhost and behind a tunnel (ngrok sets x-forwarded-proto). RP_ID / ORIGIN
 * env vars pin them for production.
 */
export function rpFor(req) {
  const host = req.get('x-forwarded-host') || req.get('host') || 'localhost';
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  const origin = process.env.ORIGIN || `${proto}://${host}`;
  const rpID = process.env.RP_ID || new URL(origin).hostname;
  return { rpID, origin };
}

const toDescriptor = (c) => ({ id: c.id, transports: c.transports });

export async function registrationOptions(req, { userHandle, name, displayName, existing = [] }) {
  const { rpID } = rpFor(req);
  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: name,
    userDisplayName: displayName || name,
    userID: Buffer.from(userHandle, 'base64url'),
    attestationType: 'none',
    excludeCredentials: existing.map(toDescriptor),
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  });
}

/** Returns a credential record ready to store, or throws. */
export async function verifyRegistration(req, response, expectedChallenge) {
  const { rpID, origin } = rpFor(req);
  const { verified, registrationInfo } = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
  });
  if (!verified || !registrationInfo) throw new Error('registration_not_verified');
  const { credential } = registrationInfo;
  return {
    id: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    transports: credential.transports || response.response?.transports || [],
    createdAt: Date.now(),
  };
}

/**
 * `allow` empty => discoverable login (no username, no account enumeration).
 * `challenge` lets callers bind the signature to a specific request.
 */
export async function authenticationOptions(req, { allow = [], challenge, userVerification = 'preferred' } = {}) {
  const { rpID } = rpFor(req);
  return generateAuthenticationOptions({
    rpID,
    allowCredentials: allow.map(toDescriptor),
    userVerification,
    ...(challenge ? { challenge } : {}),
  });
}

/** Verifies an assertion against a stored credential and bumps its counter. */
export async function verifyAuthentication(req, response, expectedChallenge, stored, { requireUserVerification = false } = {}) {
  const { rpID, origin } = rpFor(req);
  const { verified, authenticationInfo } = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: stored.id,
      publicKey: Buffer.from(stored.publicKey, 'base64url'),
      counter: stored.counter,
      transports: stored.transports,
    },
    requireUserVerification,
  });
  if (!verified) throw new Error('authentication_not_verified');
  stored.counter = authenticationInfo.newCounter;
  return true;
}
