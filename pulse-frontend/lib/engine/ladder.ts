/**
 * Ladder — structured multi-level quoting across binary market windows.
 *
 * Inspired by the official bot-kit's ec-laddering pattern but built on our own
 * engine modules. Places limit orders at multiple price levels on a single
 * pool, finds the next window to roll into, and ranks markets by opportunity.
 *
 * Convention: import from src/engine/index.ts, never from this file directly.
 */
import type { Address } from "viem";
import type {
  PlaceOrderResult,
  BinaryMarket,
  SomniaMarketsClient,
} from "@somnia-chain/markets-sdk";

import { placeLimitOrder } from "./trading.ts";
import { computeDefaultExpiry } from "./orderbook.ts";
import { getLiveBinaryMarkets, getUpcomingBinaryMarkets } from "./markets.ts";
import { getMarketVolume } from "./candles.ts";
import { PulseEngineError, mapSdkError } from "./errors.ts";

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A Trader instance bound to a signing key.
 * Created via `client.createTrader({ privateKey, decimals })`.
 */
type Trader = {
  placeOrder(params: {
    pool: Address;
    side: string;
    price: bigint;
    quantity: bigint;
    orderType: number;
    expireTimestampNs?: bigint;
  }): Promise<PlaceOrderResult>;
  cancelOrder(params: {
    pool: Address;
    orderId: bigint | string;
  }): Promise<unknown>;
};

/** A single rung in a ladder order. */
export interface LadderLevel {
  /** Side to place the order on. */
  side: "BUY_YES" | "SELL_YES" | "BUY_NO" | "SELL_NO";
  /** Limit price in human units (e.g. "0.62" for 62%). */
  humanPrice: string;
  /** Quantity in human units. */
  humanQuantity: string;
}

/** Per-level result: either a successful order or a caught error. */
export type LadderLevelResult =
  | { ok: true; result: PlaceOrderResult; level: LadderLevel }
  | { ok: false; error: PulseEngineError; level: LadderLevel };

// ─── Exports ─────────────────────────────────────────────────────────────────

/**
 * Place a set of limit orders at multiple price levels (a "ladder") on a
 * single binary pool.
 *
 * Each level is placed via {@link placeLimitOrder} with a default expiry
 * derived from `computeDefaultExpiry`. Failures at individual levels are
 * caught and returned in the result array — the function continues through
 * all levels even if one or more fail.
 *
 * @param trader - A Trader instance (from createTrader).
 * @param client - SomniaMarketsClient for on-chain status gating.
 * @param pool - The binary pool address.
 * @param market - The BinaryMarket row (used for expiry computation and decimals).
 * @param levels - Array of ladder rungs to place.
 * @returns Per-level results so the caller can inspect successes/failures.
 */
export async function placeLadderOrders(
  trader: Trader,
  client: SomniaMarketsClient,
  pool: Address,
  market: BinaryMarket,
  levels: LadderLevel[],
): Promise<LadderLevelResult[]> {
  const results: LadderLevelResult[] = [];

  for (const level of levels) {
    try {
      const result = await placeLimitOrder(client, trader as never, {
        pool,
        side: level.side,
        humanPrice: level.humanPrice,
        humanQuantity: level.humanQuantity,
        decimals: market.quoteDecimals,
        market,
      });
      results.push({ ok: true, result, level });
    } catch (error) {
      const ctx = `placeLadderOrders for pool ${pool} (side=${level.side}, price=${level.humanPrice})`;
      const pulseError =
        error instanceof PulseEngineError
          ? error
          : mapSdkError(error, ctx);
      results.push({ ok: false, error: pulseError, level });
    }
  }

  return results;
}

/**
 * Find the next available market window for the same asset after the current
 * one locks/expires.
 *
 * Searches live (Trading) and upcoming (Listed) binary markets for the same
 * asset, excluding the current market. Returns the first match sorted by
 * `expiry` ascending (soonest to expire = next window). Returns null if no
 * next window is available yet.
 *
 * @param client - SomniaMarketsClient instance.
 * @param currentMarketId - The bytes32 id of the current (expiring/expired) market.
 * @param asset - The asset symbol to filter on (e.g. "BTC", "ETH").
 * @returns The next available BinaryMarket, or null if none found.
 */
export async function rollToNextWindow(
  client: SomniaMarketsClient,
  currentMarketId: string,
  asset: "BTC" | "ETH",
): Promise<BinaryMarket | null> {
  const [live, upcoming] = await Promise.all([
    getLiveBinaryMarkets(client),
    getUpcomingBinaryMarkets(client),
  ]);

  // Combine and filter: same asset, not the current market.
  const candidates = [...live, ...upcoming].filter(
    (m) => m.asset === asset && m.marketId !== currentMarketId,
  );

  if (candidates.length === 0) return null;

  // Sort by expiry ascending — soonest-expiring first.
  candidates.sort((a, b) => {
    const expA = parseInt(a.expiry, 10);
    const expB = parseInt(b.expiry, 10);
    return expA - expB;
  });

  return candidates[0];
}

/**
 * Rank a list of binary markets by a simple opportunity heuristic.
 *
 * Combines time-remaining (longer = better, more room to trade) and
 * cumulative quote volume (higher = more real trading activity) into a
 * single score.
 *
 * Volume is obtained via {@link getMarketVolume}, which normalises the
 * market's `cumulativeQuoteVolume` by its `quoteDecimals`. We use a 60/40
 * time/volume weighting: time-remaining dominates because a market with
 * hours left offers more opportunity than one expiring soon regardless of
 * past volume. Volume at 40% rewards liquid markets where orders fill
 * quickly. The log-scaled volume dampens outlier dominance (a market with
 * 10× the volume of another should rank higher but not overwhelmingly so).
 *
 * @param client - SomniaMarketsClient instance (reserved for future use).
 * @param markets - Array of BinaryMarket rows to rank.
 * @returns Sorted copy (best opportunity first). Does not mutate input.
 */
export async function rankMarketsByOpportunity(
  _client: SomniaMarketsClient,
  markets: BinaryMarket[],
): Promise<BinaryMarket[]> {
  const nowSec = Math.floor(Date.now() / 1000);

  return [...markets]
    .map((m) => {
      const expirySec = parseInt(m.expiry, 10);
      const timeRemaining = Math.max(0, expirySec - nowSec);
      const volume = parseFloat(getMarketVolume(m)) || 0;

      // Score: time-remaining (60%) + cumulative quote volume (40%).
      // Both normalised roughly to 0–1 range relative to typical values.
      // timeRemaining: 0–3600s is a typical window, cap at 1.0
      // volume: log-scaled to dampen outlier dominance.
      const timeScore = Math.min(timeRemaining / 3600, 1.0);
      const volumeScore = volume > 0 ? Math.log10(volume + 1) / 8 : 0;
      const score = timeScore * 0.6 + volumeScore * 0.4;

      return { market: m, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.market);
}
