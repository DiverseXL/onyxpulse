'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, ShieldCheck, Clock } from 'lucide-react';
import styles from './ReceiptBody.module.css';
import type { PulseReceipt } from '@/lib/engine';
import {
  useReducedMotionSafe,
  safeVariants,
  safeTransition,
  fadeScale,
  MOTION_MEDIUM,
  EASE_OUT,
} from '@/lib/motion';

type ReceiptPreviewData = {
  receipt: PulseReceipt | null;
};

/**
 * Format a unix timestamp (seconds) as a human-readable string.
 */
function formatExpiry(unixSeconds: string): string {
  const ms = Number(unixSeconds) * 1000;
  const d = new Date(ms);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    hour12: false,
  }) + ' UTC';
}

/**
 * Format an ISO-8601 timestamp for the footer line.
 */
function formatGeneratedAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    hour12: false,
  }) + ' UTC';
}

/**
 * Static sample receipt for the empty state — clearly labeled as SAMPLE.
 * Uses fictitious but realistic-looking data.
 */
const SAMPLE_RECEIPT: PulseReceipt = {
  schemaVersion: '1.0',
  marketId: '0x0000000000000000000000000000000000000000000000000000000000000042',
  question: 'Will BTC/USDC close above $64,000 at 16:30 UTC?',
  asset: 'BTC',
  strike: '$64,000',
  expiry: String(Math.floor(Date.now() / 1000) - 900),
  status: 'Resolved',
  winningOutcome: 0,
  voided: false,
  voidedNote: null,
  resolutionEvents: [
    {
      kind: 'Resolved',
      winningOutcome: 0,
      blockNumber: '14829031',
      timestamp: String(Math.floor(Date.now() / 1000) - 900),
      txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      voided: false,
    },
  ],
  explorerTxUrl: 'https://shannon-explorer.somnia.network/tx/0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  oracleExplorerUrl: 'https://prd.oracle.somnia.host/explore/0xsampleoraclequestionid',
  generatedAt: new Date().toISOString(),
};

/**
 * A single receipt card — shared between live and sample rendering.
 */
function ReceiptCard({
  receipt,
  isSample = false,
}: {
  receipt: PulseReceipt;
  isSample?: boolean;
}) {
  const isResolved = receipt.status === 'Resolved' || receipt.status === 'Finalized';
  const isVoided = receipt.voided;

  const statusLabel = isVoided ? 'Voided' : 'Resolved';
  const statusClass = isVoided ? styles.statusVoided : styles.statusResolved;

  const winnerLabel = useMemo(() => {
    if (isVoided || receipt.winningOutcome === null) return null;
    return receipt.winningOutcome === 0 ? 'Yes' : 'No';
  }, [isVoided, receipt.winningOutcome]);

  return (
    <div
      className={`${styles.receiptCard} ${isSample ? styles.receiptCardSample : ''}`}
      role="article"
      aria-label={isSample ? 'Sample receipt layout' : `Receipt for ${receipt.question}`}
    >
      {isSample && (
        <div className={styles.sampleBadge} aria-label="Sample receipt - not live data">
          SAMPLE
        </div>
      )}

      {/* Header: question + badges */}
      <div className={styles.cardHeader}>
        <h3 className={styles.cardQuestion}>{receipt.question}</h3>
        <div className={styles.badgeRow}>
          <span className={`${styles.assetBadge} ${receipt.asset === 'ETH' ? styles.assetBadgeEth : styles.assetBadgeBtc}`}>
            {receipt.asset}
          </span>
          <span className={`${styles.statusBadge} ${statusClass}`}>
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Voided note — displayed verbatim when voided */}
      {isVoided && receipt.voidedNote && (
        <div className={styles.voidedNote}>
          {receipt.voidedNote}
        </div>
      )}

      {/* Winning outcome — only for resolved, not voided */}
      {!isVoided && winnerLabel && (
        <div className={styles.winningOutcome}>
          <span className={styles.winningLabel}>Winning outcome</span>
          <span className={winnerLabel === 'Yes' ? styles.winnerYes : styles.winnerNo}>
            {winnerLabel}
          </span>
        </div>
      )}

      {/* Expiry */}
      <div className={styles.expiryRow}>
        <Clock size={13} className={styles.expiryIcon} aria-hidden="true" />
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
          <span className={styles.proofPending}>Settlement link pending</span>
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
          <span className={styles.proofPending}>Oracle reference pending</span>
        )}
      </div>

      {/* Footer line */}
      <div className={styles.cardFooter}>
        schemaVersion {receipt.schemaVersion} &middot; generated {formatGeneratedAt(receipt.generatedAt)}
      </div>
    </div>
  );
}

