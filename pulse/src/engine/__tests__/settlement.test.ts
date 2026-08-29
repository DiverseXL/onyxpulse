import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  redeemMarket,
  redeemMultipleMarkets,
  getResolution,
  buildReceiptData,
} from "../settlement.ts";

import type { ResolutionData, ReceiptData } from "../settlement.ts";

// ─── Helper: create a mock client with getOutcomeBalance ────────────────────
// redeemMarket reads on-chain balance via getOutcomeBalanceOnchain (portfolio.ts),
// which delegates to client.getOutcomeBalance(p). We mock that on the client.

function makeMockClient(
  binaryMarket: Record<string, unknown> | null,
  onchainStatus: number,
  balanceMap: Record<string, bigint> = {},
) {
  return {
    getBinaryMarket: async () => binaryMarket,
    getMarketOnchain: async () => ({
      status: onchainStatus,
      outcomeToken: "0xoutcome",
      yesId: 1n,
      noId: 2n,
    }),
    getOutcomeBalance: async (p: { id: bigint }) => {
      return balanceMap[String(p.id)] ?? 0n;
    },
  };
}

// ─── Export shape tests ─────────────────────────────────────────────────────

describe("settlement module exports", () => {
  it("redeemMarket is a function", () => {
    assert.equal(typeof redeemMarket, "function");
  });

  it("redeemMultipleMarkets is a function", () => {
    assert.equal(typeof redeemMultipleMarkets, "function");
  });

  it("getResolution is a function", () => {
    assert.equal(typeof getResolution, "function");
  });

  it("buildReceiptData is a function", () => {
    assert.equal(typeof buildReceiptData, "function");
  });
});

// ─── redeemMarket status guard tests ─────────────────────────────────────────

