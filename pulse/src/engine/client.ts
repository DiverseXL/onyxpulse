import type { SomniaMarketsClient, TxResult } from "@somnia-chain/markets-sdk";
import { SomniaMarkets, SOMNIA_TESTNET_ADDRESSES, SOMNIA_MAINNET_ADDRESSES, SOMNIA_TESTNET_PRICE_FEED } from "@somnia-chain/markets-sdk";
import { somniaShannon, somniaMainnet } from "@somnia-chain/markets-sdk/chains";

export interface PulseClient {
  /** The raw engine — bigint-exact reads, watches, one-shot fetches. */
  client: SomniaMarketsClient;
  /** The exchange instance — symbol-level API, createOrder, fetchMarkets. */
  exchange: SomniaMarkets;
}

/**
 * Create a Pulse client connected to the DreamDEX Shannon testnet.
 * Uses the SDK's baked-in testnet addresses — no manual contract config needed.
 */
/**
 * OperatorPermissionsRegistry on Shannon testnet (chain 50312).
 * Source: official DreamDEX docs (docs.dreamdex.io/trading/readme-1/operators)
 * SOMNIA_TESTNET_ADDRESSES does not include this — it must be merged explicitly.
 */
const TESTNET_OPERATOR_PERMISSIONS_REGISTRY =
  "0x15C7e8CE38F021c5b45d098AaD788f63090bF20A" as const;

export function createPulseClient(): PulseClient {
  const exchange = new SomniaMarkets({
    chain: somniaShannon,
    wsRpcUrl: "wss://api.infra.testnet.somnia.network/ws",
    indexerUrl: "https://dev.smk.somnia.host/v1/graphql",
    addresses: {
      ...SOMNIA_TESTNET_ADDRESSES,
      operatorPermissionsRegistry: TESTNET_OPERATOR_PERMISSIONS_REGISTRY,
    },
    priceFeed: SOMNIA_TESTNET_PRICE_FEED,
  });

  return { client: exchange.client, exchange };
}

/**
 * Create a Pulse client connected to Somnia mainnet.
 * Not wired into the app — reserved for future mainnet support.
 */
export function createPulseMainnetClient(): PulseClient {
  const exchange = new SomniaMarkets({
    chain: somniaMainnet,
    wsRpcUrl: "wss://api.infra.mainnet.somnia.network/ws",
    indexerUrl: "https://prd.smk.somnia.host/v1/graphql",
    addresses: SOMNIA_MAINNET_ADDRESSES,
  });

  return { client: exchange.client, exchange };
}

/**
 * Create a trader instance bound to a private key for signing transactions.
 *
 * @param pulseClient - The Pulse client (from createPulseClient/createPulseMainnetClient).
 * @param privateKey - Hex-encoded private key (0x-prefixed).
 * @param decimals - Token decimals (default 6 for TestUSDC on testnet).
 */
export function createTrader(
  pulseClient: PulseClient,
  privateKey: string,
  decimals: number = 6,
) {
  return pulseClient.client.createTrader({ privateKey, decimals });
}

/**
 * One-shot convenience: create a testnet client + trader + request faucet funds.
 *
 * Provides 10,000 test USDC (6dp) collateral via direct call to the
 * testUsdc contract's own faucet() function. Does NOT provide STT gas —
 * that must be claimed separately from https://testnet.somnia.network/
 * before this wallet can submit any transaction, including this one.
 *
 * Prerequisites:
 *   1) Claim STT gas from https://testnet.somnia.network/ for this wallet FIRST.
 *   2) Then call this function to get test USDC collateral.
 *   Order matters — faucet() itself is a transaction and needs gas to execute.
 *
 * @param privateKey - Hex-encoded private key (0x-prefixed) of the wallet to fund.
 * @param amount - Optional raw amount (default 10_000 × 10^6 = 10,000 test USDC).
 * @returns The faucet transaction result.
 */
export async function requestDemoFunds(
  privateKey: string,
  amount?: bigint,
): Promise<TxResult> {
  const exchange = new SomniaMarkets({
    chain: somniaShannon,
    wsRpcUrl: "wss://api.infra.testnet.somnia.network/ws",
    indexerUrl: "https://dev.smk.somnia.host/v1/graphql",
    addresses: {
      ...SOMNIA_TESTNET_ADDRESSES,
      operatorPermissionsRegistry: TESTNET_OPERATOR_PERMISSIONS_REGISTRY,
    },
    privateKey,
  });

  return exchange.trader.faucet(amount !== undefined ? { amount } : undefined);
}
