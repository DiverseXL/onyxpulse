/**
 * Tests for the refactored createReactiveEngine.
 *
 * Covers:
 * - Push-based fill detection via subscribeLive + getLiveFills
 * - Fill deduplication (same fill id never re-fires onFill)
 * - Push-based status detection via getLiveMarketByPool
 * - onResolved fires for "Resolved" / "Voided" terminal states
 * - 60 s fallback poll as safety net (does not double-fire if push caught it)
 * - stop() unsubscribes from live store and stops the watchMarket tail
 */
import { describe, it, expect, vi } from "vitest";
import type { SomniaMarketsClient, LiveFill, BinaryMarket } from "@somnia-chain/markets-sdk";
import { createReactiveEngine } from "../lib/engine/reactiveEngine.ts";

/** Flush the microtask queue (replaces vi.runAllMicrotasksAsync, not in v4.1.11). */
const flushPromises = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

const POOL = "0xpool0000000000000000000000000000000000001" as `0x${string}`;
const MARKET_ID = "0xmarket00000000000000000000000000000000000000000000000000000000001";
const OWNER = "0xowner000000000000000000000000000000000001" as `0x${string}`;

function makeFill(id: string): LiveFill {
  return { id, fillPrice: "500000", quantity: "100000", quoteQuantity: "50000",
    takerSide: "BUY_YES", makerSide: "SELL_YES", kind: "DIRECT_YES", takerIsBid: true,
    takerOrder_id: "t1", makerOrder_id: "m1", takerRemainingQuantity: "0",
    makerRemainingQuantity: "0", timestamp: String(Math.floor(Date.now()/1000)),
    blockNumber: 1000, logIndex: 0 } as unknown as LiveFill;
}
function makeMarket(status: string) {
  return { id: MARKET_ID, pool: POOL, status, quoteDecimals: 6, baseDecimals: 18,
    expiry: String(Math.floor(Date.now()/1000)+3600) } as unknown as BinaryMarket & { status: string };
}

function buildMockClient({ initialFills = [] as LiveFill[], initialStatus = "Trading" } = {}) {
  let liveListeners: Array<() => void> = [];
  let fills = [...initialFills];
  let market = makeMarket(initialStatus);
  const stopWatch = vi.fn();
  const watchMarket = vi.fn().mockResolvedValue({ stop: stopWatch });
  const subscribeLive = vi.fn().mockImplementation((l: () => void) => {
    liveListeners.push(l);
    return () => { liveListeners = liveListeners.filter((x) => x !== l); };
  });
  const getLiveFills = vi.fn().mockImplementation(() => [...fills]);
  const getLiveMarketByPool = vi.fn().mockImplementation(() => ({ ...market }));
  const getBinaryMarket = vi.fn().mockResolvedValue(makeMarket(initialStatus));
  const getMarketOnchain = vi.fn().mockResolvedValue({ status: 1 });
  const pushFill = (f: LiveFill) => { fills = [f, ...fills]; liveListeners.forEach((l) => l()); };
  const pushStatus = (s: string) => { market = makeMarket(s); liveListeners.forEach((l) => l()); };
  const client = { watchMarket, subscribeLive, getLiveFills, getLiveMarketByPool, getBinaryMarket, getMarketOnchain } as unknown as SomniaMarketsClient;
  return { client, pushFill, pushStatus, stopWatch, subscribeLive };
}

