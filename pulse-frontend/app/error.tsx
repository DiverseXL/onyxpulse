'use client';

import { useEffect } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-6)',
        fontFamily: 'var(--font-body)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-5)',
          maxWidth: '480px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.06)',
            backdropFilter: 'blur(16px) saturate(150%)',
            WebkitBackdropFilter: 'blur(16px) saturate(150%)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.15), 0 4px 16px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AlertCircle
            size={28}
            style={{ color: 'var(--color-paper)', opacity: 0.7 }}
            aria-hidden="true"
          />
        </div>

        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-micro)',
            color: 'var(--color-paper)',
            opacity: 'var(--opacity-muted)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          Something went wrong
        </span>

        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-h2)',
            fontWeight: 700,
            color: 'var(--color-paper)',
            lineHeight: 1.3,
            margin: 0,
          }}
        >
          An unexpected error occurred
        </h1>

        <p
          style={{
            fontSize: 'var(--text-body)',
            color: 'var(--color-paper)',
            opacity: 'var(--opacity-secondary)',
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          The application encountered an error while loading this page. You can
          try again or return to the home page.
        </p>

        {error.digest && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-micro)',
              color: 'var(--color-paper)',
              opacity: 'var(--opacity-muted)',
              padding: 'var(--space-2) var(--space-3)',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            Error ID: {error.digest}
          </span>
        )}

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 'var(--space-3)',
            marginTop: 'var(--space-2)',
          }}
        >
          <button
            type="button"
            onClick={reset}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.5rem 1rem',
              borderRadius: '9999px',
              background: 'rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(16px) saturate(150%)',
              WebkitBackdropFilter: 'blur(16px) saturate(150%)',
              color: 'var(--color-paper)',
              fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
              fontSize: 'var(--text-small)',
              fontWeight: 600,
              border: '1px solid rgba(255, 255, 255, 0.18)',
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.15), 0 2px 8px rgba(0, 0, 0, 0.2)',
              cursor: 'pointer',
              transition: 'transform 150ms ease, background 150ms ease',
            }}
          >
            <RefreshCw size={14} aria-hidden="true" />
            Try again
          </button>

          <a
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0.5rem 1rem',
              borderRadius: '9999px',
              background: 'rgba(255, 255, 255, 0.04)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              color: 'var(--color-paper)',
              fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
              fontSize: 'var(--text-small)',
              fontWeight: 600,
              border: '1px solid rgba(255, 255, 255, 0.1)',
              textDecoration: 'none',
              transition: 'transform 150ms ease, background 150ms ease',
            }}
          >
            Home
          </a>
        </div>
      </div>
    </div>
  );
}
