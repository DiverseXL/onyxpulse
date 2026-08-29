'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import styles from './HeroV2.module.css';
import type { ActiveTab } from './PulseLanding';
import {
  useReducedMotionSafe,
  safeVariants,
  safeTransition,
  fadeSlideUp,
  STAGGER_DELAY,
  MOTION_FAST,
  MOTION_SLOW,
  EASE_OUT,
} from '@/lib/motion';

type TabDef = { key: ActiveTab; label: string };

const TABS: TabDef[] = [
  { key: 'trade', label: 'Trade' },
  { key: 'markets', label: 'Markets' },
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'receipt', label: 'Receipt' },
];

/* ─────────────────────────────────────────────
   HeroV2 — Centered Glass Hero
   Staggered entrance choreographed with framer-motion.
 ───────────────────────────────────────────── */

function SomniaIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 42.1956 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <path
        d="M0 14.8148H1.48148C1.90123 14.8148 2.2716 14.7284 2.59259 14.5556C2.91358 14.358 3.17284 14.1111 3.37037 13.8148C3.59259 13.4938 3.75309 13.1481 3.85185 12.7778C3.97531 12.3827 4.03704 11.9877 4.03704 11.5926V5.62963C4.03704 4.71605 4.12346 3.91358 4.2963 3.22222C4.49383 2.53086 4.81482 1.95062 5.25926 1.48148C5.7037 0.987655 6.2963 0.617286 7.03704 0.370372C7.80247 0.123457 8.75309 0 9.88889 0H12.8889V2.40741H9.74074C8.7037 2.40741 7.96296 2.64198 7.51852 3.11111C7.09876 3.58025 6.88889 4.4321 6.88889 5.66667V10.7778C6.88889 12.4321 6.64197 13.6543 6.14815 14.4444C5.65432 15.2099 5.08642 15.7284 4.44444 16C5.08642 16.2963 5.65432 16.8519 6.14815 17.6667C6.64197 18.4815 6.88889 19.6667 6.88889 21.2222V26.3333C6.88889 27.5679 7.11111 28.4198 7.55556 28.8889C8 29.358 8.74074 29.5926 9.77778 29.5926H12.8889V32H9.88889C8.75309 32 7.80247 31.8765 7.03704 31.6296C6.2963 31.3827 5.7037 31.0123 5.25926 30.5185C4.81482 30.0494 4.49383 29.4691 4.2963 28.7778C4.12346 28.0864 4.03704 27.284 4.03704 26.3704V20.4074C4.03704 20.037 3.97531 19.6667 3.85185 19.2963C3.75309 18.9012 3.59259 18.5556 3.37037 18.2593C3.17284 17.9383 2.91358 17.679 2.59259 17.4815C2.2963 17.284 1.93827 17.1852 1.51852 17.1852H0V14.8148Z"
        fill="currentColor"
      />
      <path
        d="M42.1956 17.1852H40.7142C40.2944 17.1852 39.924 17.284 39.603 17.4815C39.3067 17.6543 39.0475 17.9012 38.8253 18.2222C38.6277 18.5185 38.4672 18.8642 38.3438 19.2593C38.245 19.6296 38.1956 20.0123 38.1956 20.4074V26.3704C38.1956 27.284 38.0969 28.0864 37.8993 28.7778C37.7265 29.4691 37.4055 30.0494 36.9364 30.5185C36.4919 31.0123 35.887 31.3827 35.1216 31.6296C34.3808 31.8765 33.4426 32 32.3067 32H29.3067V29.5926H32.4549C33.4919 29.5926 34.2203 29.358 34.6401 28.8889C35.0845 28.4198 35.3067 27.5679 35.3067 26.3333V21.2222C35.3067 19.5679 35.5537 18.358 36.0475 17.5926C36.5413 16.8025 37.1092 16.2716 37.7512 16C37.1092 15.7037 36.5413 15.1481 36.0475 14.3333C35.5537 13.5185 35.3067 12.3333 35.3067 10.7778V5.66667C35.3067 4.4321 35.0845 3.58025 34.6401 3.11111C34.1956 2.64198 33.4549 2.40741 32.4179 2.40741H29.3067V0H32.3067C33.4426 0 34.3808 0.123457 35.1216 0.370372C35.887 0.617286 36.4919 0.987655 36.9364 1.48148C37.4055 1.95062 37.7265 2.53086 37.8993 3.22222C38.0969 3.91358 38.1956 4.71605 38.1956 5.62963V11.5926C38.1956 11.963 38.245 12.3457 38.3438 12.7407C38.4426 13.1111 38.5907 13.4568 38.7882 13.7778C39.0105 14.0741 39.2697 14.321 39.566 14.5185C39.887 14.716 40.2574 14.8148 40.6771 14.8148H42.1956V17.1852Z"
        fill="currentColor"
      />
      <path
        d="M21.5654 24.0202C20.1111 24.0202 18.749 23.7846 17.479 23.3135C16.2091 22.8424 15.1235 22.2996 14.2222 21.6851L15.3898 20.026C16.2501 20.6405 17.2025 21.1321 18.2472 21.5008C19.2918 21.8694 20.5003 22.0538 21.8727 22.0538C23.1427 22.0538 24.0849 21.8182 24.6994 21.3471C25.3344 20.876 25.6518 20.3332 25.6518 19.7187C25.6518 19.4319 25.5904 19.1657 25.4675 18.9199C25.3651 18.6741 25.15 18.4385 24.8223 18.2132C24.515 17.9879 24.0542 17.7728 23.4397 17.568C22.8252 17.3631 22.0058 17.1583 20.9817 16.9535C19.0358 16.5438 17.5712 15.9908 16.588 15.2943C15.6253 14.5979 15.144 13.6966 15.144 12.5906C15.144 11.382 15.6663 10.3784 16.7109 9.57952C17.7556 8.76019 19.3021 8.35053 21.3504 8.35053C22.4974 8.35053 23.6035 8.54512 24.6687 8.9343C25.7338 9.303 26.635 9.74339 27.3724 10.2555L26.1434 11.8839C25.4675 11.3923 24.6994 11.0133 23.8391 10.7471C22.9788 10.4603 22.0775 10.3169 21.1353 10.3169C20.275 10.3169 19.5888 10.4193 19.0767 10.6242C18.5851 10.8085 18.2267 11.0646 18.0014 11.3923C17.7965 11.72 17.6941 12.0785 17.6941 12.4677C17.6941 13.1026 18.0321 13.6045 18.708 13.9732C19.4045 14.3214 20.5106 14.6491 22.0263 14.9564C23.6855 15.3046 24.9554 15.6938 25.8362 16.1239C26.7375 16.5541 27.352 17.0457 27.6797 17.5987C28.0279 18.1517 28.202 18.8072 28.202 19.5651C28.202 20.3844 27.946 21.1321 27.4339 21.808C26.9218 22.4635 26.1742 22.996 25.191 23.4057C24.2078 23.8154 22.9993 24.0202 21.5654 24.0202Z"
        fill="currentColor"
      />
    </svg>
  );
}

function DreamDexIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 324 246"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <path d="M0 113.574H11.3574C14.5753 113.574 17.4146 112.911 19.8754 111.586C22.3362 110.072 24.3237 108.179 25.838 105.908C27.5416 103.447 28.772 100.797 29.5292 97.9574C30.4756 94.9287 30.9488 91.9001 30.9488 88.8715V43.158C30.9488 36.1543 31.6114 30.0024 32.9364 24.7023C34.4507 19.4022 36.9115 14.9539 40.3187 11.3574C43.7259 7.57159 48.2688 4.73225 53.9475 2.83936C59.8155 0.946453 67.1031 0 75.8105 0H98.8091V18.4557H74.6747C66.7246 18.4557 61.0459 20.254 57.6387 23.8505C54.4207 27.447 52.8118 33.9775 52.8118 43.442V82.6249C52.8118 95.3073 50.9189 104.677 47.1331 110.734C43.3473 116.602 38.9936 120.577 34.0721 122.66C38.9936 124.931 43.3473 129.19 47.1331 135.437C50.9189 141.683 52.8118 150.769 52.8118 162.694V201.877C52.8118 211.342 54.5154 217.872 57.9226 221.469C61.3298 225.065 67.0085 226.864 74.9587 226.864H98.8091V245.319H75.8105C67.1031 245.319 59.8155 244.373 53.9475 242.48C48.2688 240.587 43.7259 237.748 40.3187 233.962C36.9115 230.365 34.4507 225.917 32.9364 220.617C31.6114 215.317 30.9488 209.165 30.9488 202.161V156.448C30.9488 153.608 30.4756 150.769 29.5292 147.93C28.772 144.901 27.5416 142.251 25.838 139.98C24.3237 137.519 22.3362 135.531 19.8754 134.017C17.6039 132.503 14.8592 131.746 11.6413 131.746H0V113.574Z" fill="currentColor"/>
  <path d="M323.481 131.746H312.124C308.906 131.746 306.067 132.503 303.606 134.017C301.334 135.342 299.347 137.235 297.643 139.696C296.129 141.967 294.899 144.617 293.952 147.646C293.195 150.485 292.816 153.419 292.816 156.448V202.161C292.816 209.165 292.059 215.317 290.545 220.617C289.22 225.917 286.759 230.365 283.163 233.962C279.755 237.748 275.118 240.587 269.25 242.48C263.571 244.373 256.378 245.319 247.671 245.319H224.672V226.864H248.807C256.757 226.864 262.341 225.065 265.559 221.469C268.966 217.872 270.67 211.342 270.67 201.877V162.694C270.67 150.012 272.562 140.737 276.348 134.869C280.134 128.812 284.488 124.742 289.409 122.66C284.488 120.388 280.134 116.129 276.348 109.883C272.562 103.636 270.67 94.5501 270.67 82.6249V43.442C270.67 33.9775 268.966 27.447 265.559 23.8505C262.152 20.254 256.473 18.4557H224.672V0H247.671C256.378 0 263.571 0.946453 269.25 2.83936C275.118 4.73225 279.755 7.57159 283.163 11.3574C286.759 14.9539 289.22 19.4022 290.545 24.7023C292.059 30.0024 292.816 36.1543 292.816 43.158V88.8715C292.816 91.7108 293.195 94.6448 293.952 97.6734C294.709 100.513 295.845 103.163 297.359 105.624C299.063 107.895 301.051 109.788 303.322 111.302C305.783 112.817 308.622 113.574 311.84 113.574H323.481V131.746Z" fill="currentColor"/>
  <path d="M154.309 198.819C139.391 198.819 127.379 193.637 118.271 183.273C109.163 172.752 104.609 157.991 104.609 138.991C104.609 126.585 107.043 115.907 111.911 106.957C116.936 97.8491 123.374 90.8613 131.226 85.9934C139.234 81.1255 147.714 78.6916 156.664 78.6916C163.417 78.6916 169.541 80.0263 175.037 82.6958C180.69 85.2083 185.95 88.8199 190.818 93.5308H191.525L190.583 72.3319V28.2853H209.897V195.992H193.88L192.231 180.917H191.525C186.971 185.785 181.396 190.025 174.801 193.637C168.363 197.091 161.532 198.819 154.309 198.819ZM158.313 182.566C163.966 182.566 169.462 181.153 174.801 178.326C180.14 175.343 185.401 171.025 190.583 165.372V108.37C185.401 103.502 180.297 100.047 175.272 98.0061C170.404 95.9647 165.458 94.9441 160.433 94.9441C153.838 94.9441 147.792 96.8284 142.296 100.597C136.957 104.209 132.639 109.312 129.341 115.907C126.201 122.346 124.631 129.962 124.631 138.755C124.631 152.417 127.614 163.173 133.581 171.025C139.548 178.719 147.792 182.566 158.313 182.566Z" fill="currentColor"/>
    </svg>
  );
}

