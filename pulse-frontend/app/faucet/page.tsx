'use client';

/**
 * /faucet -- Onboarding page that gets a connected wallet ready to trade.
 *
 * Two states:
 *   1. Disconnected  -- prompt to connect wallet
 *   2. Connected     -- get STT, then get test USDC
 *
 * NO EMOJI anywhere -- lucide-react icons only.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Wallet,
  CheckCircle,
  ExternalLink,
  Copy,
  RefreshCw,
  ArrowRight,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import {
  createPublicClient,
  http,
  defineChain,
  erc20Abi,
  encodeFunctionData,
  type Hex,
} from 'viem';
import { getWalletClient } from '@wagmi/core';
import { somniaTestnet } from '@/lib/wallet/wagmiConfig';
import styles from './Faucet.module.css';
import AppChromeNav from '@/components/markets/AppChromeNav';
import ConnectButton from '@/components/markets/ConnectButton';
import ChainMismatchBanner from '@/components/markets/ChainMismatchBanner';
import { usePulseWallet } from '@/lib/wallet/PulseWalletContext';
import { wagmiConfig } from '@/lib/wallet/wagmiConfig';
import {
  useReducedMotionSafe,
  safeVariants,
  safeTransition,
  fadeSlideUp,
  MOTION_MEDIUM,
  MOTION_SLOW,
  EASE_OUT,
} from '@/lib/motion';

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const publicClient = createPublicClient({
  chain: somniaTestnet,
  transport: http(),
});

/** Test USDC contract on Shannon testnet (6 decimals). */
const TEST_USDC = '0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E' as const;
const USDC_DECIMALS = 6;

/** ABI for the test USDC faucet function (no args). */
const FAUCET_ABI = [
  {
    type: 'function' as const,
    name: 'faucet',
    stateMutability: 'nonpayable' as const,
    inputs: [],
    outputs: [],
  },
] as const;

/** Minimum STT balance (in ether) to consider sufficient for a few transactions. */
const STT_MINIMUM_THRESHOLD = 0.1;

/** Somnia testnet STT faucet URL. */
const STT_FAUCET_URL = 'https://shannon-faucet.somnia.network';

/* -------------------------------------------------------------------------- */
/*  Animated Balance Component                                                  */
/* -------------------------------------------------------------------------- */

function AnimatedBalance({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const reducedMotion = useReducedMotionSafe();
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reducedMotion) {
      setDisplay(value);
      return;
    }

    const from = prevRef.current;
    const to = value;
    prevRef.current = value;

    if (from === to) return;

    const startTime = performance.now();
    const duration = 400;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (to - from) * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, reducedMotion]);

  return <span className={className}>{display.toFixed(2)}</span>;
}

/* -------------------------------------------------------------------------- */
/*  Faucet Page                                                                */
/* -------------------------------------------------------------------------- */

