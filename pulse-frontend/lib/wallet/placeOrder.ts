'use client';

/**
 * Client-side order placement using the engine's placeMarketOrder.
 *
 * Delegates to the already-tested engine function from lib/engine/trading.ts
 * which handles:
 *   - Correct contract function call (placeBinaryOrder, not placeOrder)
 *   - Correct argument order and types
 *   - Market-expiry-aware default expiry (not hardcoded 0)
 *   - Correct ORDER_TYPE.MARKET (2), not ORDER_TYPE.FILL_OR_KILL (1)
 *   - Auto-approval of the escrow token (no separate approve tx needed)
 *   - On-chain status gate via assertMarketWritable
 *
 * The previous implementation hand-built the raw pool.placeOrder call with
 * several critical bugs that caused on-chain reverts.
 */

import type { WalletClient, Account } from 'viem';
import { createPulseClient } from '@/lib/engine/client';
import { placeMarketOrder } from '@/lib/engine/trading';
import { PulseErrorCode, PulseEngineError } from '@/lib/engine/errors';
import { checkRiskLimits } from '@/lib/engine/riskEngine';
import { loadSettings } from '@/lib/settings';

// -- Constants ---------------------------------------------------------------

/** Block explorer base URL for Somnia Shannon testnet. */
const EXPLORER_TX_URL = 'https://shannon-explorer.somnia.network/tx/' as const;

// -- Types -------------------------------------------------------------------

export interface PlaceClientOrderParams {
  /** The binary pool contract address. */
  poolAddress: string;
  /** The market's bytes32 ID (for assertMarketWritable). */
  marketId: string;
  /** Trade side. */
  side: 'BUY_YES' | 'BUY_NO' | 'SELL_YES' | 'SELL_NO';
  /** Price in cents (e.g. 62 for 62%). */
  priceCents: number;
  /** USDC amount to spend (human units). */
  amount: number;
  /** Token decimals (default 6 for test USDC). */
  decimals?: number;
}

export interface PlaceClientOrderResult {
  /** Transaction hash of the placeOrder call. */
  hash: string;
  /** Explorer URL for the transaction. */
  explorerUrl: string;
}

// -- Helpers -----------------------------------------------------------------

/**
 * Convert cents to a human-readable decimal string safely (no floating-point).
 * E.g. 62 cents → "0.62"
 *
 * This is the format expected by placeMarketOrder's humanPrice param.
 */
function centsToHumanString(cents: number): string {
  // Use string math to avoid IEEE 754 issues
  const centsStr = String(cents);
  const dotIdx = centsStr.indexOf('.');
  const intPart = dotIdx === -1 ? centsStr : centsStr.slice(0, dotIdx);
  const fracPart = dotIdx === -1 ? '' : centsStr.slice(dotIdx + 1);

  // cents / 100 = shift decimal left by 2
  const combined = intPart + fracPart;
  const shifted = combined.padStart(3, '0'); // ensure at least "0.00"
  const resultInt = shifted.slice(0, -2) || '0';
  const resultFrac = shifted.slice(-2);
  return `${resultInt}.${resultFrac}`;
}

/**
 * Convert amount / price to quantity using string math (no float division).
 * quantity = amount / price (both in human units).
 *
 * This is the format expected by placeMarketOrder's humanQuantity param.
 */
function computeQuantityString(amount: number, priceCents: number): string {
  // quantity = amount / (priceCents / 100) = (amount * 100) / priceCents
  // Use BigInt to avoid float issues
  const amountScaled = BigInt(Math.round(amount * 1_000_000)); // 6 decimals
  const priceScaled = BigInt(Math.round(priceCents * 10_000)); // 6-2=4 decimals, but priceCents is integer so *10000 gives 6 decimal places
  if (priceScaled === 0n) return '0.000000';

  // quantity = amountScaled / priceScaled, both in 10^6 scale
  // But priceScaled is priceCents * 10000 (= priceCents * 10^(6-2))
  // and amountScaled is amount * 1000000 (= amount * 10^6)
  // So quantity = (amount * 10^6) / (priceCents * 10^4) = (amount * 100) / priceCents
  // We want this in human units with 6 decimal places
  // quantity_human = amount / (priceCents / 100) = amount * 100 / priceCents
  // scaled = quantity_human * 10^6 = amount * 100 * 10^6 / priceCents

  const quantityScaled = (amountScaled * 1_000_000n) / (priceScaled);
  // Convert back to human string
  const str = quantityScaled.toString().padStart(7, '0');
  const intPart = str.slice(0, str.length - 6) || '0';
  const fracPart = str.slice(str.length - 6);
  return `${intPart}.${fracPart}`;
}

