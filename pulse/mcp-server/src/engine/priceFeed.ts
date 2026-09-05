/**
 * Price feed queries and live streaming for BTC/ETH index prices.
 *
 * Wraps the SDK's on-chain EMA oracle price feed — a Hasura-backed service
 * that streams real-time spot + EMA mark prices for each tracked asset.
 *
 * Convention: import from src/engine/index.ts, never from this file directly.
 */
import type { SomniaMarketsClient, LivePrice } from "@somnia-chain/markets-sdk";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Supported asset symbols. */
export type PriceAsset = "BTC" | "ETH";

/**
 * Human-readable spot price with chain timestamp.
 * All prices are converted from the SDK's 1e18-scaled raw format to
 * human-readable decimal strings.
 */
export interface SpotPrice {
  /** Price in human units (e.g. "65432.10" for BTC). */
  price: string;
  /** Block timestamp of the latest tick — unix seconds, chain time. */
  timestamp: number;
}

// ─── One-shot price read ─────────────────────────────────────────────────────

/**
 * Fetch the current spot price for an asset in one HTTP round-trip.
 *
 * Uses `client.fetchPrice(asset)` — a direct Hasura query that does NOT
 * require a live watch to be active. Returns the price from the on-chain
 * EMA oracle's latest tick.
 *
 * Price feed decimals are always 18 (confirmed from `PRICE_FEED_DECIMALS`).
 * The raw 1e18-scaled integer is converted to a human-readable string
 * (e.g. raw `65432100000000000000000` → `"65432.1"`).
 *
 * @param client - SomniaMarketsClient instance.
 * @param asset - "BTC" or "ETH".
 * @returns Human-readable price + chain timestamp, or null if no observations yet.
 */
