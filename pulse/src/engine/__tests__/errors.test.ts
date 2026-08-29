import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  PulseEngineError,
  PulseErrorCode,
  mapSdkError,
} from "../errors.ts";
import { ContractRevertError } from "@somnia-chain/markets-sdk";

// ─── PulseEngineError tests ──────────────────────────────────────────────────

describe("PulseEngineError", () => {
  it("has correct name, code, context, and message", () => {
    const err = new PulseEngineError(
      PulseErrorCode.INSUFFICIENT_BALANCE,
      "placeLimitOrder for pool 0xabc",
      "placeLimitOrder for pool 0xabc: InsufficientBalance",
    );

    assert.equal(err.name, "PulseEngineError");
    assert.equal(err.code, PulseErrorCode.INSUFFICIENT_BALANCE);
    assert.equal(err.context, "placeLimitOrder for pool 0xabc");
    assert.equal(err.message, "placeLimitOrder for pool 0xabc: InsufficientBalance");
    assert.equal(err.originalError, undefined);
  });

  it("preserves originalError", () => {
    const original = new Error("original");
    const err = new PulseEngineError(
      PulseErrorCode.UNKNOWN,
      "test",
      "test: original",
      original,
    );

    assert.equal(err.originalError, original);
  });

  it("is instanceof Error", () => {
    const err = new PulseEngineError(
      PulseErrorCode.UNKNOWN,
      "test",
      "test",
    );
    assert.ok(err instanceof Error);
  });
});

// ─── PulseErrorCode tests ────────────────────────────────────────────────────

describe("PulseErrorCode", () => {
  it("has all expected codes", () => {
    const expected = [
      "INVALID_PRICE",
      "INCORRECT_SENDER",
      "INSUFFICIENT_BALANCE",
      "WRONG_STATUS",
      "NOT_AUTHORIZED_OPERATOR",
      "MARKET_NOT_FOUND",
      "ALREADY_REDEEMED",
      "UNKNOWN",
    ];

    for (const code of expected) {
      assert.equal(
        (PulseErrorCode as Record<string, string>)[code],
        code,
        `Missing code: ${code}`,
      );
    }
  });
});

// ─── mapSdkError tests ───────────────────────────────────────────────────────

describe("mapSdkError", () => {
  it("maps plain Error to UNKNOWN", () => {
    const err = new Error("something broke");
    const result = mapSdkError(err, "test context");

    assert.ok(result instanceof PulseEngineError);
    assert.equal(result.code, PulseErrorCode.UNKNOWN);
    assert.equal(result.context, "test context");
    assert.ok(result.message.includes("something broke"));
    assert.equal(result.originalError, err);
  });

  it("maps non-Error value to UNKNOWN", () => {
    const result = mapSdkError("string error", "test context");

    assert.ok(result instanceof PulseEngineError);
    assert.equal(result.code, PulseErrorCode.UNKNOWN);
    assert.ok(result.message.includes("string error"));
  });

  it("maps null to UNKNOWN", () => {
    const result = mapSdkError(null, "test context");

    assert.ok(result instanceof PulseEngineError);
    assert.equal(result.code, PulseErrorCode.UNKNOWN);
    assert.ok(result.message.includes("null"));
  });

  it("maps undefined to UNKNOWN", () => {
    const result = mapSdkError(undefined, "test context");

    assert.ok(result instanceof PulseEngineError);
    assert.equal(result.code, PulseErrorCode.UNKNOWN);
    assert.ok(result.message.includes("undefined"));
  });

  it("preserves error context in message", () => {
    const err = new Error(" InsufficientBalance");
    const result = mapSdkError(err, "placeMarketOrder for pool 0xabc");

    assert.ok(result.message.startsWith("placeMarketOrder for pool 0xabc:"));
    assert.ok(result.message.includes("InsufficientBalance"));
    assert.equal(result.context, "placeMarketOrder for pool 0xabc");
  });

  it("handles nested Error with cause", () => {
    const cause = new Error("root cause");
    const err = new Error("wrapper", { cause });
    const result = mapSdkError(err, "test");

    assert.ok(result instanceof PulseEngineError);
    assert.equal(result.code, PulseErrorCode.UNKNOWN);
    assert.equal(result.originalError, err);
  });
});

// ─── mapSdkError with real ContractRevertError ───────────────────────────────

