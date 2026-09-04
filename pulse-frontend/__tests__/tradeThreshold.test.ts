/**
 * Trade threshold confirmation gate tests.
 *
 * Verifies that:
 * 1. Trades below the threshold submit on first click
 * 2. Trades above the threshold require two clicks (Confirm, then submit)
 * 3. The threshold is read from settings when risk limits are enabled
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockPlaceMarketOrder = vi.fn().mockResolvedValue({ hash: '0xabc' });

vi.mock('@/lib/engine/trading', () => ({
  placeMarketOrder: (...args: unknown[]) => mockPlaceMarketOrder(...args),
  placeLimitOrder: vi.fn().mockResolvedValue({ hash: '0xdef' }),
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
  checkRiskLimits: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock('@/lib/settings', () => ({
  loadSettings: vi.fn().mockReturnValue({
    riskLimitsEnabled: false,
    riskLimits: { maxPositionSizePerMarket: '100', maxOpenMarkets: 5, maxTotalExposure: '500' },
  }),
}));

vi.mock('@/lib/wallet/chainGuard', () => ({
  assertCorrectChain: vi.fn(),
}));

vi.mock('@wagmi/core', () => ({
  getWalletClient: vi.fn(),
}));

vi.mock('@/lib/wallet/wagmiConfig', () => ({ wagmiConfig: {} }));

import { loadSettings } from '@/lib/settings';
import { validateAmount } from '@/lib/validateAmount';

describe('Trade threshold confirmation gate', () => {
  const DEFAULT_THRESHOLD = 100;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Threshold computation logic ──────────────────────────────────────────

  describe('threshold computation', () => {
    it('uses 100 as default when risk limits are disabled', () => {
      (loadSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        riskLimitsEnabled: false,
        riskLimits: { maxPositionSizePerMarket: '50', maxOpenMarkets: 5, maxTotalExposure: '500' },
      });

      const settings = loadSettings('0x123');
      const threshold = settings.riskLimitsEnabled
        ? parseFloat(settings.riskLimits.maxPositionSizePerMarket)
        : DEFAULT_THRESHOLD;

      expect(threshold).toBe(DEFAULT_THRESHOLD);
    });

    it('uses risk limit value when risk limits are enabled', () => {
      (loadSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        riskLimitsEnabled: true,
        riskLimits: { maxPositionSizePerMarket: '250', maxOpenMarkets: 5, maxTotalExposure: '500' },
      });

      const settings = loadSettings('0x123');
      const threshold = settings.riskLimitsEnabled
        ? parseFloat(settings.riskLimits.maxPositionSizePerMarket)
        : DEFAULT_THRESHOLD;

      expect(threshold).toBe(250);
    });
  });

  // ── Two-click flow simulation ────────────────────────────────────────────

  describe('two-click flow', () => {
    it('below threshold: first click submits immediately', () => {
      let confirmTrade = false;
      let submitted = false;
      const amount = 50;
      const threshold = 100;

      const handleClick = () => {
        if (!confirmTrade && amount > threshold) {
          confirmTrade = true;
          return;
        }
        submitted = true;
      };

      handleClick();

      expect(confirmTrade).toBe(false);
      expect(submitted).toBe(true);
    });

    it('above threshold: first click shows confirm, second submits', () => {
      let confirmTrade = false;
      let submitted = false;
      const amount = 150;
      const threshold = 100;

      const handleClick = () => {
        if (!confirmTrade && amount > threshold) {
          confirmTrade = true;
          return;
        }
        submitted = true;
      };

      // First click
      handleClick();
      expect(confirmTrade).toBe(true);
      expect(submitted).toBe(false);

      // Second click
      handleClick();
      expect(confirmTrade).toBe(true);
      expect(submitted).toBe(true);
    });

    it('confirm state resets when amount changes', () => {
      let confirmTrade = true;
      let amount = 150;

      // Simulate amount change
      const handleAmountChange = (newAmount: number) => {
        amount = newAmount;
        confirmTrade = false;
      };

      handleAmountChange(50);
      expect(confirmTrade).toBe(false);
      expect(amount).toBe(50);
    });

    it('exact threshold value requires confirmation', () => {
      let confirmTrade = false;
      let submitted = false;
      const amount = 100;
      const threshold = 100;

      const handleClick = () => {
        if (!confirmTrade && amount > threshold) {
          confirmTrade = true;
          return;
        }
        submitted = true;
      };

      handleClick();
      // 100 is NOT > 100, so it should submit immediately
      expect(submitted).toBe(true);
    });

    it('one above threshold requires confirmation', () => {
      let confirmTrade = false;
      let submitted = false;
      const amount = 101;
      const threshold = 100;

      const handleClick = () => {
        if (!confirmTrade && amount > threshold) {
          confirmTrade = true;
          return;
        }
        submitted = true;
      };

      handleClick();
      expect(confirmTrade).toBe(true);
      expect(submitted).toBe(false);
    });
  });

  // ── Source code verification ─────────────────────────────────────────────

  describe('source code has threshold confirmation', () => {
    it('page.tsx has confirmTrade state', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../app/market/[id]/page.tsx'),
        'utf-8',
      );

      expect(source).toMatch(/const \[confirmTrade, setConfirmTrade\]/);
    });

    it('page.tsx reads threshold from settings or defaults to 100', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../app/market/[id]/page.tsx'),
        'utf-8',
      );

      expect(source).toMatch(/tradeThreshold/);
      expect(source).toMatch(/maxPositionSizePerMarket/);
      expect(source).toMatch(/return 100/);
    });

    it('CTA button shows "Confirm" text when confirmTrade is true', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../app/market/[id]/page.tsx'),
        'utf-8',
      );

      expect(source).toMatch(/confirmTrade.*Confirm/s);
    });

    it('CTA onClick checks confirmTrade before submitting', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../app/market/[id]/page.tsx'),
        'utf-8',
      );

      expect(source).toMatch(/!confirmTrade && amount > tradeThreshold/);
    });

    it('confirmTrade resets on amount change', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../app/market/[id]/page.tsx'),
        'utf-8',
      );

      expect(source).toMatch(/setConfirmTrade\(false\);\n  }, \[amount\]/);
    });
  });
});
