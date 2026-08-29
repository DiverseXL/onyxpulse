'use client';

/**
 * /app/loading.tsx
 *
 * Root loading UI shown during route transitions.
 * Uses a centered Pulse brand spinner + shimmer skeleton lines
 * that match the project's dark glass design system.
 */

export default function Loading() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-5)',
        fontFamily: 'var(--font-body)',
      }}
      aria-busy="true"
      aria-label="Loading"
      role="status"
    >
      {/* Brand spinner */}
      <div style={spinnerContainerStyle}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          style={spinnerSvgStyle}
          className="pulse-spinner"
          aria-hidden="true"
        >
          <path
            d="M3 17C7 17 8 11 13 11C18 11 18 5 21 5"
            stroke="var(--color-rust)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M3 20C7 20 9 15 13 15C17 15 18 10 21 10"
            stroke="var(--color-rust)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeOpacity="0.4"
          />
        </svg>
      </div>

      {/* Shimmer skeleton lines */}
      <div style={skeletonGroupStyle}>
        <div style={{ ...skeletonLineStyle, width: '220px' }} className="pulse-shimmer" />
        <div style={{ ...skeletonLineStyle, width: '140px', opacity: 0.5 }} className="pulse-shimmer" />
      </div>

      <style>{`
        .pulse-spinner {
          animation: pulse-spin 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }

        .pulse-shimmer {
          animation: pulse-shimmer 1.5s ease-in-out infinite;
        }

        @keyframes pulse-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @keyframes pulse-shimmer {
          0%, 100% { opacity: 0.25; }
          50% { opacity: 0.6; }
        }

        @media (prefers-reduced-motion: reduce) {
          .pulse-spinner {
            animation: none;
            opacity: 0.7;
          }
          .pulse-shimmer {
            animation: none;
            opacity: 0.4;
          }
        }
      `}</style>
    </div>
  );
}

/* ── Inline style objects (static, no re-renders) ── */

const spinnerContainerStyle: React.CSSProperties = {
  width: '48px',
  height: '48px',
  borderRadius: '50%',
  background: 'rgba(255, 255, 255, 0.04)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const spinnerSvgStyle: React.CSSProperties = {
  width: '28px',
  height: '28px',
};

const skeletonGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 'var(--space-2)',
};

const skeletonLineStyle: React.CSSProperties = {
  height: '10px',
  borderRadius: '5px',
  background: 'rgba(255, 255, 255, 0.05)',
};
