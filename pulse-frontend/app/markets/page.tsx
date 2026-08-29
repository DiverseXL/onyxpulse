'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronDown, RefreshCw, AlertCircle } from 'lucide-react';
import styles from './Markets.module.css';
import AppChromeNav from '@/components/markets/AppChromeNav';
import MarketCard from '@/components/markets/MarketCard';
import MarketSkeleton from '@/components/markets/MarketSkeleton';
import AnimatedCounter from '@/components/markets/AnimatedCounter';
import type { MarketsApiResponse, MarketCardData } from '@/app/api/markets/route';
import {
  useReducedMotionSafe,
  safeVariants,
  safeTransition,
  fadeSlideUp,
  STAGGER_DELAY,
  MOTION_SLOW,
  MOTION_MEDIUM,
  EASE_OUT,
} from '@/lib/motion';

type SegmentTab = 'live' | 'settled' | 'archive';
type CategoryChip = 'All' | 'BTC' | 'ETH' | '15m' | '1h' | 'Ending soon';
type SortOption = 'ending-soon' | 'most-active' | 'newest';

export default function MarketsPage() {
  const reducedMotion = useReducedMotionSafe();
  const [activeSegment, setActiveSegment] = useState<SegmentTab>('live');
  const [activeCategory, setActiveCategory] = useState<CategoryChip>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('ending-soon');

  // Sliding pill measurement for segmented control
  const tabRefs = useRef<{ [key in SegmentTab]?: HTMLButtonElement | null }>({});
  const [pillStyle, setPillStyle] = useState<{ left: number; width: number; opacity: number }>({
    left: 0,
    width: 0,
    opacity: 0,
  });

  useEffect(() => {
    const currentTab = tabRefs.current[activeSegment];
    if (currentTab) {
      setPillStyle({
        left: currentTab.offsetLeft,
        width: currentTab.offsetWidth,
        opacity: 1,
      });
    }
  }, [activeSegment]);

  // TanStack Query with 15s poll interval
  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery<MarketsApiResponse>({
    queryKey: ['markets-lobby'],
    queryFn: async () => {
      const res = await fetch('/api/markets');
      if (!res.ok) {
        throw new Error('Failed to fetch markets data');
      }
      return res.json();
    },
    refetchInterval: 15000,
    placeholderData: (prev) => prev,
  });

  // Filter & sort logic
  const displayedMarkets = useMemo(() => {
    if (!data) return [];

    let list: MarketCardData[] = [];
    if (activeSegment === 'live') list = data.live || [];
    else if (activeSegment === 'settled') list = data.settled || [];
    else if (activeSegment === 'archive') list = data.archive || [];

    // Search query filter (asset, duration, question, or ID fragment)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (m) =>
          m.asset.toLowerCase().includes(q) ||
          m.question.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q) ||
          `${m.durationMin}m`.includes(q),
      );
    }

    // Category chips filter
    if (activeCategory === 'BTC') {
      list = list.filter((m) => m.asset.toUpperCase() === 'BTC');
    } else if (activeCategory === 'ETH') {
      list = list.filter((m) => m.asset.toUpperCase() === 'ETH');
    } else if (activeCategory === '15m') {
      list = list.filter((m) => m.durationMin === 15);
    } else if (activeCategory === '1h') {
      list = list.filter((m) => m.durationMin === 60);
    } else if (activeCategory === 'Ending soon') {
      const now = Math.floor(Date.now() / 1000);
      list = list.filter((m) => m.expiry - now > 0 && m.expiry - now < 300);
    }

    // Sort order
    return [...list].sort((a, b) => {
      if (sortBy === 'ending-soon') {
        return a.expiry - b.expiry;
      }
      if (sortBy === 'most-active') {
        return b.volumeRaw - a.volumeRaw;
      }
      if (sortBy === 'newest') {
        return b.tradingStart - a.tradingStart;
      }
      return 0;
    });
  }, [data, activeSegment, searchQuery, activeCategory, sortBy]);

  // Empty state message per segment tab
  const getEmptyMessage = () => {
    if (searchQuery) {
      return `No markets matching "${searchQuery}". Try a different keyword or filter.`;
    }
    if (activeSegment === 'live') {
      return 'No live windows right now — DreamDEX Event Contracts resolve on rolling 15-minute and 1-hour windows. Check back shortly.';
    }
    if (activeSegment === 'settled') {
      return 'No markets have settled recently.';
    }
    return 'No archived windows found.';
  };

  return (
    <div className={styles.page}>
      <AppChromeNav />

      <main className={styles.main}>
        {/* ── 1. Page Header ───────────────────────── */}
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
          <h1 className={styles.h1}>Event Contract Markets</h1>
          <p className={styles.subcopy}>
            Live DreamDEX markets on Somnia Shannon. Settlement via on-chain oracle — never an admin decision. Test USDC.
          </p>
        </motion.div>

        {/* ── 2. Stats Strip ───────────────────────── */}
        <div className={styles.statsStrip}>
          <div className={styles.statsLeft}>
            <div className={styles.statItem}>
              <span className={styles.statLabel}>Live Windows</span>
              <AnimatedCounter
                value={data?.stats.liveCount ?? 0}
                className={styles.statValue}
              />
            </div>

            <div className={styles.statDivider} />

            <div className={styles.statItem}>
              <span className={styles.statLabel}>Settled</span>
              <AnimatedCounter
                value={data?.stats.settledCount ?? 0}
                className={styles.statValue}
              />
            </div>

            {isFetching && !isLoading && (
              <span className={styles.liveIndicator}>
                <span className={styles.pulseDot} />
                Updating
              </span>
            )}
          </div>

          <div className={styles.statsRight}>
            <span className={styles.testnetNote}>
              live from Shannon testnet · test USDC
            </span>
          </div>
        </div>

        {/* ── 3. Toolbar (Search, Segmented Control, Sort) ── */}
        <div className={styles.toolbar}>
          {/* Search Bar */}
          <div className={styles.searchWrapper}>
            <Search size={15} className={styles.searchIcon} aria-hidden="true" />
            <input
              type="text"
              placeholder="Search markets (BTC, ETH, 15m, 0x...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
              aria-label="Search markets by asset or question"
            />
            {searchQuery && (
              <button
                type="button"
                className={styles.clearSearch}
                onClick={() => setSearchQuery('')}
                aria-label="Clear search query"
              >
                ×
              </button>
            )}
          </div>

          {/* Segmented Control with Sliding Glass Pill */}
          <div
            className={styles.segmentedControl}
            role="tablist"
            aria-label="Market view segments"
          >
            <motion.div
              className={styles.slidingPill}
              initial={false}
              animate={{
                left: pillStyle.left,
                width: pillStyle.width,
                opacity: pillStyle.opacity,
              }}
              transition={
                reducedMotion
                  ? { duration: 0 }
                  : { duration: MOTION_MEDIUM, ease: EASE_OUT }
              }
            />

            <button
              ref={(el) => { tabRefs.current.live = el; }}
              type="button"
              role="tab"
              aria-selected={activeSegment === 'live'}
              className={`${styles.segmentTab} ${activeSegment === 'live' ? styles.segmentTabActive : ''}`}
              onClick={() => setActiveSegment('live')}
            >
              Markets
            </button>

            <button
              ref={(el) => { tabRefs.current.settled = el; }}
              type="button"
              role="tab"
              aria-selected={activeSegment === 'settled'}
              className={`${styles.segmentTab} ${activeSegment === 'settled' ? styles.segmentTabActive : ''}`}
              onClick={() => setActiveSegment('settled')}
            >
              Settled
            </button>

            <button
              ref={(el) => { tabRefs.current.archive = el; }}
              type="button"
              role="tab"
              aria-selected={activeSegment === 'archive'}
              className={`${styles.segmentTab} ${activeSegment === 'archive' ? styles.segmentTabActive : ''}`}
              onClick={() => setActiveSegment('archive')}
            >
              Archive
            </button>
          </div>

          {/* Sort Dropdown */}
          <div className={styles.sortWrapper}>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className={styles.sortSelect}
              aria-label="Sort markets by"
            >
              <option value="ending-soon">Ending soon</option>
              <option value="most-active">Most active</option>
              <option value="newest">Newest</option>
            </select>
            <ChevronDown size={14} className={styles.sortChevron} aria-hidden="true" />
          </div>
        </div>

        {/* ── 4. Category Chips ────────────────────── */}
        <div className={styles.categoryChips} role="group" aria-label="Category filters">
          {(['All', 'BTC', 'ETH', '15m', '1h', 'Ending soon'] as CategoryChip[]).map(
            (chip) => (
              <button
                key={chip}
                type="button"
                className={`${styles.chip} ${activeCategory === chip ? styles.chipActive : ''}`}
                onClick={() => setActiveCategory(chip)}
                aria-pressed={activeCategory === chip}
              >
                {chip}
              </button>
            ),
          )}
        </div>

        {/* ── 5. Markets Grid & State Handling ─────── */}
        <div className={styles.gridContainer}>
          {isLoading ? (
            <MarketSkeleton />
          ) : isError ? (
            <div className={styles.errorState} role="alert">
              <AlertCircle size={28} className={styles.errorIcon} aria-hidden="true" />
              <h3 className={styles.errorTitle}>Failed to load markets</h3>
              <p className={styles.errorText}>
                Could not connect to Somnia Shannon testnet. Please check your connection and try again.
              </p>
              <button
                type="button"
                className={styles.retryButton}
                onClick={() => refetch()}
              >
                <RefreshCw size={14} aria-hidden="true" />
                Retry
              </button>
            </div>
          ) : displayedMarkets.length === 0 ? (
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
              <p className={styles.emptyText}>{getEmptyMessage()}</p>
            </motion.div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={`${activeSegment}-${activeCategory}-${sortBy}-${searchQuery}`}
                className={styles.grid}
                variants={safeVariants(reducedMotion, {
                  hidden: {},
                  visible: {
                    transition: {
                      staggerChildren: STAGGER_DELAY,
                    },
                  },
                })}
                initial="hidden"
                animate="visible"
              >
                {displayedMarkets.map((market) => (
                  <motion.div
                    key={market.id}
                    variants={safeVariants(reducedMotion, {
                      hidden: { opacity: 0, y: 12 },
                      visible: {
                        opacity: 1,
                        y: 0,
                        transition: safeTransition(reducedMotion, {
                          duration: MOTION_MEDIUM,
                          ease: EASE_OUT,
                        }),
                      },
                    })}
                  >
                    <MarketCard market={market} />
                  </motion.div>
                ))}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </main>
    </div>
  );
}
