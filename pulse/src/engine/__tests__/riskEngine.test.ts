import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  checkRiskLimits,
  flattenBeforeExpiry,
} from "../riskEngine.ts";

import type { RiskLimits } from "../riskEngine.ts";

// ─── Export shape tests ──────────────────────────────────────────────────────

describe("riskEngine module exports", () => {
  it("checkRiskLimits is a function", () => {
    assert.equal(typeof checkRiskLimits, "function");
  });

  it("flattenBeforeExpiry is a function", () => {
    assert.equal(typeof flattenBeforeExpiry, "function");
  });
});

// ─── Mock helpers ────────────────────────────────────────────────────────────

function makePosition(
  marketId: string,
  balance: string,
  outcomeIndex: number = 0,
  quoteDecimals: number = 6,
  poolAddress: string = "0xpool001",
) {
  return {
    market: {
      id: marketId,
      marketAddress: `0xmarket_${marketId}`,
      poolAddress,
      asset: "BTC",
      question: `Market ${marketId}`,
      status: "Trading" as const,
      lastPrice: "600000",
      strike: "50000",
      expiry: "1800000000",
      winningOutcome: null,
      voided: false,
      quoteDecimals,
      intervalSec: "3600",
      interval: "1h",
    },
    outcomeIndex,
    tokenId: "1",
    balance,
  };
}

function makeFakeClient(
  positions: ReturnType<typeof makePosition>[],
  overrides: Record<string, unknown> = {},
) {
  return {
    getPortfolio: async () => ({
      account: "0xowner",
      positions,
      openOrders: [],
      trades: [],
    }),
    getBinaryMarket: async (id: string) => ({
      id,
      marketType: "BINARY" as const,
      marketId: id as `0x${string}`,
      poolAddress: "0xpool001" as `0x${string}`,
      marketAddress: "0xmarket" as `0x${string}`,
      asset: "BTC",
      question: `Market ${id}`,
      status: "Trading" as const,
      lastPrice: "600000",
      strike: "50000",
      expiry: String(Math.floor(Date.now() / 1000) + 3600),
      winningOutcome: null,
      voided: false,
      backing: "0",
      quoteDecimals: 6,
      createdAtTimestamp: "1000000",
      collateral: "0xusdc" as `0x${string}`,
      yesTokenId: "1",
      noTokenId: "2",
      resolvedAtBlock: null,
      resolvedAtTimestamp: null,
      createdByTx: null,
      cumulativeBaseVolume: "0",
      cumulativeQuoteVolume: "0",
      tradeCount: "0",
      lastTradeAt: null,
      baseDecimals: 6,
    }),
    // Required by placeMarketOrder (trading.ts) which calls getMarketByPool
    getMarketByPool: async (pool: string) => ({
      marketId: "0xmarket",
      marketType: "BINARY",
      poolAddress: pool,
    }),
    getMarketOnchain: async () => ({ status: 1 }), // Trading
    ...overrides,
  };
}

function makeLimits(overrides: Partial<RiskLimits> = {}): RiskLimits {
  return {
    maxPositionSizePerMarket: "10",
    maxOpenMarkets: 3,
    maxTotalExposure: "25",
    ...overrides,
  };
}

// ─── checkRiskLimits — within limits ─────────────────────────────────────────

describe("checkRiskLimits — within limits", () => {
  it("allows when no existing positions", async () => {
    const client = makeFakeClient([]);
    const result = await checkRiskLimits(
      client as any,
      "0xowner",
      "0xmarket1",
      "5",
      makeLimits(),
    );
    assert.equal(result.allowed, true);
    assert.equal(result.reason, undefined);
  });

  it("allows when adding to an existing position within limit", async () => {
    const client = makeFakeClient([
      makePosition("0xmarket1", "3000000"), // 3 USDC
    ]);
    const result = await checkRiskLimits(
      client as any,
      "0xowner",
      "0xmarket1",
      "5", // proposed: 5 USDC → total 8 USDC < 10 limit
      makeLimits(),
    );
    assert.equal(result.allowed, true);
  });

  it("allows when at the exact limit", async () => {
    const client = makeFakeClient([
      makePosition("0xmarket1", "5000000"), // 5 USDC
    ]);
    const result = await checkRiskLimits(
      client as any,
      "0xowner",
      "0xmarket1",
      "5", // proposed: 5 USDC → total 10 USDC == 10 limit
      makeLimits(),
    );
    assert.equal(result.allowed, true);
  });
});

