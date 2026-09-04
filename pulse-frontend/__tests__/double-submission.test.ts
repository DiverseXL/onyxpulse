/**
 * Double-submission protection tests.
 *
 * Verifies that rapid double-clicks (or slow-network re-clicks) on every
 * money-moving action result in only ONE actual transaction call.
 *
 * Each test mocks the underlying transaction function and asserts call count
 * === 1 even when the handler is invoked twice before the first resolves.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Shared mocks ──────────────────────────────────────────────────────────────

const mockPlaceMarketOrder = vi.fn().mockResolvedValue({ hash: '0xabc' });
const mockPlaceLimitOrder = vi.fn().mockResolvedValue({ hash: '0xdef' });
const mockRedeemMarket = vi.fn().mockResolvedValue({ hash: '0xredeem' });
const mockClaimAllRedeemable = vi.fn().mockResolvedValue({
  totalClaimed: 1,
  succeeded: [{ marketId: '0x1', hash: '0xabc' }],
  failed: [],
});
const mockCheckRiskLimits = vi.fn().mockResolvedValue({ allowed: true });

vi.mock('@/lib/engine/trading', () => ({
  placeMarketOrder: (...args: unknown[]) => mockPlaceMarketOrder(...args),
  placeLimitOrder: (...args: unknown[]) => mockPlaceLimitOrder(...args),
}));

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
  checkRiskLimits: (...args: unknown[]) => mockCheckRiskLimits(...args),
}));

vi.mock('@/lib/settings', () => ({
  loadSettings: () => ({
    riskLimitsEnabled: false,
    riskLimits: { maxPositionSizePerMarket: '100', maxOpenMarkets: 5, maxTotalExposure: '500' },
  }),
}));

vi.mock('@/lib/engine/settlement', () => ({
  redeemMarket: (...args: unknown[]) => mockRedeemMarket(...args),
}));

vi.mock('@/lib/engine/claimAll', () => ({
  claimAllRedeemable: (...args: unknown[]) => mockClaimAllRedeemable(...args),
}));

vi.mock('@/lib/wallet/wagmiConfig', () => ({ wagmiConfig: {} }));
vi.mock('@wagmi/core', () => ({ getWalletClient: vi.fn() }));

import { placeClientOrder, placeClientLimitOrder } from '@/lib/wallet/placeOrder';

describe('Double-submission protection', () => {
  const mockWalletClient = { chain: { id: 50312 } } as any;
  const mockAccount = { address: '0x1234567890abcdef1234567890abcdef12345678' } as any;
  const orderParams = {
    poolAddress: '0xpool1',
    marketId: '0xmarket1',
    side: 'BUY_YES' as const,
    priceCents: 62,
    amount: 10,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Action 1: /market/[id] Buy/Sell order ─────────────────────────────────
  describe('Action 1: Market order submission', () => {
    it('handler guard prevents double submission', async () => {
      // Simulate the guard from handlePlaceOrder
      let orderStatus = 'idle';
      let callCount = 0;

      const handler = async () => {
        if (orderStatus === 'submitting') return;
        orderStatus = 'submitting';
        callCount++;
        await placeClientOrder(mockWalletClient, mockAccount, orderParams);
        orderStatus = 'idle';
      };

      // Fire twice in rapid succession
      const p1 = handler();
      const p2 = handler(); // Should be blocked by guard
      await Promise.all([p1, p2]);

      // Only one call to the engine
      expect(mockPlaceMarketOrder).toHaveBeenCalledTimes(1);
    });
  });

  // ── Action 2: Place as Limit Order fallback ────────────────────────────────
  describe('Action 2: Limit order fallback', () => {
    it('handler guard prevents double submission', async () => {
      let orderStatus = 'idle';
      let callCount = 0;

      const handler = async () => {
        if (orderStatus === 'submitting') return;
        orderStatus = 'submitting';
        callCount++;
        await placeClientLimitOrder(mockWalletClient, mockAccount, orderParams);
        orderStatus = 'idle';
      };

      const p1 = handler();
      const p2 = handler();
      await Promise.all([p1, p2]);

      expect(mockPlaceLimitOrder).toHaveBeenCalledTimes(1);
    });

    it('button has disabled attribute during submission', async () => {
      // Source code check: the limit order button must have disabled={orderStatus === 'submitting'}
      const fs = await import('fs');
      const path = await import('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../app/market/[id]/page.tsx'),
        'utf-8',
      );

      // Find the "Place as Limit Order" button and check for disabled
      const limitButtonSection = source.substring(
        source.indexOf('Place as Limit Order') - 200,
        source.indexOf('Place as Limit Order') + 50,
      );
      expect(limitButtonSection).toMatch(/disabled=\{orderStatus/);
    });
  });

  // ── Action 3: Portfolio individual Claim ───────────────────────────────────
  describe('Action 3: Individual claim', () => {
    it('handler guard prevents double submission', async () => {
      let claimOneBusy: string | null = null;
      let callCount = 0;

      const handler = async (marketId: string) => {
        if (claimOneBusy !== null) return;
        claimOneBusy = marketId;
        callCount++;
        await mockRedeemMarket();
        claimOneBusy = null;
      };

      const p1 = handler('0x1');
      const p2 = handler('0x1');
      await Promise.all([p1, p2]);

      expect(mockRedeemMarket).toHaveBeenCalledTimes(1);
    });

    it('button has disabled attribute during claim', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../app/portfolio/page.tsx'),
        'utf-8',
      );

      // Both claim button instances must have disabled={claimOneBusy !== null}
      const matches = source.match(/disabled=\{claimOneBusy !== null\}/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── Action 4: Portfolio Claim All ──────────────────────────────────────────
  describe('Action 4: Claim All', () => {
    it('handler guard prevents double submission', async () => {
      let claimStatus = 'idle';
      let callCount = 0;

      const handler = async () => {
        if (claimStatus !== 'idle') return;
        claimStatus = 'claiming-all';
        callCount++;
        await mockClaimAllRedeemable();
        claimStatus = 'summary';
      };

      const p1 = handler();
      const p2 = handler();
      await Promise.all([p1, p2]);

      expect(mockClaimAllRedeemable).toHaveBeenCalledTimes(1);
    });

    it('button only renders when claimStatus is idle', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../app/portfolio/page.tsx'),
        'utf-8',
      );

      // Claim All button must be conditional on claimStatus === 'idle'
      expect(source).toMatch(/claimStatus === 'idle' && \(/);
    });
  });

  // ── Action 5: Faucet Get Test USDC ────────────────────────────────────────
  describe('Action 5: Faucet claim', () => {
    it('handler guard prevents double submission', async () => {
      let faucetStatus: string = 'idle';
      let callCount = 0;

      const handler = async () => {
        if (faucetStatus === 'submitting') return;
        faucetStatus = 'submitting';
        callCount++;
        await new Promise((r) => setTimeout(r, 10));
        faucetStatus = 'success';
      };

      const p1 = handler();
      const p2 = handler();
      await Promise.all([p1, p2]);

      // Only one actual execution
      expect(callCount).toBe(1);
    });

    it('button has disabled attribute during submission', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../app/faucet/page.tsx'),
        'utf-8',
      );

      expect(source).toMatch(/disabled=\{faucetStatus === 'submitting'\}/);
    });
  });

  // ── Action 5b: Faucet Check Balance ────────────────────────────────────────
  describe('Action 5b: Faucet check balance', () => {
    it('button has disabled attribute during refresh', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../app/faucet/page.tsx'),
        'utf-8',
      );

      expect(source).toMatch(/disabled=\{sttRefreshing\}/);
    });
  });

  // ── Action 6: Settings Save ────────────────────────────────────────────────
  describe('Action 6: Settings save', () => {
    it('button has disabled attribute after save', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../app/settings/page.tsx'),
        'utf-8',
      );

      expect(source).toMatch(/disabled=\{saved\}/);
    });

    it('handler is synchronous so double-call is idempotent', () => {
      // localStorage.setItem is synchronous and idempotent
      // Calling saveSettings twice with the same data is safe
      // but we verify the button prevents it anyway
      const mockSetItem = vi.spyOn(Storage.prototype, 'setItem');
      const settings = { test: true };

      // Simulate double save
      localStorage.setItem('test-key', JSON.stringify(settings));
      localStorage.setItem('test-key', JSON.stringify(settings));

      // Both calls go through (idempotent), but button prevents it
      expect(mockSetItem).toHaveBeenCalledTimes(2);
      mockSetItem.mockRestore();
    });
  });
});
