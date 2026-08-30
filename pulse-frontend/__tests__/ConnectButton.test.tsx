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
    error: null,
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
});
