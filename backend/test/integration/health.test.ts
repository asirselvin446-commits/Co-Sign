import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, type TestApp } from '../helpers/app.js';

describe('health and platform basics', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('reports liveness', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/health/live' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('reports readiness against real Postgres and Redis', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', database: true, redis: true });
  });

  it('sends security headers', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/health/live' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('returns catalogue errors for unknown routes, in the requested language', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/v1/nope', headers: { 'accept-language': 'ta-IN,ta;q=0.9' } });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.lang).toBe('ta');
    expect(body.error.cause.length).toBeGreaterThan(5);
    expect(body.error.next.length).toBeGreaterThan(5);
  });

  it('rejects disallowed CORS origins', async () => {
    const bad = await t.app.inject({ method: 'OPTIONS', url: '/health/live', headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' } });
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
    const good = await t.app.inject({ method: 'OPTIONS', url: '/health/live', headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'GET' } });
    expect(good.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('keeps the audit table append-only at the database level', async () => {
    const rec = await t.deps.audit.append({ actorType: 'system', action: 'test.event', payload: { n: 1 } });
    await expect(t.deps.prisma.$executeRaw`UPDATE audit_events SET action = 'x' WHERE id = ${rec.id}`).rejects.toThrow(/append-only/);
    await expect(t.deps.prisma.$executeRaw`DELETE FROM audit_events WHERE id = ${rec.id}`).rejects.toThrow(/append-only/);
    const verify = await t.deps.audit.verifyChain();
    expect(verify.ok).toBe(true);
  });
});
