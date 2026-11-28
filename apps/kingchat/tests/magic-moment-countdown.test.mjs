import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getMagicMomentCountdown } from '../src/features/magic-moments/magicMomentCountdown.mjs';

describe('Magic Moments reveal countdown', () => {
  it('splits a future date into day, hour, minute and second fields', () => {
    const now = Date.parse('2026-11-28T19:00:00+05:00');
    const result = getMagicMomentCountdown('2026-11-30T22:04:05+05:00', now);
    assert.deepEqual(result, { isReady: false, days: 2, hours: 3, minutes: 4, seconds: 5 });
  });

  it('returns a ready countdown with zero remaining time after the reveal date', () => {
    const result = getMagicMomentCountdown('2026-11-28T18:59:59+05:00', Date.parse('2026-11-28T19:00:00+05:00'));
    assert.deepEqual(result, { isReady: true, days: 0, hours: 0, minutes: 0, seconds: 0 });
  });

  it('returns null for empty or invalid dates', () => {
    assert.equal(getMagicMomentCountdown('', Date.now()), null);
    assert.equal(getMagicMomentCountdown('not-a-date', Date.now()), null);
  });
});
