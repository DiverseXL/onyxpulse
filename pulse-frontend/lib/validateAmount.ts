/**
 * Shared amount validation for all numeric input fields across the app.
 *
 * Validates on-blur and before submission, returning specific error messages
 * for each rejected case. Reuses toBigintAmount's over-precision check
 * instead of reimplementing it.
 *
 * NO EMOJI in code or comments.
 */

import { toBigintAmount } from '@/lib/engine/units';

export interface AmountValidationResult {
  valid: boolean;
  /** Specific error message if invalid, empty string if valid. */
  error: string;
  /** Warning message (non-blocking) if amount exceeds balance. */
  warning: string;
}

/**
 * Validate a trade/input amount string against all rejection criteria.
 *
 * @param rawValue - The raw string from the input field.
 * @param opts - Validation options.
 * @returns Validation result with error/warning messages.
 */
export function validateAmount(
  rawValue: string,
  opts: {
    /** Whether zero is a valid value (false for trade amounts, true for some settings). */
    allowZero?: boolean;
    /** Token decimals for over-precision check (default 6 for USDC). */
    decimals?: number;
    /** Wallet balance for soft warning (human units). */
    walletBalance?: number;
    /** Multiplier threshold for balance warning (default 10). */
    balanceWarningMultiplier?: number;
    /** Field label for error messages. */
    fieldLabel?: string;
  } = {},
): AmountValidationResult {
  const {
    allowZero = false,
    decimals = 6,
    walletBalance,
    balanceWarningMultiplier = 10,
    fieldLabel = 'Amount',
  } = opts;

  const trimmed = rawValue.trim();

  // Empty input
  if (trimmed === '') {
    return { valid: false, error: `${fieldLabel} is required.`, warning: '' };
  }

  // Scientific notation (e.g. "1e10", "5E-3")
  if (/[eE]/.test(trimmed)) {
    return {
      valid: false,
      error: `${fieldLabel} cannot use scientific notation. Enter a plain number instead.`,
      warning: '',
    };
  }

  // Non-numeric check: must be a valid finite number
  const num = Number(trimmed);
  if (!Number.isFinite(num)) {
    return {
      valid: false,
      error: `${fieldLabel} must be a valid number.`,
      warning: '',
    };
  }

  // NaN check (redundant with isFinite but explicit)
  if (Number.isNaN(num)) {
    return {
      valid: false,
      error: `${fieldLabel} must be a valid number.`,
      warning: '',
    };
  }

  // Negative
  if (num < 0) {
    return {
      valid: false,
      error: `${fieldLabel} cannot be negative.`,
      warning: '',
    };
  }

  // Zero
  if (num === 0 && !allowZero) {
    return {
      valid: false,
      error: `${fieldLabel} must be greater than zero.`,
      warning: '',
    };
  }

  // Over-precision: delegate to toBigintAmount which throws on too many decimals
  try {
    toBigintAmount(trimmed, decimals);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      error: `${fieldLabel} has too many decimal places. ${msg}`,
      warning: '',
    };
  }

  // Soft warning: amount exceeds wallet balance * multiplier
  let warning = '';
  if (walletBalance !== undefined && walletBalance > 0 && num > walletBalance * balanceWarningMultiplier) {
    warning = `This amount is larger than your available balance — the transaction will fail if submitted.`;
  }

  return { valid: true, error: '', warning };
}
