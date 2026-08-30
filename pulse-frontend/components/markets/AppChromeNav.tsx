'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import styles from './AppChromeNav.module.css';
import ConnectButton from './ConnectButton';

export default function AppChromeNav() {
  const pathname = usePathname();

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
            href="/portfolio"
            className={`${styles.navLink} ${pathname === '/portfolio' ? styles.navLinkActive : ''}`}
            aria-current={pathname === '/portfolio' ? 'page' : undefined}
          >
            Portfolio
          </Link>
          <Link
            href="/how-to-trade"
            className={`${styles.navLink} ${pathname === '/how-to-trade' ? styles.navLinkActive : ''}`}
            aria-current={pathname === '/how-to-trade' ? 'page' : undefined}
          >
            How to Trade
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

        {/* Right: Wallet Connect */}
        <div className={styles.rightGroup}>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