// ─── checkRiskLimits — exceeds max position size ─────────────────────────────

describe("checkRiskLimits — exceeds maxPositionSizePerMarket", () => {
  it("rejects when current + proposed > limit", async () => {
    const client = makeFakeClient([
      makePosition("0xmarket1", "8000000"), // 8 USDC
    ]);
    const result = await checkRiskLimits(
      client as any,
      "0xowner",
      "0xmarket1",
      "5", // proposed: 5 USDC → total 13 USDC > 10 limit
      makeLimits(),
    );
    assert.equal(result.allowed, false);
    assert.ok(result.reason!.includes("maxPositionSizePerMarket"));
    assert.ok(result.reason!.includes("8"));
    assert.ok(result.reason!.includes("5"));
    assert.ok(result.reason!.includes("10"));
  });

  it("rejects with both YES and NO positions combined", async () => {
    const client = makeFakeClient([
      makePosition("0xmarket1", "6000000", 0), // 6 USDC YES
      makePosition("0xmarket1", "4000000", 1), // 4 USDC NO
    ]);
    const result = await checkRiskLimits(
      client as any,
      "0xowner",
      "0xmarket1",
      "2", // proposed: 2 USDC → total 12 USDC > 10 limit
      makeLimits(),
    );
    assert.equal(result.allowed, false);
    assert.ok(result.reason!.includes("maxPositionSizePerMarket"));
  });
});

// ─── checkRiskLimits — exceeds max open markets ──────────────────────────────

describe("checkRiskLimits — exceeds maxOpenMarkets", () => {
  it("rejects when adding a new market would exceed limit", async () => {
    const client = makeFakeClient([
      makePosition("0xmarket1", "1000000"),
      makePosition("0xmarket2", "1000000"),
      makePosition("0xmarket3", "1000000"),
    ]);
    const result = await checkRiskLimits(
      client as any,
      "0xowner",
      "0xmarket4", // new market
      "1",
      makeLimits({ maxOpenMarkets: 3 }),
    );
    assert.equal(result.allowed, false);
    assert.ok(result.reason!.includes("maxOpenMarkets"));
    assert.ok(result.reason!.includes("3"));
    assert.ok(result.reason!.includes("4"));
  });

  it("allows when adding to an existing market (not new)", async () => {
    const client = makeFakeClient([
      makePosition("0xmarket1", "1000000"),
      makePosition("0xmarket2", "1000000"),
      makePosition("0xmarket3", "1000000"),
    ]);
    const result = await checkRiskLimits(
      client as any,
      "0xowner",
      "0xmarket1", // existing market, not new
      "1",
      makeLimits({ maxOpenMarkets: 3 }),
    );
    assert.equal(result.allowed, true);
  });
});

// ─── checkRiskLimits — exceeds max total exposure ────────────────────────────

describe("checkRiskLimits — exceeds maxTotalExposure", () => {
  it("rejects when total exposure would exceed limit", async () => {
    const client = makeFakeClient([
      makePosition("0xmarket1", "8000000"), // 8 USDC
      makePosition("0xmarket2", "8000000"), // 8 USDC
      makePosition("0xmarket3", "8000000"), // 8 USDC
    ]);
    const result = await checkRiskLimits(
      client as any,
      "0xowner",
      "0xmarket4",
      "5", // total would be 29 USDC > 25 limit
      makeLimits({ maxOpenMarkets: 10 }),
    );
    assert.equal(result.allowed, false);
    assert.ok(result.reason!.includes("maxTotalExposure"));
    assert.ok(result.reason!.includes("24"));
    assert.ok(result.reason!.includes("5"));
  });
});

// ─── flattenBeforeExpiry — triggers when near expiry ─────────────────────────

