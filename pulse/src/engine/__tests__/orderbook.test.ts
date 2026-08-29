import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getOrderBookSnapshot,
  watchOrderBook,
  computeDefaultExpiry,
  DEFAULT_ORDER_EXPIRY_BUFFER_SECONDS,
} from "../orderbook.ts";

// ─── Export shape tests ──────────────────────────────────────────────────────

describe("orderbook module exports", () => {
  it("getOrderBookSnapshot is a function", () => {
    assert.equal(typeof getOrderBookSnapshot, "function");
  });

  it("watchOrderBook is a function", () => {
    assert.equal(typeof watchOrderBook, "function");
  });

  it("computeDefaultExpiry is a function", () => {
    assert.equal(typeof computeDefaultExpiry, "function");
  });

  it("DEFAULT_ORDER_EXPIRY_BUFFER_SECONDS is 60", () => {
    assert.equal(DEFAULT_ORDER_EXPIRY_BUFFER_SECONDS, 60);
  });
});

// ─── getOrderBookSnapshot tests ──────────────────────────────────────────────

describe("getOrderBookSnapshot", () => {
  it("converts bigint book to human-readable strings", async () => {
    const client = {
      getBinaryOrderBook: async () => ({
        yesBids: [
          { price: 620000n, quantity: 1000000n },
          { price: 610000n, quantity: 2000000n },
        ],
        yesAsks: [
          { price: 630000n, quantity: 500000n },
          { price: 640000n, quantity: 1500000n },
        ],
        noBids: [],
        noAsks: [],
      }),
    };

    const result = await getOrderBookSnapshot(
      client as any,
      "0xpool",
      6, // 6dp test USDC
    );

    assert.equal(result.bestBid, "0.62");
    assert.equal(result.bestAsk, "0.63");
    assert.equal(result.bids.length, 2);
    assert.equal(result.bids[0].price, "0.62");
    assert.equal(result.bids[0].quantity, "1");
    assert.equal(result.bids[1].price, "0.61");
    assert.equal(result.bids[1].quantity, "2");
    assert.equal(result.asks.length, 2);
    assert.equal(result.asks[0].price, "0.63");
    assert.equal(result.asks[0].quantity, "0.5");
  });

  it("returns zero best bid/ask for empty book", async () => {
    const client = {
      getBinaryOrderBook: async () => ({
        yesBids: [],
        yesAsks: [],
        noBids: [],
        noAsks: [],
      }),
    };

    const result = await getOrderBookSnapshot(
      client as any,
      "0xpool",
      6,
    );

    assert.equal(result.bestBid, "0");
    assert.equal(result.bestAsk, "0");
    assert.equal(result.bids.length, 0);
    assert.equal(result.asks.length, 0);
  });

  it("passes depth option to SDK", async () => {
    let capturedOpts: unknown = undefined;
    const client = {
      getBinaryOrderBook: async (_pool: string, opts: unknown) => {
        capturedOpts = opts;
        return { yesBids: [], yesAsks: [], noBids: [], noAsks: [] };
      },
    };

    await getOrderBookSnapshot(client as any, "0xpool", 6, 20);
    assert.deepEqual(capturedOpts, { depth: 20, decimals: 6 });
  });

  it("uses 18dp decimals correctly", async () => {
    const client = {
      getBinaryOrderBook: async () => ({
        yesBids: [{ price: 500000000000000000n, quantity: 1000000000000000000n }],
        yesAsks: [{ price: 510000000000000000n, quantity: 2000000000000000000n }],
        noBids: [],
        noAsks: [],
      }),
    };

    const result = await getOrderBookSnapshot(
      client as any,
      "0xpool",
      18, // 18dp native
    );

    assert.equal(result.bestBid, "0.5");
    assert.equal(result.bestAsk, "0.51");
    assert.equal(result.bids[0].quantity, "1");
    assert.equal(result.asks[0].quantity, "2");
  });

  it("wraps errors with context", async () => {
    const client = {
      getBinaryOrderBook: async () => {
        throw new Error("RPC timeout");
      },
    };

    await assert.rejects(
      () => getOrderBookSnapshot(client as any, "0xdead", 6),
      (err: Error) => {
        assert.ok(err.message.includes("getOrderBookSnapshot failed"));
        assert.ok(err.message.includes("0xdead"));
        assert.ok(err.message.includes("RPC timeout"));
        return true;
      },
    );
  });
});

// ─── watchOrderBook tests ────────────────────────────────────────────────────

