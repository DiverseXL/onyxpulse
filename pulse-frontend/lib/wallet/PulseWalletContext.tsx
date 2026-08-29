'use client';

/**
 * PulseWalletContext -- wagmi-based wallet state.
 *
 * Single connection path (EOA via MetaMask / injected wallet).
 */

import {
  createContext,
  useCallback,
  useMemo,
  useContext,
} from 'react';
import { useAccount, useBalance, useDisconnect } from 'wagmi';
import { formatEther } from 'viem';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface PulseWalletValue {
  /** Current connection status. */
  connectionStatus: ConnectionStatus;
  /** The connected account address, or null. */
  address: string | null;
  /** Connect wallet -- opens MetaMask / injected wallet prompt. */
  connect: () => void;
  /** Disconnect the current wallet. */
  disconnect: () => void;
  /** Live STT balance in human-readable format (e.g. "0.0"). */
  sttBalance: string;
  /** Last connection error, if any. */
  error: string | null;
}

/* -------------------------------------------------------------------------- */
/*  Context                                                                    */
/* -------------------------------------------------------------------------- */

const PulseWalletContext = createContext<PulseWalletValue | null>(null);

/* -------------------------------------------------------------------------- */
/*  Provider                                                                   */
/* -------------------------------------------------------------------------- */

export function PulseWalletProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnected, isConnecting } = useAccount();
  const { disconnect } = useDisconnect();

  /* -- STT native balance ------------------------------------------------- */
  const { data: sttData } = useBalance({
    address: address as `0x${string}` | undefined,
    query: {
      refetchInterval: 15_000,
    },
  });

  const sttBalance = useMemo(() => {
    if (!sttData) return '0.0';
    return formatEther(sttData.value);
  }, [sttData]);

  /* -- Connection status --------------------------------------------------- */
  const connectionStatus: ConnectionStatus = useMemo(() => {
    if (isConnecting) return 'connecting';
    if (isConnected) return 'connected';
    return 'disconnected';
  }, [isConnected, isConnecting]);

  /* -- Connect handler ----------------------------------------------------- */
  // wagmi's connect() is handled at the component level (ConnectButton)
  // via useConnect(). This is a no-op placeholder for the context shape.
  const connect = useCallback(() => {
    // No-op: ConnectButton handles connection via useConnect()
  }, []);

  const value: PulseWalletValue = useMemo(
    () => ({
      connectionStatus,
      address: address ?? null,
      connect,
      disconnect,
      sttBalance,
      error: null,
    }),
    [connectionStatus, address, connect, disconnect, sttBalance],
  );

  return (
    <PulseWalletContext.Provider value={value}>
      {children}
    </PulseWalletContext.Provider>
  );
}

/* -------------------------------------------------------------------------- */
/*  Hook                                                                       */
/* -------------------------------------------------------------------------- */

export function usePulseWallet(): PulseWalletValue {
  const ctx = useContext(PulseWalletContext);
  if (!ctx) {
    throw new Error('usePulseWallet must be used within a <PulseWalletProvider>');
  }
  return ctx;
}
