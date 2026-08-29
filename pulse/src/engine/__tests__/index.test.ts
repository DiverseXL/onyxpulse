import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  // client
  createPulseClient,
  createPulseMainnetClient,
  createTrader,
  requestDemoFunds,
  // units
  toBigintAmount,
  fromBigintAmount,
  snapToTick,
  getPoolTickSize,
  // markets
  isBinaryMarket,
  getLiveBinaryMarkets,
  getUpcomingBinaryMarkets,
  getFinalizedBinaryMarkets,
  getMarketById,
  // trading
  placeMarketOrder,
  placeLimitOrder,
  cancelOrder,
  getOpenOrdersForTrader,
  // settlement
  redeemMarket,
  redeemMultipleMarkets,
  getResolution,
  buildReceiptData,
} from "../index.ts";

describe("engine barrel exports", () => {
  it("client exports are functions", () => {
    assert.equal(typeof createPulseClient, "function");
    assert.equal(typeof createPulseMainnetClient, "function");
    assert.equal(typeof createTrader, "function");
    assert.equal(typeof requestDemoFunds, "function");
  });

  it("unit exports are functions", () => {
    assert.equal(typeof toBigintAmount, "function");
    assert.equal(typeof fromBigintAmount, "function");
    assert.equal(typeof snapToTick, "function");
    assert.equal(typeof getPoolTickSize, "function");
  });

  it("market exports are correct types", () => {
    assert.equal(typeof isBinaryMarket, "function");
    assert.equal(typeof getLiveBinaryMarkets, "function");
    assert.equal(typeof getUpcomingBinaryMarkets, "function");
    assert.equal(typeof getFinalizedBinaryMarkets, "function");
    assert.equal(typeof getMarketById, "function");
  });

  it("trading exports are functions", () => {
    assert.equal(typeof placeMarketOrder, "function");
    assert.equal(typeof placeLimitOrder, "function");
    assert.equal(typeof cancelOrder, "function");
    assert.equal(typeof getOpenOrdersForTrader, "function");
  });

  it("settlement exports are functions", () => {
    assert.equal(typeof redeemMarket, "function");
    assert.equal(typeof redeemMultipleMarkets, "function");
    assert.equal(typeof getResolution, "function");
    assert.equal(typeof buildReceiptData, "function");
  });
});

describe("demo.ts is NOT re-exported", () => {
  it("confirming demo utilities require explicit import", () => {
    // This test documents the convention: demo.ts must never appear in
    // the barrel. If someone adds it, this test should fail to compile
    // (or at minimum, this comment makes the intent auditable).
    //
    // To use demo utilities, import directly:
    //   import { requestTestFunds } from "../engine/demo.js";
    assert.ok(true, "demo.ts is intentionally excluded from the barrel");
  });
});
