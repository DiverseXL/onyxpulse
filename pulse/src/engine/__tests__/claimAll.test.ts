import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  claimAllRedeemable,
} from "../claimAll.ts";

import type { ClaimAllResult, ClaimAllProgressStatus } from "../claimAll.ts";
import { PulseEngineError } from "../errors.ts";

// ─── Mock helpers ────────────────────────────────────────────────────────────

/**
 * Create a comprehensive mock client that satisfies both `getMyRedeemablePositions`
 * (needs `getClaimable`) and `redeemMarket` (needs `getBinaryMarket`,
 * `getMarketOnchain`, `getOutcomeBalance`).
 */
function makeClient(
  claimables: Array<Record<string, unknown>>,
  opts: { binaryMarkets?: Record<string, Record<string, unknown>> } = {},
) {
  const defaultMarket: Record<string, unknown> = {
    id: "0xdefault",
    marketType: "BINARY",
    status: "Resolved",
    marketId: "0xdefault",
    marketAddress: "0xpool",
    winningOutcome: 0,
    backing: "1000000",
    netBacking: null,
    quoteDecimals: 6,
    collateral: "0xusdc",
  };

  const marketMap = opts.binaryMarkets ?? {};

  return {
    getClaimable: async () => claimables,
    getBinaryMarket: async (id: string) => marketMap[id] ?? defaultMarket,
    getMarketOnchain: async () => ({
      status: 4, // Resolved
      outcomeToken: "0xoutcome",
      yesId: 1n,
      noId: 2n,
    }),
    getOutcomeBalance: async (p: { id: bigint }) => {
      // Return a non-zero balance so redeemMarket doesn't throw
      return p.id === 1n ? 1000n : 0n;
    },
  };
}

/** Shorthand to build a ClaimablePositionInfo-like object. */
function pos(
  marketId: string,
  opts: Partial<{ outcomeIdx: 0 | 1; amount: bigint; status: string }> = {},
) {
  return {
    marketId,
    pool: "0xpool",
    outcomeIdx: (opts.outcomeIdx ?? 0) as 0 | 1,
    amount: opts.amount ?? 1000n,
    estPayout: 900n,
    status: opts.status ?? "Resolved",
  };
}

/** Build a mock Trader whose redeem returns the given hash. */
function makeTrader(
  redeemImpl?: (
    params: { marketId: string; amount: bigint; outcomeIdx?: 0 | 1 },
  ) => Promise<{ hash: string }>,
) {
  return {
    redeem: redeemImpl ?? (async () => ({ hash: "0xok" })),
    redeemMany: async () => ({ hash: "0x", receipt: {} }),
  };
}

// ─── Export shape tests ─────────────────────────────────────────────────────

describe("claimAll module exports", () => {
  it("claimAllRedeemable is a function", () => {
    assert.equal(typeof claimAllRedeemable, "function");
  });
});

// ─── All succeed ─────────────────────────────────────────────────────────────

describe("claimAllRedeemable — all succeed", () => {
  it("redeems every position and returns success entries", async () => {
    const markets = ["0xm1", "0xm2", "0xm3"];
    const hashes = ["0xh1", "0xh2", "0xh3"];

    let callIdx = 0;
    const trader = makeTrader(async () => ({
      hash: hashes[callIdx++],
    }));

    // Each market gets a Resolved status so redeemMarket picks up outcomeIdx=0
    const marketMap: Record<string, Record<string, unknown>> = {};
    for (const mid of markets) {
      marketMap[mid] = {
        id: mid,
        marketType: "BINARY",
        status: "Resolved",
        marketId: mid,
        marketAddress: "0xpool",
        winningOutcome: 0,
        backing: "1000000",
        netBacking: null,
        quoteDecimals: 6,
        collateral: "0xusdc",
      };
    }

    const client = makeClient(markets.map((id) => pos(id)), { binaryMarkets: marketMap });

    const result: ClaimAllResult = await claimAllRedeemable(
      trader as any,
      client as any,
      "0xowner",
    );

    assert.equal(result.succeeded.length, 3);
    assert.equal(result.failed.length, 0);
    assert.equal(result.totalClaimed, 3);

    for (let i = 0; i < 3; i++) {
      assert.equal(result.succeeded[i].marketId, markets[i]);
      assert.equal(result.succeeded[i].txHash, hashes[i]);
    }
  });
});

// ─── Mixed success / failure ─────────────────────────────────────────────────

describe("claimAllRedeemable — mixed success and failure", () => {
  it("continues past failures and reports both sides", async () => {
    const markets = ["0xm1", "0xm2", "0xm3"];
    const marketMap: Record<string, Record<string, unknown>> = {};
    for (const mid of markets) {
      marketMap[mid] = {
        id: mid,
        marketType: "BINARY",
        status: "Resolved",
        marketId: mid,
        marketAddress: "0xpool",
        winningOutcome: 0,
        backing: "1000000",
        netBacking: null,
        quoteDecimals: 6,
        collateral: "0xusdc",
      };
    }
    const client = makeClient(markets.map((id) => pos(id)), { binaryMarkets: marketMap });

    let callCount = 0;
    const trader = makeTrader(async (params) => {
      callCount++;
      if (params.marketId === "0xm2") {
        throw new Error("Simulated on-chain revert");
      }
      return { hash: `0xh${callCount}` };
    });

    const result = await claimAllRedeemable(
      trader as any,
      client as any,
      "0xowner",
    );

    assert.equal(result.succeeded.length, 2);
    assert.equal(result.failed.length, 1);
    assert.equal(result.totalClaimed, 2);

    assert.equal(result.succeeded[0].marketId, "0xm1");
    assert.equal(result.succeeded[1].marketId, "0xm3");
    assert.equal(result.failed[0].marketId, "0xm2");
    assert.ok(result.failed[0].error instanceof PulseEngineError);
  });
});

