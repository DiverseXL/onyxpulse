#!/usr/bin/env node
/**
 * Pulse Demo — Operator Session-Key Flow
 *
 * Demonstrates the "one-signature-then-frictionless" UX:
 *   grant → place order as operator → revoke
 *
 * This uses two keys:
 *   - OWNER_KEY: the user's main wallet (grants permissions, receives funds)
 *   - OPERATOR_KEY: the hot key / bot wallet (places orders on owner's behalf)
 *
 * Usage:
 *   OWNER_KEY=0x... OPERATOR_KEY=0x... npm run demo:session
 *
 * If OPERATOR_KEY is not set, the script uses OWNER_KEY for both roles
 * (demo mode — shows the grant/revoke flow without needing two wallets).
 *
 * Prerequisites:
 *   1. Claim STT gas from https://testnet.somnia.network/ for BOTH wallets.
 *   2. The owner wallet needs test USDC (run `npm run demo` first, or the
 *      script will attempt to request funds automatically).
 */

import { createWalletClient, webSocket } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { createPulseClient, createTrader, requestDemoFunds } from "../src/engine/index.ts";
import {
  getLiveBinaryMarkets,
  getOrderBookSnapshot,
  grantOperatorPermissions,
  revokeOperatorPermissions,
  getOperatorPermissions,
  placeOrderAsOperator,
  computeDefaultExpiry,
  toBigintAmount,
  type OperatorSigner,
  PulseEngineError,
} from "../src/engine/index.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STEP = (n: number, label: string) => console.log(`\n${`步 ${n}`.padEnd(6)} ✦ ${label}`);
const OK = (msg: string) => console.log(`       ✔ ${msg}`);
const FAIL = (msg: string) => console.error(`       ✖ ${msg}`);
const INFO = (msg: string) => console.log(`       ${msg}`);
const ts = () => new Date().toISOString().slice(11, 23);

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Pulse — Operator Session-Key Demo (Shannon Testnet)       ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log();

  // ── Step 0: Pre-flight ──────────────────────────────────────────
  STEP(0, "Pre-flight checks");
  const ownerKey = process.env.OWNER_KEY;
  if (!ownerKey) {
    FAIL("OWNER_KEY env var is not set.");
    FAIL("Set it to the hex private key of the OWNER wallet.");
    FAIL("Get STT gas from: https://testnet.somnia.network/");
    process.exit(1);
  }
  OK(`Owner key loaded (${ownerKey.slice(0, 6)}…${ownerKey.slice(-4)})`);

  const operatorKey = process.env.OPERATOR_KEY || ownerKey;
  const isSameKey = operatorKey === ownerKey;
  if (isSameKey) {
    INFO("OPERATOR_KEY not set — using OWNER_KEY for both roles (demo mode).");
    INFO("In production, these would be separate wallets.");
  } else {
    OK(`Operator key loaded (${operatorKey.slice(0, 6)}…${operatorKey.slice(-4)})`);
  }

  // ── Step 1: Create clients + traders ────────────────────────────
  STEP(1, "Creating Pulse clients + traders");
  const ownerPulse = createPulseClient();
  const ownerTrader = createTrader(ownerPulse, ownerKey);

  let operatorTrader = ownerTrader;
  if (!isSameKey) {
    const operatorPulse = createPulseClient();
    operatorTrader = createTrader(operatorPulse, operatorKey);
  }
  OK(`Connected to Shannon testnet (chain ${ownerPulse.client.config.chain.id})`);

  // Derive viem Account + WalletClient for the operator (needed for placeOrderAsOperator)
  const operatorAccount = privateKeyToAccount(operatorKey as `0x${string}`);
  const operatorWalletClient = createWalletClient({
    account: operatorAccount,
    chain: somniaShannon,
    transport: webSocket("wss://api.infra.testnet.somnia.network/ws"),
  });
  const operatorSigner: OperatorSigner = {
    walletClient: operatorWalletClient,
    account: operatorAccount,
  };
  INFO(`  Operator address: ${operatorAccount.address}`);

  // ── Step 2: Ensure owner has test USDC ──────────────────────────
  STEP(2, "Ensuring owner has test USDC");
  try {
    const faucetResult = await requestDemoFunds(ownerKey);
    OK(`Faucet tx: ${faucetResult.hash}`);
  } catch (error) {
    if (error instanceof PulseEngineError) {
      FAIL(`Faucet failed [${error.code}]: ${error.message}`);
    } else {
      FAIL(`Faucet failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    INFO("If owner already has USDC, this is expected — continuing.");
  }

  // ── Step 3: Discover a live market ──────────────────────────────
  STEP(3, "Discovering a live Trading market");
  const markets = await getLiveBinaryMarkets(ownerPulse.client);
  const liveMarket = markets.find(
    (m) =>
      m.status === "Trading" &&
      (m.asset === "BTC" || m.asset === "ETH"),
  );

  if (!liveMarket) {
    FAIL("No live BTC/ETH markets in 'Trading' status found.");
    FAIL("This is expected if no markets are currently active on testnet.");
    INFO(`Total live markets: ${markets.length}`);
    INFO("Try again when markets are active, or check: https://dreamdex.somnia.network");
    process.exit(0);
  }

  OK(`Found: ${liveMarket.question}`);
  INFO(`  Pool: ${liveMarket.poolAddress}`);
  INFO(`  Asset: ${liveMarket.asset} | Decimals: ${liveMarket.quoteDecimals}`);

  const poolAddress = liveMarket.poolAddress as `0x${string}`;
  const ownerAddress = `0x${ownerKey.slice(2, 42).toLowerCase()}` as `0x${string}`;

  // ── Step 4: Check current permissions ───────────────────────────
  STEP(4, "Checking current operator permissions");
  try {
    const perms = await getOperatorPermissions(
      ownerPulse.client,
      ownerAddress,
      isSameKey ? ownerAddress : (`0x${operatorKey.slice(2, 42).toLowerCase()}` as `0x${string}`),
      poolAddress,
    );
    INFO(`  Global: ${perms.globallyApproved ? "YES" : "no"}`);
    INFO(`  Pool:   ${perms.poolApproved ? "YES" : "no"}`);
    INFO(`  Auth:   ${perms.authorized ? "YES" : "no"}`);
  } catch (error) {
    FAIL(`Permission check failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ── Step 5: Grant operator permissions ──────────────────────────
  STEP(5, "Granting operator permissions (placeOrderFor + cancelOrderFor)");
  try {
    const grantResult = await grantOperatorPermissions(
      ownerTrader,
      isSameKey ? ownerAddress : (`0x${operatorKey.slice(2, 42).toLowerCase()}` as `0x${string}`),
      ["placeOrderFor", "cancelOrderFor"],
    );
    OK(`Grant tx: ${grantResult.hash}`);
  } catch (error) {
    if (error instanceof PulseEngineError) {
      FAIL(`Grant failed [${error.code}]: ${error.message}`);
    } else {
      FAIL(`Grant failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    INFO("Continuing — permissions may already be granted.");
  }

  // ── Step 6: Verify permissions after grant ──────────────────────
  STEP(6, "Verifying permissions after grant");
  try {
    const perms = await getOperatorPermissions(
      ownerPulse.client,
      ownerAddress,
      isSameKey ? ownerAddress : (`0x${operatorKey.slice(2, 42).toLowerCase()}` as `0x${string}`),
      poolAddress,
    );
    if (perms.authorized) {
      OK(`Operator is authorized: global=${perms.globallyApproved}, pool=${perms.poolApproved}`);
    } else {
      FAIL("Operator is NOT authorized after grant — this may be a pool-level denial.");
      INFO("The grant was submitted but the pool's gate rejected it.");
    }
  } catch (error) {
    FAIL(`Permission check failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ── Step 7: Show order book before operator order ───────────────
  STEP(7, "Order book snapshot (before operator order)");
  try {
    const book = await getOrderBookSnapshot(
      ownerPulse.client,
      poolAddress,
      liveMarket.quoteDecimals,
    );
    OK(`Best bid: ${book.bestBid} | Best ask: ${book.bestAsk}`);
  } catch (error) {
    FAIL(`Order book read failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ── Step 8: Place order as operator ─────────────────────────────
  STEP(8, "Placing order as operator (BUY_YES @ 0.50 for 5 USDC)");
  try {
    const humanPrice = "0.50";
    const humanQuantity = "5";
    const price = toBigintAmount(humanPrice, liveMarket.quoteDecimals);
    const quantity = toBigintAmount(humanQuantity, liveMarket.quoteDecimals);
    const expiryNs = computeDefaultExpiry(liveMarket);

    INFO(`  Price: ${humanPrice} → ${price} (raw)`);
    INFO(`  Quantity: ${humanQuantity} → ${quantity} (raw)`);
    INFO(`  Expiry: ${expiryNs} ns`);

    const operatorOrderResult = await placeOrderAsOperator(
      ownerPulse.client,
      operatorSigner,
      ownerAddress,
      {
        pool: poolAddress,
        side: "BUY_YES",
        price,
        quantity,
        expireTimestampNs: expiryNs,
      },
    );

    OK(`Operator order tx: ${operatorOrderResult.hash}`);
    INFO(`  Order ID: ${operatorOrderResult.orderId?.toString() ?? "N/A"}`);
    INFO(`  Fills: ${operatorOrderResult.fills.length}`);
    INFO(`  Order settled to OWNER account (${ownerAddress}) — operator cannot withdraw.`);
  } catch (error) {
    if (error instanceof PulseEngineError) {
      FAIL(`Operator order failed [${error.code}]: ${error.message}`);
      INFO(`Context: ${error.context}`);
      if (error.originalError) {
        INFO(`Original: ${error.originalError}`);
      }
    } else {
      FAIL(`Operator order failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    INFO("This may indicate a gap in the placeOrderAsOperator implementation.");
    INFO("Check: authorization pre-check, ABI encoding, pool compatibility.");
  }

  // ── Step 9: Revoke operator permissions ─────────────────────────
  STEP(9, "Revoking operator permissions");
  try {
    const revokeResult = await revokeOperatorPermissions(
      ownerTrader,
      isSameKey ? ownerAddress : (`0x${operatorKey.slice(2, 42).toLowerCase()}` as `0x${string}`),
    );
    OK(`Revoke tx: ${revokeResult.hash}`);
  } catch (error) {
    if (error instanceof PulseEngineError) {
      FAIL(`Revoke failed [${error.code}]: ${error.message}`);
    } else {
      FAIL(`Revoke failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ── Step 10: Verify permissions after revoke ────────────────────
  STEP(10, "Verifying permissions after revoke");
  try {
    const perms = await getOperatorPermissions(
      ownerPulse.client,
      ownerAddress,
      isSameKey ? ownerAddress : (`0x${operatorKey.slice(2, 42).toLowerCase()}` as `0x${string}`),
      poolAddress,
    );
    if (!perms.authorized) {
      OK("Operator is no longer authorized — revoke successful.");
    } else {
      FAIL("Operator is still authorized after revoke — unexpected.");
    }
    INFO(`  Global: ${perms.globallyApproved ? "YES" : "no"}`);
    INFO(`  Pool:   ${perms.poolApproved ? "YES" : "no"}`);
    INFO(`  Auth:   ${perms.authorized ? "YES" : "no"}`);
  } catch (error) {
    FAIL(`Permission check failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log();
  console.log("┌──────────────────────────────────────────────────────────────┐");
  console.log("│               SESSION-KEY FLOW SUMMARY                      │");
  console.log("├──────────────────────────────────────────────────────────────┤");
  console.log("│  1. Owner grants operator: placeOrderFor + cancelOrderFor  │");
  console.log("│  2. Operator places orders on owner's behalf (no owner tx) │");
  console.log("│  3. Orders settle to owner's account — operator can't      │");
  console.log("│     withdraw funds.                                        │");
  console.log("│  4. Owner revokes operator when done.                      │");
  console.log("│                                                            │");
  console.log("│  This is the 'one-signature-then-frictionless' UX story.   │");
  console.log("└──────────────────────────────────────────────────────────────┘");
  console.log();
  console.log(`[${ts()}] Session-key demo complete.`);
}

// ─── Runner ──────────────────────────────────────────────────────────────────

main().catch((error) => {
  console.error();
  console.error("╔══════════════════════════════════════════════════════════════╗");
  console.error("║  UNEXPECTED ERROR                                          ║");
  console.error("╚══════════════════════════════════════════════════════════════╝");

  if (error instanceof PulseEngineError) {
    console.error(`Code:    ${error.code}`);
    console.error(`Context: ${error.context}`);
    console.error(`Message: ${error.message}`);
    if (error.originalError) {
      console.error(`Cause:   ${error.originalError}`);
    }
  } else {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
  }

  process.exit(1);
});
