/**
 * Typed error mapping layer for the Pulse engine.
 *
 * Maps raw SDK/contract revert reasons to consistent, typed PulseEngineError
 * instances so the frontend can handle errors predictably by code, not by
 * fragile string matching.
 *
 * Convention: import from src/engine/index.ts, never from this file directly.
 */
import {
  ContractRevertError,
  SomniaMarketsError,
} from "@somnia-chain/markets-sdk";

// ─── Error codes ─────────────────────────────────────────────────────────────

/**
 * Canonical error codes for the Pulse engine.
 *
 * Each code maps to one or more SDK contract revert names. The frontend
 * switches on `code` — never on the raw error message.
 */
export const PulseErrorCode = {
  /** Price is off-tick, zero, or beyond 1. */
  INVALID_PRICE: "INVALID_PRICE",
  /** Transaction sender doesn't match the order owner. */
  INCORRECT_SENDER: "INCORRECT_SENDER",
  /** Collateral or outcome-token balance too low. */
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  /** Market is in the wrong lifecycle phase for this operation. */
  WRONG_STATUS: "WRONG_STATUS",
  /** Operator key lacks the required permission grant. */
  NOT_AUTHORIZED_OPERATOR: "NOT_AUTHORIZED_OPERATOR",
  /** Market not found in the indexer or on-chain. */
  MARKET_NOT_FOUND: "MARKET_NOT_FOUND",
  /** Market was already finalized / redeemed. */
  ALREADY_REDEEMED: "ALREADY_REDEEMED",
  /** IOC market order could not fill due to insufficient opposing liquidity. */
  NO_LIQUIDITY: "NO_LIQUIDITY",
  /** Unrecognised error — original message preserved. */
  UNKNOWN: "UNKNOWN",
} as const;

export type PulseErrorCode =
  (typeof PulseErrorCode)[keyof typeof PulseErrorCode];

// ─── Error class ─────────────────────────────────────────────────────────────

/**
 * Typed engine error with a machine-readable code and optional context.
 *
 * All engine functions throw PulseEngineError (or a subclass thereof) rather
 * than raw SDK errors. The frontend switches on `error.code` to decide
 * UI behaviour (e.g. show "Insufficient balance" banner vs. retry button).
 */
export class PulseEngineError extends Error {
  /** Machine-readable error code — the primary branching key for the UI. */
  readonly code: PulseErrorCode;

  /**
   * Human-readable context describing what the engine was doing when the
   * error occurred (e.g. "placeLimitOrder for pool 0x…").
   */
  readonly context: string;

  /** The original SDK/contract error, if any. Preserved for debugging. */
  readonly originalError?: unknown;

  constructor(
    code: PulseErrorCode,
    context: string,
    message: string,
    originalError?: unknown,
  ) {
    super(message);
    this.name = "PulseEngineError";
    this.code = code;
    this.context = context;
    this.originalError = originalError;
  }
}

// ─── Error mapping ───────────────────────────────────────────────────────────

/**
 * Contract error names that map to each PulseErrorCode.
 *
 * These are the `errorName` values from the SDK's `ContractRevertError` —
 * the decoded Solidity custom-error names from `contractErrorsAbi`.
 */
const ERROR_NAME_TO_CODE: Record<string, PulseErrorCode> = {
  // Price / order validation
  InvalidPrice: PulseErrorCode.INVALID_PRICE,
  OrderAlreadyExpired: PulseErrorCode.INVALID_PRICE,
  OrderExpiryBeyondMarket: PulseErrorCode.INVALID_PRICE,
  ExpiredOrderMustBeCancelled: PulseErrorCode.INVALID_PRICE,
  LotSizeNotAligned: PulseErrorCode.INVALID_PRICE,
  MinQuantityNotMet: PulseErrorCode.INVALID_PRICE,
  QuantityNotAligned: PulseErrorCode.INVALID_PRICE,
  TickSizeNotAligned: PulseErrorCode.INVALID_PRICE,

  // Sender / ownership
  IncorrectSender: PulseErrorCode.INCORRECT_SENDER,
  NotOwner: PulseErrorCode.INCORRECT_SENDER,

  // Balance
  InsufficientBalance: PulseErrorCode.INSUFFICIENT_BALANCE,
  BackingMismatch: PulseErrorCode.INSUFFICIENT_BALANCE,

  // Market status
  WrongStatus: PulseErrorCode.WRONG_STATUS,
  MarketNotSettled: PulseErrorCode.WRONG_STATUS,

  // Operator / auth
  Unauthorized: PulseErrorCode.NOT_AUTHORIZED_OPERATOR,
  AccessControlUnauthorizedAccount: PulseErrorCode.NOT_AUTHORIZED_OPERATOR,
  AdapterNotApproved: PulseErrorCode.NOT_AUTHORIZED_OPERATOR,

  // Settlement
  AlreadyFinalized: PulseErrorCode.ALREADY_REDEEMED,

  // Liquidity
  ImmediateOrCancelNoFill: PulseErrorCode.NO_LIQUIDITY,
};

/**
 * Map a raw error (from SDK, contract, or unknown source) to a typed
 * PulseEngineError.
 *
 * Inspects the error in priority order:
 * 1. `ContractRevertError` with `errorName` → mapped code
 * 2. `SomniaMarketsError` (base SDK error) → UNKNOWN with original message
 * 3. Generic `Error` → UNKNOWN with original message
 * 4. Non-Error value → UNKNOWN with stringified value
 *
 * The original error is always preserved in `originalError` for debugging.
 *
 * @param err - The caught error.
 * @param context - What the engine was doing (e.g. "placeLimitOrder for pool 0x…").
 * @returns A typed PulseEngineError.
 */
export function mapSdkError(err: unknown, context: string): PulseEngineError {
  // 1. Contract revert — the primary path for on-chain failures.
  if (err instanceof ContractRevertError) {
    const errorName = err.errorName;
    const code =
      (errorName && ERROR_NAME_TO_CODE[errorName]) ?? PulseErrorCode.UNKNOWN;

    const reason = err.reason ?? errorName ?? "Contract reverted";
    return new PulseEngineError(
      code,
      context,
      `${context}: ${reason}`,
      err,
    );
  }

  // 2. SDK-level error (InvalidInput, NotConfigured, Indexer, Rpc, etc.)
  if (err instanceof SomniaMarketsError) {
    return new PulseEngineError(
      PulseErrorCode.UNKNOWN,
      context,
      `${context}: ${err.message}`,
      err,
    );
  }

  // 3. Standard JS error.
  if (err instanceof Error) {
    return new PulseEngineError(
      PulseErrorCode.UNKNOWN,
      context,
      `${context}: ${err.message}`,
      err,
    );
  }

  // 4. Non-Error thrown value.
  return new PulseEngineError(
    PulseErrorCode.UNKNOWN,
    context,
    `${context}: ${String(err)}`,
    err,
  );
}
