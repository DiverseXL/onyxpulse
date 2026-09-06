/**
 * Event-driven reactive engine for binary market pools.
 *
 * Observes live market state — real fill events and on-chain status
 * transitions — and fires callbacks when notable events occur. Designed to
 * be the "brain" behind any future UI or agent that needs to react to market
 * activity without taking action itself.
 *
 * **Pure observer** — never places orders, redeems, or modifies state.
 *
 * Convention: import from src/engine/index.ts, never from this file directly.
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
   * Fires when a real fill lands on the watched pool.
   *
   * Driven by the SDK's live trade tape (`OrderFilled` events materialized
   * into `store.fills` and surfaced via `getLiveFills`), not by diffing
   * order-book snapshots. Each call carries the fill's real price, quantity,
   * and aggressor side.
   *
   * @param fill - The fill that just landed on the pool.
   */
  onFill?: (fill: LiveFill) => void;

  /**
   * Fires when the on-chain market status changes.
   *
   * Push-based: the SDK's `watchMarket` already subscribes to
   * `BinaryMarketsModule.StatusChanged` / `Resolved` / `Voided` /
   * `MarketFinalized` over the existing WebSocket, so this fires the moment
   * the status is materialized into the local store — no polling latency.
   * A long-interval `getOnChainMarketStatus` fallback (60s) runs purely as a
   * safety net in case the WebSocket drops without erroring.
   *
   * @param newStatus - The new BinaryMarketStatus string.
   */
  onStatusChange?: (newStatus: BinaryMarketStatus) => void;

  /**
   * Fires when the market reaches a terminal resolved state (Resolved,
   * Voided, or Finalized).
   *
   * @param market - The BinaryMarket row from the live store.
   */
  onResolved?: (market: BinaryMarket) => void;
}

/** The handle returned by createReactiveEngine. */
export interface ReactiveEngineHandle {
  /** Stops all watches, polls, and timers. No further callbacks fire. */
  stop: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Fallback status-poll interval (ms). NOT the primary mechanism — the SDK's
 * `watchMarket` + `subscribeLive` push status changes the moment they land on
 * chain. This exists purely as a safety net for the unlikely case that the
 * WebSocket drops without erroring (the SDK's own heads-watchdog heals that,
 * but this is a belt-and-suspenders backstop).
 */
const STATUS_FALLBACK_POLL_MS = 60_000;

// ─── Export ──────────────────────────────────────────────────────────────────

/**
 * Create a reactive engine that watches a binary pool for activity.
 *
 * Uses two push-based observations:
 * 1. **Real fill watch** — opens `watchMarket(pool)` and subscribes to
 *    `client.subscribeLive()`. On every store change it reads
 *    `client.getLiveFills(pool)` and fires `onFill` for any fill id that is
 *    new since the last check. No order-book diffing.
 * 2. **Status watch** — the same `subscribeLive` subscription also fires when
 *    `StatusChanged` / `Resolved` / `Voided` / `MarketFinalized` land, and the
 *    engine reads the market's status from the live store
 *    (`getLiveMarketByAddress`) and fires `onStatusChange` / `onResolved` when
 *    it transitions. A 60-second `getOnChainMarketStatus` fallback poll runs as
 *    a safety net only.
 *
 * The engine is a **pure observer**: it fires callbacks but never takes
 * action (no orders, no redemptions, no state mutations).
 *
 * @param client - SomniaMarketsClient instance.
 * @param pool - The binary pool address to observe.
 * @param marketId - The bytes32 market id (for the fallback poll and the
 *   `getBinaryMarket` call in `onResolved`).
 * @param marketAddress - The on-chain BinaryMarket contract address (for
 *   `getLiveMarketByAddress`). When omitted the engine resolves it from the
 *   live store via the pool the first time a status event is needed.
 * @param ownerAddress - The trader's wallet address (reserved for future
 *   owner-scoped fill filtering; currently unused but accepted so the engine
 *   can later filter fills to the owner's orders without a signature change).
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

  // ── Fill state ─────────────────────────────────────────────────────────────

  /** Fill ids we have already handed to `onFill` (deduplication across commits). */
  const seenFillIds = new Set<string>();

  // ── Status state ───────────────────────────────────────────────────────────

  /** The last status we handed to `onStatusChange` (null = not established yet). */
  let lastStatus: BinaryMarketStatus | null = null;

  /** Used only by the 60s fallback poll. */
  let fallbackPollTimer: ReturnType<typeof setInterval> | null = null;

  // ── resolveMarketAddress ───────────────────────────────────────────────────

  /**
   * Return the live BinaryMarket address for this marketId (or null before the
   * watch hydrates). Cached after the first successful read so we don't keep
   * calling getLiveMarketByAddress on every subscribeLive fire.
   */
  // ── Fill watch (push-based, real fills) ────────────────────────────────────