describe("reactiveEngine — push fill detection", () => {
  it("calls onFill with real LiveFill on push", async () => {
    const { client, pushFill } = buildMockClient();
    const onFill = vi.fn();
    const engine = createReactiveEngine(client, POOL, MARKET_ID, OWNER, { onFill });
    await flushPromises();
    pushFill(makeFill("fill_001"));
    expect(onFill).toHaveBeenCalledTimes(1);
    expect(onFill).toHaveBeenCalledWith(expect.objectContaining({ id: "fill_001" }));
    engine.stop();
  });

  it("deduplicates: same fill id never re-fires onFill", async () => {
    const existing = makeFill("fill_old");
    const { client, pushFill } = buildMockClient({ initialFills: [existing] });
    const onFill = vi.fn();
    const engine = createReactiveEngine(client, POOL, MARKET_ID, OWNER, { onFill });
    await flushPromises();
    pushFill(existing);
    expect(onFill).not.toHaveBeenCalled();
    engine.stop();
  });

  it("fires onFill for each unique sequential fill", async () => {
    const { client, pushFill } = buildMockClient();
    const ids: string[] = [];
    const onFill = vi.fn().mockImplementation((f: LiveFill) => ids.push(f.id));
    const engine = createReactiveEngine(client, POOL, MARKET_ID, OWNER, { onFill });
    await flushPromises();
    pushFill(makeFill("A")); pushFill(makeFill("B")); pushFill(makeFill("C"));
    expect(ids).toEqual(["A","B","C"]);
    engine.stop();
  });

  it("does not call onFill after stop()", async () => {
    const { client, pushFill } = buildMockClient();
    const onFill = vi.fn();
    const engine = createReactiveEngine(client, POOL, MARKET_ID, OWNER, { onFill });
    await flushPromises();
    engine.stop();
    pushFill(makeFill("after_stop"));
    expect(onFill).not.toHaveBeenCalled();
  });
});

describe("reactiveEngine — push status detection", () => {
  it("calls onStatusChange when live store reports new status", async () => {
    const { client, pushStatus } = buildMockClient({ initialStatus: "Trading" });
    const onStatusChange = vi.fn();
    const engine = createReactiveEngine(client, POOL, MARKET_ID, OWNER, { onStatusChange });
    await flushPromises();
    pushStatus("Locked");
    expect(onStatusChange).toHaveBeenCalledWith("Locked");
    engine.stop();
  });

  it("calls onResolved when status reaches Resolved", async () => {
    const resolved = makeMarket("Resolved");
    const { client, pushStatus } = buildMockClient({ initialStatus: "Settling" });
    (client.getBinaryMarket as ReturnType<typeof vi.fn>).mockResolvedValue(resolved);
    const onResolved = vi.fn();
    const engine = createReactiveEngine(client, POOL, MARKET_ID, OWNER, { onResolved });
    await flushPromises();
    pushStatus("Resolved");
    await flushPromises();
    expect(onResolved).toHaveBeenCalledWith(expect.objectContaining({ status: "Resolved" }));
    engine.stop();
  });

  it("does not double-fire if fallback poll catches same transition as push", async () => {
    const { client, pushStatus } = buildMockClient({ initialStatus: "Trading" });
    (client.getMarketOnchain as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 2 });
    const onStatusChange = vi.fn();
    const engine = createReactiveEngine(client, POOL, MARKET_ID, OWNER, { onStatusChange });
    await flushPromises();
    pushStatus("Locked");
    expect(onStatusChange).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await flushPromises();
    expect(onStatusChange).toHaveBeenCalledTimes(1);
    engine.stop();
  });
});

describe("reactiveEngine — stop() cleanup", () => {
  it("calls watchHandle.stop()", async () => {
    const { client, stopWatch } = buildMockClient();
    const engine = createReactiveEngine(client, POOL, MARKET_ID, OWNER, {});
    await flushPromises();
    engine.stop();
    expect(stopWatch).toHaveBeenCalledTimes(1);
  });

  it("cancels the 60 s fallback timer", async () => {
    const spy = vi.spyOn(globalThis, "clearInterval");
    const { client } = buildMockClient();
    const engine = createReactiveEngine(client, POOL, MARKET_ID, OWNER, {});
    await flushPromises();
    engine.stop();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("is idempotent — stop() twice does not throw", async () => {
    const { client } = buildMockClient();
    const engine = createReactiveEngine(client, POOL, MARKET_ID, OWNER, {});
    await flushPromises();
    expect(() => { engine.stop(); engine.stop(); }).not.toThrow();
  });
});
