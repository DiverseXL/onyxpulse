import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  placeLadderOrders,
  rollToNextWindow,
  rankMarketsByOpportunity,
} from "../ladder.ts";

import type { BinaryMarket } from "../ladder.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMarket(overrides: Partial<BinaryMarket> = {}): BinaryMarket {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    id: "0x0000000000000000000000000000000000000000000000000000000000000001",
    marketType: "BINARY",
    poolAddress: "0x0000000000000000000000000000000000000001" as any,
    lastPrice: null,
    lastTradeAt: null,
    cumulativeBaseVolume: "0",
    cumulativeQuoteVolume: "0",
    tradeCount: "0",
    baseDecimals: 6,
    quoteDecimals: 6,
    createdAtTimestamp: String(nowSec),
    marketId:
      "0x0000000000000000000000000000000000000000000000000000000000000001" as any,
    marketAddress: "0x0000000000000000000000000000000000000001" as any,
    yesTokenId: "1",
    noTokenId: "2",
    collateral: "0x0000000000000000000000000000000000000001" as any,
    asset: "BTC",
    question: "Will BTC reach $100k?",
    status: "Trading",
    oracleQuestion: "BTC $100k",
    strike: "100000",
    tradingStart: String(nowSec - 3600),
    expiry: String(nowSec + 3600),
    winningOutcome: null,
    voided: false,
    backing: "50000",
    ...overrides,
  };
}

function makeFakeTrader(results?: { hash: string; orderId?: bigint }[]) {
  let callIndex = 0;
  return {
    placeOrder: async (params: Record<string, unknown>) => {
      const r = results?.[callIndex++] ?? {
        hash: `0xtx${callIndex}`,
        orderId: BigInt(callIndex),
      };
      return { hash: r.hash, receipt: {}, orderId: r.orderId, fills: [] };
    },
    cancelOrder: async () => ({ hash: "0x", receipt: {} }),
  };
}

function makeFakeClient(overrides: Record<string, any> = {}) {
  return {
    getMarketByPool: async () => ({
      marketId: "0x0000000000000000000000000000000000000000000000000000000000000001",
      marketType: "BINARY",
    }),
    getMarketOnchain: async () => ({ status: 1 }),
    ...overrides,
  };
}

// ─── placeLadderOrders ───────────────────────────────────────────────────────

describe("placeLadderOrders", () => {
  it("places all levels and returns ok results", async () => {
    const trader = makeFakeTrader([
      { hash: "0xL1", orderId: 101n },
      { hash: "0xL2", orderId: 102n },
      { hash: "0xL3", orderId: 103n },
    ]);
    const client = makeFakeClient();
    const market = makeMarket();

    const levels = [
      { side: "BUY_YES" as const, humanPrice: "0.50", humanQuantity: "10" },
      { side: "BUY_YES" as const, humanPrice: "0.55", humanQuantity: "20" },
      { side: "BUY_YES" as const, humanPrice: "0.60", humanQuantity: "15" },
    ];

    const results = await placeLadderOrders(
      trader as any,
      client as any,
      market.poolAddress,
      market,
      levels,
    );

    assert.equal(results.length, 3);
    assert.equal(results.every((r) => r.ok), true);
    assert.equal(results[0].ok, true);
    if (results[0].ok) {
      assert.equal(results[0].result.orderId, 101n);
      assert.equal(results[0].result.hash, "0xL1");
    }
    assert.equal(results[2].ok, true);
    if (results[2].ok) {
      assert.equal(results[2].result.orderId, 103n);
    }
  });

  it("continues through failures and returns mixed results", async () => {
    let callCount = 0;
    const trader = {
      placeOrder: async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error("InsufficientBalance");
        }
        return {
          hash: `0xok${callCount}`,
          receipt: {},
          orderId: BigInt(callCount),
          fills: [],
        };
      },
      cancelOrder: async () => ({ hash: "0x", receipt: {} }),
    };
    const client = makeFakeClient();
    const market = makeMarket();

    const levels = [
      { side: "BUY_YES" as const, humanPrice: "0.50", humanQuantity: "10" },
      { side: "SELL_NO" as const, humanPrice: "0.40", humanQuantity: "5" },
      { side: "BUY_NO" as const, humanPrice: "0.35", humanQuantity: "8" },
    ];

    const results = await placeLadderOrders(
      trader as any,
      client as any,
      market.poolAddress,
      market,
      levels,
    );

    assert.equal(results.length, 3);
    // Level 1: ok
    assert.equal(results[0].ok, true);
    // Level 2: failed
    assert.equal(results[1].ok, false);
    if (!results[1].ok) {
      assert.ok(results[1].error.message.includes("InsufficientBalance"));
    }
    // Level 3: ok (continued past failure)
    assert.equal(results[2].ok, true);
  });

  it("handles empty levels array", async () => {
    const trader = makeFakeTrader();
    const client = makeFakeClient();
    const market = makeMarket();

    const results = await placeLadderOrders(
      trader as any,
      client as any,
      market.poolAddress,
      market,
      [],
    );

    assert.equal(results.length, 0);
  });
});

// ─── rollToNextWindow ────────────────────────────────────────────────────────

