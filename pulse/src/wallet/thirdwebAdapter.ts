/**
 * Thirdweb → OperatorSigner adapter.
 *
 * Bridges a Thirdweb smart wallet (with `sponsorGas: true`) into the
 * `{ walletClient, account }` shape that the engine's `OperatorSigner`
 * type and all engine write functions expect.
 *
 * ## Why this exists
 *
 * Thirdweb's built-in `viemAdapter.walletClient.toViem()` fails with
 * smart wallets — it throws "Wallet not connected" at runtime. This is
 * a known Thirdweb limitation: the adapter only works with EOAs, not
 * smart accounts backed by ERC-4337 entry points.
 *
 * This adapter is the workaround. It wraps Thirdweb's `sendTransaction`
 * as a viem-compatible `writeContract`, letting the engine call
 * `walletClient.writeContract(...)` exactly as it would with a normal
 * viem `WalletClient` — while the actual transaction submission goes
 * through Thirdweb's paymaster for gas sponsorship.
 *
 * ## Architecture
 *
 * ```
 * Thirdweb smartWallet(sponsorGas: true)
 *   → this adapter (createThirdwebOperatorSigner)
 *     → engine.writeContract → sendTransaction → paymaster → chain
 * ```
 *
 * ## Security
 *
 * - The adapter only exposes `writeContract` on the wallet client.
 *   All other WalletClient methods (`sendTransaction`, `signMessage`,
 *   etc.) throw descriptive errors if called — they are stubs to
 *   satisfy the viem `WalletClient` type, not functional code.
 * - The adapter does NOT hold private keys. Signing is delegated to
 *   Thirdweb's smart account, which manages keys internally.
 * - Gas sponsorship is controlled by Thirdweb's `sponsorGas: true`
 *   flag on the smart wallet. The adapter does not modify sponsorship
 *   behavior.
 *
 * ## Confirmed compatibility
 *
 * This adapter was tested live against Somnia Shannon testnet (chain
 * 50312) in `spike-thirdweb-aa/`. Confirmed working:
 * - `faucet(10_000 USDC)` on TestUSDC → sponsored, STT stayed 0
 * - `approve + mintSet` on live DreamDEX BinaryPool → sponsored, STT stayed 0
 * - Both calls via `walletClient.writeContract(...)` through this adapter
 *
 * @module wallet/thirdwebAdapter
 */

import { encodeFunctionData, type Address, type Hex, type WalletClient, type Account } from "viem";
import type { OperatorSigner } from "../engine/operator.ts";

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A Thirdweb smart account created via `smartWallet().connect()`.
 *
 * We type this as `unknown` at the boundary because the Thirdweb SDK's
 * smart account types are opaque and version-coupled. The adapter only
 * uses `.address` (string) and `.signMessage()` (function), so any object
 * satisfying those two properties works.
 *
 * In practice, this is the return value of:
 * ```ts
 * const swFactory = smartWallet({ chain, sponsorGas: true });
 * const smartAccount = await swFactory.connect({ client, personalAccount });
 * ```
 */
export interface ThirdwebSmartAccount {
  /** The smart account's counterfactual address. */
  address: string;
  /**
   * Sign a message through the smart account.
   * Delegated from the underlying personal EOA key.
   */
  signMessage?: (params: { message: string | { raw: Hex } }) => Promise<Hex>;
}

/**
 * A Thirdweb client created via `createThirdwebClient()`.
 * Passed through to `sendTransaction` — the adapter does not call any
 * methods on it directly.
 */
export interface ThirdwebClient {
  /** Opaque Thirdweb client object — passed to sendTransaction. */
  [key: string]: unknown;
}

/**
 * A Thirdweb chain definition created via `defineChain()`.
 * Passed through to `sendTransaction` — the adapter does not call any
 * methods on it directly.
 */
export interface ThirdwebChain {
  /** The chain id (e.g. 50312 for Somnia Shannon testnet). */
  id: number;
  /** Opaque Thirdweb chain object — passed to sendTransaction. */
  [key: string]: unknown;
}

/**
 * Configuration for the Thirdweb → OperatorSigner adapter.
 */