describe("redeemMarket status checks", () => {
  function makeFakeTrader() {
    return {
      redeem: async () => ({ hash: "0xredeem", receipt: {} }),
      redeemMany: async () => ({ hash: "0xbatch", receipt: {} }),
    };
  }

  it("rejects when market not found", async () => {
    const client = { getBinaryMarket: async () => null };
    await assert.rejects(
      () => redeemMarket(makeFakeTrader() as any, client as any, "0xnotfound"),
      (err: Error) => {
        assert.ok(err.message.includes("not found in indexer"));
        return true;
      },
    );
  });

  it("rejects when market is Trading", async () => {
    const client = makeMockClient(
      {
        id: "0xabc",
        marketType: "BINARY",
        status: "Trading",
        winningOutcome: null,
        backing: "1000000",
        netBacking: null,
      },
      1, // on-chain: Trading
    );
    await assert.rejects(
      () => redeemMarket(makeFakeTrader() as any, client as any, "0xabc"),
      (err: Error) => {
        assert.ok(err.message.includes("not yet redeemable"));
        assert.ok(err.message.includes("Trading"));
        return true;
      },
    );
  });

  it("proceeds when market is Resolved — uses on-chain balance, not backing", async () => {
    let capturedParams: Record<string, unknown> = {};
    const trader = {
      redeem: async (params: Record<string, unknown>) => {
        capturedParams = params;
        return { hash: "0xok", receipt: {} };
      },
      redeemMany: async () => ({ hash: "0x", receipt: {} }),
    };

    // yesId = 1n, user holds 300000 YES tokens (not the full 500000 backing)
    const client = makeMockClient(
      {
        id: "0xres",
        marketType: "BINARY",
        status: "Resolved",
        marketId: "0xres",
        marketAddress: "0xpool",
        winningOutcome: 0,
        backing: "0",
        netBacking: "500000",
      },
      4, // on-chain: Resolved
      { "1": 300000n }, // yesId → 300000
    );

    const result = await redeemMarket(trader as any, client as any, "0xres", "0xowner123");
    assert.equal(result.hash, "0xok");
    assert.equal(capturedParams.marketId, "0xres");
    assert.equal(capturedParams.outcomeIdx, 0);
    // Must use the actual on-chain balance, NOT the netBacking
    assert.equal(capturedParams.amount, 300000n);
  });

  it("proceeds when market is Finalized", async () => {
    let capturedParams: Record<string, unknown> = {};
    const trader = {
      redeem: async (params: Record<string, unknown>) => {
        capturedParams = params;
        return { hash: "0xfinal", receipt: {} };
      },
      redeemMany: async () => ({ hash: "0x", receipt: {} }),
    };

    // noId = 2n, user holds 800000 NO tokens
    const client = makeMockClient(
      {
        id: "0xfinal",
        marketType: "BINARY",
        status: "Finalized",
        marketId: "0xfinal",
        marketAddress: "0xpool",
        winningOutcome: 1,
        backing: "0",
        netBacking: "800000",
      },
      4, // on-chain: Resolved (Finalized is indexer-only)
      { "2": 800000n }, // noId → 800000
    );

    const result = await redeemMarket(trader as any, client as any, "0xfinal", "0xowner123");
    assert.equal(result.hash, "0xfinal");
    assert.equal(capturedParams.outcomeIdx, 1);
    assert.equal(capturedParams.amount, 800000n);
  });

  it("rejects when indexer says Resolved but on-chain is still Settling", async () => {
    const trader = {
      redeem: async () => ({ hash: "0x", receipt: {} }),
      redeemMany: async () => ({ hash: "0x", receipt: {} }),
    };
    const client = makeMockClient(
      {
        id: "0xlag",
        marketType: "BINARY",
        status: "Resolved",
        winningOutcome: 0,
        backing: "100000",
        netBacking: null,
      },
      3, // Still Settling on-chain
    );

    await assert.rejects(
      () => redeemMarket(trader as any, client as any, "0xlag"),
      (err: Error) => {
        assert.ok(err.message.includes("not writable") || err.message.includes("Settling") || err.message.includes("Trading"));
        return true;
      },
    );
  });

  it("rejects when market is Settling (pre-resolution)", async () => {
    const trader = {
      redeem: async () => ({ hash: "0x", receipt: {} }),
      redeemMany: async () => ({ hash: "0x", receipt: {} }),
    };
    const client = makeMockClient(
      {
        id: "0xsettling",
        marketType: "BINARY",
        status: "Settling",
        winningOutcome: null,
        backing: "100000",
        netBacking: null,
      },
      3,
    );

    await assert.rejects(
      () => redeemMarket(trader as any, client as any, "0xsettling"),
      (err: Error) => {
        assert.ok(err.message.includes("not yet redeemable"));
        return true;
      },
    );
  });

  it("throws when on-chain balance is zero", async () => {
    let redeemCalled = false;
    const trader = {
      redeem: async (params: Record<string, unknown>) => {
        redeemCalled = true;
        return { hash: "0xok", receipt: {} };
      },
      redeemMany: async () => ({ hash: "0x", receipt: {} }),
    };

    // yesId = 1n, balance is 0
    const client = makeMockClient(
      {
        id: "0xnobal",
        marketType: "BINARY",
        status: "Resolved",
        marketId: "0xnobal",
        marketAddress: "0xpool",
        winningOutcome: 0,
        backing: "1000000",
        netBacking: null,
      },
      4,
      {}, // no balance for any outcome
    );

    await assert.rejects(
      () => redeemMarket(trader as any, client as any, "0xnobal", "0xowner123"),
      (err: Error) => {
        assert.ok(err.message.includes("No outcome tokens to redeem") || err.message.includes("zero"));
        return true;
      },
    );
    // trader.redeem should NOT have been called
    assert.equal(redeemCalled, false);
  });
});

// ─── redeemMarket — voided markets ──────────────────────────────────────────

