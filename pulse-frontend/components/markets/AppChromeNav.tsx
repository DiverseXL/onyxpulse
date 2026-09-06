'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ExternalLink, Menu, X, TrendingUp, Briefcase, BookOpen, Settings, Globe, Bot } from 'lucide-react';
import { motion } from 'framer-motion';
import { safeTransition, transitionMedium, useReducedMotionSafe } from '@/lib/motion';
import styles from './AppChromeNav.module.css';
import ConnectButton from './ConnectButton';

export default function AppChromeNav() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
  const navRef = useRef<HTMLElement>(null);
  const activeLinkRef = useRef<HTMLAnchorElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const reducedMotion = useReducedMotionSafe();

  const isActive = (path: string) => pathname === path || pathname.startsWith(`${path}/`);

  useLayoutEffect(() => {
    const updateIndicator = () => {
      const nav = navRef.current;
      const activeLink = activeLinkRef.current;
      if (!nav || !activeLink) return;
      const navRect = nav.getBoundingClientRect();
      const linkRect = activeLink.getBoundingClientRect();
      setIndicatorStyle({ left: linkRect.left - navRect.left, width: linkRect.width });
    };

    updateIndicator();
    const observer = new ResizeObserver(updateIndicator);
    if (navRef.current) observer.observe(navRef.current);
    window.addEventListener('resize', updateIndicator);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateIndicator);
    };
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const focusable = mobileMenuRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled])',
    );
    focusable?.[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
        mobileToggleRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab' || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  const links = [
    { href: '/markets', label: 'Markets', icon: TrendingUp },
    { href: '/portfolio', label: 'Portfolio', icon: Briefcase },
    { href: '/how-to-trade', label: 'How to Trade', icon: BookOpen },
    { href: '/connect-agent', label: 'Connect to Agent', icon: Bot },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];

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
              <span className={styles.networkBadge}>SHANNON</span>
            </Link>
          </div>

          {/* Center: Desktop Nav */}
          <nav ref={navRef} className={styles.nav} aria-label="App Navigation">
            {links.map(({ href, label }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  ref={active ? activeLinkRef : undefined}
                  href={href}
                  className={`${styles.navLink} ${active ? styles.navLinkActive : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  {label}
                </Link>
              );
            })}
            <motion.span
              className={styles.activeIndicator}
              aria-hidden="true"
              animate={indicatorStyle}
              transition={safeTransition(reducedMotion, transitionMedium)}
            />
            <a
              href="https://shannon-faucet.somnia.network"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.faucetLink}
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
              ref={mobileToggleRef}
              className={styles.mobileMenuToggle}
              onClick={() => setMobileMenuOpen((open) => !open)}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
              aria-controls="pulse-mobile-menu"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Menu Sheet */}
        {mobileMenuOpen && (
          <div id="pulse-mobile-menu" ref={mobileMenuRef} className={styles.mobileMenuSheet}>
            <nav className={styles.mobileMenuNav} aria-label="Mobile Navigation">
              {links.map(({ href, label, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`${styles.mobileMenuLink} ${active ? styles.mobileMenuLinkActive : ''}`}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Icon size={18} aria-hidden="true" />
                    {label}
                  </Link>
                );
              })}
              <a
                href="https://shannon-faucet.somnia.network"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.mobileFaucetLink}
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