describe("mapSdkError with ContractRevertError", () => {
  it("maps InvalidPrice to INVALID_PRICE", () => {
    const sdkErr = new ContractRevertError({
      errorName: "InvalidPrice",
      reason: "InvalidPrice",
    });
    const result = mapSdkError(sdkErr, "placeLimitOrder");

    assert.equal(result.code, PulseErrorCode.INVALID_PRICE);
    assert.ok(result.message.includes("InvalidPrice"));
    assert.equal(result.originalError, sdkErr);
  });

  it("maps IncorrectSender to INCORRECT_SENDER", () => {
    const sdkErr = new ContractRevertError({
      errorName: "IncorrectSender",
      reason: "IncorrectSender",
    });
    const result = mapSdkError(sdkErr, "cancelOrder");

    assert.equal(result.code, PulseErrorCode.INCORRECT_SENDER);
  });

  it("maps InsufficientBalance to INSUFFICIENT_BALANCE", () => {
    const sdkErr = new ContractRevertError({
      errorName: "InsufficientBalance",
      reason: "InsufficientBalance",
    });
    const result = mapSdkError(sdkErr, "placeMarketOrder");

    assert.equal(result.code, PulseErrorCode.INSUFFICIENT_BALANCE);
  });

  it("maps WrongStatus to WRONG_STATUS", () => {
    const sdkErr = new ContractRevertError({
      errorName: "WrongStatus",
      reason: "WrongStatus",
    });
    const result = mapSdkError(sdkErr, "mintCompleteSet");

    assert.equal(result.code, PulseErrorCode.WRONG_STATUS);
  });

  it("maps Unauthorized to NOT_AUTHORIZED_OPERATOR", () => {
    const sdkErr = new ContractRevertError({
      errorName: "Unauthorized",
      reason: "Unauthorized",
    });
    const result = mapSdkError(sdkErr, "placeOrderAsOperator");

    assert.equal(result.code, PulseErrorCode.NOT_AUTHORIZED_OPERATOR);
  });

  it("maps AlreadyFinalized to ALREADY_REDEEMED", () => {
    const sdkErr = new ContractRevertError({
      errorName: "AlreadyFinalized",
      reason: "AlreadyFinalized",
    });
    const result = mapSdkError(sdkErr, "redeemMarket");

    assert.equal(result.code, PulseErrorCode.ALREADY_REDEEMED);
  });

  it("maps OrderAlreadyExpired to INVALID_PRICE", () => {
    const sdkErr = new ContractRevertError({
      errorName: "OrderAlreadyExpired",
      reason: "OrderAlreadyExpired",
    });
    const result = mapSdkError(sdkErr, "placeLimitOrder");

    assert.equal(result.code, PulseErrorCode.INVALID_PRICE);
  });

  it("maps OrderExpiryBeyondMarket to INVALID_PRICE", () => {
    const sdkErr = new ContractRevertError({
      errorName: "OrderExpiryBeyondMarket",
      reason: "OrderExpiryBeyondMarket",
    });
    const result = mapSdkError(sdkErr, "placeLimitOrder");

    assert.equal(result.code, PulseErrorCode.INVALID_PRICE);
  });

  it("maps ExpiredOrderMustBeCancelled to INVALID_PRICE", () => {
    const sdkErr = new ContractRevertError({
      errorName: "ExpiredOrderMustBeCancelled",
      reason: "ExpiredOrderMustBeCancelled",
    });
    const result = mapSdkError(sdkErr, "placeLimitOrder");

    assert.equal(result.code, PulseErrorCode.INVALID_PRICE);
  });

  it("maps unknown errorName to UNKNOWN", () => {
    const sdkErr = new ContractRevertError({
      errorName: "SomeFutureError",
      reason: "SomeFutureError",
    });
    const result = mapSdkError(sdkErr, "test");

    assert.equal(result.code, PulseErrorCode.UNKNOWN);
    assert.ok(result.message.includes("SomeFutureError"));
  });

  it("maps ContractRevertError without errorName to UNKNOWN", () => {
    const sdkErr = new ContractRevertError({
      reason: "bare revert",
    });
    const result = mapSdkError(sdkErr, "test");

    assert.equal(result.code, PulseErrorCode.UNKNOWN);
    assert.ok(result.message.includes("bare revert"));
  });
});