describe("redeemMarket — voided markets", () => {
  const OWNER = "0xowner123";

  function makeVoidedMarket(overrides: Record<string, unknown> = {}) {
    return {
      id: "0xvoid",
      marketType: "BINARY",
      status: "Voided",
      marketId: "0xvoid",
      marketAddress: "0xpool",
      winningOutcome: null,
      backing: "1000000",
      netBacking: null,
      voided: true,
      ...overrides,
    };
  }

  it("redeems YES-only balance", async () => {
    const redeemed: { outcomeIdx: number; amount: bigint }[] = [];
    const trader = {
      redeem: async (params: { outcomeIdx: number; amount: bigint }) => {
        redeemed.push({ outcomeIdx: params.outcomeIdx, amount: params.amount });
        return { hash: "0xvoid-yes", receipt: {} };
      },
    };
    // yesId = 1n → 500000, noId = 2n → 0
    const client = makeMockClient(makeVoidedMarket(), 5, {
      "1": 500000n,
      "2": 0n,
    });

    const result = await redeemMarket(trader as any, client as any, "0xvoid", OWNER);
    assert.equal(result.hash, "0xvoid-yes");
    assert.equal(redeemed.length, 1);
    assert.equal(redeemed[0].outcomeIdx, 0);
    assert.equal(redeemed[0].amount, 500000n);
  });

  it("redeems NO-only balance", async () => {
    const redeemed: { outcomeIdx: number; amount: bigint }[] = [];
    const trader = {
      redeem: async (params: { outcomeIdx: number; amount: bigint }) => {
        redeemed.push({ outcomeIdx: params.outcomeIdx, amount: params.amount });
        return { hash: "0xvoid-no", receipt: {} };
      },
    };
    const client = makeMockClient(makeVoidedMarket(), 5, {
      "1": 0n,
      "2": 300000n,
    });

    const result = await redeemMarket(trader as any, client as any, "0xvoid", OWNER);
    assert.equal(result.hash, "0xvoid-no");
    assert.equal(redeemed.length, 1);
    assert.equal(redeemed[0].outcomeIdx, 1);
    assert.equal(redeemed[0].amount, 300000n);
  });

  it("redeems BOTH sides (mintCompleteSet scenario)", async () => {
    const redeemed: { outcomeIdx: number; amount: bigint }[] = [];
    const trader = {
      redeem: async (params: { outcomeIdx: number; amount: bigint }) => {
        redeemed.push({ outcomeIdx: params.outcomeIdx, amount: params.amount });
        return { hash: "0xvoid-both", receipt: {} };
      },
    };
    const client = makeMockClient(makeVoidedMarket(), 5, {
      "1": 500000n,
      "2": 500000n,
    });

    const result = await redeemMarket(trader as any, client as any, "0xvoid", OWNER);
    assert.equal(result.hash, "0xvoid-both");
    assert.equal(redeemed.length, 2);
    assert.equal(redeemed[0].outcomeIdx, 0);
    assert.equal(redeemed[0].amount, 500000n);
    assert.equal(redeemed[1].outcomeIdx, 1);
    assert.equal(redeemed[1].amount, 500000n);
  });

  it("throws when both balances are zero", async () => {
    const trader = {
      redeem: async () => ({ hash: "0x", receipt: {} }),
    };
    const client = makeMockClient(makeVoidedMarket(), 5, {
      "1": 0n,
      "2": 0n,
    });

    await assert.rejects(
      () => redeemMarket(trader as any, client as any, "0xvoid", OWNER),
      (err: Error) => {
        assert.ok(err.message.includes("both YES and NO balances are zero"));
        return true;
      },
    );
  });

  it("requires ownerAddress for voided markets", async () => {
    const trader = {
      redeem: async () => ({ hash: "0x", receipt: {} }),
    };
    const client = makeMockClient(makeVoidedMarket(), 5);

    await assert.rejects(
      () => redeemMarket(trader as any, client as any, "0xvoid"),
      (err: Error) => {
        assert.ok(err.message.includes("ownerAddress is required"));
        return true;
      },
    );
  });
});

