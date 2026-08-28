'use client';

import React, { useState, useEffect } from 'react';
import { TrendingUp, Wallet, ArrowUpRight } from 'lucide-react';
import styles from './PortfolioBody.module.css';

export type PortfolioPosition = {
  title: string;
  side: 'Yes' | 'No';
  quantity: number;
  entryCents: number;
  currentCents: number;
  value: number;
  pnl: number;
  timeRange?: string;
};

export type PortfolioPreviewData = {
  totalValue: number;
  cashBalance: number;
  pnlAbsolute: number;
  pnlPct: number;
  positions: Array<PortfolioPosition>;
};

const SAMPLE_PORTFOLIO: PortfolioPreviewData = {
  totalValue: 146.02,
  cashBalance: 32.40,
  pnlAbsolute: 18.62,
  pnlPct: 14.6,
  positions: [
    {
      title: 'BTC 15m — Up',
      side: 'Yes',
      quantity: 120,
      entryCents: 52,
      currentCents: 64,
      value: 76.80,
      pnl: 14.40,
      timeRange: '16:15 – 16:30 UTC',
    },
    {
      title: 'ETH 15m — Down',
      side: 'No',
      quantity: 80,
      entryCents: 45,
      currentCents: 48,
      value: 38.40,
      pnl: 2.40,
      timeRange: '16:30 – 16:45 UTC',
    },
    {
      title: 'BTC 15m — Down',
      side: 'No',
      quantity: 50,
      entryCents: 41,
      currentCents: 38,
      value: 19.00,
      pnl: -1.50,
      timeRange: '16:00 – 16:15 UTC',
    },
  ],
};

/** Seeded upward walk for the 30-day equity preview curve */
const SEEDED_PNL_POINTS = [
  [0, 100],
  [1, 102],
  [2, 101],
  [3, 105],
  [4, 104],
  [5, 109],
  [6, 107],
  [7, 112],
  [8, 115],
  [9, 113],
  [10, 118],
  [11, 122],
  [12, 120],
  [13, 126],
  [14, 125],
  [15, 131],
  [16, 129],
  [17, 135],
  [18, 134],
  [19, 138],
  [20, 142],
  [21, 140],
  [22, 145],
  [23, 144],
  [24, 146.02],
];

