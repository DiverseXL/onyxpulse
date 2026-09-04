import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeDraftSide,
  validateHumanAmount,
  buildDraftTradeUrl,
  validateDraftTrade,
} from "../draft.ts";

const MARKET_ID = "0x1111111111111111111111111111111111111111111111111111111111111111";
const APP_URL = "https://pulse.example.com";

describe("normalizeDraftSide", () => {
  it("accepts yes/no case-insensitively with whitespace", () => {
    assert.equal(normalizeDraftSide("yes"), "yes");
    assert.equal(normalizeDraftSide("NO"), "no");
    assert.equal(normalizeDraftSide("  Yes  "), "yes");
  });

  it("rejects anything else", () => {
    assert.equal(normalizeDraftSide("buy"), null);
    assert.equal(normalizeDraftSide("1"), null);
    assert.equal(normalizeDraftSide(""), null);
    assert.equal(normalizeDraftSide(undefined), null);
    assert.equal(normalizeDraftSide(42), null);
  });
});

describe("validateHumanAmount", () => {
  it("accepts positive decimals with up to 6 fractional digits", () => {
    assert.deepEqual(validateHumanAmount("25"), { ok: true, text: "25" });
    assert.deepEqual(validateHumanAmount("12.5"), { ok: true, text: "12.5" });
    assert.deepEqual(validateHumanAmount("0.5"), { ok: true, text: "0.5" });
    assert.deepEqual(validateHumanAmount("  100  "), { ok: true, text: "100" });
    assert.deepEqual(validateHumanAmount("1.234567"), { ok: true, text: "1.234567" });
  });

  it("rejects malformed amounts", () => {
    assert.equal(validateHumanAmount("").ok, false);
    assert.equal(validateHumanAmount("abc").ok, false);
    assert.equal(validateHumanAmount("0").ok, false);
    assert.equal(validateHumanAmount("-5").ok, false);
    assert.equal(validateHumanAmount("5.").ok, false);
    assert.equal(validateHumanAmount(".5").ok, false);
    assert.equal(validateHumanAmount("1.2345678").ok, false);
    assert.equal(validateHumanAmount("1e3").ok, false);
    assert.equal(validateHumanAmount("999999999999").ok, false);
    assert.equal(validateHumanAmount(undefined).ok, false);
    assert.equal(validateHumanAmount(25).ok, false);
  });
});

describe("buildDraftTradeUrl", () => {
  it("builds the expected prefill URL", () => {
    const url = buildDraftTradeUrl({
      marketId: MARKET_ID,
      side: "yes",
      amountText: "12.5",
      appUrl: APP_URL,
    });
    assert.equal(url, `${APP_URL}/market/${MARKET_ID}?prefillSide=yes&prefillAmount=12.5`);
  });

  it("strips trailing slashes from the app URL and encodes the market id path", () => {
    const url = buildDraftTradeUrl({
      marketId: " 0xAbC ",
      side: "no",
      amountText: "25",
      appUrl: "https://pulse.example.com/",
    });
    assert.equal(url, `${APP_URL}/market/0xAbC?prefillSide=no&prefillAmount=25`);
  });
});

describe("validateDraftTrade", () => {
  it("returns a ready URL for a well-formed draft", () => {
    const result = validateDraftTrade({
      marketId: MARKET_ID,
      side: "YES",
      humanAmount: "25",
      appUrl: APP_URL,
    });
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(result.side, "yes");
    assert.equal(result.amountText, "25");
    assert.equal(result.url, `${APP_URL}/market/${MARKET_ID}?prefillSide=yes&prefillAmount=25`);
  });

  it("rejects a non-bytes32 market id", () => {
    const result = validateDraftTrade({
      marketId: "0x123",
      side: "yes",
      humanAmount: "25",
      appUrl: APP_URL,
    });
    assert.ok(!result.ok);
  });

  it("rejects an invalid side", () => {
    const result = validateDraftTrade({
      marketId: MARKET_ID,
      side: "long",
      humanAmount: "25",
      appUrl: APP_URL,
    });
    assert.ok(!result.ok);
  });

  it("rejects a zero amount", () => {
    const result = validateDraftTrade({
      marketId: MARKET_ID,
      side: "no",
      humanAmount: "0",
      appUrl: APP_URL,
    });
    assert.ok(!result.ok);
  });
});