// ─── redeemMultipleMarkets ──────────────────────────────────────────────────

describe("redeemMultipleMarkets", () => {
  it("redeems multiple resolved markets", async () => {
    const entries: { marketId: string; outcomeIdx: number; amount: bigint }[] = [];
    const trader = {
      redeemMany: async (params: { entries: { marketId: string; outcomeIdx: number; amount: bigint }[] }) => {
        entries.push(...params.entries);
        return { hash: "0xbatch", receipt: {} };
      },
    };
    const client = {
      getBinaryMarket: async (id: string) => ({
        id,
        marketType: "BINARY",
        status: "Resolved",
        marketId: id,
        winningOutcome: id === "0x1" ? 0 : 1,
        backing: "1000000",
        netBacking: null,
      }),
    };

    const result = await redeemMultipleMarkets(
      trader as any,
      client as any,
      ["0x1", "0x2"],
    );
    assert.equal(result.hash, "0xbatch");
    assert.equal(entries.length, 2);
  });

  it("skips voided markets in batch", async () => {
    const entries: { marketId: string; outcomeIdx: number; amount: bigint }[] = [];
    const trader = {
      redeemMany: async (params: { entries: { marketId: string; outcomeIdx: number; amount: bigint }[] }) => {
        entries.push(...params.entries);
        return { hash: "0xbatch", receipt: {} };
      },
    };
    const client = {
      getBinaryMarket: async (id: string) => ({
        id,
        marketType: "BINARY",
        status: id === "0xvoid" ? "Voided" : "Resolved",
        marketId: id,
        winningOutcome: id === "0xvoid" ? null : 0,
        backing: "1000000",
        netBacking: null,
      }),
    };

    const result = await redeemMultipleMarkets(
      trader as any,
      client as any,
      ["0x1", "0xvoid"],
    );
    assert.equal(result.hash, "0xbatch");
    assert.equal(entries.length, 1);
    assert.equal(entries[0].marketId, "0x1");
  });
});

// ─── getResolution ──────────────────────────────────────────────────────────

describe("getResolution", () => {
  it("throws when market not found", async () => {
    const client = {
      getMarketResolution: async () => {
        throw new Error("Market 0xnotfound not found in indexer.");
      },
    };
    await assert.rejects(
      () => getResolution(client as any, "0xnotfound"),
      (err: Error) => {
        assert.ok(err.message.includes("not found") || err.message.includes("not found in indexer"));
        return true;
      },
    );
  });

  it("returns resolution data shape", async () => {
    const client = {
      getBinaryMarket: async () => ({
        id: "0xres",
        marketType: "BINARY",
        status: "Resolved",
        winningOutcome: 0,
      }),
      getMarketResolution: async () => ({
        winningOutcome: 0,
        events: [
          {
            kind: "Resolved",
            winningOutcome: 0,
            blockNumber: "12345",
            timestamp: "1000000",
            txHash: "0xtx",
          },
        ],
        reference: null,
        closingAnswer: { numericValue: "65000", outcomeLabel: "YES", resolvedAt: "1000000" },
        openingAnswer: null,
      }),
    };

    const result = await getResolution(client as any, "0xres");
    assert.equal(result.winningOutcome, 0);
    assert.equal(result.events.length, 1);
    assert.equal(result.closingAnswer?.numericValue, "65000");
    assert.equal(result.reference, null);
  });
});

// ─── buildReceiptData ───────────────────────────────────────────────────────