export interface ThirdwebAdapterConfig {
  /** The Thirdweb smart account (from `smartWallet().connect()`). */
  smartAccount: ThirdwebSmartAccount;
  /** The Thirdweb client (from `createThirdwebClient()`). */
  client: ThirdwebClient;
  /** The Thirdweb chain definition (from `defineChain()`). */
  chain: ThirdwebChain;
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

/**
 * Create an `OperatorSigner` from a Thirdweb smart wallet.
 *
 * This is the primary entry point for the wallet adapter layer. The returned
 * object conforms exactly to the engine's `OperatorSigner` type and can be
 * passed directly to `placeMarketOrder`, `mintCompleteSet`, `redeemMarket`,
 * or any other engine write function that accepts a `Trader` or `OperatorSigner`.
 *
 * @example
 * ```ts
 * import { createThirdwebOperatorSigner } from "../wallet/thirdwebAdapter.ts";
 *
 * const swFactory = smartWallet({ chain, sponsorGas: true });
 * const smartAccount = await swFactory.connect({ client, personalAccount });
 *
 * const signer = createThirdwebOperatorSigner({
 *   smartAccount,
 *   client: thirdwebClient,
 *   chain: thirdwebChain,
 * });
 *
 * // Use with engine functions
 * await mintCompleteSet(signer, pulseClient, pool, "10", 6);
 * await placeMarketOrder(pulseClient, signer, { pool, side: "BUY_YES", ... });
 * ```
 *
 * @param config - The Thirdweb smart account, client, and chain.
 * @returns An `OperatorSigner` conforming to the engine's type.
 */
export function createThirdwebOperatorSigner(config: ThirdwebAdapterConfig): OperatorSigner {
  const { smartAccount, client: twClient, chain } = config;
  const accountAddress = smartAccount.address as Address;

  // ── viem Account ──────────────────────────────────────────────────────
  // The account object satisfies viem's Account interface. Type is "local"
  // because the account is managed locally (Thirdweb handles key storage).
  // Source is "thirdweb-smart" to distinguish from a raw EOA.
  const account: Account = {
    address: accountAddress,
    type: "local" as const,
    source: "thirdweb-smart" as const,
    async signMessage({ message }) {
      if (typeof smartAccount.signMessage === "function") {
        return smartAccount.signMessage({ message }) as Promise<Hex>;
      }
      throw new Error(
        "ThirdwebOperatorSigner: signMessage not available on this smart account. " +
          "Ensure the Thirdweb smart account supports message signing."
      );
    },
    async signTypedData(_params) {
      throw new Error(
        "ThirdwebOperatorSigner: signTypedData is not implemented. " +
          "Not needed for writeContract — Thirdweb handles typed data signing internally."
      );
    },
    async signTransaction(_params) {
      throw new Error(
        "ThirdwebOperatorSigner: signTransaction is not supported. " +
          "Thirdweb manages transaction signing internally via sendTransaction."
      );
    },
  };

  // ── viem WalletClient ─────────────────────────────────────────────────
  // The wallet client exposes `writeContract` as the primary method.
  // Internally, it encodes the call data via viem's `encodeFunctionData`,
  // builds a Thirdweb transaction object, and delegates to Thirdweb's
  // `sendTransaction` — which handles ERC-4337 UserOperation construction,
  // paymaster sponsorship, and bundler submission.
  //
  // All other WalletClient methods are stubs that throw descriptive errors.
  // They exist to satisfy the viem `WalletClient` type at compile time.
  const walletClient: WalletClient = {
    chain,
    account,
    async writeContract(params: {
      address: Address;
      abi: readonly unknown[];
      functionName: string;
      args?: readonly unknown[];
      value?: bigint;
    }) {
      const calldata = encodeFunctionData({
        abi: params.abi,
        functionName: params.functionName,
        args: params.args as readonly unknown[] | undefined,
      });

      // Dynamically import sendTransaction to avoid bundling Thirdweb
      // in environments that don't need it (e.g. server-side tests).
      const { sendTransaction } = await import("thirdweb");

      const tx = {
        to: params.address,
        data: calldata,
        value: params.value,
        chain,
        client: twClient,
      } as Parameters<typeof sendTransaction>[0]["transaction"];

      const result = await sendTransaction({
        transaction: tx,
        account: smartAccount,
      } as Parameters<typeof sendTransaction>[0]);

      return result.transactionHash as Hex;
    },

    // ── Stubs (satisfy viem WalletClient type) ──────────────────────────
    // These throw at runtime if called. They exist only to satisfy the
    // compile-time type. The engine never calls these methods — all writes
    // go through writeContract.
    async sendTransaction() {
      throw new Error(
        "ThirdwebOperatorSigner: sendTransaction is not supported on this wallet client. " +
          "Use writeContract instead — it wraps Thirdweb's sendTransaction internally " +
          "and handles ERC-4337 UserOperation construction + paymaster sponsorship."
      );
    },
    async signMessage() {
      throw new Error(
        "ThirdwebOperatorSigner: signMessage is not supported on this wallet client. " +
          "Use account.signMessage instead."
      );
    },
    async signTypedData() {
      throw new Error(
        "ThirdwebOperatorSigner: signTypedData is not supported on this wallet client. " +
          "Use account.signTypedData instead."
      );
    },
    async signTransaction() {
      throw new Error(
        "ThirdwebOperatorSigner: signTransaction is not supported on this wallet client. " +
          "Thirdweb manages signing internally via sendTransaction."
      );
    },
    async getAddresses() {
      return [accountAddress];
    },
    async request() {
      throw new Error(
        "ThirdwebOperatorSigner: request is not implemented. " +
          "This adapter only supports writeContract for engine operations."
      );
    },
  } as unknown as WalletClient;

  return { walletClient, account };
}
