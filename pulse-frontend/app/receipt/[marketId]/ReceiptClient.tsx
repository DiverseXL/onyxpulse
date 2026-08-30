'use client';

/**
 * ReceiptClient -- client-side interactive receipt display.
 *
 * Handles: copy link, raw JSON toggle, and distinct states for
 * resolved, pending, not-found, and error. All data comes from
 * the server component's initial fetch -- no wallet required.
 * NO EMOJI anywhere -- lucide-react icons only.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  ExternalLink,
  Clock,
  Copy,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  ArrowLeft,
  Loader2,
  Download,
} from 'lucide-react';
import styles from './Receipt.module.css';
import AppChromeNav from '@/components/markets/AppChromeNav';
import type { PulseReceipt } from '@/lib/engine';
import { receiptToJson, createPulseClient, fromBigintAmount } from '@/lib/engine';
import { usePulseWallet } from '@/lib/wallet/PulseWalletContext';
import { downloadReceipt, type ReceiptImageData } from '@/lib/receipt/renderReceipt';
import {
  useReducedMotionSafe,
  safeVariants,
  safeTransition,
  fadeScale,
  MOTION_MEDIUM,
  EASE_OUT,
} from '@/lib/motion';

// ─── API response types ───────────────────────────────────────────────────────

type ReceiptApiResponse =
  | { receipt: PulseReceipt; status: 'resolved' }
  | { receipt: null; status: 'pending'; currentStatus: string; marketId: string }
  | { receipt: null; status: 'not_found' }
  | { receipt: null; status: 'error'; error: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatExpiry(unixSeconds: string): string {
  const ms = Number(unixSeconds) * 1000;
  const d = new Date(ms);
  return (
    d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
      hour12: false,
    }) + ' UTC'
  );
}

function formatGeneratedAt(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
      hour12: false,
    }) + ' UTC'
  );
}

/** Human-readable status labels for pending states. */
function statusLabel(s: string): string {
  switch (s) {
    case 'Trading':
      return 'Trading (live)';
    case 'Locked':
      return 'Locked (awaiting resolution)';
    case 'Listed':
      return 'Listed (not yet trading)';
    case 'Settling':
      return 'Settling';
    default:
      return s;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ReceiptClientProps {
  marketId: string;
  initialData: ReceiptApiResponse;
}

export default function ReceiptClient({
  marketId,
  initialData,
}: ReceiptClientProps) {
  const reducedMotion = useReducedMotionSafe();

  const [data, setData] = useState<ReceiptApiResponse>(initialData);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);

  // Wallet-gated download state
  const wallet = usePulseWallet();
  const isConnected = wallet.connectionStatus === 'connected' && !!wallet.address;
  const [positionData, setPositionData] = useState<ReceiptImageData | null>(null);
  const [positionLoading, setPositionLoading] = useState(false);
  const [positionError, setPositionError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Re-fetch on mount if initial data was an error (retry once)
  useEffect(() => {
    if (initialData.status !== 'error') return;

    let cancelled = false;
    async function retry() {
      try {
        const res = await fetch(
          `/api/receipt/${encodeURIComponent(marketId)}`,
        );
        if (!cancelled && res.ok) {
          const json: ReceiptApiResponse = await res.json();
          setData(json);
        }
      } catch {
        // keep initial error state
      }
    }
    retry();
    return () => {
      cancelled = true;
    };
  }, [marketId, initialData]);

  // Copy link handler
  const handleCopyLink = useCallback(async () => {
    try {
      const url = window.location.href;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard API may fail
    }
  }, []);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  // Derived receipt data (must be before useEffect that references it)
  const receipt = data.status === 'resolved' ? data.receipt : null;
  const isResolved =
    receipt?.status === 'Resolved' || receipt?.status === 'Finalized';
  const isVoided = receipt?.voided === true;

  // Fetch wallet position for this market (only when connected + receipt loaded)
  useEffect(() => {
    if (!isConnected || !wallet.address || !receipt) return;

    // Capture receipt in a local const for TypeScript narrowing
    const r = receipt;

    let cancelled = false;
    setPositionLoading(true);
    setPositionError(null);
    setPositionData(null);

    async function fetchPosition() {
      try {
        const pulse = createPulseClient();
        const positions = await pulse.client.getPortfolio(
          wallet.address!.toLowerCase(),
        );

        if (cancelled) return;

        // Find position for this market
        const position = positions.positions.find(
          (p) =>
            p.market?.id?.toLowerCase() === marketId.toLowerCase() &&
            BigInt(p.balance) > 0n,
        );

        if (!position || !position.market) {
          setPositionError('no_position');
          setPositionLoading(false);
          return;
        }

        const decimals = position.market.quoteDecimals ?? 6;
        const balance = BigInt(position.balance);
        const humanBalance = fromBigintAmount(balance, decimals);

        // Compute cost and payout from market data
        const lastPriceRaw = position.market.lastPrice ?? '0';
        const lastPrice = Number(lastPriceRaw) / 10 ** decimals;
        const cost = (Number(balance) / 10 ** decimals) * lastPrice;

        // Determine payout based on resolution
        const isWinner =
          !r.voided &&
          r.winningOutcome !== null &&
          r.winningOutcome === position.outcomeIndex;
        const payout = r.voided
          ? Number(balance) / 10 ** decimals * 0.5
          : isWinner
            ? Number(balance) / 10 ** decimals
            : 0;
        const netPnl = payout - cost;

        const tradeData: ReceiptImageData = {
          receipt: {
            marketId: r.marketId,
            question: r.question,
            asset: r.asset,
            strike: r.strike,
            expiry: r.expiry,
            status: r.status,
            winningOutcome: r.winningOutcome,
            voided: r.voided,
            voidedNote: r.voidedNote,
            explorerTxUrl: r.explorerTxUrl,
          },
          trade: {
            outcomeIndex: position.outcomeIndex as 0 | 1,
            quantity: humanBalance,
            entryPrice: lastPrice.toFixed(2),
            cost: cost.toFixed(2),
            payout: payout.toFixed(2),
            netPnl: `${netPnl >= 0 ? '+' : ''}${netPnl.toFixed(2)}`,
            txHash: null,
          },
        };

        if (!cancelled) {
          setPositionData(tradeData);
          setPositionLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to fetch position:', err);
          setPositionError('fetch_failed');
          setPositionLoading(false);
        }
      }
    }

    fetchPosition();
    return () => {
      cancelled = true;
    };
  }, [isConnected, wallet.address, receipt, marketId]);

  // Download handler
  const handleDownload = useCallback(async () => {
    if (!positionData || downloading) return;

    setDownloading(true);
    setDownloadError(null);

    try {
      await downloadReceipt(positionData, marketId);
    } catch (err) {
      console.error('Receipt download failed:', err);
      setDownloadError('Failed to generate receipt image. Please try again.');
    } finally {
      setDownloading(false);
    }
  }, [positionData, downloading, marketId]);

  const statusBadge = isVoided ? 'Voided' : 'Resolved';
  const statusBadgeClass = isVoided
    ? styles.statusVoided
    : styles.statusResolved;

  const winnerLabel =
    receipt && !isVoided && receipt.winningOutcome !== null
      ? receipt.winningOutcome === 0
        ? 'Yes'
        : 'No'
      : null;

  return (
    <div className={styles.page}>
      <AppChromeNav />

      <main className={styles.main}>
        {/* ── Back link ── */}
        <Link href="/markets" className={styles.backLink}>
          <ArrowLeft size={14} aria-hidden="true" />
          Markets
        </Link>

        {/* ── Header ── */}
        <motion.div
          className={styles.headerSection}
          variants={safeVariants(reducedMotion, fadeScale)}
          initial="hidden"
          animate="visible"
          transition={safeTransition(reducedMotion, {
            duration: MOTION_MEDIUM,
            ease: EASE_OUT,
          })}
        >
          <div className={styles.headerLabel}>
            <ShieldCheck
              size={14}
              className={styles.headerIcon}
              aria-hidden="true"
            />
            <span className={styles.headerTitle}>Verified Settlement</span>
          </div>
          <p className={styles.headerSub}>
            Independently verifiable on Somnia Shannon testnet -- no admin, no
            trust required.
          </p>
        </motion.div>

        {/* ── STATE: Error (retry failed) ── */}
        {data.status === 'error' && (
          <div className={styles.errorState}>
            <AlertCircle
              size={32}
              className={styles.errorIcon}
              aria-hidden="true"
            />
            <h2 className={styles.errorTitle}>Something went wrong</h2>
            <p className={styles.errorText}>
              Could not load receipt data. Please try again later.
            </p>
            <Link href="/markets" className={styles.backButton}>
              Back to Markets
            </Link>
          </div>
        )}

        {/* ── STATE: Not Found ── */}
        {data.status === 'not_found' && (
          <div className={styles.errorState}>
            <AlertCircle
              size={32}
              className={styles.errorIcon}
              aria-hidden="true"
            />
            <h2 className={styles.errorTitle}>Market not found</h2>
            <p className={styles.errorText}>
              This market ID does not exist or is invalid.
            </p>
            <Link href="/markets" className={styles.backButton}>
              Back to Markets
            </Link>
          </div>
        )}

        {/* ── STATE: Pending (not yet resolved) ── */}
        {data.status === 'pending' && (
          <motion.div
            className={styles.pendingState}
            variants={safeVariants(reducedMotion, fadeScale)}
            initial="hidden"
            animate="visible"
            transition={safeTransition(reducedMotion, {
              duration: MOTION_MEDIUM,
              ease: EASE_OUT,
            })}
          >
            <div className={styles.pendingIconWrap}>
              <Clock
                size={28}
                className={styles.pendingIcon}
                aria-hidden="true"
              />
            </div>
            <h2 className={styles.pendingTitle}>
              This market has not settled yet
            </h2>
            <p className={styles.pendingStatus}>
              Current status: {statusLabel(data.currentStatus)}
            </p>
            <p className={styles.pendingText}>
              Check back after it resolves. Settlement receipts are generated
              once a market reaches its final on-chain state.
            </p>
            <Link
              href={`/market/${marketId}`}
              className={styles.pendingLink}
            >
              View live market
              <ExternalLink size={13} aria-hidden="true" />
            </Link>
          </motion.div>
        )}

        {/* ── STATE: Resolved (receipt card) ── */}
        {data.status === 'resolved' && receipt && (
          <motion.div
            className={styles.cardWrapper}
            variants={safeVariants(reducedMotion, fadeScale)}
            initial="hidden"
            animate="visible"
            transition={safeTransition(reducedMotion, {
              duration: MOTION_MEDIUM,
              ease: EASE_OUT,
            })}
          >
            <article
              className={styles.receiptCard}
              aria-label={`Receipt for ${receipt.question}`}
            >
              {/* Card header: question + badges */}
              <div className={styles.cardHeader}>
                <h2 className={styles.cardQuestion}>{receipt.question}</h2>
                <div className={styles.badgeRow}>
                  <span
                    className={`${styles.assetBadge} ${
                      receipt.asset === 'ETH'
                        ? styles.assetBadgeEth
                        : styles.assetBadgeBtc
                    }`}
                  >
                    {receipt.asset}
                  </span>
                  <span
                    className={`${styles.statusBadge} ${statusBadgeClass}`}
                  >
                    {statusBadge}
                  </span>
                </div>
              </div>

              {/* Voided note */}
              {isVoided && receipt.voidedNote && (
                <div className={styles.voidedNote}>{receipt.voidedNote}</div>
              )}

              {/* Winning outcome */}
              {!isVoided && winnerLabel && (
                <div className={styles.winningOutcome}>
                  <span className={styles.winningLabel}>Winning outcome</span>
                  <span
                    className={
                      winnerLabel === 'Yes'
                        ? styles.winnerYes
                        : styles.winnerNo
                    }
                  >
                    {winnerLabel}
                  </span>
                </div>
              )}

              {/* Expiry */}
              <div className={styles.expiryRow}>
                <Clock
                  size={13}
                  className={styles.expiryIcon}
                  aria-hidden="true"
                />
                <span className={styles.expiryText}>
                  Expiry: {formatExpiry(receipt.expiry)}
                </span>
              </div>

              {/* Divider */}
              <div className={styles.divider} aria-hidden="true" />

              {/* On-Chain Proof section */}
              <div className={styles.proofSection}>
                <span className={styles.proofLabel}>On-Chain Proof</span>

                {receipt.explorerTxUrl ? (
                  <a
                    href={receipt.explorerTxUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.proofLink}
                    aria-label="View settlement transaction on block explorer"
                  >
                    <ExternalLink size={13} aria-hidden="true" />
                    <span>View settlement transaction</span>
                  </a>
                ) : (
                  <span className={styles.proofPending}>
                    Settlement link pending
                  </span>
                )}

                {receipt.oracleExplorerUrl ? (
                  <a
                    href={receipt.oracleExplorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.proofLink}
                    aria-label="View oracle data on oracle explorer"
                  >
                    <ExternalLink size={13} aria-hidden="true" />
                    <span>View oracle data</span>
                  </a>
                ) : (
                  <span className={styles.proofPending}>
                    Oracle reference pending
                  </span>
                )}
              </div>

              {/* Divider */}
              <div className={styles.divider} aria-hidden="true" />

              {/* Share actions */}
              <div className={styles.shareSection}>
                <button
                  type="button"
                  className={styles.shareButton}
                  onClick={handleCopyLink}
                  aria-label="Copy receipt link to clipboard"
                >
                  {copied ? (
                    <>
                      <CheckCircle size={13} aria-hidden="true" />
                      Link copied
                    </>
                  ) : (
                    <>
                      <Copy size={13} aria-hidden="true" />
                      Copy Link
                    </>
                  )}
                </button>

                <div aria-live="polite" className="sr-only">
                  {copied ? 'Receipt link copied to clipboard' : ''}
                </div>

                <button
                  type="button"
                  className={styles.jsonToggle}
                  onClick={() => setShowRawJson(!showRawJson)}
                  aria-expanded={showRawJson}
                >
                  {showRawJson ? (
                    <>
                      <ChevronUp size={13} aria-hidden="true" />
                      Hide Raw JSON
                    </>
                  ) : (
                    <>
                      <ChevronDown size={13} aria-hidden="true" />
                      View Raw JSON
                    </>
                  )}
                </button>
              </div>

              {/* Raw JSON block */}
              {showRawJson && (
                <pre className={styles.jsonBlock}>
                  <code>{receiptToJson(receipt)}</code>
                </pre>
              )}

              {/* Divider */}
              <div className={styles.divider} aria-hidden="true" />

              {/* Download My Receipt (wallet-gated) */}
              <div className={styles.downloadSection}>
                <span className={styles.downloadLabel}>Personal Trade Receipt</span>

                {!isConnected && (
                  <p className={styles.downloadGated}>
                    Connect your wallet to download your personal trade receipt.
                  </p>
                )}

                {isConnected && positionLoading && (
                  <div className={styles.downloadLoading}>
                    <Loader2
                      size={14}
                      className={styles.spinner}
                      aria-hidden="true"
                    />
                    <span>Loading your position...</span>
                  </div>
                )}

                {isConnected && positionError === 'no_position' && (
                  <p className={styles.downloadGated}>
                    The connected wallet has no trade history for this market.
                  </p>
                )}

                {isConnected && positionError === 'fetch_failed' && (
                  <p className={styles.downloadGated}>
                    Could not load your position data. Please try again.
                  </p>
                )}

                {isConnected && positionData && !positionError && (
                  <>
                    <button
                      type="button"
                      className={styles.downloadButton}
                      onClick={handleDownload}
                      disabled={downloading}
                      aria-label="Download your personal trade receipt as a PNG image"
                    >
                      {downloading ? (
                        <>
                          <Loader2
                            size={14}
                            className={styles.spinner}
                            aria-hidden="true"
                          />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Download size={14} aria-hidden="true" />
                          Download My Receipt
                        </>
                      )}
                    </button>
                    <p className={styles.downloadHint}>
                      Downloads a shareable image of your trade
                    </p>
                  </>
                )}

                {downloadError && (
                  <p className={styles.downloadError} role="alert">
                    {downloadError}
                  </p>
                )}
              </div>

              {/* Divider */}
              <div className={styles.divider} aria-hidden="true" />

              {/* Footer */}
              <div className={styles.cardFooter}>
                schemaVersion {receipt.schemaVersion} &middot; generated{' '}
                {formatGeneratedAt(receipt.generatedAt)}
              </div>
            </article>
          </motion.div>
        )}

        {/* ── STATE: Loading (initial server data pending) ── */}
        {data.status === 'error' && (
          <div className={styles.loadingState}>
            <div className={styles.skeletonCard}>
              <div
                className={styles.skeletonPulse}
                style={{ width: '80%', height: 18, borderRadius: 4 }}
              />
              <div
                className={styles.skeletonPulse}
                style={{
                  width: '40%',
                  height: 14,
                  borderRadius: 3,
                  marginTop: 12,
                }}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
