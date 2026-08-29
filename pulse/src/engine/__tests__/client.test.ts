import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createPulseClient,
  createPulseMainnetClient,
  createTrader,
  requestDemoFunds,
} from "../client.ts";

describe("client module exports", () => {
  it("createPulseClient is a function", () => {
    assert.equal(typeof createPulseClient, "function");
  });

  it("createPulseMainnetClient is a function", () => {
    assert.equal(typeof createPulseMainnetClient, "function");
  });

  it("createTrader is a function", () => {
    assert.equal(typeof createTrader, "function");
  });

  it("requestDemoFunds is a function", () => {
    assert.equal(typeof requestDemoFunds, "function");
  });
});

describe("createPulseClient", () => {
  it("returns a client with the correct structure", () => {
    const pulse = createPulseClient();
    assert.ok(pulse.client);
    assert.ok(pulse.exchange);
    assert.equal(typeof pulse.client.listMarkets, "function");
    assert.equal(typeof pulse.client.createTrader, "function");
    assert.equal(typeof pulse.exchange.loadMarkets, "function");
    assert.equal(typeof pulse.exchange.createOrder, "function");
  });
});

describe("createTrader", () => {
  it("returns a trader with expected methods", () => {
    const pulse = createPulseClient();
    const trader = createTrader(pulse, "0x0000000000000000000000000000000000000000000000000000000000000001");
    assert.equal(typeof trader.placeOrder, "function");
    assert.equal(typeof trader.cancelOrder, "function");
    assert.equal(typeof trader.faucet, "function");
    assert.equal(typeof trader.redeem, "function");
  });
});
