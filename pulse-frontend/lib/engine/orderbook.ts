/**
 * Order-book queries and live streaming for binary markets.
 *
 * Wraps the SDK's on-chain order-book reads and live-store streaming.
 * All prices/quantities are converted to human-readable strings — never
 * expose raw bigints to the UI layer.
 *
 * Convention: import from src/engine/index.ts, never from this file directly.
 */
import type { Address } from "viem";
import type {
  BinaryMarket,
  SomniaMarketsClient,
} from "@somnia-chain/markets-sdk";
import type { BinaryOrderBook, BookLevel } from "@somnia-chain/markets-sdk";

import { fromBigintAmount } from "./units.ts";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Human-readable order-book level (prices and quantities as decimal strings). */
export interface OrderBookLevel {
  price: string;
  quantity: string;
}

/** Human-readable order-book snapshot with best bid/ask and full depth. */
export interface OrderBookSnapshot {
  bestBid: string;
  bestAsk: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

// ─── Snapshot ────────────────────────────────────────────────────────────────

/**
 * Fetch a one-shot order-book snapshot for a binary pool.
 *
 * Reads the on-chain resting book via the SDK's `getBinaryOrderBook`, then
 * converts all bigint prices/quantities to human-readable strings using the
 * market's actual `quoteDecimals` — never hardcodes decimals.
 *
 * Returns the YES-side book (bids = YES bids, asks = YES asks). For the full
 * 4-sided view (including NO sides), use the SDK directly.
 *
 * @param client - SomniaMarketsClient instance.
 * @param pool - The binary pool address.
 * @param decimals - The market's quoteDecimals (from BinaryMarket.quoteDecimals).
 * @param depth - Max price levels per side (default 10).
 */
export async function getOrderBookSnapshot(
  client: SomniaMarketsClient,
  pool: Address,
  decimals: number,
  depth: number = 10,
): Promise<OrderBookSnapshot> {
  try {
    const book: BinaryOrderBook = await client.getBinaryOrderBook(pool, {
      depth,
      decimals,
    });

    return formatBook(book, decimals);
  } catch (error) {
    throw new Error(
      `getOrderBookSnapshot failed for pool ${pool}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ─── Live watch ──────────────────────────────────────────────────────────────

/**
 * Stream live order-book updates for a binary pool.
 *
 * Opens the SDK's ref-counted watch on the pool and subscribes to store
 * changes. On every update, reads the live book via `getLiveBinaryOrderBook`
 * and delivers it through the callback as human-readable strings.
 *
 * The watch is ref-counted: opening the same pool twice shares one
 * subscription. Calling the returned unsubscribe function releases this
 * handle's reference — the underlying subscription is torn down when the
 * last handle stops.
 *
 * @param client - SomniaMarketsClient instance.
 * @param pool - The binary pool address.
 * @param decimals - The market's quoteDecimals.
 * @param onUpdate - Callback receiving the latest OrderBookSnapshot.
 * @param depth - Max price levels per side (default 10).
 * @returns An unsubscribe function that stops the watch.
 */
export function watchOrderBook(
  client: SomniaMarketsClient,
  pool: Address,
  decimals: number,
  onUpdate: (book: OrderBookSnapshot) => void,
  depth: number = 10,
): () => void {
  let stopped = false;
  let unsubLive: (() => void) | null = null;
  let watchHandle: { stop(): void } | null = null;

  // Start the watch (async) and subscribe to store changes.
  (async () => {
    try {
      watchHandle = await client.watchMarket(pool);

      // If stop() was called while the watch was resolving, clean up immediately.
      if (stopped) {
        watchHandle.stop();
        return;
      }

      // Subscribe to store changes — fires on every batch of live events.
      unsubLive = client.subscribeLive(() => {
        if (stopped) return;
        const book = client.getLiveBinaryOrderBook(pool, { depth });
        onUpdate(formatBook(book, decimals));
      });

      // Deliver the initial snapshot.
      const initialBook = client.getLiveBinaryOrderBook(pool, { depth });
      onUpdate(formatBook(initialBook, decimals));
    } catch (error) {
      // Watch failed to start — nothing to unsubscribe from.
      console.error(`watchOrderBook failed for pool ${pool}:`, error);
    }
  })();

  // Return the unsubscribe function.
  return () => {
    if (stopped) return;
    stopped = true;
    unsubLive?.();
    watchHandle?.stop();
  };
}

// ─── Default expiry ──────────────────────────────────────────────────────────

/**
 * Buffer in seconds added to the current time for the default limit-order
 * expiry. 60 seconds gives a brief requote window — long enough for normal
 * network latency, short enough that stale orders don't linger.
 *
 * This is deliberately SHORT. DreamDEX binary orders enforce
 * `0 < expireNs <= pool.marketExpiryNs` — the SDK already defaults
 * `expireTimestampNs` to the pool's market expiry when omitted. This
 * constant and `computeDefaultExpiry` exist for callers who want an
 * *explicit* short-lived expiry (e.g. a limit order that should self-clean
 * quickly if not filled) rather than resting until market end.
 */
export const DEFAULT_ORDER_EXPIRY_BUFFER_SECONDS = 60;

/**
 * Minimum time before market expiry (in seconds) required for a safe order
 * window. If the market expires within this many seconds, no order can be
 * safely placed — the order would be rejected by the pool.
 */
const MIN_SAFE_SECONDS_BEFORE_EXPIRY = 5;

/**
 * Compute a default expiry timestamp (nanoseconds) for a limit order.
 *
 * Strategy: `now + DEFAULT_ORDER_EXPIRY_BUFFER_SECONDS`, clamped to never
 * exceed the market's own expiry timestamp minus a small safety margin.
 *
 * This prevents `OrderExpiryBeyondMarket` reverts when the market is
 * expiring soon (e.g. within the 60s default buffer).
 *
 * If the market is expiring so soon that no safe order window exists
 * (fewer than MIN_SAFE_SECONDS_BEFORE_EXPIRY remaining), the function
 * throws a clear error rather than letting the contract reject opaquely.
 *
 * @param market - The BinaryMarket (used to read the `expiry` field for
 *   clamping — unix seconds as a string).
 * @returns Expiry in nanoseconds (bigint).
 * @throws If the market is expiring too soon for any safe order window.
 */
export function computeDefaultExpiry(market: BinaryMarket): bigint {
  const nowNs = BigInt(Date.now()) * 1_000_000n;
  const bufferNs =
    BigInt(DEFAULT_ORDER_EXPIRY_BUFFER_SECONDS) * 1_000_000_000n;
  const computedExpiry = nowNs + bufferNs;

  // Parse market expiry (unix seconds string → nanoseconds).
  const marketExpirySec = BigInt(market.expiry);
  const marketExpiryNs = marketExpirySec * 1_000_000_000n;

  // Safety margin: ensure the order expires at least MIN_SAFE_SECONDS
  // before the market itself locks.
  const safetyMarginNs =
    BigInt(MIN_SAFE_SECONDS_BEFORE_EXPIRY) * 1_000_000_000n;
  const maxSafeExpiry = marketExpiryNs - safetyMarginNs;

  // If no safe window remains, fail fast with a clear error.
  if (maxSafeExpiry <= nowNs) {
    const secondsLeft =
      Number((marketExpiryNs - nowNs) / 1_000_000_000n);
    throw new Error(
      `Market expiring too soon to place a safe order ` +
        `(${secondsLeft.toFixed(1)}s remaining, ` +
        `minimum: ${MIN_SAFE_SECONDS_BEFORE_EXPIRY}s). ` +
        `Market expiry: ${market.expiry}s.`,
    );
  }

  // Clamp: never exceed the market's expiry minus the safety margin.
  return computedExpiry > maxSafeExpiry ? maxSafeExpiry : computedExpiry;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Convert a BinaryOrderBook (raw bigints) to human-readable strings.
 */
function formatBook(
  book: BinaryOrderBook,
  decimals: number,
): OrderBookSnapshot {
  const bids = book.yesBids.map((l) => formatLevel(l, decimals));
  const asks = book.yesAsks.map((l) => formatLevel(l, decimals));

  return {
    bestBid: bids.length > 0 ? bids[0].price : "0",
    bestAsk: asks.length > 0 ? asks[0].price : "0",
    bids,
    asks,
  };
}

function formatLevel(level: BookLevel, decimals: number): OrderBookLevel {
  return {
    price: fromBigintAmount(level.price, decimals),
    quantity: fromBigintAmount(level.quantity, decimals),
  };
}
