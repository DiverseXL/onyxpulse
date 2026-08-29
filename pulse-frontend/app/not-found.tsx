'use client';

import Link from 'next/link';
import { AlertCircle, ArrowLeft } from 'lucide-react';

export default function NotFound() {
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
        <AlertCircle
          size={40}
          style={{ color: 'var(--color-rust)', opacity: 0.8 }}
          aria-hidden="true"
        />

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
          404
        </span>

        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-h2)',
            fontWeight: 700,
            color: 'var(--color-paper)',
            lineHeight: 1.3,
          }}
        >
          Page not found
        </h1>

        <p
          style={{
            fontSize: 'var(--text-body)',
            color: 'var(--color-paper)',
            opacity: 'var(--opacity-secondary)',
            lineHeight: 1.6,
          }}
        >
          The page you are looking for does not exist or has been moved.
        </p>

        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.5rem 1rem',
            borderRadius: '9999px',
            background: 'var(--color-rust)',
            color: 'var(--color-paper)',
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
            fontSize: 'var(--text-small)',
            fontWeight: 600,
            transition: 'transform 150ms ease, filter 150ms ease',
          }}
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back to home
        </Link>
      </div>
    </div>
  );
}
