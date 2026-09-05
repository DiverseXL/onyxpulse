'use client';

/**
 * ConnectButton -- wagmi-based wallet connection button.
 *
 * Uses MetaMask (or any injected browser wallet) via wagmi's connect().
 * Connected state shows truncated address with STT balance.
 *
 * NO EMOJI in code, comments, or UI copy.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useConnect, useAccount, useBalance } from 'wagmi';
import { formatEther } from 'viem';
import { Loader2, Wallet, Coins } from 'lucide-react';
import { useTestUsdcBalance } from '@/lib/wallet/useTestUsdcBalance';
import styles from './ConnectButton.module.css';

export default function ConnectButton() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { isConnected, address } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const [error, setError] = useState<string | null>(null);

  const { data: balanceData } = useBalance({
    address: address as `0x${string}` | undefined,
  });

  const sttBalance = balanceData ? formatEther(balanceData.value) : '0.0';
  const { balance: usdcBalance } = useTestUsdcBalance();

  const handleConnect = useCallback(() => {
    setError(null);
    // Use the injected connector (talks to window.ethereum directly)
    const connector = connectors[0];
    if (!connector) {
      setError('No wallet found. Please install MetaMask or another browser wallet.');
      return;
    }
    connect({ connector });
  }, [connect, connectors]);

  /* -- Waiting for client hydration --------------------------------------- */
  if (!mounted) {
    return (
      <div className={styles.container}>
        <div className={styles.skeletonPlaceholder} />
      </div>
    );
  }

  /* -- Connected state: test USDC balance + truncated address pill + STT balance */
  if (isConnected && address) {
    const truncated = `${address.slice(0, 6)}...${address.slice(-4)}`;
    return (
      <div className={styles.connectedWrapper}>
        {/* Test USDC balance chip beside the wallet button */}
        <Link
          href="/faucet"
          className={styles.usdcChip}
          title="Test USDC Balance (click to get more from Faucet)"
          aria-label={`Test USDC Balance: ${usdcBalance}`}
        >
          <Coins size={13} className={styles.usdcIcon} aria-hidden="true" />
          <span className={styles.usdcAmount}>{usdcBalance}</span>
          <span className={styles.usdcLabel}>test USDC</span>
        </Link>

        {/* Truncated address + STT pill */}
        <div
          className={styles.addressPill}
          title={`STT Balance: ${parseFloat(sttBalance).toFixed(4)}`}
        >
          <Wallet size={13} className={styles.walletIcon} aria-hidden="true" />
          <span className={styles.addressText}>{truncated}</span>
          <span className={styles.sttAmount}>
            {parseFloat(sttBalance).toFixed(2)} STT
          </span>
        </div>
      </div>
    );
  }

  /* -- Disconnected state: connect button ----------------------------------- */
  return (
    <div className={styles.container}>
      <button
        type="button"
        onClick={handleConnect}
        disabled={isPending}
        className={styles.connectButton}
        aria-label="Connect MetaMask wallet"
      >
        {isPending ? (
          <>
            <Loader2 size={13} className="spin" aria-hidden="true" />
            Connecting...
          </>
        ) : (
          'Connect'
        )}
      </button>
      {error && (
        <span role="alert" className={styles.errorMessage}>
          {error}
        </span>
      )}
    </div>
  );
}