// ─── All fail ────────────────────────────────────────────────────────────────

describe("claimAllRedeemable — all fail", () => {
  it("reports every position as failed with zero claims", async () => {
    const client = makeClient([
      pos("0xa"),
      pos("0xb"),
    ]);

    const trader = makeTrader(async () => {
      throw new Error("RPC down");
    });

    const result = await claimAllRedeemable(
      trader as any,
      client as any,
      "0xowner",
    );

    assert.equal(result.succeeded.length, 0);
    assert.equal(result.failed.length, 2);
    assert.equal(result.totalClaimed, 0);
    assert.ok(result.failed[0].error instanceof PulseEngineError);
    assert.ok(result.failed[1].error instanceof PulseEngineError);
  });
});

// ─── Empty list (nothing to claim) ──────────────────────────────────────────

describe("claimAllRedeemable — empty redeemable list", () => {
  it("returns empty result when there are no positions", async () => {
    const client = makeClient([]);
    const trader = makeTrader();

    const result = await claimAllRedeemable(
      trader as any,
      client as any,
      "0xowner",
    );

    assert.equal(result.succeeded.length, 0);
    assert.equal(result.failed.length, 0);
    assert.equal(result.totalClaimed, 0);
  });
});

// ─── onProgress callback ─────────────────────────────────────────────────────

describe("claimAllRedeemable — onProgress callback", () => {
  it("emits claiming → success for each succeeded position", async () => {
    const progressLog: Array<{ marketId: string; status: ClaimAllProgressStatus }> = [];

    const markets = ["0xm1", "0xm2"];
    const marketMap: Record<string, Record<string, unknown>> = {};
    for (const mid of markets) {
      marketMap[mid] = {
        id: mid,
        marketType: "BINARY",
        status: "Resolved",
        marketId: mid,
        marketAddress: "0xpool",
        winningOutcome: 0,
        backing: "1000000",
        netBacking: null,
        quoteDecimals: 6,
        collateral: "0xusdc",
      };
    }

    const client = makeClient(markets.map((id) => pos(id)), { binaryMarkets: marketMap });
    const trader = makeTrader(async (p) => ({ hash: `0xh-${p.marketId}` }));

    await claimAllRedeemable(
      trader as any,
      client as any,
      "0xowner",
      (marketId, status) => progressLog.push({ marketId, status }),
    );

    assert.deepEqual(progressLog, [
      { marketId: "0xm1", status: "claiming" },
      { marketId: "0xm1", status: "success" },
      { marketId: "0xm2", status: "claiming" },
      { marketId: "0xm2", status: "success" },
    ]);
  });

  it("emits claiming → failed for positions that throw", async () => {
    const progressLog: Array<{ marketId: string; status: ClaimAllProgressStatus }> = [];

    const markets = ["0xok", "0xfail"];
    const marketMap: Record<string, Record<string, unknown>> = {};
    for (const mid of markets) {
      marketMap[mid] = {
        id: mid,
        marketType: "BINARY",
        status: "Resolved",
        marketId: mid,
        marketAddress: "0xpool",
        winningOutcome: 0,
        backing: "1000000",
        netBacking: null,
        quoteDecimals: 6,
        collateral: "0xusdc",
      };
    }

    const client = makeClient(markets.map((id) => pos(id)), { binaryMarkets: marketMap });
    const trader = makeTrader(async (p) => {
      if (p.marketId === "0xfail") throw new Error("boom");
      return { hash: "0xh" };
    });

    await claimAllRedeemable(
      trader as any,
      client as any,
      "0xowner",
      (marketId, status) => progressLog.push({ marketId, status }),
    );

    assert.deepEqual(progressLog, [
      { marketId: "0xok", status: "claiming" },
      { marketId: "0xok", status: "success" },
      { marketId: "0xfail", status: "claiming" },
      { marketId: "0xfail", status: "failed" },
    ]);
  });
});

// ─── Structural failure (fetching positions fails) ──────────────────────────

describe("claimAllRedeemable — structural failure", () => {
  it("throws when getMyRedeemablePositions itself fails", async () => {
    const client = {
      getClaimable: async () => {
        throw new Error("Indexer connection refused");
      },
    };
    const trader = makeTrader();

    await assert.rejects(
      () => claimAllRedeemable(trader as any, client as any, "0xowner"),
      (err: Error) => {
        assert.ok(err.message.includes("getMyRedeemablePositions"));
        assert.ok(err.message.includes("Indexer connection refused"));
        return true;
      },
    );
  });
});

// ─── ClaimAllResult type shape ──────────────────────────────────────────────

describe("ClaimAllResult type shape", () => {
  it("has the expected fields", async () => {
    const client = makeClient([]);
    const trader = makeTrader();
    const result = await claimAllRedeemable(
      trader as any,
      client as any,
      "0xowner",
    );

    assert.ok(Array.isArray(result.succeeded));
    assert.ok(Array.isArray(result.failed));
    assert.equal(typeof result.totalClaimed, "number");
  });
});
