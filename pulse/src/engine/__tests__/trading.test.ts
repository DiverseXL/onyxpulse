import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  placeMarketOrder,
  placeLimitOrder,
  cancelOrder,
  getOpenOrdersForTrader,
} from "../trading.ts";

// ─── Export shape tests ──────────────────────────────────────────────────────

describe("trading module exports", () => {
  it("placeMarketOrder is a function", () => {
    assert.equal(typeof placeMarketOrder, "function");
  });

  it("placeLimitOrder is a function", () => {
    assert.equal(typeof placeLimitOrder, "function");
  });

  it("cancelOrder is a function", () => {
    assert.equal(typeof cancelOrder, "function");
  });

  it("getOpenOrdersForTrader is a function", () => {
    assert.equal(typeof getOpenOrdersForTrader, "function");
  });
});

// ─── placeMarketOrder tests ──────────────────────────────────────────────────

describe("placeMarketOrder conversion pipeline", () => {
  it("passes correct bigint price/quantity to trader", async () => {
    let capturedParams: Record<string, unknown> = {};

    const fakeTrader = {
      placeOrder: async (params: Record<string, unknown>) => {
        capturedParams = params;
        return { hash: "0xtx", receipt: {}, orderId: 1n, fills: [] };
      },
      cancelOrder: async () => ({ hash: "0x", receipt: {} }),
    };

    // Mock client: getMarketByPool returns a binary market, getMarketOnchain returns Trading
    const fakeClient = {
      getMarketByPool: async () => ({
        marketId: "0x0000000000000000000000000000000000000000000000000000000000000001",
        marketType: "BINARY",
      }),
      getMarketOnchain: async () => ({ status: 1 }), // Trading
    };

    const result = await placeMarketOrder(fakeClient as any, fakeTrader as any, {
      pool: "0x0000000000000000000000000000000000000001" as any,
      side: "BUY_YES",
      humanPrice: "0.62",
      humanQuantity: "10",
      decimals: 6,
    });

    // price: 0.62 × 10^6 = 620_000
    assert.equal(capturedParams.price, 620_000n);
    // quantity: 10 × 10^6 = 10_000_000
    assert.equal(capturedParams.quantity, 10_000_000n);
    assert.equal(capturedParams.orderType, 2); // ORDER_TYPE.MARKET = 2
    assert.equal(capturedParams.side, "BUY_YES");
    assert.equal(result.orderId, 1n);
  });

  it("rejects when market is not Trading (on-chain)", async () => {
    const fakeTrader = {
      placeOrder: async () => ({ hash: "0x", receipt: {}, orderId: 1n, fills: [] }),
      cancelOrder: async () => ({ hash: "0x", receipt: {} }),
    };
    const fakeClient = {
      getMarketByPool: async () => ({
        marketId: "0x0000000000000000000000000000000000000000000000000000000000000001",
        marketType: "BINARY",
      }),
      getMarketOnchain: async () => ({ status: 2 }), // Locked
    };

    await assert.rejects(
      () =>
        placeMarketOrder(fakeClient as any, fakeTrader as any, {
          pool: "0x0000000000000000000000000000000000000001" as any,
          side: "BUY_YES",
          humanPrice: "0.62",
          humanQuantity: "10",
          decimals: 6,
        }),
      (err: Error) => {
        assert.ok(err.message.includes("not writable"));
        assert.ok(err.message.includes("Locked"));
        return true;
      },
    );
  });

  it("wraps errors with pool and side context", async () => {
    const failingTrader = {
      placeOrder: async () => {
        throw new Error("InsufficientBalance");
      },
      cancelOrder: async () => ({ hash: "0x", receipt: {} }),
    };
    const fakeClient = {
      getMarketByPool: async () => ({
        marketId: "0x0000000000000000000000000000000000000000000000000000000000000001",
        marketType: "BINARY",
      }),
      getMarketOnchain: async () => ({ status: 1 }), // Trading
    };

    await assert.rejects(
      () =>
        placeMarketOrder(fakeClient as any, failingTrader as any, {
          pool: "0x0000000000000000000000000000000000000099" as any,
          side: "SELL_NO",
          humanPrice: "0.40",
          humanQuantity: "5",
          decimals: 6,
        }),
      (err: Error) => {
        assert.ok(err.message.includes("placeMarketOrder"));
        assert.ok(err.message.includes("0x0000000000000000000000000000000000000099"));
        assert.ok(err.message.includes("SELL_NO"));
        assert.ok(err.message.includes("InsufficientBalance"));
        return true;
      },
    );
  });
});

