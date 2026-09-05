import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock wagmi hooks
vi.mock('wagmi', () => ({
  useConnect: () => ({
    connect: vi.fn(),
    connectors: [],
    isPending: false,
  }),
  useAccount: () => ({
    isConnected: false,
    address: undefined,
  }),
  useBalance: () => ({
    data: undefined,
  }),
}));

// Mock the PulseWalletContext
vi.mock('@/lib/wallet/PulseWalletContext', () => ({
  usePulseWallet: () => ({
    connectionStatus: 'disconnected',
    address: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    sttBalance: '0.0',
    usdcBalance: '0.00',
    error: null,
  }),
}));

// Mock useTestUsdcBalance
vi.mock('@/lib/wallet/useTestUsdcBalance', () => ({
  useTestUsdcBalance: () => ({
    balance: '1,250.00',
    rawBalance: 1250,
    isLoading: false,
    refetch: vi.fn(),
  }),
}));

import ConnectButton from '@/components/markets/ConnectButton';

describe('ConnectButton', () => {
  it('renders the connect button when disconnected', () => {
    render(<ConnectButton />);
    const button = screen.getByRole('button', { name: /connect/i });
    expect(button).toBeInTheDocument();
  });

  it('shows connect text', () => {
    render(<ConnectButton />);
    expect(screen.getByText('Connect')).toBeInTheDocument();
  });

  it('renders test USDC balance and address pill when connected', async () => {
    const wagmi = await import('wagmi');
    vi.spyOn(wagmi, 'useAccount').mockReturnValue({
      isConnected: true,
      address: '0x1234567890abcdef1234567890abcdef12345678',
    } as any);

    render(<ConnectButton />);
    expect(screen.getByText('1,250.00')).toBeInTheDocument();
    expect(screen.getByText('test USDC')).toBeInTheDocument();
    expect(screen.getByText('0x1234...5678')).toBeInTheDocument();
  });
});


