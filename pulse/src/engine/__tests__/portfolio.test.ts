import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getMyPortfolio,
  getMyOpenPositions,
  getMyRedeemablePositions,
  getPositionPnL,
  getOutcomeTokenBalance,
} from "../portfolio.ts";

// ─── Export shape tests ──────────────────────────────────────────────────────

describe("portfolio module exports", () => {
  it("getMyPortfolio is a function", () => {
    assert.equal(typeof getMyPortfolio, "function");
  });

  it("getMyOpenPositions is a function", () => {
    assert.equal(typeof getMyOpenPositions, "function");
  });

  it("getMyRedeemablePositions is a function", () => {
    assert.equal(typeof getMyRedeemablePositions, "function");
  });

  it("getPositionPnL is a function", () => {
    assert.equal(typeof getPositionPnL, "function");
  });

  it("getOutcomeTokenBalance is a function", () => {
    assert.equal(typeof getOutcomeTokenBalance, "function");
  });
});

// ─── getMyPortfolio tests ────────────────────────────────────────────────────

describe("getMyPortfolio", () => {
  it("returns portfolio from SDK client", async () => {
    const fakePortfolio = {
      account: "0xtrader",
      positions: [
        {
          market: { id: "0xmkt1", status: "Trading" },
          outcomeIndex: 0,
          balance: "500000",
        },
      ],
      openOrders: [],
      trades: [],
    };
    const client = {
      getPortfolio: async (account: string) => {
        assert.equal(account, "0xtrader");
        return fakePortfolio;
      },
    };

    const result = await getMyPortfolio(client as any, "0xTrAdEr" as any);
    assert.equal(result.account, "0xtrader");
    assert.equal(result.positions.length, 1);
  });

  it("passes options through to SDK", async () => {
    let capturedOpts: unknown = undefined;
    const client = {
      getPortfolio: async (_account: string, opts: unknown) => {
        capturedOpts = opts;
        return { account: "0x", positions: [], openOrders: [], trades: [] };
      },
    };

    const opts = { ordersLimit: 5, tradesLimit: 3, since: 1700000000 };
    await getMyPortfolio(client as any, "0xabc" as any, opts);
    assert.deepEqual(capturedOpts, opts);
  });

  it("wraps errors with context", async () => {
    const client = {
      getPortfolio: async () => {
        throw new Error("Indexer timeout");
      },
    };

    await assert.rejects(
      () => getMyPortfolio(client as any, "0xdead" as any),
      (err: Error) => {
        assert.ok(err.message.includes("getMyPortfolio failed for 0xdead"));
        assert.ok(err.message.includes("Indexer timeout"));
        return true;
      },
    );
  });
});

// ─── getMyOpenPositions tests ────────────────────────────────────────────────

describe("getMyOpenPositions", () => {
  it("filters to non-zero balance positions", async () => {
    const client = {
      getPortfolio: async () => ({
        account: "0xtrader",
        positions: [
          {
            market: { id: "0xmkt1", status: "Trading" },
            outcomeIndex: 0,
            balance: "500000",
          },
          {
            market: { id: "0xmkt2", status: "Resolved" },
            outcomeIndex: 1,
            balance: "0",
          },
          {
            market: { id: "0xmkt3", status: "Trading" },
            outcomeIndex: 0,
            balance: "1000000",
          },
        ],
        openOrders: [],
        trades: [],
      }),
    };

    const result = await getMyOpenPositions(client as any, "0xabc" as any);
    assert.equal(result.length, 2);
    assert.equal(result[0].market.id, "0xmkt1");
    assert.equal(result[1].market.id, "0xmkt3");
  });

  it("returns empty array when no open positions", async () => {
    const client = {
      getPortfolio: async () => ({
        account: "0xtrader",
        positions: [
          { market: { id: "0x" }, outcomeIndex: 0, balance: "0" },
        ],
        openOrders: [],
        trades: [],
      }),
    };

    const result = await getMyOpenPositions(client as any, "0xabc" as any);
    assert.equal(result.length, 0);
  });

  it("wraps errors with context", async () => {
    const client = {
      getPortfolio: async () => {
        throw new Error("GraphQL error");
      },
    };

    await assert.rejects(
      () => getMyOpenPositions(client as any, "0xdead" as any),
      (err: Error) => {
        assert.ok(err.message.includes("getMyOpenPositions failed"));
        assert.ok(err.message.includes("GraphQL error"));
        return true;
      },
    );
  });
});

// ─── getMyRedeemablePositions tests ──────────────────────────────────────────