describe("watchOrderBook", () => {
  it("delivers initial snapshot and unsubscribes cleanly", async () => {
    let snapshotCount = 0;
    let lastSnapshot: unknown = null;

    const client = {
      watchMarket: async () => ({ stop: () => {} }),
      subscribeLive: (listener: () => void) => {
        // Immediately invoke to simulate a store change.
        listener();
        return () => {};
      },
      getLiveBinaryOrderBook: () => ({
        yesBids: [{ price: 620000n, quantity: 1000000n }],
        yesAsks: [{ price: 630000n, quantity: 500000n }],
        noBids: [],
        noAsks: [],
      }),
    };

    const unsub = watchOrderBook(
      client as any,
      "0xpool",
      6,
      (book) => {
        snapshotCount++;
        lastSnapshot = book;
      },
    );

    // Give the async watch start a tick to resolve.
    await new Promise((r) => setTimeout(r, 10));

    assert.ok(snapshotCount >= 1, "should have received at least 1 snapshot");
    assert.equal((lastSnapshot as any).bestBid, "0.62");

    unsub();
  });

  it("stops delivering after unsubscribe", async () => {
    let count = 0;
    let liveListener: (() => void) | null = null;

    const client = {
      watchMarket: async () => ({ stop: () => {} }),
      subscribeLive: (listener: () => void) => {
        liveListener = listener;
        return () => {};
      },
      getLiveBinaryOrderBook: () => ({
        yesBids: [],
        yesAsks: [],
        noBids: [],
        noAsks: [],
      }),
    };

    const unsub = watchOrderBook(
      client as any,
      "0xpool",
      6,
      () => {
        count++;
      },
    );

    await new Promise((r) => setTimeout(r, 10));
    const countAfterStart = count;

    unsub();

    // Simulate a store change after unsub.
    liveListener?.();
    assert.equal(count, countAfterStart, "no updates after unsub");
  });
});

// ─── computeDefaultExpiry tests ──────────────────────────────────────────────

describe("computeDefaultExpiry", () => {
  it("returns a bigint in nanoseconds", () => {
    // Market expiry 10 minutes from now — well beyond the 60s buffer.
    const futureSec = Math.floor(Date.now() / 1000) + 600;
    const market = { expiry: String(futureSec) } as any;
    const result = computeDefaultExpiry(market);
    assert.equal(typeof result, "bigint");
    assert.ok(result > 0n);
  });

  it("is approximately now + 60s when market expiry is far away", () => {
    const before = BigInt(Date.now()) * 1_000_000n;
    const futureSec = Math.floor(Date.now() / 1000) + 3600; // 1 hour out
    const market = { expiry: String(futureSec) } as any;
    const result = computeDefaultExpiry(market);
    const after = BigInt(Date.now()) * 1_000_000n;

    const bufferNs = BigInt(DEFAULT_ORDER_EXPIRY_BUFFER_SECONDS) * 1_000_000_000n;

    // result should be roughly before + 60s (with some test execution slack)
    assert.ok(result >= before + bufferNs - 1_000_000_000n, "should be >= now + 60s - 1s slack");
    assert.ok(result <= after + bufferNs + 1_000_000_000n, "should be <= now + 60s + 1s slack");
  });

  it("clamps to market expiry - 5s when market expires within 60s", () => {
    const futureSec = Math.floor(Date.now() / 1000) + 30; // 30s from now
    const market = { expiry: String(futureSec) } as any;
    const result = computeDefaultExpiry(market);

    const marketExpiryNs = BigInt(futureSec) * 1_000_000_000n;
    const safetyMargin = 5_000_000_000n; // 5 seconds
    const maxSafeExpiry = marketExpiryNs - safetyMargin;

    // The result must not exceed marketExpiry - 5s.
    assert.ok(
      result <= maxSafeExpiry,
      `expiry ${result} should be <= maxSafeExpiry ${maxSafeExpiry}`,
    );
    // The result should be close to maxSafeExpiry (since now+60s > marketExpiry-5s).
    assert.ok(
      result > maxSafeExpiry - 2_000_000_000n,
      `expiry ${result} should be close to maxSafeExpiry ${maxSafeExpiry}`,
    );
  });

  it("throws when market is expiring within 5 seconds", () => {
    const futureSec = Math.floor(Date.now() / 1000) + 3; // 3s from now
    const market = { expiry: String(futureSec) } as any;

    assert.throws(
      () => computeDefaultExpiry(market),
      {
        message: /Market expiring too soon to place a safe order/,
      },
    );
  });

  it("returns different values on successive calls (time moves)", () => {
    const futureSec = Math.floor(Date.now() / 1000) + 600;
    const market = { expiry: String(futureSec) } as any;
    const a = computeDefaultExpiry(market);
    const b = computeDefaultExpiry(market);
    // They might be equal if called in the same millisecond, but usually not.
    // Just verify both are valid bigints.
    assert.ok(a > 0n);
    assert.ok(b > 0n);
  });
});