// ─── placeLimitOrder tests ───────────────────────────────────────────────────

describe("placeLimitOrder conversion pipeline", () => {
  it("passes ORDER_TYPE.LIMIT and correct bigints", async () => {
    let capturedParams: Record<string, unknown> = {};

    const fakeTrader = {
      placeOrder: async (params: Record<string, unknown>) => {
        capturedParams = params;
        return { hash: "0xtx", receipt: {}, orderId: 42n, fills: [] };
      },
      cancelOrder: async () => ({ hash: "0x", receipt: {} }),
    };
    const fakeClient = {
      getMarketByPool: async () => ({
        marketId: "0x0000000000000000000000000000000000000000000000000000000000000001",
        marketType: "BINARY",
      }),
      getMarketOnchain: async () => ({ status: 1 }), // Trading
    };

    await placeLimitOrder(fakeClient as any, fakeTrader as any, {
      pool: "0x0000000000000000000000000000000000000002" as any,
      side: "BUY_NO",
      humanPrice: "0.38",
      humanQuantity: "25",
      decimals: 6,
    });

    assert.equal(capturedParams.price, 380_000n);
    assert.equal(capturedParams.quantity, 25_000_000n);
    assert.equal(capturedParams.orderType, 0); // ORDER_TYPE.LIMIT = 0
    assert.equal(capturedParams.side, "BUY_NO");
  });

  it("wraps errors with price context", async () => {
    const failingTrader = {
      placeOrder: async () => {
        throw new Error("OrderExpiryBeyondMarket");
      },
      cancelOrder: async () => ({ hash: "0x", receipt: {} }),
    };
    const fakeClient = {
      getMarketByPool: async () => ({
        marketId: "0x0000000000000000000000000000000000000000000000000000000000000001",
        marketType: "BINARY",
      }),
      getMarketOnchain: async () => ({ status: 1 }), // Trading
    };

    await assert.rejects(
      () =>
        placeLimitOrder(fakeClient as any, failingTrader as any, {
          pool: "0x0000000000000000000000000000000000000055" as any,
          side: "BUY_YES",
          humanPrice: "0.99",
          humanQuantity: "1",
          decimals: 6,
        }),
      (err: Error) => {
        assert.ok(err.message.includes("placeLimitOrder"));
        assert.ok(err.message.includes("price=0.99"));
        assert.ok(err.message.includes("OrderExpiryBeyondMarket"));
        return true;
      },
    );
  });
});

// ─── cancelOrder tests ───────────────────────────────────────────────────────

describe("cancelOrder error wrapping", () => {
  it("wraps errors with pool and orderId context", async () => {
    const failingTrader = {
      placeOrder: async () => ({ hash: "0x", receipt: {}, orderId: 1n, fills: [] }),
      cancelOrder: async () => {
        throw new Error("IncorrectSender");
      },
    };

    await assert.rejects(
      () =>
        cancelOrder(
          failingTrader as any,
          "0x0000000000000000000000000000000000000077" as any,
          "12345",
        ),
      (err: Error) => {
        assert.ok(err.message.includes("cancelOrder"));
        assert.ok(err.message.includes("0x0000000000000000000000000000000000000077"));
        assert.ok(err.message.includes("12345"));
        assert.ok(err.message.includes("IncorrectSender"));
        return true;
      },
    );
  });
});

// ─── getOpenOrdersForTrader tests ────────────────────────────────────────────

describe("getOpenOrdersForTrader error wrapping", () => {
  it("wraps errors with address context", async () => {
    const failingClient = {
      getOpenOrders: async () => {
        throw new Error("Indexer unreachable");
      },
    };

    await assert.rejects(
      () =>
        getOpenOrdersForTrader(
          failingClient as any,
          "0x000000000000000000000000000000000000abcd" as any,
        ),
      (err: Error) => {
        assert.ok(err.message.includes("getOpenOrdersForTrader"));
        assert.ok(err.message.includes("0x000000000000000000000000000000000000abcd"));
        assert.ok(err.message.includes("Indexer unreachable"));
        return true;
      },
    );
  });
});
