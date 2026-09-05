/**
 * Portfolio queries for a trader's binary positions, orders, and PnL.
 *
 * All data comes from the SDK's indexer reads — display-grade, not for gating
 * writes (use statusGate.ts for that).
 *
 * Convention: import from src/engine/index.ts, never from this file directly.
 */
import type { Address } from "viem";
import type {
  BinaryMarket,
  SomniaMarketsClient,
} from "@somnia-chain/markets-sdk";
import type {
  Portfolio,
  PortfolioPosition,
  PortfolioOrder,
  PortfolioTrade,
  OpenPositionPnL,
  BinaryPositionPnL,
  GetOutcomeBalanceParams,
} from "@somnia-chain/markets-sdk";
import type { ClaimablePosition } from "@somnia-chain/markets-sdk";

// ─── Re-export SDK portfolio types ───────────────────────────────────────────
// Consumers import these from here, never from the SDK directly.

export type {
  Portfolio,
  PortfolioPosition,
  PortfolioOrder,
  PortfolioTrade,
  OpenPositionPnL,
};

export interface ClaimablePositionInfo {
  marketId: string;
  pool: string;
  outcomeIdx: 0 | 1;
  amount: bigint;
  estPayout: bigint;
  status: string;
}

// ─── Portfolio queries ───────────────────────────────────────────────────────

/**
 * Fetch a trader's full binary portfolio in one round-trip.
 *
 * Returns positions (outcome-token balances), open orders, and recent fills,
 * each with market context. All amounts are raw — format with the market's
 * `quoteDecimals`.
 *
 * @param client - SomniaMarketsClient instance.
 * @param traderAddress - The wallet address to query.
 * @param opts - Optional paging (ordersLimit, tradesLimit, since).
 */
