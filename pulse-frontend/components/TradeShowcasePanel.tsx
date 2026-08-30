'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, ExternalLink } from 'lucide-react';
import styles from './TradeShowcasePanel.module.css';
import MarketsBody from './MarketsBody';
import PortfolioBody from './PortfolioBody';
import ReceiptBody from './ReceiptBody';
import type { TradePreviewData } from '@/app/api/trade-preview/route';
import type { ActiveTab } from './PulseLanding';
import {
  useReducedMotionSafe,
  safeTransition,
  safeVariants,
  panelSpring,
  fadeSlideUp,
  transitionMedium,
  MOTION_MEDIUM,
  EASE_OUT,
} from '@/lib/motion';

const INITIAL_DATA: TradePreviewData = {
  marketId: '0x0000000000000000000000000000000000000000000000000000000000000001',
  marketAddress: '',
  quoteDecimals: 6,
  title: "Will BTC/USDC's price be at or above 64,250 at 16:30 UTC?",
  contextLine: 'BTC \u00b7 15m window',
  asset: 'BTC',
  windowDuration: '15m',
  yesCents: 58,
  noCents: 42,
  deltaLabel: '+4.2%',
  deltaPositive: true,
  volumeLabel: '12,450.00 test USDC volume',
  yesAskCents: 59,
  noAskCents: 43,
  currentSpot: '64,285.00',
  points: [
    [Date.now() - 3600000, 48],
    [Date.now() - 3000000, 51],
    [Date.now() - 2400000, 49],
    [Date.now() - 1800000, 54],
    [Date.now() - 1200000, 52],
    [Date.now() - 600000, 56],
    [Date.now(), 58],
  ],
  useRealSeries: false,
  timeframePoints: {
    '1H': [
      [Date.now() - 3600000, 48],
      [Date.now() - 3000000, 51],
      [Date.now() - 2400000, 49],
      [Date.now() - 1800000, 54],
      [Date.now() - 1200000, 52],
      [Date.now() - 600000, 56],
      [Date.now(), 58],
    ],
    '1D': [
      [Date.now() - 86400000, 40],
      [Date.now() - 64800000, 45],
      [Date.now() - 43200000, 52],
      [Date.now() - 21600000, 49],
      [Date.now(), 58],
    ],
    All: [
      [Date.now() - 7200000, 44],
      [Date.now() - 5400000, 47],
      [Date.now() - 3600000, 48],
      [Date.now() - 1800000, 54],
      [Date.now(), 58],
    ],
  },
  quote: {
    quantity: 172.41,
    cost: 100,
    toWin: 72.41,
  },
};

const NAV_ITEMS: { key: ActiveTab; label: string }[] = [
  { key: 'trade', label: 'Trade' },
  { key: 'markets', label: 'Markets' },
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'receipt', label: 'Receipt' },
];

type Timeframe = '1H' | '1D' | 'All';

/** Invert a delta label: +2.3% becomes -2.3% and vice versa. */
function invertDeltaLabel(label: string): string {
  if (label.startsWith('+')) return '-' + label.slice(1);
  if (label.startsWith('-')) return '+' + label.slice(1);
  return label;
}

interface TradeShowcasePanelProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
}