describe("rollToNextWindow", () => {
  it("returns next Trading market for the same asset", async () => {
    const currentId =
      "0x0000000000000000000000000000000000000000000000000000000000000001";
    const nowSec = Math.floor(Date.now() / 1000);

    const market1 = makeMarket({
      marketId: currentId as any,
      asset: "BTC",
      status: "Trading",
      expiry: String(nowSec + 100),
    });
    const market2 = makeMarket({
      id: "0x02",
      marketId:
        "0x0000000000000000000000000000000000000000000000000000000000000002" as any,
      asset: "BTC",
      status: "Trading",
      expiry: String(nowSec + 3600),
    });
    const market3 = makeMarket({
      id: "0x03",
      marketId:
        "0x0000000000000000000000000000000000000000000000000000000000000003" as any,
      asset: "BTC",
      status: "Listed",
      expiry: String(nowSec + 7200),
    });

    const client = makeFakeClient({
      listBinaryMarkets: async (opts: { status: string }) => {
        if (opts.status === "Trading") return [market1, market2];
        if (opts.status === "Listed") return [market3];
        return [];
      },
    });

    const result = await rollToNextWindow(client as any, currentId, "BTC");
    assert.ok(result);
    // market2 has sooner expiry than market3, but we exclude currentId
    assert.equal(
      result.marketId,
      "0x0000000000000000000000000000000000000000000000000000000000000002",
    );
  });

  it("returns null when no next window exists", async () => {
    const currentId =
      "0x0000000000000000000000000000000000000000000000000000000000000001";
    const client = makeFakeClient({
      listBinaryMarkets: async () => [],
    });

    const result = await rollToNextWindow(client as any, currentId, "BTC");
    assert.equal(result, null);
  });

  it("filters by asset — does not return ETH market for BTC roll", async () => {
    const currentId =
      "0x0000000000000000000000000000000000000000000000000000000000000001";
    const nowSec = Math.floor(Date.now() / 1000);

    const ethMarket = makeMarket({
      id: "0xeth",
      marketId:
        "0x0000000000000000000000000000000000000000000000000000000000000099" as any,
      asset: "ETH",
      status: "Trading",
      expiry: String(nowSec + 3600),
    });

    const client = makeFakeClient({
      listBinaryMarkets: async (opts: { status: string }) => {
        if (opts.status === "Trading") return [ethMarket];
        return [];
      },
    });

    const result = await rollToNextWindow(client as any, currentId, "BTC");
    assert.equal(result, null);
  });
});

// ─── rankMarketsByOpportunity ────────────────────────────────────────────────

describe("rankMarketsByOpportunity", () => {
  it("sorts by time-remaining descending (more time = better)", async () => {
    const nowSec = Math.floor(Date.now() / 1000);

    const nearExpiry = makeMarket({
      id: "0xnear",
      marketId: "0xnear" as any,
      asset: "BTC",
      expiry: String(nowSec + 300), // 5 min
      backing: "10000",
    });
    const farExpiry = makeMarket({
      id: "0xfar",
      marketId: "0xfar" as any,
      asset: "BTC",
      expiry: String(nowSec + 3600), // 1 hour
      backing: "10000",
    });

    const client = makeFakeClient();
    const result = await rankMarketsByOpportunity(client as any, [
      nearExpiry,
      farExpiry,
    ]);

    assert.equal(result.length, 2);
    // farExpiry should rank higher (more time remaining)
    assert.equal(result[0].id, "0xfar");
    assert.equal(result[1].id, "0xnear");
  });

  it("sorts by volume when time-remaining is equal", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const future = String(nowSec + 1800);

    const lowVolume = makeMarket({
      id: "0xlow",
      marketId: "0xlow" as any,
      asset: "BTC",
      expiry: future,
      cumulativeQuoteVolume: "1000000", // 1.0 in 6dp
    });
    const highVolume = makeMarket({
      id: "0xhigh",
      marketId: "0xhigh" as any,
      asset: "BTC",
      expiry: future,
      cumulativeQuoteVolume: "100000000000", // 100000 in 6dp
    });

    const client = makeFakeClient();
    const result = await rankMarketsByOpportunity(client as any, [
      lowVolume,
      highVolume,
    ]);

    assert.equal(result.length, 2);
    // highVolume should rank higher (more trading activity)
    assert.equal(result[0].id, "0xhigh");
    assert.equal(result[1].id, "0xlow");
  });

  it("does not mutate the input array", async () => {
    const nowSec = Math.floor(Date.now() / 1000);

    const a = makeMarket({
      id: "0xa",
      marketId: "0xa" as any,
      asset: "BTC",
      expiry: String(nowSec + 100),
      backing: "1000",
    });
    const b = makeMarket({
      id: "0xb",
      marketId: "0xb" as any,
      asset: "BTC",
      expiry: String(nowSec + 3600),
      backing: "5000",
    });

    const input = [a, b];
    const client = makeFakeClient();
    await rankMarketsByOpportunity(client as any, input);

    // Input order preserved
    assert.equal(input[0].id, "0xa");
    assert.equal(input[1].id, "0xb");
  });

  it("handles empty array", async () => {
    const client = makeFakeClient();
    const result = await rankMarketsByOpportunity(client as any, []);
    assert.equal(result.length, 0);
  });
});

// ─── Export shape tests ──────────────────────────────────────────────────────

describe("ladder module exports", () => {
  it("placeLadderOrders is a function", () => {
    assert.equal(typeof placeLadderOrders, "function");
  });

  it("rollToNextWindow is a function", () => {
    assert.equal(typeof rollToNextWindow, "function");
  });

  it("rankMarketsByOpportunity is a function", () => {
    assert.equal(typeof rankMarketsByOpportunity, "function");
  });
});
