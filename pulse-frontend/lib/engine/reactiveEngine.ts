/**
 * Event-driven reactive engine for binary market pools.
 *
 * Observes live market state — real fill events and on-chain status transitions
 * — and fires callbacks when notable events occur. Designed to be the "brain"
 * behind any future UI or agent that needs to react to market activity without
 * taking action itself.
 *
 * **Pure observer** — never places orders, redeems, or modifies state.
 *
 * Convention: import from lib/engine/index.ts, never from this file directly.
 */
import type { Address } from "viem";
import type {
  BinaryMarket,
  BinaryMarketStatus,
  LiveFill,
  SomniaMarketsClient,
} from "@somnia-chain/markets-sdk";

import { getOnChainMarketStatus } from "./statusGate.ts";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Handlers the caller can provide for reactive events. */
export interface ReactiveEngineHandlers {
  /**
   * Fires when a new fill is detected on the pool.
   *
   * Uses the SDK's real fill tracking: `client.getLiveFills(pool)` inside the
   * `client.subscribeLive()` push loop. Fills are detected the moment the
   * WebSocket event is materialized into the live store — no order-book
   * diffing, no polling.
   *
   * @param fill - The newest LiveFill from the store at the time of detection.
   */
  onFill?: (fill: LiveFill) => void;

  /**
   * Fires when the on-chain market status changes.
   *
   * Detected via the push-based `subscribeLive` store listener (primary path)
   * and verified by the 60 s fallback poll (safety net for silent WS drops).
   *
   * @param newStatus - The new BinaryMarketStatus string.
   */
  onStatusChange?: (newStatus: BinaryMarketStatus) => void;

  /**
   * Fires when the market reaches a terminal resolved state (Resolved or Voided).
   *
   * @param market - The BinaryMarket row fetched from the SDK at resolution time.
   */
  onResolved?: (market: BinaryMarket) => void;
}

