/**
 * THROWAWAY SPIKE — Privy + Pimlico gas sponsorship for arbitrary DreamDEX calls.
 *
 * Question: does Privy (wallet layer) + Pimlico (ERC-4337 bundler/paymaster)
 * sponsor gas end-to-end on Somnia Shannon testnet (50312) when calling
 * ARBITRARY third-party contracts — the test USDC faucet AND a real DreamDEX
 * BinaryPool mintSet — not just each provider's demo flow?
 *
 * TEST 1  Privy server wallet (headless) → viem-compatible Account via createViemAccount.
 * TEST 2  Pimlico client on somnia-testnet endpoint; verify API key + gas price feed.
 * TEST 3  SimpleSmartAccount (EntryPoint v0.7, counterfactual, 0 STT):
 *           3a. sponsored faucet(10_000 USDC) on testUsdc
 *           3b. batched [approve(pool), mintSet(yesTo,noTo,amount)] on a live DreamDEX pool
 *         STT balance of smart account must stay 0 throughout.
 *
 * Run: npm run spike   (after filling .env from .env.example)
 */

// ─── Env loading (tiny manual parse — no dotenv dep) ─────────────────────────
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

const PRIVY_APP_ID = process.env.PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;
const PIMLICO_API_KEY = process.env.PIMLICO_API_KEY;
const missing: string[] = [];
if (!PRIVY_APP_ID || PRIVY_APP_ID.startsWith("your_")) missing.push("PRIVY_APP_ID");
if (!PRIVY_APP_SECRET || PRIVY_APP_SECRET.startsWith("your_")) missing.push("PRIVY_APP_SECRET");
if (!PIMLICO_API_KEY || PIMLICO_API_KEY.startsWith("your_")) missing.push("PIMLICO_API_KEY");
if (missing.length > 0) {
  console.error(
    `\n✗ Missing required env vars: ${missing.join(", ")}\n` +
      `  Copy .env.example to .env and fill in:\n` +
      `   - Privy App ID + App Secret: https://dashboard.privy.io\n` +
      `   - Pimlico API key:          https://dashboard.pimlico.io\n`,
  );
  process.exit(1);
}

// ─── Somnia Shannon testnet constants (mirror pulse/src/engine/client.ts) ────
const RPC_URL = "https://api.infra.testnet.somnia.network/http";
const CHAIN_ID = 50312;
const TEST_USDC = "0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E" as const; // SOMNIA_TESTNET_ADDRESSES.testUsdc
const FAUCET_AMOUNT = 10_000n * 10n ** 6n; // 10,000 test USDC (6dp)
const MINT_AMOUNT = 5n * 10n ** 6n; // 5 USDC worth of complete sets
const PIMLICO_BUNDLER_URL = `https://api.pimlico.io/v2/${CHAIN_ID}/rpc?apikey=${PIMLICO_API_KEY}`;

const FAUCET_ABI = [
  { type: "function", name: "faucet", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
] as const;

// Mirrored verbatim from @somnia-chain/markets-sdk@0.28.1 src/tradeAbi.ts (binaryPoolWriteAbi)
const BINARY_POOL_WRITE_ABI = [
  "function mintSet(address yesTo, address noTo, uint256 amount)",
  "function placeOrder(bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k)",
] as const;
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
] as const;

