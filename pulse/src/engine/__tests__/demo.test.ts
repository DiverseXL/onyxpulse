import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  requestTestFunds,
  forceResolveMarket,
  forceVoidMarket,
} from "../demo.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FAKE_ORACLE = "0x00000000000000000000000000000000000000f1" as const;

function makeFakeTrader() {
  return {
    faucet: async (params?: Record<string, unknown>) => ({
      hash: "0xfaucet",
      receipt: {},
      _params: params,
    }),
    resolve: async (params: Record<string, unknown>) => ({
      hash: "0xresolve",
      receipt: {},
      _params: params,
    }),
    voidMarket: async (params: Record<string, unknown>) => ({
      hash: "0xvoid",
      receipt: {},
      _params: params,
    }),
  };
}

function testnetClient() {
  return { config: { chain: { id: 50312 } } };
}

function mainnetClient() {
  return { config: { chain: { id: 5031 } } };
}

function unknownChainClient() {
  return { config: { chain: { id: 99999 } } };
}

// ─── Export shape tests ──────────────────────────────────────────────────────

describe("demo module exports", () => {
  it("requestTestFunds is a function", () => {
    assert.equal(typeof requestTestFunds, "function");
  });

  it("forceResolveMarket is a function", () => {
    assert.equal(typeof forceResolveMarket, "function");
  });

  it("forceVoidMarket is a function", () => {
    assert.equal(typeof forceVoidMarket, "function");
  });
});

// ─── Mainnet guard tests ────────────────────────────────────────────────────

describe("mainnet runtime guard", () => {
  it("requestTestFunds throws on mainnet", async () => {
    await assert.rejects(
      () => requestTestFunds(makeFakeTrader() as any, mainnetClient() as any),
      (err: Error) => {
        assert.ok(err.message.includes("TESTNET-ONLY"));
        assert.ok(err.message.includes("5031"));
        assert.ok(err.message.includes("requestTestFunds"));
        return true;
      },
    );
  });

  it("forceResolveMarket throws on mainnet", async () => {
    await assert.rejects(
      () =>
        forceResolveMarket(
          makeFakeTrader() as any,
          mainnetClient() as any,
          "0x0000000000000000000000000000000000000001" as any,
          { outcomeIdx: 0, fakeOracleAddress: FAKE_ORACLE },
        ),
      (err: Error) => {
        assert.ok(err.message.includes("TESTNET-ONLY"));
        assert.ok(err.message.includes("forceResolveMarket"));
        return true;
      },
    );
  });

  it("forceVoidMarket throws on mainnet", async () => {
    await assert.rejects(
      () =>
        forceVoidMarket(
          makeFakeTrader() as any,
          mainnetClient() as any,
          "0x0000000000000000000000000000000000000001" as any,
          { fakeOracleAddress: FAKE_ORACLE },
        ),
      (err: Error) => {
        assert.ok(err.message.includes("TESTNET-ONLY"));
        assert.ok(err.message.includes("forceVoidMarket"));
        return true;
      },
    );
  });

  it("proceeds on testnet (chain 50312)", async () => {
    const result = await requestTestFunds(
      makeFakeTrader() as any,
      testnetClient() as any,
    );
    assert.equal(result.hash, "0xfaucet");
  });

  it("proceeds on unknown chain (not mainnet)", async () => {
    const result = await requestTestFunds(
      makeFakeTrader() as any,
      unknownChainClient() as any,
    );
    assert.equal(result.hash, "0xfaucet");
  });
});

// ─── Pass-through tests ──────────────────────────────────────────────────────

describe("requestTestFunds pass-through", () => {
  it("calls trader.faucet with params", async () => {
    const trader = makeFakeTrader();
    const amount = 5000000n;
    const result = await requestTestFunds(
      trader as any,
      testnetClient() as any,
      { amount },
    );
    assert.equal(result.hash, "0xfaucet");
    assert.equal((result as any)._params.amount, amount);
  });

  it("works without params", async () => {
    const result = await requestTestFunds(
      makeFakeTrader() as any,
      testnetClient() as any,
    );
    assert.equal(result.hash, "0xfaucet");
  });
});

describe("forceResolveMarket pass-through", () => {
  it("calls trader.resolve with correct params", async () => {
    const trader = makeFakeTrader();
    const result = await forceResolveMarket(
      trader as any,
      testnetClient() as any,
      "0x0000000000000000000000000000000000000042" as any,
      { outcomeIdx: 1, fakeOracleAddress: FAKE_ORACLE },
    );
    assert.equal(result.hash, "0xresolve");
    assert.equal((result as any)._params.market, "0x0000000000000000000000000000000000000042");
    assert.equal((result as any)._params.outcomeIdx, 1);
    assert.equal((result as any)._params.fakeOracle, FAKE_ORACLE);
  });
});

describe("forceVoidMarket pass-through", () => {
  it("calls trader.voidMarket with correct params", async () => {
    const trader = makeFakeTrader();
    const result = await forceVoidMarket(
      trader as any,
      testnetClient() as any,
      "0x0000000000000000000000000000000000000099" as any,
      { fakeOracleAddress: FAKE_ORACLE },
    );
    assert.equal(result.hash, "0xvoid");
    assert.equal((result as any)._params.market, "0x0000000000000000000000000000000000000099");
    assert.equal((result as any)._params.fakeOracle, FAKE_ORACLE);
  });
});

// ─── Error wrapping tests ────────────────────────────────────────────────────

describe("error wrapping", () => {
  it("requestTestFunds wraps faucet errors", async () => {
    const failingTrader = {
      faucet: async () => { throw new Error("No gas"); },
      resolve: async () => ({ hash: "0x", receipt: {} }),
      voidMarket: async () => ({ hash: "0x", receipt: {} }),
    };

    await assert.rejects(
      () => requestTestFunds(failingTrader as any, testnetClient() as any),
      (err: Error) => {
        assert.ok(err.message.includes("requestTestFunds failed"));
        assert.ok(err.message.includes("No gas"));
        return true;
      },
    );
  });

  it("forceResolveMarket wraps resolve errors", async () => {
    const failingTrader = {
      faucet: async () => ({ hash: "0x", receipt: {} }),
      resolve: async () => { throw new Error("FakeOracle not found"); },
      voidMarket: async () => ({ hash: "0x", receipt: {} }),
    };

    await assert.rejects(
      () =>
        forceResolveMarket(
          failingTrader as any,
          testnetClient() as any,
          "0x0000000000000000000000000000000000000001" as any,
          { outcomeIdx: 0, fakeOracleAddress: FAKE_ORACLE },
        ),
      (err: Error) => {
        assert.ok(err.message.includes("forceResolveMarket failed"));
        assert.ok(err.message.includes("0x0000000000000000000000000000000000000001"));
        assert.ok(err.message.includes("FakeOracle not found"));
        return true;
      },
    );
  });

  it("forceVoidMarket wraps voidMarket errors", async () => {
    const failingTrader = {
      faucet: async () => ({ hash: "0x", receipt: {} }),
      resolve: async () => ({ hash: "0x", receipt: {} }),
      voidMarket: async () => { throw new Error("Market not expired"); },
    };

    await assert.rejects(
      () =>
        forceVoidMarket(
          failingTrader as any,
          testnetClient() as any,
          "0x0000000000000000000000000000000000000077" as any,
          { fakeOracleAddress: FAKE_ORACLE },
        ),
      (err: Error) => {
        assert.ok(err.message.includes("forceVoidMarket failed"));
        assert.ok(err.message.includes("Market not expired"));
        return true;
      },
    );
  });
});
