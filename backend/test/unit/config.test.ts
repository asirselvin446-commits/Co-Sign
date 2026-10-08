import { describe, expect, it } from 'vitest';
import { withPlatformDefaults } from '../../src/config.js';

describe('platform defaults', () => {
  it('derives the public address, relying party and origins from Render', () => {
    const env = withPlatformDefaults({ RENDER_EXTERNAL_URL: 'https://co-sign-api.onrender.com' });
    expect(env).toMatchObject({
      PUBLIC_BASE_URL: 'https://co-sign-api.onrender.com',
      RP_ID: 'co-sign-api.onrender.com',
      WEB_ORIGINS: 'https://co-sign-api.onrender.com',
      CORS_ORIGINS: 'https://co-sign-api.onrender.com',
    });
  });

  it('never overrides explicit settings', () => {
    const env = withPlatformDefaults({
      RENDER_EXTERNAL_URL: 'https://co-sign-api.onrender.com',
      PUBLIC_BASE_URL: 'https://cosign.example.in',
      RP_ID: 'example.in',
      WEB_ORIGINS: 'https://console.example.in',
    });
    expect(env).toMatchObject({ PUBLIC_BASE_URL: 'https://cosign.example.in', RP_ID: 'example.in', WEB_ORIGINS: 'https://console.example.in', CORS_ORIGINS: 'https://cosign.example.in' });
  });

  it('leaves the environment alone off-platform', () => {
    expect(withPlatformDefaults({ NODE_ENV: 'test' })).toEqual({ NODE_ENV: 'test' });
  });
});
