'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ExternalLink, Menu, X, TrendingUp, Briefcase, BookOpen, Settings, Globe, Bot } from 'lucide-react';
import styles from './AppChromeNav.module.css';
import ConnectButton from './ConnectButton';

export default function AppChromeNav() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) => pathname === path;

  return (
    <>
      {/* ── Top Bar ────────────────────────────── */}
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
          </div>

          {/* Center: Desktop Nav */}
          <nav className={styles.nav} aria-label="App Navigation">
            <Link
              href="/markets"
              className={`${styles.navLink} ${isActive('/markets') ? styles.navLinkActive : ''}`}
              aria-current={isActive('/markets') ? 'page' : undefined}
            >
              Markets
            </Link>
            <Link
              href="/portfolio"
              className={`${styles.navLink} ${isActive('/portfolio') ? styles.navLinkActive : ''}`}
              aria-current={isActive('/portfolio') ? 'page' : undefined}
            >
              Portfolio
            </Link>
            <Link
              href="/how-to-trade"
              className={`${styles.navLink} ${isActive('/how-to-trade') ? styles.navLinkActive : ''}`}
              aria-current={isActive('/how-to-trade') ? 'page' : undefined}
            >
              How to Trade
            </Link>
            <Link
              href="/connect-agent"
              className={`${styles.navLink} ${isActive('/connect-agent') ? styles.navLinkActive : ''}`}
              aria-current={isActive('/connect-agent') ? 'page' : undefined}
            >
              Connect to Agent
            </Link>
            <Link
              href="/settings"
              className={`${styles.navLink} ${isActive('/settings') ? styles.navLinkActive : ''}`}
              aria-current={isActive('/settings') ? 'page' : undefined}
            >
              Settings
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

          {/* Right: Wallet Connect + Mobile Menu Toggle */}
          <div className={styles.rightGroup}>
            <ConnectButton />
            <button
              type="button"
              className={styles.mobileMenuToggle}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Menu Sheet */}
        {mobileMenuOpen && (
          <div className={styles.mobileMenuSheet}>
            <nav className={styles.mobileMenuNav} aria-label="Mobile Navigation">
              <Link
                href="/markets"
                className={`${styles.mobileMenuLink} ${isActive('/markets') ? styles.mobileMenuLinkActive : ''}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                <TrendingUp size={18} aria-hidden="true" />
                Markets
              </Link>
              <Link
                href="/portfolio"
                className={`${styles.mobileMenuLink} ${isActive('/portfolio') ? styles.mobileMenuLinkActive : ''}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                <Briefcase size={18} aria-hidden="true" />
                Portfolio
              </Link>
              <Link
                href="/how-to-trade"
                className={`${styles.mobileMenuLink} ${isActive('/how-to-trade') ? styles.mobileMenuLinkActive : ''}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                <BookOpen size={18} aria-hidden="true" />
                How to Trade
              </Link>
              <Link
                href="/connect-agent"
                className={`${styles.mobileMenuLink} ${isActive('/connect-agent') ? styles.mobileMenuLinkActive : ''}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                <Bot size={18} aria-hidden="true" />
                Connect to Agent
              </Link>
              <Link
                href="/settings"
                className={`${styles.mobileMenuLink} ${isActive('/settings') ? styles.mobileMenuLinkActive : ''}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                <Settings size={18} aria-hidden="true" />
                Settings
              </Link>
              <a
                href="https://shannon-faucet.somnia.network"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.mobileMenuLink}
                onClick={() => setMobileMenuOpen(false)}
              >
                <Globe size={18} aria-hidden="true" />
                Faucet
                <ExternalLink size={12} className={styles.externalIcon} aria-hidden="true" />
              </a>
            </nav>
          </div>
        )}
      </header>

      {/* ── Bottom Navigation (Mobile Only) ───── */}
      <nav className={styles.bottomNav} aria-label="Mobile bottom navigation">
        <Link
          href="/markets"
          className={`${styles.bottomNavLink} ${isActive('/markets') ? styles.bottomNavLinkActive : ''}`}
          aria-current={isActive('/markets') ? 'page' : undefined}
        >
          <TrendingUp size={20} aria-hidden="true" />
          <span className={styles.bottomNavLabel}>Markets</span>
        </Link>
        <Link
          href="/portfolio"
          className={`${styles.bottomNavLink} ${isActive('/portfolio') ? styles.bottomNavLinkActive : ''}`}
          aria-current={isActive('/portfolio') ? 'page' : undefined}
        >
          <Briefcase size={20} aria-hidden="true" />
          <span className={styles.bottomNavLabel}>Portfolio</span>
        </Link>
        <Link
          href="/connect-agent"
          className={`${styles.bottomNavLink} ${isActive('/connect-agent') ? styles.bottomNavLinkActive : ''}`}
          aria-current={isActive('/connect-agent') ? 'page' : undefined}
        >
          <Bot size={20} aria-hidden="true" />
          <span className={styles.bottomNavLabel}>Agent</span>
        </Link>
        <Link
          href="/settings"
          className={`${styles.bottomNavLink} ${isActive('/settings') ? styles.bottomNavLinkActive : ''}`}
          aria-current={isActive('/settings') ? 'page' : undefined}
        >
          <Settings size={20} aria-hidden="true" />
          <span className={styles.bottomNavLabel}>Settings</span>
        </Link>
      </nav>
    </>
  );
}
