/**
 * Risk engine — position and risk limits enforced before any trade, mint,
 * or additional exposure is taken on.
 *
 * This module is a GATE, not an executor. Calling code (future UI or agent)
 * is responsible for calling `checkRiskLimits` before calling
 * `placeMarketOrder`, `placeLimitOrder`, or `mintCompleteSet`. The one
 * exception is `flattenBeforeExpiry`, which explicitly sells a position
 * when it is about to expire.
 *
 * Convention: import from src/engine/index.ts, never from this file directly.
 */
import type { Address } from "viem";
import type { SomniaMarketsClient } from "@somnia-chain/markets-sdk";

import {
  getMyOpenPositions,
  type PortfolioPosition,
} from "./portfolio.js";
import { toBigintAmount, fromBigintAmount } from "./units.js";
import { placeMarketOrder } from "./trading.js";

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Risk limits expressed in human-readable units.
 *
 * All string amounts are human-unit decimals (e.g. "100" = 100 USDC),
 * matching the format `placeMarketOrder` / `placeLimitOrder` expect.
 */
export interface RiskLimits {
  /** Maximum allowed position size in a single market (human units). */
  maxPositionSizePerMarket: string;
  /** Maximum number of distinct markets with open positions. */
  maxOpenMarkets: number;
  /** Maximum total exposure across all open positions (human units). */
  maxTotalExposure: string;
}

/**
 * Result of a risk-limit check.
 */
export interface RiskCheckResult {
  /** Whether the proposed trade/mint is within all limits. */
  allowed: boolean;
  /** Human-readable reason when `allowed` is false. */
  reason?: string;
}

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
  }): Promise<{ hash: string }>;
  cancelOrder(params: { pool: Address; orderId: bigint | string }): Promise<{ hash: string }>;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Sum the raw balance of a position across both YES and NO sides for the
 * same market. A single PortfolioPosition covers one outcome side, but a
 * trader may hold both YES and NO in the same market. We handle this by
 * grouping by market id and summing both sides.
 *
 * Returns the sum as a raw bigint in quote (collateral) units.
 */
function sumExposureByMarket(positions: PortfolioPosition[]): Map<string, bigint> {
  const exposure = new Map<string, bigint>();
  for (const pos of positions) {
    const marketId = pos.market.id;
    const current = exposure.get(marketId) ?? 0n;
    exposure.set(marketId, current + BigInt(pos.balance));
  }
  return exposure;
}

/**
 * Build a human-readable summary of current vs limit for error messages.
 */
