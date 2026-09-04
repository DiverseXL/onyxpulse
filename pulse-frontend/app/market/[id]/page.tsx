'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, TrendingUp, TrendingDown, AlertCircle, RefreshCw, CheckCircle, Loader2, FileText, Lock, Sparkles } from 'lucide-react';
import styles from './MarketDetail.module.css';
import AppChromeNav from '@/components/markets/AppChromeNav';
import ChainMismatchBanner from '@/components/markets/ChainMismatchBanner';
import TradeTicketErrorBoundary from '@/components/markets/TradeTicketErrorBoundary';
import type { TradePreviewData } from '@/app/api/trade-preview/route';
import { usePulseWallet } from '@/lib/wallet/PulseWalletContext';
import { placeClientOrder } from '@/lib/wallet/placeOrder';
import { PulseEngineError, PulseErrorCode } from '@/lib/engine/errors';
import { validateAmount } from '@/lib/validateAmount';
import { parsePrefillParams } from '@/lib/prefill';
import { loadSettings } from '@/lib/settings';
import { placeClientLimitOrder } from '@/lib/wallet/placeOrder';
import { createPulseClient } from '@/lib/engine/client';
import { getOnChainMarketStatus } from '@/lib/engine/statusGate';
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

/* ── Trade Prefill Reader (draft_trade_link support) ── */
// Reads prefillSide/prefillAmount from the URL once on mount and hands them to
// the page. The page pre-fills the ticket but NEVER auto-submits — the user
// must review and confirm. Wrapped in Suspense so useSearchParams is safe.
function TradePrefillReader({
  onPrefill,
}: {
  onPrefill: (side: 'yes' | 'no', amount: number | null) => void;
}) {
  const searchParams = useSearchParams();

  useEffect(() => {
    const values = parsePrefillParams(searchParams);
    if (values) onPrefill(values.side, values.amount);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply exactly once on mount
  }, []);

  return null;
}

/* ── Resolved Receipt Link (small, context-matched) ── */

