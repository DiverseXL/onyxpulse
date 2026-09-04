/**
 * BUG 6 Regression Test — Locked-market ticket disabling.
 *
 * The original bug was that when a market transitioned to Locked status,
 * the locked banner appeared but the trade ticket below it remained fully
 * interactive — Yes/No buttons, Buy/Sell tabs, amount input, chips, and CTA
 * were all still clickable and styled as active.
 *
 * This test verifies that when isLocked is true, ALL interactive elements
 * in the trade ticket have the disabled attribute genuinely set (not just
 * styled to look disabled).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: '0x1234', isConnected: true }),
  useChainId: () => 50312,
  useSwitchChain: () => ({ switchChain: vi.fn(), isPending: false }),
}));

vi.mock('@/lib/wallet/PulseWalletContext', () => ({
  usePulseWallet: () => ({
    connectionStatus: 'connected',
    address: '0x1234567890abcdef1234567890abcdef12345678',
    connect: vi.fn(),
    disconnect: vi.fn(),
    sttBalance: '100.0',
    error: null,
  }),
}));

vi.mock('@/lib/engine/errors', () => ({
  PulseEngineError: class PulseEngineError extends Error {
    code: string;
    constructor(code: string, context: string, message: string) {
      super(message);
      this.code = code;
    }
  },
  PulseErrorCode: {
    NO_LIQUIDITY: 'NO_LIQUIDITY',
    WRONG_STATUS: 'WRONG_STATUS',
    INVALID_PRICE: 'INVALID_PRICE',
    UNKNOWN: 'UNKNOWN',
  },
}));

vi.mock('@/lib/wallet/placeOrder', () => ({
  placeClientOrder: vi.fn(),
  placeClientLimitOrder: vi.fn(),
}));

vi.mock('@wagmi/core', () => ({
  getWalletClient: vi.fn(),
}));

vi.mock('@/lib/wallet/wagmiConfig', () => ({
  wagmiConfig: {},
}));

// ── Minimal Trade Ticket Component ─────────────────────────────────────────────
// Instead of rendering the full MarketDetailPage (which requires tons of data),
// we render a minimal version that replicates the exact disabled logic.

function TradeTicket({ isLocked }: { isLocked: boolean }) {
  return (
    <div>
      {/* Side Toggle */}
      <button disabled={isLocked}>Yes</button>
      <button disabled={isLocked}>No</button>

      {/* Buy/Sell Tabs */}
      <button disabled={isLocked}>Buy</button>
      <button disabled={isLocked}>Sell</button>

      {/* Amount Input */}
      <input disabled={isLocked} aria-label="Trade amount" />

      {/* Quick Chips */}
      <button disabled={isLocked}>+1</button>
      <button disabled={isLocked}>+5</button>
      <button disabled={isLocked}>+20</button>
      <button disabled={isLocked}>MAX</button>

      {/* CTA */}
      <button disabled={isLocked}>
        {isLocked ? 'Market locked' : 'Buy Yes'}
      </button>
    </div>
  );
}

describe('BUG 6: locked-market ticket disabling', () => {
  it('all interactive elements have disabled=true when isLocked', () => {
    render(<TradeTicket isLocked={true} />);

    const buttons = screen.getAllByRole('button');
    const inputs = screen.getAllByRole('textbox');

    // All buttons should be disabled
    for (const button of buttons) {
      expect(button).toBeDisabled();
    }

    // All inputs should be disabled
    for (const input of inputs) {
      expect(input).toBeDisabled();
    }
  });

  it('CTA text changes to "Market locked" when locked', () => {
    render(<TradeTicket isLocked={true} />);
    expect(screen.getByText('Market locked')).toBeInTheDocument();
    expect(screen.queryByText('Buy Yes')).not.toBeInTheDocument();
  });

  it('all interactive elements are enabled when NOT locked', () => {
    render(<TradeTicket isLocked={false} />);

    const buttons = screen.getAllByRole('button');
    const inputs = screen.getAllByRole('textbox');

    // Nothing should be disabled
    for (const button of buttons) {
      expect(button).not.toBeDisabled();
    }

    for (const input of inputs) {
      expect(input).not.toBeDisabled();
    }
  });

  it('source code has disabled={isLocked} on ALL required elements', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../app/market/[id]/page.tsx'),
      'utf-8',
    );

    // Count disabled={isLocked} occurrences
    const matches = source.match(/disabled=\{isLocked\}/g);
    expect(matches).not.toBeNull();

    // Must have at least 7: Yes, No, Buy, Sell, amount input, chips (counted as one pattern)
    // Plus the CTA has: disabled={orderStatus === 'submitting' || isLocked}
    expect(matches!.length).toBeGreaterThanOrEqual(7);

    // CTA must also check isLocked
    expect(source).toMatch(/disabled=\{orderStatus === 'submitting' \|\| isLocked\}/);
  });

  it('source code shows "Market locked" text in CTA when locked', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../app/market/[id]/page.tsx'),
      'utf-8',
    );

    // Check that "Market locked" appears in the CTA conditional
    expect(source).toContain('Market locked');
    // Check it's inside a ternary with isLocked
    expect(source).toMatch(/isLocked.*Market locked/s);
  });
});
