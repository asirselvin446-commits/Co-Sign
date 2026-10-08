import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assessMonitorEvent, monitorEventSchema, monitorReasons, type MonitorContext } from '../../src/modules/monitor/monitor.engine.js';

interface Vector {
  name: string;
  event: Record<string, unknown>;
  context: MonitorContext;
  expect: { score: number; severity: string; rules: string[]; pause: boolean };
}

const { vectors } = JSON.parse(readFileSync(join(import.meta.dirname, '../../../shared/monitor-vectors.json'), 'utf8')) as { vectors: Vector[] };

describe('family monitoring engine (shared vectors, also run by the phone)', () => {
  it('has vectors to check', () => {
    expect(vectors.length).toBeGreaterThanOrEqual(15);
  });

  for (const v of vectors) {
    it(v.name, () => {
      const event = monitorEventSchema.parse({ clientId: 'vector-0001', occurredAt: '2026-10-08T10:00:00.000Z', ...v.event });
      expect(assessMonitorEvent(event, v.context)).toEqual(v.expect);
    });
  }

  it('explains every rule in all three languages', () => {
    for (const lang of ['en', 'ta', 'hi'] as const) {
      const r = monitorReasons(['payment_screen_during_call', 'late_night_activity'], lang);
      expect(r.map((x) => x.weight)).toEqual([70, 10]);
      expect(r.every((x) => x.reason.length > 10)).toBe(true);
    }
  });

  it('rejects events that try to carry personal data', () => {
    const bad = monitorEventSchema.safeParse({
      clientId: 'vector-0002',
      occurredAt: '2026-10-08T10:00:00.000Z',
      kind: 'notification_debit',
      amountBucket: '45000',
      localHour: 3,
    });
    expect(bad.success).toBe(false);
    const extra = monitorEventSchema.parse({
      clientId: 'vector-0003',
      occurredAt: '2026-10-08T10:00:00.000Z',
      kind: 'notification_otp',
      localHour: 3,
      text: 'Your OTP is 123456',
      phoneNumber: '+911234567890',
    } as Record<string, unknown>);
    expect(extra).not.toHaveProperty('text');
    expect(extra).not.toHaveProperty('phoneNumber');
  });
});
