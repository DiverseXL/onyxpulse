/**
 * Complete-set operations for binary markets.
 *
 * Minting a complete set deposits collateral and mints equal YES + NO tokens,
 * enabling "sell anytime" without prior holdings — the Onyx equivalent.
 * Burning surrenders a matched YES + NO pair back to collateral before settlement.
 *
 * Market status guard: minting/burning requires the market to be "Trading".
 * Attempting against a non-trading market fails fast with a clear error rather
 * than reverting opaquely on-chain.
 */

import type { Address } from "viem";
import type {
  BinaryMarket,
  SomniaMarketsClient,
  TxResult,
} from "@somnia-chain/markets-sdk";

import { toBigintAmount } from "./units.js";
import { assertMarketWritable } from "./statusGate.js";
import { mapSdkError } from "./errors.js";

// ─── Trader type (matches SDK's Trader interface) ────────────────────────────

type Trader = {
  mintSet(params: { pool: Address; amount: bigint; collateral?: Address; autoApprove?: boolean; gas?: bigint }): Promise<TxResult>;
  burnSet(params: { pool: Address; amount: bigint; outcomeToken?: Address; autoApprove?: boolean; gas?: bigint }): Promise<TxResult>;
  mintSetNative(params: { marketId: import("viem").Hex; amount: bigint; operatorId?: number; venueId?: import("viem").Hex; router?: Address; gas?: bigint }): Promise<TxResult>;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Fetch a binary market and verify it is in "Trading" status.
 * Returns the market row for downstream use (pool address, etc).
 */
async function requireTradingMarket(
  client: SomniaMarketsClient,
  marketId: string,
): Promise<BinaryMarket> {
  const market = await client.getBinaryMarket(marketId);
  if (!market) {
    throw new Error(`Market ${marketId} not found in indexer.`);
  }
  if (market.status !== "Trading") {
    throw new Error(
      `Market ${marketId} is not tradeable (status=${market.status}). ` +
        `Complete-set operations require the market to be "Trading".`,
    );
  }
  return market;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

/**
 * Mint a complete YES + NO set from collateral.
 *
 * Deposits `amount` of collateral and receives `amount` of both YES and NO
 * outcome tokens. This enables selling into the book without prior holdings —
 * the "sell anytime" equivalent from the product spec.
 *
 * After minting, the caller holds both sides and can sell whichever outcome
 * they believe is less likely, keeping the other as a position.
 *
 * Market status is verified to be "Trading" before the mint is attempted.
 *
 * @param trader - A Trader instance (from createTrader).
 * @param client - The SomniaMarketsClient (for market status check).
 * @param pool - The binary pool address (from BinaryMarket.poolAddress).
 * @param humanAmount - Amount in human units (e.g. "100" for 100 USDC).
 * @param decimals - Token decimals (read from BinaryMarket.quoteDecimals).
 * @returns The confirmation receipt.
 */
export async function mintCompleteSet(
  trader: Trader,
  client: SomniaMarketsClient,
  pool: Address,
  humanAmount: string,
  decimals: number,
): Promise<TxResult> {
  try {
    // On-chain status gate: verify the market is tradeable before minting.
    const market = await client.getMarketByPool(pool);
    if (market && "marketId" in market) {
      await assertMarketWritable(client, market.marketId, "Trading");
    }

    const amount = toBigintAmount(humanAmount, decimals);
    return await trader.mintSet({ pool, amount });
  } catch (error) {
    throw mapSdkError(error, `mintCompleteSet for pool ${pool}`);
  }
}

/**
 * Burn a complete YES + NO set back to collateral.
 *
 * Surrenders equal amounts of YES and NO outcome tokens and receives the
 * matching collateral back. The inverse of {@link mintCompleteSet}.
 *
 * Market status is verified to be "Trading" before the burn is attempted.
 *
 * @param trader - A Trader instance (from createTrader).
 * @param client - The SomniaMarketsClient (for market status check).
 * @param pool - The binary pool address.
 * @param humanAmount - Amount in human units (same amount for both YES and NO).
 * @param decimals - Token decimals (read from BinaryMarket.quoteDecimals).
 * @returns The confirmation receipt.
 */
export async function burnCompleteSet(
  trader: Trader,
  client: SomniaMarketsClient,
  pool: Address,
  humanAmount: string,
  decimals: number,
): Promise<TxResult> {
  try {
    // On-chain status gate: verify the market is tradeable before burning.
    const market = await client.getMarketByPool(pool);
    if (market && "marketId" in market) {
      await assertMarketWritable(client, market.marketId, "Trading");
    }

    const amount = toBigintAmount(humanAmount, decimals);
    return await trader.burnSet({ pool, amount });
  } catch (error) {
    throw mapSdkError(error, `burnCompleteSet for pool ${pool}`);
  }
}

/**
 * Mint a complete set using native token (SOMI/STT) as collateral.
 *
 * **UNTESTED against DreamDEX's confirmed 6dp test USDC collateral path.**
 * DreamDEX Event Contracts use test USDC (ERC-20), not native SOMI. This
 * function is for markets where the collateral IS wrapped native (wSOMI).
 * Verify this path is deployed before using it in production.
 *
 * @param trader - A Trader instance (from createTrader).
 * @param client - The SomniaMarketsClient (for market status check).
 * @param pool - The binary pool address.
 * @param humanAmount - Native amount in human units (e.g. "10" for 10 SOMI).
 * @returns The confirmation receipt.
 */
export async function mintCompleteSetNative(
  trader: Trader,
  client: SomniaMarketsClient,
  pool: Address,
  humanAmount: string,
): Promise<TxResult> {
  try {
    // On-chain status gate: verify the market is tradeable before minting.
    const market = await client.getMarketByPool(pool);
    if (market && "marketId" in market) {
      await assertMarketWritable(client, market.marketId, "Trading");
    }

    // Native amounts are in wei (18dp) — convert from human string.
    const amount = toBigintAmount(humanAmount, 18);

    // We need the marketId (bytes32) for the router-mint path.
    if (!market || !("marketId" in market)) {
      throw new Error(
        `Could not resolve marketId for pool ${pool}. ` +
          `mintSetNative requires the bytes32 marketId for the CollateralRouter path.`,
      );
    }

    return await trader.mintSetNative({
      marketId: market.marketId,
      amount,
    });
  } catch (error) {
    throw mapSdkError(error, `mintCompleteSetNative for pool ${pool}`);
  }
}
