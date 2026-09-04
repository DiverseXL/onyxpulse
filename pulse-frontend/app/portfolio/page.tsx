'use client';

/**
 * Portfolio page — real on-chain positions, PnL, and claimable winnings.
 *
 * This is a separate route from the landing page's sample-data PortfolioBody
 * preview tab. Uses only already-built, already-tested backend functions from
 * lib/engine/.
 *
 * NO EMOJI in code, comments, or UI copy — lucide-react icons only.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Wallet,
  TrendingUp,
  AlertCircle,
  RefreshCw,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  ExternalLink,
  ArrowRight,
  Inbox,
  FileText,
} from 'lucide-react';
import styles from './Portfolio.module.css';
import AppChromeNav from '@/components/markets/AppChromeNav';
import AnimatedCounter from '@/components/markets/AnimatedCounter';
import ChainMismatchBanner from '@/components/markets/ChainMismatchBanner';
import { usePulseWallet } from '@/lib/wallet/PulseWalletContext';
import { createPulseClient } from '@/lib/engine/client';
import {
  getMyOpenPositions,
  getMyRedeemablePositions,
  type PortfolioPosition,
  type ClaimablePositionInfo,
} from '@/lib/engine/portfolio';
import {
  claimAllRedeemable,
  type ClaimAllProgressStatus,
} from '@/lib/engine/claimAll';
import { redeemMarket } from '@/lib/engine/settlement';
import { PulseEngineError } from '@/lib/engine/errors';
import { fromBigintAmount } from '@/lib/engine/units';
import { getWalletClient } from '@wagmi/core';
import { wagmiConfig } from '@/lib/wallet/wagmiConfig';
import { assertCorrectChain } from '@/lib/wallet/chainGuard';
import {
  useReducedMotionSafe,
  safeVariants,
  safeTransition,
  fadeSlideUp,
  STAGGER_DELAY,
  MOTION_MEDIUM,
  MOTION_FAST,
  EASE_OUT,
} from '@/lib/motion';

/** Explorer base URL for Shannon testnet tx links. */
const EXPLORER_TX_URL = 'https://shannon-explorer.somnia.network/tx/' as const;

// ── Combined position type ──────────────────────────────────────────────────

interface EnrichedPosition {
  raw: PortfolioPosition;
  /** 0 = YES, 1 = NO. */
  outcomeIndex: 0 | 1;
  /** Human-readable balance (formatted with quoteDecimals). */
  humanBalance: string;
  /** Raw balance as bigint. */
  rawBalance: bigint;
  /** Market question text. */
  question: string;
  /** Market status string. */
  status: string;
  /** Raw last price (YES terms). */
  lastPrice: string;
  /** Token decimals for this market. */
  decimals: number;
  /** Approximate mark value (balance * lastPrice / oneCollateral). */
  markValue: number;
  /** Whether this position is claimable (cross-referenced with redeemable list). */
  isClaimable: boolean;
  /** Corresponding redeemable entry, if claimable. */
  claimableInfo: ClaimablePositionInfo | null;
  /** Market ID. */
  marketId: string;
}

// ── Claim progress tracking ─────────────────────────────────────────────────

interface ClaimProgressItem {
  marketId: string;
  question: string;
  status: ClaimAllProgressStatus;
  txHash?: string;
  errorMessage?: string;
}

// ── Helper: status label ────────────────────────────────────────────────────

function getStatusInfo(position: EnrichedPosition): {
  label: string;
  className: string;
} {
  if (position.isClaimable) {
    return { label: 'Claimable', className: styles.statusPillClaimable };
  }
  if (position.status === 'Voided') {
    return { label: 'Voided — Refund Available', className: styles.statusPillVoided };
  }
  if (position.status === 'Trading') {
    return { label: 'Trading', className: styles.statusPillOpen };
  }
  if (position.status === 'Locked') {
    return { label: 'Locked', className: styles.statusPillLocked };
  }
  return { label: position.status, className: styles.statusPillOpen };
}