  /**
   * On every store change, read the live fills for this pool and hand any
   * newly-seen ones to `onFill`. Deduplicates by fill id so re-attacks,
   * reconnect replays, and watch rehydration never double-fire.
   */
  function drainFills(): void {
    if (stopped) return;

    const fills = client.getLiveFills(pool.toLowerCase(), { limit: 40 });
    for (const f of fills) {
      if (seenFillIds.has(f.id)) continue;
      seenFillIds.add(f.id);
      handlers.onFill?.(f);
    }

    // Keep the seen-set bounded — older fills age out of getLiveFills anyway,
    // but a long-lived engine should not accumulate ids forever.
    if (seenFillIds.size > 500) {
      const toDelete = seenFillIds.size - 200;
      let removed = 0;
      for (const id of seenFillIds) {
        seenFillIds.delete(id);
        removed++;
        if (removed >= toDelete) break;
      }
    }
  }

  // ── Status watch (push-based, with fallback poll) ─────────────────────────

  /**
   * Read the market's status from the live store and fire status-change /
   * resolution handlers when it transitions. Called on every subscribeLive
   * fire (i.e. after every batch of chain events materialized into the store).
   */
  function drainStatus(): void {
    if (stopped) return;

    const market = client.getLiveMarketByPool(pool);
    if (market?.marketType !== "BINARY") return;

    const newStatus = market.status;
    if (!newStatus) return;

    if (lastStatus !== null && newStatus !== lastStatus) {
      handlers.onStatusChange?.(newStatus);

      if (
        newStatus === "Resolved" ||
        newStatus === "Voided" ||
        newStatus === "Finalized"
      ) {
        handlers.onResolved?.(market);
      }
    }

    lastStatus = newStatus;
  }

  /**
   * Safety-net poll: read status directly from chain via
   * `getOnChainMarketStatus` and fire if it differs from what the live store
   * last reported. Runs on a much longer interval than the old 8s poll — it
   * exists purely in case the WebSocket drops without erroring.
   */
  async function fallbackPollStatus(): Promise<void> {
    if (stopped) return;

    try {
      const newStatus = await getOnChainMarketStatus(client, marketId);

      if (stopped) return;

      // Only fire if the chain status differs from the last status we reported
      // (whether we reported it via the push path or a previous fallback).
      if (lastStatus !== null && newStatus !== lastStatus) {
        handlers.onStatusChange?.(newStatus);

        if (
          newStatus === "Resolved" ||
          newStatus === "Voided" ||
          newStatus === "Finalized"
        ) {
          const market = await client.getBinaryMarket(marketId);
          if (!stopped && market) {
            handlers.onResolved?.(market);
          }
        }

        lastStatus = newStatus;
      }
    } catch {
      // Non-fatal — the next fallback tick retries.
    }
  }

  // ── Wire up the subscribeLive push subscription ────────────────────────────

  // watchMarket hydrates the pool's snapshot and opens the chain-event
  // subscription that feeds fills + status events into the live store. It is
  // ref-counted and cheap to open — the same underlying subscription is shared
  // by every watcher on this pool.
  let watchHandle: { stop(): void } | null = null;
  let unsubLive: (() => void) | null = null;

  (async () => {
    try {
      watchHandle = await client.watchMarket(pool.toLowerCase());
    } catch (error) {
      console.error(
        `createReactiveEngine: watchMarket failed for pool ${pool}:`,
        error instanceof Error ? error.message : String(error),
      );
    }

    if (stopped) {
      watchHandle?.stop();
      return;
    }

    // subscribeLive fires after every batch of store changes — fills, status
    // events, order-book changes, everything. We use it as the single push
    // notch for both fill detection and status detection.
    unsubLive = client.subscribeLive(() => {
      if (stopped) return;
      drainFills();
      drainStatus();
    });

    // Deliver whatever is already in the store at subscribe time so the engine
    // does not wait for the next chain event to see existing fills / status.
    drainFills();
    drainStatus();
  })();

  // ── Fallback status poll (safety net only) ────────────────────────────────

  fallbackPollTimer = setInterval(() => {
    void fallbackPollStatus();
  }, STATUS_FALLBACK_POLL_MS);

  // ── Stop ──────────────────────────────────────────────────────────────────

  return {
    stop() {
      if (stopped) return;
      stopped = true;

      unsubLive?.();
      unsubLive = null;

      if (watchHandle !== null) {
        watchHandle.stop();
        watchHandle = null;
      }

      if (fallbackPollTimer !== null) {
        clearInterval(fallbackPollTimer);
        fallbackPollTimer = null;
      }
    },
  };
}