interface HeroV2Props {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
}

export default function HeroV2({ activeTab, onTabChange }: HeroV2Props) {
  const tabRefs = useRef<Map<ActiveTab, HTMLButtonElement | null>>(new Map());
  const [pillStyle, setPillStyle] = useState<{ left: number; width: number } | null>(null);
  const [initialMeasure, setInitialMeasure] = useState(true);
  const reducedMotion = useReducedMotionSafe();

  /* Measure the active tab button and position the sliding pill */
  const measurePill = useCallback(() => {
    const btn = tabRefs.current.get(activeTab);
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const container = btn.parentElement;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    setPillStyle({
      left: rect.left - containerRect.left,
      width: rect.width,
    });
  }, [activeTab]);

  /* On mount and when activeTab changes, measure pill position */
  useEffect(() => {
    if (initialMeasure) {
      measurePill();
      const t = setTimeout(() => setInitialMeasure(false), 50);
      return () => clearTimeout(t);
    }
    measurePill();
  }, [activeTab, initialMeasure, measurePill]);

  /* Re-measure on window resize */
  useEffect(() => {
    const onResize = () => measurePill();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [measurePill]);

  /* Keyboard arrow-key navigation between tabs */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, tab: ActiveTab) => {
      const idx = TABS.findIndex((t) => t.key === tab);
      if (idx === -1) return;

      let nextIdx = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        nextIdx = (idx + 1) % TABS.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        nextIdx = (idx - 1 + TABS.length) % TABS.length;
      } else if (e.key === 'Home') {
        nextIdx = 0;
      } else if (e.key === 'End') {
        nextIdx = TABS.length - 1;
      }

      if (nextIdx !== -1) {
        e.preventDefault();
        const nextTab = TABS[nextIdx];
        onTabChange(nextTab.key);
        tabRefs.current.get(nextTab.key)?.focus();
      }
    },
    [onTabChange]
  );

  /* ── Staggered entrance variants ────────── */
  const containerVariants = safeVariants(reducedMotion, {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: STAGGER_DELAY,
        delayChildren: 0.1,
      },
    },
  });

  const itemVariants = safeVariants(reducedMotion, {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: safeTransition(reducedMotion, {
        duration: MOTION_SLOW,
        ease: EASE_OUT,
      }),
    },
  });

  return (
    <main className={styles.hero} id="hero">
      {/* 1. Top announcement bar */}
      <motion.div
        className={styles.announcementBar}
        role="banner"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={safeTransition(reducedMotion, { duration: MOTION_SLOW, ease: EASE_OUT })}
      >
        <span>Live on Somnia Testnet</span>
        <span className={styles.announcementDot} aria-hidden="true">/</span>
        <a
          href="https://github.com"
          className={styles.announcementLink}
          aria-label="View Pulse on GitHub (opens in new tab)"
          target="_blank"
          rel="noopener noreferrer"
          id="announcement-github-link"
        >
          GitHub
        </a>
      </motion.div>

      {/* Centered content stack — staggered entrance */}
      <motion.div
        className={styles.center}
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* 2. Logo row */}
        <motion.div className={styles.logoRow} aria-label="Pulse" variants={itemVariants}>
          <div className={styles.logoBadge} aria-hidden="true">
            <svg
              className={styles.wakeIcon}
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
          <span className={styles.wordmark}>PULSE</span>
        </motion.div>

        {/* 3. Badge pill — with hover scale */}
        <motion.div
          className={styles.badgePillContainer}
          aria-label="Architecture attributes"
          variants={itemVariants}
          whileHover={reducedMotion ? {} : { scale: 1.02, filter: 'brightness(1.05)' }}
          transition={safeTransition(reducedMotion, {
            duration: MOTION_FAST,
            ease: EASE_OUT,
          })}
        >
          <div className={styles.badgeSegment}>
            <span>Built on Somnia</span>
            <SomniaIcon className={styles.badgeIcon} aria-hidden="true" />
          </div>

          <div className={styles.badgeDivider} aria-hidden="true" />

          <div className={styles.badgeSegment}>
            <span>Powered by DreamDEX</span>
            <DreamDexIcon className={styles.badgeIcon} aria-hidden="true" />
          </div>
        </motion.div>

        {/* 4. Headline */}
        <motion.h1 className={styles.headline} variants={itemVariants}>
          <span className={styles.headlineLine}>Up or Down.</span>
          <span className={styles.headlineLine}>That&apos;s It.</span>
        </motion.h1>

        {/* 5. Wake-line */}
        <motion.div className={styles.wakeLineWrapper} aria-hidden="true" variants={itemVariants}>
          <svg
            className={styles.wakeLine}
            width="160"
            height="2"
            viewBox="0 0 160 2"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <line
              x1="0"
              y1="1"
              x2="160"
              y2="1"
              stroke="var(--color-rust)"
              strokeWidth="2"
              strokeLinecap="round"
              className={styles.wakeLineStroke}
            />
          </svg>
        </motion.div>

        {/* 6. Subheadline */}
        <motion.p className={styles.subheadline} variants={itemVariants}>
          Gasless BTC/ETH direction trading on DreamDEX Event Contracts.
          Zero fees, capped risk, verifiable on-chain.
        </motion.p>

        {/* 7. CTA button — arrow nudge on hover */}
        <motion.div className={styles.ctaWrapper} variants={itemVariants}>
          <motion.a
            href="/markets"
            className={styles.ctaButton}
            id="enter-app-cta"
            aria-label="Enter the Pulse trading app"
            whileHover={reducedMotion ? {} : { y: -2, scale: 1.02 }}
            transition={safeTransition(reducedMotion, {
              duration: MOTION_FAST,
              ease: EASE_OUT,
            })}
          >
            <span>Enter App</span>
            <motion.span
              className={styles.ctaArrowWrapper}
              whileHover={reducedMotion ? {} : { x: 3 }}
              transition={safeTransition(reducedMotion, {
                duration: MOTION_FAST,
                ease: EASE_OUT,
              })}
            >
              <ArrowRight className={styles.ctaArrow} size={17} aria-hidden="true" />
            </motion.span>
          </motion.a>
        </motion.div>

        {/* 8. Tab-Bar with Sliding Pill */}
        <motion.div className={styles.tabBarContainer} variants={itemVariants}>
          {pillStyle && (
            <span
              className={`${styles.tabPill} ${initialMeasure ? styles.tabPillSnap : ''}`}
              style={{
                transform: `translateX(${pillStyle.left}px)`,
                width: pillStyle.width,
              }}
              aria-hidden="true"
            />
          )}
          <div
            className={styles.tabBarInner}
            role="tablist"
            aria-label="Panel navigation"
          >
            {TABS.map((tab) => (
              <button
                key={tab.key}
                ref={(el) => {
                  tabRefs.current.set(tab.key, el);
                }}
                role="tab"
                id={`hero-tab-${tab.key}`}
                aria-selected={activeTab === tab.key}
                tabIndex={activeTab === tab.key ? 0 : -1}
                className={`${styles.tabItem} ${activeTab === tab.key ? styles.tabItemActive : ''}`}
                onClick={() => onTabChange(tab.key)}
                onKeyDown={(e) => handleKeyDown(e, tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </motion.div>

      </motion.div>

      {/* Empty bottom spacer for flex alignment balancing */}
      <div style={{ height: '1px', opacity: 0 }} aria-hidden="true" />
    </main>
  );
}
