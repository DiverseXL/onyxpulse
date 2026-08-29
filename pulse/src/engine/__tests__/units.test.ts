import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  toBigintAmount,
  fromBigintAmount,
  snapToTick,
} from "../units.ts";

// ─── toBigintAmount ──────────────────────────────────────────────────────────

describe("toBigintAmount", () => {
  it("whole numbers at 6 decimals (TestUSDC)", () => {
    assert.equal(toBigintAmount(10, 6), 10_000_000n);
    assert.equal(toBigintAmount(1, 6), 1_000_000n);
    assert.equal(toBigintAmount(0, 6), 0n);
  });

  it("whole numbers at 18 decimals", () => {
    assert.equal(toBigintAmount(1, 18), 1_000_000_000_000_000_000n);
    assert.equal(toBigintAmount(100, 18), 100_000_000_000_000_000_000n);
  });

  it("fractional values at 6 decimals", () => {
    assert.equal(toBigintAmount(0.62, 6), 620_000n);
    assert.equal(toBigintAmount("0.62", 6), 620_000n);
  });

  it("fractional values at 18 decimals", () => {
    assert.equal(toBigintAmount("0.62", 18), 620_000_000_000_000_000n);
    assert.equal(toBigintAmount("1.5", 18), 1_500_000_000_000_000_000n);
  });

  it("max decimal precision at 6 decimals", () => {
    assert.equal(toBigintAmount("0.000001", 6), 1n);
    assert.equal(toBigintAmount("123456.789012", 6), 123_456_789_012n);
  });

  it("max decimal precision at 18 decimals", () => {
    assert.equal(toBigintAmount("0.000000000000000001", 18), 1n);
  });

  it("rejects over-precision input", () => {
    assert.throws(
      () => toBigintAmount(0.123, 2),
      /3 decimal places but only 2/,
    );
    assert.throws(
      () => toBigintAmount("0.0000001", 6),
      /7 decimal places but only 6/,
    );
  });

  it("string input avoids float precision issues", () => {
    // 0.1 + 0.2 in float is 0.30000000000000004, but string "0.3" is exact
    assert.equal(toBigintAmount("0.3", 18), 300_000_000_000_000_000n);
    // The classic float pitfall: 0.1 is not exactly representable
    assert.equal(toBigintAmount("0.1", 1), 1n);
  });

  it("zero variants", () => {
    assert.equal(toBigintAmount("0", 6), 0n);
    assert.equal(toBigintAmount("0.0", 6), 0n);
    assert.equal(toBigintAmount("0.", 6), 0n);
  });
});

// ─── fromBigintAmount ────────────────────────────────────────────────────────

describe("fromBigintAmount", () => {
  it("round-trips with toBigintAmount at 6 decimals", () => {
    const values = ["10", "0.62", "123456.789012", "0.000001", "100"];
    for (const v of values) {
      const raw = toBigintAmount(v, 6);
      const back = fromBigintAmount(raw, 6);
      assert.equal(back, v, `round-trip failed for "${v}": got "${back}"`);
    }
  });

  it("round-trips with toBigintAmount at 18 decimals", () => {
    const values = ["1", "0.62", "100.123456789012345678", "0.000000000000000001"];
    for (const v of values) {
      const raw = toBigintAmount(v, 18);
      const back = fromBigintAmount(raw, 18);
      assert.equal(back, v, `round-trip failed for "${v}": got "${back}"`);
    }
  });

  it("zero", () => {
    assert.equal(fromBigintAmount(0n, 6), "0");
    assert.equal(fromBigintAmount(0n, 18), "0");
  });

  it("large whole number", () => {
    assert.equal(fromBigintAmount(1_000_000_000_000n, 6), "1000000");
  });

  it("preserves exact scale", () => {
    // 1 at 6dp should be "0.000001", not "1e-6" or "0.0000010"
    assert.equal(fromBigintAmount(1n, 6), "0.000001");
    assert.equal(fromBigintAmount(1n, 18), "0.000000000000000001");
  });
});

// ─── snapToTick ──────────────────────────────────────────────────────────────

describe("snapToTick", () => {
  it("already on grid — no change", () => {
    // 0.001 tick at 18dp = 1e15
    const tick = 1_000_000_000_000_000n; // 1e15
    assert.equal(snapToTick(500_000_000_000_000_000n, tick), 500_000_000_000_000_000n);
  });

  it("snaps down to nearest tick (confirmed 0.001 tick, 18dp)", () => {
    // 0.001 tick = 1e15 raw on 18dp
    const tick = 1_000_000_000_000_000n; // 1e15
    // 0.6255 → snaps to 0.625
    const price = 625_500_000_000_000_000n; // 0.6255
    const expected = 625_000_000_000_000_000n; // 0.625
    assert.equal(snapToTick(price, tick), expected);
  });

  it("snaps down when just above a tick", () => {
    const tick = 1_000_000_000_000_000n; // 1e15
    // 0.625000000000000001 → snaps to 0.625
    const price = 625_000_000_000_000_001n;
    const expected = 625_000_000_000_000_000n;
    assert.equal(snapToTick(price, tick), expected);
  });

  it("whole number price with small tick", () => {
    // tick = 0.01 at 6dp = 10_000
    const tick = 10_000n;
    assert.equal(snapToTick(625_500n, tick), 620_000n);
    assert.equal(snapToTick(620_000n, tick), 620_000n);
  });

  it("throws on zero tickSize", () => {
    assert.throws(
      () => snapToTick(100n, 0n),
      /tickSize must be positive/,
    );
  });

  it("throws on negative tickSize", () => {
    assert.throws(
      () => snapToTick(100n, -1n),
      /tickSize must be positive/,
    );
  });

  it("price of zero stays zero", () => {
    assert.equal(snapToTick(0n, 1_000_000_000_000_000n), 0n);
  });
});
