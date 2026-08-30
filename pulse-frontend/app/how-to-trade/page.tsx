'use client';

/**
 * /how-to-trade -- Step-by-step guide for first-time Pulse traders.
 *
 * Six numbered steps with staggered fade-up entrance animations.
 * Every claim is factually accurate to Pulse's confirmed-live mechanics.
 * NO EMOJI anywhere -- lucide-react icons only.
 */

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Wallet,
  Droplets,
  BarChart3,
  Send,
  Clock,
  Trophy,
  ArrowRight,
} from 'lucide-react';
import styles from './HowToTrade.module.css';
import AppChromeNav from '@/components/markets/AppChromeNav';
import {
  useReducedMotionSafe,
  safeVariants,
  safeTransition,
  fadeSlideUp,
  MOTION_SLOW,
  MOTION_MEDIUM,
  STAGGER_DELAY,
  EASE_OUT,
} from '@/lib/motion';

/* ── Step data ─────────────────────────────── */

const STEPS = [
  {
    icon: Wallet,
    title: 'Connect Your Wallet',
    description:
      'Click Connect Wallet (top right) and approve in MetaMask. This only shares your public address -- nothing is signed yet. Pulse runs on Somnia Shannon testnet (EVM-compatible) -- make sure MetaMask is on the right network; the app will prompt you to switch if it isn\'t.',
  },
  {
    icon: Droplets,
    title: 'Get Testnet Funds',
    description:
      'You\'ll need two things: STT for gas, and test USDC to trade with. Visit the Faucet page -- copy your address and claim STT from the official Somnia faucet, then click "Get Test USDC." This mints test USDC directly to your wallet via a real on-chain transaction, so MetaMask will ask you to confirm it.',
  },
  {
    icon: BarChart3,
    title: 'Pick a Market and a Side',
    description:
      'Browse live BTC and ETH windows on the Markets page. Open one, choose Yes or No, and enter how much test USDC you want to trade. You\'ll see the live price and exactly how many outcome tokens you\'ll receive, based on DreamDEX\'s real order book -- not an estimate.',
  },
  {
    icon: Send,
    title: 'Place Your Order',
    description:
      'Your first trade on a market may ask for two confirmations: one to approve your test USDC for trading, and one to place the order. Every trade is a real Somnia transaction -- gas is paid in STT, and you can verify it on the Shannon block explorer the moment it confirms.',
  },
  {
    icon: Clock,
    title: 'Hold or Exit Early',
    description:
      'Orders match against DreamDEX\'s live order book -- there\'s no pool acting as counterparty. You can place a new order to exit your position before the window closes, or hold until the market resolves.',
  },
  {
    icon: Trophy,
    title: 'Claim Your Winnings',
    description:
      'When a market resolves, head to Portfolio. Winning positions show as Claimable. If a market voided -- meaning the oracle couldn\'t resolve it -- both sides are refunded at par, shown clearly as a refund, not a loss. Click Claim (or Claim All) and confirm in MetaMask to receive your payout.',
  },
] as const;

/* ── Page component ────────────────────────── */

export default function HowToTradePage() {
  const reducedMotion = useReducedMotionSafe();

  return (
    <div className={styles.page}>
      <AppChromeNav />

      <main className={styles.main}>
        {/* -- Header ------------------------------------------------------- */}
        <motion.div
          className={styles.headerSection}
          variants={safeVariants(reducedMotion, fadeSlideUp)}
          initial="hidden"
          animate="visible"
          transition={safeTransition(reducedMotion, {
            duration: MOTION_SLOW,
            ease: EASE_OUT,
          })}
        >
          <h1 className={styles.h1}>How to Trade</h1>
          <p className={styles.subcopy}>
            Six steps. Real transactions, real gas, real settlement -- nothing simulated.
          </p>
        </motion.div>

        {/* -- Steps -------------------------------------------------------- */}
        <ol className={styles.stepList}>
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.li
                key={step.title}
                className={styles.stepCard}
                variants={safeVariants(reducedMotion, fadeSlideUp)}
                initial="hidden"
                animate="visible"
                transition={safeTransition(reducedMotion, {
                  duration: MOTION_MEDIUM,
                  ease: EASE_OUT,
                  delay: i * STAGGER_DELAY,
                })}
              >
                <div className={styles.stepHeader}>
                  <span className={styles.stepNumber} aria-hidden="true">
                    {i + 1}
                  </span>
                  <Icon
                    size={16}
                    style={{ color: 'rgba(242, 237, 225, 0.45)', flexShrink: 0 }}
                    aria-hidden="true"
                  />
                  <h2 className={styles.stepTitle}>{step.title}</h2>
                </div>
                <p className={styles.stepDescription}>{step.description}</p>
              </motion.li>
            );
          })}
        </ol>

        {/* -- Footer CTA --------------------------------------------------- */}
        <motion.div
          className={styles.ctaFooter}
          variants={safeVariants(reducedMotion, fadeSlideUp)}
          initial="hidden"
          animate="visible"
          transition={safeTransition(reducedMotion, {
            duration: MOTION_MEDIUM,
            ease: EASE_OUT,
            delay: STEPS.length * STAGGER_DELAY,
          })}
        >
          <h3 className={styles.ctaFooterTitle}>Ready to start?</h3>
          <p className={styles.ctaFooterText}>
            Head to Markets, pick a window, and place your first trade.
          </p>
          <Link href="/markets" className={styles.ctaButton}>
            Go to Markets
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </motion.div>
      </main>
    </div>
  );
}
