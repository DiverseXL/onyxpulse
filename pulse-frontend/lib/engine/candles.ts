/**
 * Candles & volume — thin wrappers around the SDK's OHLCV candle module and
 * market listing, plus a volume-normalisation helper.
 *
 * Convention: import from src/engine/index.ts, never from this file directly.
 */

import type { Address } from "viem";
import type { BinaryMarket, SomniaMarketsClient } from "@somnia-chain/markets-sdk";

import { fromBigintAmount } from "./units.ts";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Re-export the SDK's Candle type for downstream consumers. */
export type Candle = {
  bucketStart: string;
  openPrice: string;
  high: string;
  low: string;
  closePrice: string;
  baseVolume: string;
  quoteVolume: string;
  tradeCount: number;
};

// ─── Exports ─────────────────────────────────────────────────────────────────

/**
 * Fetch OHLCV candles for a binary pool.
 *
 * Thin wrapper over the SDK's `client.getCandles` — the signature matches
 * the client method directly (pool address + interval + pagination opts).
 *
 * @param client - SomniaMarketsClient instance.
 * @param pool - The binary pool address.
 * @param intervalSec - Bucket size in seconds (must be one of the indexer's
 *   rollup intervals: 60, 300, 900, 3600, 14400, 86400).
 * @param limit - Maximum number of candles to return (default 500).
 * @returns Array of Candle objects, oldest first.
 */
export async function getMarketCandles(
  client: SomniaMarketsClient,
  pool: Address,
  intervalSec: number,
  limit?: number,
): Promise<Candle[]> {
  return client.getCandles(pool, intervalSec, limit ? { limit } : undefined);
}

/**
 * List binary markets ordered by cumulative quote volume (highest first).
 *
 * Wraps `client.listBinaryMarkets` with `orderBy: "volume"`, which sorts by
 * `cumulativeQuoteVolume` descending — the heaviest-traded markets first.
 *
 * @param client - SomniaMarketsClient instance.
 * @param opts.limit - Maximum number of markets to return (default 50).
 * @returns Array of BinaryMarket rows, volume-sorted.
 */
export async function listBinaryMarketsByVolume(
  client: SomniaMarketsClient,
  opts?: { limit?: number },
): Promise<BinaryMarket[]> {
  const filter: { orderBy: "volume"; limit?: number } = { orderBy: "volume" };
  if (opts?.limit !== undefined) filter.limit = opts.limit;
  return client.listBinaryMarkets(filter);
}

/**
 * Normalise a binary market's cumulative quote volume to a human-readable string.
 *
 * Reads `cumulativeQuoteVolume` (raw, in the same units as the collateral) from
 * the market row and divides by `10^quoteDecimals` via {@link fromBigintAmount}.
 * This correctly handles the 6dp TestUSDC vs 18dp USDso difference by reading
 * `quoteDecimals` from the market itself — never hardcoded.
 *
 * @param market - A BinaryMarket row (carries `cumulativeQuoteVolume` and `quoteDecimals`).
 * @returns Human-readable volume string (e.g. "12345.67").
 */
export function getMarketVolume(market: BinaryMarket): string {
  const raw = BigInt(market.cumulativeQuoteVolume);
  return fromBigintAmount(raw, market.quoteDecimals);
}