export async function getSpotPrice(
  client: SomniaMarketsClient,
  asset: PriceAsset,
): Promise<SpotPrice | null> {
  try {
    const live: LivePrice | null = await client.fetchPrice(asset);
    if (!live) return null;

    return formatLivePrice(live);
  } catch (error) {
    throw new Error(
      `getSpotPrice failed for ${asset}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ─── Live price subscription ─────────────────────────────────────────────────

/**
 * Stream live spot price updates for an asset.
 *
 * Opens the SDK's ref-counted watch on the asset (via `client.watchPrice`)
 * and subscribes to price-store changes. On every update, reads the live
 * price from the store and delivers it through the callback as a
 * human-readable string.
 *
 * The watch is ref-counted: watching the same asset twice shares one
 * subscription. Calling the returned unsubscribe function releases this
 * handle's reference — the underlying subscription is torn down when the
 * last handle stops.
 *
 * Requires `priceFeed` to be configured on the client (done automatically
 * by `createPulseClient` with `SOMNIA_TESTNET_PRICE_FEED`).
 *
 * @param client - SomniaMarketsClient instance.
 * @param asset - "BTC" or "ETH".
 * @param onUpdate - Callback receiving the latest SpotPrice.
 * @returns An unsubscribe function that stops the watch.
 */
export function watchSpotPrice(
  client: SomniaMarketsClient,
  asset: PriceAsset,
  onUpdate: (price: SpotPrice) => void,
): () => void {
  let stopped = false;
  let watchHandle: { stop(): void } | null = null;
  let unsubPrices: (() => void) | null = null;

  // Start the watch (async) and subscribe to price-store changes.
  (async () => {
    try {
      watchHandle = await client.watchPrice(asset);

      // If stop() was called while the watch was resolving, clean up immediately.
      if (stopped) {
        watchHandle.stop();
        return;
      }

      // Subscribe to price-store changes — fires on every batch of live ticks.
      unsubPrices = client.subscribePrices(() => {
        if (stopped) return;
        const live = client.getLivePrice(asset);
        if (live) {
          onUpdate(formatLivePrice(live));
        }
      });

      // Deliver the initial snapshot if available.
      const initial = client.getLivePrice(asset);
      if (initial) {
        onUpdate(formatLivePrice(initial));
      }
    } catch (error) {
      console.error(`watchSpotPrice failed for ${asset}:`, error);
    }
  })();

  // Return the unsubscribe function.
  return () => {
    if (stopped) return;
    stopped = true;
    unsubPrices?.();
    watchHandle?.stop();
  };
}

// ─── Fair probability heuristic ──────────────────────────────────────────────

/**
 * Default assumed annualized volatility for the fair-value heuristic.
 * 40% is a reasonable mid-range assumption for crypto assets like BTC/ETH.
 *
 * This is a tunable constant, not a market-observed parameter.
 */
const DEFAULT_ANNUALIZED_VOLATILITY = 0.40;

/**
 * Estimate the fair probability that an event market resolves YES, given the
 * current spot price, strike price, and time remaining.
 *
 * ## ⚠️ DISCLAIMER — HEURISTIC ONLY
 *
 * This is a SIMPLIFIED heuristic for UI display purposes ONLY. It uses a
 * basic Black-Scholes-inspired normal CDF approximation with a fixed
 * volatility assumption (40% annualized). It is:
 *
 * - **NOT** a pricing tool — do not use it to set or validate order prices.
 * - **NOT** an arbitrage signal — it ignores order-book depth, fees, and
 *   market microstructure.
 * - **NOT financial advice** — it should never be used to gate trades or
 *   inform investment decisions.
 *
 * The output is a rough probability estimate (0.0 to 1.0) intended to give
 * users a quick visual reference for "how far is spot from strike relative
 * to time remaining." Treat it as a display aid, not a trading signal.
 *
 * ## Model
 *
 * Uses a simplified normal CDF: P(YES) = Φ(d) where
 *   d = ln(spot / strike) / (σ √T)
 *
 * - `spot`: current index price (human units)
 * - `strike`: the market's strike price (human units)
 * - `T`: time to expiry in years (secondsRemaining / seconds_per_year)
 * - `σ`: assumed annualized volatility (40%)
 *
 * For "above strike → YES wins" markets (the standard DreamDEX model).
 *
 * @param spotPrice - Current spot price as a decimal string (e.g. "65432.10").
 * @param strikePrice - Strike price as a decimal string (e.g. "65000").
 * @param secondsRemaining - Seconds until market expiry. If <= 0, the market
 *   has expired and the probability collapses to 0 or 1 based on spot vs strike.
 * @returns Fair probability estimate (0.0 to 1.0).
 */
export function getFairProbability(
  spotPrice: string,
  strikePrice: string,
  secondsRemaining: number,
): number {
  const spot = Number(spotPrice);
  const strike = Number(strikePrice);

  // Edge case: invalid inputs → return 0.5 (maximum uncertainty).
  if (!Number.isFinite(spot) || !Number.isFinite(strike) || spot <= 0 || strike <= 0) {
    return 0.5;
  }

  // Edge case: market has expired or is expiring — resolve deterministically.
  if (secondsRemaining <= 0) {
    return spot >= strike ? 1.0 : 0.0;
  }

  // Convert seconds to years (365.25 days).
  const yearsRemaining = secondsRemaining / (365.25 * 24 * 60 * 60);

  // Log-moneyness: ln(spot / strike).
  const logMoneyness = Math.log(spot / strike);

  // Normalized distance: d = ln(spot/strike) / (σ * √T).
  const sigma = DEFAULT_ANNUALIZED_VOLATILITY;
  const d = logMoneyness / (sigma * Math.sqrt(yearsRemaining));

  // Standard normal CDF approximation (Abramowitz & Stegun approximation).
  return normalCDF(d);
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Convert a LivePrice (1e18-scaled raw) to a human-readable SpotPrice.
 */
function formatLivePrice(live: LivePrice): SpotPrice {
  return {
    price: live.raw.price !== "0"
      ? format1e18(live.raw.price)
      : "0",
    timestamp: live.blockTimestamp,
  };
}

/**
 * Convert a 1e18-scaled integer string to a human-readable decimal string.
 * Strips trailing zeros but preserves at least one decimal place for prices
 * like "1.0".
 */
function format1e18(raw: string): string {
  // Pad or trim to 18 decimal places.
  const negative = raw.startsWith("-");
  const abs = negative ? raw.slice(1) : raw;
  const padded = abs.padStart(19, "0"); // 1 digit before decimal + 18 decimals
  const intPart = padded.slice(0, padded.length - 18);
  const fracPart = padded.slice(padded.length - 18);

  // Strip trailing zeros from fractional part, but keep at least one digit.
  const fracStripped = fracPart.replace(/0+$/, "").slice(0, 15); // max 15 sig figs

  const result = fracStripped.length > 0
    ? `${intPart}.${fracStripped}`
    : `${intPart}.0`;

  return negative ? `-${result}` : result;
}

/**
 * Standard normal CDF approximation (Abramowitz & Stegun formula 7.1.26).
 * Accurate to ~7.5e-8 — more than sufficient for a UI heuristic.
 */
function normalCDF(x: number): number {
  // Constants from Abramowitz & Stegun.
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);

  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);

  return 0.5 * (1.0 + sign * y);
}
