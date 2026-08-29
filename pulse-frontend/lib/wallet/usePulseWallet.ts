'use client';

import { useState, useCallback, useEffect } from 'react';
import { useConnect, useActiveAccount, useDisconnect, useActiveWallet } from 'thirdweb/react';
import { inAppWallet, smartWallet } from 'thirdweb/wallets';
import { thirdwebClient, somniaTestnetChain } from './thirdwebProvider';

/**
 * Hook for Pulse wallet connection state.
 *
 * Uses Thirdweb's inAppWallet with guest strategy (one-tap, no browser extension needed)
 * wrapped in a smartWallet with sponsorGas for gasless trading on Somnia Shannon.
 *
 * Returns the same shape AppChromeNav expects: address, isConnected, connect, disconnect.
 */
export function usePulseWallet() {
  const account = useActiveAccount();
  const activeWallet = useActiveWallet();
  const { connect: twConnect, isConnecting, error: twError } = useConnect();
  const { disconnect: twDisconnect } = useDisconnect();

  const [customError, setCustomError] = useState<string | null>(null);

  const address = account?.address ?? null;
  const isConnected = !!address;

  /** Short-format address: 0xABCD...1234 */
  const shortAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : null;

  /**
   * Connect: creates an in-app wallet (guest login) wrapped in a
   * smart wallet with sponsored gas. No browser extension required.
   *
   * Thirdweb v5 useConnect: connect() takes a callback that returns a Wallet.
   */
  const connect = useCallback(async () => {
    setCustomError(null);

    try {
      await twConnect(async () => {
        // 1. Create in-app wallet with guest strategy (no email/phone needed)
        const iaw = inAppWallet();
        const personalAccount = await iaw.connect({
          client: thirdwebClient,
          strategy: 'guest',
        });

        // 2. Wrap in smart wallet with gas sponsorship
        const swFactory = smartWallet({
          chain: somniaTestnetChain,
          sponsorGas: true,
        });

        const smartAccount = await swFactory.connect({
          client: thirdwebClient,
          personalAccount,
        });

        return smartAccount as any;
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      setCustomError(message);
      console.error('Wallet connect error:', err);
    }
  }, [twConnect]);

  /** Disconnect the active wallet. */
  const disconnect = useCallback(() => {
    if (activeWallet) {
      twDisconnect(activeWallet);
    }
    setCustomError(null);
  }, [activeWallet, twDisconnect]);

  const error = customError ?? twError?.message ?? null;

  // Clear error after 5s
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setCustomError(null), 5000);
    return () => clearTimeout(t);
  }, [error]);

  return {
    address,
    shortAddress,
    isConnected,
    isConnecting,
    connect,
    disconnect,
    error,
  } as const;
}
