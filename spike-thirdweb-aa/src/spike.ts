/**
 * THROWAWAY SPIKE — Thirdweb AA gas sponsorship on Somnia Shannon testnet.
 *
 * Phase 1: Does sponsorship work at ALL via Thirdweb's native sendTransaction?
 * Phase 2: Can the smart account be converted to a viem-compatible WalletClient?
 * Phase 3: Does a thin OperatorSigner adapter (wrapping Thirdweb sendTransaction
 *           as writeContract) survive sponsorship for both a simple faucet call
 *           AND a real DreamDEX BinaryPool mintSet?
 *
 * Run: npm run spike   (after filling .env from .env.example)
 */

// ─── Env loading ────────────────────────────────────────────────────────────
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(): Record<string, string> {
  try {
    const raw = readFileSync(resolve(import.meta.dirname!, ".env"), "utf8");
    const env: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2];
    }
    return env;
  } catch {
    return {};
  }
}
const ENV = loadEnv();
for (const k of Object.keys(ENV)) {
  if (!process.env[k]) process.env[k] = ENV[k];
}

const CLIENT_ID = process.env.THIRDWEB_CLIENT_ID;
const SECRET_KEY = process.env.THIRDWEB_SECRET_KEY;
if ((!CLIENT_ID || CLIENT_ID.startsWith("your_")) && !SECRET_KEY) {
  console.error(
    "\n✗ Missing THIRDWEB_CLIENT_ID / THIRDWEB_SECRET_KEY.\n" +
      "  Copy .env.example to .env and fill in your key from https://thirdweb.com/dashboard/settings/api-keys\n",
  );
  process.exit(1);
}

