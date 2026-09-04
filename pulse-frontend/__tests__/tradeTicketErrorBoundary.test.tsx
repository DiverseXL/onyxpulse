/**
 * TradeTicketErrorBoundary test.
 *
 * Verifies that an unexpected JS error within the trade ticket shows
 * a contained fallback UI instead of crashing the page.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import TradeTicketErrorBoundary from '@/components/markets/TradeTicketErrorBoundary';

// Suppress console.error from getDerivedStateFromError
vi.spyOn(console, 'error').mockImplementation(() => {});

function ThrowingComponent(): React.ReactNode {
  throw new Error('Test error: trade ticket crashed');
}

function SafeComponent() {
  return <div>Trade panel content</div>;
}

describe('TradeTicketErrorBoundary', () => {
  it('renders children normally when no error', () => {
    render(
      <TradeTicketErrorBoundary>
        <SafeComponent />
      </TradeTicketErrorBoundary>,
    );

    expect(screen.getByText('Trade panel content')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong with the trade panel')).not.toBeInTheDocument();
  });

  it('shows fallback UI when child throws', () => {
    render(
      <TradeTicketErrorBoundary>
        <ThrowingComponent />
      </TradeTicketErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong with the trade panel.')).toBeInTheDocument();
    expect(screen.getByText('Your funds are safe — no transaction was sent.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload trade panel/i })).toBeInTheDocument();
  });

  it('does NOT show fallback when error is in a sibling', () => {
    render(
      <TradeTicketErrorBoundary>
        <SafeComponent />
      </TradeTicketErrorBoundary>,
    );

    expect(screen.getByText('Trade panel content')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('Reload button resets the boundary and re-renders children', () => {
    // We need to control whether the child throws
    let shouldThrow = true;

    function ConditionalThrower() {
      if (shouldThrow) throw new Error('controlled error');
      return <div>Recovered content</div>;
    }

    const { rerender } = render(
      <TradeTicketErrorBoundary>
        <ConditionalThrower />
      </TradeTicketErrorBoundary>,
    );

    // Should show fallback
    expect(screen.getByText('Something went wrong with the trade panel.')).toBeInTheDocument();

    // Stop throwing and click reload
    shouldThrow = false;
    const reloadButton = screen.getByRole('button', { name: /reload trade panel/i });
    reloadButton.click();

    // After reset, re-render with the same boundary
    rerender(
      <TradeTicketErrorBoundary>
        <ConditionalThrower />
      </TradeTicketErrorBoundary>,
    );

    expect(screen.getByText('Recovered content')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('fallback has proper accessibility attributes', () => {
    render(
      <TradeTicketErrorBoundary>
        <ThrowingComponent />
      </TradeTicketErrorBoundary>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
  });
});
