/**
 * Batch "claim all" background job.
 *
 * Fetches every redeemable position for an address (Finalized / Resolved /
 * Voided markets with non-zero balance) and redeems them one-by-one via
 * the existing `redeemMarket`, which already handles void-aware dual-side
 * redemption. Individual failures never abort the batch — the caller
 * receives a structured result summarising successes and failures.
 *
 * Convention: import from src/engine/index.ts, never from this file directly.
 */
import type { SomniaMarketsClient } from "@somnia-chain/markets-sdk";
import type { Hex } from "viem";

import { getMyRedeemablePositions, type ClaimablePositionInfo } from "./portfolio.ts";
import { redeemMarket } from "./settlement.ts";
import { PulseEngineError } from "./errors.ts";

// ─── Local Trader type (matches SDK's Trader interface) ──────────────────────
// Defined locally here and in settlement.ts — the SDK does not export a
// standalone Trader type, so each module that needs it re-declares it.

type Trader = {
  redeem(params: {
    marketId: Hex;
    amount: bigint;
    outcomeIdx?: 0 | 1;
  }): Promise<{ hash: string; receipt: unknown }>;
  redeemMany(params: {
    entries: { marketId: Hex; outcomeIdx: 0 | 1; amount: bigint }[];
  }): Promise<{ hash: string; receipt: unknown }>;
};

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Result of a batch claim-all operation.
 *
 * `succeeded` lists every market that was redeemed, `failed` lists every
 * market whose redemption threw, and `totalClaimed` is the count of
 * successes (equivalent to `succeeded.length`).
 */
export interface ClaimAllResult {
  succeeded: Array<{ marketId: string; txHash: string }>;
  failed: Array<{ marketId: string; error: PulseEngineError }>;
  totalClaimed: number;
}

/**
 * Per-item progress status emitted during a batch claim.
 */
export type ClaimAllProgressStatus = "claiming" | "success" | "failed";

// ─── Export ──────────────────────────────────────────────────────────────────

/**
 * Redeem every claimable position for a given address.
 *
 * Steps:
 * 1. Fetch all redeemable positions via `getMyRedeemablePositions`.
 * 2. For each, call `redeemMarket` — the existing function already handles
 *    resolved, finalised, and voided markets (including dual-side redemption
 *    for voids). We do not duplicate that logic.
 * 3. Continue through the full list even when one redemption fails.
 *
 * Only structural failures (e.g. the initial position fetch) cause the
 * function itself to throw. Individual market failures are captured in the
 * returned `ClaimAllResult.failed` array as `PulseEngineError` instances.
 *
 * @param trader - A Trader instance (from `createTrader`).
 * @param client - The SomniaMarketsClient (for market lookup and balance reads).
 * @param ownerAddress - The wallet address holding the outcome tokens.
 * @param onProgress - Optional callback emitted before and after each
 *   redemption attempt so a UI or CLI can show live batch progress.
 * @returns A ClaimAllResult summarising successes and failures.
 */
export async function claimAllRedeemable(
  trader: Trader,
  client: SomniaMarketsClient,
  ownerAddress: string,
  onProgress?: (marketId: string, status: ClaimAllProgressStatus) => void,
): Promise<ClaimAllResult> {
  const positions: ClaimablePositionInfo[] = await getMyRedeemablePositions(
    client,
    ownerAddress as `0x${string}`,
  );

  const result: ClaimAllResult = {
    succeeded: [],
    failed: [],
    totalClaimed: 0,
  };

  for (const pos of positions) {
    const mid = pos.marketId;

    onProgress?.(mid, "claiming");

    try {
      const txResult = await redeemMarket(
        trader as any,
        client,
        mid,
        ownerAddress,
      );
      result.succeeded.push({ marketId: mid, txHash: txResult.hash });
      result.totalClaimed++;
      onProgress?.(mid, "success");
    } catch (error) {
      const pulseError =
        error instanceof PulseEngineError
          ? error
          : new PulseEngineError(
              "UNKNOWN",
              `claimAllRedeemable for ${mid}`,
              error instanceof Error
                ? `claimAllRedeemable for ${mid}: ${error.message}`
                : `claimAllRedeemable for ${mid}: ${String(error)}`,
              error,
            );
      result.failed.push({ marketId: mid, error: pulseError });
      onProgress?.(mid, "failed");
    }
  }

  return result;
}
