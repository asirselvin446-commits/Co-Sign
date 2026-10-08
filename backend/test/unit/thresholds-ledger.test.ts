import { describe, expect, it } from 'vitest';
import { requiredApprovals } from '../../src/modules/recovery/recovery.service.js';
import { exceedsDailyLimit } from '../../src/modules/ledger/ledger.service.js';

describe('recovery quorum', () => {
  it('needs 2 approvals with 2+ guardians, otherwise 1', () => {
    expect(requiredApprovals(0)).toBe(1);
    expect(requiredApprovals(1)).toBe(1);
    expect(requiredApprovals(2)).toBe(2);
    expect(requiredApprovals(5)).toBe(2);
  });
});

describe('daily transfer limit', () => {
  it('allows up to and including the limit, and rejects anything over', () => {
    expect(exceedsDailyLimit(0n, 1_000_000n, 1_000_000n)).toBe(false);
    expect(exceedsDailyLimit(999_999n, 1n, 1_000_000n)).toBe(false);
    expect(exceedsDailyLimit(999_999n, 2n, 1_000_000n)).toBe(true);
    expect(exceedsDailyLimit(0n, 1_000_001n, 1_000_000n)).toBe(true);
  });
  it('works for values beyond JavaScript number precision', () => {
    expect(exceedsDailyLimit(9_007_199_254_740_993n, 1n, 9_007_199_254_740_994n)).toBe(false);
    expect(exceedsDailyLimit(9_007_199_254_740_993n, 2n, 9_007_199_254_740_994n)).toBe(true);
  });
});
