/**
 * Chain-ID validation guard for all transaction submission points.
 *
 * Reads the wallet's ACTUAL current chain ID fresh from the walletClient
 * (not from any cached React state) and compares it to the required chain.
 * Throws a clear PulseEngineError if mismatched, preventing any transaction
 * from being sent on the wrong network.
 *
 * This is a backstop independent of the ChainMismatchBanner UI warning.
 */

import type { WalletClient } from 'viem';
import { PulseErrorCode, PulseEngineError } from '@/lib/engine/errors';

/** Required chain ID for Somnia Shannon Testnet. */
export const REQUIRED_CHAIN_ID = 50312;

/** Human-readable chain name for error messages. */
export const REQUIRED_CHAIN_NAME = 'Somnia Shannon Testnet';

/**
 * Assert that the wallet is on the correct chain before submitting a transaction.
 *
 * Reads chain ID fresh from `walletClient.chain.id` — this is the wallet's
 * actual current chain, not a cached React state value.
 *
 * @param walletClient - The wagmi walletClient returned by getWalletClient().
 * @param context - What operation was being attempted (for error messages).
 * @throws PulseEngineError with code WRONG_CHAIN if chain doesn't match.
 */
export function assertCorrectChain(
  walletClient: WalletClient,
  context: string,
): void {
  const currentChainId = walletClient.chain?.id;

  if (currentChainId === undefined || currentChainId === null) {
    throw new PulseEngineError(
      PulseErrorCode.WRONG_CHAIN,
      context,
      'Could not detect your wallet network. Please ensure your wallet is connected and try again.',
    );
  }

  if (currentChainId !== REQUIRED_CHAIN_ID) {
    throw new PulseEngineError(
      PulseErrorCode.WRONG_CHAIN,
      context,
      `Your wallet is on the wrong network (chain ${currentChainId}). Switch to ${REQUIRED_CHAIN_NAME} (${REQUIRED_CHAIN_ID}) and try again.`,
    );
  }
}
