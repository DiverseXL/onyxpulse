import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getMarketCandles,
  listBinaryMarketsByVolume,
  getMarketVolume,
} from "../candles.ts";

import type { BinaryMarket } from "@somnia-chain/markets-sdk";

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

// ─── getMarketCandles ────────────────────────────────────────────────────────

describe("getMarketCandles", () => {
  it("passes correct params to client.getCandles", async () => {
    const captured: any[] = [];
    const fakeClient = {
      getCandles: (...args: any[]) => {
        captured.push(args);
        return Promise.resolve([]);
      },
    } as any;

    await getMarketCandles(
      fakeClient,
      "0x0000000000000000000000000000000000000001",
      3600,
    );

    assert.equal(captured.length, 1);
    assert.equal(captured[0][0], "0x0000000000000000000000000000000000000001");
    assert.equal(captured[0][1], 3600);
    assert.deepEqual(captured[0][2], undefined);
  });

  it("passes limit option when provided", async () => {
    const captured: any[] = [];
    const fakeClient = {
      getCandles: (...args: any[]) => {
        captured.push(args);
        return Promise.resolve([]);
      },
    } as any;

    await getMarketCandles(
      fakeClient,
      "0x0000000000000000000000000000000000000001",
      3600,
      100,
    );

    assert.deepEqual(captured[0][2], { limit: 100 });
  });

  it("returns the SDK candle array directly", async () => {
    const fakeCandles = [
      {
        bucketStart: "1700000000",
        openPrice: "50000",
        high: "51000",
        low: "49000",
        closePrice: "50500",
        baseVolume: "1000",
        quoteVolume: "50500000",
        tradeCount: 42,
      },
    ];
    const fakeClient = {
      getCandles: () => Promise.resolve(fakeCandles),
    } as any;

    const result = await getMarketCandles(
      fakeClient,
      "0x0000000000000000000000000000000000000001",
      3600,
    );

    assert.deepEqual(result, fakeCandles);
  });
});

// ─── listBinaryMarketsByVolume ───────────────────────────────────────────────

describe("listBinaryMarketsByVolume", () => {
  it("calls client.listBinaryMarkets with orderBy: volume", async () => {
    const captured: any[] = [];
    const fakeClient = {
      listBinaryMarkets: (...args: any[]) => {
        captured.push(args);
        return Promise.resolve([]);
      },
    } as any;

    await listBinaryMarketsByVolume(fakeClient);

    assert.equal(captured.length, 1);
    assert.deepEqual(captured[0][0], { orderBy: "volume" });
  });

  it("passes limit option when provided", async () => {
    const captured: any[] = [];
    const fakeClient = {
      listBinaryMarkets: (...args: any[]) => {
        captured.push(args);
        return Promise.resolve([]);
      },
    } as any;

    await listBinaryMarketsByVolume(fakeClient, { limit: 10 });

    assert.deepEqual(captured[0][0], { orderBy: "volume", limit: 10 });
  });

  it("returns the SDK market array directly", async () => {
    const fakeMarkets = [makeMarket()];
    const fakeClient = {
      listBinaryMarkets: () => Promise.resolve(fakeMarkets),
    } as any;

    const result = await listBinaryMarketsByVolume(fakeClient);

    assert.deepEqual(result, fakeMarkets);
  });
});

// ─── getMarketVolume ─────────────────────────────────────────────────────────

describe("getMarketVolume", () => {
  it("normalises 6dp cumulativeQuoteVolume to human units", () => {
    const market = makeMarket({
      cumulativeQuoteVolume: "12345678900", // 12345.6789 in 6dp
      quoteDecimals: 6,
    });

    const result = getMarketVolume(market);

    // 12345678900 / 10^6 = 12345.6789
    assert.equal(result, "12345.6789");
  });

  it("normalises 18dp cumulativeQuoteVolume to human units", () => {
    const market = makeMarket({
      cumulativeQuoteVolume: "12345678900000000000000", // 12345.6789 in 18dp
      quoteDecimals: 18,
    });

    const result = getMarketVolume(market);

    // 12345678900000000000000 / 10^18 = 12345.6789
    assert.equal(result, "12345.6789");
  });

  it("returns '0' for zero volume", () => {
    const market = makeMarket({
      cumulativeQuoteVolume: "0",
      quoteDecimals: 6,
    });

    assert.equal(getMarketVolume(market), "0");
  });

  it("returns '0' for empty string volume", () => {
    const market = makeMarket({
      cumulativeQuoteVolume: "0",
      quoteDecimals: 6,
    });

    assert.equal(getMarketVolume(market), "0");
  });

  it("handles large values without precision loss (6dp)", () => {
    // 1,000,000,000.00 in 6dp
    const market = makeMarket({
      cumulativeQuoteVolume: "1000000000000000",
      quoteDecimals: 6,
    });

    const result = getMarketVolume(market);
    assert.equal(result, "1000000000");
  });

  it("handles large values without precision loss (18dp)", () => {
    // 1,000,000,000.00 in 18dp
    const market = makeMarket({
      cumulativeQuoteVolume: "1000000000000000000000000000",
      quoteDecimals: 18,
    });

    const result = getMarketVolume(market);
    assert.equal(result, "1000000000");
  });

  it("trailing zeros are stripped from result", () => {
    const market = makeMarket({
      cumulativeQuoteVolume: "10000000", // 10.000000 in 6dp
      quoteDecimals: 6,
    });

    assert.equal(getMarketVolume(market), "10");
  });
});
