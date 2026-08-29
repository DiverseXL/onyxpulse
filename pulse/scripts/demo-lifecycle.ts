#!/usr/bin/env node
/**
 * Pulse Demo — Full Onyx-Style Lifecycle (Natural Resolution)
 *
 * Exercises the complete event-contract lifecycle on DreamDEX testnet:
 *   faucet → discover → mint set → place order → order book → wait for resolution → redeem → receipt
 *
 * This demo waits for REAL market resolution (~15 min windows) rather than
 * force-resolving, since force-resolve requires an undocumented dev-only
 * oracle address (FakeOracle) not available to us. Resolution happens when
 * the market's natural oracle window closes.
 *
 * Usage:
 *   DEMO_PRIVATE_KEY=0x... npm run demo
 *
 * Prerequisites:
 *   1. Claim STT gas from https://testnet.somnia.network/ for the demo wallet.
 *   2. Set DEMO_PRIVATE_KEY env var to the wallet's hex private key.
 */

import { privateKeyToAccount } from "viem/accounts";
import { createPulseClient, createTrader, requestDemoFunds } from "../src/engine/index.ts";
import {
  getLiveBinaryMarkets,
  mintCompleteSet,
  placeLimitOrder,
  getOrderBookSnapshot,
  redeemMarket,
  buildReceiptData,
  getOutcomeBalanceOnchain,
  PulseEngineError,
  type BinaryMarket,
} from "../src/engine/index.ts";
import { getOnChainMarketStatus } from "../src/engine/statusGate.ts";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Minimum seconds of runway required for a safe order. */
const MIN_RUNWAY_SECONDS = 15;

/** Polling interval for resolution wait (milliseconds). */
const POLL_INTERVAL_MS = 8_000;

/** Maximum time to wait for resolution (20 minutes in milliseconds). */
const MAX_WAIT_MS = 20 * 60 * 1000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STEP = (n: number, label: string) => console.log(`\n${`步 ${n}`.padEnd(6)} ✦ ${label}`);
const OK = (msg: string) => console.log(`       ✔ ${msg}`);
const FAIL = (msg: string) => console.error(`       ✖ ${msg}`);
const INFO = (msg: string) => console.log(`       ${msg}`);
const ts = () => new Date().toISOString().slice(11, 23);

/**
 * Pick the live Trading market with the shortest remaining time-to-expiry
 * that still has enough runway for a safe order.
 *
 * Markets expiring in under MIN_RUNWAY_SECONDS are skipped — the order
 * would be rejected by the pool for having insufficient runway.
 */
