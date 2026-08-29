import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getOnChainMarketStatus,
  assertMarketWritable,
} from "../statusGate.ts";

// ─── getOnChainMarketStatus tests ────────────────────────────────────────────

describe("getOnChainMarketStatus", () => {
  it("returns 'Trading' for on-chain status index 1", async () => {
    const fakeClient = {
      getMarketOnchain: async () => ({ status: 1 }),
    };
    const result = await getOnChainMarketStatus(fakeClient as any, "0xabc");
    assert.equal(result, "Trading");
  });

  it("returns 'Listed' for on-chain status index 0", async () => {
    const fakeClient = {
      getMarketOnchain: async () => ({ status: 0 }),
    };
    const result = await getOnChainMarketStatus(fakeClient as any, "0xabc");
    assert.equal(result, "Listed");
  });

  it("returns 'Locked' for on-chain status index 2", async () => {
    const fakeClient = {
      getMarketOnchain: async () => ({ status: 2 }),
    };
    const result = await getOnChainMarketStatus(fakeClient as any, "0xabc");
    assert.equal(result, "Locked");
  });

  it("returns 'Resolved' for on-chain status index 4", async () => {
    const fakeClient = {
      getMarketOnchain: async () => ({ status: 4 }),
    };
    const result = await getOnChainMarketStatus(fakeClient as any, "0xabc");
    assert.equal(result, "Resolved");
  });

  it("returns 'Voided' for on-chain status index 5", async () => {
    const fakeClient = {
      getMarketOnchain: async () => ({ status: 5 }),
    };
    const result = await getOnChainMarketStatus(fakeClient as any, "0xabc");
    assert.equal(result, "Voided");
  });

  it("throws on unknown status index", async () => {
    const fakeClient = {
      getMarketOnchain: async () => ({ status: 99 }),
    };
    await assert.rejects(
      () => getOnChainMarketStatus(fakeClient as any, "0xabc"),
      (err: Error) => {
        assert.ok(err.message.includes("Unknown on-chain status index 99"));
        return true;
      },
    );
  });

  it("wraps errors with market context", async () => {
    const fakeClient = {
      getMarketOnchain: async () => {
        throw new Error("RPC timeout");
      },
    };
    await assert.rejects(
      () => getOnChainMarketStatus(fakeClient as any, "0xdead"),
      (err: Error) => {
        assert.ok(err.message.includes("getOnChainMarketStatus failed"));
        assert.ok(err.message.includes("0xdead"));
        assert.ok(err.message.includes("RPC timeout"));
        return true;
      },
    );
  });
});

// ─── assertMarketWritable tests ──────────────────────────────────────────────

describe("assertMarketWritable", () => {
  it("passes when status matches (single status)", async () => {
    const fakeClient = {
      getMarketOnchain: async () => ({ status: 1 }), // Trading
    };
    // Should NOT throw
    await assertMarketWritable(fakeClient as any, "0xabc", "Trading");
  });

  it("passes when status matches (array of statuses)", async () => {
    const fakeClient = {
      getMarketOnchain: async () => ({ status: 4 }), // Resolved
    };
    // Should NOT throw
    await assertMarketWritable(fakeClient as any, "0xabc", ["Resolved", "Voided"]);
  });

  it("throws when status doesn't match (single status)", async () => {
    const fakeClient = {
      getMarketOnchain: async () => ({ status: 2 }), // Locked
    };
    await assert.rejects(
      () => assertMarketWritable(fakeClient as any, "0xabc", "Trading"),
      (err: Error) => {
        assert.ok(err.message.includes("not writable"));
        assert.ok(err.message.includes("Locked"));
        assert.ok(err.message.includes("Trading"));
        return true;
      },
    );
  });

  it("throws when status doesn't match (array)", async () => {
    const fakeClient = {
      getMarketOnchain: async () => ({ status: 1 }), // Trading
    };
    await assert.rejects(
      () => assertMarketWritable(fakeClient as any, "0xabc", ["Resolved", "Voided"]),
      (err: Error) => {
        assert.ok(err.message.includes("not writable"));
        assert.ok(err.message.includes("Trading"));
        assert.ok(err.message.includes("Resolved or Voided"));
        return true;
      },
    );
  });

  it("throws when market is Settling but expected Resolved", async () => {
    const fakeClient = {
      getMarketOnchain: async () => ({ status: 3 }), // Settling
    };
    await assert.rejects(
      () => assertMarketWritable(fakeClient as any, "0xabc", "Resolved"),
      (err: Error) => {
        assert.ok(err.message.includes("Settling"));
        assert.ok(err.message.includes("Resolved"));
        return true;
      },
    );
  });
});
