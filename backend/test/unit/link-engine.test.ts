import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeLink, analyzeMessage, extractLinks, osaDistance, registrableDomain } from '../../src/modules/links/link.engine.js';

interface Vectors {
  links: Array<{ input: string; expect: Record<string, unknown> }>;
  messages: Array<{ input: string; expect: { phrases: string[]; linkFlags: string[]; worstVerdict: string | null; worstDomain: string | null; scam: boolean } }>;
}
const v = JSON.parse(readFileSync(join(import.meta.dirname, '../../../shared/link-vectors.json'), 'utf8')) as Vectors;

describe('link analyser (shared vectors, also run by the phone)', () => {
  for (const c of v.links) {
    it(`link: ${c.input}`, () => {
      expect(analyzeLink(c.input)).toEqual(c.expect);
    });
  }
  for (const c of v.messages) {
    it(`message: ${c.input.slice(0, 60)}`, () => {
      const m = analyzeMessage(c.input);
      expect({
        phrases: m.phrases,
        linkFlags: m.linkFlags,
        worstVerdict: m.worst?.verdict ?? null,
        worstDomain: m.worst?.registrableDomain ?? null,
        scam: m.scam,
      }).toEqual(c.expect);
    });
  }
});

describe('link helpers', () => {
  it('measures near-miss spellings, counting a swap as one change', () => {
    expect(osaDistance('google', 'googel')).toBe(1);
    expect(osaDistance('paytm', 'paytn')).toBe(1);
    expect(osaDistance('phone', 'phonepe')).toBe(2);
  });
  it('finds the part of a domain that someone actually registered', () => {
    expect(registrableDomain('netbanking.example.co.in')).toBe('example.co.in');
    expect(registrableDomain('a.b.example.com')).toBe('example.com');
  });
  it('picks links out of message text without mistaking amounts or times', () => {
    expect(extractLinks('Pay Rs.500 by 5.30pm at (www.example.com). Or bit.ly/x!')).toEqual(['www.example.com', 'bit.ly/x']);
    expect(extractLinks('mail me at amma@gmail.com')).toEqual([]);
  });
});
