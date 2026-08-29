/**
 * TESTNET-ONLY DEMO UTILITIES. Never import into production/mainnet code path.
 *
 * These functions wrap the SDK's testnet-specific writes (faucet, resolve,
 * voidMarket) for use in demos and integration tests on the Shannon testnet
 * (chain id 50312). They are guarded at runtime against mainnet usage.
 *
 * Manual pre-demo checklist:
 *   1) Claim STT gas from https://testnet.somnia.network/ for the demo wallet FIRST.
 *   2) Then call requestTestFunds() to get test USDC collateral.
 *   Order matters — faucet() itself is a transaction and needs gas to execute.
 *
 * Faucet details:
 *   - Provides 10,000 test USDC (6dp) collateral via direct call to the
 *     testUsdc contract's own faucet() function.
 *   - Does NOT provide STT gas — that must be claimed separately from
 *     https://testnet.somnia.network/ before this wallet can submit any
 *     transaction, including this one.
 *   - Does NOT touch the separate spot token-faucet contract
 *     (0x89Ebc05dE83aB9752B95030218BB10A542b96B7C) — that one is only for
 *     SOMI/WBTC/WETH spot test tokens, irrelevant to Event Contracts.
 */

import type { Address } from "viem";
import type { TxResult, SomniaMarketsClient } from "@somnia-chain/markets-sdk";

// ─── Constants ───────────────────────────────────────────────────────────────

const MAINNET_CHAIN_ID = 5031;

// ─── Trader type (matches SDK's Trader interface) ────────────────────────────

type Trader = {
  faucet(params?: { amount?: bigint; gas?: bigint }): Promise<TxResult>;
  resolve(params: { market: Address; outcomeIdx: 0 | 1; gas?: bigint }): Promise<TxResult>;
  voidMarket(params: { market: Address; gas?: bigint }): Promise<TxResult>;
};

// ─── Runtime guard ───────────────────────────────────────────────────────────

/**
 * Throw immediately if the client is configured for mainnet.
 * All demo utilities must pass this check before doing anything.
 */
function assertTestnet(client: SomniaMarketsClient, fnName: string): void {
  const chainId = client.config.chain?.id;
  if (chainId === MAINNET_CHAIN_ID) {
    throw new Error(
      `${fnName} is TESTNET-ONLY. The client is configured for mainnet (chain id ${MAINNET_CHAIN_ID}). ` +
        `Never use demo utilities in production.`,
    );
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

/**
 * Request test USDC collateral from the testnet faucet.
 *
 * Provides 10,000 test USDC (6dp) collateral via direct call to the
 * testUsdc contract's own faucet() function. Does NOT provide STT gas —
 * that must be claimed separately from https://testnet.somnia.network/
 * before this wallet can submit any transaction, including this one.
 *
 * Does NOT touch the separate spot token-faucet contract — irrelevant
 * to Event Contracts.
 *
 * @param trader - A Trader instance (from createTrader).
 * @param client - The SomniaMarketsClient (for mainnet guard).
 * @param params - Optional: custom amount in raw units (default 10_000 × 10^6).
 */
export async function requestTestFunds(
  trader: Trader,
  client: SomniaMarketsClient,
  params?: { amount?: bigint; gas?: bigint },
): Promise<TxResult> {
  assertTestnet(client, "requestTestFunds");

  try {
    return await trader.faucet(params);
  } catch (error) {
    throw new Error(
      `requestTestFunds failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Force-resolve a binary market using the FakeOracle (testnet demo resolver).
 *
 * Resolves the market to the specified outcome. Only works on testnet where
 * the FakeOracle is deployed — on mainnet this would revert because there
 * is no FakeOracle contract.
 *
 * IMPORTANT: SOMNIA_TESTNET_ADDRESSES does not include a fakeOracle address.
 * The SDK's resolve() reads from `p.fakeOracle ?? w.addresses().fakeOracle`.
 * Since neither is set by default, you MUST supply the fakeOracle address
 * via params.fakeOracleAddress. Find it from the testnet explorer or deploy
 * manifest for the current Shannon testnet deployment.
 *
 * Use this to create a clean demo scenario without waiting for real oracle
 * timing. After resolving, you can finalize and redeem.
 *
 * @param trader - A Trader instance (from createTrader).
 * @param client - The SomniaMarketsClient (for mainnet guard).
 * @param marketAddress - The BinaryMarket contract ADDRESS (not the bytes32 marketId — resolve/varies.resolve needs the clone address).
 * @param params.outcomeIdx - 0 for YES wins, 1 for NO wins.
 * @param params.fakeOracleAddress - The FakeOracle contract address on Shannon testnet. Required because SOMNIA_TESTNET_ADDRESSES does not include it.
 */
export async function forceResolveMarket(
  trader: Trader,
  client: SomniaMarketsClient,
  marketAddress: Address,
  params: {
    outcomeIdx: 0 | 1;
    fakeOracleAddress: Address;
    gas?: bigint;
  },
): Promise<TxResult> {
  assertTestnet(client, "forceResolveMarket");

  try {
    return await trader.resolve({
      market: marketAddress,
      outcomeIdx: params.outcomeIdx,
      fakeOracle: params.fakeOracleAddress,
      gas: params.gas,
    });
  } catch (error) {
    throw new Error(
      `forceResolveMarket failed for ${marketAddress}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Force-void a binary market using the FakeOracle (testnet demo resolver).
 *
 * Voids the market so both sides redeem at half collateral. Only works on
 * testnet where the FakeOracle is deployed.
 *
 * IMPORTANT: SOMNIA_TESTNET_ADDRESSES does not include a fakeOracle address.
 * Supply the fakeOracle address via params.fakeOracleAddress.
 *
 * @param trader - A Trader instance (from createTrader).
 * @param client - The SomniaMarketsClient (for mainnet guard).
 * @param marketAddress - The BinaryMarket contract ADDRESS.
 */
export async function forceVoidMarket(
  trader: Trader,
  client: SomniaMarketsClient,
  marketAddress: Address,
  params: {
    fakeOracleAddress: Address;
    gas?: bigint;
  },
): Promise<TxResult> {
  assertTestnet(client, "forceVoidMarket");

  try {
    return await trader.voidMarket({
      market: marketAddress,
      fakeOracle: params.fakeOracleAddress,
      gas: params.gas,
    });
  } catch (error) {
    throw new Error(
      `forceVoidMarket failed for ${marketAddress}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
