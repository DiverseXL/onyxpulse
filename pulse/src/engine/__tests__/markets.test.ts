import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  isBinaryMarket,
  getLiveBinaryMarkets,
  getUpcomingBinaryMarkets,
  getFinalizedBinaryMarkets,
  getMarketById,
} from "../markets.ts";

import type { BinaryMarket, BinaryMarketStatus, Market } from "../markets.ts";

describe("markets module exports", () => {
  it("isBinaryMarket is a function", () => {
    assert.equal(typeof isBinaryMarket, "function");
  });

  it("getLiveBinaryMarkets is a function", () => {
    assert.equal(typeof getLiveBinaryMarkets, "function");
  });

  it("getUpcomingBinaryMarkets is a function", () => {
    assert.equal(typeof getUpcomingBinaryMarkets, "function");
  });

  it("getFinalizedBinaryMarkets is a function", () => {
    assert.equal(typeof getFinalizedBinaryMarkets, "function");
  });

  it("getMarketById is a function", () => {
    assert.equal(typeof getMarketById, "function");
  });
});

describe("isBinaryMarket type guard", () => {
  it("returns true for a binary market shape", () => {
    const fakeBinary = {
      marketType: "BINARY",
      id: "0x0000000000000000000000000000000000000000000000000000000000000001",
    } as unknown as Market;
    assert.equal(isBinaryMarket(fakeBinary), true);
  });

  it("returns false for a spot market shape", () => {
    const fakeSpot = {
      marketType: "SPOT",
    } as unknown as Market;
    assert.equal(isBinaryMarket(fakeSpot), false);
  });

  it("returns false for a perp market shape", () => {
    const fakePerp = {
      marketType: "PERP",
    } as unknown as Market;
    assert.equal(isBinaryMarket(fakePerp), false);
  });
});
