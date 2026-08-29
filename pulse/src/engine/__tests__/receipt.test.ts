import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildShareableReceipt,
  receiptToShareableUrl,
  receiptToJson,
} from "../receipt.ts";

import type { PulseReceipt } from "../receipt.ts";

// ─── Mock helpers ────────────────────────────────────────────────────────────

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

const VOIDED_MARKET = {
  ...FIXED_STRIKE_MARKET,
  id: "0xvoid",
  marketId: "0xvoid",
  winningOutcome: null,
  status: "Voided",
  voided: true,
};

function makeResolvedClient() {
  return {
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
      closingAnswer: {
        numericValue: "101000",
        outcomeLabel: "YES",
        resolvedAt: "1700000000",
      },
      openingAnswer: null,
    }),
  };
}

function makeVoidedClient() {
  return {
    getBinaryMarket: async () => VOIDED_MARKET,
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
}

// ─── Export shape tests ─────────────────────────────────────────────────────

describe("receipt module exports", () => {
  it("buildShareableReceipt is a function", () => {
    assert.equal(typeof buildShareableReceipt, "function");
  });

  it("receiptToShareableUrl is a function", () => {
    assert.equal(typeof receiptToShareableUrl, "function");
  });

  it("receiptToJson is a function", () => {
    assert.equal(typeof receiptToJson, "function");
  });
});

// ─── buildShareableReceipt — happy path ──────────────────────────────────────

describe("buildShareableReceipt — resolved market", () => {
  it("builds a versioned receipt with correct field mapping", async () => {
    const client = makeResolvedClient();
    const receipt = await buildShareableReceipt(client as any, "0xreceipt", 50312);

    // Schema version
    assert.equal(receipt.schemaVersion, "1.0");

    // Market fields extracted from BinaryMarket
    assert.equal(receipt.marketId, "0xreceipt");
    assert.equal(receipt.question, "Will BTC reach $100k?");
    assert.equal(receipt.asset, "BTC");
    assert.equal(receipt.strike, "100000");
    assert.equal(receipt.expiry, "1700000000");
    assert.equal(receipt.status, "Resolved");

    // Resolution
    assert.equal(receipt.winningOutcome, 0);
    assert.equal(receipt.voided, false);
    assert.equal(receipt.voidedNote, null);

    // Events mapped to flat array
    assert.equal(receipt.resolutionEvents.length, 1);
    assert.equal(receipt.resolutionEvents[0].kind, "Resolved");
    assert.equal(receipt.resolutionEvents[0].txHash, "0xsettle");
    assert.equal(receipt.resolutionEvents[0].blockNumber, "12345");
    assert.equal(receipt.resolutionEvents[0].voided, false);

    // Explorer URLs
    assert.equal(
      receipt.explorerTxUrl,
      "https://shannon-explorer.somnia.network/tx/0xsettle",
    );
    assert.equal(
      receipt.oracleExplorerUrl,
      "https://prd.oracle.somnia.host/explore/btc-price-100k-q42",
    );

    // Generated timestamp is a valid ISO string
    assert.ok(receipt.generatedAt);
    assert.ok(new Date(receipt.generatedAt).toISOString() === receipt.generatedAt);
  });
});

// ─── buildShareableReceipt — voided path ────────────────────────────────────

describe("buildShareableReceipt — voided market", () => {
  it("sets voided fields correctly", async () => {
    const client = makeVoidedClient();
    const receipt = await buildShareableReceipt(client as any, "0xvoid", 50312);

    assert.equal(receipt.schemaVersion, "1.0");
    assert.equal(receipt.marketId, "0xvoid");
    assert.equal(receipt.status, "Voided");
    assert.equal(receipt.voided, true);
    assert.ok(receipt.voidedNote !== null);
    assert.ok(receipt.voidedNote!.includes("voided"));
    assert.equal(receipt.winningOutcome, null);
    assert.equal(receipt.resolutionEvents.length, 1);
    assert.equal(receipt.resolutionEvents[0].kind, "Voided");
    assert.equal(receipt.resolutionEvents[0].voided, true);
    // Oracle explorer should be null for voided (no reference)
    assert.equal(receipt.oracleExplorerUrl, null);
  });
});

// ─── receiptToShareableUrl ──────────────────────────────────────────────────

describe("receiptToShareableUrl", () => {
  const receipt: PulseReceipt = {
    schemaVersion: "1.0",
    marketId: "0xabcdef",
    question: "Test?",
    asset: "ETH",
    strike: "5000",
    expiry: "1700000000",
    status: "Resolved",
    winningOutcome: 1,
    voided: false,
    voidedNote: null,
    resolutionEvents: [],
    explorerTxUrl: null,
    oracleExplorerUrl: null,
    generatedAt: "2025-01-01T00:00:00.000Z",
  };

  it("builds a URL from a simple base", () => {
    const url = receiptToShareableUrl(receipt, "https://pulse.app");
    assert.equal(url, "https://pulse.app/receipt/0xabcdef");
  });

  it("strips trailing slash from baseUrl", () => {
    const url = receiptToShareableUrl(receipt, "https://pulse.app/");
    assert.equal(url, "https://pulse.app/receipt/0xabcdef");
  });

  it("works with a path-prefixed base", () => {
    const url = receiptToShareableUrl(receipt, "https://example.com/pulse");
    assert.equal(url, "https://example.com/pulse/receipt/0xabcdef");
  });

  it("does not double-slash when baseUrl ends with /receipt/", () => {
    const url = receiptToShareableUrl(receipt, "https://pulse.app/receipt");
    assert.equal(url, "https://pulse.app/receipt/receipt/0xabcdef");
  });
});

// ─── receiptToJson ──────────────────────────────────────────────────────────

describe("receiptToJson", () => {
  const baseReceipt: PulseReceipt = {
    schemaVersion: "1.0",
    marketId: "0xjson",
    question: "JSON test?",
    asset: "BTC",
    strike: "50000",
    expiry: "1700000000",
    status: "Resolved",
    winningOutcome: 0,
    voided: false,
    voidedNote: null,
    resolutionEvents: [],
    explorerTxUrl: "https://explorer.somnia.network/tx/0xtx",
    oracleExplorerUrl: null,
    generatedAt: "2025-06-15T12:00:00.000Z",
  };

  it("produces valid JSON with stable key order", () => {
    const json = receiptToJson(baseReceipt);
    const parsed = JSON.parse(json);

    // All expected keys present in declaration order
    const keys = Object.keys(parsed);
    assert.deepEqual(keys, [
      "schemaVersion",
      "marketId",
      "question",
      "asset",
      "strike",
      "expiry",
      "status",
      "winningOutcome",
      "voided",
      "voidedNote",
      "resolutionEvents",
      "explorerTxUrl",
      "oracleExplorerUrl",
      "generatedAt",
    ]);
  });

  it("round-trips cleanly (JSON.parse of JSON.stringify)", () => {
    const json = receiptToJson(baseReceipt);
    const parsed: PulseReceipt = JSON.parse(json);

    assert.equal(parsed.schemaVersion, "1.0");
    assert.equal(parsed.marketId, "0xjson");
    assert.equal(parsed.winningOutcome, 0);
    assert.equal(parsed.explorerTxUrl, "https://explorer.somnia.network/tx/0xtx");
    assert.equal(parsed.generatedAt, "2025-06-15T12:00:00.000Z");
  });

  it("indents with 2 spaces for readability", () => {
    const json = receiptToJson(baseReceipt);
    // The second line should start with 2-space indent (first key)
    const lines = json.split("\n");
    assert.ok(lines[1].startsWith('  "'));
  });

  it("handles a receipt with resolution events", () => {
    const withEvents: PulseReceipt = {
      ...baseReceipt,
      resolutionEvents: [
        {
          kind: "Resolved",
          winningOutcome: 0,
          blockNumber: "99999",
          timestamp: "1700000000",
          txHash: "0xevt",
          voided: false,
        },
      ],
    };
    const json = receiptToJson(withEvents);
    const parsed = JSON.parse(json);
    assert.equal(parsed.resolutionEvents.length, 1);
    assert.equal(parsed.resolutionEvents[0].kind, "Resolved");
  });
});