function ResolvedReceiptLink({ marketId }: { marketId: string }) {
  const { data: receiptStatus } = useQuery<{
    status: string;
    receipt: unknown;
  }>({
    queryKey: ['receipt-status', marketId],
    queryFn: async () => {
      const res = await fetch(`/api/receipt/${encodeURIComponent(marketId)}`);
      if (!res.ok) return { status: 'not_found', receipt: null };
      return res.json();
    },
    enabled: !!marketId,
    staleTime: 60000,
  });

  if (!receiptStatus || receiptStatus.status !== 'resolved') return null;

  return (
    <Link
      href={`/receipt/${marketId}`}
      className={styles.receiptBanner}
    >
      <FileText size={14} aria-hidden="true" />
      <span>View Settlement Receipt</span>
    </Link>
  );
}

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
  const [orderStatus, setOrderStatus] = useState<'idle' | 'submitting' | 'success' | 'error' | 'rejected'>('idle');
  const [orderResult, setOrderResult] = useState<{ hash: string; explorerUrl: string } | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [showLimitFallback, setShowLimitFallback] = useState(false);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string>('');
  const [amountWarning, setAmountWarning] = useState<string>('');
  const [confirmTrade, setConfirmTrade] = useState(false);
  const [prefillBanner, setPrefillBanner] = useState<{ side: 'yes' | 'no'; amount: number | null } | null>(null);
  const prefillAppliedRef = useRef(false);

  // Apply a prefill from a shared draft_trade_link exactly once. Never submits.
  const applyPrefill = useCallback((side: 'yes' | 'no', amount: number | null) => {
    if (prefillAppliedRef.current) return;
    prefillAppliedRef.current = true;
    setSelectedSide(side);
    setOrderType('buy');
    if (amount !== null) setAmount(amount);
    setPrefillBanner({ side, amount });
  }, []);
  const [hoverPoint, setHoverPoint] = useState<{
    x: number;
    y: number;
    price: number;
    timestamp: number;
    svgX: number;
    svgY: number;
  } | null>(null);

  const chartRef = useRef<HTMLDivElement>(null);

  // Reset confirm state when amount changes
  useEffect(() => {
    setConfirmTrade(false);
  }, [amount]);

  // ── Proactive on-chain status polling (every 8s) ──────────────────────
  // Detects Trading → Locked transitions before the user tries to place an order.
  useEffect(() => {
    if (!data?.marketId || !data?.poolAddress) return;

    let stopped = false;

    async function pollStatus() {
      if (stopped) return;
      try {
        const pulse = createPulseClient();
        const status = await getOnChainMarketStatus(pulse.client, data!.marketId);
        if (!stopped) {
          setLiveStatus(status);
        }
      } catch {
        // Non-fatal: next poll will retry.
      }
    }

    // Initial check
    void pollStatus();
    const timer = setInterval(() => void pollStatus(), 8_000);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [data?.marketId, data?.poolAddress]);



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

  // Trade confirmation threshold: use risk-limit maxPositionSize if enabled, else 100
  const tradeThreshold = useMemo(() => {
    if (wallet.address) {
      const settings = loadSettings(wallet.address);
      if (settings.riskLimitsEnabled) {
        const limit = parseFloat(settings.riskLimits.maxPositionSizePerMarket);
        if (!isNaN(limit) && limit > 0) return limit;
      }
    }
    return 100;
  }, [wallet.address]);

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

    // Validate amount before submission
    const amountValidation = validateAmount(String(amount), {
      allowZero: false,
      decimals: data?.quoteDecimals ?? 6,
      fieldLabel: 'Amount',
    });
    if (!amountValidation.valid) {
      setAmountError(amountValidation.error);
      setOrderStatus('idle');
      return;
    }

    // Reset rejection state from any prior attempt
    setOrderStatus('submitting');
    setOrderError(null);
    setOrderResult(null);
    setAmountError('');

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
        poolAddress: data.poolAddress,
        marketId: data.marketId,
        side,
        priceCents,
        amount,
        decimals: data.quoteDecimals,
      });

      setOrderResult({ hash: result.hash, explorerUrl: result.explorerUrl });
      setOrderStatus('success');
      setConfirmTrade(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRejected = msg.includes('rejected') || msg.includes('Rejected') || msg.includes('User rejected');
      if (isRejected) {
        setOrderStatus('rejected');
      } else {
        setOrderError(msg);
        setOrderStatus('error');
        setConfirmTrade(false);

        // Check if this is a no-liquidity error — offer limit order fallback
        const isNoLiquidity =
          (err instanceof PulseEngineError && err.code === PulseErrorCode.NO_LIQUIDITY) ||
          msg.includes('ImmediateOrCancelNoFill') ||
          msg.includes('no liquidity') ||
          msg.includes('No liquidity');
        if (isNoLiquidity) {
          setShowLimitFallback(true);
        }

        // Check if market transitioned to Locked during submission — force liveStatus update
        const isWrongStatus =
          (err instanceof PulseEngineError && err.code === PulseErrorCode.WRONG_STATUS) ||
          msg.includes('WrongStatus') ||
          msg.includes('not writable');
        if (isWrongStatus) {
          setLiveStatus('Locked');
        }
      }
    } finally {
      setTimeout(() => {
        setOrderStatus('idle');
        setOrderResult(null);
        setOrderError(null);
        setShowLimitFallback(false);
      }, 8000);
    }
  }, [data, orderType, selectedSide, amount, orderStatus, wallet, wagmiAddress]);

  /* ── Place limit order handler (fallback when IOC fails due to no liquidity) ── */
  const handlePlaceLimitOrder = useCallback(async () => {
    if (!data || orderStatus === 'submitting') return;

    if (wallet.connectionStatus !== 'connected' || !wallet.address) {
      setOrderError('Please connect your wallet first.');
      setOrderStatus('error');
      setTimeout(() => { setOrderStatus('idle'); setOrderError(null); }, 3000);
      return;
    }

    // Validate amount before submission
    const amountValidation = validateAmount(String(amount), {
      allowZero: false,
      decimals: data?.quoteDecimals ?? 6,
      fieldLabel: 'Amount',
    });
    if (!amountValidation.valid) {
      setAmountError(amountValidation.error);
      setOrderStatus('idle');
      return;
    }

    setOrderStatus('submitting');
    setOrderError(null);
    setOrderResult(null);
    setShowLimitFallback(false);
    setAmountError('');

    const side = orderType === 'buy'
      ? (selectedSide === 'yes' ? 'BUY_YES' : 'BUY_NO')
      : (selectedSide === 'yes' ? 'SELL_YES' : 'SELL_NO');

    const priceCents = selectedSide === 'yes' ? data.yesAskCents : data.noAskCents;

    try {
      const walletClient = await getWalletClient(wagmiConfig);
      if (!walletClient || !walletClient.account) {
        throw new Error('Wallet client not available. Please reconnect.');
      }

      const result = await placeClientLimitOrder(walletClient, walletClient.account, {
        poolAddress: data.poolAddress,
        marketId: data.marketId,
        side,
        priceCents,
        amount,
        decimals: data.quoteDecimals,
      });

      setOrderResult({ hash: result.hash, explorerUrl: result.explorerUrl });
      setOrderStatus('success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRejected = msg.includes('rejected') || msg.includes('Rejected') || msg.includes('User rejected');
      if (isRejected) {
        setOrderStatus('rejected');
      } else {
        setOrderError(msg);
        setOrderStatus('error');

        // Check if market transitioned to Locked during submission
        const isWrongStatus =
          (err instanceof PulseEngineError && err.code === PulseErrorCode.WRONG_STATUS) ||
          msg.includes('WrongStatus') ||
          msg.includes('not writable');
        if (isWrongStatus) {
          setLiveStatus('Locked');
        }
      }
    } finally {
      setTimeout(() => {
        setOrderStatus('idle');
        setOrderResult(null);
        setOrderError(null);
        setShowLimitFallback(false);
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

  const isLocked = liveStatus !== null && liveStatus !== 'Trading' && liveStatus !== 'Listed';

  return (
    <div className={styles.page}>
      <AppChromeNav />

      {/* Reads prefillSide/prefillAmount from the URL (draft_trade_link support). */}
      <Suspense fallback={null}>
        <TradePrefillReader onPrefill={applyPrefill} />
      </Suspense>

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

        {/* Trade pre-filled from a shared link — review before confirming */}
        {prefillBanner && (
          <div className={styles.prefillBanner} role="status" aria-live="polite">
            <Sparkles size={14} aria-hidden="true" className={styles.prefillBannerIcon} />
            <span>
              Trade pre-filled from a shared link ({prefillBanner.side === 'yes' ? 'Yes' : 'No'}
              {prefillBanner.amount !== null ? ` · ${prefillBanner.amount} test USDC` : ''}) — review and
              confirm before submitting. Nothing has been submitted yet.
            </span>
          </div>
        )}

        {/* Chain mismatch warning */}
        <ChainMismatchBanner />

        {/* Locked market banner */}
        {isLocked && (
          <div className={styles.lockedBanner} role="status" aria-live="polite">
            <Lock size={18} aria-hidden="true" className={styles.lockedBannerIcon} />
            <div className={styles.lockedBannerContent}>
              <p className={styles.lockedBannerTitle}>
                This market has locked — the trading window has closed.
              </p>
              <p className={styles.lockedBannerSubtitle}>
                Your position will be claimable once this market resolves — check your Portfolio after settlement.
              </p>
            </div>
            <div className={styles.lockedBannerActions}>
              <Link href="/markets" className={styles.lockedBannerLink}>
                Find another market
              </Link>
              <Link href="/portfolio" className={styles.lockedBannerLink}>
                Portfolio
              </Link>
            </div>
          </div>
        )}

        {/* View Receipt link — only shown for resolved/voided/finalized markets */}
        {data && (
          <ResolvedReceiptLink marketId={data.marketId} />
        )}

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
            <TradeTicketErrorBoundary>
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
                  disabled={isLocked}
                >
                  <span>Yes</span>
                </button>
                <button
                  type="button"
                  className={`${styles.sideButton} ${
                    selectedSide === 'no'
                      ? `${styles.sideButtonNoActive} ${styles.sideButtonGlow}`
                      : ''
                  }`}
                  onClick={() => setSelectedSide('no')}
                  disabled={isLocked}
                >
                  <span>No</span>
                </button>
              </div>

              <div className={styles.orderTypeTabs} role="group" aria-label="Order action">
                <button
                  type="button"
                  className={`${styles.orderTypeTab} ${
                    orderType === 'buy' ? styles.orderTypeTabActive : ''
                  }`}
                  onClick={() => setOrderType('buy')}
                  disabled={isLocked}
                >
                  Buy
                </button>
                <button
                  type="button"
                  className={`${styles.orderTypeTab} ${
                    orderType === 'sell' ? styles.orderTypeTabActive : ''
                  }`}
                  onClick={() => setOrderType('sell')}
                  disabled={isLocked}
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
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => {
                      const val = e.target.value;
                      // Allow empty, digits, and one decimal point
                      if (val === '' || /^[0-9]*\.?[0-9]*$/.test(val)) {
                        setAmount(val === '' ? 0 : Number(val));
                        setAmountError('');
                      }
                    }}
                    onBlur={() => {
                      if (amount === 0) {
                        setAmount(100);
                        return;
                      }
                      const result = validateAmount(String(amount), {
                        allowZero: false,
                        decimals: data?.quoteDecimals ?? 6,
                        walletBalance: undefined,
                        fieldLabel: 'Amount',
                      });
                      setAmountError(result.error);
                      setAmountWarning(result.warning);
                    }}
                    className={`${styles.amountInput} ${amountError ? styles.amountInputError : ''}`}
                    aria-label="Trade amount in test USDC"
                    aria-invalid={!!amountError}
                    aria-describedby={amountError ? 'amount-error' : undefined}
                    disabled={isLocked}
                  />
                  <span className={styles.unitTag}>test USDC</span>
                </div>
                {amountError && (
                  <p id="amount-error" className={styles.amountErrorText} role="alert">
                    {amountError}
                  </p>
                )}
                {amountWarning && !amountError && (
                  <p className={styles.amountWarningText} role="status">
                    {amountWarning}
                  </p>
                )}
              </div>

              <div className={styles.quickChips} role="group" aria-label="Quick amount increments">
                {[1, 5, 20].map((val) => (
                  <button
                    key={val}
                    type="button"
                    className={`${styles.chipButton} ${isLocked ? styles.chipButtonDisabled : ''}`}
                    onClick={() => setAmount((prev) => prev + val)}
                    disabled={isLocked}
                  >
                    +{val}
                  </button>
                ))}
                <button
                  type="button"
                  className={`${styles.chipButton} ${isLocked ? styles.chipButtonDisabled : ''}`}
                  onClick={() => setAmount(1000)}
                  disabled={isLocked}
                >
                  MAX
                </button>
              </div>

              <div key={selectedSide} className={`${styles.breakdown} ${styles.breakdownEnter} ${isLocked ? styles.breakdownDisabled : ''}`}>
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
                } ${orderStatus === 'submitting' || isLocked ? styles.ticketCtaDisabled : ''} ${confirmTrade ? styles.ticketCtaConfirm : ''}`}
                onClick={() => {
                  if (wallet.connectionStatus !== 'connected') {
                    wallet.connect();
                    return;
                  }
                  // If amount exceeds threshold and not yet confirmed, show confirm state
                  if (!confirmTrade && amount > tradeThreshold) {
                    setConfirmTrade(true);
                    return;
                  }
                  handlePlaceOrder();
                }}
                disabled={orderStatus === 'submitting' || isLocked}
              >
                {isLocked ? (
                  <span>Market locked</span>
                ) : wallet.connectionStatus !== 'connected' ? (
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
                ) : orderStatus === 'rejected' ? (
                  <span className={styles.ctaError}>
                    Retry
                  </span>
                ) : confirmTrade ? (
                  <span>Confirm {orderType === 'buy' ? 'Buy' : 'Sell'} {amount} USDC</span>
                ) : (
                  <>{orderType === 'buy' ? 'Buy' : 'Sell'} {selectedSide === 'yes' ? 'Yes' : 'No'}</>
                )}
              </button>



              {orderStatus === 'success' && orderResult && (
                <p className={styles.orderSuccessText}>
                  <a
                    href={orderResult.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#4ade80', textDecoration: 'underline', textUnderlineOffset: '2px' }}
                  >
                    Transaction submitted -- view on explorer
                  </a>
                </p>
              )}

              <p className={styles.ticketFootnote}>
                quoted from the live order book / winners redeem via on-chain settlement
              </p>
            </div>
            </TradeTicketErrorBoundary>
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

      {/* ── Generic Order Error Popup ───────────────────────── */}
      {orderStatus === 'error' && orderError && !showLimitFallback && (
        <div className={styles.rejectedOverlay} role="dialog" aria-label="Order error">
          <div className={styles.errorPopup}>
            <p className={styles.errorPopupTitle}>Order Failed</p>
            <p className={styles.errorPopupMessage}>{orderError}</p>
            <button
              type="button"
              className={styles.errorPopupDismiss}
              onClick={() => {
                setOrderStatus('idle');
                setOrderError(null);
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ── No Liquidity Popup ──────────────────────────────── */}
      {showLimitFallback && (
        <div className={styles.rejectedOverlay} role="dialog" aria-label="Insufficient liquidity">
          <div className={styles.liquidityPopup}>
            <div className={styles.liquidityPopupHeader}>
              <p className={styles.liquidityPopupTitle}>Not enough liquidity</p>
            </div>

            <p className={styles.liquidityPopupMessage}>
              This trade could not be filled immediately because the order book
              doesn't have enough opposing liquidity at your price.
            </p>

            <p className={styles.liquidityPopupHint}>
              Try a smaller amount, or place a limit order to rest on the book until it fills.
            </p>

            <div className={styles.liquidityPopupActions}>
              <button
                type="button"
                className={styles.liquidityPopupPrimary}
                onClick={handlePlaceLimitOrder}
                disabled={orderStatus === 'submitting'}
              >
                Place as Limit Order
              </button>
              <button
                type="button"
                className={styles.liquidityPopupDismiss}
                onClick={() => {
                  setShowLimitFallback(false);
                  setOrderStatus('idle');
                  setOrderError(null);
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Order Rejected Popup ──────────────────────────────── */}
      {orderStatus === 'rejected' && (
        <div className={styles.rejectedOverlay} role="dialog" aria-label="Order rejected">
          <div className={styles.rejectedPopup}>
            <p className={styles.rejectedTitle}>Order Rejected</p>
            <p className={styles.rejectedSubtitle}>This order was not submitted.</p>

            <table className={styles.rejectedTable}>
              <tbody>
                <tr>
                  <td className={styles.rejectedLabel}>Side</td>
                  <td className={styles.rejectedValue}>
                    {orderType === 'buy' ? 'Buy' : 'Sell'} {selectedSide === 'yes' ? 'Yes' : 'No'}
                  </td>
                </tr>
                <tr>
                  <td className={styles.rejectedLabel}>Price</td>
                  <td className={styles.rejectedValue}>
                    {selectedSide === 'yes' ? data?.yesAskCents : data?.noAskCents}&cent;
                  </td>
                </tr>
                <tr>
                  <td className={styles.rejectedLabel}>Amount</td>
                  <td className={styles.rejectedValue}>{amount} test USDC</td>
                </tr>
              </tbody>
            </table>

            <p className={styles.rejectedFooter}>Bet responsibly.</p>
            <button
              type="button"
              className={styles.rejectedDismiss}
              onClick={() => setOrderStatus('idle')}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
