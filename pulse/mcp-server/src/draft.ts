/**
 * draft_trade_link — pure input validation + URL construction.
 *
 * This module deliberately contains ZERO engine/network access so it can be
 * unit-tested in isolation. The tool handler in `tools.ts` calls
 * `validateDraftTrade` after confirming the market exists on the indexer.
 *
 * `draft_trade_link` NEVER executes a trade. It validates that the inputs are
 * well-formed and returns a real, clickable URL back to Pulse's own app where
 * the user reviews and confirms the trade themselves in their own wallet.
 */

/** Sides the Pulse trade ticket supports (the yes/no outcome selector). */
export type DraftSide = "yes" | "no";

export interface DraftValidationOk {
  ok: true;
  /** Normalized side ("yes" | "no"). */
  side: DraftSide;
  /** Human amount exactly as it will appear in the URL (no trailing zeros added). */
  amountText: string;
  /** The built trade-draft URL. */
  url: string;
}

export interface DraftValidationErr {
  ok: false;
  /** Human-readable reason for the rejection. */
  error: string;
}

export type DraftValidationResult = DraftValidationOk | DraftValidationErr;

const SIDE_VALUES: readonly string[] = ["yes", "no"] as const;
/** Amount must be a plain positive decimal with at most 6 fractional digits. */
const AMOUNT_PATTERN = /^\d+(?:\.\d{1,6})?$/;
/** Upper bound that makes sense for a demo trade on test USDC. */
const MAX_AMOUNT = 1_000_000;

/**
 * Normalize a raw `side` argument. Accepts exactly `yes` / `no`
 * (case-insensitive). Anything else is rejected — we do not guess.
 */
export function normalizeDraftSide(raw: unknown): DraftSide | null {
  if (typeof raw !== "string") return null;
  const lowered = raw.trim().toLowerCase();
  return (SIDE_VALUES as readonly string[]).includes(lowered)
    ? (lowered as DraftSide)
    : null;
}

/**
 * Validate a raw human amount ("25", "12.5", "0.5"). Returns the canonical
 * text form on success, or a message on failure.
 */
export function validateHumanAmount(raw: unknown): { ok: true; text: string } | { ok: false; error: string } {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, error: "humanAmount must be a non-empty string like \"25\" or \"12.5\"." };
  }
  const text = raw.trim();
  if (!AMOUNT_PATTERN.test(text)) {
    return {
      ok: false,
      error:
        "humanAmount must be a positive decimal with at most 6 fractional digits (e.g. \"25\" or \"12.5\"); got \"" +
        text +
        "\".",
    };
  }
  const numeric = Number(text);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return { ok: false, error: "humanAmount must be greater than zero." };
  }
  if (numeric > MAX_AMOUNT) {
    return { ok: false, error: "humanAmount is unrealistically large (max " + MAX_AMOUNT + " test USDC)." };
  }
  return { ok: true, text };
}

/**
 * Build the draft URL for a confirmed market. `marketId` must be the bytes32
 * market id (same value that routes /market/[id] in the Pulse web app).
 */
export function buildDraftTradeUrl(opts: {
  marketId: string;
  side: DraftSide;
  amountText: string;
  appUrl: string;
}): string {
  const params = new URLSearchParams({
    prefillSide: opts.side,
    prefillAmount: opts.amountText,
  });
  // marketId is a 0x-hex bytes32 — safe in a path segment, but trim any
  // whitespace the model may have wrapped it in.
  const marketPath = encodeURIComponent(opts.marketId.trim());
  const base = opts.appUrl.replace(/\/+$/, "");
  return `${base}/market/${marketPath}?${params.toString()}`;
}

/**
 * Validate side + amount and produce the trade-draft URL. This is the
 * no-network half of the `draft_trade_link` tool (market existence is checked
 * by the caller via `getMarketById`).
 */
export function validateDraftTrade(opts: {
  marketId: string;
  side: unknown;
  humanAmount: unknown;
  appUrl: string;
}): DraftValidationResult {
  if (typeof opts.marketId !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(opts.marketId.trim())) {
    return {
      ok: false,
      error:
        "marketId must be the market's bytes32 id (0x + 64 hex chars), e.g. the id returned by list_live_markets.",
    };
  }

  const side = normalizeDraftSide(opts.side);
  if (!side) {
    return { ok: false, error: "side must be \"yes\" or \"no\" (case-insensitive)." };
  }

  const amount = validateHumanAmount(opts.humanAmount);
  if (!amount.ok) return amount;

  return {
    ok: true,
    side,
    amountText: amount.text,
    url: buildDraftTradeUrl({
      marketId: opts.marketId.trim(),
      side,
      amountText: amount.text,
      appUrl: opts.appUrl,
    }),
  };
}
