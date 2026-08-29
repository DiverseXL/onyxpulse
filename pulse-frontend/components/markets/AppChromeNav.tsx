'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wallet, Sparkles, ExternalLink, Loader2 } from 'lucide-react';
import styles from './AppChromeNav.module.css';
import { usePulseWallet } from '@/lib/wallet/usePulseWallet';

export default function AppChromeNav() {
  const pathname = usePathname();
  const { shortAddress, isConnected, isConnecting, connect, disconnect, error } = usePulseWallet();

  const handleConnect = () => {
    if (isConnected) {
      disconnect();
    } else {
      connect();
    }
  };

  return (
    <header className={styles.header} role="banner">
      <div className={styles.headerInner}>
        {/* Left: Brand + Network Badge */}
        <div className={styles.leftGroup}>
          <Link href="/" className={styles.brandLink} aria-label="Pulse Home">
            <div className={styles.brandBadge} aria-hidden="true">
              <svg
                className={styles.brandIcon}
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M3 17C7 17 8 11 13 11C18 11 18 5 21 5"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <path
                  d="M3 20C7 20 9 15 13 15C17 15 18 10 21 10"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeOpacity="0.4"
                />
              </svg>
            </div>
            <span className={styles.brandName}>PULSE</span>
          </Link>

          <span className={styles.networkBadge}>
            <span className={styles.networkDot} />
            SHANNON TESTNET
          </span>
        </div>

        {/* Center: Main App Nav */}
        <nav className={styles.nav} aria-label="App Navigation">
          <Link
            href="/markets"
            className={`${styles.navLink} ${pathname === '/markets' ? styles.navLinkActive : ''}`}
            aria-current={pathname === '/markets' ? 'page' : undefined}
          >
            Markets
          </Link>
          <Link
            href="/#trade-preview-panel"
            className={`${styles.navLink} ${pathname === '/portfolio' ? styles.navLinkActive : ''}`}
          >
            Portfolio
          </Link>
          <a
            href="https://shannon-faucet.somnia.network"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.navLink}
          >
            Faucet
            <ExternalLink size={11} className={styles.externalIcon} aria-hidden="true" />
          </a>
        </nav>

        {/* Right: Thirdweb Smart Wallet Guest Status */}
        <div className={styles.rightGroup}>
          <div className={styles.gasSponsoredChip} title="Gas fees sponsored on Somnia testnet">
            <Sparkles size={11} className={styles.sparkleIcon} aria-hidden="true" />
            <span>Gasless</span>
          </div>

          <button
            type="button"
            className={isConnected ? styles.connectedButton : styles.connectButton}
            onClick={handleConnect}
            disabled={isConnecting}
            aria-label={isConnected ? `Connected as ${shortAddress}` : 'Connect smart wallet'}
            title={error ?? undefined}
          >
            {isConnecting ? (
              <><Loader2 size={13} className={styles.connectSpinner} aria-hidden="true" /><span>Connecting...</span></>
            ) : (
              <><Wallet size={13} aria-hidden="true" /><span>{isConnected ? shortAddress : 'Connect'}</span></>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