// ─── Imports ────────────────────────────────────────────────────────────────
import { PrivyClient } from "@privy-io/server-auth";
import { createViemAccount } from "@privy-io/server-auth/viem";
import {
  createPublicClient,
  defineChain,
  encodeFunctionData,
  formatEther,
  formatUnits,
  http,
  zeroAddress,
} from "viem";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { createSmartAccountClient } from "permissionless";
import { toSimpleSmartAccount } from "permissionless/accounts";
import { SomniaMarkets, SOMNIA_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";

async function main() {
  const chain = defineChain({
    id: CHAIN_ID,
    name: "Somnia Testnet",
    nativeCurrency: { name: "Somnia Test Token", symbol: "STT", decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
  });

  const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });

  log("0. Chain sanity check…");
  const chainId = await publicClient.getChainId();
  log(`   chain id = ${chainId} (expect ${CHAIN_ID})`);

  // ══ TEST 1: Privy wallet (headless via server Wallet API) ═════════════════
  log("1. TEST 1 — Privy server wallet (headless; embedded wallets need browser UI)…");
  const privy = new PrivyClient(PRIVY_APP_ID!, PRIVY_APP_SECRET!);

  let wallet: { id: string; address: string };
  if (process.env.PRIVY_WALLET_ID) {
    wallet = await privy.walletApi.getWallet({ id: process.env.PRIVY_WALLET_ID });
    log(`   reused existing Privy wallet ${wallet.address} (${wallet.id})`);
  } else {
    const created = await privy.walletApi.createWallet({ chainType: "ethereum" });
    log(`   created Privy server wallet ${created.address} (${created.id})`);
    log(`   set PRIVY_WALLET_ID=${created.id} in .env to reuse it across runs`);
    wallet = created;
  }
  log(`   wallet keys: ${Object.keys(wallet as unknown as Record<string, unknown>).join(",")}`);

  // Convert to a viem-compatible LocalAccount (signs are proxied through Privy's API).
  // `as never` — dual CJS/ESM type identities of PrivyClient inside @privy-io/server-auth's own d.ts.
  const viemAccount = await createViemAccount({
    privy: privy as never,
    walletId: wallet.id,
    address: wallet.address as `0x${string}`,
  });
  log(`   viem account: type=${(viemAccount as { type?: string }).type}, address=${viemAccount.address}`);
  log(`   has signMessage=${typeof viemAccount.signMessage}, signTypedData=${typeof viemAccount.signTypedData}, signTransaction=${typeof (viemAccount as { signTransaction?: unknown }).signTransaction}`);

  const eoaSttBefore = await publicClient.getBalance({ address: viemAccount.address });
  log(`   EOA STT balance: ${formatEther(eoaSttBefore)} STT`);

  // ══ TEST 2: Pimlico bundler/paymaster on somnia-testnet ═══════════════════
  log("2. TEST 2 — Pimlico client on somnia-testnet (chain 50312)…");
  const pimlicoClient = createPimlicoClient({
    chain,
    transport: http(PIMLICO_BUNDLER_URL),
    entryPoint: {
      address: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
      version: "0.7",
    },
  });
  const gasPrices = await pimlicoClient.getUserOperationGasPrice();
  log(`   getUserOperationGasPrice OK — fast maxFeePerGas=${gasPrices.fast.maxFeePerGas} (API key valid)`);

  // ══ TEST 3: SimpleAccount v0.7 + sponsored calls ══════════════════════════
  log("3. TEST 3 — SimpleSmartAccount (EntryPoint v0.7) owned by the Privy wallet…");
  // NOTE: permissionless@0.2.57 takes an explicit EntryPoint descriptor object.
  const simpleAccount = await toSimpleSmartAccount({
    client: publicClient,
    owner: viemAccount,
    entryPoint: {
      address: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
      version: "0.7",
    },
  });
  log(`   smart account address: ${simpleAccount.address}`);
  log(`   entryPoint: ${simpleAccount.entryPoint}`);

  const smartAccountClient = createSmartAccountClient({
    account: simpleAccount,
    chain,
    entryPoint: {
      address: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
      version: "0.7",
    },
    paymaster: pimlicoClient,
    bundlerTransport: http(PIMLICO_BUNDLER_URL),
    userOperation: {
      estimateFeesPerGas: async () => (await pimlicoClient.getUserOperationGasPrice()).fast,
    },
  });
  log(`   smartAccountClient keys: ${Object.keys(smartAccountClient).slice(0, 12).join(",")}…`);
  log(`   has sendTransaction=${typeof smartAccountClient.sendTransaction}, writeContract=${typeof (smartAccountClient as Record<string, unknown>).writeContract}`);

  const saSttBefore = await publicClient.getBalance({ address: simpleAccount.address });
  const saDeployed = await publicClient.getCode({ address: simpleAccount.address });
  log(`   SA STT BEFORE: ${formatEther(saSttBefore)} STT (deployed code: ${saDeployed && saDeployed !== "0x" ? "yes" : "no — counterfactual"})`);

  const usdcBefore = await readErc20(publicClient, TEST_USDC, simpleAccount.address);
  log(`   SA USDC BEFORE: ${formatUnits(usdcBefore, 6)} USDC`);

  // ── DIAGNOSTIC: raw paymaster call ─────────────────────────────────────────
  log("2.5 Diagnostic — raw pm_sponsorUserOperation call…");
  try {
    const dummyUo = {
      sender: simpleAccount.address,
      nonce: "0x0",
      initCode: "0x",
      callData: encodeFunctionData({ abi: FAUCET_ABI, functionName: "faucet", args: [FAUCET_AMOUNT] }),
      callGasLimit: "0x50000",
      verificationGasLimit: "0x40000",
      preVerificationGas: "0x10000",
      maxFeePerGas: "0x3B9ACA00",
      maxPriorityFeePerGas: "0x3B9ACA00",
      paymasterAndData: "0x",
      signature: "0x",
    };
    const pmResult = await pimlicoClient.request({
      method: "pm_sponsorUserOperation" as any,
      params: [dummyUo, "0x0000000071727De22E5E9d8BAf0edAc6f37da032"],
    } as any);
    log(`   pm_sponsorUserOperation result: ${JSON.stringify(pmResult).slice(0, 500)}`);
  } catch (pmErr: any) {
    log(`   pm_sponsorUserOperation FAILED: ${pmErr?.message ?? String(pmErr)}`);
    log(`   (This usually means: no sponsorship policy, no balance, or policy not enabled)`);
  }

  // ── 3a: sponsored faucet() ────────────────────────────────────────────────
  log("3a. Sponsored call #1: testUsdc.faucet(10_000) via sendTransaction…");
  let faucetUserOpHash: string;
  try {
    faucetUserOpHash = await smartAccountClient.sendTransaction({
      to: TEST_USDC,
      data: encodeFunctionData({ abi: FAUCET_ABI, functionName: "faucet", args: [FAUCET_AMOUNT] }),
    });
  } catch (err) {
    throw new Error(
      `Sponsored faucet call FAILED: ${err instanceof Error ? err.message : String(err)}\n` +
        `(Pimlico dashboard may need a positive sponsorship balance / policy allowing this app.)`,
    );
  }
  log(`   userOp hash: ${faucetUserOpHash}`);
  const faucetUoReceipt = await smartAccountClient.waitForUserOperationReceipt({ hash: faucetUserOpHash as `0x${string}`, timeout: 180_000 });
  reportUserOp("faucet()", faucetUoReceipt);

  const usdcAfterFaucet = await readErc20(publicClient, TEST_USDC, simpleAccount.address);
  log(`   SA USDC after faucet: ${formatUnits(usdcAfterFaucet, 6)} USDC`);
  const saSttAfterFaucet = await publicClient.getBalance({ address: simpleAccount.address });
  log(`   SA STT after faucet:  ${formatEther(saSttAfterFaucet)} STT`);

  // ── 3b: DreamDEX-specific call — batched approve + mintSet on a live pool ─
  log("3b. Sponsored call #2: DreamDEX BinaryPool mintSet (batched with ERC-20 approve)…");
  const pool = process.env.DREAMDEX_POOL ?? (await discoverBinaryPool());
  log(`   pool: ${pool}`);
  const mintCalls = [
    {
      to: TEST_USDC as `0x${string}`,
      data: encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [pool as `0x${string}`, MINT_AMOUNT] }),
    },
    {
      to: pool as `0x${string}`,
      data: encodeFunctionData({ abi: BINARY_POOL_WRITE_ABI, functionName: "mintSet", args: [simpleAccount.address, simpleAccount.address, MINT_AMOUNT] }),
    },
  ];
  let mintUserOpHash: string;
  try {
    mintUserOpHash = await smartAccountClient.sendTransaction({ calls: mintCalls });
  } catch (err) {
    throw new Error(
      `Sponsored DreamDEX mintSet FAILED: ${err instanceof Error ? err.message : String(err)}\n` +
        `Pool used: ${pool}. If this is a revert, the pool/market state may be wrong rather than sponsorship failing.`,
    );
  }
  log(`   userOp hash: ${mintUserOpHash}`);
  const mintUoReceipt = await smartAccountClient.waitForUserOperationReceipt({ hash: mintUserOpHash as `0x${string}`, timeout: 180_000 });
  reportUserOp("mintSet(batch)", mintUoReceipt);

  const saSttFinal = await publicClient.getBalance({ address: simpleAccount.address });
  log(`   SA STT FINAL: ${formatEther(saSttFinal)} STT`);
  const eoaSttFinal = await publicClient.getBalance({ address: viemAccount.address });
  log(`   EOA STT FINAL: ${formatEther(eoaSttFinal)} STT`);

  // ── Compatibility assessment vs engine types ──────────────────────────────
  log("");
  log("═══ ENGINE COMPATIBILITY NOTES ═══");
  log(`   OperatorSigner expects { walletClient: viem.WalletClient, account: viem.Account }.`);
  log(`   We HAVE a viem.Account ✓ (${viemAccount.type}). The SmartAccountClient is NOT a plain`);
  log(`   viem WalletClient (it's a viem Client extension with userOperation actions) — but it DOES`);
  log(`   expose writeContract/sendTransaction-style actions. A thin adapter object would be needed;`);
  log(`   no rewrite of engine logic, only the signer construction layer.`);
  log(`   SDK Trader objects (createTrader(privateKey)) do NOT accept injected signers today —`);
  log(`   raw-call path (this spike) or an SDK signer-injection feature would be required.`);

  // ── Verdict ───────────────────────────────────────────────────────────────
  const faucetOk = faucetUoReceipt.success === true;
  const mintOk = mintUoReceipt.success === true;
  const usdcMinted = usdcAfterFaucet > usdcBefore;
  const paidNothing = eoaSttBefore === 0n && saSttBefore === 0n && saSttFinal === 0n && eoaSttFinal === 0n;

  log("");
  log("═══ VERDICT ═══");
  log(`sponsored faucet() confirmed:     ${faucetOk ? "YES" : "NO"}`);
  log(`USDC actually minted:             ${usdcMinted ? "YES" : "NO"}`);
  log(`sponsored DreamDEX mintSet:       ${mintOk ? "YES" : "NO"}`);
  log(`EOA+SA STT stayed 0 end-to-end:   ${paidNothing ? "YES" : "NO"}`);
  log(`PRIVY + PIMLICO SPONSORSHIP:      ${faucetOk && mintOk && paidNothing ? "GO ✅" : faucetOk ? "PARTIAL ⚠️ (see notes)" : "NO-GO ❌"}`);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function readErc20(
  publicClient: ReturnType<typeof createPublicClient>,
  token: string,
  owner: string,
): Promise<bigint> {
  try {
    const res = await publicClient.call({
      to: token as `0x${string}`,
      data: encodeFunctionData({ abi: ERC20_ABI, functionName: "balanceOf", args: [owner as `0x${string}`] }),
    });
    return BigInt(res.data ?? "0x0");
  } catch {
    return 0n;
  }
}

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

type UserOpReceiptLike = {
  success?: boolean;
  status?: string;
  userOpHash?: string;
  receipt?: { transactionHash?: string; blockNumber?: bigint; status?: string };
  actualGasCost?: bigint;
  actualGasUsed?: bigint;
};

function reportUserOp(label: string, r: UserOpReceiptLike) {
  log(`   [${label}] status=${r.status ?? String(r.success)} block=${r.receipt?.blockNumber ?? "?"}`);
  if (r.actualGasCost !== undefined) {
    log(`   [${label}] actualGasUsed=${r.actualGasUsed} actualGasCost=${r.actualGasCost} wei (paid by paymaster if SA balance stayed 0)`);
  }
  if (r.receipt?.transactionHash) log(`   [${label}] txHash=${r.receipt.transactionHash}`);
}

function log(msg: string) {
  console.log(msg);
}

main().catch((err) => {
  console.error("\n✗ SPIKE FAILED:");
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
