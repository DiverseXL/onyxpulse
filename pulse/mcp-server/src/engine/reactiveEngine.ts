/**
 * Event-driven reactive engine for binary market pools.
 *
 * Observes live market state — order-book changes (as a proxy for fill
 * activity) and on-chain status transitions — and fires callbacks when
 * notable events occur. Designed to be the "brain" behind any future UI
 * or agent that needs to react to market activity without taking action itself.
 *
 * **Pure observer** — never places orders, redeems, or modifies state.
 *
 * Convention: import from src/engine/index.ts, never from this file directly.
 */
import type { Address } from "viem";
import type {
  BinaryMarket,
  BinaryMarketStatus,
  SomniaMarketsClient,
} from "@somnia-chain/markets-sdk";

import { watchOrderBook, type OrderBookSnapshot } from "./orderbook.js";
import { getOnChainMarketStatus } from "./statusGate.js";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Handlers the caller can provide for reactive events. */
export interface ReactiveEngineHandlers {
  /**
   * Fires when the order book changes in a way that suggests a fill occurred.
   *
   * NOTE: The SDK does not expose a dedicated fill-level watch — this is
   * detected by diffing successive order-book snapshots (quantity changes at
   * the best bid/ask level). True fill-level events may need a dedicated SDK
   * watch if one becomes available in the future.
   *
   * @param book - The latest order-book snapshot after the change.
   */
  onFill?: (book: OrderBookSnapshot) => void;

  /**
   * Fires when the on-chain market status changes.
   *
   * @param newStatus - The new BinaryMarketStatus string.
   */
  onStatusChange?: (newStatus: BinaryMarketStatus) => void;

  /**
   * Fires when the market reaches a terminal resolved state (Resolved or Voided).
   *
   * @param market - The BinaryMarket row (fetched from the live store).
   */
  onResolved?: (market: BinaryMarket) => void;
}

/** The handle returned by createReactiveEngine. */
export interface ReactiveEngineHandle {
  /** Stops all watches, polls, and timers. No further callbacks fire. */
  stop: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Polling interval for on-chain status checks (milliseconds). */
const STATUS_POLL_INTERVAL_MS = 8_000;

// ─── Export ──────────────────────────────────────────────────────────────────

/**
 * Create a reactive engine that watches a binary pool for activity.
 *
 * Combines two observation strategies:
 * 1. **Order-book watch** via `watchOrderBook` — detects book changes that
 *    proxy for fill activity (see `onFill` handler docs for caveats).
 * 2. **Status polling** via `getOnChainMarketStatus` at an 8-second interval
 *    — detects lifecycle transitions (Trading → Locked → Settling → Resolved).
 *
 * The engine is a **pure observer**: it fires callbacks but never takes
 * action (no orders, no redemptions, no state mutations).
 *
 * @param client - SomniaMarketsClient instance.
 * @param pool - The binary pool address to observe.
 * @param marketId - The bytes32 market id (for status polling).
 * @param ownerAddress - The trader's wallet address (reserved for future
 *   owner-scoped observations; currently unused but included so the engine
 *   can later filter fills to the owner's orders).
 * @param handlers - Callbacks for fill, status-change, and resolution events.
 * @returns A handle with a `stop()` method that tears down all resources.
 */
export function createReactiveEngine(
  client: SomniaMarketsClient,
  pool: Address,
  marketId: string,
  ownerAddress: Address,
  handlers: ReactiveEngineHandlers,
): ReactiveEngineHandle {
  let stopped = false;
  let lastBestBid: string | null = null;
  let lastBestAsk: string | null = null;
  let lastStatus: BinaryMarketStatus | null = null;
  let statusPollTimer: ReturnType<typeof setInterval> | null = null;

  // ── Book watch ────────────────────────────────────────────────────────────
  // Use watchOrderBook to get live book updates. We diff successive snapshots
  // to detect fill-like activity (quantity changes at the best level).
  //
  // NOTE: True fill-level events may need a dedicated SDK watch if one exists.
  // The current approach diffs book snapshots — a reasonable proxy for fills
  // but not perfectly equivalent (e.g. a limit order being placed at the best
  // level also changes quantity without a fill).
  const unsubBook = watchOrderBook(
    client,
    pool,
    6, // TODO: read from market.quoteDecimals when market is available
    (book: OrderBookSnapshot) => {
      if (stopped) return;

      // Detect fill-like activity: compare best bid/ask with previous snapshot.
      // A change in best-level quantities suggests a fill or cancellation.
      if (lastBestBid !== null && lastBestAsk !== null) {
        const bidChanged = book.bestBid !== lastBestBid;
        const askChanged = book.bestAsk !== lastBestAsk;

        if (bidChanged || askChanged) {
          handlers.onFill?.(book);
        }
      }

      lastBestBid = book.bestBid;
      lastBestAsk = book.bestAsk;
    },
  );

  // ── Status poll ───────────────────────────────────────────────────────────
  // Poll on-chain status at a fixed interval. Fires onStatusChange when the
  // status transitions, and onResolved when it reaches Resolved or Voided.
  //
  // Uses the 8-second interval from the demo-lifecycle polling pattern.
  async function pollStatus(): Promise<void> {
    if (stopped) return;

    try {
      const newStatus = await getOnChainMarketStatus(client, marketId);

      if (stopped) return; // Re-check after async gap.

      if (lastStatus !== null && newStatus !== lastStatus) {
        handlers.onStatusChange?.(newStatus);

        // Fire onResolved when entering a terminal state.
        if (newStatus === "Resolved" || newStatus === "Voided") {
          const market = await client.getBinaryMarket(marketId);
          if (!stopped && market) {
            handlers.onResolved?.(market);
          }
        }
      }

      lastStatus = newStatus;
    } catch {
      // Status poll errors are non-fatal — log and continue.
      // The next poll will retry.
    }
  }

  // Kick off the initial poll, then set up the interval.
  void pollStatus();
  statusPollTimer = setInterval(() => {
    void pollStatus();
  }, STATUS_POLL_INTERVAL_MS);

  // ── Stop ──────────────────────────────────────────────────────────────────
  return {
    stop() {
      if (stopped) return;
      stopped = true;

      unsubBook();

      if (statusPollTimer !== null) {
        clearInterval(statusPollTimer);
        statusPollTimer = null;
      }
    },
  };
}
