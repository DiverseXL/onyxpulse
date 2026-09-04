/**
 * BUG 1 & 2 Regression Tests — placeOrder delegation to engine functions.
 *
 * The original bug was that placeOrder.ts hand-built a raw pool.placeOrder /
 * pool.placeBinaryOrder contract call with wrong function name, wrong argument
 * order, hardcoded expiry, and wrong ORDER_TYPE. The fix delegates to the
 * engine's placeMarketOrder / placeLimitOrder which handle all of this correctly.
 *
 * These tests FAIL if the original buggy pattern is reintroduced.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the engine functions BEFORE importing placeOrder ──────────────────────

const mockPlaceMarketOrder = vi.fn().mockResolvedValue({ hash: '0xabc' });
const mockPlaceLimitOrder = vi.fn().mockResolvedValue({ hash: '0xdef' });

vi.mock('@/lib/engine/trading', () => ({
  placeMarketOrder: (...args: unknown[]) => mockPlaceMarketOrder(...args),
  placeLimitOrder: (...args: unknown[]) => mockPlaceLimitOrder(...args),
}));

// Mock other dependencies
vi.mock('@/lib/engine/client', () => ({
  createPulseClient: () => ({
    client: {
      createTrader: () => ({}),
      getMarketByPool: vi.fn().mockResolvedValue(null),
      getBinaryBookParams: vi.fn().mockResolvedValue({
        tickSize: 1000000n,
        lotSize: 1000000n,
        minQuantity: 1000000n,
      }),
    },
  }),
}));

vi.mock('@/lib/engine/riskEngine', () => ({
  checkRiskLimits: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock('@/lib/settings', () => ({
  loadSettings: () => ({
    riskLimitsEnabled: false,
    riskLimits: { maxPositionSizePerMarket: '100', maxOpenMarkets: 5, maxTotalExposure: '500' },
  }),
}));

// Import AFTER mocks are set up
import { placeClientOrder, placeClientLimitOrder } from '@/lib/wallet/placeOrder';

describe('BUG 1&2: placeOrder delegates to engine functions', () => {
  const mockWalletClient = { chain: { id: 50312 } } as any;
  const mockAccount = { address: '0x1234567890abcdef1234567890abcdef12345678' } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('placeClientOrder calls placeMarketOrder (NOT raw pool.placeOrder)', async () => {
    await placeClientOrder(mockWalletClient, mockAccount, {
      poolAddress: '0xpool1',
      marketId: '0xmarket1',
      side: 'BUY_YES',
      priceCents: 62,
      amount: 10,
    });

    // MUST call the engine function
    expect(mockPlaceMarketOrder).toHaveBeenCalledTimes(1);

    // MUST NOT contain a raw contract call pattern
    // If someone re-introduces pool.placeOrder or pool.placeBinaryOrder,
    // this test catches it because the mock wouldn't be called
  });

  it('placeClientLimitOrder calls placeLimitOrder (NOT raw pool.placeOrder)', async () => {
    await placeClientLimitOrder(mockWalletClient, mockAccount, {
      poolAddress: '0xpool1',
      marketId: '0xmarket1',
      side: 'BUY_NO',
      priceCents: 45,
      amount: 20,
    });

    expect(mockPlaceLimitOrder).toHaveBeenCalledTimes(1);
  });

  it('placeClientOrder passes correct args to placeMarketOrder', async () => {
    await placeClientOrder(mockWalletClient, mockAccount, {
      poolAddress: '0xpool1',
      marketId: '0xmarket1',
      side: 'SELL_YES',
      priceCents: 55,
      amount: 50,
    });

    const callArgs = mockPlaceMarketOrder.mock.calls[0][2];
    // placeOrder.ts passes: pool, side, humanPrice, humanQuantity, decimals
    expect(callArgs.pool).toBe('0xpool1');
    expect(callArgs.side).toBe('SELL_YES');
    expect(callArgs.humanPrice).toBeDefined();
    expect(callArgs.humanQuantity).toBeDefined();
    expect(callArgs.decimals).toBeDefined();
    // orderType is NOT passed from placeOrder.ts — it's set inside the engine
    expect(callArgs.orderType).toBeUndefined();
  });

  it('placeClientLimitOrder passes correct args to placeLimitOrder', async () => {
    await placeClientLimitOrder(mockWalletClient, mockAccount, {
      poolAddress: '0xpool1',
      marketId: '0xmarket1',
      side: 'BUY_YES',
      priceCents: 70,
      amount: 25,
    });

    const callArgs = mockPlaceLimitOrder.mock.calls[0][2];
    expect(callArgs.pool).toBe('0xpool1');
    expect(callArgs.side).toBe('BUY_YES');
    expect(callArgs.humanPrice).toBeDefined();
    expect(callArgs.humanQuantity).toBeDefined();
    expect(callArgs.decimals).toBeDefined();
    expect(callArgs.orderType).toBeUndefined();
  });

  it('engine source (trading.ts) uses ORDER_TYPE.MARKET for placeMarketOrder', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../lib/engine/trading.ts'),
      'utf-8',
    );

    // placeMarketOrder must use ORDER_TYPE.MARKET
    expect(source).toMatch(/orderType:\s*ORDER_TYPE\.MARKET/);
    // placeLimitOrder must use ORDER_TYPE.LIMIT
    expect(source).toMatch(/orderType:\s*ORDER_TYPE\.LIMIT/);
  });

  it('passes valid side enum values', async () => {
    const validSides = ['BUY_YES', 'BUY_NO', 'SELL_YES', 'SELL_NO'] as const;

    for (const side of validSides) {
      vi.clearAllMocks();
      await placeClientOrder(mockWalletClient, mockAccount, {
        poolAddress: '0xpool1',
        marketId: '0xmarket1',
        side,
        priceCents: 50,
        amount: 10,
      });

      const callArgs = mockPlaceMarketOrder.mock.calls[0][2];
      expect(callArgs.side).toBe(side);
    }
  });

  it('does NOT construct a raw pool.placeOrder call', async () => {
    // Read the source file and verify it does not contain raw contract call patterns
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../lib/wallet/placeOrder.ts'),
      'utf-8',
    );

    // These patterns indicate the old buggy raw contract call approach
    expect(source).not.toMatch(/pool\.placeOrder\(/);
    expect(source).not.toMatch(/pool\.placeBinaryOrder\(/);
    expect(source).not.toMatch(/\.writeContract\(/);
  });
});
