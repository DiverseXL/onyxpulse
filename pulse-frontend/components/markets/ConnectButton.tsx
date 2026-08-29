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
import { useConnect, useAccount, useBalance } from 'wagmi';
import { formatEther } from 'viem';
import { Loader2, Wallet } from 'lucide-react';

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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.4rem 0.9rem',
            borderRadius: '9999px',
            background: 'var(--color-rust)',
            color: 'var(--color-paper)',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
            fontSize: 'var(--text-small)',
            fontWeight: 600,
            border: 'none',
            visibility: 'hidden',
            height: '100%',
          }}
        />
      </div>
    );
  }

  /* -- Connected state: truncated address pill + STT balance ---------------- */
  if (isConnected && address) {
    const truncated = `${address.slice(0, 6)}...${address.slice(-4)}`;
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.4rem 0.75rem',
            borderRadius: '9999px',
            background: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-small)',
            fontWeight: 500,
            color: 'var(--color-paper)',
          }}
          title={`STT Balance: ${parseFloat(sttBalance).toFixed(4)}`}
        >
          <Wallet size={13} aria-hidden="true" style={{ opacity: 0.6 }} />
          <span>{truncated}</span>
          <span
            style={{
              opacity: 0.48,
              fontSize: 'var(--text-micro)',
            }}
          >
            {parseFloat(sttBalance).toFixed(2)} STT
          </span>
        </div>
      </div>
    );
  }

  /* -- Disconnected state: connect button ----------------------------------- */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
      <button
        type="button"
        onClick={handleConnect}
        disabled={isPending}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.4rem 0.9rem',
          borderRadius: '9999px',
          background: isPending ? 'rgba(193, 80, 46, 0.5)' : 'var(--color-rust)',
          color: 'var(--color-paper)',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          fontSize: 'var(--text-small)',
          fontWeight: 600,
          border: 'none',
          cursor: isPending ? 'wait' : 'pointer',
          transition: 'transform 150ms ease, filter 150ms ease',
        }}
        onMouseEnter={(e) => {
          if (!isPending) {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.filter = 'brightness(1.05)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = '';
          e.currentTarget.style.filter = '';
        }}
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
        <span
          role="alert"
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-micro)',
            color: '#f87171',
            maxWidth: '200px',
            textAlign: 'right',
            lineHeight: 1.3,
          }}
        >
          {error}
        </span>
      )}
    </div>
  );
}
