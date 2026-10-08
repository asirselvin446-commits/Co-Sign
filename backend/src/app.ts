import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import Fastify, { type FastifyBaseLogger } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fastifyStatic from '@fastify/static';
import { jsonSchemaTransform, serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { trustProxyValue } from './config.js';
import type { Deps } from './deps.js';
import { AppError } from './lib/errors.js';
import { makeAuthGuards, requestLang } from './http/auth.js';
import type { Ctx, ZApp } from './http/context.js';
import { installErrorHandling } from './http/errors.js';
import { createServices } from './services.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { wellKnownRoutes } from './modules/wellknown/wellknown.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { deviceRoutes } from './modules/devices/devices.routes.js';
import { adminAuthRoutes } from './modules/admin/admin-auth.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { monitorRoutes } from './modules/monitor/monitor.routes.js';
import { stepupRoutes } from './modules/stepup/stepup.routes.js';
import { guardianRoutes } from './modules/guardians/guardians.routes.js';
import { recoveryRoutes } from './modules/recovery/recovery.routes.js';
import { signalRoutes } from './modules/risk/signals.routes.js';
import { enrolmentRoutes } from './modules/devices/enrolment.routes.js';

export interface BuildOptions {
  /** Expose Swagger UI at /docs (on by default outside production). */
  swaggerUi?: boolean;
}

export async function buildApp(deps: Deps, opts: BuildOptions = {}): Promise<{ app: ZApp; ctx: Ctx }> {
  const { config } = deps;
  const app = Fastify({
    loggerInstance: deps.log as FastifyBaseLogger,
    trustProxy: trustProxyValue(config),
    bodyLimit: 64 * 1024,
    genReqId: () => crypto.randomUUID(),
    routerOptions: { ignoreTrailingSlash: true },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.decorateRequest('auth', null);
  app.decorateRequest('lang', 'en');
  app.addHook('onRequest', async (req) => {
    req.lang = requestLang(req);
  });

  installErrorHandling(app, config.DISPLAY_TIMEZONE);

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'wss:', 'ws:'],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    frameguard: { action: 'deny' },
    strictTransportSecurity: config.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      // Native apps send no Origin header; browsers must be on the allowlist.
      if (!origin || config.CORS_ORIGINS.includes(origin)) cb(null, true);
      else cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['authorization', 'content-type', 'idempotency-key', 'x-cosign-lang', 'x-device-id', 'x-requested-with'],
    maxAge: 600,
  });

  await app.register(cookie);

  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    redis: deps.redis,
    nameSpace: 'rl:',
    skipOnError: false,
    keyGenerator: (req) => req.ip,
    errorResponseBuilder: (_req, context) =>
      new AppError('TOO_MANY_ATTEMPTS', {}, { retryAfterSeconds: Math.max(1, Math.ceil(context.ttl / 1000)) }),
  });

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Co-Sign API',
        version: '1.0.0',
        description: 'Scam-aware passkey authentication with guardian co-signing. Errors use the shared failure catalogue.',
      },
      servers: [{ url: config.PUBLIC_BASE_URL }],
      components: {
        securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      },
    },
    transform: jsonSchemaTransform,
  });
  if (opts.swaggerUi ?? config.NODE_ENV !== 'production') {
    await app.register(swaggerUi, { routePrefix: '/docs' });
  }

  const services = createServices(deps);
  // Mirror every audit event to the dashboard's live feed (IDs and action names only, no personal data).
  deps.audit.onAppend((r) =>
    deps.realtime.toDashboard('audit.event', {
      id: r.id.toString(),
      createdAt: r.createdAt.toISOString(),
      action: r.action,
      actorType: r.actorType,
      subjectType: r.subjectType,
    }),
  );
  const ctx: Ctx = { deps, services, guards: makeAuthGuards(services.tokens) };

  const routeModules = [
    healthRoutes,
    wellKnownRoutes,
    authRoutes,
    deviceRoutes,
    enrolmentRoutes,
    stepupRoutes,
    guardianRoutes,
    recoveryRoutes,
    signalRoutes,
    adminAuthRoutes,
    adminRoutes,
    monitorRoutes,
  ];
  for (const mod of routeModules) {
    await app.register(async (scope) => mod(scope as unknown as ZApp, ctx));
  }

  const servingDashboard = await serveDashboard(app as unknown as ZApp, config.DASHBOARD_DIST);
  if (!servingDashboard) {
    app.setNotFoundHandler(() => {
      throw new AppError('NOT_FOUND');
    });
  }

  return { app: app as unknown as ZApp, ctx };
}

/** In production the dashboard build is served from the API origin so cookies stay first-party. */
async function serveDashboard(app: ZApp, dist: string): Promise<boolean> {
  if (!dist) return false;
  const root = resolve(dist);
  if (!existsSync(join(root, 'index.html'))) {
    app.log.warn({ root }, 'DASHBOARD_DIST has no index.html; dashboard not served');
    return false;
  }
  await app.register(fastifyStatic, { root, prefix: '/', wildcard: false, index: ['index.html'] });
  app.setNotFoundHandler((req, reply) => {
    const isApi = req.url.startsWith('/v1/') || req.url.startsWith('/.well-known/') || req.url.startsWith('/health');
    if (req.method === 'GET' && !isApi && (req.headers.accept ?? '').includes('text/html')) {
      return reply.type('text/html').sendFile('index.html');
    }
    throw new AppError('NOT_FOUND');
  });
  return true;
}
