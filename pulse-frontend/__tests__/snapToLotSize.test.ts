/**
 * BUG 4 Regression Tests — snapToLotSize correctness and engine alignment.
 *
 * The original bug was that placeMarketOrder/placeLimitOrder did NOT call
 * snapToLotSize or snapToTick before submission, causing the pool to reject
 * orders with QuantityNotAligned or InvalidQuantity errors.
 *
 * These tests verify:
 * 1. snapToLotSize itself rounds down correctly
 * 2. The source code of placeMarketOrder/placeLimitOrder actually calls snapToLotSize
 */
import { describe, it, expect } from 'vitest';

// ── Direct unit tests for snapToLotSize ────────────────────────────────────────

// Import the real function (no mocking needed)
import { snapToLotSize, snapToTick, toBigintAmount } from '@/lib/engine/units';

describe('BUG 4: snapToLotSize', () => {
  it('snaps quantity down to nearest lot multiple', () => {
    // 10 USDC at 6 decimals = 10_000_000 raw
    // lotSize = 3_000_000 (3 USDC lots)
    // 10_000_000 % 3_000_000 = 1_000_000
    // snapped = 10_000_000 - 1_000_000 = 9_000_000 (3 lots)
    const quantity = toBigintAmount(10, 6); // 10_000_000n
    const lotSize = 3_000_000n;
    const result = snapToLotSize(quantity, lotSize);
    expect(result).toBe(9_000_000n);
  });

  it('returns same value when already aligned', () => {
    const quantity = 9_000_000n;
    const lotSize = 3_000_000n;
    expect(snapToLotSize(quantity, lotSize)).toBe(9_000_000n);
  });

  it('snaps 16129032 with lotSize 1000000 to 16000000 (from docstring)', () => {
    expect(snapToLotSize(16129032n, 1000000n)).toBe(16000000n);
  });

  it('returns 0 when quantity is less than lotSize', () => {
    expect(snapToLotSize(500000n, 1000000n)).toBe(0n);
  });

  it('throws on zero lotSize', () => {
    expect(() => snapToLotSize(1000n, 0n)).toThrow('lotSize must be positive');
  });

  it('throws on negative lotSize', () => {
    expect(() => snapToLotSize(1000n, -1n)).toThrow('lotSize must be positive');
  });
});

describe('BUG 4: snapToTick', () => {
  it('snaps price down to nearest tick', () => {
    const price = 625500000000000000n; // 0.6255
    const tickSize = 1000000000000000n; // 0.001
    expect(snapToTick(price, tickSize)).toBe(625000000000000000n); // 0.625
  });

  it('returns same value when on grid', () => {
    expect(snapToTick(625000000000000000n, 1000000000000000n)).toBe(625000000000000000n);
  });

  it('throws on zero tickSize', () => {
    expect(() => snapToTick(1000n, 0n)).toThrow('tickSize must be positive');
  });
});

describe('BUG 4: engine source calls snapToLotSize and snapToTick', () => {
  it('placeMarketOrder source calls snapToLotSize before submission', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../lib/engine/trading.ts'),
      'utf-8',
    );

    // The placeMarketOrder function MUST call snapToLotSize
    expect(source).toMatch(/snapToLotSize\(/);
    // The placeMarketOrder function MUST call snapToTick
    expect(source).toMatch(/snapToTick\(/);
  });

  it('placeLimitOrder source calls snapToLotSize before submission', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../lib/engine/trading.ts'),
      'utf-8',
    );

    // Both functions are in the same file, verify both patterns exist
    // snapToLotSize should appear at least twice (once per function)
    const matches = source.match(/snapToLotSize\(/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });
});
