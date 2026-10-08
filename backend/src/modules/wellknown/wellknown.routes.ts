import type { Ctx, ZApp } from '../../http/context.js';

/**
 * Digital Asset Links (Android) and Apple App Site Association (iOS). Both let the native app use
 * passkeys for this domain and open invite/recovery links. Generated from environment variables.
 */
export async function wellKnownRoutes(app: ZApp, { deps }: Ctx): Promise<void> {
  const c = deps.config;

  app.get('/.well-known/assetlinks.json', { schema: { hide: true }, config: { rateLimit: false } }, async (_req, reply) => {
    const statements =
      c.ANDROID_PACKAGE && c.ANDROID_SHA256_CERT_FINGERPRINTS.length
        ? [
            {
              relation: ['delegate_permission/common.handle_all_urls', 'delegate_permission/common.get_login_creds'],
              target: {
                namespace: 'android_app',
                package_name: c.ANDROID_PACKAGE,
                sha256_cert_fingerprints: c.ANDROID_SHA256_CERT_FINGERPRINTS.map((f) => f.toUpperCase()),
              },
            },
          ]
        : [];
    return reply.header('cache-control', 'public, max-age=3600').type('application/json').send(JSON.stringify(statements));
  });

  app.get('/.well-known/apple-app-site-association', { schema: { hide: true }, config: { rateLimit: false } }, async (_req, reply) => {
    const appId = c.APPLE_TEAM_ID && c.IOS_BUNDLE_ID ? `${c.APPLE_TEAM_ID}.${c.IOS_BUNDLE_ID}` : null;
    const body = appId
      ? {
          webcredentials: { apps: [appId] },
          applinks: {
            details: [{ appIDs: [appId], components: [{ '/': '/invite/*' }, { '/': '/link/*' }] }],
          },
        }
      : { webcredentials: { apps: [] }, applinks: { details: [] } };
    return reply.header('cache-control', 'public, max-age=3600').type('application/json').send(JSON.stringify(body));
  });
}