export default function FaucetPage() {
  const reducedMotion = useReducedMotionSafe();
  const wallet = usePulseWallet();
  const isConnected = wallet.connectionStatus === 'connected';

  /* -- USDC balance state ------------------------------------------------- */
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [usdcLoading, setUsdcLoading] = useState(false);

  /* -- Faucet call state -------------------------------------------------- */
  const [faucetStatus, setFaucetStatus] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle');
  const [faucetError, setFaucetError] = useState<string | null>(null);

  /* -- Copy address state ------------------------------------------------- */
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* -- STT balance from wallet context ------------------------------------ */
  const sttBalance = parseFloat(wallet.sttBalance || '0');
  const sttSufficient = sttBalance >= STT_MINIMUM_THRESHOLD;

  /* -- Refetch STT balance on demand -------------------------------------- */
  const [sttRefreshing, setSttRefreshing] = useState(false);

  /* -- Derived state ------------------------------------------------------ */
  const bothSufficient = isConnected && usdcBalance !== null && usdcBalance > 0 && sttSufficient;

  /* -- Fetch test USDC balance -------------------------------------------- */
  const fetchUsdcBalance = useCallback(async () => {
    if (!wallet.address) return;
    setUsdcLoading(true);
    try {
      const raw = await publicClient.readContract({
        address: TEST_USDC,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [wallet.address as Hex],
      });
      setUsdcBalance(Number(raw) / Math.pow(10, USDC_DECIMALS));
    } catch {
      setUsdcBalance(0);
    } finally {
      setUsdcLoading(false);
    }
  }, [wallet.address]);

  /* -- Fetch USDC balance on connect and after faucet --------------------- */
  useEffect(() => {
    if (isConnected && wallet.address) {
      fetchUsdcBalance();
    } else {
      setUsdcBalance(null);
    }
  }, [isConnected, wallet.address, fetchUsdcBalance]);

  /* -- Request test USDC from faucet -------------------------------------- */
  const handleRequestFaucet = useCallback(async () => {
    if (faucetStatus === 'submitting') return;

    setFaucetStatus('submitting');
    setFaucetError(null);

    try {
      const walletClient = await getWalletClient(wagmiConfig);
      if (!walletClient || !wallet.address) {
        throw new Error('Wallet not connected. Please reconnect.');
      }

      const calldata = encodeFunctionData({
        abi: FAUCET_ABI,
        functionName: 'faucet',
      });

      await walletClient.sendTransaction({
        to: TEST_USDC,
        data: calldata,
        chain: somniaTestnet,
        account: walletClient.account!,
      });

      setFaucetStatus('success');
      setTimeout(fetchUsdcBalance, 1500);
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : 'Faucet call failed. Please try again.';
      // Detect chain mismatch and show a clearer message
      const message = raw.includes('does not match the target chain')
        ? 'Wrong network -- switch MetaMask to Somnia Testnet (chain 50312) and try again.'
        : raw;
      setFaucetError(message);
      setFaucetStatus('error');
    }
  }, [wallet.address, faucetStatus, fetchUsdcBalance]);

  /* -- Copy address to clipboard ------------------------------------------ */
  const handleCopyAddress = useCallback(async () => {
    if (!wallet.address) return;
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard API may fail in some environments
    }
  }, [wallet.address]);

  /* -- Refresh STT balance manually --------------------------------------- */
  const handleRefreshStt = useCallback(async () => {
    if (!wallet.address) return;
    setSttRefreshing(true);
    setTimeout(() => setSttRefreshing(false), 1000);
  }, [wallet.address]);

  /* -- Cleanup timers ----------------------------------------------------- */
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  /* ====================================================================== */
  /*  RENDER                                                                  */
  /* ====================================================================== */

  return (
    <div className={styles.page}>
      <AppChromeNav />

      <main className={styles.main}>
        {/* -- Header --------------------------------------------------------- */}
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
          <h1 className={styles.h1}>Get Ready to Trade</h1>
          <p className={styles.subcopy}>
            Everything you need to start trading DreamDEX Event Contracts on testnet.
          </p>
        </motion.div>

        {/* -- Chain mismatch warning */}
        {isConnected && <ChainMismatchBanner />}

        {/* -- Disconnected: prompt to connect -------------------------------- */}
        {!isConnected && (
          <motion.div
            className={styles.connectPrompt}
            variants={safeVariants(reducedMotion, fadeSlideUp)}
            initial="hidden"
            animate="visible"
            transition={safeTransition(reducedMotion, {
              duration: MOTION_MEDIUM,
              ease: EASE_OUT,
            })}
          >
            <Wallet size={36} className={styles.connectPromptIcon} aria-hidden="true" />
            <h2 className={styles.connectPromptTitle}>Connect your wallet first</h2>
            <p className={styles.connectPromptText}>
              Connect MetaMask (or any browser extension wallet) to get started.
              You will need STT for gas and test USDC as trading collateral.
            </p>
            <ConnectButton />
          </motion.div>
        )}

        {/* -- Connected: full onboarding flow -------------------------------- */}
        {isConnected && (
          <motion.div
            variants={safeVariants(reducedMotion, fadeSlideUp)}
            initial="hidden"
            animate="visible"
            transition={safeTransition(reducedMotion, {
              duration: MOTION_MEDIUM,
              ease: EASE_OUT,
            })}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
          >
            {/* Step 1: Get STT */}
            <div className={styles.glassCard}>
              <div className={styles.stepHeader}>
                <span className={styles.stepNumber}>1</span>
                <h2 className={styles.stepTitle}>Get testnet STT</h2>
                {sttSufficient ? (
                  <span className={`${styles.badge} ${styles.badgeSufficient}`}>
                    <CheckCircle size={10} aria-hidden="true" />
                    SUFFICIENT
                  </span>
                ) : (
                  <span className={`${styles.badge} ${styles.badgeInsufficient}`}>
                    <AlertCircle size={10} aria-hidden="true" />
                    INSUFFICIENT
                  </span>
                )}
              </div>

              <div className={styles.balanceSection}>
                <span className={styles.balanceLabel}>STT Balance</span>
                <div className={styles.balanceRow}>
                  <AnimatedBalance
                    value={sttBalance}
                    className={styles.balanceValue}
                  />
                  <span className={styles.balanceUnit}>STT</span>
                </div>
              </div>

              {wallet.address && (
                <div className={styles.addressDisplay}>
                  <span>{wallet.address}</span>
                </div>
              )}

              <p className={styles.stepInstructions}>
                1. Copy your address below
                <br />
                2. Paste it on the faucet page
                <br />
                3. Come back and refresh your balance
              </p>

              <div className={styles.btnGroup}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnSecondary}`}
                  onClick={handleCopyAddress}
                  aria-label="Copy wallet address to clipboard"
                >
                  {copied ? (
                    <>
                      <CheckCircle size={13} aria-hidden="true" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy size={13} aria-hidden="true" />
                      Copy My Address
                    </>
                  )}
                </button>

                <a
                  href={STT_FAUCET_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${styles.btn} ${styles.btnSecondary}`}
                  aria-label="Open Somnia testnet faucet in a new tab"
                >
                  <ExternalLink size={13} aria-hidden="true" />
                  Open Faucet
                </a>

                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnSecondary} ${
                    sttRefreshing ? styles.btnDisabled : ''
                  }`}
                  onClick={handleRefreshStt}
                  disabled={sttRefreshing}
                  aria-label="Check STT balance"
                >
                  <RefreshCw
                    size={13}
                    className={sttRefreshing ? 'spin' : ''}
                    aria-hidden="true"
                  />
                  Check Balance
                </button>
              </div>

              <div aria-live="polite" className="sr-only">
                {copied ? 'Address copied to clipboard' : ''}
              </div>
            </div>

            {/* Step 2: Get Test USDC (shown once STT is sufficient) */}
            {sttSufficient && (
              <motion.div
                variants={safeVariants(reducedMotion, fadeSlideUp)}
                initial="hidden"
                animate="visible"
                transition={safeTransition(reducedMotion, {
                  duration: MOTION_MEDIUM,
                  ease: EASE_OUT,
                })}
              >
                <div className={styles.glassCard}>
                  <div className={styles.stepHeader}>
                    <span className={styles.stepNumber}>2</span>
                    <h2 className={styles.stepTitle}>Get Test USDC</h2>
                    {usdcBalance !== null && usdcBalance > 0 && (
                      <span className={`${styles.badge} ${styles.badgeSufficient}`}>
                        <CheckCircle size={10} aria-hidden="true" />
                        READY
                      </span>
                    )}
                  </div>

                  <p className={styles.successExplanation}>
                    STT covers gas fees. Test USDC is the collateral you use to place trades.
                    You need both.
                  </p>

                  <div className={styles.balanceSection}>
                    <span className={styles.balanceLabel}>Test USDC Balance</span>
                    <div className={styles.balanceRow}>
                      {usdcLoading && usdcBalance === null ? (
                        <span className={styles.balanceValue}>--</span>
                      ) : (
                        <AnimatedBalance
                          value={usdcBalance ?? 0}
                          className={styles.balanceValue}
                        />
                      )}
                      <span className={styles.balanceUnit}>test USDC</span>
                    </div>
                  </div>

                  {faucetStatus === 'error' && faucetError && (
                    <div className={styles.errorBanner} role="alert">
                      <AlertCircle size={16} className={styles.errorBannerIcon} aria-hidden="true" />
                      <p className={styles.errorBannerText}>{faucetError}</p>
                      <button
                        type="button"
                        className={styles.errorBannerRetry}
                        onClick={handleRequestFaucet}
                      >
                        Try again
                      </button>
                    </div>
                  )}

                  <div className={styles.btnGroup}>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnPrimary} ${
                        faucetStatus === 'submitting' ? styles.btnDisabled : ''
                      }`}
                      onClick={handleRequestFaucet}
                      disabled={faucetStatus === 'submitting'}
                      aria-label="Get test USDC from the faucet"
                    >
                      {faucetStatus === 'submitting' ? (
                        <>
                          <Loader2 size={14} className="spin" aria-hidden="true" />
                          Requesting...
                        </>
                      ) : faucetStatus === 'success' ? (
                        <>
                          <CheckCircle size={14} aria-hidden="true" />
                          Received
                        </>
                      ) : (
                        'Get Test USDC'
                      )}
                    </button>

                    {usdcBalance !== null && usdcBalance > 0 && (
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnSecondary}`}
                        onClick={fetchUsdcBalance}
                        aria-label="Refresh test USDC balance"
                      >
                        <RefreshCw size={13} aria-hidden="true" />
                        Refresh
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* -- Shared Footer CTA (once ready) --------------------------------- */}
        {bothSufficient && (
          <motion.div
            className={styles.ctaFooter}
            variants={safeVariants(reducedMotion, fadeSlideUp)}
            initial="hidden"
            animate="visible"
            transition={safeTransition(reducedMotion, {
              duration: MOTION_MEDIUM,
              ease: EASE_OUT,
            })}
          >
            <h3 className={styles.ctaFooterTitle}>You are ready to trade</h3>
            <p className={styles.ctaFooterText}>
              You have STT for gas and test USDC collateral.
            </p>
            <Link href="/markets" className={styles.ctaButton}>
              Start Trading
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </motion.div>
        )}
      </main>
    </div>
  );
}