describe("buildReceiptData", () => {
  const FIXED_STRIKE_MARKET = {
    id: "0xreceipt",
    marketType: "BINARY",
    status: "Resolved",
    marketId: "0xreceipt",
    marketAddress: "0xpool",
    asset: "BTC",
    question: "Will BTC reach $100k?",
    strike: "100000",
    expiry: "1700000000",
    winningOutcome: 0,
    backing: "1000000",
    netBacking: null,
    quoteDecimals: 6,
    collateral: "0xusdc",
  };

  const client = {
    getBinaryMarket: async () => FIXED_STRIKE_MARKET,
    getMarketResolution: async () => ({
      winningOutcome: 0,
      events: [
        {
          kind: "Resolved",
          winningOutcome: 0,
          blockNumber: "12345",
          timestamp: "1700000000",
          txHash: "0xsettle",
          voided: false,
        },
      ],
      reference: {
        oracleQuestionId: "btc-price-100k-q42",
        pending: false,
      },
      closingAnswer: { numericValue: "101000", outcomeLabel: "YES", resolvedAt: "1700000000" },
      openingAnswer: null,
    }),
  };

  it("builds a complete receipt for a fixed-strike market", async () => {
    const receipt = await buildReceiptData(client as any, "0xreceipt", 50312);
    assert.equal(receipt.market.asset, "BTC");
    assert.equal(receipt.resolution.winningOutcome, 0);
    assert.equal(receipt.explorerTxUrl, "https://shannon-explorer.somnia.network/tx/0xsettle");
    assert.equal(receipt.voided, false);
    assert.equal(receipt.voidedNote, null);
  });

  it("populates oracleExplorerUrl when reference exists and is not pending", async () => {
    const receipt = await buildReceiptData(client as any, "0xreceipt", 50312);
    assert.equal(
      receipt.oracleExplorerUrl,
      "https://prd.oracle.somnia.host/explore/btc-price-100k-q42",
    );
  });

  it("returns null oracleExplorerUrl when reference is pending", async () => {
    const pendingClient = {
      ...client,
      getMarketResolution: async () => ({
        winningOutcome: 0,
        events: [],
        reference: { oracleQuestionId: "btc-pending", pending: true },
        closingAnswer: null,
        openingAnswer: null,
      }),
    };
    const receipt = await buildReceiptData(pendingClient as any, "0xreceipt", 50312);
    assert.equal(receipt.oracleExplorerUrl, null);
  });

  it("returns null oracleExplorerUrl when reference has empty questionId", async () => {
    const emptyClient = {
      ...client,
      getMarketResolution: async () => ({
        winningOutcome: 0,
        events: [],
        reference: { oracleQuestionId: "", pending: false },
        closingAnswer: null,
        openingAnswer: null,
      }),
    };
    const receipt = await buildReceiptData(emptyClient as any, "0xreceipt", 50312);
    assert.equal(receipt.oracleExplorerUrl, null);
  });

  it("handles no resolution events gracefully", async () => {
    const noEventsClient = {
      ...client,
      getMarketResolution: async () => ({
        winningOutcome: null,
        events: [],
        reference: null,
        closingAnswer: null,
        openingAnswer: null,
      }),
    };
    const receipt = await buildReceiptData(noEventsClient as any, "0xreceipt", 50312);
    assert.equal(receipt.resolution.events.length, 0);
    assert.equal(receipt.resolution.winningOutcome, null);
  });

  it("handles voided market receipt", async () => {
    const voidedMarket = { ...FIXED_STRIKE_MARKET, winningOutcome: null, status: "Voided" };
    const voidedClient = {
      getBinaryMarket: async () => voidedMarket,
      getMarketResolution: async () => ({
        winningOutcome: null,
        events: [
          {
            kind: "Voided",
            winningOutcome: null,
            blockNumber: "12346",
            timestamp: "1700000001",
            txHash: "0xvoid",
            voided: true,
          },
        ],
        reference: null,
        closingAnswer: null,
        openingAnswer: null,
      }),
    };
    const receipt = await buildReceiptData(voidedClient as any, "0xreceipt", 50312);
    assert.equal(receipt.voided, true);
    assert.ok(receipt.voidedNote !== null);
    assert.ok(receipt.voidedNote!.includes("voided"));
  });
});
