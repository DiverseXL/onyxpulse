import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  mintCompleteSet,
  burnCompleteSet,
  mintCompleteSetNative,
} from "../sets.ts";

// ─── Export shape tests ──────────────────────────────────────────────────────

describe("sets module exports", () => {
  it("mintCompleteSet is a function", () => {
    assert.equal(typeof mintCompleteSet, "function");
  });

  it("burnCompleteSet is a function", () => {
    assert.equal(typeof burnCompleteSet, "function");
  });

  it("mintCompleteSetNative is a function", () => {
    assert.equal(typeof mintCompleteSetNative, "function");
  });
});

// ─── mintCompleteSet tests ───────────────────────────────────────────────────

describe("mintCompleteSet", () => {
  it("passes correct bigint amount to trader.mintSet", async () => {
    let capturedParams: Record<string, unknown> = {};
    const fakeTrader = {
      mintSet: async (params: Record<string, unknown>) => {
        capturedParams = params;
        return { hash: "0xmint", receipt: {} };
      },
      burnSet: async () => ({ hash: "0x", receipt: {} }),
      mintSetNative: async () => ({ hash: "0x", receipt: {} }),
    };
    const fakeClient = {
      getMarketByPool: async () => ({
        marketId: "0x0000000000000000000000000000000000000000000000000000000000000001",
        marketType: "BINARY",
      }),
      getMarketOnchain: async () => ({ status: 1 }), // Trading
    };

    const result = await mintCompleteSet(
      fakeTrader as any,
      fakeClient as any,
      "0x0000000000000000000000000000000000000001" as any,
      "100",
      6,
    );

    assert.equal(result.hash, "0xmint");
    assert.equal(capturedParams.pool, "0x0000000000000000000000000000000000000001");
    assert.equal(capturedParams.amount, 100_000_000n); // 100 × 10^6
  });

  it("rejects when market is not Trading (on-chain)", async () => {
    const fakeTrader = {
      mintSet: async () => ({ hash: "0x", receipt: {} }),
      burnSet: async () => ({ hash: "0x", receipt: {} }),
      mintSetNative: async () => ({ hash: "0x", receipt: {} }),
    };
    const fakeClient = {
      getMarketByPool: async () => ({
        marketId: "0x0000000000000000000000000000000000000000000000000000000000000001",
        marketType: "BINARY",
      }),
      getMarketOnchain: async () => ({ status: 4 }), // Resolved
    };

    await assert.rejects(
      () =>
        mintCompleteSet(
          fakeTrader as any,
          fakeClient as any,
          "0x0000000000000000000000000000000000000001" as any,
          "100",
          6,
        ),
      (err: Error) => {
        assert.ok(err.message.includes("not writable"));
        assert.ok(err.message.includes("Resolved"));
        return true;
      },
    );
  });

  it("wraps errors with pool context", async () => {
    const fakeTrader = {
      mintSet: async () => {
        throw new Error("InsufficientBalance");
      },
      burnSet: async () => ({ hash: "0x", receipt: {} }),
      mintSetNative: async () => ({ hash: "0x", receipt: {} }),
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
        mintCompleteSet(
          fakeTrader as any,
          fakeClient as any,
          "0x0000000000000000000000000000000000000099" as any,
          "50",
          6,
        ),
      (err: Error) => {
        assert.ok(err.message.includes("mintCompleteSet"));
        assert.ok(err.message.includes("0x0000000000000000000000000000000000000099"));
        assert.ok(err.message.includes("InsufficientBalance"));
        return true;
      },
    );
  });
});

// ─── burnCompleteSet tests ───────────────────────────────────────────────────

describe("burnCompleteSet", () => {
  it("passes correct bigint amount to trader.burnSet", async () => {
    let capturedParams: Record<string, unknown> = {};
    const fakeTrader = {
      mintSet: async () => ({ hash: "0x", receipt: {} }),
      burnSet: async (params: Record<string, unknown>) => {
        capturedParams = params;
        return { hash: "0xburn", receipt: {} };
      },
      mintSetNative: async () => ({ hash: "0x", receipt: {} }),
    };
    const fakeClient = {
      getMarketByPool: async () => ({
        marketId: "0x0000000000000000000000000000000000000000000000000000000000000001",
        marketType: "BINARY",
      }),
      getMarketOnchain: async () => ({ status: 1 }), // Trading
    };

    const result = await burnCompleteSet(
      fakeTrader as any,
      fakeClient as any,
      "0x0000000000000000000000000000000000000002" as any,
      "50",
      6,
    );

    assert.equal(result.hash, "0xburn");
    assert.equal(capturedParams.pool, "0x0000000000000000000000000000000000000002");
    assert.equal(capturedParams.amount, 50_000_000n); // 50 × 10^6
  });

  it("rejects when market is Locked (on-chain)", async () => {
    const fakeTrader = {
      mintSet: async () => ({ hash: "0x", receipt: {} }),
      burnSet: async () => ({ hash: "0x", receipt: {} }),
      mintSetNative: async () => ({ hash: "0x", receipt: {} }),
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
        burnCompleteSet(
          fakeTrader as any,
          fakeClient as any,
          "0x0000000000000000000000000000000000000001" as any,
          "10",
          6,
        ),
      (err: Error) => {
        assert.ok(err.message.includes("not writable"));
        assert.ok(err.message.includes("Locked"));
        return true;
      },
    );
  });
});

// ─── mintCompleteSetNative tests ─────────────────────────────────────────────

describe("mintCompleteSetNative", () => {
  it("passes marketId and native amount to trader.mintSetNative", async () => {
    let capturedParams: Record<string, unknown> = {};
    const fakeTrader = {
      mintSet: async () => ({ hash: "0x", receipt: {} }),
      burnSet: async () => ({ hash: "0x", receipt: {} }),
      mintSetNative: async (params: Record<string, unknown>) => {
        capturedParams = params;
        return { hash: "0xnative", receipt: {} };
      },
    };
    const fakeClient = {
      getMarketByPool: async () => ({
        marketId: "0x0000000000000000000000000000000000000000000000000000000000000001",
        marketType: "BINARY",
      }),
      getMarketOnchain: async () => ({ status: 1 }), // Trading
    };

    const result = await mintCompleteSetNative(
      fakeTrader as any,
      fakeClient as any,
      "0x0000000000000000000000000000000000000003" as any,
      "10",
    );

    assert.equal(result.hash, "0xnative");
    assert.equal(capturedParams.marketId, "0x0000000000000000000000000000000000000000000000000000000000000001");
    assert.equal(capturedParams.amount, 10_000_000_000_000_000_000n); // 10 × 10^18
  });

  it("rejects when market is not Trading (on-chain)", async () => {
    const fakeTrader = {
      mintSet: async () => ({ hash: "0x", receipt: {} }),
      burnSet: async () => ({ hash: "0x", receipt: {} }),
      mintSetNative: async () => ({ hash: "0x", receipt: {} }),
    };
    const fakeClient = {
      getMarketByPool: async () => ({
        marketId: "0x0000000000000000000000000000000000000000000000000000000000000001",
        marketType: "BINARY",
      }),
      getMarketOnchain: async () => ({ status: 5 }), // Voided
    };

    await assert.rejects(
      () =>
        mintCompleteSetNative(
          fakeTrader as any,
          fakeClient as any,
          "0x0000000000000000000000000000000000000001" as any,
          "5",
        ),
      (err: Error) => {
        assert.ok(err.message.includes("not writable"));
        assert.ok(err.message.includes("Voided"));
        return true;
      },
    );
  });
});