export default function TradeShowcasePanel({ activeTab, onTabChange }: TradeShowcasePanelProps) {
  const reducedMotion = useReducedMotionSafe();
  const [data, setData] = useState<TradePreviewData>(INITIAL_DATA);
  const [timeframe, setTimeframe] = useState<Timeframe>('All');
  const [selectedSide, setSelectedSide] = useState<'yes' | 'no'>('yes');
  const [orderType, setOrderType] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState<number>(100);
  const [hoverPoint, setHoverPoint] = useState<{
    x: number;
    y: number;
    price: number;
    timestamp: number;
    svgX: number;
    svgY: number;
  } | null>(null);

  const chartRef = useRef<HTMLDivElement>(null);

  /** Switch to Trade tab with a specific market loaded. */
  const handleTradeMarket = useCallback((marketId: string) => {
    onTabChange('trade');
    fetch(`/api/trade-preview?marketId=${encodeURIComponent(marketId)}`)
      .then((res) => res.json())
      .then((json: TradePreviewData) => {
        if (json && json.yesCents) {
          setData(json);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch market data for trade:', err);
      });
  }, [onTabChange]);

  // Fetch live market data on mount
  useEffect(() => {
    fetch('/api/trade-preview')
      .then((res) => res.json())
      .then((json: TradePreviewData) => {
        if (json && json.yesCents) {
          setData(json);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch trade preview data:', err);
      });
  }, []);

  // Active series based on timeframe
  const activePoints = useMemo(() => {
    if (data.timeframePoints && data.timeframePoints[timeframe]) {
      return data.timeframePoints[timeframe];
    }
    return data.points;
  }, [data, timeframe]);

  // Current active price based on side
  const activePriceCents = selectedSide === 'yes' ? data.yesAskCents : data.noAskCents;

  const calculations = useMemo(() => {
    const safePriceCents = Math.max(1, Math.min(99, activePriceCents));
    const priceDollars = safePriceCents / 100;
    const safeAmount = Math.max(0, amount || 0);

    const quantity = priceDollars > 0 ? safeAmount / priceDollars : 0;
    const payout = quantity * 1.0;
    const toWin = Math.max(0, payout - safeAmount);

    return {
      quantity: Number(quantity.toFixed(2)),
      cost: safeAmount,
      toWin: Number(toWin.toFixed(2)),
    };
  }, [activePriceCents, amount]);

  // Chart SVG bounds and coordinate mapping
  const chartBounds = useMemo(() => {
    if (!activePoints || activePoints.length === 0) {
      return { minP: 0, maxP: 100, minT: 0, maxT: 1, svgPath: '', areaPath: '', width: 800, height: 200 };
    }

    const prices = activePoints.map((p) => p[1]);
    const times = activePoints.map((p) => p[0]);

    const minT = Math.min(...times);
    const maxT = Math.max(...times);

    const rawMinP = Math.min(...prices);
    const rawMaxP = Math.max(...prices);
    const pad = Math.max(8, (rawMaxP - rawMinP) * 0.25);
    const minP = Math.max(0, Math.floor(rawMinP - pad));
    const maxP = Math.min(100, Math.ceil(rawMaxP + pad));

    const width = 800;
    const height = 200;

    const coords = activePoints.map(([t, p]) => {
      const x = maxT > minT ? ((t - minT) / (maxT - minT)) * width : width / 2;
      const y = maxP > minP ? height - ((p - minP) / (maxP - minP)) * height : height / 2;
      return { x, y, t, p };
    });

    if (coords.length === 0) {
      return { minP, maxP, minT, maxT, svgPath: '', areaPath: '', coords: [], width, height };
    }

    let svgPath = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1];
      const curr = coords[i];
      const cpx1 = prev.x + (curr.x - prev.x) / 2;
      const cpy1 = prev.y;
      const cpx2 = prev.x + (curr.x - prev.x) / 2;
      const cpy2 = curr.y;
      svgPath += ` C ${cpx1.toFixed(1)} ${cpy1.toFixed(1)}, ${cpx2.toFixed(1)} ${cpy2.toFixed(1)}, ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
    }

    const lastX = coords[coords.length - 1].x;
    const firstX = coords[0].x;
    const areaPath = `${svgPath} L ${lastX.toFixed(1)} ${height} L ${firstX.toFixed(1)} ${height} Z`;

    return { minP, maxP, minT, maxT, svgPath, areaPath, coords, width, height };
  }, [activePoints]);

  const handleChartMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!chartRef.current || !chartBounds.coords || chartBounds.coords.length === 0) return;

    const rect = chartRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clientX / rect.width));

    const targetT = chartBounds.minT + ratio * (chartBounds.maxT - chartBounds.minT);

    let closest = chartBounds.coords[0];
    let minDiff = Math.abs(closest.t - targetT);

    for (let i = 1; i < chartBounds.coords.length; i++) {
      const diff = Math.abs(chartBounds.coords[i].t - targetT);
      if (diff < minDiff) {
        minDiff = diff;
        closest = chartBounds.coords[i];
      }
    }

    const svgXPercent = (closest.x / chartBounds.width) * 100;
    const svgYPercent = (closest.y / chartBounds.height) * 100;

    setHoverPoint({
      x: (svgXPercent / 100) * rect.width,
      y: (svgYPercent / 100) * rect.height,
      price: closest.p,
      timestamp: closest.t,
      svgX: closest.x,
      svgY: closest.y,
    });
  };

  const handleChartMouseLeave = () => {
    setHoverPoint(null);
  };

  const formatTooltipDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
      hour12: false,
    }) + ' UTC';
  };

  return (
    <section className={styles.section} aria-label="Live Market Showcase" id="trade-preview-panel">
      <motion.div
        className={styles.panel}
        variants={safeVariants(reducedMotion, panelSpring)}
        initial="hidden"
        animate="visible"
      >
        
        {/* -- 1. App Bar Chrome -- */}
        <header className={styles.appBar}>
          <div className={styles.brand}>
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
              </svg>
            </div>
            <span className={styles.brandName}>PULSE</span>
          </div>

          {/* Decorative / informational nav labels -- not interactive controls */}
          <div className={styles.navLabels} aria-hidden="true">
            {NAV_ITEMS.map((item) => (
              <span
                key={item.key}
                className={`${styles.navLabel} ${activeTab === item.key ? styles.navLabelActive : ''}`}
              >
                {item.label}
              </span>
            ))}
          </div>

          <div className={styles.appBarRight}>
            <div className={styles.portfolioChip}>
              <span className={styles.chipLabel}>Portfolio:</span>
              <span>10,000.00 USDC</span>
            </div>
            <a
              href="#"
              className={styles.launchButton}
              aria-label="Launch Pulse trading application"
            >
              <span>Launch</span>
              <ExternalLink size={13} aria-hidden="true" />
            </a>
            <div className={styles.avatarCircle} aria-hidden="true" />
          </div>
        </header>

        {/* -- 2. Honesty Strip -- */}
        {activeTab !== 'receipt' && (
        <div className={styles.honestyStrip} role="note">
          {activeTab === 'portfolio'
            ? 'sample portfolio · illustrative figures · connect a wallet in the full app for live positions'
            : 'live DreamDEX markets / on-chain prices / Shannon testnet / test USDC'}
        </div>
        )}

        {/* -- 3. Panel Body -- */}
        {/* -- 3. Panel Body (AnimatePresence crossfade) -- */}
        <AnimatePresence mode="wait" initial={false}>
        {activeTab === 'trade' && (
        <motion.div
          className={styles.panelBody}
          key="trade"
          variants={safeVariants(reducedMotion, fadeSlideUp)}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={safeTransition(reducedMotion, transitionMedium)}
        >
          
          {/* Left Column: Market info & Interactive Chart */}
          <div className={styles.chartColumn}>
            <p className={styles.marketContextLine}>{data.contextLine}</p>
            <h2 className={styles.marketTitle}>{data.title}</h2>

            <div className={styles.priceHeader}>
              <span key={`hero-${selectedSide}`} className={`${styles.heroPrice} ${styles.heroPriceEnter}`}>
                {hoverPoint ? `${hoverPoint.price}¢` : `${selectedSide === 'yes' ? data.yesCents : data.noCents}¢`}
              </span>
              <span
                className={`${styles.deltaBadge} ${
                  data.deltaPositive ? '' : styles.deltaNegative
                }`}
              >
                {data.deltaPositive ? (
                  <TrendingUp size={13} aria-hidden="true" />
                ) : (
                  <TrendingDown size={13} aria-hidden="true" />
                )}
                <span>{data.deltaLabel}</span>
              </span>
            </div>

            <div className={styles.chartHeader}>
              <span className={styles.chartLabel}>YES Implied Probability</span>
              <div className={styles.timeframeSelector} role="group" aria-label="Chart timeframes">
                {(['1H', '1D', 'All'] as Timeframe[]).map((tf) => (
                  <button
                    key={tf}
                    className={`${styles.tfButton} ${
                      timeframe === tf ? styles.tfButtonActive : ''
                    }`}
                    onClick={() => setTimeframe(tf)}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            <div
              className={styles.chartContainer}
              ref={chartRef}
              onMouseMove={handleChartMouseMove}
              onMouseLeave={handleChartMouseLeave}
              role="img"
              aria-label={`Price chart showing probability history for ${timeframe} timeframe`}
            >
              <svg
                className={styles.chartSvg}
                viewBox={`0 0 ${chartBounds.width} ${chartBounds.height}`}
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="pulseChartGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C1502E" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#C1502E" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                <line
                  x1="0"
                  y1={chartBounds.height * 0.25}
                  x2={chartBounds.width}
                  y2={chartBounds.height * 0.25}
                  stroke="rgba(255,255,255,0.06)"
                  strokeDasharray="4 4"
                />
                <line
                  x1="0"
                  y1={chartBounds.height * 0.5}
                  x2={chartBounds.width}
                  y2={chartBounds.height * 0.5}
                  stroke="rgba(255,255,255,0.06)"
                  strokeDasharray="4 4"
                />
                <line
                  x1="0"
                  y1={chartBounds.height * 0.75}
                  x2={chartBounds.width}
                  y2={chartBounds.height * 0.75}
                  stroke="rgba(255,255,255,0.06)"
                  strokeDasharray="4 4"
                />

                {chartBounds.areaPath && (
                  <path d={chartBounds.areaPath} fill="url(#pulseChartGrad)" />
                )}

                {chartBounds.svgPath && (
                  <path
                    d={chartBounds.svgPath}
                    fill="none"
                    stroke="#C1502E"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {hoverPoint && (
                  <>
                    <line
                      x1={hoverPoint.svgX}
                      y1="0"
                      x2={hoverPoint.svgX}
                      y2={chartBounds.height}
                      className={styles.crosshairLine}
                    />
                    <circle
                      cx={hoverPoint.svgX}
                      cy={hoverPoint.svgY}
                      r="5"
                      className={styles.crosshairDot}
                    />
                  </>
                )}
              </svg>

              {hoverPoint && (
                <div
                  className={styles.tooltip}
                  style={{
                    left: `${hoverPoint.x}px`,
                    transform: 'translateX(-50%)',
                    top: `${Math.max(10, hoverPoint.y - 48)}px`,
                  }}
                >
                  <span className={styles.tooltipPrice}>{hoverPoint.price}¢</span>
                  <span className={styles.tooltipDate}>
                    {formatTooltipDate(hoverPoint.timestamp)}
                  </span>
                </div>
              )}
            </div>

            <p className={styles.chartCaption}>
              {data.useRealSeries
                ? `real recorded prices / ${data.volumeLabel}`
                : `illustrative price path / live price & volume are real (${data.volumeLabel})`}
            </p>
          </div>

          {/* Right Column: Order Ticket */}
          <div className={styles.ticketColumn}>
            
            <div className={styles.sideToggle} role="group" aria-label="Select outcome side">
              <button
                type="button"
                key={`side-yes-${selectedSide === 'yes'}`}
                className={`${styles.sideButton} ${
                  selectedSide === 'yes' ? `${styles.sideButtonYesActive} ${styles.sideButtonGlow}` : ''
                }`}
                onClick={() => setSelectedSide('yes')}
              >
                <span>Yes</span>
                <span>{data.yesAskCents}¢</span>
              </button>
              <button
                type="button"
                key={`side-no-${selectedSide === 'no'}`}
                className={`${styles.sideButton} ${
                  selectedSide === 'no' ? `${styles.sideButtonNoActive} ${styles.sideButtonGlow}` : ''
                }`}
                onClick={() => setSelectedSide('no')}
              >
                <span>No</span>
                <span>{data.noAskCents}¢</span>
              </button>
            </div>

            <div className={styles.orderTypeTabs} role="group" aria-label="Order action">
              <button
                type="button"
                className={`${styles.orderTypeTab} ${
                  orderType === 'buy' ? styles.orderTypeTabActive : ''
                }`}
                onClick={() => setOrderType('buy')}
              >
                Buy
              </button>
              <button
                type="button"
                className={`${styles.orderTypeTab} ${
                  orderType === 'sell' ? styles.orderTypeTabActive : ''
                }`}
                onClick={() => setOrderType('sell')}
              >
                Sell
              </button>
            </div>

            <div className={styles.amountContainer}>
              <label htmlFor="ticket-amount" className={styles.amountLabel}>
                Amount
              </label>
              <div className={styles.inputWrapper}>
                <input
                  id="ticket-amount"
                  type="number"
                  min="1"
                  max="10000"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value) || 0)}
                  className={styles.amountInput}
                  aria-label="Trade amount in test USDC"
                />
                <span className={styles.unitTag}>test USDC</span>
              </div>
            </div>

            <div className={styles.quickChips} role="group" aria-label="Quick amount increments">
              {[1, 5, 20].map((val) => (
                <button
                  key={val}
                  type="button"
                  className={styles.chipButton}
                  onClick={() => setAmount((prev) => prev + val)}
                >
                  +{val}
                </button>
              ))}
              <button
                type="button"
                className={styles.chipButton}
                onClick={() => setAmount(1000)}
              >
                MAX
              </button>
            </div>

            <div key={selectedSide} className={`${styles.breakdown} ${styles.breakdownEnter}`}>
              <div className={styles.breakdownRow}>
                <span className={styles.breakdownLabel}>Quantity</span>
                <span className={styles.breakdownValue}>{calculations.quantity}</span>
              </div>
              <div className={styles.breakdownRow}>
                <span className={styles.breakdownLabel}>Cost</span>
                <span className={styles.breakdownValue}>{calculations.cost.toFixed(2)} test USDC</span>
              </div>
              <div className={styles.breakdownRow}>
                <span className={styles.breakdownLabel}>To win</span>
                <span className={`${styles.breakdownValue} ${styles.breakdownHighlight}`}>
                  +{calculations.toWin.toFixed(2)} test USDC
                </span>
              </div>
            </div>

            <button
              type="button"
              className={`${styles.ticketCta} ${
                selectedSide === 'yes' ? styles.ticketCtaYes : styles.ticketCtaNo
              }`}
            >
              {orderType === 'buy' ? 'Buy' : 'Sell'} {selectedSide === 'yes' ? 'Yes' : 'No'}
            </button>

            <p className={styles.ticketFootnote}>
              quoted from the live order book / winners redeem via on-chain settlement
            </p>
          </div>
        </motion.div>
        )}

        {activeTab === 'markets' && (
          <motion.div
            className={styles.panelBodyMarkets}
            key="markets"
            variants={safeVariants(reducedMotion, fadeSlideUp)}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={safeTransition(reducedMotion, transitionMedium)}
          >
            <MarketsBody onTradeMarket={handleTradeMarket} />
          </motion.div>
        )}

        {activeTab === 'portfolio' && (
          <motion.div
            className={styles.panelBodyMarkets}
            key="portfolio"
            variants={safeVariants(reducedMotion, fadeSlideUp)}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={safeTransition(reducedMotion, transitionMedium)}
          >
            <PortfolioBody />
          </motion.div>
        )}

        {activeTab === 'receipt' && (
          <motion.div
            className={styles.panelBodyMarkets}
            key="receipt"
            variants={safeVariants(reducedMotion, fadeSlideUp)}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={safeTransition(reducedMotion, transitionMedium)}
          >
            <ReceiptBody />
          </motion.div>
        )}
        </AnimatePresence>

        {/* -- 4. Outcome Footer Rows (Trade tab only) -- */}
        {activeTab === 'trade' && (
        <div className={styles.footerRows} aria-label="Market outcome positions">
          
          <div className={styles.outcomeRow}>
            <div className={styles.outcomeInfo}>
              <span className={styles.outcomeTagYes}>Yes</span>
              <span className={styles.outcomePrice}>{data.yesAskCents}¢</span>
              <span
                className={`${styles.outcomeDelta} ${
                  data.deltaPositive ? styles.deltaPositiveText : styles.deltaNegativeText
                }`}
              >
                {data.deltaLabel}
              </span>
            </div>
            <button
              type="button"
              className={styles.outcomeAction}
              onClick={() => setSelectedSide('yes')}
            >
              Buy Yes
            </button>
          </div>

          <div className={styles.outcomeRow}>
            <div className={styles.outcomeInfo}>
              <span className={styles.outcomeTagNo}>No</span>
              <span className={styles.outcomePrice}>{data.noAskCents}¢</span>
              <span
                className={`${styles.outcomeDelta} ${
                  data.deltaPositive ? styles.deltaNegativeText : styles.deltaPositiveText
                }`}
              >
                {invertDeltaLabel(data.deltaLabel)}
              </span>
            </div>
            <button
              type="button"
              className={styles.outcomeAction}
              onClick={() => setSelectedSide('no')}
            >
              Buy No
            </button>
          </div>

        </div>
        )}

      </motion.div>
    </section>
  );
}