describe("flattenBeforeExpiry — triggers near expiry", () => {
  it("sells position when market is within threshold of expiry", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    let capturedSide: string | null = null;

    const fakeTrader = {
      placeOrder: async (params: { side: string; quantity: bigint }) => {
        capturedSide = params.side;
        return { hash: "0xflattened" };
      },
      cancelOrder: async () => ({ hash: "0x" }),
    };

    const fakeClient = {
      getBinaryMarket: async () => ({
        id: "0xexpiring",
        marketType: "BINARY",
        marketId: "0xexpiring",
        poolAddress: "0xpool_exp",
        marketAddress: "0xmarket_exp",
        asset: "BTC",
        question: "Expiring market",
        status: "Trading",
        lastPrice: "600000",
        strike: "50000",
        expiry: String(nowSec + 120), // 2 minutes from now
        winningOutcome: null,
        voided: false,
        backing: "0",
        quoteDecimals: 6,
        createdAtTimestamp: "1000000",
        collateral: "0xusdc",
        yesTokenId: "1",
        noTokenId: "2",
        resolvedAtBlock: null,
        resolvedAtTimestamp: null,
        createdByTx: null,
        cumulativeBaseVolume: "0",
        cumulativeQuoteVolume: "0",
        tradeCount: "0",
        lastTradeAt: null,
        baseDecimals: 6,
      }),
      getPortfolio: async () => ({
        account: "0xowner",
        positions: [makePosition("0xexpiring", "5000000", 0, 6, "0xpool_exp")],
        openOrders: [],
        trades: [],
      }),
      getMarketByPool: async (pool: string) => ({
        marketId: "0xexpiring",
        marketType: "BINARY",
        poolAddress: pool,
      }),
      getMarketOnchain: async () => ({ status: 1 }),
    };

    const result = await flattenBeforeExpiry(
      fakeTrader as any,
      fakeClient as any,
      "0xowner",
      "0xexpiring",
      300, // 5-minute threshold
    );

    assert.ok(result);
    assert.equal(result!.hash, "0xflattened");
    assert.equal(capturedSide, "SELL_YES"); // YES balance (5) > NO balance (0)
  });

  it("sells NO side when NO balance is larger", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    let capturedSide: string | null = null;

    const fakeTrader = {
      placeOrder: async (params: { side: string }) => {
        capturedSide = params.side;
        return { hash: "0xflattened_no" };
      },
      cancelOrder: async () => ({ hash: "0x" }),
    };

    const fakeClient = {
      getBinaryMarket: async () => ({
        id: "0xno_heavy",
        marketType: "BINARY",
        marketId: "0xno_heavy",
        poolAddress: "0xpool_no",
        marketAddress: "0xmarket_no",
        asset: "BTC",
        question: "NO heavy market",
        status: "Trading",
        lastPrice: "400000",
        strike: "50000",
        expiry: String(nowSec + 60),
        winningOutcome: null,
        voided: false,
        backing: "0",
        quoteDecimals: 6,
        createdAtTimestamp: "1000000",
        collateral: "0xusdc",
        yesTokenId: "1",
        noTokenId: "2",
        resolvedAtBlock: null,
        resolvedAtTimestamp: null,
        createdByTx: null,
        cumulativeBaseVolume: "0",
        cumulativeQuoteVolume: "0",
        tradeCount: "0",
        lastTradeAt: null,
        baseDecimals: 6,
      }),
      getPortfolio: async () => ({
        account: "0xowner",
        positions: [
          makePosition("0xno_heavy", "1000000", 0, 6, "0xpool_no"), // YES: 1
          makePosition("0xno_heavy", "3000000", 1, 6, "0xpool_no"), // NO: 3
        ],
        openOrders: [],
        trades: [],
      }),
      getMarketByPool: async (pool: string) => ({
        marketId: "0xno_heavy",
        marketType: "BINARY",
        poolAddress: pool,
      }),
      getMarketOnchain: async () => ({ status: 1 }),
    };

    const result = await flattenBeforeExpiry(
      fakeTrader as any,
      fakeClient as any,
      "0xowner",
      "0xno_heavy",
      300,
    );

    assert.ok(result);
    assert.equal(capturedSide, "SELL_NO");
  });
});

// ─── flattenBeforeExpiry — no-ops ────────────────────────────────────────────

