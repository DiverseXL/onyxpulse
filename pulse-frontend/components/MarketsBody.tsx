'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Clock, TrendingUp } from 'lucide-react';
import styles from './MarketsBody.module.css';
import type { MarketPreviewRow } from '@/app/api/markets-preview/route';
import {
  useReducedMotionSafe,
  safeVariants,
  safeTransition,
  fadeSlideUp,
  STAGGER_DELAY,
  MOTION_MEDIUM,
  EASE_OUT,
} from '@/lib/motion';

type FilterAsset = 'All' | 'BTC' | 'ETH';

interface MarketsBodyProps {
  onTradeMarket: (marketId: string) => void;
}

/** Format seconds remaining as "Xm Ys" or "Xs" when under 60s. */
function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return 'Expired';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Compute the expiry timestamp for a market row relative to fetch time. */
function getSecondsRemaining(expiry: number): number {
  const now = Math.floor(Date.now() / 1000);
  return Math.max(0, expiry - now);
}

/** Tiny inline sparkline SVG — no axes, just a trend shape. */
function Sparkline({ points }: { points: [number, number][] }) {
  if (points.length < 3) return null;

  const prices = points.map((p) => p[1]);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;

  const width = 80;
  const height = 24;
  const padding = 2;

  const coords = points.map(([, p], i) => ({
    x: padding + (i / (points.length - 1)) * (width - padding * 2),
    y: padding + (1 - (p - minP) / range) * (height - padding * 2),
  }));

  let d = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const curr = coords[i];
    const cpx = (prev.x + curr.x) / 2;
    d += ` C ${cpx.toFixed(1)} ${prev.y.toFixed(1)}, ${cpx.toFixed(1)} ${curr.y.toFixed(1)}, ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
  }

  // Determine color direction: last point vs first
  const up = prices[prices.length - 1] >= prices[0];
  const color = up ? '#4ade80' : '#f87171';

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={styles.sparkline}
      aria-hidden="true"
    >
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Skeleton row matching the real row layout. */
function SkeletonRow() {
  return (
    <div className={styles.marketRow} aria-hidden="true">
      <div className={styles.assetBadge}>
        <div className={styles.skeletonPulse} style={{ width: 32, height: 20, borderRadius: 4 }} />
      </div>
      <div className={styles.marketInfo}>
        <div className={styles.skeletonPulse} style={{ width: 180, height: 14, borderRadius: 4 }} />
        <div className={styles.skeletonPulse} style={{ width: 100, height: 10, borderRadius: 3, marginTop: 4 }} />
      </div>
      <div className={styles.countdownCol}>
        <div className={styles.skeletonPulse} style={{ width: 60, height: 14, borderRadius: 4 }} />
      </div>
      <div className={styles.priceCol}>
        <div className={styles.skeletonPulse} style={{ width: 36, height: 20, borderRadius: 4 }} />
      </div>
      <div className={styles.volCol}>
        <div className={styles.skeletonPulse} style={{ width: 80, height: 12, borderRadius: 3 }} />
      </div>
      <div className={styles.sparkCol}>
        <div className={styles.skeletonPulse} style={{ width: 80, height: 24, borderRadius: 4 }} />
      </div>
      <div className={styles.tradeCol}>
        <div className={styles.skeletonPulse} style={{ width: 64, height: 30, borderRadius: 6 }} />
      </div>
    </div>
  );
}

export default function MarketsBody({ onTradeMarket }: MarketsBodyProps) {
  const reducedMotion = useReducedMotionSafe();
  const [filter, setFilter] = useState<FilterAsset>('All');
  const [data, setData] = useState<{ live: MarketPreviewRow[]; upcoming: MarketPreviewRow[]; nextWindowStart: number | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  // Fetch market data
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/markets-preview');
      const json = await res.json();
      if (json && Array.isArray(json.live)) {
        setData(json);
      }
    } catch (err) {
      console.error('Failed to fetch markets preview:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Refetch every 20 seconds for live data
    const interval = setInterval(fetchData, 20_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Countdown tick — every second, but only re-render visual, no screen reader spam
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Client-side filter
  const filteredLive = useMemo(() => {
    if (!data) return [];
    if (filter === 'All') return data.live;
    return data.live.filter((m) => m.asset === filter);
  }, [data, filter]);

  const filteredUpcoming = useMemo(() => {
    if (!data) return [];
    if (filter === 'All') return data.upcoming;
    return data.upcoming.filter((m) => m.asset === filter);
  }, [data, filter]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void tick; // trigger re-render for countdown

  const activeFilter = filter;

  // Motion variants (extracted to avoid JSX parser issues with nested objects)
  const listContainerVariants = safeVariants(reducedMotion, {
    hidden: {},
    visible: { transition: { staggerChildren: STAGGER_DELAY } },
  });
  const rowVariants = safeVariants(reducedMotion, {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: safeTransition(reducedMotion, {
        duration: MOTION_MEDIUM,
        ease: EASE_OUT,
      }),
    },
  });

  return (
    <div className={styles.container}>
      {/* ── Filter Header ── */}
      <div className={styles.filterHeader}>
        <span className={styles.filterLabel}>Live Markets</span>
        <div className={styles.filterTabs} role="group" aria-label="Filter markets by asset">
          {(['All', 'BTC', 'ETH'] as FilterAsset[]).map((f) => (
            <button
              key={f}
              type="button"
              className={`${styles.filterTab} ${activeFilter === f ? styles.filterTabActive : ''}`}
              onClick={() => setFilter(f)}
              aria-pressed={activeFilter === f}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* ── Loading State ── */}
      {loading && !data && (
        <div className={styles.listContainer}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      )}

      {/* ── Empty State ── */}
      {!loading && data && filteredLive.length === 0 && filteredUpcoming.length === 0 && (
        <div className={styles.emptyState}>
          {data.nextWindowStart ? (
            <>
              <p className={styles.emptyTitle}>No markets trading right now</p>
              <p className={styles.emptySub}>
                Next window starts in{' '}
                <span className={styles.emptyTime}>
                  {formatTimeRemaining(data.nextWindowStart - Math.floor(Date.now() / 1000))}
                </span>
              </p>
            </>
          ) : (
            <>
              <p className={styles.emptyTitle}>No markets available</p>
              <p className={styles.emptySub}>
                Check back shortly — new 15-minute windows open continuously
              </p>
            </>
          )}
        </div>
      )}

      {/* ── Live Markets List ── */}
      {!loading && filteredLive.length > 0 && (
        <motion.div
          className={styles.listContainer}
          variants={listContainerVariants}
          initial="hidden"
          animate="visible"
        >
          {filteredLive.map((market) => (
            <motion.div
              key={market.id}
              variants={rowVariants}
            >
              <MarketRow
                market={market}
                onTrade={onTradeMarket}
              />
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* ── Upcoming / Starting Soon ── */}
      {!loading && filteredUpcoming.length > 0 && (
        <div className={styles.upcomingSection}>
          <div className={styles.upcomingHeader}>
            <span className={styles.upcomingLabel}>Starting Soon</span>
          </div>
          <div className={styles.listContainer}>
            {filteredUpcoming.map((market) => (
              <MarketRow
                key={market.id}
                market={market}
                onTrade={onTradeMarket}
                upcoming
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Individual market row. */
function MarketRow({
  market,
  onTrade,
  upcoming = false,
}: {
  market: MarketPreviewRow;
  onTrade: (marketId: string) => void;
  upcoming?: boolean;
}) {
  const [secondsLeft, setSecondsLeft] = useState(() => getSecondsRemaining(market.expiry));

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft(getSecondsRemaining(market.expiry));
    }, 1000);
    return () => clearInterval(id);
  }, [market.expiry]);

  const isUrgent = secondsLeft > 0 && secondsLeft < 60;
  const timeLabel = formatTimeRemaining(secondsLeft);

  const assetBadgeClass =
    market.asset === 'ETH' ? styles.assetBadgeEth : styles.assetBadgeBtc;

  return (
    <div
      className={`${styles.marketRow} ${upcoming ? styles.marketRowUpcoming : ''}`}
      role="row"
    >
      {/* Asset Badge */}
      <div className={`${styles.assetBadge} ${assetBadgeClass}`} aria-hidden="true">
        {market.asset}
      </div>

      {/* Market Info */}
      <div className={styles.marketInfo}>
        <span className={styles.marketLabel}>
          {market.durationMin}m window · {market.question}
        </span>
      </div>

      {/* Countdown */}
      <div className={styles.countdownCol}>
        <Clock size={12} className={styles.countdownIcon} aria-hidden="true" />
        <span
          className={`${styles.countdownText} ${isUrgent ? styles.countdownUrgent : ''}`}
          aria-live="off"
          aria-label={`${timeLabel} remaining`}
        >
          {timeLabel}
        </span>
      </div>

      {/* YES Price */}
      <div className={styles.priceCol}>
        <span className={styles.priceText}>{market.yesCents}¢</span>
      </div>

      {/* Volume */}
      <div className={styles.volCol}>
        <span className={styles.volText}>{market.volumeLabel}</span>
      </div>

      {/* Sparkline */}
      <div className={styles.sparkCol}>
        {market.sparklinePoints.length >= 3 && (
          <Sparkline points={market.sparklinePoints} />
        )}
      </div>

      {/* Trade Button */}
      <div className={styles.tradeCol}>
        <button
          type="button"
          className={styles.tradeBtn}
          onClick={() => onTrade(market.marketId)}
          aria-label={`Trade ${market.asset} market`}
        >
          <TrendingUp size={13} aria-hidden="true" />
          <span>Trade</span>
        </button>
      </div>
    </div>
  );
}