export async function getMyPortfolio(
  client: SomniaMarketsClient,
  traderAddress: Address,
  opts?: { ordersLimit?: number; tradesLimit?: number; since?: number },
): Promise<Portfolio> {
  try {
    return await client.getPortfolio(traderAddress.toLowerCase(), opts);
  } catch (error) {
    throw new Error(
      `getMyPortfolio failed for ${traderAddress}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Fetch a trader's open (non-settled) binary positions.
 *
 * Filters the portfolio to positions with non-zero balance, for a "My
 * Positions" UI. All amounts are raw — format with the market's quoteDecimals.
 *
 * @param client - SomniaMarketsClient instance.
 * @param traderAddress - The wallet address to query.
 */
export async function getMyOpenPositions(
  client: SomniaMarketsClient,
  traderAddress: Address,
): Promise<PortfolioPosition[]> {
  try {
    const portfolio = await client.getPortfolio(traderAddress.toLowerCase());
    return portfolio.positions.filter((p) => BigInt(p.balance) > 0n);
  } catch (error) {
    throw new Error(
      `getMyOpenPositions failed for ${traderAddress}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Fetch a trader's positions that are ready to redeem (auto-redeem prompt).
 *
 * Uses the SDK's `getClaimable` which cross-references open positions against
 * settled (Resolved/Voided) markets. Returns positions shaped to feed directly
 * into `trader.redeemMany`.
 *
 * @param client - SomniaMarketsClient instance.
 * @param traderAddress - The wallet address to query.
 */
export async function getMyRedeemablePositions(
  client: SomniaMarketsClient,
  traderAddress: Address,
): Promise<ClaimablePositionInfo[]> {
  try {
    const claimables = await client.getClaimable(traderAddress.toLowerCase());
    return claimables.map((c) => ({
      marketId: c.marketId,
      pool: c.pool,
      outcomeIdx: c.outcomeIdx,
      amount: c.amount,
      estPayout: c.estPayout,
      status: c.status,
    }));
  } catch (error) {
    throw new Error(
      `getMyRedeemablePositions failed for ${traderAddress}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Fetch a trader's positions joined with reliable avg-cost PnL — the batched,
 * positions-list companion to {@link getPositionPnL}.
 *
 * Returns ONE entry per market (not per outcome): the market row joined with
 * cost basis, average cost, mark value, and realized/unrealized PnL — all RAW
 * collateral units (format with the market's `quoteDecimals`).
 *
 * `markValue` is computed by the SDK's canonical PnL engine and is correct for
 * every lifecycle stage: while Trading/Locked it marks the balance to the
 * book-clamped live price; once Resolved/Finalized it uses the actual
 * settlement payout (1.0 for the winning outcome, 0 for the losing outcome);
 * for Voided markets it uses the 0.5 refund. Do not reimplement this value
 * math in the UI — consume `markValue` from here.
 *
 * @param client - SomniaMarketsClient instance.
 * @param traderAddress - The wallet address to query.
 */
export async function getMyPositionsWithPnL(
  client: SomniaMarketsClient,
  traderAddress: Address,
): Promise<OpenPositionPnL[]> {
  try {
    return await client.getOpenPositionsWithPnL(traderAddress.toLowerCase());
  } catch (error) {
    throw new Error(
      `getMyPositionsWithPnL failed for ${traderAddress}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Compute PnL for a single market position.
 *
 * Returns cost basis, average cost, mark value, unrealized and realized PnL
 * — all in raw collateral units. Format with the market's quoteDecimals.
 *
 * NOTE: the SDK returns the PnL WITHOUT the joined `market` context; the
 * `OpenPositionPnL` shape (with `market`) comes from the batched
 * `computeOpenPositionsPnL` flow instead. If you need the market row, fetch
 * it separately via getMarketById.
 *
 * @param client - SomniaMarketsClient instance.
 * @param traderAddress - The wallet address to query.
 * @param marketId - The bytes32 market id.
 */
export async function getPositionPnL(
  client: SomniaMarketsClient,
  traderAddress: Address,
  marketId: string,
): Promise<BinaryPositionPnL> {
  try {
    return await client.getBinaryPositionPnL(
      traderAddress.toLowerCase(),
      marketId,
    );
  } catch (error) {
    throw new Error(
      `getPositionPnL failed for ${traderAddress} on market ${marketId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Get a trader's on-chain outcome-token balance for a specific market and side.
 *
 * This reads live ERC-6909 state (not the indexer), so it's suitable for
 * gating writes. Returns raw token units — format with market.quoteDecimals.
 *
 * @param client - SomniaMarketsClient instance.
 * @param traderAddress - The wallet address to query.
 * @param market - The BinaryMarket (for outcomeToken + yesId/noId).
 * @param outcome - 0 = YES, 1 = NO.
 */
export async function getOutcomeTokenBalance(
  client: SomniaMarketsClient,
  traderAddress: Address,
  market: BinaryMarket,
  outcome: 0 | 1,
): Promise<bigint> {
  try {
    const balances = await client.getOutcomeBalances(
      traderAddress.toLowerCase(),
      market.marketAddress,
    );
    return BigInt(outcome === 0 ? balances.yes : balances.no);
  } catch (error) {
    throw new Error(
      `getOutcomeTokenBalance failed for ${traderAddress} on market ${market.id}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Read a trader's outcome-token balance directly from the on-chain ERC-6909
 * contract (not the indexer). This is suitable for gating writes immediately
 * after a fill, where the indexer may lag.
 *
 * Requires `client.getMarketOnchain()` to get the outcome-token singleton and
 * yesId/noId, then calls the SDK's `getOutcomeBalance()` which issues a direct
 * `eth_call` against the chain.
 *
 * @param client - SomniaMarketsClient instance.
 * @param traderAddress - The wallet address to query.
 * @param market - The BinaryMarket.
 * @param outcome - 0 = YES, 1 = NO.
 */
export async function getOutcomeBalanceOnchain(
  client: SomniaMarketsClient,
  traderAddress: Address,
  market: BinaryMarket,
  outcome: 0 | 1,
): Promise<bigint> {
  try {      const onchain = await client.getMarketOnchain(market.marketId);
    const id = outcome === 0 ? onchain.yesId : onchain.noId;
    return await client.getOutcomeBalance(
      { outcomeToken: onchain.outcomeToken, account: traderAddress, id },
    );
  } catch (error) {
    throw new Error(
      `getOutcomeBalanceOnchain failed for ${traderAddress} on market ${market.id}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
