import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { normalizeAddress } from "../address.js";

// A checksummed Somnia/ETH-style address (generated via viem getAddress).
const VALID = "0x1234567890AbcdEF1234567890aBcdef12345678";

describe("normalizeAddress", () => {
  it("accepts a valid checksummed address and returns it verbatim", () => {
    const result = normalizeAddress(VALID);
    assert.ok(result.ok);
    if (result.ok) assert.equal(result.address, VALID);
  });

  it("normalizes an all-lowercase address to checksummed form", () => {
    const result = normalizeAddress(VALID.toLowerCase());
    assert.ok(result.ok);
    if (result.ok) assert.equal(result.address, VALID);
  });

  it("trims surrounding whitespace", () => {
    const result = normalizeAddress(`  ${VALID}  `);
    assert.ok(result.ok);
  });

  it("rejects malformed inputs", () => {
    assert.equal(normalizeAddress(undefined).ok, false);
    assert.equal(normalizeAddress(42).ok, false);
    assert.equal(normalizeAddress("").ok, false);
    assert.equal(normalizeAddress("0x123").ok, false);
    assert.equal(normalizeAddress("1234567890abcdef1234567890abcdef12345678").ok, false); // no 0x
    assert.equal(normalizeAddress("0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG").ok, false); // non-hex
    // Wrong checksum for an otherwise-valid 40-hex address must be rejected.
    assert.equal(normalizeAddress("0x1234567890AbcdEF1234567890aBcdef12345679").ok, false);
  });
});