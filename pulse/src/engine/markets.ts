import type {
  BinaryMarket,
  BinaryMarketStatus,
  Market,
  SomniaMarketsClient,
} from "@somnia-chain/markets-sdk";
import { isBinaryMarket as sdkIsBinaryMarket } from "@somnia-chain/markets-sdk";

export type { BinaryMarket, BinaryMarketStatus, Market };

/**
 * Re-export the SDK's type guard for the Market union.
 *
 * Market is `SpotMarket | PerpMarket | BinaryMarket` — use this to narrow.
 *
 * @example
 * if (isBinaryMarket(market)) {
 *   console.log(market.asset, market.question);
 * }
 */
export const isBinaryMarket = sdkIsBinaryMarket;

/**
 * Fetch currently live binary markets (status "Trading") — actively tradeable.
 *
 * One-shot indexer fetch. For continuous live updates, use the SDK's
 * `client.watchMarket(pool)` on individual pools instead.
 *
 * CRITICAL: `market.poolAddress` is a time-varying binding — the same pool
 * contract serves successive markets. Always key by `market.id` (marketId),
 * never by poolAddress alone.
 */
export async function getLiveBinaryMarkets(
  client: SomniaMarketsClient,
): Promise<BinaryMarket[]> {
  return client.listBinaryMarkets({ status: "Trading" });
}

/**
 * Fetch upcoming binary markets (status "Listed") — created but not yet open
 * for trading. These are visible in the UI but cannot be traded until
 * `tradingStart` is reached.
 */
export async function getUpcomingBinaryMarkets(
  client: SomniaMarketsClient,
): Promise<BinaryMarket[]> {
  return client.listBinaryMarkets({ status: "Listed" });
}

/**
 * Fetch finalized binary markets — ready for the redeem/receipt flow.
 *
 * "Finalized" is an INDEXER-DERIVED terminal state, set after `finalizeMarket`
 * sweeps the pool's backing + resolution snapshot onto the BinarySettlement
 * singleton. A market can be `Resolved` or `Voided` on-chain but NOT yet
 * `Finalized` in the indexer — handle that gap gracefully. Do not assume
 * `Resolved` markets are immediately redeemable; check for `Finalized` status
 * before offering the redeem action.
 */
export async function getFinalizedBinaryMarkets(
  client: SomniaMarketsClient,
): Promise<BinaryMarket[]> {
  return client.listBinaryMarkets({ status: "Finalized" });
}

/**
 * Look up a specific binary market by its bytes32 marketId.
 *
 * Returns the full `BinaryMarket` row, or `null` if the indexer has no record
 * (e.g. a market that deployed after the last indexer snapshot).
 *
 * Use this for the receipt page: pass the `marketId` stored in the order/tx
 * to get the market's question, asset, status, and settlement details.
 *
 * @param client - The SomniaMarketsClient (from createPulseClient).
 * @param marketId - The bytes32 market id (lowercased hex string, e.g. "0x0000…0013").
 */
export async function getMarketById(
  client: SomniaMarketsClient,
  marketId: string,
): Promise<BinaryMarket | null> {
  return client.getBinaryMarket(marketId);
}