describe("getMyRedeemablePositions", () => {
  it("returns claimable positions from SDK", async () => {
    const client = {
      getClaimable: async () => [
        {
          marketId: "0xmkt1",
          pool: "0xpool1",
          outcomeIdx: 0,
          amount: 500000n,
          estPayout: 475000n,
          status: "Resolved",
        },
        {
          marketId: "0xmkt2",
          pool: "0xpool2",
          outcomeIdx: 1,
          amount: 300000n,
          estPayout: 150000n,
          status: "Voided",
        },
      ],
    };

    const result = await getMyRedeemablePositions(
      client as any,
      "0xabc" as any,
    );
    assert.equal(result.length, 2);
    assert.equal(result[0].marketId, "0xmkt1");
    assert.equal(result[0].outcomeIdx, 0);
    assert.equal(result[0].amount, 500000n);
    assert.equal(result[0].estPayout, 475000n);
    assert.equal(result[0].status, "Resolved");
    assert.equal(result[1].status, "Voided");
  });

  it("returns empty array when nothing to redeem", async () => {
    const client = {
      getClaimable: async () => [],
    };

    const result = await getMyRedeemablePositions(
      client as any,
      "0xabc" as any,
    );
    assert.equal(result.length, 0);
  });

  it("wraps errors with context", async () => {
    const client = {
      getClaimable: async () => {
        throw new Error("Network failure");
      },
    };

    await assert.rejects(
      () => getMyRedeemablePositions(client as any, "0xdead" as any),
      (err: Error) => {
        assert.ok(
          err.message.includes("getMyRedeemablePositions failed"),
        );
        assert.ok(err.message.includes("Network failure"));
        return true;
      },
    );
  });
});

// ─── getPositionPnL tests ────────────────────────────────────────────────────

describe("getPositionPnL", () => {
  it("returns PnL for a single market", async () => {
    const fakePnL = {
      market: { id: "0xmkt1", quoteDecimals: 6 },
      costBasis: 600000n,
      avgCost: 0.6,
      markValue: 650000n,
      unrealizedPnl: 50000n,
      realizedPnl: 0n,
    };
    const client = {
      getBinaryPositionPnL: async (
        account: string,
        marketId: string,
      ) => {
        assert.equal(account, "0xtrader");
        assert.equal(marketId, "0xmkt1");
        return fakePnL;
      },
    };

    const result = await getPositionPnL(
      client as any,
      "0xtrader" as any,
      "0xmkt1",
    );
    assert.equal(result.costBasis, 600000n);
    assert.equal(result.unrealizedPnl, 50000n);
  });

  it("wraps errors with context", async () => {
    const client = {
      getBinaryPositionPnL: async () => {
        throw new Error("Market not found");
      },
    };

    await assert.rejects(
      () =>
        getPositionPnL(
          client as any,
          "0xdead" as any,
          "0xnonexistent",
        ),
      (err: Error) => {
        assert.ok(err.message.includes("getPositionPnL failed"));
        assert.ok(err.message.includes("0xdead"));
        assert.ok(err.message.includes("0xnonexistent"));
        assert.ok(err.message.includes("Market not found"));
        return true;
      },
    );
  });
});

// ─── getOutcomeTokenBalance tests ────────────────────────────────────────────

describe("getOutcomeTokenBalance", () => {
  it("returns YES balance for outcome 0", async () => {
    const client = {
      getOutcomeBalances: async (
        account: string,
        marketAddress: string,
      ) => {
        assert.equal(account, "0xtrader");
        assert.equal(marketAddress, "0xmarketaddr");
        return { yes: "500000", no: "0" };
      },
    };
    const market = {
      id: "0xmkt",
      marketAddress: "0xmarketaddr",
    };

    const result = await getOutcomeTokenBalance(
      client as any,
      "0xtrader" as any,
      market as any,
      0,
    );
    assert.equal(result, 500000n);
  });

  it("returns NO balance for outcome 1", async () => {
    const client = {
      getOutcomeBalances: async () => ({
        yes: "100000",
        no: "250000",
      }),
    };
    const market = { id: "0xmkt", marketAddress: "0xaddr" };

    const result = await getOutcomeTokenBalance(
      client as any,
      "0xabc" as any,
      market as any,
      1,
    );
    assert.equal(result, 250000n);
  });

  it("returns zero for zero balances", async () => {
    const client = {
      getOutcomeBalances: async () => ({ yes: "0", no: "0" }),
    };
    const market = { id: "0xmkt", marketAddress: "0xaddr" };

    const result = await getOutcomeTokenBalance(
      client as any,
      "0xabc" as any,
      market as any,
      0,
    );
    assert.equal(result, 0n);
  });

  it("wraps errors with context", async () => {
    const client = {
      getOutcomeBalances: async () => {
        throw new Error("Indexer 500");
      },
    };
    const market = {
      id: "0xbad",
      marketAddress: "0xaddr",
    };

    await assert.rejects(
      () =>
        getOutcomeTokenBalance(
          client as any,
          "0xdead" as any,
          market as any,
          0,
        ),
      (err: Error) => {
        assert.ok(err.message.includes("getOutcomeTokenBalance failed"));
        assert.ok(err.message.includes("0xdead"));
        assert.ok(err.message.includes("0xbad"));
        assert.ok(err.message.includes("Indexer 500"));
        return true;
      },
    );
  });
});
