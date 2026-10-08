import { describe, expect, it } from 'vitest';
import { GENESIS_HASH, canonicalJson, hashAuditRow } from '../../src/modules/audit/audit.service.js';

describe('canonicalJson', () => {
  it('sorts keys recursively and drops undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: undefined } })).toBe('{"a":{"d":[3,{"y":2,"z":1}]},"b":1}');
  });
  it('handles primitives and null', () => {
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson('x')).toBe('"x"');
    expect(canonicalJson(undefined)).toBe('null');
  });
});

describe('hashAuditRow', () => {
  const row = {
    createdAt: new Date('2026-01-01T00:00:00.123Z'),
    actorType: 'user',
    actorId: 'u1',
    action: 'auth.login',
    subjectType: 'user',
    subjectId: 'u1',
    payload: { deviceId: 'd1', score: 10 },
  };

  it('is sha256(prev_hash + canonical payload)', () => {
    const h = hashAuditRow(GENESIS_HASH, row);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashAuditRow(GENESIS_HASH, { ...row, payload: { score: 10, deviceId: 'd1' } })).toBe(h);
  });

  it('changes when any field or the predecessor changes', () => {
    const h = hashAuditRow(GENESIS_HASH, row);
    expect(hashAuditRow('1'.repeat(64), row)).not.toBe(h);
    expect(hashAuditRow(GENESIS_HASH, { ...row, action: 'auth.logout' })).not.toBe(h);
    expect(hashAuditRow(GENESIS_HASH, { ...row, payload: { deviceId: 'd1', score: 11 } })).not.toBe(h);
    expect(hashAuditRow(GENESIS_HASH, { ...row, createdAt: new Date('2026-01-01T00:00:00.124Z') })).not.toBe(h);
  });
});
