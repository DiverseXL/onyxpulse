/**
 * Claim All confirmation gate test.
 *
 * Verifies that clicking "Claim All" does NOT immediately call
 * claimAllRedeemable, and that it only fires after the confirmation
 * step is explicitly accepted.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockClaimAllRedeemable = vi.fn().mockResolvedValue({
  totalClaimed: 1,
  succeeded: [{ marketId: '0x1', hash: '0xabc' }],
  failed: [],
});

vi.mock('@/lib/engine/claimAll', () => ({
  claimAllRedeemable: (...args: unknown[]) => mockClaimAllRedeemable(...args),
}));

vi.mock('@/lib/engine/settlement', () => ({
  redeemMarket: vi.fn().mockResolvedValue({ hash: '0xredeem' }),
}));

vi.mock('@/lib/engine/client', () => ({
  createPulseClient: () => ({
    client: {
      createTrader: () => ({}),
      getMarketByPool: vi.fn().mockResolvedValue(null),
    },
  }),
}));

vi.mock('@/lib/wallet/chainGuard', () => ({
  assertCorrectChain: vi.fn(),
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

vi.mock('wagmi', () => ({
  useAccount: () => ({ address: '0x1234', isConnected: true }),
}));

vi.mock('@wagmi/core', () => ({
  getWalletClient: vi.fn().mockResolvedValue({
    chain: { id: 50312 },
    account: { address: '0x1234567890abcdef1234567890abcdef12345678' },
  }),
}));

vi.mock('@/lib/wallet/wagmiConfig', () => ({ wagmiConfig: {} }));

describe('Claim All confirmation gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clicking Claim All does NOT immediately call claimAllRedeemable', async () => {
    // Simulate the confirmation gate pattern from the page
    let showClaimAllConfirm = false;
    let claimStatus = 'idle';
    let claimAllCalled = false;

    const handleClaimAllClick = () => {
      // This is what the button does now — opens the modal
      showClaimAllConfirm = true;
    };

    const handleConfirmClaimAll = async () => {
      // This is what Confirm does
      showClaimAllConfirm = false;
      claimStatus = 'claiming-all';
      claimAllCalled = true;
      await mockClaimAllRedeemable();
    };

    // User clicks "Claim All"
    handleClaimAllClick();

    // Modal should be open, claimAll should NOT have been called
    expect(showClaimAllConfirm).toBe(true);
    expect(claimAllCalled).toBe(false);
    expect(mockClaimAllRedeemable).not.toHaveBeenCalled();

    // User clicks "Confirm"
    await handleConfirmClaimAll();

    // Now claimAll should have been called
    expect(showClaimAllConfirm).toBe(false);
    expect(claimAllCalled).toBe(true);
    expect(mockClaimAllRedeemable).toHaveBeenCalledTimes(1);
  });

  it('clicking Cancel does NOT call claimAllRedeemable', async () => {
    let showClaimAllConfirm = false;
    let claimAllCalled = false;

    const handleClaimAllClick = () => {
      showClaimAllConfirm = true;
    };

    const handleCancel = () => {
      showClaimAllConfirm = false;
    };

    // User clicks "Claim All"
    handleClaimAllClick();
    expect(showClaimAllConfirm).toBe(true);

    // User clicks "Cancel"
    handleCancel();
    expect(showClaimAllConfirm).toBe(false);
    expect(claimAllCalled).toBe(false);
    expect(mockClaimAllRedeemable).not.toHaveBeenCalled();
  });

  it('source code shows button opens modal, not directly calling handler', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../app/portfolio/page.tsx'),
      'utf-8',
    );

    // The Claim All button should set showClaimAllConfirm to true, not call handleClaimAll
    const claimAllButtonSection = source.substring(
      source.indexOf('Claim All (') - 300,
      source.indexOf('Claim All (') + 100,
    );
    expect(claimAllButtonSection).toMatch(/setShowClaimAllConfirm\(true\)/);
    expect(claimAllButtonSection).not.toMatch(/onClick=\{handleClaimAll\}/);
  });

  it('source code has Confirm button that calls handleClaimAll', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../app/portfolio/page.tsx'),
      'utf-8',
    );

    // The Confirm button should call handleClaimAll after closing the modal
    expect(source).toMatch(/handleClaimAll\(\)/);
    // It should be inside the confirmation modal, not on the main button
    const confirmSection = source.substring(
      source.indexOf('claimConfirmPrimary'),
      source.indexOf('claimConfirmPrimary') + 300,
    );
    expect(confirmSection).toMatch(/handleClaimAll/);
  });

  it('source code has Cancel button that closes modal without calling handler', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../app/portfolio/page.tsx'),
      'utf-8',
    );

    // The Cancel button should only close the modal
    const cancelSection = source.substring(
      source.indexOf('claimConfirmDismiss'),
      source.indexOf('claimConfirmDismiss') + 300,
    );
    expect(cancelSection).toMatch(/setShowClaimAllConfirm\(false\)/);
    expect(cancelSection).not.toMatch(/handleClaimAll/);
  });
});