/** The handle returned by createReactiveEngine. */
export interface ReactiveEngineHandle {
  /** Stops all watches, subscriptions, and timers. No further callbacks fire. */
  stop: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Fallback poll interval for on-chain status (milliseconds).
 *
 * Intentionally long — exists ONLY as a safety net in case the WebSocket
 * connection silently drops without erroring. The primary detection path is
 * push-based via `client.subscribeLive()` and adds zero polling overhead
 * during a healthy session. At 60 s this fallback has negligible CPU/network
 * cost.
 */
const STATUS_FALLBACK_POLL_MS = 60_000;

// ─── Export ──────────────────────────────────────────────────────────────────

/**
 * Create a reactive engine that watches a binary pool for activity.
 *
 * Uses two push-based mechanisms (no primary polling):
 *
 * 1. **Fill detection** — `client.subscribeLive()` + `client.getLiveFills(pool)`.
 *    Fires `onFill` with a real `LiveFill` object the moment the WebSocket
 *    stream materializes a new fill into the local store. Replaces the old
 *    order-book-diffing heuristic with direct SDK fill tracking.
 *
 * 2. **Status detection** — `client.subscribeLive()` +
 *    `client.getLiveMarketByPool(pool)`. Fires `onStatusChange` / `onResolved`
 *    the instant a status-changing event lands in the store, with zero latency.
 *
 * A 60-second fallback poll to `getOnChainMarketStatus` is kept as a safety
 * net in case the WebSocket silently drops. It adds no overhead during a
 * healthy session.
 *
 * Mirrors the `watchOrderBook` pattern exactly: `watchMarket` (ref-counted,
 * so sharing one WebSocket subscription when both are active on the same pool)
 * followed by `subscribeLive` for store notifications.
 *
 * @param client       - SomniaMarketsClient instance.
 * @param pool         - The binary pool address to observe.
 * @param marketId     - The bytes32 market id (for the fallback status poll).
 * @param ownerAddress - The trader's wallet address (reserved for future
 *   owner-scoped fill filtering via `getLiveUserFills`; currently unused).
 * @param handlers     - Callbacks for fill, status-change, and resolution events.
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
  let lastStatus: BinaryMarketStatus | null = null;
  const seenFillIds = new Set<string>();
  let statusFallbackTimer: ReturnType<typeof setInterval> | null = null;
  let unsubLive: (() => void) | null = null;
  let watchHandle: { stop(): void } | null = null;

  // ── Store drain ───────────────────────────────────────────────────────────
  //
  // Called synchronously by subscribeLive on every store commit (WebSocket
  // push event). Reads fresh snapshots directly from the in-memory store —
  // no round trips, no polling.

  function drainStore(): void {
    if (stopped) return;

    // ── Fill detection ──────────────────────────────────────────────────────
    // getLiveFills returns fills newest-first. Compare the top fill id against
    // the last one processed — fires only for genuinely new fills, not
    // re-emissions of the same store snapshot.
    if (handlers.onFill) {
      for (const fill of client.getLiveFills(pool, { limit: 40 })) {
        if (seenFillIds.has(fill.id)) continue;
        seenFillIds.add(fill.id);
        handlers.onFill(fill);
      }
    }

    // ── Status detection ────────────────────────────────────────────────────
    // LiveMarket = SpotMarket | BinaryMarket (store.ts: `type LiveMarket = Market`).
    // BinaryMarket carries `status: BinaryMarketStatus`.
    const liveMarket = client.getLiveMarketByPool(pool) as
      | (BinaryMarket & { status?: BinaryMarketStatus })
      | null;
    const newStatus = liveMarket?.status ?? null;

    if (newStatus !== null && lastStatus !== null && newStatus !== lastStatus) {
      handlers.onStatusChange?.(newStatus);

      if (
        newStatus === "Resolved" ||
        newStatus === "Voided" ||
        newStatus === "Finalized"
      ) {
        // getBinaryMarket is async — fire and forget, guard against stop race.
        client
          .getBinaryMarket(marketId)
          .then((market) => {
            if (!stopped && market) handlers.onResolved?.(market);
          })
          .catch(() => {
            // Non-fatal — resolution fetch failure does not break the engine.
          });
      }
    }

    if (newStatus !== null) lastStatus = newStatus;
  }

  // ── Fallback status poll ──────────────────────────────────────────────────
  //
  // Runs every 60 s. Safety net only — covers silent WebSocket drops.
  // `lastStatus` guards against double-firing the same transition if both
  // the push path and the fallback poll catch it.

  async function fallbackPollStatus(): Promise<void> {
    if (stopped) return;
    try {
      const newStatus = await getOnChainMarketStatus(client, marketId);
      if (stopped) return;

      if (lastStatus !== null && newStatus !== lastStatus) {
        handlers.onStatusChange?.(newStatus);

        if (
          newStatus === "Resolved" ||
          newStatus === "Voided" ||
          newStatus === "Finalized"
        ) {
          const market = await client.getBinaryMarket(marketId);
          if (!stopped && market) handlers.onResolved?.(market);
        }
      }

      lastStatus = newStatus;
    } catch {
      // Non-fatal — the push path is the primary mechanism.
    }
  }

  // ── Start ────────────────────────────────────────────────────────────────
  //
  // Mirrors watchOrderBook exactly:
  //   1. watchMarket(pool)     — starts / joins the ref-counted live tail
  //   2. Seed cursors          — prime lastStatus + lastFillId from current store
  //   3. subscribeLive(drain)  — register the store push listener
  //   4. Initial fallback poll — seed lastStatus from chain if store is empty
  //   5. Schedule 60 s safety  — fallback interval

  (async () => {
    try {
      watchHandle = await client.watchMarket(pool);

      if (stopped) {
        watchHandle.stop();
        return;
      }

      // Seed cursors so the first drainStore() only fires for events that
      // arrive AFTER this point (not for pre-existing store state).
      const initialMarket = client.getLiveMarketByPool(pool) as
        | (BinaryMarket & { status?: BinaryMarketStatus })
        | null;
      lastStatus = initialMarket?.status ?? null;

      for (const fill of client.getLiveFills(pool, { limit: 40 })) {
        seenFillIds.add(fill.id);
      }

      // Primary push subscription.
      unsubLive = client.subscribeLive(drainStore);

      // One immediate fallback poll to seed lastStatus from chain in case the
      // live store doesn't have this market yet (race between watchMarket
      // resolving and the first store commit arriving).
      void fallbackPollStatus();

      // 60 s safety-net fallback.
      statusFallbackTimer = setInterval(() => {
        void fallbackPollStatus();
      }, STATUS_FALLBACK_POLL_MS);
    } catch (error) {
      console.error(
        `createReactiveEngine: watchMarket failed for pool ${pool}:`,
        error,
      );
    }
  })();

  // ── Stop ──────────────────────────────────────────────────────────────────
  return {
    stop() {
      if (stopped) return;
      stopped = true;

      unsubLive?.();
      watchHandle?.stop();

      if (statusFallbackTimer !== null) {
        clearInterval(statusFallbackTimer);
        statusFallbackTimer = null;
      }
    },
  };
}
