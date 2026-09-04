'use client';

/**
 * TradeTicketErrorBoundary
 *
 * Scoped error boundary that wraps only the trade ticket panel on /market/[id].
 * If an unexpected JS error occurs within the ticket (amount input, CTA,
 * side toggle, etc.), this boundary catches it and renders a calm fallback
 * UI instead of white-screening the entire page.
 *
 * The chart, market info, and other page elements remain fully functional.
 */

import React, { Component, type ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class TradeTicketErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Trade ticket error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--space-6) var(--space-4)',
            background: 'rgba(14, 12, 16, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '14px',
            textAlign: 'center',
            gap: 'var(--space-3)',
            minHeight: '320px',
          }}
          role="alert"
        >
          <div
            style={{
              width: '48px',
              height: '48px',
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
            <AlertCircle size={24} style={{ color: '#F2EDE1', opacity: 0.6 }} aria-hidden="true" />
          </div>

          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-body)',
              fontWeight: 600,
              color: 'var(--color-paper)',
              lineHeight: 1.4,
              margin: 0,
              maxWidth: '280px',
            }}
          >
            Something went wrong with the trade panel.
          </p>

          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-micro)',
              color: 'rgba(242, 237, 225, 0.55)',
              lineHeight: 1.5,
              margin: 0,
              maxWidth: '280px',
            }}
          >
            Your funds are safe — no transaction was sent.
          </p>

          <button
            type="button"
            onClick={this.handleReset}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.08)',
              backdropFilter: 'blur(16px) saturate(150%)',
              WebkitBackdropFilter: 'blur(16px) saturate(150%)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.15), 0 2px 8px rgba(0, 0, 0, 0.2)',
              color: 'var(--color-paper)',
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-small)',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 150ms ease',
              marginTop: 'var(--space-1)',
            }}
          >
            <RefreshCw size={14} aria-hidden="true" />
            Reload Trade Panel
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
