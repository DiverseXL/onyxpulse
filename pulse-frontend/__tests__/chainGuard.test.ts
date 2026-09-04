/**
 * Chain-ID validation guard tests.
 *
 * Verifies that every transaction submission point rejects immediately
 * with a clear PulseEngineError when the wallet is on the wrong chain,
 * and that NO transaction is attempted.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockPlaceMarketOrder = vi.fn().mockResolvedValue({ hash: '0xabc' });
const mockPlaceLimitOrder = vi.fn().mockResolvedValue({ hash: '0xdef' });
const mockSendTransaction = vi.fn().mockResolvedValue({ hash: '0xsend' });

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
  checkRiskLimits: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock('@/lib/settings', () => ({
  loadSettings: () => ({
    riskLimitsEnabled: false,
    riskLimits: { maxPositionSizePerMarket: '100', maxOpenMarkets: 5, maxTotalExposure: '500' },
  }),
}));

vi.mock('@wagmi/core', () => ({
  getWalletClient: vi.fn(),
}));

vi.mock('@/lib/wallet/wagmiConfig', () => ({
  wagmiConfig: {},
}));

import { placeClientOrder, placeClientLimitOrder } from '@/lib/wallet/placeOrder';
import { assertCorrectChain, REQUIRED_CHAIN_ID } from '@/lib/wallet/chainGuard';
import { PulseErrorCode, PulseEngineError } from '@/lib/engine/errors';

describe('Chain-ID validation guard', () => {
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

  // ── assertCorrectChain unit tests ──────────────────────────────────────────

  describe('assertCorrectChain', () => {
    it('passes when chain ID matches', () => {
      const walletClient = { chain: { id: REQUIRED_CHAIN_ID } } as any;
      expect(() => assertCorrectChain(walletClient, 'test')).not.toThrow();
    });

    it('throws WRONG_CHAIN when chain ID mismatches', () => {
      const walletClient = { chain: { id: 1 } } as any; // Ethereum mainnet
      expect(() => assertCorrectChain(walletClient, 'test')).toThrow(PulseEngineError);
      try {
        assertCorrectChain(walletClient, 'test');
      } catch (err) {
        expect(err).toBeInstanceOf(PulseEngineError);
        expect((err as PulseEngineError).code).toBe(PulseErrorCode.WRONG_CHAIN);
        expect((err as PulseEngineError).message).toContain('wrong network');
        expect((err as PulseEngineError).message).toContain('1');
        expect((err as PulseEngineError).message).toContain(String(REQUIRED_CHAIN_ID));
      }
    });

    it('throws when chain is undefined (no chain detected)', () => {
      const walletClient = { chain: undefined } as any;
      expect(() => assertCorrectChain(walletClient, 'test')).toThrow(PulseEngineError);
      try {
        assertCorrectChain(walletClient, 'test');
      } catch (err) {
        expect((err as PulseEngineError).code).toBe(PulseErrorCode.WRONG_CHAIN);
        expect((err as PulseEngineError).message).toContain('Could not detect');
      }
    });

    it('throws when chain is null', () => {
      const walletClient = { chain: null } as any;
      expect(() => assertCorrectChain(walletClient, 'test')).toThrow(PulseEngineError);
    });
  });

  // ── placeClientOrder chain validation ──────────────────────────────────────

  describe('placeClientOrder rejects wrong chain', () => {
    it('does NOT call placeMarketOrder when chain is wrong', async () => {
      const wrongChainClient = { chain: { id: 1 }, account: mockAccount } as any;

      await expect(
        placeClientOrder(wrongChainClient, mockAccount, orderParams),
      ).rejects.toThrow(PulseEngineError);

      // The engine function must NEVER be called
      expect(mockPlaceMarketOrder).not.toHaveBeenCalled();
    });

    it('throws WRONG_CHAIN error code', async () => {
      const wrongChainClient = { chain: { id: 1 }, account: mockAccount } as any;

      try {
        await placeClientOrder(wrongChainClient, mockAccount, orderParams);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(PulseEngineError);
        expect((err as PulseEngineError).code).toBe(PulseErrorCode.WRONG_CHAIN);
      }
    });
  });

  // ── placeClientLimitOrder chain validation ─────────────────────────────────

  describe('placeClientLimitOrder rejects wrong chain', () => {
    it('does NOT call placeLimitOrder when chain is wrong', async () => {
      const wrongChainClient = { chain: { id: 137 }, account: mockAccount } as any; // Polygon

      await expect(
        placeClientLimitOrder(wrongChainClient, mockAccount, orderParams),
      ).rejects.toThrow(PulseEngineError);

      expect(mockPlaceLimitOrder).not.toHaveBeenCalled();
    });

    it('throws WRONG_CHAIN error code', async () => {
      const wrongChainClient = { chain: { id: 137 }, account: mockAccount } as any;

      try {
        await placeClientLimitOrder(wrongChainClient, mockAccount, orderParams);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(PulseEngineError);
        expect((err as PulseEngineError).code).toBe(PulseErrorCode.WRONG_CHAIN);
      }
    });
  });

  // ── Source code verification ───────────────────────────────────────────────

  describe('source code has chain guard in all submission paths', () => {
    it('placeOrder.ts calls assertCorrectChain', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../lib/wallet/placeOrder.ts'),
        'utf-8',
      );

      const matches = source.match(/assertCorrectChain\(/g);
      expect(matches).not.toBeNull();
      // Must appear in both placeClientOrder and placeClientLimitOrder
      expect(matches!.length).toBeGreaterThanOrEqual(2);
    });

    it('portfolio page calls assertCorrectChain in createWalletTrader', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../app/portfolio/page.tsx'),
        'utf-8',
      );

      expect(source).toMatch(/assertCorrectChain\(/);
    });

    it('faucet page calls assertCorrectChain before sendTransaction', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../app/faucet/page.tsx'),
        'utf-8',
      );

      // assertCorrectChain must appear BEFORE sendTransaction
      const guardIdx = source.indexOf('assertCorrectChain(');
      const sendIdx = source.indexOf('sendTransaction(');
      expect(guardIdx).toBeGreaterThan(0);
      expect(sendIdx).toBeGreaterThan(guardIdx);
    });

    it('errors.ts includes WRONG_CHAIN error code', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../lib/engine/errors.ts'),
        'utf-8',
      );

      expect(source).toMatch(/WRONG_CHAIN/);
    });
  });
});
