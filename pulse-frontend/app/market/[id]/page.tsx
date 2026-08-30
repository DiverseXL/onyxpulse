'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, TrendingUp, TrendingDown, AlertCircle, RefreshCw, CheckCircle, Loader2 } from 'lucide-react';
import styles from './MarketDetail.module.css';
import AppChromeNav from '@/components/markets/AppChromeNav';
import ChainMismatchBanner from '@/components/markets/ChainMismatchBanner';
import type { TradePreviewData } from '@/app/api/trade-preview/route';
import { usePulseWallet } from '@/lib/wallet/PulseWalletContext';
import { placeClientOrder } from '@/lib/wallet/placeOrder';
import { getWalletClient } from '@wagmi/core';
import { wagmiConfig } from '@/lib/wallet/wagmiConfig';
import { useAccount } from 'wagmi';
import {
  useReducedMotionSafe,
  safeVariants,
  safeTransition,
  fadeSlideUp,
  MOTION_SLOW,
  MOTION_MEDIUM,
  MOTION_FAST,
  EASE_OUT,
} from '@/lib/motion';

type Timeframe = '1H' | '1D' | 'All';

export default function MarketDetailPage() {
  const params = useParams();
  const marketId = params?.id as string;

  const reducedMotion = useReducedMotionSafe();
  const wallet = usePulseWallet();
  const { address: wagmiAddress } = useAccount();

  const [data, setData] = useState<TradePreviewData | null>(null);

  // TanStack Query: poll every 15s for live prices
  const {
    data: queryData,
    isLoading,
    isError,
    isFetching,
  } = useQuery<TradePreviewData>({
    queryKey: ['trade-preview', marketId],
    queryFn: async () => {
      if (!marketId) throw new Error('No market ID');
      const res = await fetch(`/api/trade-preview?marketId=${encodeURIComponent(marketId)}`);
      if (!res.ok) throw new Error('Failed to fetch market data');
      return res.json();
    },
    enabled: !!marketId,
    refetchInterval: 15000,
    placeholderData: (prev) => prev,
  });

  // Sync query data into local state so price calculations stay live
  useEffect(() => {
    if (queryData && queryData.yesCents) {
      setData(queryData);
    }
  }, [queryData]);

  const [timeframe, setTimeframe] = useState<Timeframe>('All');
  const [selectedSide, setSelectedSide] = useState<'yes' | 'no'>('yes');
  const [orderType, setOrderType] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState<number>(100);
  const [orderStatus, setOrderStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [orderResult, setOrderResult] = useState<{ hash: string; orderId: string | null } | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [hoverPoint, setHoverPoint] = useState<{
    x: number;
    y: number;
    price: number;
    timestamp: number;
    svgX: number;
    svgY: number;
  } | null>(null);

  const chartRef = useRef<HTMLDivElement>(null);



  // Active series based on timeframe
  const activePoints = useMemo(() => {
    if (!data) return [];
    if (data.timeframePoints && data.timeframePoints[timeframe]) {
      return data.timeframePoints[timeframe];
    }
    return data.points;
  }, [data, timeframe]);

  // Current active price based on side
  const activePriceCents = data
    ? selectedSide === 'yes'
      ? data.yesAskCents
      : data.noAskCents
    : 50;

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
      return {
        minP: 0,
        maxP: 100,
        minT: 0,
        maxT: 1,
        svgPath: '',
        areaPath: '',
        coords: [],
        width: 800,
        height: 220,
      };
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
    const height = 220;

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
    return (
      d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
        hour12: false,
      }) + ' UTC'
    );
  };

  /* ── Place order handler (client-side via wagmi walletClient) ── */
  const handlePlaceOrder = useCallback(async () => {
    if (!data || orderStatus === 'submitting') return;

    if (wallet.connectionStatus !== 'connected' || !wallet.address) {
      setOrderError('Please connect your wallet first.');
      setOrderStatus('error');
      setTimeout(() => { setOrderStatus('idle'); setOrderError(null); }, 3000);
      return;
    }

    setOrderStatus('submitting');
    setOrderError(null);
    setOrderResult(null);

    const side = orderType === 'buy'
      ? (selectedSide === 'yes' ? 'BUY_YES' : 'BUY_NO')
      : (selectedSide === 'yes' ? 'SELL_YES' : 'SELL_NO');

    const priceCents = selectedSide === 'yes' ? data.yesAskCents : data.noAskCents;

    try {
      const walletClient = await getWalletClient(wagmiConfig);
      if (!walletClient || !walletClient.account) {
        throw new Error('Wallet client not available. Please reconnect.');
      }

      const result = await placeClientOrder(walletClient, walletClient.account, {
        poolAddress: data.marketAddress,
        side,
        priceCents,
        amount,
        decimals: data.quoteDecimals,
      });

      setOrderResult({ hash: result.hash, orderId: null });
      setOrderStatus('success');
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : 'Unknown error';
      // Detect chain mismatch and show a clearer message
      const message = raw.includes('does not match the target chain')
        ? 'Wrong network -- switch MetaMask to Somnia Testnet (chain 50312) and try again.'
        : raw;
      setOrderError(message);
      setOrderStatus('error');
    } finally {
      setTimeout(() => {
        setOrderStatus('idle');
        setOrderResult(null);
        setOrderError(null);
      }, 5000);
    }
  }, [data, orderType, selectedSide, amount, orderStatus, wallet, wagmiAddress]);

  /* ── Loading state ── */
  if (isLoading && !data) {
    return (
      <div className={styles.page}>
        <AppChromeNav />
        <main className={styles.main}>
          {/* Back link skeleton */}
          <div style={{ width: '80px', height: '14px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)' }} className="md-shimmer" />
          <div className={styles.panel}>
            <div className={styles.honestyStrip} />
            <div className={styles.panelBody}>
              {/* Chart column skeleton */}
              <div className={styles.chartColumn}>
                <div style={{ width: '120px', height: '10px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)' }} className="md-shimmer" />
                <div style={{ width: '85%', height: '18px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', marginTop: '8px' }} className="md-shimmer" />
                <div style={{ width: '60%', height: '18px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', marginTop: '4px' }} className="md-shimmer" />
                <div style={{ display: 'flex', gap: '12px', marginTop: '24px', marginBottom: '24px' }}>
                  <div style={{ width: '100px', height: '36px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)' }} className="md-shimmer" />
                  <div style={{ width: '60px', height: '24px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)' }} className="md-shimmer" />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ width: '160px', height: '10px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)' }} className="md-shimmer" />
                  <div style={{ width: '90px', height: '24px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)' }} className="md-shimmer" />
                </div>
                <div style={{ width: '100%', height: '220px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)' }} className="md-shimmer" />
                <div style={{ width: '200px', height: '10px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', marginTop: '12px' }} className="md-shimmer" />
              </div>
              {/* Ticket column skeleton */}
              <div className={styles.ticketColumn}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                  <div style={{ height: '44px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)' }} className="md-shimmer" />
                  <div style={{ height: '44px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)' }} className="md-shimmer" />
                </div>
                <div style={{ height: '32px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', marginBottom: '16px' }} className="md-shimmer" />
                <div style={{ height: '44px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', marginBottom: '12px' }} className="md-shimmer" />
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} style={{ flex: 1, height: '28px', borderRadius: '5px', background: 'rgba(255,255,255,0.05)' }} className="md-shimmer" />
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px', padding: 'var(--space-3)', background: 'rgba(0,0,0,0.25)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                  {[1, 2, 3].map((i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div style={{ width: `${60 + i * 5}px`, height: '12px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)' }} className="md-shimmer" />
                      <div style={{ width: `${70 + i * 8}px`, height: '12px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)' }} className="md-shimmer" />
                    </div>
                  ))}
                </div>
                <div style={{ height: '48px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', marginBottom: '12px' }} className="md-shimmer" />
                <div style={{ width: '80%', height: '10px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', margin: '0 auto' }} className="md-shimmer" />
              </div>
            </div>
            {/* Outcome footer rows skeleton */}
            <div className={styles.footerRows}>
              {[1, 2].map((i) => (
                <div key={i} className={styles.outcomeRow}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '36px', height: '20px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)' }} className="md-shimmer" />
                    <div style={{ width: '48px', height: '16px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)' }} className="md-shimmer" />
                    <div style={{ width: '40px', height: '12px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)' }} className="md-shimmer" />
                  </div>
                  <div style={{ width: '72px', height: '30px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)' }} className="md-shimmer" />
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  /* ── Error state ── */
  if (isError && !data) {
    return (
      <div className={styles.page}>
        <AppChromeNav />
        <main className={styles.main}>
          <motion.div
            className={styles.errorState}
            variants={safeVariants(reducedMotion, fadeSlideUp)}
            initial="hidden"
            animate="visible"
            transition={safeTransition(reducedMotion, { duration: MOTION_MEDIUM, ease: EASE_OUT })}
            role="alert"
          >
            <AlertCircle size={32} className={styles.errorIcon} aria-hidden="true" />
            <h2 className={styles.errorTitle}>Market not found</h2>
            <p className={styles.errorText}>
              Could not load data for this market. It may have expired or the ID is invalid.
            </p>
            <div className={styles.errorActions}>
              <button type="button" className={styles.retryButton} onClick={() => window.location.reload()}>
                <RefreshCw size={14} aria-hidden="true" />
                Retry
              </button>
              <Link href="/markets" className={styles.backLink}>
                Back to Markets
              </Link>
            </div>
          </motion.div>
        </main>
      </div>
    );
  }

  /* ── Main content ── */
  if (!data) return null;

  return (
    <div className={styles.page}>
      <AppChromeNav />

      <main className={styles.main}>
        {/* Back link */}
        <motion.div
          variants={safeVariants(reducedMotion, fadeSlideUp)}
          initial="hidden"
          animate="visible"
          transition={safeTransition(reducedMotion, { duration: MOTION_FAST, ease: EASE_OUT })}
        >
          <Link href="/markets" className={styles.backLink}>
            <ArrowLeft size={14} aria-hidden="true" />
            Markets
          </Link>
        </motion.div>

        {/* Chain mismatch warning */}
        <ChainMismatchBanner />

        {/* Glass Panel */}
        <motion.div
          className={styles.panel}
          variants={safeVariants(reducedMotion, fadeSlideUp)}
          initial="hidden"
          animate="visible"
          transition={safeTransition(reducedMotion, { duration: MOTION_SLOW, ease: EASE_OUT })}
        >
          {/* Honesty strip */}
          <div className={styles.honestyStrip} role="note">
            live DreamDEX markets / on-chain prices / Shannon testnet / test USDC
          </div>

          {/* Panel body: chart + ticket */}
          <div className={styles.panelBody}>
            {/* Left Column: Market info & Interactive Chart */}
            <div className={styles.chartColumn}>
              <p className={styles.marketContextLine}>{data.contextLine}</p>
              <h2 className={styles.marketTitle}>{data.title}</h2>

              <div className={styles.priceHeader}>
                <span key={`hero-${selectedSide}`} className={`${styles.heroPrice} ${styles.heroPriceEnter}`}>
                  {hoverPoint
                    ? `${hoverPoint.price}¢`
                    : `${selectedSide === 'yes' ? data.yesCents : data.noCents}¢`}
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
                {isFetching && !isLoading && (
                  <span className={styles.liveIndicator}>
                    <span className={styles.pulseDot} />
                    Updating
                  </span>
                )}
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
                    <linearGradient id="marketDetailGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#C1502E" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#C1502E" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  <line x1="0" y1={chartBounds.height * 0.25} x2={chartBounds.width} y2={chartBounds.height * 0.25} stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />
                  <line x1="0" y1={chartBounds.height * 0.5} x2={chartBounds.width} y2={chartBounds.height * 0.5} stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />
                  <line x1="0" y1={chartBounds.height * 0.75} x2={chartBounds.width} y2={chartBounds.height * 0.75} stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />

                  {chartBounds.areaPath && (
                    <path d={chartBounds.areaPath} fill="url(#marketDetailGrad)" />
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
                  className={`${styles.sideButton} ${
                    selectedSide === 'yes'
                      ? `${styles.sideButtonYesActive} ${styles.sideButtonGlow}`
                      : ''
                  }`}
                  onClick={() => setSelectedSide('yes')}
                >
                  <span>Yes</span>
                  <span>{data.yesAskCents}¢</span>
                </button>
                <button
                  type="button"
                  className={`${styles.sideButton} ${
                    selectedSide === 'no'
                      ? `${styles.sideButtonNoActive} ${styles.sideButtonGlow}`
                      : ''
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
                <label htmlFor="detail-amount" className={styles.amountLabel}>
                  Amount
                </label>
                <div className={styles.inputWrapper}>
                  <input
                    id="detail-amount"
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
                  <span className={styles.breakdownValue}>
                    {calculations.cost.toFixed(2)} test USDC
                  </span>
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
                } ${orderStatus === 'submitting' ? styles.ticketCtaDisabled : ''}`}
                onClick={wallet.connectionStatus !== 'connected' ? wallet.connect : handlePlaceOrder}
                disabled={orderStatus === 'submitting'}
              >
                {wallet.connectionStatus !== 'connected' ? (
                  <span>Connect Wallet</span>
                ) : orderStatus === 'submitting' ? (
                  <span className={styles.ctaLoading}>
                    <Loader2 size={16} className={styles.spinnerIcon} aria-hidden="true" />
                    Placing order...
                  </span>
                ) : orderStatus === 'success' ? (
                  <span className={styles.ctaSuccess}>
                    <CheckCircle size={16} aria-hidden="true" />
                    Order placed
                  </span>
                ) : orderStatus === 'error' ? (
                  <span className={styles.ctaError}>
                    Failed - Retry
                  </span>
                ) : (
                  <>{orderType === 'buy' ? 'Buy' : 'Sell'} {selectedSide === 'yes' ? 'Yes' : 'No'}</>
                )}
              </button>

              {orderStatus === 'error' && orderError && (
                <p className={styles.orderErrorText}>{orderError}</p>
              )}

              {orderStatus === 'success' && orderResult && (
                <p className={styles.orderSuccessText}>
                  {orderResult.orderId
                    ? `Order #${orderResult.orderId} confirmed on-chain`
                    : `Transaction submitted`}
                </p>
              )}

              <p className={styles.ticketFootnote}>
                quoted from the live order book / winners redeem via on-chain settlement
              </p>
            </div>
          </div>

          {/* Outcome Footer Rows */}
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
                  {data.deltaPositive
                    ? data.deltaLabel.startsWith('+')
                      ? `-${data.deltaLabel.slice(1)}`
                      : `+${data.deltaLabel}`
                    : data.deltaLabel}
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
        </motion.div>
      </main>
    </div>
  );
}
