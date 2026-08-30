'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Clock, TrendingUp, CheckCircle, FileText } from 'lucide-react';
import styles from './MarketCard.module.css';
import type { MarketCardData } from '@/app/api/markets/route';
import { useReducedMotionSafe, MOTION_SLOW, MOTION_FAST, EASE_OUT } from '@/lib/motion';

interface MarketCardProps {
  market: MarketCardData;
}

export default function MarketCard({ market }: MarketCardProps) {
  const reducedMotion = useReducedMotionSafe();
  const [timeLeft, setTimeLeft] = useState<number>(0);

  // Live countdown timer for active windows
  useEffect(() => {
    const updateCountdown = () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = Math.max(0, market.expiry - now);
      setTimeLeft(remaining);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [market.expiry]);

  const formatCountdown = (seconds: number) => {
    if (seconds <= 0) return 'Ended';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins >= 60) {
      const hours = Math.floor(mins / 60);
      const remMins = mins % 60;
      return `${hours}h ${remMins}m`;
    }
    if (mins > 0) {
      return `${mins}m ${secs.toString().padStart(2, '0')}s`;
    }
    return `${secs}s`;
  };

  const isUrgent = market.status === 'Trading' && timeLeft > 0 && timeLeft < 60;
  const isSettled = market.status === 'Resolved' || market.status === 'Voided';

  // Status badge styling helper
  const getStatusBadge = () => {
    switch (market.status) {
      case 'Trading':
        return <span className={styles.statusTrading}>Trading</span>;
      case 'Locked':
        return <span className={styles.statusLocked}>Locked</span>;
      case 'Resolved':
        return (
          <span className={styles.statusResolved}>
            {market.resolvedOutcome ? `Resolved: ${market.resolvedOutcome}` : 'Resolved'}
          </span>
        );
      case 'Voided':
        return <span className={styles.statusVoided}>Voided</span>;
      case 'Settlement pending':
        return <span className={styles.statusPending}>Settlement pending</span>;
      case 'Listed':
        return <span className={styles.statusListed}>Upcoming</span>;
      default:
        return <span className={styles.statusDefault}>{market.status}</span>;
    }
  };

  // Sparkline SVG path calculation if 2+ points exist
  const renderSparkline = () => {
    if (!market.sparklinePoints || market.sparklinePoints.length < 2) {
      return null;
    }

    const points = market.sparklinePoints;
    const prices = points.map((p) => p[1]);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;

    const width = 80;
    const height = 24;

    const coords = points.map((p, idx) => {
      const x = (idx / (points.length - 1)) * width;
      const y = height - ((p[1] - min) / range) * (height - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const pathData = `M ${coords.join(' L ')}`;

    return (
      <div className={styles.sparklineContainer} aria-hidden="true">
        <svg viewBox={`0 0 ${width} ${height}`} className={styles.sparklineSvg}>
          <motion.path
            d={pathData}
            fill="none"
            stroke="#4ade80"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reducedMotion ? { pathLength: 1 } : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={
              reducedMotion
                ? { duration: 0 }
                : { duration: MOTION_SLOW, ease: EASE_OUT }
            }
          />
        </svg>
      </div>
    );
  };

  return (
    <Link
      href={`/market/${market.id}`}
      className={styles.card}
      aria-label={`${market.question}, status ${market.status}, YES price ${market.yesCents} cents`}
    >
      {/* Top Header: Context pill + Status Badge */}
      <div className={styles.topRow}>
        <div className={styles.contextPill}>
          <span className={styles.assetTag}>{market.asset}</span>
          <span className={styles.contextDivider}>·</span>
          <span className={styles.durationTag}>{market.durationMin}m</span>
        </div>
        {getStatusBadge()}
      </div>

      {/* Market Question Title */}
      <h2 className={styles.title}>{market.question}</h2>

      {/* Prices Row: YES / NO Boxes */}
      <div className={styles.priceRow}>
        <div
          className={`${styles.priceBox} ${
            market.resolvedOutcome === 'YES' ? styles.priceBoxWinner : ''
          }`}
        >
          <div className={styles.priceBoxHeader}>
            <span className={styles.yesLabel}>YES</span>
            {market.resolvedOutcome === 'YES' && (
              <CheckCircle size={12} className={styles.winnerIcon} aria-hidden="true" />
            )}
          </div>
          <span className={styles.priceValue}>{market.yesCents}¢</span>
        </div>

        <div
          className={`${styles.priceBox} ${
            market.resolvedOutcome === 'NO' ? styles.priceBoxWinner : ''
          }`}
        >
          <div className={styles.priceBoxHeader}>
            <span className={styles.noLabel}>NO</span>
            {market.resolvedOutcome === 'NO' && (
              <CheckCircle size={12} className={styles.winnerIcon} aria-hidden="true" />
            )}
          </div>
          <span className={styles.priceValue}>{market.noCents}¢</span>
        </div>
      </div>

      {/* Footer Meta: Countdown + Sparkline + Volume */}
      <div className={styles.bottomRow}>
        <div className={styles.leftMeta}>
          {market.status === 'Trading' ? (
            <span
              className={`${styles.countdown} ${isUrgent ? styles.countdownUrgent : ''}`}
            >
              <Clock size={12} className={styles.metaIcon} aria-hidden="true" />
              {formatCountdown(timeLeft)}
            </span>
          ) : (
            <span className={styles.staticStatusText}>
              {market.status === 'Listed' ? 'Starts soon' : 'Window ended'}
            </span>
          )}

          {renderSparkline()}
        </div>

        <div className={styles.rightMeta}>
          {isSettled && (
            <Link
              href={`/receipt/${market.id}`}
              className={styles.receiptLink}
              onClick={(e) => e.stopPropagation()}
              aria-label={`View receipt for ${market.question}`}
            >
              <FileText size={12} aria-hidden="true" />
              View Receipt
            </Link>
          )}

          {market.volumeRaw > 0 && (
            <span className={styles.volumeText}>
              <TrendingUp size={11} className={styles.volIcon} aria-hidden="true" />
              {market.volumeLabel}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