function pickBestMarket(markets: BinaryMarket[]): BinaryMarket | null {
  const nowSec = Math.floor(Date.now() / 1000);

  const tradeable = markets
    .filter((m) => m.status === "Trading")
    .filter((m) => {
      const expirySec = Number(m.expiry);
      return expirySec - nowSec >= MIN_RUNWAY_SECONDS;
    })
    .sort((a, b) => Number(a.expiry) - Number(b.expiry));

  return tradeable[0] ?? null;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  Pulse — Onyx-Style Lifecycle Demo (Natural Resolution)    ║");
  console.log("║  Waits for real oracle resolution (~15 min windows)       ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log();

  // ── Step 0: Pre-flight ──────────────────────────────────────────
  STEP(0, "Pre-flight checks");
  const privateKey = process.env.DEMO_PRIVATE_KEY;
  if (!privateKey) {
    FAIL("DEMO_PRIVATE_KEY env var is not set.");
    FAIL("Set it to the hex private key of a wallet that has STT gas.");
    FAIL("Get STT gas from: https://testnet.somnia.network/");
    process.exit(1);
  }
  OK(`Wallet key loaded (${privateKey.slice(0, 6)}…${privateKey.slice(-4)})`);

  // ── Step 1: Create client + trader ──────────────────────────────
  STEP(1, "Creating Pulse client + trader");
  const pulse = createPulseClient();
  const trader = createTrader(pulse, privateKey);
  const traderAccount = privateKeyToAccount(privateKey as `0x${string}`);
  OK(`Connected to Shannon testnet (chain ${pulse.client.config.chain.id})`);
  INFO(`  Address: ${traderAccount.address}`);

  // ── Step 2: Request test USDC ───────────────────────────────────
  STEP(2, "Requesting test USDC from faucet");
  try {
    const faucetResult = await requestDemoFunds(privateKey);
    OK(`Faucet tx: ${faucetResult.hash}`);
  } catch (error) {
    if (error instanceof PulseEngineError) {
      FAIL(`Faucet failed [${error.code}]: ${error.message}`);
    } else {
      FAIL(`Faucet failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    INFO("If you already have USDC, this is expected — continuing.");
  }

  // ── Step 3: Discover a live market ──────────────────────────────
  STEP(3, "Discovering a live Trading market (shortest expiry, BTC or ETH)");
  const allMarkets = await getLiveBinaryMarkets(pulse.client);
  const liveMarket = pickBestMarket(
    allMarkets.filter((m) => m.asset === "BTC" || m.asset === "ETH"),
  );

  if (!liveMarket) {
    FAIL("No live BTC/ETH markets in 'Trading' status with sufficient runway found.");
    FAIL("This is expected if no markets are currently active on testnet.");
    INFO(`Total live markets: ${allMarkets.length}`);
    INFO("Try again when markets are active, or check: https://dreamdex.somnia.network");
    process.exit(0);
  }

  const expiryDate = new Date(Number(liveMarket.expiry) * 1000);
  const remainingSec = Number(liveMarket.expiry) - Math.floor(Date.now() / 1000);
  OK(`Found: ${liveMarket.question}`);
  INFO(`  Market ID: ${liveMarket.id}`);
  INFO(`  Pool:      ${liveMarket.poolAddress}`);
  INFO(`  Asset:     ${liveMarket.asset}`);
  INFO(`  Status:    ${liveMarket.status}`);
  INFO(`  Decimals:  ${liveMarket.quoteDecimals}`);
  INFO(`  Expiry:    ${expiryDate.toISOString()} (${remainingSec}s remaining)`);

  // ── Step 4: Mint a complete set ─────────────────────────────────
  STEP(4, "Minting a complete YES + NO set (10 USDC)");
  try {
    const mintResult = await mintCompleteSet(
      trader,
      pulse.client,
      liveMarket.poolAddress as `0x${string}`,
      "10",
      liveMarket.quoteDecimals,
    );
    OK(`Mint tx: ${mintResult.hash}`);
  } catch (error) {
    if (error instanceof PulseEngineError) {
      FAIL(`Mint failed [${error.code}]: ${error.message}`);
    } else {
      FAIL(`Mint failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    INFO("Continuing with order placement — you may already have tokens.");
  }

  // ── Step 5: Order book BEFORE order ─────────────────────────────
  STEP(5, "Order book snapshot (BEFORE order)");
  try {
    const bookBefore = await getOrderBookSnapshot(
      pulse.client,
      liveMarket.poolAddress as `0x${string}`,
      liveMarket.quoteDecimals,
    );
    OK(`Best bid: ${bookBefore.bestBid} | Best ask: ${bookBefore.bestAsk}`);
    INFO(`  Bids: ${bookBefore.bids.length} levels | Asks: ${bookBefore.asks.length} levels`);
  } catch (error) {
    FAIL(`Order book read failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ── Step 6: Place a limit order (BUY_YES) ──────────────────────
  STEP(6, "Placing limit order: BUY_YES @ 0.55 for 5 USDC");
  let orderId: bigint | undefined;
  let orderFillCount = 0;
  try {
    const orderResult = await placeLimitOrder(
      pulse.client,
      trader,
      {
        pool: liveMarket.poolAddress as `0x${string}`,
        side: "BUY_YES",
        humanPrice: "0.55",
        humanQuantity: "5",
        decimals: liveMarket.quoteDecimals,
        market: liveMarket,
      },
    );
    orderId = orderResult.orderId;
    orderFillCount = orderResult.fills.length;
    OK(`Order tx: ${orderResult.hash}`);
    INFO(`  Order ID: ${orderId?.toString() ?? "N/A"}`);
    INFO(`  Fills: ${orderFillCount}`);
    if (orderFillCount === 0) {
      INFO(`  Order rested unfilled (limit price below best ask) — this is expected.`);
    }
  } catch (error) {
    if (error instanceof PulseEngineError) {
      FAIL(`Order failed [${error.code}]: ${error.message}`);
    } else {
      FAIL(`Order failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ── Step 7: Order book AFTER order ──────────────────────────────
  STEP(7, "Order book snapshot (AFTER order)");
  try {
    const bookAfter = await getOrderBookSnapshot(
      pulse.client,
      liveMarket.poolAddress as `0x${string}`,
      liveMarket.quoteDecimals,
    );
    OK(`Best bid: ${bookAfter.bestBid} | Best ask: ${bookAfter.bestAsk}`);

    // Show our order if it's in the book
    const ourLevel = bookAfter.bids.find((l) => l.price === "0.55");
    if (ourLevel) {
      INFO(`  ✓ Our order visible: BUY_YES @ ${ourLevel.price} × ${ourLevel.quantity}`);
    } else {
      INFO("  Our order may have been filled or is not yet indexed.");
    }
  } catch (error) {
    FAIL(`Order book read failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ── Step 8: Wait for natural resolution ─────────────────────────
  STEP(8, "Waiting for natural market resolution");
  INFO(`Market expiry: ${expiryDate.toISOString()}`);
  INFO(`Polling on-chain status every ${POLL_INTERVAL_MS / 1000}s (max wait: ${MAX_WAIT_MS / 60000} min)`);
  INFO("This waits for the oracle window to close and the market to resolve naturally.");
  console.log();

  const waitStart = Date.now();
  let resolved = false;
  let finalStatus: string = "Trading";

  while (Date.now() - waitStart < MAX_WAIT_MS) {
    try {
      const status = await getOnChainMarketStatus(pulse.client, liveMarket.id);
      finalStatus = status;
      const elapsedSec = Math.floor((Date.now() - waitStart) / 1000);

      if (status === "Resolved" || status === "Voided") {
        console.log();
        OK(`Market resolved! Status: ${status} [${elapsedSec}s elapsed]`);
        resolved = true;
        break;
      }

      // Progress log
      const remaining = Math.max(0, Math.floor((MAX_WAIT_MS - (Date.now() - waitStart)) / 1000));
      process.stdout.write(
        `\r       ⏳ Waiting for resolution… [${elapsedSec}s elapsed] status: ${status.padEnd(10)} timeout in ${remaining}s`,
      );
    } catch (error) {
      // Transient read error — log and retry
      const elapsedSec = Math.floor((Date.now() - waitStart) / 1000);
      process.stdout.write(
        `\r       ⏳ Waiting for resolution… [${elapsedSec}s elapsed] status: (read error)      `,
      );
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  // Clear the progress line
  process.stdout.write("\r" + " ".repeat(80) + "\r");

  if (!resolved) {
    FAIL(`Resolution wait timed out after ${MAX_WAIT_MS / 60000} minutes.`);
    FAIL(`Last known on-chain status: ${finalStatus}`);
    INFO("This is normal if the market has a long resolution window.");
    INFO("Try again closer to the market's expiry, or use a different market.");
    console.log();
    console.log(`[${ts()}] Demo ended (trading path verified, resolution not reached within timeout).`);
    process.exit(0);
  }

  // ── Step 9: Redeem ──────────────────────────────────────────────
  STEP(9, "Redeeming winning position");

  // Pre-check: if the order never filled (Fills: 0), there's nothing to redeem.
  // This is the correct and expected outcome when the limit price is below the
  // best ask — the order rests in the book unfilled.
  if (orderFillCount === 0 && orderId !== undefined) {
    INFO("Order had 0 fills — it rested unfilled in the book.");
    INFO("Nothing to redeem: no outcome tokens were acquired.");
    INFO("This is normal when the limit price is below the best ask.");
  } else {
    try {
      // Poll for actual on-chain outcome-token balance before redeeming.
      // After resolution, fills may take a few seconds to propagate to the
      // ERC-6909 balance read. We poll every 3s for up to 60s.
      const outcomeIdx = liveMarket.winningOutcome ?? 0;
      const outcomeLabel = outcomeIdx === 0 ? "YES" : "NO";
      const traderAddress = traderAccount.address;

      const BAL_POLL_MS = 3_000;
      const BAL_MAX_WAIT_MS = 60_000;
      const balStart = Date.now();
      let balance = 0n;

      while (Date.now() - balStart < BAL_MAX_WAIT_MS) {
        balance = await getOutcomeBalanceOnchain(
          pulse.client,
          traderAddress as `0x${string}`,
          liveMarket,
          outcomeIdx as 0 | 1,
        );

        const elapsedSec = Math.floor((Date.now() - balStart) / 1000);
        const balHuman = (Number(balance) / 10 ** liveMarket.quoteDecimals).toFixed(liveMarket.quoteDecimals);
        INFO(`Balance poll: ${outcomeLabel} = ${balHuman} (${elapsedSec}s elapsed)`);

        if (balance > 0n) break;
        await new Promise((r) => setTimeout(r, BAL_POLL_MS));
      }

      if (balance === 0n) {
        FAIL(`No ${outcomeLabel} balance after ${BAL_MAX_WAIT_MS / 1000}s polling.`);
        INFO("Order may not have filled, or fills have not settled yet.");
      } else {
        INFO(`Confirmed ${outcomeLabel} balance: ${(Number(balance) / 10 ** liveMarket.quoteDecimals).toFixed(liveMarket.quoteDecimals)}`);

        const redeemResult = await redeemMarket(
          trader,
          pulse.client,
          liveMarket.id,
          traderAddress,
        );
        OK(`Redeem tx: ${redeemResult.hash}`);
      }
    } catch (error) {
      if (error instanceof PulseEngineError) {
        FAIL(`Redeem failed [${error.code}]: ${error.message}`);
      } else {
        FAIL(`Redeem failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      INFO("This may be due to indexer lag — try again in a few seconds.");
    }
  }

  // ── Step 10: Build and print receipt ────────────────────────────
  STEP(10, "Building receipt");
  try {
    // Wait for indexer to sync resolution events.
    INFO("Waiting 5s for resolution events to index...");
    await new Promise((r) => setTimeout(r, 5000));

    const receipt = await buildReceiptData(pulse.client, liveMarket.id, 50312);
    OK("Receipt built successfully:");
    console.log();
    console.log("┌──────────────────────────────────────────────────────────────┐");
    console.log("│                     MARKET RECEIPT                          │");
    console.log("├──────────────────────────────────────────────────────────────┤");
    console.log(`│ Question:  ${receipt.market.question}`);
    console.log(`│ Asset:     ${receipt.market.asset}`);
    console.log(`│ Strike:    ${receipt.market.strike}`);
    console.log(`│ Expiry:    ${new Date(Number(receipt.market.expiry) * 1000).toISOString()}`);
    console.log(`│ Winner:    ${receipt.resolution.winningOutcome === 0 ? "YES" : receipt.resolution.winningOutcome === 1 ? "NO" : "N/A"}`);
    console.log(`│ Events:    ${receipt.resolution.events.length}`);
    if (receipt.resolution.closingAnswer) {
      console.log(`│ Close:     ${receipt.resolution.closingAnswer.numericValue}`);
    }
    if (receipt.explorerTxUrl) {
      console.log(`│ Explorer:  ${receipt.explorerTxUrl}`);
    }
    console.log("└──────────────────────────────────────────────────────────────┘");
  } catch (error) {
    if (error instanceof PulseEngineError) {
      FAIL(`Receipt failed [${error.code}]: ${error.message}`);
    } else {
      FAIL(`Receipt failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log();
  console.log(`[${ts()}] Demo complete.`);

  // ── Cleanup: tear down WebSocket connections and exit ─────────
  // stopLive() shuts down every open watch, subscription, and reconnect timer
  // that the SDK client may have opened (market tail, order book live, etc.).
  // Without this, dangling WebSocket handles keep the event loop alive and the
  // process emits repeated ErrorEvent objects instead of terminating.
  try {
    pulse.client.stopLive();
  } catch {
    // Best-effort — if stopLive fails, process.exit below handles it.
  }
  process.exit(0);
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