// ── Page Component ──────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const wallet = usePulseWallet();
  const queryClient = useQueryClient();
  const reducedMotion = useReducedMotionSafe();
  const [mounted, setMounted] = useState(false);

  // Claim state
  const [claimStatus, setClaimStatus] = useState<
    'idle' | 'claiming-all' | 'claiming-one' | 'summary'
  >('idle');
  const [claimProgress, setClaimProgress] = useState<ClaimProgressItem[]>([]);
  const [claimSummary, setClaimSummary] = useState<{
    succeeded: number;
    failed: number;
    successes: Array<{ marketId: string; txHash: string }>;
    failures: Array<{ marketId: string; error: string }>;
  } | null>(null);
  const [claimOneBusy, setClaimOneBusy] = useState<string | null>(null);
  const [showClaimAllConfirm, setShowClaimAllConfirm] = useState(false);

  useEffect(() => setMounted(true), []);

  // ── Data queries (only when connected) ───────────────────────────────────

  const isConnected = mounted && wallet.connectionStatus === 'connected' && wallet.address;

  const pulse = useMemo(() => (isConnected ? createPulseClient() : null), [isConnected]);

  // Open positions
  const {
    data: openPositions,
    isLoading: isLoadingPositions,
    isError: isErrorPositions,
    refetch: refetchPositions,
  } = useQuery<PortfolioPosition[]>({
    queryKey: ['portfolio-positions', wallet.address],
    queryFn: async () => {
      if (!pulse || !wallet.address) return [];
      return getMyOpenPositions(pulse.client, wallet.address as `0x${string}`);
    },
    enabled: !!isConnected && !!pulse,
    refetchInterval: 25000,
    placeholderData: (prev) => prev,
  });

  // Redeemable positions
  const {
    data: redeemablePositions,
    isLoading: isLoadingRedeemable,
    refetch: refetchRedeemable,
  } = useQuery<ClaimablePositionInfo[]>({
    queryKey: ['portfolio-redeemable', wallet.address],
    queryFn: async () => {
      if (!pulse || !wallet.address) return [];
      return getMyRedeemablePositions(pulse.client, wallet.address as `0x${string}`);
    },
    enabled: !!isConnected && !!pulse,
    refetchInterval: 25000,
    placeholderData: (prev) => prev,
  });

  // ── Enrich positions with claimable cross-reference + mark value ──────────

  const enrichedPositions = useMemo<EnrichedPosition[]>(() => {
    if (!openPositions) return [];

    const claimableMap = new Map<string, ClaimablePositionInfo>();
    if (redeemablePositions) {
      for (const c of redeemablePositions) {
        claimableMap.set(c.marketId.toLowerCase(), c);
      }
    }

    return openPositions
      .filter((p) => BigInt(p.balance) > 0n)
      .map((p) => {
        const outcomeIndex = p.outcomeIndex as 0 | 1;
        const decimals = p.market?.quoteDecimals ?? 6;
        const rawBalance = BigInt(p.balance);
        const humanBalance = fromBigintAmount(rawBalance, decimals);
        const marketId = p.market?.id ?? '';

        // Approximate mark value: balance * lastPrice / oneCollateral
        const lastPriceRaw = p.market?.lastPrice ?? '0';
        const oneCollateral = 10 ** decimals;
        const markValue =
          rawBalance > 0n
            ? (Number(rawBalance) * Number(lastPriceRaw)) / oneCollateral
            : 0;

        const isClaimable = claimableMap.has(marketId.toLowerCase());

        return {
          raw: p,
          outcomeIndex,
          humanBalance,
          rawBalance,
          question: p.market?.question ?? 'Unknown market',
          status: p.market?.status ?? 'Unknown',
          lastPrice: lastPriceRaw,
          decimals,
          markValue,
          isClaimable,
          claimableInfo: claimableMap.get(marketId.toLowerCase()) ?? null,
          marketId,
        };
      });
  }, [openPositions, redeemablePositions]);

  // ── Aggregate stats ───────────────────────────────────────────────────────

  const totalValue = useMemo(
    () => enrichedPositions.reduce((sum, p) => sum + p.markValue, 0),
    [enrichedPositions],
  );

  const openCount = enrichedPositions.filter(
    (p) => !p.isClaimable && p.status !== 'Voided',
  ).length;

  const claimableCount = enrichedPositions.filter((p) => p.isClaimable).length;

  const claimableValue = useMemo(
    () =>
      enrichedPositions
        .filter((p) => p.isClaimable)
        .reduce((sum, p) => sum + p.markValue, 0),
    [enrichedPositions],
  );

  const hasAnyPositions = enrichedPositions.length > 0;

  // ── Create wallet-backed trader for claims ────────────────────────────────

  const createWalletTrader = useCallback(async () => {
    const walletClient = await getWalletClient(wagmiConfig);
    if (!walletClient || !walletClient.account) {
      throw new Error(
        'Wallet client not available. Please reconnect your wallet.',
      );
    }
    // Hard backstop: verify chain ID before constructing the trader
    assertCorrectChain(walletClient, 'claim/redeem');
    const pulseClient = createPulseClient();
    return {
      trader: pulseClient.client.createTrader({ walletClient }),
      client: pulseClient.client,
      account: walletClient.account,
    };
  }, []);

  // ── Claim All handler ─────────────────────────────────────────────────────

  const handleClaimAll = useCallback(async () => {
    if (!wallet.address || claimStatus !== 'idle') return;

    setClaimStatus('claiming-all');
    setClaimProgress([]);
    setClaimSummary(null);

    try {
      const { trader, client } = await createWalletTrader();

      const result = await claimAllRedeemable(
        trader,
        client,
        wallet.address,
        (marketId: string, status: ClaimAllProgressStatus) => {
          setClaimProgress((prev) => {
            const existing = prev.findIndex(
              (item) => item.marketId === marketId,
            );
            if (existing >= 0) {
              const updated = [...prev];
              updated[existing] = { ...updated[existing], status };
              return updated;
            }
            // Find question from enriched positions
            const pos = enrichedPositions.find(
              (p) => p.marketId.toLowerCase() === marketId.toLowerCase(),
            );
            return [
              ...prev,
              {
                marketId,
                question: pos?.question ?? marketId.slice(0, 10) + '...',
                status,
              },
            ];
          });
        },
      );

      setClaimSummary({
        succeeded: result.totalClaimed,
        failed: result.failed.length,
        successes: result.succeeded,
        failures: result.failed.map((f) => ({
          marketId: f.marketId,
          error:
            f.error instanceof PulseEngineError
              ? f.error.message
              : String(f.error),
        })),
      });

      setClaimStatus('summary');

      // Refresh position data after claiming
      queryClient.invalidateQueries({ queryKey: ['portfolio-positions'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-redeemable'] });
    } catch (err: unknown) {
      const message =
        err instanceof PulseEngineError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Unknown error during batch claim';
      setClaimSummary({
        succeeded: 0,
        failed: 1,
        successes: [],
        failures: [{ marketId: 'batch', error: message }],
      });
      setClaimStatus('summary');
    }
  }, [
    wallet.address,
    claimStatus,
    createWalletTrader,
    enrichedPositions,
    queryClient,
  ]);

  // ── Individual claim handler ──────────────────────────────────────────────

  const handleClaimOne = useCallback(
    async (position: EnrichedPosition) => {
      if (!wallet.address || !position.claimableInfo || claimOneBusy) return;

      setClaimOneBusy(position.marketId);

      try {
        const { trader, client } = await createWalletTrader();

        await redeemMarket(
          trader,
          client,
          position.marketId,
          wallet.address,
        );

        // Refresh data
        queryClient.invalidateQueries({ queryKey: ['portfolio-positions'] });
        queryClient.invalidateQueries({ queryKey: ['portfolio-redeemable'] });
      } catch (err: unknown) {
        // Error is non-fatal for individual claim — just log and let user retry
        console.error('Individual claim failed:', err);
      } finally {
        setClaimOneBusy(null);
      }
    },
    [wallet.address, claimOneBusy, createWalletTrader, queryClient],
  );

  // ── Dismiss claim summary ─────────────────────────────────────────────────

  const dismissSummary = useCallback(() => {
    setClaimStatus('idle');
    setClaimProgress([]);
    setClaimSummary(null);
  }, []);

  // ── Waiting for hydration ─────────────────────────────────────────────────

  if (!mounted) {
    return (
      <div className={styles.page}>
        <AppChromeNav />
      </div>
    );
  }

  // ── Disconnected state ───────────────────────────────────────────────────

  if (!isConnected) {
    return (
      <div className={styles.page}>
        <AppChromeNav />
        <main className={styles.main}>
          <motion.div
            className={styles.disconnected}
            variants={safeVariants(reducedMotion, fadeSlideUp)}
            initial="hidden"
            animate="visible"
            transition={safeTransition(reducedMotion, {
              duration: MOTION_MEDIUM,
              ease: EASE_OUT,
            })}
          >
            <Wallet
              size={48}
              className={styles.disconnectedIcon}
              aria-hidden="true"
            />
            <h1 className={styles.disconnectedTitle}>Your Portfolio</h1>
            <p className={styles.disconnectedSubcopy}>
              Connect your wallet to view your portfolio
            </p>
          </motion.div>
        </main>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────

  if (isErrorPositions && !openPositions) {
    return (
      <div className={styles.page}>
        <AppChromeNav />
        <main className={styles.main}>
          <ChainMismatchBanner />
          <div className={styles.errorState} role="alert">
            <AlertCircle size={28} className={styles.errorIcon} aria-hidden="true" />
            <h3 className={styles.errorTitle}>Failed to load portfolio</h3>
            <p className={styles.errorText}>
              Could not fetch positions from Somnia Shannon testnet. Please check
              your connection and try again.
            </p>
            <button
              type="button"
              className={styles.retryButton}
              onClick={() => refetchPositions()}
            >
              <RefreshCw size={14} aria-hidden="true" />
              Retry
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ── Loading skeleton ─────────────────────────────────────────────────────

  if (isLoadingPositions && !openPositions) {
    return (
      <div className={styles.page}>
        <AppChromeNav />
        <main className={styles.main}>
          <ChainMismatchBanner />
          <div className={styles.headerSection}>
            <div
              className="skeletonPulse"
              style={{
                width: '220px',
                height: '28px',
                borderRadius: '4px',
                background: 'rgba(255,255,255,0.06)',
              }}
            />
            <div
              className="skeletonPulse"
              style={{
                width: '380px',
                height: '14px',
                borderRadius: '4px',
                background: 'rgba(255,255,255,0.04)',
                marginTop: '8px',
              }}
            />
          </div>
          <div className={styles.statsRow}>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={styles.statCard}
              >
                <div
                  className="skeletonPulse"
                  style={{
                    width: '80px',
                    height: '10px',
                    borderRadius: '4px',
                    background: 'rgba(255,255,255,0.06)',
                  }}
                />
                <div
                  className="skeletonPulse"
                  style={{
                    width: '100px',
                    height: '22px',
                    borderRadius: '4px',
                    background: 'rgba(255,255,255,0.06)',
                    marginTop: '4px',
                  }}
                />
              </div>
            ))}
          </div>

          {/* Table skeleton */}
          <div className={styles.tableContainer}>
            <table className={styles.skeletonTable} aria-hidden="true">
              <thead className={styles.tableHead}>
                <tr>
                  <th>Market</th>
                  <th>Side</th>
                  <th className={styles.hideOnMobile}>Quantity</th>
                  <th className={styles.hideOnMobile}>Current</th>
                  <th>Status</th>
                  <th>Value</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody className={styles.tableBody}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className={styles.skeletonRow}>
                    <td className={styles.skeletonCell}>
                      <div className={`${styles.skeletonBar} skeletonPulse`} style={{ width: `${120 + (i % 3) * 30}px`, height: '12px' }} />
                    </td>
                    <td className={styles.skeletonCell}>
                      <div className={`${styles.skeletonBar} ${styles.skeletonBarPill} skeletonPulse`} />
                    </td>
                    <td className={`${styles.skeletonCell} ${styles.hideOnMobile}`}>
                      <div className={`${styles.skeletonBar} ${styles.skeletonBarMedium} skeletonPulse`} />
                    </td>
                    <td className={`${styles.skeletonCell} ${styles.hideOnMobile}`}>
                      <div className={`${styles.skeletonBar} ${styles.skeletonBarShort} skeletonPulse`} />
                    </td>
                    <td className={styles.skeletonCell}>
                      <div className={`${styles.skeletonBar} ${styles.skeletonBarPill} skeletonPulse`} />
                    </td>
                    <td className={styles.skeletonCell}>
                      <div className={`${styles.skeletonBar} ${styles.skeletonBarShort} skeletonPulse`} />
                    </td>
                    <td className={styles.skeletonCell}>
                      <div className={`${styles.skeletonBar} ${styles.skeletonBarAction} skeletonPulse`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    );
  }

  // ── Main connected content ────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      <AppChromeNav />

      <main className={styles.main}>
        <ChainMismatchBanner />

        {/* Header */}
        <motion.div
          className={styles.headerSection}
          variants={safeVariants(reducedMotion, fadeSlideUp)}
          initial="hidden"
          animate="visible"
          transition={safeTransition(reducedMotion, {
            duration: MOTION_MEDIUM,
            ease: EASE_OUT,
          })}
        >
          <h1 className={styles.h1}>Your Portfolio</h1>
          <p className={styles.subcopy}>
            Live positions from Somnia Shannon testnet. Real on-chain balances —
            nothing simulated.
          </p>
        </motion.div>

        {/* Stats Row */}
        <motion.div
          className={styles.statsRow}
          variants={safeVariants(reducedMotion, fadeSlideUp)}
          initial="hidden"
          animate="visible"
          transition={safeTransition(reducedMotion, {
            duration: MOTION_MEDIUM,
            ease: EASE_OUT,
          })}
        >
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Total Value</span>
            <span
              className={`${styles.statValue} ${
                totalValue > 0
                  ? styles.statValuePositive
                  : totalValue < 0
                    ? styles.statValueNegative
                    : styles.statValueNeutral
              }`}
            >
              $
              <AnimatedCounter
                value={Math.round(totalValue * 100) / 100}
              />
            </span>
          </div>

          <div className={styles.statCard}>
            <span className={styles.statLabel}>Open Positions</span>
            <span className={styles.statValue}>
              <AnimatedCounter value={openCount} />
            </span>
          </div>

          <div className={styles.statCard}>
            <span className={styles.statLabel}>Claimable</span>
            <span className={`${styles.statValue} ${claimableCount > 0 ? styles.statValuePositive : styles.statValueNeutral}`}>
              <AnimatedCounter value={claimableCount} />
              {claimableCount > 0 && (
                <span style={{ fontSize: 'var(--text-small)', marginLeft: 'var(--space-2)', opacity: 0.7 }}>
                  (${Math.round(claimableValue * 100) / 100})
                </span>
              )}
            </span>
          </div>
        </motion.div>

        {/* Claim All Bar */}
        {claimableCount > 0 && (
          <motion.div
            variants={safeVariants(reducedMotion, fadeSlideUp)}
            initial="hidden"
            animate="visible"
            transition={safeTransition(reducedMotion, {
              duration: MOTION_FAST,
              ease: EASE_OUT,
            })}
          >
            {claimStatus === 'idle' && (
              <div className={styles.claimBar}>
                <div className={styles.claimBarLeft}>
                  <CheckCircle size={16} style={{ color: '#4ade80', flexShrink: 0 }} aria-hidden="true" />
                  <span className={styles.claimBarText}>
                    <span className={styles.claimBarCount}>{claimableCount}</span>{' '}
                    position{claimableCount !== 1 ? 's' : ''} ready to claim
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.claimAllButton}
                  onClick={() => setShowClaimAllConfirm(true)}
                  aria-label={`Claim all ${claimableCount} redeemable positions`}
                >
                  Claim All ({claimableCount})
                </button>
              </div>
            )}

            {claimStatus === 'claiming-all' && (
              <div className={styles.claimProgress}>
                {claimProgress.map((item) => (
                  <div key={item.marketId} className={styles.claimProgressItem}>
                    {item.status === 'claiming' && (
                      <Loader2
                        size={14}
                        className={`${styles.claimProgressIcon} ${styles.claimProgressIconClaiming} ${styles.spinner}`}
                        aria-hidden="true"
                      />
                    )}
                    {item.status === 'success' && (
                      <CheckCircle
                        size={14}
                        className={`${styles.claimProgressIcon} ${styles.claimProgressIconSuccess}`}
                        aria-hidden="true"
                      />
                    )}
                    {item.status === 'failed' && (
                      <XCircle
                        size={14}
                        className={`${styles.claimProgressIcon} ${styles.claimProgressIconFailed}`}
                        aria-hidden="true"
                      />
                    )}
                    <span className={styles.claimProgressMarket}>{item.question}</span>
                    <span>{item.status}</span>
                  </div>
                ))}
                {claimProgress.length === 0 && (
                  <div className={styles.claimProgressItem}>
                    <Loader2
                      size={14}
                      className={`${styles.claimProgressIcon} ${styles.claimProgressIconClaiming} ${styles.spinner}`}
                      aria-hidden="true"
                    />
                    <span>Preparing claims...</span>
                  </div>
                )}
              </div>
            )}

            {claimStatus === 'summary' && claimSummary && (
              <div className={styles.claimSummary}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className={styles.claimSummaryText}>
                    <span className={styles.claimSummaryTextStrong}>
                      {claimSummary.succeeded} claimed
                    </span>
                    {claimSummary.failed > 0 && (
                      <>
                        ,{' '}
                        <span style={{ color: '#f87171' }}>
                          {claimSummary.failed} failed
                        </span>
                      </>
                    )}
                  </p>

                  {claimSummary.successes.map((s) => (
                    <a
                      key={s.txHash}
                      href={`${EXPLORER_TX_URL}${s.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.claimSummaryLink}
                    >
                      View tx {s.txHash.slice(0, 10)}...
                      <ExternalLink size={10} style={{ marginLeft: '2px' }} aria-hidden="true" />
                    </a>
                  ))}

                  {claimSummary.failures.map((f) => (
                    <p
                      key={f.marketId}
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--text-micro)',
                        color: '#f87171',
                        marginTop: 'var(--space-1)',
                      }}
                    >
                      {f.error}
                    </p>
                  ))}
                </div>

                <button
                  type="button"
                  className={styles.retryButton}
                  onClick={dismissSummary}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    borderColor: 'rgba(255,255,255,0.15)',
                    color: 'var(--color-paper)',
                    flexShrink: 0,
                  }}
                >
                  Dismiss
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* Empty state */}
        {!isLoadingPositions && !hasAnyPositions && (
          <motion.div
            className={styles.emptyState}
            variants={safeVariants(reducedMotion, fadeSlideUp)}
            initial="hidden"
            animate="visible"
            transition={safeTransition(reducedMotion, {
              duration: MOTION_MEDIUM,
              ease: EASE_OUT,
            })}
          >
            <Inbox size={36} className={styles.emptyIcon} aria-hidden="true" />
            <h3 className={styles.emptyTitle}>No positions yet</h3>
            <p className={styles.emptyText}>
              Head to Markets to place your first trade.
            </p>
            <Link href="/markets" className={styles.marketsLink}>
              Browse Markets
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </motion.div>
        )}

        {/* Positions table */}
        {hasAnyPositions && (
          <motion.div
            variants={safeVariants(reducedMotion, fadeSlideUp)}
            initial="hidden"
            animate="visible"
            transition={safeTransition(reducedMotion, {
              duration: MOTION_MEDIUM,
              ease: EASE_OUT,
            })}
          >
            <div className={styles.tableContainer}>
              <table className={styles.positionsTable} role="table">
                <thead className={styles.tableHead}>
                  <tr>
                    <th scope="col">Market</th>
                    <th scope="col">Side</th>
                    <th scope="col" className={styles.hideOnMobile}>Quantity</th>
                    <th scope="col" className={styles.hideOnMobile}>Current</th>
                    <th scope="col">Status</th>
                    <th scope="col">Value</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <motion.tbody
                  className={styles.tableBody}
                  variants={safeVariants(reducedMotion, {
                    hidden: {},
                    visible: {
                      transition: {
                        staggerChildren: STAGGER_DELAY,
                      },
                    },
                  })}
                >
                  {enrichedPositions.map((position) => {
                    const statusInfo = getStatusInfo(position);
                    const decimals = position.decimals;
                    const currentPriceRaw = position.lastPrice;
                    const currentPrice = currentPriceRaw
                      ? (Number(currentPriceRaw) / 10 ** decimals) * 100
                      : 0;
                    const oneCollateral = 10 ** decimals;
                    const valueFormatted =
                      position.markValue > 0
                        ? `$${position.markValue.toFixed(2)}`
                        : position.status === 'Voided'
                          ? `$${(Number(position.rawBalance) / oneCollateral * 0.5).toFixed(2)}`
                          : '--';

                    return (
                      <motion.tr
                        key={`${position.marketId}-${position.outcomeIndex}`}
                        variants={safeVariants(reducedMotion, {
                          hidden: { opacity: 0, y: 8 },
                          visible: {
                            opacity: 1,
                            y: 0,
                            transition: safeTransition(reducedMotion, {
                              duration: MOTION_FAST,
                              ease: EASE_OUT,
                            }),
                          },
                        })}
                      >
                        <td className={`${styles.tableCell} ${styles.tableCellMarket}`}>
                          <Link
                            href={`/market/${position.marketId}`}
                            style={{
                              color: 'var(--color-paper)',
                              textDecoration: 'none',
                              transition: 'opacity 150ms ease',
                            }}
                            onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => {
                              e.currentTarget.style.opacity = '0.8';
                            }}
                            onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => {
                              e.currentTarget.style.opacity = '1';
                            }}
                          >
                            {position.question}
                          </Link>
                        </td>
                        <td className={styles.tableCell}>
                          <span
                            className={`${styles.sideChip} ${
                              position.outcomeIndex === 0
                                ? styles.sideChipYes
                                : styles.sideChipNo
                            }`}
                          >
                            {position.outcomeIndex === 0 ? 'YES' : 'NO'}
                          </span>
                        </td>
                        <td className={`${styles.tableCell} ${styles.tableCellMono} ${styles.hideOnMobile}`}>
                          {position.humanBalance}
                        </td>
                        <td className={`${styles.tableCell} ${styles.tableCellMono} ${styles.hideOnMobile}`}>
                          {currentPrice > 0 ? `${currentPrice.toFixed(0)}%` : '--'}
                        </td>
                        <td className={styles.tableCell}>
                          <span className={`${styles.statusPill} ${statusInfo.className}`}>
                            {statusInfo.label}
                          </span>
                        </td>
                        <td className={`${styles.tableCell} ${styles.tableCellMono}`}>
                          {valueFormatted}
                        </td>
                        <td className={styles.tableCell}>
                          <div className={styles.actionCell}>
                            {position.isClaimable && (
                              <button
                                type="button"
                                className={`${styles.claimButton} ${
                                  claimOneBusy === position.marketId
                                    ? styles.claimButtonBusy
                                    : ''
                                }`}
                                onClick={() => handleClaimOne(position)}
                                disabled={claimOneBusy !== null}
                                aria-busy={claimOneBusy === position.marketId}
                                aria-label={`Claim position in ${position.question}`}
                              >
                                {claimOneBusy === position.marketId ? (
                                  <Loader2 size={12} className={styles.spinner} aria-hidden="true" />
                                ) : (
                                  'Claim'
                                )}
                              </button>
                            )}
                            {(position.isClaimable || position.status === 'Voided' || position.status === 'Resolved' || position.status === 'Finalized') && (
                              <Link
                                href={`/receipt/${position.marketId}`}
                                className={styles.receiptLink}
                                aria-label={`View receipt for ${position.question}`}
                              >
                                <FileText size={11} aria-hidden="true" />
                                Receipt
                              </Link>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </motion.tbody>
              </table>
            </div>

            {/* Mobile Position Cards (hidden on desktop) */}
            <div className={styles.mobileCards}>
              {enrichedPositions.map((position) => {
                const statusInfo = getStatusInfo(position);
                const decimals = position.decimals;
                const currentPriceRaw = position.lastPrice;
                const currentPrice = currentPriceRaw
                  ? (Number(currentPriceRaw) / 10 ** decimals) * 100
                  : 0;
                const oneCollateral = 10 ** decimals;
                const valueFormatted =
                  position.markValue > 0
                    ? `$${position.markValue.toFixed(2)}`
                    : position.status === 'Voided'
                      ? `$${(Number(position.rawBalance) / oneCollateral * 0.5).toFixed(2)}`
                      : '--';

                return (
                  <div
                    key={`card-${position.marketId}-${position.outcomeIndex}`}
                    className={styles.positionCard}
                  >
                    <div className={styles.positionCardHeader}>
                      <Link
                        href={`/market/${position.marketId}`}
                        className={styles.positionCardTitle}
                      >
                        {position.question}
                      </Link>
                      <span className={`${styles.statusPill} ${statusInfo.className}`}>
                        {statusInfo.label}
                      </span>
                    </div>

                    <div className={styles.positionCardMetrics}>
                      <div className={styles.positionCardMetric}>
                        <span className={styles.positionCardMetricLabel}>Side</span>
                        <span className={`${styles.sideChip} ${position.outcomeIndex === 0 ? styles.sideChipYes : styles.sideChipNo}`}>
                          {position.outcomeIndex === 0 ? 'YES' : 'NO'}
                        </span>
                      </div>
                      <div className={styles.positionCardMetric}>
                        <span className={styles.positionCardMetricLabel}>Quantity</span>
                        <span className={styles.positionCardMetricValue}>{position.humanBalance}</span>
                      </div>
                      <div className={styles.positionCardMetric}>
                        <span className={styles.positionCardMetricLabel}>Current</span>
                        <span className={styles.positionCardMetricValue}>{currentPrice > 0 ? `${currentPrice.toFixed(0)}%` : '--'}</span>
                      </div>
                      <div className={styles.positionCardMetric}>
                        <span className={styles.positionCardMetricLabel}>Value</span>
                        <span className={styles.positionCardMetricValue}>{valueFormatted}</span>
                      </div>
                    </div>

                    <div className={styles.positionCardActions}>
                      {position.isClaimable && (
                        <button
                          type="button"
                          className={`${styles.claimButton} ${claimOneBusy === position.marketId ? styles.claimButtonBusy : ''}`}
                          onClick={() => handleClaimOne(position)}
                          disabled={claimOneBusy !== null}
                          aria-busy={claimOneBusy === position.marketId}
                          aria-label={`Claim position in ${position.question}`}
                        >
                          {claimOneBusy === position.marketId ? (
                            <Loader2 size={12} className={styles.spinner} aria-hidden="true" />
                          ) : (
                            'Claim'
                          )}
                        </button>
                      )}
                      {(position.isClaimable || position.status === 'Voided' || position.status === 'Resolved' || position.status === 'Finalized') && (
                        <Link
                          href={`/receipt/${position.marketId}`}
                          className={styles.receiptLink}
                          aria-label={`View receipt for ${position.question}`}
                        >
                          <FileText size={11} aria-hidden="true" />
                          Receipt
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </main>

      {/* Claim All Confirmation Modal */}
      {showClaimAllConfirm && (
        <div
          className={styles.rejectedOverlay}
          role="dialog"
          aria-label="Confirm Claim All"
          aria-modal="true"
        >
          <motion.div
            className={styles.claimConfirmPopup}
            variants={safeVariants(reducedMotion, {
              hidden: { opacity: 0, scale: 0.95, y: 8 },
              visible: { opacity: 1, scale: 1, y: 0 },
            })}
            initial="hidden"
            animate="visible"
            transition={safeTransition(reducedMotion, {
              duration: MOTION_FAST,
              ease: EASE_OUT,
            })}
          >
            <p className={styles.claimConfirmTitle}>Claim All Positions</p>
            <p className={styles.claimConfirmMessage}>
              Claim <strong>{claimableCount}</strong> position{claimableCount !== 1 ? 's' : ''}?
              This will submit up to <strong>{claimableCount}</strong> separate transaction{claimableCount !== 1 ? 's' : ''}.
            </p>
            <div className={styles.claimConfirmActions}>
              <button
                type="button"
                className={styles.claimConfirmPrimary}
                onClick={() => {
                  setShowClaimAllConfirm(false);
                  handleClaimAll();
                }}
              >
                Confirm
              </button>
              <button
                type="button"
                className={styles.claimConfirmDismiss}
                onClick={() => setShowClaimAllConfirm(false)}
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
