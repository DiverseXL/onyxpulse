/**
 * Trade-ticket prefill parsing — supports the MCP `draft_trade_link` flow.
 *
 * Pulse's hosted MCP server returns links shaped like
 * `/market/{marketId}?prefillSide={side}&prefillAmount={amount}`. This module
 * parses those params so the market detail page can pre-fill the side selector
 * and amount input when such a link is opened. It never auto-submits anything —
 * the user must review and confirm.
 */

export interface PrefillValues {
  /** Outcome side; defaults to "yes" when only an amount was provided. */
  side: "yes" | "no";
  /** Amount in test USDC, or null when absent/invalid. */
  amount: number | null;
}

/** Upper bound kept consistent with the MCP draft_trade_link validation. */
const MAX_PREFILL_AMOUNT = 1_000_000;

/** Accepts plain positive decimals with at most 6 fractional digits. */
const AMOUNT_PATTERN = /^\d+(?:\.\d{1,6})?$/;

/**
 * Parse `prefillSide` / `prefillAmount` from a URL's search params.
 * Returns null when neither param is present/valid — callers then skip prefill.
 */
export function parsePrefillParams(searchParams: URLSearchParams): PrefillValues | null {
  const sideRaw = searchParams.get("prefillSide");
  const amountRaw = searchParams.get("prefillAmount");

  let side: "yes" | "no" | null = null;
  if (sideRaw === "yes" || sideRaw === "no") side = sideRaw;

  let amount: number | null = null;
  if (amountRaw !== null && AMOUNT_PATTERN.test(amountRaw)) {
    const n = Number(amountRaw);
    if (Number.isFinite(n) && n > 0 && n <= MAX_PREFILL_AMOUNT) amount = n;
  }

  if (side === null && amount === null) return null;
  return { side: side ?? "yes", amount };
}