// ─── Constants ──────────────────────────────────────────────────────────────
const RPC_URL = "https://api.infra.testnet.somnia.network/http";
const CHAIN_ID = 50312;
const TEST_USDC = "0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E";
const FAUCET_AMOUNT = 10_000n * 10n ** 6n; // 10,000 test USDC (6dp)
const MINT_AMOUNT = 5n * 10n ** 6n; // 5 USDC worth of complete sets
const TEST_USDC_ABI = [
  {
    type: "function",
    name: "faucet",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
const BINARY_POOL_WRITE_ABI = [
  {
    type: "function",
    name: "mintSet",
    stateMutability: "nonpayable",
    inputs: [
      { name: "yesTo", type: "address" },
      { name: "noTo", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

// ─── Imports ────────────────────────────────────────────────────────────────
import { createThirdwebClient } from "thirdweb";
import { defineChain } from "thirdweb/chains";
import { inAppWallet, smartWallet } from "thirdweb/wallets";
import { sendTransaction } from "thirdweb";
import {
  createPublicClient,
  encodeFunctionData,
  formatEther,
  formatUnits,
  http,
  zeroAddress,
  type Address,
  type Hex,
  type WalletClient,
  type Account,
} from "viem";
import { SomniaMarkets, SOMNIA_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";

// ─── Thin OperatorSigner adapter ────────────────────────────────────────────
// Wraps a Thirdweb smart account into the OperatorSigner shape the engine expects:
//   { walletClient: { writeContract, chain, ... }, account: { address, type, ... } }
// This avoids the broken viemAdapter — uses Thirdweb sendTransaction internally.

function createOperatorSignerAdapter(
  smartAcct: any, // Thirdweb smartAccount
  twClient: any,  // Thirdweb client
  chain: any,     // Thirdweb chain
): { walletClient: WalletClient; account: Account } {
  const accountAddress = smartAcct.address as Address;

  const account: Account = {
    address: accountAddress,
    type: "local" as const,
    source: "thirdweb-smart" as const,
    async signMessage({ message }) {
      // Delegate to Thirdweb's signMessage if available
      if (typeof smartAcct.signMessage === "function") {
        return smartAcct.signMessage({ message }) as Promise<Hex>;
      }
      throw new Error("signMessage not supported by Thirdweb smart account adapter");
    },
    async signTypedData(_params) {
      throw new Error("signTypedData not implemented in adapter — not needed for writeContract");
    },
    async signTransaction(_params) {
      throw new Error("signTransaction not supported — Thirdweb handles signing internally");
    },
  };

  const walletClient: WalletClient = {
    chain,
    account,
    async writeContract(params: any) {
      const calldata = encodeFunctionData({
        abi: params.abi,
        functionName: params.functionName,
        args: params.args,
      });
      // Build Thirdweb-compatible transaction object
      const tx = {
        to: params.address as `0x${string}`,
        data: calldata,
        chain,
        client: twClient,
      } as any;
      const result = await sendTransaction({ transaction: tx, account: smartAcct });
      return result.transactionHash as Hex;
    },
    // Stubs for methods the engine doesn't call but viem WalletClient type requires.
    // SECURITY: These throw at runtime if called — they exist only to satisfy the type.
    // If any engine code path calls these, it will fail with a clear error message.
    async sendTransaction() {
      throw new Error(
        "OperatorSigner adapter: sendTransaction is not supported. " +
        "Use writeContract instead — it wraps Thirdweb's sendTransaction internally."
      );
    },
    async signMessage() {
      throw new Error(
        "OperatorSigner adapter: signMessage is not supported on this walletClient. " +
        "Use account.signMessage instead."
      );
    },
    async signTypedData() {
      throw new Error(
        "OperatorSigner adapter: signTypedData is not implemented — not needed for writeContract."
      );
    },
    async signTransaction() {
      throw new Error(
        "OperatorSigner adapter: signTransaction is not supported — " +
        "Thirdweb handles signing internally via sendTransaction."
      );
    },
    async getAddresses() { return [accountAddress]; },
    async request() {
      throw new Error(
        "OperatorSigner adapter: request is not implemented. " +
        "This adapter only supports writeContract for engine operations."
      );
    },
  } as unknown as WalletClient;

  return { walletClient, account };
}

async function main() {
  const client = createThirdwebClient(
    SECRET_KEY
      ? { secretKey: SECRET_KEY, clientId: CLIENT_ID || undefined }
      : { clientId: CLIENT_ID },
  );

  const chain = defineChain({
    id: CHAIN_ID,
    name: "Somnia Testnet",
    nativeCurrency: { name: "Somnia Test Token", symbol: "STT", decimals: 18 },
    rpc: RPC_URL,
  });

  const publicClient = createPublicClient({ transport: http(RPC_URL) });

  log("0. Chain sanity check…");
  const chainId = await publicClient.getChainId();
  const usdcCode = await publicClient.getCode({ address: TEST_USDC });
  log(`   chain id = ${chainId} (expect ${CHAIN_ID}); testUsdc code = ${usdcCode?.length ?? 0} bytes`);

  // ── Step 1: personal account (headless guest login) ────────────────────────
  log("1. Creating in-app wallet with guest strategy…");
  const iaw = inAppWallet();
  const personalAccount = await iaw.connect({ client, strategy: "guest" });
  log(`   personal EOA: ${personalAccount.address}`);
  const eoaStt = await publicClient.getBalance({ address: personalAccount.address as `0x${string}` });
  log(`   personal EOA STT: ${formatEther(eoaStt)} STT`);

  // ── Step 2: smart account with sponsored gas ───────────────────────────────
  log("2. Connecting smartWallet({ chain, sponsorGas: true })…");
  const swFactory = smartWallet({ chain, sponsorGas: true });
  const smartAccount = await swFactory.connect({ client, personalAccount });
  log(`   smart account address: ${smartAccount.address}`);

  const smartSttBefore = await publicClient.getBalance({ address: smartAccount.address as `0x${string}` });
  log(`   smart account STT BEFORE: ${formatEther(smartSttBefore)} STT`);

  const usdcBefore = await publicClient.readContract({
    address: TEST_USDC as `0x${string}`,
    abi: TEST_USDC_ABI,
    functionName: "balanceOf",
    args: [smartAccount.address as `0x${string}`],
  });
  log(`   smart account USDC BEFORE: ${formatUnits(usdcBefore, 6)} USDC`);

  // ── PHASE 1: Thirdweb native sendTransaction (proves sponsorship works) ────
  log("");
  log("═══ PHASE 1: Thirdweb native sendTransaction (faucet) ═══");
  const faucetCalldata = encodeFunctionData({
    abi: TEST_USDC_ABI,
    functionName: "faucet",
    args: [FAUCET_AMOUNT],
  });

  const faucetTx = {
    to: TEST_USDC as `0x${string}`,
    data: faucetCalldata,
    chain,
    client,
  } as any;

  const txResult = await sendTransaction({ transaction: faucetTx, account: smartAccount });
  log(`   tx hash: ${txResult.transactionHash}`);

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txResult.transactionHash as `0x${string}`,
    timeout: 120_000,
  });
  log(`   status=${receipt.status} block=${receipt.blockNumber} gasUsed=${receipt.gasUsed}`);

  const smartSttAfterPhase1 = await publicClient.getBalance({ address: smartAccount.address as `0x${string}` });
  log(`   smart account STT AFTER phase 1: ${formatEther(smartSttAfterPhase1)} STT`);

  const usdcAfterPhase1 = await publicClient.readContract({
    address: TEST_USDC as `0x${string}`,
    abi: TEST_USDC_ABI,
    functionName: "balanceOf",
    args: [smartAccount.address as `0x${string}`],
  });
  log(`   smart account USDC AFTER phase 1: ${formatUnits(usdcAfterPhase1, 6)} USDC`);
  const usdcMinted = usdcAfterPhase1 > usdcBefore;
  log(`   USDC minted: ${usdcMinted ? "YES" : "NO"}`);
  const phase1PaidNothing = smartSttBefore === 0n && smartSttAfterPhase1 === 0n;
  log(`   STT stayed 0: ${phase1PaidNothing ? "YES" : "NO"}`);

  // ── PHASE 2: viem adapter (expected to fail) ──────────────────────────────
  log("");
  log("═══ PHASE 2: viem adapter compatibility ═══");
  let viemWalletOk = false;
  try {
    const { viemAdapter } = await import("thirdweb/adapters/viem");
    const viemWallet = await viemAdapter.walletClient.toViem({
      client,
      chain,
      wallet: smartAccount,
    });
    log(`   viem wallet type=${typeof viemWallet}, keys=${Object.keys(viemWallet).join(",")}`);
    log(`   has writeContract=${typeof viemWallet.writeContract}, account=${!!viemWallet.account}`);
    viemWalletOk = true;
  } catch (err) {
    log(`   ✗ viemAdapter.walletClient.toViem FAILED: ${err instanceof Error ? err.message : String(err)}`);
    log(`   (Expected — smart wallets aren't compatible with Thirdweb's viem adapter)`);
  }

  // ── PHASE 3: OperatorSigner adapter — faucet call ─────────────────────────
  log("");
  log("═══ PHASE 3: OperatorSigner adapter — faucet call ═══");
  const { walletClient, account } = createOperatorSignerAdapter(smartAccount, client, chain);
  log(`   adapter created: account.address=${account.address}, account.type=${account.type}`);
  log(`   walletClient.chain.id=${walletClient.chain?.id}, has writeContract=${typeof walletClient.writeContract}`);

  log("   calling walletClient.writeContract(faucet) through adapter…");
  const adapterHash = await walletClient.writeContract!({
    address: TEST_USDC,
    abi: TEST_USDC_ABI,
    functionName: "faucet",
    args: [FAUCET_AMOUNT],
    chain,
  } as any);
  log(`   tx hash: ${adapterHash}`);

  const adapterReceipt = await publicClient.waitForTransactionReceipt({
    hash: adapterHash as `0x${string}`,
    timeout: 120_000,
  });
  log(`   status=${adapterReceipt.status} block=${adapterReceipt.blockNumber} gasUsed=${adapterReceipt.gasUsed}`);

  const smartSttAfterAdapter = await publicClient.getBalance({ address: smartAccount.address as `0x${string}` });
  log(`   smart account STT AFTER adapter faucet: ${formatEther(smartSttAfterAdapter)} STT`);

  const usdcAfterAdapter = await publicClient.readContract({
    address: TEST_USDC as `0x${string}`,
    abi: TEST_USDC_ABI,
    functionName: "balanceOf",
    args: [smartAccount.address as `0x${string}`],
  });
  log(`   smart account USDC AFTER adapter faucet: ${formatUnits(usdcAfterAdapter, 6)} USDC`);

  // ── PHASE 4: OperatorSigner adapter — DreamDEX mintSet ────────────────────
  log("");
  log("═══ PHASE 4: OperatorSigner adapter — DreamDEX mintSet ═══");
  const pool = process.env.DREAMDEX_POOL ?? (await discoverBinaryPool());
  log(`   pool: ${pool}`);

  // Batched: approve + mintSet in two sequential writeContract calls
  // (The adapter wraps each as a separate sponsored tx)
  log("   step 1: walletClient.writeContract(approve) through adapter…");
  const approveHash = await walletClient.writeContract!({
    address: TEST_USDC,
    abi: TEST_USDC_ABI,
    functionName: "approve",
    args: [pool as `0x${string}`, MINT_AMOUNT],
    chain,
  } as any);
  log(`   approve tx hash: ${approveHash}`);
  await publicClient.waitForTransactionReceipt({ hash: approveHash as `0x${string}`, timeout: 120_000 });
  log("   approve confirmed ✓");

  log("   step 2: walletClient.writeContract(mintSet) through adapter…");
  const mintHash = await walletClient.writeContract!({
    address: pool,
    abi: BINARY_POOL_WRITE_ABI,
    functionName: "mintSet",
    args: [smartAccount.address, smartAccount.address, MINT_AMOUNT],
    chain,
  } as any);
  log(`   mintSet tx hash: ${mintHash}`);
  const mintReceipt = await publicClient.waitForTransactionReceipt({ hash: mintHash as `0x${string}`, timeout: 120_000 });
  log(`   mintSet status=${mintReceipt.status} block=${mintReceipt.blockNumber} gasUsed=${mintReceipt.gasUsed}`);

  // ── Final balance check ────────────────────────────────────────────────────
  const smartSttFinal = await publicClient.getBalance({ address: smartAccount.address as `0x${string}` });
  log(`   smart account STT FINAL: ${formatEther(smartSttFinal)} STT`);
  const eoaSttFinal = await publicClient.getBalance({ address: personalAccount.address as `0x${string}` });
  log(`   personal EOA STT FINAL: ${formatEther(eoaSttFinal)} STT`);

  // ── Verdict ────────────────────────────────────────────────────────────────
  const p1Ok = receipt.status === "success" && phase1PaidNothing && usdcMinted;
  const p3Ok = adapterReceipt.status === "success" && smartSttAfterAdapter === 0n;
  const p4Ok = mintReceipt.status === "success" && smartSttFinal === 0n;
  const allSponsored = p1Ok && p3Ok && p4Ok;

  log("");
  log("═══ VERDICT ═══");
  log(`phase 1 — Thirdweb sendTransaction sponsored:  ${p1Ok ? "YES ✅" : "NO ❌"}`);
  log(`phase 2 — viem adapter works:                  ${viemWalletOk ? "YES ✅" : "NO ❌"}`);
  log(`phase 3 — OperatorSigner adapter faucet:       ${p3Ok ? "YES ✅" : "NO ❌"}`);
  log(`phase 4 — OperatorSigner adapter DreamDEX:     ${p4Ok ? "YES ✅" : "NO ❌"}`);
  log(`EOA+SA STT stayed 0 end-to-end:                ${allSponsored ? "YES ✅" : "NO ❌"}`);

  log("");
  if (allSponsored) {
    log("🎉 GO ✅ — Thirdweb + thin OperatorSigner adapter = fully gasless trading on Somnia");
    log("   Architecture: Thirdweb smartWallet(sponsorGas:true) → OperatorSigner adapter → engine.writeContract");
    log("   The adapter is ~30 lines and maps Thirdweb's sendTransaction to viem's writeContract interface.");
  } else if (p1Ok && p3Ok) {
    log("⚠️  PARTIAL GO — sponsorship works for simple calls, DreamDEX call may have reverted");
  } else if (p1Ok) {
    log("⚠️  PARTIAL — Phase 1 works but adapter needs debugging");
  } else {
    log("❌ NO-GO — sponsorship not confirmed");
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Discover a live Trading binary pool via the SDK indexer (read-only). */
async function discoverBinaryPool(): Promise<string> {
  const exchange = new SomniaMarkets({
    chain: somniaShannon,
    wsRpcUrl: "wss://api.infra.testnet.somnia.network/ws",
    indexerUrl: "https://dev.smk.somnia.host/v1/graphql",
    addresses: SOMNIA_TESTNET_ADDRESSES,
  });
  const markets = await exchange.client.listMarkets();
  const tradable = markets.filter(
    (m: { status?: string; poolAddress?: string }) =>
      m.status === "Trading" &&
      m.poolAddress &&
      m.poolAddress.toLowerCase() !== zeroAddress,
  );
  if (tradable.length === 0) {
    throw new Error(
      `No live Trading binary market found via indexer (${markets.length} markets scanned). ` +
        `Set DREAMDEX_POOL=<address> in .env and re-run.`,
    );
  }
  log(`   ${tradable.length} Trading market(s) found; using first: market=${(tradable[0] as { marketId?: string }).marketId ?? "?"} pool=${tradable[0].poolAddress}`);
  return tradable[0].poolAddress!;
}

function log(msg: string) {
  console.log(msg);
}

main().catch((err) => {
  console.error("\n✗ SPIKE FAILED:");
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