// -- Main export -------------------------------------------------------------

/**
 * Place a market order (IOC) via the user's connected wallet.
 *
 * Delegates to the engine's placeMarketOrder which handles:
 *   - on-chain status gate (assertMarketWritable)
 *   - correct contract function call (placeBinaryOrder)
 *   - market-expiry-aware default expiry
 *   - correct ORDER_TYPE.MARKET (2)
 *   - auto-approval of the escrow token
 *   - tick/lot alignment via the SDK
 *
 * @throws PulseEngineError on failure (typed error with code).
 */
export async function placeClientOrder(
  walletClient: WalletClient,
  account: Account,
  params: PlaceClientOrderParams,
): Promise<PlaceClientOrderResult> {
  const {
    poolAddress,
    side,
    priceCents,
    amount,
    decimals = 6,
  } = params;

  if (!account?.address) {
    throw new PulseEngineError(
      PulseErrorCode.UNKNOWN,
      'placeClientOrder',
      'Wallet not connected -- please connect your wallet first.',
    );
  }

  if (priceCents <= 0 || priceCents >= 100) {
    throw new PulseEngineError(
      PulseErrorCode.INVALID_PRICE,
      'placeClientOrder',
      `Invalid price: ${priceCents} cents. Must be between 1 and 99.`,
    );
  }

  if (amount <= 0) {
    throw new PulseEngineError(
      PulseErrorCode.INVALID_PRICE,
      'placeClientOrder',
      `Invalid amount: ${amount}. Must be greater than 0.`,
    );
  }

  // Create PulseClient and trader bound to the wallet
  const pulse = createPulseClient();
  const trader = pulse.client.createTrader({ walletClient });

  // Convert params to the format expected by placeMarketOrder
  const humanPrice = centsToHumanString(priceCents);
  const humanQuantity = computeQuantityString(amount, priceCents);

  // Check risk limits before submitting (if enabled)
  const settings = loadSettings(account.address);
  if (settings.riskLimitsEnabled && params.marketId) {
    const riskCheck = await checkRiskLimits(
      pulse.client,
      account.address as `0x${string}`,
      params.marketId,
      String(amount),
      settings.riskLimits,
    );
    if (!riskCheck.allowed) {
      throw new PulseEngineError(
        PulseErrorCode.UNKNOWN,
        'placeClientOrder',
        `Trade blocked by risk limits: ${riskCheck.reason}`,
      );
    }
  }

  try {
    const result = await placeMarketOrder(pulse.client, trader, {
      pool: poolAddress as `0x${string}`,
      side,
      humanPrice,
      humanQuantity,
      decimals,
    });

    return {
      hash: result.hash,
      explorerUrl: `${EXPLORER_TX_URL}${result.hash}`,
    };
  } catch (err: unknown) {
    // Re-throw PulseEngineError as-is (already mapped by placeMarketOrder)
    if (err instanceof PulseEngineError) throw err;

    // Map raw errors to user-friendly messages
    const msg = err instanceof Error ? err.message : String(err);

    if (msg.includes('does not match the target chain')) {
      throw new PulseEngineError(
        PulseErrorCode.UNKNOWN,
        'placeClientOrder',
        'Wrong network -- your wallet is not on Somnia Testnet (chain 50312). Switch networks in MetaMask and try again.',
        err,
      );
    }
    if (msg.includes('User rejected') || msg.includes('rejected')) {
      throw new PulseEngineError(
        PulseErrorCode.UNKNOWN,
        'placeClientOrder',
        'Transaction rejected by user in MetaMask.',
        err,
      );
    }
    if (msg.includes('OrderExpiryBeyondMarket')) {
      throw new PulseEngineError(
        PulseErrorCode.INVALID_PRICE,
        'placeClientOrder',
        'Market is expiring too soon to place a safe order. Try a different market.',
        err,
      );
    }
    if (msg.includes('InsufficientBalance') || msg.includes('insufficient')) {
      throw new PulseEngineError(
        PulseErrorCode.INSUFFICIENT_BALANCE,
        'placeClientOrder',
        'Insufficient test USDC balance. Visit /faucet to get more test USDC.',
        err,
      );
    }

    throw new PulseEngineError(
      PulseErrorCode.UNKNOWN,
      'placeClientOrder',
      `Order placement failed: ${msg}`,
      err,
    );
  }
}