function formatLimitBreach(
  label: string,
  current: string,
  proposed: string,
  limit: string,
  unit: string,
): string {
  const total = `${current} + ${proposed}`;
  return `Would exceed ${label}: current ${total} ${unit} > limit ${limit} ${unit}`;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

/**
 * Check whether a proposed trade/mint would breach any configured risk limits.
 *
 * Reads the trader's open positions via `getMyOpenPositions` and compares:
 * 1. Position size in the proposed market (current + proposed) vs
 *    `maxPositionSizePerMarket`.
 * 2. Number of distinct markets with open positions (including the proposed
 *    market if not already open) vs `maxOpenMarkets`.
 * 3. Total exposure across all markets (current + proposed) vs
 *    `maxTotalExposure`.
 *
 * This is a pure gate — it does not place any trades. Call it before
 * `placeMarketOrder`, `placeLimitOrder`, or `mintCompleteSet`.
 *
 * @param client - SomniaMarketsClient instance.
 * @param ownerAddress - The wallet address to check positions for.
 * @param proposedMarketId - The market id the trader wants to take exposure on.
 * @param proposedHumanAmount - The proposed position size in human units
 *   (e.g. "5" for 5 USDC of outcome tokens).
 * @param limits - The risk limits to check against.
 * @returns `{ allowed: true }` or `{ allowed: false, reason: "..." }`.
 */
export async function checkRiskLimits(
  client: SomniaMarketsClient,
  ownerAddress: Address,
  proposedMarketId: string,
  proposedHumanAmount: string,
  limits: RiskLimits,
): Promise<RiskCheckResult> {
  const positions = await getMyOpenPositions(client, ownerAddress);

  // Group raw exposure by market id (YES + NO combined per market).
  const exposureByMarket = sumExposureByMarket(positions);
  const uniqueMarketIds = new Set(exposureByMarket.keys());

  // --- Check 1: Max open markets ---
  const willAddNewMarket = !uniqueMarketIds.has(proposedMarketId);
  const projectedMarketCount = uniqueMarketIds.size + (willAddNewMarket ? 1 : 0);

  if (projectedMarketCount > limits.maxOpenMarkets) {
    return {
      allowed: false,
      reason: `Would exceed maxOpenMarkets: currently ${uniqueMarketIds.size} market(s), adding ${proposedMarketId} would make ${projectedMarketCount} > limit ${limits.maxOpenMarkets}`,
    };
  }

  // --- Check 2: Max position size per market ---
  // Determine decimals from any existing position in that market, or assume 6
  // (TestUSDC default) if no position exists yet.
  let marketDecimals = 6;
  for (const pos of positions) {
    if (pos.market.id === proposedMarketId) {
      marketDecimals = pos.market.quoteDecimals;
      break;
    }
  }

  const currentRawForMarket = exposureByMarket.get(proposedMarketId) ?? 0n;
  const proposedRaw = toBigintAmount(proposedHumanAmount, marketDecimals);
  const projectedRawForMarket = currentRawForMarket + proposedRaw;
  const currentHumanForMarket = fromBigintAmount(currentRawForMarket, marketDecimals);
  const limitHumanForMarket = limits.maxPositionSizePerMarket;

  const limitRawForMarket = toBigintAmount(limitHumanForMarket, marketDecimals);
  if (projectedRawForMarket > limitRawForMarket) {
    return {
      allowed: false,
      reason: formatLimitBreach(
        "maxPositionSizePerMarket",
        currentHumanForMarket,
        proposedHumanAmount,
        limitHumanForMarket,
        "USDC",
      ),
    };
  }

  // --- Check 3: Max total exposure ---
  let totalCurrentRaw = 0n;
  for (const raw of exposureByMarket.values()) {
    totalCurrentRaw += raw;
  }
  const projectedTotalRaw = totalCurrentRaw + proposedRaw;
  const currentTotalHuman = fromBigintAmount(totalCurrentRaw, marketDecimals);
  const limitTotalHuman = limits.maxTotalExposure;

  const limitTotalRaw = toBigintAmount(limitTotalHuman, marketDecimals);
  if (projectedTotalRaw > limitTotalRaw) {
    return {
      allowed: false,
      reason: formatLimitBreach(
        "maxTotalExposure",
        currentTotalHuman,
        proposedHumanAmount,
        limitTotalHuman,
        "USDC",
      ),
    };
  }

  return { allowed: true };
}

/**
 * Flatten (sell/close) a position when the market is within a time threshold
 * of its expiry, rather than holding through settlement.
 *
 * Checks the market's `expiry` timestamp against the current time. If the
 * market is within `secondsBeforeExpiryThreshold` of expiry AND the trader
 * holds outcome tokens, sells the position via a market order. Returns null
 * if not near expiry or if there is no position to flatten.
 *
 * This is the one case where the risk engine executes a trade — all other
 * trade decisions remain with the calling code.
 *
 * @param trader - A Trader instance (from createTrader).
 * @param client - SomniaMarketsClient instance (for market data and order placement).
 * @param ownerAddress - The wallet address holding the position.
 * @param marketId - The market to check and potentially flatten.
 * @param secondsBeforeExpiryThreshold - If the market expires within this
 *   many seconds, attempt to flatten. Use e.g. 300 to flatten 5 minutes
 *   before expiry.
 * @returns The transaction result if a sell was placed, or null if no action
 *   was needed.
 */
export async function flattenBeforeExpiry(
  trader: Trader,
  client: SomniaMarketsClient,
  ownerAddress: Address,
  marketId: string,
  secondsBeforeExpiryThreshold: number,
): Promise<{ hash: string } | null> {
  // Fetch the market to read its expiry.
  const market = await client.getBinaryMarket(marketId);
  if (!market || !("expiry" in market)) {
    return null;
  }

  const expirySec = parseInt((market as { expiry: string }).expiry, 10);
  const nowSec = Math.floor(Date.now() / 1000);
  const secondsUntilExpiry = expirySec - nowSec;

  // Not near expiry — nothing to do.
  if (secondsUntilExpiry > secondsBeforeExpiryThreshold || secondsUntilExpiry < 0) {
    return null;
  }

  // Fetch open positions for this address, filtered to this market.
  const positions = await getMyOpenPositions(client, ownerAddress);
  const marketPositions = positions.filter((p) => p.market.id === marketId);

  if (marketPositions.length === 0) {
    return null;
  }

  // Sum both YES and NO balances for the market.
  let totalBalance = 0n;
  let quoteDecimals = 6;
  let poolAddress: Address = "0x0000000000000000000000000000000000000000";

  for (const pos of marketPositions) {
    totalBalance += BigInt(pos.balance);
    quoteDecimals = pos.market.quoteDecimals;
    poolAddress = pos.market.poolAddress as Address;
  }

  if (totalBalance === 0n) {
    return null;
  }

  // Determine which side to sell: pick the side with the larger balance.
  const yesPos = marketPositions.find((p) => p.outcomeIndex === 0);
  const noPos = marketPositions.find((p) => p.outcomeIndex === 1);
  const yesBalance = yesPos ? BigInt(yesPos.balance) : 0n;
  const noBalance = noPos ? BigInt(noPos.balance) : 0n;

  const sellSide: "SELL_YES" | "SELL_NO" = yesBalance >= noBalance ? "SELL_YES" : "SELL_NO";
  const sellBalance = sellSide === "SELL_YES" ? yesBalance : noBalance;
  const humanQuantity = fromBigintAmount(sellBalance, quoteDecimals);

  // Use last known price or a conservative 0.51 to ensure fill.
  const lastPrice = (market as { lastPrice?: string | null }).lastPrice;
  const price = lastPrice && parseFloat(lastPrice) > 0
    ? fromBigintAmount(BigInt(lastPrice), quoteDecimals)
    : "0.51";

  return await placeMarketOrder(client, trader as never, {
    pool: poolAddress,
    side: sellSide,
    humanPrice: price,
    humanQuantity,
    decimals: quoteDecimals,
  });
}
