import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getSpotPrice,
  watchSpotPrice,
  getFairProbability,
} from "../priceFeed.ts";

// ─── Export shape tests ──────────────────────────────────────────────────────

describe("priceFeed module exports", () => {
  it("getSpotPrice is a function", () => {
    assert.equal(typeof getSpotPrice, "function");
  });

  it("watchSpotPrice is a function", () => {
    assert.equal(typeof watchSpotPrice, "function");
  });

  it("getFairProbability is a function", () => {
    assert.equal(typeof getFairProbability, "function");
  });
});

// ─── getSpotPrice tests ──────────────────────────────────────────────────────

describe("getSpotPrice", () => {
  it("returns formatted price from SDK fetchPrice", async () => {
    const client = {
      fetchPrice: async (asset: string) => ({
        asset,
        price: 65432.1,
        ema: 65430.0,
        blockNumber: 12345,
        blockTimestamp: 1700000000,
        decimals: 18,
        raw: {
          price: "65432100000000000000000",
          ema: "65430000000000000000000",
        },
      }),
    };

    const result = await getSpotPrice(client as any, "BTC");
    assert.ok(result !== null);
    assert.equal(result!.timestamp, 1700000000);
    // Price should be a human-readable string derived from the raw 1e18 value.
    assert.ok(typeof result!.price === "string");
    assert.ok(result!.price.length > 0);
  });

  it("returns null when feed has no observations", async () => {
    const client = {
      fetchPrice: async () => null,
    };

    const result = await getSpotPrice(client as any, "ETH");
    assert.equal(result, null);
  });

  it("wraps errors with context", async () => {
    const client = {
      fetchPrice: async () => {
        throw new Error("Indexer unreachable");
      },
    };

    await assert.rejects(
      () => getSpotPrice(client as any, "BTC"),
      (err: Error) => {
        assert.ok(err.message.includes("getSpotPrice failed"));
        assert.ok(err.message.includes("BTC"));
        assert.ok(err.message.includes("Indexer unreachable"));
        return true;
      },
    );
  });
});

// ─── watchSpotPrice tests ────────────────────────────────────────────────────

describe("watchSpotPrice", () => {
  it("delivers initial snapshot and unsubscribes cleanly", async () => {
    let snapshotCount = 0;
    let lastPrice: unknown = null;

    const client = {
      watchPrice: async () => ({ stop: () => {} }),
      subscribePrices: (listener: () => void) => {
        // Immediately invoke to simulate a store change.
        listener();
        return () => {};
      },
      getLivePrice: () => ({
        asset: "BTC",
        price: 65000,
        ema: 64990,
        blockNumber: 100,
        blockTimestamp: 1700000000,
        decimals: 18,
        raw: { price: "65000000000000000000000", ema: "64990000000000000000000" },
      }),
    };

    const unsub = watchSpotPrice(
      client as any,
      "BTC",
      (price) => {
        snapshotCount++;
        lastPrice = price;
      },
    );

    // Give the async watch start a tick to resolve.
    await new Promise((r) => setTimeout(r, 10));

    assert.ok(snapshotCount >= 1, "should have received at least 1 snapshot");
    assert.equal((lastPrice as any).timestamp, 1700000000);

    unsub();
  });

  it("stops delivering after unsubscribe", async () => {
    let count = 0;
    let priceListener: (() => void) | null = null;

    const client = {
      watchPrice: async () => ({ stop: () => {} }),
      subscribePrices: (listener: () => void) => {
        priceListener = listener;
        return () => {};
      },
      getLivePrice: () => ({
        asset: "ETH",
        price: 3500,
        ema: 3499,
        blockNumber: 200,
        blockTimestamp: 1700000100,
        decimals: 18,
        raw: { price: "3500000000000000000000", ema: "3499000000000000000000" },
      }),
    };

    const unsub = watchSpotPrice(
      client as any,
      "ETH",
      () => { count++; },
    );

    await new Promise((r) => setTimeout(r, 10));
    const countAfterStart = count;

    unsub();

    // Simulate a store change after unsub.
    priceListener?.();
    assert.equal(count, countAfterStart, "no updates after unsub");
  });
});

// ─── getFairProbability tests ────────────────────────────────────────────────

