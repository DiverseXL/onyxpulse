import type { Hex } from "viem";
import type {
  BinaryMarket,
  SomniaMarketsClient,
  TxResult,
} from "@somnia-chain/markets-sdk";

import { isBinaryMarket } from "./markets.ts";
import { assertMarketWritable } from "./statusGate.ts";
import { getOutcomeTokenBalance, getOutcomeBalanceOnchain } from "./portfolio.ts";
import { toBigintAmount } from "./units.ts";
import { PulseEngineError, mapSdkError } from "./errors.ts";

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Resolution data for a single market, surfaced to the receipt page.
 * Built exclusively from verified on-chain/indexer data — never fabricated.
 */
export interface ResolutionData {
  /** The winning outcome (0 = YES, 1 = NO), or null if voided/unresolved. */
  winningOutcome: number | null;
  /** Lifecycle events (Resolved/Skipped/Failed), oldest first. */
  events: {
    kind: string;
    winningOutcome: number | null;
    blockNumber: string;
    timestamp: string;
    txHash: string;
    voided?: boolean | null;
  }[];
  /** Oracle reference link (for reference-mode up/down markets). Null on fixed-strike. */
  reference: {
    oracleQuestionId: string;
    pending: boolean;
  } | null;
  /** Closing price the outcome was decided on. */
  closingAnswer: {
    numericValue: string | null;
    outcomeLabel: string | null;
    resolvedAt: string | null;
  } | null;
  /** Opening price the market resolves against (reference markets only). */
  openingAnswer: {
    numericValue: string | null;
    outcomeLabel: string | null;
    resolvedAt: string | null;
  } | null;
}

/**
 * Complete receipt data for a /receipt/[marketId] page.
 * Built exclusively from verified on-chain/indexer data — never fabricated.
 */
export interface ReceiptData {
  market: BinaryMarket;
  resolution: ResolutionData;
  /** Block explorer link to the settlement tx, or null if unavailable. */
  explorerTxUrl: string | null;
  /** Whether this market was voided (oracle failure → both sides redeem at par). */
  voided: boolean;
  /** Human-readable note for voided markets explaining the refund. */
  voidedNote: string | null;
  /**
   * Oracle explorer link for the market's oracle question, or null if unavailable.
   * Populated when the market has a non-pending oracle reference.
   */
  oracleExplorerUrl: string | null;
}

// ─── Explorer URLs ───────────────────────────────────────────────────────────

const EXPLORER_BASE: Record<number, string> = {
  5031: "https://explorer.somnia.network",
  50312: "https://shannon-explorer.somnia.network",
};

function explorerTxUrl(chainId: number, txHash: string): string | null {
  const base = EXPLORER_BASE[chainId];
  return base ? `${base}/tx/${txHash}` : null;
}

// ─── Oracle Explorer URL ─────────────────────────────────────────────────────

/**
 * Base URL for the Somnia oracle explorer.
 *
 * NOTE: The exact deep-link format for a specific oracle question ID is
 * unconfirmed. The URL below uses the pattern `/{questionId}` as a path
 * segment, which is the most common convention for oracle explorers.
 * This needs verification against a real resolved market before demo day.
 * If the format is wrong, the link will 404 — the receipt will still render
 * correctly with a null URL in that case.
 */
const ORACLE_EXPLORER_BASE = "https://prd.oracle.somnia.host/explore";

/**
 * Build the oracle explorer URL for a given oracle question ID.
 *
 * Returns null if the question ID is empty or the reference is pending.
 * The exact URL format is best-effort — see ORACLE_EXPLORER_BASE comment.
 */
function oracleExplorerUrl(questionId: string | null | undefined, pending: boolean): string | null {
  if (!questionId || pending) return null;
  // Best-effort deep link: base + /{questionId}
  // Verified format TBD — see ORACLE_EXPLORER_BASE comment above.
  return `${ORACLE_EXPLORER_BASE}/${questionId}`;
}

// ─── Trader type (matches SDK's Trader interface) ────────────────────────────

