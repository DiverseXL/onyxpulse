'use client';

/**
 * ChainMismatchBanner -- shown when the wallet is connected but on the wrong chain.
 *
 * Displays a clear error banner with a "Switch to Somnia Testnet" button.
 * Uses wagmi's useChainId + useSwitchChain for detection and switching.
 *
 * NO EMOJI in code, comments, or UI copy.
 */

import { useState, useEffect, useCallback } from 'react';
import { useChainId, useSwitchChain } from 'wagmi';
import { AlertTriangle, ArrowRightLeft } from 'lucide-react';
import { somniaTestnet } from '@/lib/wallet/wagmiConfig';

const TARGET_CHAIN_ID = somniaTestnet.id;

export default function ChainMismatchBanner() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const currentChainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();
  const [switchError, setSwitchError] = useState<string | null>(null);

  // Wait for client hydration to avoid mismatch
  if (!mounted) return null;

  // Correct chain -- render nothing
  if (currentChainId === TARGET_CHAIN_ID) return null;

  const handleSwitch = useCallback(() => {
    setSwitchError(null);
    switchChain(
      { chainId: TARGET_CHAIN_ID },
      {
        onError: (err: Error) => {
          // User rejected in MetaMask -- not a real error worth showing
          if (err?.message?.includes('rejected') || err?.message?.includes('User rejected')) {
            setSwitchError('Switch cancelled. Please approve the network change in MetaMask.');
          } else {
            setSwitchError('Failed to switch network. Please switch manually in MetaMask to Somnia Testnet (chain 50312).');
          }
        },
      },
    );
  }, [switchChain]);

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.75rem',
        padding: '0.875rem 1rem',
        background: 'rgba(251, 191, 36, 0.08)',
        border: '1px solid rgba(251, 191, 36, 0.3)',
        borderRadius: '10px',
        marginBottom: 'var(--space-3)',
      }}
    >
      <AlertTriangle
        size={18}
        aria-hidden="true"
        style={{ color: '#fbbf24', flexShrink: 0, marginTop: '1px' }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-small)',
            fontWeight: 600,
            color: '#fbbf24',
            lineHeight: 1.3,
          }}
        >
          Wrong network
        </p>
        <p
          style={{
            margin: '0.25rem 0 0',
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-micro)',
            color: 'rgba(251, 191, 36, 0.8)',
            lineHeight: 1.4,
          }}
        >
          Your wallet is on chain {currentChainId}. Pulse trades on Somnia Testnet (chain {TARGET_CHAIN_ID}).
          Switch your wallet network to continue.
        </p>
        {switchError && (
          <p
            style={{
              margin: '0.375rem 0 0',
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-micro)',
              color: '#f87171',
              lineHeight: 1.4,
            }}
          >
            {switchError}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={handleSwitch}
        disabled={isPending}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.35rem',
          padding: '0.35rem 0.75rem',
          borderRadius: '9999px',
          background: isPending ? 'rgba(251, 191, 36, 0.15)' : 'rgba(251, 191, 36, 0.2)',
          border: '1px solid rgba(251, 191, 36, 0.4)',
          color: '#fbbf24',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          fontSize: 'var(--text-micro)',
          fontWeight: 600,
          cursor: isPending ? 'wait' : 'pointer',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          transition: 'background 150ms ease',
        }}
        onMouseEnter={(e) => {
          if (!isPending) e.currentTarget.style.background = 'rgba(251, 191, 36, 0.3)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = isPending ? 'rgba(251, 191, 36, 0.15)' : 'rgba(251, 191, 36, 0.2)';
        }}
      >
        <ArrowRightLeft size={12} aria-hidden="true" />
        {isPending ? 'Switching...' : 'Switch Network'}
      </button>
    </div>
  );
}
