/**
 * On-chain status gate for write operations.
 *
 * The GraphQL indexer can lag behind chain state, so status checks used to gate
 * writes (placeOrder, mintSet, burnSet, redeem) MUST read live on-chain status,
 * not indexer-cached status, immediately before the write.
 *
 * Uses `client.getMarketOnchain(marketId)` — a direct `eth_call` to the
 * BinaryMarketsModule contract — which returns the on-chain `MarketStatus` enum
 * (0 Listed, 1 Trading, 2 Locked, 3 Settling, 4 Resolved, 5 Voided).
 *
 * "Finalized" is indexer-only (no on-chain enum member) and cannot be read from
 * chain. For redeem gating, use ["Resolved", "Finalized"] — the on-chain read
 * returns "Resolved"; if the indexer says "Finalized" it's a superset that the
 * chain read can't distinguish.
 */

import type { Hex } from "viem";
import type { BinaryMarketStatus, SomniaMarketsClient } from "@somnia-chain/markets-sdk";

// ─── On-chain status index mapping ───────────────────────────────────────────

/**
 * Maps the on-chain `MarketStatus` enum index to `BinaryMarketStatus` string.
 * Derived from `store.d.ts` `BINARY_MARKET_STATUS` (which is not exported
 * from the root barrel). The mapping is:
 *
 *   0 → "Listed"
 *   1 → "Trading"
 *   2 → "Locked"
 *   3 → "Settling"
 *   4 → "Resolved"
 *   5 → "Voided"
 *
 * "Finalized" is indexer-only and never appears on-chain.
 */
const ONCHAIN_STATUS_MAP: BinaryMarketStatus[] = [
  "Listed",
  "Trading",
  "Locked",
  "Settling",
  "Resolved",
  "Voided",
];

// ─── Exports ─────────────────────────────────────────────────────────────────

/**
 * Read the on-chain market status directly from the BinaryMarketsModule contract.
 *
 * Uses `client.getMarketOnchain(marketId)` — a direct `eth_call`, NOT the
 * indexer. This is the authoritative source for whether a market is tradeable
 * at this exact block.
 *
 * The on-chain enum only covers statuses 0–5 (Listed through Voided).
 * "Finalized" is indexer-only; this function returns "Resolved" for on-chain
 * status 4, which is the closest on-chain equivalent.
 *
 * @param client - The SomniaMarketsClient.
 * @param marketId - The bytes32 market id (lowercased hex).
 * @returns The on-chain BinaryMarketStatus string.
 */
export async function getOnChainMarketStatus(
  client: SomniaMarketsClient,
  marketId: string,
): Promise<BinaryMarketStatus> {
  try {
    const onchain = await client.getMarketOnchain(marketId as Hex);
    const statusIndex = onchain.status;

    if (statusIndex < 0 || statusIndex >= ONCHAIN_STATUS_MAP.length) {
      throw new Error(
        `Unknown on-chain status index ${statusIndex} for market ${marketId}. ` +
          `Expected 0–${ONCHAIN_STATUS_MAP.length - 1}.`,
      );
    }

    return ONCHAIN_STATUS_MAP[statusIndex];
  } catch (error) {
    throw new Error(
      `getOnChainMarketStatus failed for ${marketId}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Assert that a market's on-chain status matches the required status(es)
 * before submitting a write transaction.
 *
 * Reads the live on-chain status (NOT indexer) and throws a clear error
 * if it doesn't match. This prevents:
 * - Placing orders on a locked/settled market
 * - Minting into a non-trading market
 * - Redeeming from a market that hasn't resolved yet
 *
 * @param client - The SomniaMarketsClient.
 * @param marketId - The bytes32 market id.
 * @param requiredStatus - One or more acceptable statuses.
 * @throws If the on-chain status doesn't match any of the required statuses.
 */
export async function assertMarketWritable(
  client: SomniaMarketsClient,
  marketId: string,
  requiredStatus: BinaryMarketStatus | BinaryMarketStatus[],
): Promise<void> {
  const currentStatus = await getOnChainMarketStatus(client, marketId);
  const allowed = Array.isArray(requiredStatus) ? requiredStatus : [requiredStatus];

  if (!allowed.includes(currentStatus)) {
    const expected = allowed.length === 1 ? allowed[0] : allowed.join(" or ");
    throw new Error(
      `Market ${marketId} is not writable: current on-chain status is ${currentStatus}, expected ${expected}.`,
    );
  }
}
