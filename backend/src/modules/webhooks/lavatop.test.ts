/**
 * Tests for LavaTop webhook pure helper functions.
 * Run with: bun test src/modules/webhooks/lavatop.test.ts
 *
 * Only pure functions are tested here — no DB or Telegram calls.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { periodicityToDays, calcNewExpiry, verifyApiKey } from './lavatop';

// ---------------------------------------------------------------------------
// verifyApiKey
// ---------------------------------------------------------------------------

describe('verifyApiKey', () => {
  const originalSecret = process.env.LAVATOP_WEBHOOK_SECRET;

  beforeAll(() => {
    process.env.LAVATOP_WEBHOOK_SECRET = 'test-secret-abc123';
    // Re-import to pick up the env — but since config is cached we patch config directly.
    // The function reads config.LAVATOP_WEBHOOK_SECRET at call time via closure over `config`,
    // so we need to set it before the module loads. In this test file we just verify behaviour
    // when the function is called with matching / mismatching values.
  });

  afterAll(() => {
    if (originalSecret !== undefined) {
      process.env.LAVATOP_WEBHOOK_SECRET = originalSecret;
    } else {
      delete process.env.LAVATOP_WEBHOOK_SECRET;
    }
  });

  it('returns false for undefined header', () => {
    expect(verifyApiKey(undefined)).toBe(false);
  });

  it('returns false for empty string header', () => {
    expect(verifyApiKey('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// periodicityToDays
// ---------------------------------------------------------------------------

describe('periodicityToDays', () => {
  it('returns 90 for PERIOD_90_DAYS', () => {
    expect(periodicityToDays('PERIOD_90_DAYS')).toBe(90);
  });

  it('returns 180 for PERIOD_180_DAYS', () => {
    expect(periodicityToDays('PERIOD_180_DAYS')).toBe(180);
  });

  it('returns 30 for MONTHLY', () => {
    expect(periodicityToDays('MONTHLY')).toBe(30);
  });

  it('returns 30 for ONE_TIME', () => {
    expect(periodicityToDays('ONE_TIME')).toBe(30);
  });

  it('returns 30 for null (unknown offer)', () => {
    expect(periodicityToDays(null)).toBe(30);
  });

  it('returns 30 for undefined', () => {
    expect(periodicityToDays(undefined)).toBe(30);
  });

  it('returns 30 for an unknown string', () => {
    expect(periodicityToDays('YEARLY')).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// calcNewExpiry
// ---------------------------------------------------------------------------

describe('calcNewExpiry', () => {
  it('adds days to a future expiry date', () => {
    const future = new Date();
    future.setDate(future.getDate() + 10); // expires in 10 days

    const result = calcNewExpiry(future, 30);

    const expectedMs = future.getTime() + 30 * 24 * 60 * 60 * 1000;
    // Allow 5 second tolerance for test execution time
    expect(Math.abs(result.getTime() - expectedMs)).toBeLessThan(5000);
  });

  it('uses today as base when expiry is in the past', () => {
    const past = new Date();
    past.setDate(past.getDate() - 5); // expired 5 days ago

    const before = Date.now();
    const result = calcNewExpiry(past, 30);
    const after = Date.now();

    const expectedMin = before + 30 * 24 * 60 * 60 * 1000;
    const expectedMax = after + 30 * 24 * 60 * 60 * 1000;
    expect(result.getTime()).toBeGreaterThanOrEqual(expectedMin - 100);
    expect(result.getTime()).toBeLessThanOrEqual(expectedMax + 100);
  });

  it('uses today as base when current is null', () => {
    const before = Date.now();
    const result = calcNewExpiry(null, 30);
    const after = Date.now();

    const expectedMin = before + 30 * 24 * 60 * 60 * 1000;
    const expectedMax = after + 30 * 24 * 60 * 60 * 1000;
    expect(result.getTime()).toBeGreaterThanOrEqual(expectedMin - 100);
    expect(result.getTime()).toBeLessThanOrEqual(expectedMax + 100);
  });

  it('defaults to 30 days when no days argument provided', () => {
    const before = Date.now();
    const result = calcNewExpiry(null);
    const after = Date.now();

    const expectedMin = before + 30 * 24 * 60 * 60 * 1000;
    const expectedMax = after + 30 * 24 * 60 * 60 * 1000;
    expect(result.getTime()).toBeGreaterThanOrEqual(expectedMin - 100);
    expect(result.getTime()).toBeLessThanOrEqual(expectedMax + 100);
  });

  it('correctly stacks 90-day period on future expiry', () => {
    const future = new Date();
    future.setDate(future.getDate() + 15); // 15 days left

    const result = calcNewExpiry(future, 90);
    const expected = new Date(future);
    expected.setDate(expected.getDate() + 90);

    expect(Math.abs(result.getTime() - expected.getTime())).toBeLessThan(1000);
  });
});

// ---------------------------------------------------------------------------
// isFirstPurchase logic (unit-tested as a pure expression)
// ---------------------------------------------------------------------------

describe('isFirstPurchase logic', () => {
  /**
   * The corrected formula from lavatop.ts:
   *   const isFirstPurchase = !user.firstPurchaseDate;
   *
   * Previously it was: !user.isPro && !user.firstPurchaseDate
   * which incorrectly classified lapsed subscribers as first-time buyers.
   */

  function isFirstPurchase(user: { firstPurchaseDate: Date | null; isPro: boolean }): boolean {
    return !user.firstPurchaseDate;
  }

  it('true when firstPurchaseDate is null (genuine new buyer)', () => {
    expect(isFirstPurchase({ firstPurchaseDate: null, isPro: false })).toBe(true);
  });

  it('false when firstPurchaseDate is set and subscription is active', () => {
    expect(isFirstPurchase({ firstPurchaseDate: new Date(), isPro: true })).toBe(false);
  });

  it('false when firstPurchaseDate is set but subscription lapsed (isPro=false)', () => {
    // This is the key case that was broken before the fix:
    // a lapsed subscriber should be treated as a RENEWAL, not a first purchase
    expect(isFirstPurchase({ firstPurchaseDate: new Date(2025, 0, 1), isPro: false })).toBe(false);
  });

  it('false for recurring payments (firstPurchaseDate always set after first payment)', () => {
    expect(isFirstPurchase({ firstPurchaseDate: new Date(), isPro: true })).toBe(false);
  });
});
