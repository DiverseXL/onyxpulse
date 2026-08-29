'use client';

/**
 * /app/global-error.tsx
 *
 * Catches errors that crash the root layout itself (e.g. layout.tsx
 * throws, Providers fail to mount, fonts can't load). This is the
 * last-resort error boundary — it renders its own <html> and <body>
 * since the root layout is unavailable.
 *
 * MUST be a client component with its own html/body shell.
 */

import { useEffect } from 'react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error('Global layout error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          backgroundColor: '#050A05',
          color: '#F2EDE1',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          lineHeight: 1.6,
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '24px',
            maxWidth: '480px',
            textAlign: 'center',
          }}
        >
          {/* Icon */}
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'rgba(193, 80, 46, 0.15)',
              border: '1px solid rgba(193, 80, 46, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              color: '#C1502E',
            }}
            aria-hidden="true"
          >
            !
          </div>

          {/* Label */}
          <span
            style={{
              fontFamily: "'Courier New', monospace",
              fontSize: '11px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'rgba(242, 237, 225, 0.48)',
            }}
          >
            Critical Error
          </span>

          {/* Heading */}
          <h1
            style={{
              fontFamily: 'Georgia, serif',
              fontSize: '1.375rem',
              fontWeight: 700,
              color: '#F2EDE1',
              lineHeight: 1.3,
              margin: 0,
            }}
          >
            The application failed to start
          </h1>

          {/* Body */}
          <p
            style={{
              fontSize: '1rem',
              color: 'rgba(242, 237, 225, 0.72)',
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            A critical error prevented the app from loading. This usually
            means a core dependency failed to initialize. Try reloading the
            page.
          </p>

          {/* Digest badge */}
          {error.digest && (
            <span
              style={{
                fontFamily: "'Courier New', monospace",
                fontSize: '11px',
                color: 'rgba(242, 237, 225, 0.48)',
                padding: '8px 12px',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              Error ID: {error.digest}
            </span>
          )}

          {/* Actions */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '12px',
              marginTop: '8px',
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 20px',
                borderRadius: '9999px',
                background: '#C1502E',
                color: '#F2EDE1',
                fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
                fontSize: '13px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>

            <button
              type="button"
              onClick={() => {
                window.location.href = '/';
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '10px 20px',
                borderRadius: '9999px',
                background: 'rgba(255, 255, 255, 0.06)',
                color: '#F2EDE1',
                fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
                fontSize: '13px',
                fontWeight: 600,
                border: '1px solid rgba(255, 255, 255, 0.15)',
                cursor: 'pointer',
              }}
            >
              Reload home
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