describe("flattenBeforeExpiry — no-ops", () => {
  it("returns null when market is not near expiry", async () => {
    const nowSec = Math.floor(Date.now() / 1000);

    const fakeTrader = {
      placeOrder: async () => { throw new Error("should not be called"); },
      cancelOrder: async () => ({ hash: "0x" }),
    };

    const fakeClient = {
      getBinaryMarket: async () => ({
        id: "0xnot_near",
        marketType: "BINARY",
        marketId: "0xnot_near",
        poolAddress: "0xpool_nn",
        marketAddress: "0xmarket_nn",
        asset: "BTC",
        question: "Not near expiry",
        status: "Trading",
        lastPrice: "600000",
        strike: "50000",
        expiry: String(nowSec + 7200), // 2 hours from now
        winningOutcome: null,
        voided: false,
        backing: "0",
        quoteDecimals: 6,
        createdAtTimestamp: "1000000",
        collateral: "0xusdc",
        yesTokenId: "1",
        noTokenId: "2",
        resolvedAtBlock: null,
        resolvedAtTimestamp: null,
        createdByTx: null,
        cumulativeBaseVolume: "0",
        cumulativeQuoteVolume: "0",
        tradeCount: "0",
        lastTradeAt: null,
        baseDecimals: 6,
      }),
      getPortfolio: async () => ({
        account: "0xowner",
        positions: [makePosition("0xnot_near", "5000000", 0, 6, "0xpool_nn")],
        openOrders: [],
        trades: [],
      }),
    };

    const result = await flattenBeforeExpiry(
      fakeTrader as any,
      fakeClient as any,
      "0xowner",
      "0xnot_near",
      300,
    );

    assert.equal(result, null);
  });

  it("returns null when no position exists in the market", async () => {
    const nowSec = Math.floor(Date.now() / 1000);

    const fakeTrader = {
      placeOrder: async () => { throw new Error("should not be called"); },
      cancelOrder: async () => ({ hash: "0x" }),
    };

    const fakeClient = {
      getBinaryMarket: async () => ({
        id: "0xno_pos",
        marketType: "BINARY",
        marketId: "0xno_pos",
        poolAddress: "0xpool_np",
        marketAddress: "0xmarket_np",
        asset: "BTC",
        question: "No position",
        status: "Trading",
        lastPrice: "600000",
        strike: "50000",
        expiry: String(nowSec + 60), // 1 minute from now
        winningOutcome: null,
        voided: false,
        backing: "0",
        quoteDecimals: 6,
        createdAtTimestamp: "1000000",
        collateral: "0xusdc",
        yesTokenId: "1",
        noTokenId: "2",
        resolvedAtBlock: null,
        resolvedAtTimestamp: null,
        createdByTx: null,
        cumulativeBaseVolume: "0",
        cumulativeQuoteVolume: "0",
        tradeCount: "0",
        lastTradeAt: null,
        baseDecimals: 6,
      }),
      getPortfolio: async () => ({
        account: "0xowner",
        positions: [], // no positions
        openOrders: [],
        trades: [],
      }),
    };

    const result = await flattenBeforeExpiry(
      fakeTrader as any,
      fakeClient as any,
      "0xowner",
      "0xno_pos",
      300,
    );

    assert.equal(result, null);
  });

  it("returns null when market has already expired", async () => {
    const nowSec = Math.floor(Date.now() / 1000);

    const fakeTrader = {
      placeOrder: async () => { throw new Error("should not be called"); },
      cancelOrder: async () => ({ hash: "0x" }),
    };

    const fakeClient = {
      getBinaryMarket: async () => ({
        id: "0xexpired",
        marketType: "BINARY",
        marketId: "0xexpired",
        poolAddress: "0xpool_exp",
        marketAddress: "0xmarket_exp",
        asset: "BTC",
        question: "Already expired",
        status: "Settling",
        lastPrice: "600000",
        strike: "50000",
        expiry: String(nowSec - 100), // already expired
        winningOutcome: null,
        voided: false,
        backing: "0",
        quoteDecimals: 6,
        createdAtTimestamp: "1000000",
        collateral: "0xusdc",
        yesTokenId: "1",
        noTokenId: "2",
        resolvedAtBlock: null,
        resolvedAtTimestamp: null,
        createdByTx: null,
        cumulativeBaseVolume: "0",
        cumulativeQuoteVolume: "0",
        tradeCount: "0",
        lastTradeAt: null,
        baseDecimals: 6,
      }),
      getPortfolio: async () => ({
        account: "0xowner",
        positions: [makePosition("0xexpired", "5000000", 0, 6, "0xpool_exp")],
        openOrders: [],
        trades: [],
      }),
    };

    const result = await flattenBeforeExpiry(
      fakeTrader as any,
      fakeClient as any,
      "0xowner",
      "0xexpired",
      300,
    );

    assert.equal(result, null);
  });

  it("returns null when market is not found", async () => {
    const fakeTrader = {
      placeOrder: async () => { throw new Error("should not be called"); },
      cancelOrder: async () => ({ hash: "0x" }),
    };

    const fakeClient = {
      getBinaryMarket: async () => null,
    };

    const result = await flattenBeforeExpiry(
      fakeTrader as any,
      fakeClient as any,
      "0xowner",
      "0xnotfound",
      300,
    );

    assert.equal(result, null);
  });
});
