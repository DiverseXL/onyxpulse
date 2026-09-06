import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createReactiveEngine } from "../reactiveEngine.ts";

const POOL = "0x0000000000000000000000000000000000000001" as any;
const OWNER = "0x0000000000000000000000000000000000000002" as any;
const MARKET_ID = `0x${"1".repeat(64)}`;

function fill(id: string) {
  return {
    id,
    market_id: MARKET_ID,
    pool: POOL,
    fillPrice: "500000",
    quantity: "100000",
    quoteQuantity: "50000",
    takerIsBid: true,
    timestamp: "1",
    blockNumber: "1",
    logIndex: 0,
  } as any;
}

function market(status: string) {
  return {
    marketType: "BINARY",
    marketAddress: "0x0000000000000000000000000000000000000003",
    poolAddress: POOL,
    status,
    id: MARKET_ID,
  } as any;
}

function mockClient() {
  let currentMarket = market("Trading");
  let fills: any[] = [];
  let listener: (() => void) | null = null;
  let onchainStatus = 1;
  let stopped = false;

  const client = {
    watchMarket: async () => ({ stop: () => { stopped = true; } }),
    subscribeLive: (next: () => void) => {
      listener = next;
      return () => { listener = null; };
    },
    getLiveFills: () => fills,
    getLiveMarketByPool: () => currentMarket,
    getMarketOnchain: async () => ({ status: onchainStatus }),
    getBinaryMarket: async () => currentMarket,
  };

  return {
    client: client as any,
    pushFill(next: any) {
      fills = [next, ...fills];
      listener?.();
    },
    pushStatus(status: string) {
      currentMarket = market(status);
      listener?.();
    },
    setOnchainStatus(status: number) {
      onchainStatus = status;
    },
    isStopped: () => stopped,
  };
}

describe("createReactiveEngine", () => {
  it("uses live fills rather than order-book snapshots", async () => {
    const mock = mockClient();
    const received: any[] = [];
    const engine = createReactiveEngine(mock.client, POOL, MARKET_ID, OWNER, {
      onFill: (value) => received.push(value),
    });
    await Promise.resolve();
    const next = fill("1_0");
    mock.pushFill(next);
    assert.deepEqual(received, [next]);
    engine.stop();
  });

  it("deduplicates fills and stops receiving push events after stop", async () => {
    const mock = mockClient();
    const received: any[] = [];
    const engine = createReactiveEngine(mock.client, POOL, MARKET_ID, OWNER, {
      onFill: (value) => received.push(value),
    });
    await Promise.resolve();
    const next = fill("1_0");
    mock.pushFill(next);
    mock.pushFill(next);
    engine.stop();
    mock.pushFill(fill("2_0"));
    assert.equal(received.length, 1);
  });

  it("detects status transitions from subscribeLive immediately", async () => {
    const mock = mockClient();
    const statuses: string[] = [];
    const engine = createReactiveEngine(mock.client, POOL, MARKET_ID, OWNER, {
      onStatusChange: (status) => statuses.push(status),
    });
    await Promise.resolve();
    mock.pushStatus("Locked");
    assert.deepEqual(statuses, ["Locked"]);
    engine.stop();
  });

  it("fires onResolved for terminal live status", async () => {
    const mock = mockClient();
    const resolved: any[] = [];
    const engine = createReactiveEngine(mock.client, POOL, MARKET_ID, OWNER, {
      onResolved: (value) => resolved.push(value),
    });
    await Promise.resolve();
    mock.pushStatus("Resolved");
    assert.equal(resolved.length, 1);
    engine.stop();
  });

  it("keeps only a 60-second fallback timer", async () => {
    const mock = mockClient();
    const originalSetInterval = globalThis.setInterval;
    let delay: number | undefined;
    globalThis.setInterval = ((callback: TimerHandler, timeout?: number) => {
      delay = timeout;
      return originalSetInterval(callback, timeout);
    }) as typeof setInterval;
    try {
      const engine = createReactiveEngine(mock.client, POOL, MARKET_ID, OWNER, {});
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.equal(delay, 60_000);
      engine.stop();
      assert.equal(mock.isStopped(), true);
    } finally {
      globalThis.setInterval = originalSetInterval;
    }
  });
});