export default function ReceiptBody() {
  const reducedMotion = useReducedMotionSafe();
  const [receipt, setReceipt] = useState<PulseReceipt | null>(null);
  const [loading, setLoading] = useState(true);

  // One-time fetch on mount — no polling for the landing preview.
  useEffect(() => {
    let cancelled = false;

    async function fetchReceipt() {
      try {
        const res = await fetch('/api/receipt-preview');
        const json: ReceiptPreviewData = await res.json();
        if (!cancelled && json && json.receipt) {
          setReceipt(json.receipt);
        }
      } catch (err) {
        console.error('Failed to fetch receipt preview:', err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchReceipt();
    return () => { cancelled = true; };
  }, []);

  const hasRealReceipt = !loading && receipt !== null;

  return (
    <div className={styles.container}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerLabel}>
          <ShieldCheck size={14} className={styles.headerIcon} aria-hidden="true" />
          <span className={styles.headerTitle}>Verified Settlement</span>
        </div>
        <p className={styles.headerSub}>
          Every market settlement is independently verifiable on-chain &mdash; no admin, no trust required.
        </p>
      </div>

      {/* ── Honesty Strip — only when showing live data ── */}
      {hasRealReceipt && (
        <div className={styles.honestyStrip} role="note">
          live DreamDEX resolution data &middot; Shannon testnet &middot; verifiable via block explorer
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className={styles.loadingState}>
          <div className={styles.skeletonCard}>
            <div className={styles.skeletonPulse} style={{ width: '80%', height: 18, borderRadius: 4 }} />
            <div className={styles.skeletonPulse} style={{ width: '40%', height: 14, borderRadius: 3, marginTop: 12 }} />
            <div className={styles.skeletonPulse} style={{ width: '60%', height: 14, borderRadius: 3, marginTop: 8 }} />
            <div className={styles.skeletonPulse} style={{ width: '100%', height: 1, borderRadius: 0, marginTop: 16 }} />
            <div className={styles.skeletonPulse} style={{ width: '50%', height: 12, borderRadius: 3, marginTop: 12 }} />
          </div>
        </div>
      )}

      {/* ── Real receipt (fade+scale entrance) ── */}
      {!loading && hasRealReceipt && (
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
          <ReceiptCard receipt={receipt} />
        </motion.div>
      )}

      {/* ── Empty state with sample (fade+scale entrance) ── */}
      {!loading && !hasRealReceipt && (
        <motion.div
          className={styles.emptyState}
          variants={safeVariants(reducedMotion, fadeScale)}
          initial="hidden"
          animate="visible"
          transition={safeTransition(reducedMotion, {
            duration: MOTION_MEDIUM,
            ease: EASE_OUT,
          })}
        >
          <p className={styles.emptyMessage}>
            No markets have finalized in the last few minutes &mdash; DreamDEX Event Contracts resolve on rolling 15-minute and 1-hour windows. Check back shortly, or view a live market in the Trade tab.
          </p>
          <div className={styles.sampleSection}>
            <span className={styles.sampleLabel}>Example receipt layout</span>
            <ReceiptCard receipt={SAMPLE_RECEIPT} isSample />
          </div>
        </motion.div>
      )}
    </div>
  );
}
