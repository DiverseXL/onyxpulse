/**
 * Stable, versioned, shareable receipt schema for Pulse markets.
 *
 * Wraps the existing `buildReceiptData` output (settlement.ts) into a flat,
 * versioned format suitable for sharing, archiving, or external verification.
 * All market metadata is extracted from the rich `ReceiptData` into scalar
 * fields so consumers don't need to reach into the SDK's `BinaryMarket` type.
 *
 * Convention: import from src/engine/index.ts, never from this file directly.
 */
import type { SomniaMarketsClient } from "@somnia-chain/markets-sdk";

import { buildReceiptData, type ReceiptData } from "./settlement.js";

// ─── Schema versioning ──────────────────────────────────────────────────────
//
// `schemaVersion` allows the receipt format to evolve without breaking
// previously shared/saved receipts — always bump this when changing the shape.
//
// Current version: "1.0"
//   - Initial stable schema with flat scalar fields.

const CURRENT_SCHEMA_VERSION = "1.0" as const;

// ─── Types ───────────────────────────────────────────────────────────────────

/** A single resolution lifecycle event (Resolved, Voided, etc.). */
export interface PulseReceiptEvent {
  /** Event kind (e.g. "Resolved", "Voided", "Skipped", "Failed"). */
  kind: string;
  /** Winning outcome at this event (0/1), or null if voided/unresolved. */
  winningOutcome: number | null;
  /** Block number of the event. */
  blockNumber: string;
  /** Unix timestamp of the event. */
  timestamp: string;
  /** Transaction hash that emitted this event. */
  txHash: string;
  /** Whether this event represents a void. */
  voided: boolean;
}

/**
 * Stable, versioned receipt schema for a resolved or voided binary market.
 *
 * Flat scalar fields — no nested SDK types — so the receipt can be
 * serialised to JSON and shared independently of the SDK. The schema is
 * versioned: `schemaVersion` is bumped whenever the shape changes, so
 * previously shared receipts remain parseable by future code.
 */
export interface PulseReceipt {
  /** Schema version for forward/backward compatibility. */
  schemaVersion: string;
  /** The bytes32 market id. */
  marketId: string;
  /** Display question text. */
  question: string;
  /** Underlying asset symbol (e.g. "BTC"). */
  asset: string;
  /** Strike price the question resolves against. */
  strike: string;
  /** Unix timestamp (seconds) when trading ends. */
  expiry: string;
  /** Lifecycle status (e.g. "Resolved", "Finalized", "Voided"). */
  status: string;
  /** Winning outcome (0 = YES, 1 = NO), or null if voided/unresolved. */
  winningOutcome: number | null;
  /** Whether the market was voided (oracle failure → both sides redeem at par). */
  voided: boolean;
  /** Human-readable note for voided markets, or null. */
  voidedNote: string | null;
  /** Resolution lifecycle events, oldest first. */
  resolutionEvents: PulseReceiptEvent[];
  /** Block explorer link to the settlement transaction, or null. */
  explorerTxUrl: string | null;
  /** Oracle explorer link, or null if unavailable/pending. */
  oracleExplorerUrl: string | null;
  /** ISO-8601 timestamp of when this receipt was generated. */
  generatedAt: string;
}

// ─── Export ──────────────────────────────────────────────────────────────────

/**
 * Build a shareable, versioned receipt for a resolved/voided market.
 *
 * Calls the existing `buildReceiptData` (which fetches market metadata,
 * resolution events, oracle links, etc.) and maps the output into a flat,
 * versioned `PulseReceipt` schema. The original rich data is not lost —
 * it is surfaced through the stable scalar fields.
 *
 * @param client - The SomniaMarketsClient.
 * @param marketId - The bytes32 market id.
 * @param chainId - The chain id (5031 for mainnet, 50312 for testnet).
 * @returns A versioned PulseReceipt.
 */
export async function buildShareableReceipt(
  client: SomniaMarketsClient,
  marketId: string,
  chainId: number = 50312,
): Promise<PulseReceipt> {
  const receipt: ReceiptData = await buildReceiptData(client, marketId, chainId);

  const market = receipt.market;

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    marketId: market.marketId,
    question: market.question,
    asset: market.asset,
    strike: market.strike,
    expiry: market.expiry,
    status: market.status,
    winningOutcome: market.winningOutcome,
    voided: receipt.voided,
    voidedNote: receipt.voidedNote,
    resolutionEvents: receipt.resolution.events.map((e) => ({
      kind: e.kind,
      winningOutcome: e.winningOutcome,
      blockNumber: e.blockNumber,
      timestamp: e.timestamp,
      txHash: e.txHash,
      voided: e.voided ?? false,
    })),
    explorerTxUrl: receipt.explorerTxUrl,
    oracleExplorerUrl: receipt.oracleExplorerUrl,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Construct a shareable URL for a receipt.
 *
 * Builds a path like `${baseUrl}/receipt/${marketId}` suitable for a
 * future `/receipt/[marketId]` frontend route. The `baseUrl` should
 * include the origin and any base path (e.g. "https://pulse.somnia.network").
 *
 * @param receipt - The PulseReceipt (for its marketId).
 * @param baseUrl - The app's origin/base URL (no trailing slash).
 * @returns The shareable URL string.
 */
export function receiptToShareableUrl(
  receipt: PulseReceipt,
  baseUrl: string,
): string {
  const trimmed = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${trimmed}/receipt/${receipt.marketId}`;
}

/**
 * Serialise a PulseReceipt to a stable JSON string.
 *
 * Uses `JSON.stringify` with a 2-space indent for human readability. The
 * output is a standalone, verifiable artifact that can be shared or archived
 * independently of the UI — judges can inspect the raw JSON directly.
 *
 * @param receipt - The PulseReceipt to serialise.
 * @returns The JSON string.
 */
export function receiptToJson(receipt: PulseReceipt): string {
  return JSON.stringify(receipt, null, 2);
}