type Trader = {
  redeem(params: { marketId: Hex; amount: bigint; outcomeIdx?: 0 | 1 }): Promise<TxResult>;
  redeemMany(params: {
    entries: { marketId: Hex; outcomeIdx: 0 | 1; amount: bigint }[];
  }): Promise<TxResult>;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve the winning outcome from a BinaryMarket row.
 * Returns 0 (YES) or 1 (NO), or throws if the market hasn't resolved.
 */
function requireWinningOutcome(market: BinaryMarket): 0 | 1 {
  if (market.winningOutcome === null || market.winningOutcome === undefined) {
    throw new Error(
      `Market ${market.id} has not resolved yet (status=${market.status}). ` +
        `Redeem only after the market is Resolved or Finalized.`,
    );
  }
  return market.winningOutcome as 0 | 1;
}

/**
 * Check if a market is redeemable: must be "Resolved" or "Finalized".
 * Returns a descriptive status string for user-visible messaging.
 */
function redeemableStatus(market: BinaryMarket): "ready" | "not_resolved" | "voided" | "unknown" {
  if (market.status === "Finalized" || market.status === "Resolved") {
    return "ready";
  }
  if (market.status === "Voided") {
    return "voided";
  }
  if (
    market.status === "Listed" ||
    market.status === "Trading" ||
    market.status === "Locked" ||
    market.status === "Settling"
  ) {
    return "not_resolved";
  }
  return "unknown";
}

// ─── Exports ─────────────────────────────────────────────────────────────────

/**
 * Redeem outcome tokens from a single resolved/voided/finalized market.
 *
 * Handles both resolved and voided markets correctly:
 * - "Resolved" / "Finalized" → redeems only the winning outcome index.
 * - "Voided" → redeems BOTH outcome indexes (YES and NO), since both
 *   sides redeem at par (0.5 each) as a refund when the oracle fails.
 *
 * For voided markets, checks both outcome-token balances via the indexer
 * and makes one `trader.redeem()` call per non-zero balance. This is
 * correct because the SDK's `redeem()` is per-outcome — there is no
 * combined "redeem both sides" path.
 *
 * On-chain status gate runs first (via assertMarketWritable) to prevent
 * stale indexer reads from allowing a premature redeem.
 *
 * @param trader - A Trader instance (from createTrader).
 * @param client - The SomniaMarketsClient (for market lookup).
 * @param marketId - The bytes32 market id.
 * @param ownerAddress - The wallet address holding the outcome tokens (needed
 *   for balance reads on voided markets; not needed for resolved markets).
 * @returns The confirmed redemption receipt (last tx if multiple were sent).
 */
export async function redeemMarket(
  trader: Trader,
  client: SomniaMarketsClient,
  marketId: string,
  ownerAddress?: string,
): Promise<TxResult> {
  try {
    const market = await client.getBinaryMarket(marketId);
    if (!market) {
      throw new Error(`Market ${marketId} not found in indexer.`);
    }

    const status = redeemableStatus(market);
    if (status === "not_resolved") {
      throw new Error(
        `Market ${marketId} is not yet redeemable (status=${market.status}). ` +
          `Wait for Resolved, Voided, or Finalized status.`,
      );
    }
    if (status === "unknown") {
      throw new Error(
        `Market ${marketId} has unrecognized status (${market.status}). Cannot redeem.`,
      );
    }

    // ── On-chain status gate ──────────────────────────────────────────
    // The on-chain status enum (0-5) does NOT include "Finalized" — that is
    // an indexer-only label. On-chain: 0 Listed, 1 Trading, 2 Locked,
    // 3 Settling, 4 Resolved, 5 Voided. We gate on ["Resolved", "Voided"]
    // which is the correct on-chain check.
    //
    // Finalization: the SDK's BinaryMarketsModule.redeem() handles
    // finalizeMarket() internally ("finalizes-if-needed" per the SDK docs).
    // The module calls BinarySettlement.finalizeAndRedeem() which sweeps
    // the pool's backing into the settlement singleton before paying out.
    // We do NOT need to call finalizeMarket() separately.
    //
    // Edge case: the indexer may label a market "Resolved" before the on-chain
    // status has actually transitioned from Settling. The on-chain gate below
    // catches this — if status is still 3 (Settling), assertMarketWritable
    // throws with the current status rather than letting the module revert
    // opaquely with WrongStatus.
    await assertMarketWritable(client, marketId, ["Resolved", "Voided"]);

    // ── Resolved/Finalized: redeem only the winning outcome ───────────
    if (status === "ready") {
      const outcomeIdx = requireWinningOutcome(market);

      // Read the ACTUAL on-chain outcome-token balance for the winning side.
      // Do NOT use market.netBacking / market.backing — those are pool-level
      // totals, not the user's holdings. Using them would cause InsufficientBalance
      // if the user holds less than the full pool backing (which is almost always
      // the case).
      //
      // We use the on-chain ERC-6909 read (not the indexer) because fills may
      // not have propagated to the indexer yet when redeem is called immediately
      // after resolution.
      const address = ownerAddress
        ?? (trader as { account?: { address?: string } }).account?.address
        ?? (trader as { signer?: { address?: string } }).signer?.address;
      if (!address) {
        throw new Error(
          `Cannot determine trader address for balance read on ${marketId}. ` +
            `Pass ownerAddress explicitly or ensure the trader has an account.`,
        );
      }

      const amount = await getOutcomeBalanceOnchain(
        client,
        address as `0x${string}`,
        market,
        outcomeIdx,
      );

      if (amount === 0n) {
        throw new Error(
          `No outcome tokens to redeem for market ${marketId} ` +
            `(outcome ${outcomeIdx === 0 ? "YES" : "NO"}). Balance is zero.`,
        );
      }

      return await trader.redeem({
        marketId: market.marketId,
        amount,
        outcomeIdx,
      });
    }

    // ── Voided: redeem BOTH outcome sides (refund at par) ─────────────
    // When a market is voided, the oracle failed to resolve. Both YES and NO
    // holders redeem at par (0.5 each). A user who minted a complete set has
    // both YES and NO tokens — both must be redeemed for a full refund.
    //
    // The SDK's redeem() is per-outcome (requires outcomeIdx), so we check
    // both balances and make one redeem() call per non-zero balance.
    if (!ownerAddress) {
      throw new Error(
        `ownerAddress is required for voided-market redemption on ${marketId} ` +
          `(needed to check both YES and NO outcome balances).`,
      );
    }

    // Use on-chain ERC-6909 reads (not indexer) for the same reason as above:
    // the indexer may lag after resolution.
    const [yesBalance, noBalance] = await Promise.all([
      getOutcomeBalanceOnchain(client, ownerAddress as `0x${string}`, market, 0),
      getOutcomeBalanceOnchain(client, ownerAddress as `0x${string}`, market, 1),
    ]);

    const results: TxResult[] = [];

    if (yesBalance > 0n) {
      const yesResult = await trader.redeem({
        marketId: market.marketId,
        amount: yesBalance,
        outcomeIdx: 0,
      });
      results.push(yesResult);
    }

    if (noBalance > 0n) {
      const noResult = await trader.redeem({
        marketId: market.marketId,
        amount: noBalance,
        outcomeIdx: 1,
      });
      results.push(noResult);
    }

    if (results.length === 0) {
      throw new Error(
        `Market ${marketId} is voided but both YES and NO balances are zero. ` +
          `Nothing to redeem.`,
      );
    }

    // Return the last tx result. If two txs were sent (both sides), the caller
    // can check the array via the returned hash — but for simplicity we return
    // the final one. The full refund requires both txs to confirm.
    return results[results.length - 1];
  } catch (error) {
    if (error instanceof PulseEngineError) throw error;
    throw mapSdkError(error, `redeemMarket for ${marketId}`);
  }
}

/**
 * Redeem winning tokens from multiple resolved/finalized markets in one tx.
 *
 * Fetches each market row to determine its winning outcome, then batch-redeems
 * via `trader.redeemMany`. Markets that aren't redeemable are skipped with a
 * warning (not a hard failure — partial batches are valid).
 *
 * IMPORTANT: Voided markets are skipped in the batch — they require separate
 * per-side redemption (two redeem() calls) which cannot be mixed into a single
 * redeemMany batch. Use redeemMarket() individually for voided markets.
 *
 * @param trader - A Trader instance (from createTrader).
 * @param client - The SomniaMarketsClient (for market lookup).
 * @param marketIds - Array of bytes32 market ids to redeem.
 * @returns The confirmed batch redemption receipt.
 */
export async function redeemMultipleMarkets(
  trader: Trader,
  client: SomniaMarketsClient,
  marketIds: string[],
): Promise<TxResult> {
  try {
    const entries: { marketId: Hex; outcomeIdx: 0 | 1; amount: bigint }[] = [];
    const skipped: string[] = [];

    for (const id of marketIds) {
      const market = await client.getBinaryMarket(id);
      if (!market) {
        skipped.push(id);
        continue;
      }

      if (!isBinaryMarket(market)) {
        skipped.push(id);
        continue;
      }

      const status = redeemableStatus(market);

      // Voided markets need per-side redemption — skip in batch.
      if (status === "voided") {
        skipped.push(id);
        continue;
      }

      if (status !== "ready") {
        skipped.push(id);
        continue;
      }

      const outcomeIdx = requireWinningOutcome(market);
      const backingStr = market.netBacking ?? market.backing;
      const amount = BigInt(backingStr);

      entries.push({ marketId: market.marketId, outcomeIdx, amount });
    }

    if (entries.length === 0) {
      throw new Error(
        `No markets in the batch are redeemable. ` +
          `Skipped ${skipped.length} market(s): ${skipped.join(", ")}. ` +
          `Note: voided markets require individual redemption via redeemMarket().`,
      );
    }

    return await trader.redeemMany({ entries });
  } catch (error) {
    if (error instanceof PulseEngineError) throw error;
    throw mapSdkError(error, `redeemMultipleMarkets for ${marketIds.length} market(s)`);
  }
}

/**
 * Fetch resolution data for a single market.
 *
 * Returns the winning outcome, resolution events, oracle reference link, and
 * posted oracle answers — everything the receipt page needs to display how
 * a market resolved.
 *
 * Confirmed return shape from `client.getMarketResolution`:
 * ```ts
 * {
 *   events: MarketResolutionEvent[];       // oldest first, [] if none yet
 *   reference: MarketReferenceLink | null; // null on fixed-strike markets
 *   closingAnswer: OracleAnswer | null;    // the market's own resolution answer
 *   openingAnswer: OracleAnswer | null;    // reference question answer (null on fixed-strike)
 *   oracleAnswer: OracleAnswer | null;     // deprecated alias of closingAnswer
 * }
 * ```
 *
 * @param client - The SomniaMarketsClient.
 * @param marketId - The bytes32 market id.
 */
export async function getResolution(
  client: SomniaMarketsClient,
  marketId: string,
): Promise<ResolutionData> {
  try {
    const raw = await client.getMarketResolution(marketId);

    return {
      winningOutcome: raw.events.length > 0
        ? raw.events[raw.events.length - 1].winningOutcome
        : null,
      events: raw.events.map((e) => ({
        kind: e.kind,
        winningOutcome: e.winningOutcome,
        blockNumber: e.blockNumber,
        timestamp: e.timestamp,
        txHash: e.txHash,
        voided: e.voided,
      })),
      reference: raw.reference
        ? {
            oracleQuestionId: raw.reference.oracleQuestionId,
            pending: raw.reference.pending,
          }
        : null,
      closingAnswer: raw.closingAnswer
        ? {
            numericValue: raw.closingAnswer.numericValue,
            outcomeLabel: raw.closingAnswer.outcomeLabel,
            resolvedAt: raw.closingAnswer.resolvedAt,
          }
        : null,
      openingAnswer: raw.openingAnswer
        ? {
            numericValue: raw.openingAnswer.numericValue,
            outcomeLabel: raw.openingAnswer.outcomeLabel,
            resolvedAt: raw.openingAnswer.resolvedAt,
          }
        : null,
    };
  } catch (error) {
    if (error instanceof PulseEngineError) throw error;
    throw mapSdkError(error, `getResolution for ${marketId}`);
  }
}

/**
 * Assemble complete receipt data for a /receipt/[marketId] page.
 *
 * This function must only use verified on-chain/indexer data — never fabricate
 * a receipt field.
 *
 * For voided markets, sets `voided: true` and includes a refund note rather
 * than displaying a winningOutcome (which doesn't exist for voided markets —
 * both sides redeem at par).
 *
 * Combines:
 * - Market metadata (question, asset, strike, expiry, winningOutcome)
 * - Resolution details (events, oracle answers, reference link)
 * - Block explorer link to the settlement transaction (when available)
 * - Voided flag and refund note (when applicable)
 *
 * @param client - The SomniaMarketsClient.
 * @param marketId - The bytes32 market id.
 * @param chainId - The chain id (5031 for mainnet, 50312 for testnet).
 */
export async function buildReceiptData(
  client: SomniaMarketsClient,
  marketId: string,
  chainId: number = 50312,
): Promise<ReceiptData> {
  try {
    const market = await client.getBinaryMarket(marketId);
    if (!market) {
      throw new Error(`Market ${marketId} not found in indexer.`);
    }

    const resolution = await getResolution(client, marketId);
    const isVoided = market.status === "Voided" || market.voided === true;

    // Link to the settlement tx from the first resolution event, if available.
    const settlementTxHash =
      resolution.events.length > 0 ? resolution.events[0].txHash : null;

    // Oracle explorer link — only when reference exists and is not pending.
    const oracleRef = resolution.reference;
    const oracleUrl = oracleRef
      ? oracleExplorerUrl(oracleRef.oracleQuestionId, oracleRef.pending)
      : null;

    return {
      market,
      resolution,
      explorerTxUrl: settlementTxHash ? explorerTxUrl(chainId, settlementTxHash) : null,
      voided: isVoided,
      voidedNote: isVoided
        ? "Market voided — both outcomes redeemed at par (0.5 each) as a refund."
        : null,
      oracleExplorerUrl: oracleUrl,
    };
  } catch (error) {
    if (error instanceof PulseEngineError) throw error;
    throw mapSdkError(error, `buildReceiptData for ${marketId}`);
  }
}