/** Decorative mini sparkline for the portfolio value card */
function MiniSparkline() {
  return (
    <svg
      viewBox="0 0 52 20"
      className={styles.cardSparklineSvg}
      aria-hidden="true"
      fill="none"
    >
      <path
        d="M 2 16 Q 14 14, 22 10 T 36 6 T 50 3"
        stroke="#4ade80"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** SVG line chart with gradient fill and subtle grid lines */
function PnlLineChart() {
  const width = 460;
  const height = 85;
  const paddingX = 10;
  const paddingY = 8;

  const vals = SEEDED_PNL_POINTS.map((p) => p[1]);
  const minVal = Math.min(...vals) - 4;
  const maxVal = Math.max(...vals) + 2;
  const range = maxVal - minVal || 1;

  const coords = SEEDED_PNL_POINTS.map(([xIndex, val]) => {
    const x = paddingX + (xIndex / (SEEDED_PNL_POINTS.length - 1)) * (width - paddingX * 2);
    const y = paddingY + (1 - (val - minVal) / range) * (height - paddingY * 2);
    return { x, y };
  });

  let lineD = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const curr = coords[i];
    const cpx = (prev.x + curr.x) / 2;
    lineD += ` C ${cpx.toFixed(1)} ${prev.y.toFixed(1)}, ${cpx.toFixed(1)} ${curr.y.toFixed(1)}, ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
  }

  const lastCoord = coords[coords.length - 1];
  const firstCoord = coords[0];
  const areaD = `${lineD} L ${lastCoord.x.toFixed(1)} ${height} L ${firstCoord.x.toFixed(1)} ${height} Z`;

  return (
    <div className={styles.pnlChartWrapper} role="img" aria-label="Sample 30-day upward performance line chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className={styles.pnlChartSvg}
      >
        <defs>
          <linearGradient id="pnlGreenGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4ade80" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#4ade80" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Subtle grid reference lines */}
        <line
          x1={0}
          y1={height * 0.25}
          x2={width}
          y2={height * 0.25}
          stroke="rgba(255,255,255,0.06)"
          strokeDasharray="4 4"
        />
        <line
          x1={0}
          y1={height * 0.65}
          x2={width}
          y2={height * 0.65}
          stroke="rgba(255,255,255,0.06)"
          strokeDasharray="4 4"
        />

        {/* Area fill */}
        <path d={areaD} fill="url(#pnlGreenGrad)" />

        {/* Trend line */}
        <path
          d={lineD}
          fill="none"
          stroke="#4ade80"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Ending endpoint dot */}
        <circle
          cx={lastCoord.x}
          cy={lastCoord.y}
          r="3.5"
          fill="#4ade80"
        />
      </svg>
    </div>
  );
}

export default function PortfolioBody() {
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleActionClick = (actionName: string) => {
    setToastMessage(`${actionName} is available in the full app after connecting your wallet.`);
  };

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => {
      setToastMessage(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const { totalValue, cashBalance, pnlAbsolute, pnlPct, positions } = SAMPLE_PORTFOLIO;

  return (
    <div className={styles.container}>
      {/* ── Top Section: 240px Left Column | 1fr Right Column ── */}
      <div className={styles.topSection}>
        {/* Left Column: Portfolio + Balance + Action Buttons */}
        <div className={styles.leftColumn}>
          {/* Portfolio Value Card */}
          <div className={styles.portfolioCard}>
            <div className={styles.cardHeader}>
              <span className={styles.cardLabel}>
                <TrendingUp size={13} className={styles.labelIconGreen} aria-hidden="true" />
                Portfolio
              </span>
              <MiniSparkline />
            </div>
            <div className={styles.cardValueRow}>
              <span className={styles.cardMainValue}>{totalValue.toFixed(2)}</span>
              <span className={styles.cardUnitTag}>test USDC</span>
            </div>
          </div>

          {/* Balance Card */}
          <div className={styles.balanceCard}>
            <div className={styles.cardHeader}>
              <span className={styles.cardLabel}>
                <Wallet size={13} className={styles.labelIconBlue} aria-hidden="true" />
                Balance
              </span>
              <span className={styles.balanceSubtext}>Free Collateral</span>
            </div>
            <div className={styles.cardValueRow}>
              <span className={styles.cardMainValue}>{cashBalance.toFixed(2)}</span>
              <span className={styles.cardUnitTag}>test USDC</span>
            </div>
          </div>

          {/* Action Buttons (Deposit / Withdraw) */}
          <div className={styles.actionsRow} role="group" aria-label="Portfolio cash actions">
            <button
              type="button"
              className={styles.depositBtn}
              onClick={() => handleActionClick('Deposit')}
              aria-label="Deposit test USDC (Preview only — available in full app)"
            >
              <span>Deposit</span>
            </button>
            <button
              type="button"
              className={styles.withdrawBtn}
              onClick={() => handleActionClick('Withdraw')}
              aria-label="Withdraw test USDC (Preview only — available in full app)"
            >
              <span>Withdraw</span>
            </button>

            {toastMessage && (
              <div className={styles.toastNotice} role="status" aria-live="polite">
                {toastMessage}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: P/L Summary & Seeded Upward Walk Chart */}
        <div className={styles.pnlCard}>
          <div className={styles.pnlTopHeader}>
            <div className={styles.pnlTitleGroup}>
              <span className={styles.pnlLabel}>Profit / Loss</span>
              <span className={styles.pnlSubLabel}>past month · sample period</span>
            </div>
            <div className={styles.pnlValueGroup}>
              <span className={styles.pnlMainValue}>
                +{pnlAbsolute.toFixed(2)} <span className={styles.cardUnitTag}>test USDC</span>
              </span>
              <span className={styles.pnlBadge}>
                <ArrowUpRight size={13} aria-hidden="true" />
                +{pnlPct.toFixed(1)}%
              </span>
            </div>
          </div>

          <PnlLineChart />
        </div>
      </div>

      {/* ── Positions Table ── */}
      <div className={styles.positionsSection}>
        <div className={styles.positionsHeader}>
          <span className={styles.positionsLabel}>Open Positions</span>
          <span className={styles.positionsCountTag}>{positions.length} Active Contracts</span>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table} aria-label="Sample open positions table">
            <thead>
              <tr>
                <th scope="col" className={styles.th}>Position</th>
                <th scope="col" className={styles.th}>Current</th>
                <th scope="col" className={`${styles.th} ${styles.thRight}`}>Value</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos, idx) => {
                const isPnlPositive = pos.pnl >= 0;
                const pnlPercentage = ((pos.pnl / (pos.quantity * (pos.entryCents / 100))) * 100).toFixed(1);

                return (
                  <tr key={idx} className={styles.tr}>
                    <td className={styles.td}>
                      <div className={styles.positionCell}>
                        <span className={styles.positionTitle}>{pos.title}</span>
                        <div className={styles.positionMeta}>
                          {pos.side === 'Yes' ? (
                            <span className={styles.chipYes}>Yes</span>
                          ) : (
                            <span className={styles.chipNo}>No</span>
                          )}
                          <span className={styles.metaShares}>
                            {pos.quantity} shares @ {pos.entryCents}¢
                          </span>
                          {pos.timeRange && (
                            <>
                              <span className={styles.metaDot} aria-hidden="true">·</span>
                              <span className={styles.metaTime}>{pos.timeRange}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className={styles.td}>
                      <span className={styles.currentCents}>{pos.currentCents}¢</span>
                    </td>

                    <td className={`${styles.td} ${styles.tdRight}`}>
                      <div className={styles.valueCell}>
                        <span className={styles.posValue}>{pos.value.toFixed(2)} test USDC</span>
                        <span className={isPnlPositive ? styles.posPnlPositive : styles.posPnlNegative}>
                          {isPnlPositive ? `+${pos.pnl.toFixed(2)} (+${pnlPercentage}%)` : `${pos.pnl.toFixed(2)} (${pnlPercentage}%)`}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Footer Honesty Strip ── */}
      <div className={styles.footerHonesty} role="note">
        sample portfolio · illustrative figures · connect a wallet in the full app for live positions
      </div>
    </div>
  );
}
