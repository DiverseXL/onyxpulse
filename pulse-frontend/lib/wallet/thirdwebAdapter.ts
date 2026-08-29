/**
 * Thirdweb → OperatorSigner adapter.
 *
 * Bridges a Thirdweb smart wallet (with `sponsorGas: true`) into the
 * `{ walletClient, account }` shape that the engine's `OperatorSigner`
 * type and all engine write functions expect.
 */

import { encodeFunctionData, type Address, type Hex, type WalletClient, type Account } from "viem";
import type { OperatorSigner } from "../engine/operator.ts";

export interface ThirdwebSmartAccount {
  /** The smart account's counterfactual address. */
  address: string;
  /**
   * Sign a message through the smart account.
   */
  signMessage?: (params: { message: string | { raw: Hex } }) => Promise<Hex>;
}

export interface ThirdwebClient {
  [key: string]: unknown;
}

export interface ThirdwebChain {
  id: number;
  [key: string]: unknown;
}

export interface ThirdwebAdapterConfig {
  smartAccount: ThirdwebSmartAccount;
  client: ThirdwebClient;
  chain: ThirdwebChain;
}

export function createThirdwebOperatorSigner(config: ThirdwebAdapterConfig): OperatorSigner {
  const { smartAccount, client: twClient, chain } = config;
  const accountAddress = smartAccount.address as Address;

  const account: Account = {
    address: accountAddress,
    type: "local" as const,
    source: "thirdweb-smart" as const,
    publicKey: "0x0" as Hex,
    async signMessage({ message }: { message: string | { raw: Hex } }) {
      if (typeof smartAccount.signMessage === "function") {
        return smartAccount.signMessage({ message }) as Promise<Hex>;
      }
      throw new Error(
        "ThirdwebOperatorSigner: signMessage not available on this smart account."
      );
    },
    async signTypedData(_params: unknown) {
      throw new Error("ThirdwebOperatorSigner: signTypedData is not implemented.");
    },
    async signTransaction(_params: unknown) {
      throw new Error("ThirdwebOperatorSigner: signTransaction is not supported.");
    },
  } as unknown as Account;

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

      // Dynamically import thirdweb sendTransaction
      const tw = await (Function('return import("thirdweb")')() as Promise<{
        sendTransaction: (args: { transaction: unknown; account: unknown }) => Promise<{ transactionHash: string }>;
      }>);

      const tx = {
        to: params.address,
        data: calldata,
        value: params.value,
        chain,
        client: twClient,
      };

      const result = await tw.sendTransaction({
        transaction: tx,
        account: smartAccount,
      });

      return result.transactionHash as Hex;
    },

    async sendTransaction() {
      throw new Error("ThirdwebOperatorSigner: sendTransaction is not supported.");
    },
    async signMessage() {
      throw new Error("ThirdwebOperatorSigner: signMessage is not supported.");
    },
    async signTypedData() {
      throw new Error("ThirdwebOperatorSigner: signTypedData is not supported.");
    },
    async signTransaction() {
      throw new Error("ThirdwebOperatorSigner: signTransaction is not supported.");
    },
    async getAddresses() {
      return [accountAddress];
    },
    async request() {
      throw new Error("ThirdwebOperatorSigner: request is not implemented.");
    },
  } as unknown as WalletClient;

  return { walletClient, account };
}