describe("getFairProbability", () => {
  const ONE_HOUR = 3600;
  const ONE_DAY = 86400;
  const ONE_WEEK = 604800;

  it("returns ~50% when spot equals strike", () => {
    // With spot == strike, log(spot/strike) = 0, so d = 0, Φ(0) = 0.5.
    const prob = getFairProbability("65000", "65000", ONE_HOUR);
    assert.ok(prob >= 0.49 && prob <= 0.51, `expected ~0.5, got ${prob}`);
  });

  it("returns high probability when spot is far above strike", () => {
    // BTC at 70000 vs strike 65000 with 1 hour remaining — strongly in the money.
    const prob = getFairProbability("70000", "65000", ONE_HOUR);
    assert.ok(prob > 0.85, `expected > 0.85, got ${prob}`);
  });

  it("returns low probability when spot is far below strike", () => {
    // BTC at 60000 vs strike 65000 with 1 hour remaining — strongly out of the money.
    const prob = getFairProbability("60000", "65000", ONE_HOUR);
    assert.ok(prob < 0.15, `expected < 0.15, got ${prob}`);
  });

  it("returns ~50% with long time remaining and spot near strike", () => {
    // With a week remaining and spot within 1% of strike, probability is near 50%.
    const prob = getFairProbability("65300", "65000", ONE_WEEK);
    assert.ok(prob >= 0.45 && prob <= 0.55, `expected ~0.5, got ${prob}`);
  });

  it("collapses to 1.0 when expired and spot >= strike", () => {
    const prob = getFairProbability("66000", "65000", 0);
    assert.equal(prob, 1.0);
  });

  it("collapses to 1.0 when expired and spot == strike", () => {
    const prob = getFairProbability("65000", "65000", 0);
    assert.equal(prob, 1.0);
  });

  it("collapses to 0.0 when expired and spot < strike", () => {
    const prob = getFairProbability("64000", "65000", 0);
    assert.equal(prob, 0.0);
  });

  it("collapses to 0.0 when negative time remaining and spot < strike", () => {
    const prob = getFairProbability("64000", "65000", -100);
    assert.equal(prob, 0.0);
  });

  it("collapses to 1.0 when negative time remaining and spot >= strike", () => {
    const prob = getFairProbability("66000", "65000", -100);
    assert.equal(prob, 1.0);
  });

  it("handles ETH-scale prices correctly", () => {
    // ETH at 3500 vs strike 3400 with 1 day remaining — ~3% above strike
    // with 40% annualized vol over 1 day gives a high but not certainty probability.
    const prob = getFairProbability("3500", "3400", ONE_DAY);
    assert.ok(prob > 0.55, `expected > 0.55, got ${prob}`);
    assert.ok(prob < 1.0, `expected < 1.0, got ${prob}`);
  });

  it("returns 0.5 for invalid inputs (non-finite)", () => {
    assert.equal(getFairProbability("abc", "65000", ONE_HOUR), 0.5);
    assert.equal(getFairProbability("65000", "xyz", ONE_HOUR), 0.5);
  });

  it("returns 0.5 for zero/negative prices", () => {
    assert.equal(getFairProbability("0", "65000", ONE_HOUR), 0.5);
    assert.equal(getFairProbability("65000", "0", ONE_HOUR), 0.5);
    assert.equal(getFairProbability("-100", "65000", ONE_HOUR), 0.5);
  });

  it("probability increases monotonically with spot price", () => {
    const strikes = ["65000"];
    const times = [ONE_HOUR, ONE_DAY, ONE_WEEK];

    for (const time of times) {
      const probs: number[] = [];
      for (let spot = 60000; spot <= 70000; spot += 1000) {
        probs.push(getFairProbability(String(spot), "65000", time));
      }
      // Each probability should be >= the previous.
      for (let i = 1; i < probs.length; i++) {
        assert.ok(
          probs[i] >= probs[i - 1],
          `not monotonic at time=${time}: prob(${i})=${probs[i]} < prob(${i - 1})=${probs[i - 1]}`,
        );
      }
    }
  });

  it("probability decreases monotonically with time remaining (for ITM)", () => {
    // Spot above strike: more time = more uncertainty = closer to 50%.
    const times = [ONE_HOUR, ONE_DAY, ONE_WEEK, ONE_WEEK * 4];
    const probs: number[] = [];
    for (const t of times) {
      probs.push(getFairProbability("66000", "65000", t));
    }
    // Each probability should be <= the previous (converging toward 0.5).
    for (let i = 1; i < probs.length; i++) {
      assert.ok(
        probs[i] <= probs[i - 1],
        `not converging: prob(${i})=${probs[i]} > prob(${i - 1})=${probs[i - 1]}`,
      );
    }
  });
});
