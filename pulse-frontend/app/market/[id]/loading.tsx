'use client';

/**
 * /app/market/[id]/loading.tsx
 *
 * Skeleton shown during navigation from the markets grid to a
 * market detail page. Mirrors the real layout: back link, glass
 * panel with chart column + ticket column, and outcome footer rows.
 */

export default function MarketDetailLoading() {
  return (
    <div style={pageStyle} aria-busy="true" aria-label="Loading market details" role="status">
      <style>{`
        .md-shimmer {
          animation: md-shimmer 1.5s ease-in-out infinite;
        }
        @keyframes md-shimmer {
          0%, 100% { opacity: 0.25; }
          50% { opacity: 0.6; }
        }
        .md-panel-body {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 320px;
          gap: 0;
        }
        .md-chart-col {
          padding: var(--space-5);
          border-right: 1px solid rgba(255, 255, 255, 0.07);
          display: flex;
          flex-direction: column;
        }
        .md-ticket-col {
          padding: var(--space-5) var(--space-4);
          display: flex;
          flex-direction: column;
          background: rgba(12, 12, 16, 0.4);
        }
        @media (max-width: 860px) {
          .md-panel-body {
            grid-template-columns: 1fr;
          }
          .md-chart-col {
            border-right: none;
            border-bottom: 1px solid rgba(255, 255, 255, 0.07);
            padding: var(--space-4);
          }
          .md-ticket-col {
            padding: var(--space-4);
          }
        }
        @media (max-width: 640px) {
          .md-main {
            padding: var(--space-4) var(--space-4) var(--space-7) !important;
          }
          .md-footer {
            padding: var(--space-3) var(--space-4) !important;
          }
          .md-honesty {
            padding: var(--space-2) var(--space-4) !important;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .md-shimmer {
            animation: none;
            opacity: 0.4;
          }
        }
      `}</style>

      <main style={mainStyle} className="md-main">
        {/* Back link skeleton */}
        <div style={backLinkSkeleton} className="md-shimmer" />

        {/* Glass panel */}
        <div style={panelStyle}>
          {/* Honesty strip */}
          <div style={honestyStripStyle} className="md-shimmer md-honesty" />

          {/* Panel body: chart + ticket */}
          <div className="md-panel-body">
            {/* Left: chart column */}
            <div className="md-chart-col">
              <div style={{ ...barStyle, width: '120px', height: '10px' }} className="md-shimmer" />
              <div style={{ ...barStyle, width: '85%', height: '18px', marginTop: '8px' }} className="md-shimmer" />
              <div style={{ ...barStyle, width: '60%', height: '18px', marginTop: '4px' }} className="md-shimmer" />

              {/* Price header */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px', marginBottom: '24px' }}>
                <div style={{ ...barStyle, width: '100px', height: '36px' }} className="md-shimmer" />
                <div style={{ ...barStyle, width: '60px', height: '24px', borderRadius: '6px' }} className="md-shimmer" />
              </div>

              {/* Chart controls */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ ...barStyle, width: '160px', height: '10px' }} className="md-shimmer" />
                <div style={{ ...barStyle, width: '90px', height: '24px', borderRadius: '6px' }} className="md-shimmer" />
              </div>

              {/* Chart area */}
              <div style={chartAreaStyle} className="md-shimmer" />

              <div style={{ ...barStyle, width: '200px', height: '10px', marginTop: '12px' }} className="md-shimmer" />
            </div>

            {/* Right: ticket column */}
            <div className="md-ticket-col">
              {/* Side toggle */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                <div style={{ ...barStyle, height: '44px', borderRadius: '8px' }} className="md-shimmer" />
                <div style={{ ...barStyle, height: '44px', borderRadius: '8px' }} className="md-shimmer" />
              </div>

              {/* Order type tabs */}
              <div style={{ ...barStyle, height: '32px', borderRadius: '6px', marginBottom: '16px' }} className="md-shimmer" />

              {/* Amount input */}
              <div style={{ ...barStyle, height: '44px', borderRadius: '8px', marginBottom: '12px' }} className="md-shimmer" />

              {/* Quick chips */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} style={{ ...barStyle, flex: 1, height: '28px', borderRadius: '5px' }} className="md-shimmer" />
                ))}
              </div>

              {/* Breakdown */}
              <div style={breakdownStyle}>
                {[1, 2, 3].map((i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <div style={{ ...barStyle, width: `${60 + i * 5}px`, height: '12px' }} className="md-shimmer" />
                    <div style={{ ...barStyle, width: `${70 + i * 8}px`, height: '12px' }} className="md-shimmer" />
                  </div>
                ))}
              </div>

              {/* CTA button */}
              <div style={{ ...barStyle, height: '48px', borderRadius: '8px', marginBottom: '12px' }} className="md-shimmer" />

              <div style={{ ...barStyle, width: '80%', height: '10px', margin: '0 auto' }} className="md-shimmer" />
            </div>
          </div>

          {/* Outcome footer rows */}
          <div style={footerStyle} className="md-footer">
            {[1, 2].map((i) => (
              <div key={i} style={outcomeRowStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ ...barStyle, width: '36px', height: '20px', borderRadius: '4px' }} className="md-shimmer" />
                  <div style={{ ...barStyle, width: '48px', height: '16px' }} className="md-shimmer" />
                  <div style={{ ...barStyle, width: '40px', height: '12px' }} className="md-shimmer" />
                </div>
                <div style={{ ...barStyle, width: '72px', height: '30px', borderRadius: '6px' }} className="md-shimmer" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

/* ── Static style objects ── */

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  backgroundColor: 'var(--color-shadow-mountain)',
  color: 'var(--color-paper)',
  display: 'flex',
  flexDirection: 'column',
};

const mainStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '1120px',
  margin: '0 auto',
  padding: 'var(--space-5) var(--space-5) var(--space-8)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-5)',
};

const backLinkSkeleton: React.CSSProperties = {
  width: '80px',
  height: '14px',
  borderRadius: '4px',
  background: 'rgba(255, 255, 255, 0.05)',
};

const panelStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: '#09090b',
  borderRadius: '18px',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  boxShadow:
    '0 24px 64px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.04), inset 0 1px 1px rgba(255, 255, 255, 0.1)',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
};

const honestyStripStyle: React.CSSProperties = {
  padding: 'var(--space-2) var(--space-5)',
  background: 'rgba(0, 0, 0, 0.4)',
  borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  height: '34px',
};

const chartAreaStyle: React.CSSProperties = {
  width: '100%',
  height: '220px',
  borderRadius: '8px',
  background: 'rgba(255, 255, 255, 0.03)',
  border: '1px solid rgba(255, 255, 255, 0.04)',
};

const breakdownStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  marginBottom: '16px',
  padding: 'var(--space-3)',
  background: 'rgba(0, 0, 0, 0.25)',
  borderRadius: '8px',
  border: '1px solid rgba(255, 255, 255, 0.04)',
};

const footerStyle: React.CSSProperties = {
  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
  background: 'rgba(14, 14, 18, 0.6)',
  padding: 'var(--space-3) var(--space-5)',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const outcomeRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: 'var(--space-2) var(--space-3)',
  borderRadius: '8px',
  background: 'rgba(255, 255, 255, 0.02)',
  border: '1px solid rgba(255, 255, 255, 0.04)',
};

const barStyle: React.CSSProperties = {
  width: '100%',
  height: '14px',
  borderRadius: '4px',
  background: 'rgba(255, 255, 255, 0.05)',
};
