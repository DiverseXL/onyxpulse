import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  SELECTOR_PLACE_ORDER_FOR,
  SELECTOR_CANCEL_ORDER_FOR,
  grantOperatorPermissions,
  revokeOperatorPermissions,
  getOperatorPermissions,
  placeOrderAsOperator,
  cancelOrderAsOperator,
  enableSessionTrading,
  grantOperatorPermissionsForPool,
} from "../operator.ts";

import type { OperatorPermissions } from "../operator.ts";

// ─── Export shape tests ──────────────────────────────────────────────────────

describe("operator module exports", () => {
  it("SELECTOR_PLACE_ORDER_FOR is the correct selector", () => {
    assert.equal(SELECTOR_PLACE_ORDER_FOR, "0x80054449");
  });

  it("SELECTOR_CANCEL_ORDER_FOR is the correct selector", () => {
    assert.equal(SELECTOR_CANCEL_ORDER_FOR, "0xe37b444b");
  });

  it("grantOperatorPermissions is a function", () => {
    assert.equal(typeof grantOperatorPermissions, "function");
  });

  it("grantOperatorPermissionsForPool is a function", () => {
    assert.equal(typeof grantOperatorPermissionsForPool, "function");
  });

  it("revokeOperatorPermissions is a function", () => {
    assert.equal(typeof revokeOperatorPermissions, "function");
  });

  it("getOperatorPermissions is a function", () => {
    assert.equal(typeof getOperatorPermissions, "function");
  });

  it("placeOrderAsOperator is a function", () => {
    assert.equal(typeof placeOrderAsOperator, "function");
  });

  it("cancelOrderAsOperator is a function", () => {
    assert.equal(typeof cancelOrderAsOperator, "function");
  });

  it("enableSessionTrading is a function", () => {
    assert.equal(typeof enableSessionTrading, "function");
  });
});

// ─── grantOperatorPermissions tests ──────────────────────────────────────────

describe("grantOperatorPermissions", () => {
  it("passes correct selectors to trader.setOperatorApprovalGlobal", async () => {
    let capturedParams: Record<string, unknown> = {};
    const fakeTrader = {
      setOperatorApprovalGlobal: async (params: Record<string, unknown>) => {
        capturedParams = params;
        return { hash: "0xgrant", receipt: {} };
      },
      setOperatorApprovalForPool: async () => ({ hash: "0x", receipt: {} }),
    };

    const result = await grantOperatorPermissions(
      fakeTrader as any,
      "0x0000000000000000000000000000000000000042" as any,
      ["placeOrderFor", "cancelOrderFor"],
    );

    assert.equal(result.hash, "0xgrant");
    assert.equal(capturedParams.operator, "0x0000000000000000000000000000000000000042");
    assert.equal(capturedParams.approved, true);
    assert.deepEqual(capturedParams.selectors, [
      "0x80054449",
      "0xe37b444b",
    ]);
  });

  it("wraps errors with operator context", async () => {
    const failingTrader = {
      setOperatorApprovalGlobal: async () => {
        throw new Error("Unauthorized");
      },
      setOperatorApprovalForPool: async () => ({ hash: "0x", receipt: {} }),
    };

    await assert.rejects(
      () =>
        grantOperatorPermissions(
          failingTrader as any,
          "0x0000000000000000000000000000000000000099" as any,
          ["placeOrderFor"],
        ),
      (err: Error) => {
        assert.ok(err.message.includes("grantOperatorPermissions"));
        assert.ok(err.message.includes("0x0000000000000000000000000000000000000099"));
        assert.ok(err.message.includes("Unauthorized"));
        return true;
      },
    );
  });
});

// ─── revokeOperatorPermissions tests ─────────────────────────────────────────

describe("revokeOperatorPermissions", () => {
  it("revokes all known selectors with approved=false", async () => {
    let capturedParams: Record<string, unknown> = {};
    const fakeTrader = {
      setOperatorApprovalGlobal: async (params: Record<string, unknown>) => {
        capturedParams = params;
        return { hash: "0xrevoke", receipt: {} };
      },
      setOperatorApprovalForPool: async () => ({ hash: "0x", receipt: {} }),
    };

    const result = await revokeOperatorPermissions(
      fakeTrader as any,
      "0x0000000000000000000000000000000000000055" as any,
    );

    assert.equal(result.hash, "0xrevoke");
    assert.equal(capturedParams.approved, false);
    assert.ok(Array.isArray(capturedParams.selectors));
    assert.ok((capturedParams.selectors as string[]).includes("0x80054449"));
    assert.ok((capturedParams.selectors as string[]).includes("0xe37b444b"));
  });
});

// ─── getOperatorPermissions tests ────────────────────────────────────────────

describe("getOperatorPermissions", () => {
  it("reads all three grant levels", async () => {
    const fakeClient = {
      isGloballyApproved: async () => true,
      isApprovedForPool: async () => false,
      isOperatorAuthorized: async () => false,
    };

    const result = await getOperatorPermissions(
      fakeClient as any,
      "0x0000000000000000000000000000000000000001" as any,
      "0x0000000000000000000000000000000000000002" as any,
      "0x0000000000000000000000000000000000000003" as any,
    );

    assert.equal(result.globallyApproved, true);
    assert.equal(result.poolApproved, false);
    assert.equal(result.authorized, false);
  });

  it("defaults to placeOrderFor selector", async () => {
    let capturedSelector: string = "";
    const fakeClient = {
      isGloballyApproved: async (p: { selector: string }) => {
        capturedSelector = p.selector;
        return false;
      },
      isApprovedForPool: async () => false,
      isOperatorAuthorized: async () => false,
    };

    await getOperatorPermissions(
      fakeClient as any,
      "0x0000000000000000000000000000000000000001" as any,
      "0x0000000000000000000000000000000000000002" as any,
      "0x0000000000000000000000000000000000000003" as any,
    );

    assert.equal(capturedSelector, "0x80054449"); // PLACE_ORDER_FOR_SELECTOR
  });

  it("wraps errors with context", async () => {
    const failingClient = {
      isGloballyApproved: async () => {
        throw new Error("RPC timeout");
      },
      isApprovedForPool: async () => false,
      isOperatorAuthorized: async () => false,
    };

    await assert.rejects(
      () =>
        getOperatorPermissions(
          failingClient as any,
          "0x0000000000000000000000000000000000000001" as any,
          "0x0000000000000000000000000000000000000002" as any,
          "0x0000000000000000000000000000000000000003" as any,
        ),
      (err: Error) => {
        assert.ok(err.message.includes("getOperatorPermissions"));
        assert.ok(err.message.includes("RPC timeout"));
        return true;
      },
    );
  });
});

// ─── placeOrderAsOperator tests ──────────────────────────────────────────────

describe("placeOrderAsOperator", () => {
  it("throws when operator is NOT authorized", async () => {
    const fakeClient = {
      isGloballyApproved: async () => false,
      isApprovedForPool: async () => false,
      isOperatorAuthorized: async () => false,
      getViemClient: () => ({}),
    };

    await assert.rejects(
      () =>
        placeOrderAsOperator(
          fakeClient as any,
          {
            walletClient: { writeContract: async () => "0x", chain: {} },
            account: { address: "0x0000000000000000000000000000000000000001" },
          } as any,
          "0x00000000000000000000000000000000000000a1" as any,
          {
            pool: "0x0000000000000000000000000000000000000001" as any,
            side: "BUY_YES",
            price: 600000n,
            quantity: 1000000n,
          },
        ),
      (err: Error) => {
        assert.ok(err.message.includes("NOT authorized"));
        assert.ok(err.message.includes("grantOperatorPermissions"));
        return true;
      },
    );
  });

  it("throws with specific hint when pool-approved but gate denied", async () => {
    const fakeClient = {
      isGloballyApproved: async () => false,
      isApprovedForPool: async () => true,  // pool-level grant exists
      isOperatorAuthorized: async () => false, // but gate denies
      getViemClient: () => ({}),
    };

    await assert.rejects(
      () =>
        placeOrderAsOperator(
          fakeClient as any,
          {
            walletClient: { writeContract: async () => "0x", chain: {} },
            account: { address: "0x0000000000000000000000000000000000000001" },
          } as any,
          "0x00000000000000000000000000000000000000a1" as any,
          {
            pool: "0x0000000000000000000000000000000000000001" as any,
            side: "BUY_YES",
            price: 600000n,
            quantity: 1000000n,
          },
        ),
      (err: Error) => {
        assert.ok(err.message.includes("NOT authorized"));
        assert.ok(err.message.includes("per-pool grant"));
        return true;
      },
    );
  });

  it("proceeds when authorized and returns order result", async () => {
    let capturedArgs: unknown[] = [];
    const fakeClient = {
      isGloballyApproved: async () => true,
      isApprovedForPool: async () => false,
      isOperatorAuthorized: async () => true,
      getViemClient: () => ({
        waitForTransactionReceipt: async () => ({
          status: "success",
          logs: [
            {
              data: "0x" + "0".repeat(256),
              topics: ["0xorderplaced"],
            },
          ],
        }),
      }),
    };

    const fakeWalletClient = {
      chain: { id: 50312 },
      writeContract: async (params: { args: unknown[] }) => {
        capturedArgs = params.args;
        return "0xtxhash";
      },
    };

    const result = await placeOrderAsOperator(
      fakeClient as any,
      {
        walletClient: fakeWalletClient as any,
        account: { address: "0x0000000000000000000000000000000000000001" },
      } as any,
      "0x00000000000000000000000000000000000000a1" as any,
      {
        pool: "0x0000000000000000000000000000000000000001" as any,
        side: "BUY_YES",
        price: 600000n,
        quantity: 1000000n,
      },
    );

    assert.equal(result.hash, "0xtxhash");
    // Verify the owner address is the first arg
    assert.equal(capturedArgs[0], "0x00000000000000000000000000000000000000a1");
    // Verify isBid is true for BUY_YES
    assert.equal(capturedArgs[1], true);
    // Verify price and quantity
    assert.equal(capturedArgs[3], 600000n);
    assert.equal(capturedArgs[4], 1000000n);
  });

  it("wraps errors with pool/side context", async () => {
    const fakeClient = {
      isGloballyApproved: async () => {
        throw new Error("Network error");
      },
      isApprovedForPool: async () => false,
      isOperatorAuthorized: async () => false,
      getViemClient: () => ({}),
    };

    await assert.rejects(
      () =>
        placeOrderAsOperator(
          fakeClient as any,
          {
            walletClient: { writeContract: async () => "0x", chain: {} },
            account: { address: "0x0000000000000000000000000000000000000001" },
          } as any,
          "0x00000000000000000000000000000000000000a1" as any,
          {
            pool: "0x0000000000000000000000000000000000000099" as any,
            side: "SELL_NO",
            price: 400000n,
            quantity: 500000n,
          },
        ),
      (err: Error) => {
        assert.ok(err.message.includes("getOperatorPermissions"));
        assert.ok(err.message.includes("0x0000000000000000000000000000000000000099"));
        assert.ok(err.message.includes("Network error"));
        return true;
      },
    );
  });
});

// ─── cancelOrderAsOperator tests ─────────────────────────────────────────────

describe("cancelOrderAsOperator", () => {
  it("throws when operator is NOT authorized", async () => {
    const fakeClient = {
      isGloballyApproved: async () => false,
      isApprovedForPool: async () => false,
      isOperatorAuthorized: async () => false,
      getViemClient: () => ({}),
    };

    await assert.rejects(
      () =>
        cancelOrderAsOperator(
          fakeClient as any,
          {
            walletClient: { writeContract: async () => "0x", chain: {} },
            account: { address: "0x0000000000000000000000000000000000000001" },
          } as any,
          "0x00000000000000000000000000000000000000a1" as any,
          "0x0000000000000000000000000000000000000001" as any,
          "42",
        ),
      (err: Error) => {
        assert.ok(err.message.includes("NOT authorized"));
        assert.ok(err.message.includes("cancelOrderFor"));
        assert.ok(err.message.includes("grantOperatorPermissions"));
        return true;
      },
    );
  });

  it("throws with specific hint when pool-approved but gate denied", async () => {
    const fakeClient = {
      isGloballyApproved: async () => false,
      isApprovedForPool: async () => true,
      isOperatorAuthorized: async () => false,
      getViemClient: () => ({}),
    };

    await assert.rejects(
      () =>
        cancelOrderAsOperator(
          fakeClient as any,
          {
            walletClient: { writeContract: async () => "0x", chain: {} },
            account: { address: "0x0000000000000000000000000000000000000001" },
          } as any,
          "0x00000000000000000000000000000000000000a1" as any,
          "0x0000000000000000000000000000000000000001" as any,
          "42",
        ),
      (err: Error) => {
        assert.ok(err.message.includes("NOT authorized"));
        assert.ok(err.message.includes("per-pool grant"));
        return true;
      },
    );
  });

  it("proceeds when authorized and returns receipt", async () => {
    let capturedArgs: unknown[] = [];
    const fakeClient = {
      isGloballyApproved: async () => true,
      isApprovedForPool: async () => false,
      isOperatorAuthorized: async () => true,
      getViemClient: () => ({
        waitForTransactionReceipt: async () => ({
          status: "success",
          logs: [],
        }),
      }),
    };

    const fakeWalletClient = {
      chain: { id: 50312 },
      writeContract: async (params: { args: unknown[] }) => {
        capturedArgs = params.args;
        return "0xcanceltx";
      },
    };

    const result = await cancelOrderAsOperator(
      fakeClient as any,
      {
        walletClient: fakeWalletClient as any,
        account: { address: "0x0000000000000000000000000000000000000001" },
      } as any,
      "0x00000000000000000000000000000000000000a1" as any,
      "0x0000000000000000000000000000000000000001" as any,
      "42",
    );

    assert.equal(result.hash, "0xcanceltx");
    // Verify the owner address is the first arg
    assert.equal(capturedArgs[0], "0x00000000000000000000000000000000000000a1");
    // Verify the orderId is the second arg (as bigint)
    assert.equal(capturedArgs[1], 42n);
  });

  it("accepts bigint orderId", async () => {
    let capturedArgs: unknown[] = [];
    const fakeClient = {
      isGloballyApproved: async () => true,
      isApprovedForPool: async () => false,
      isOperatorAuthorized: async () => true,
      getViemClient: () => ({
        waitForTransactionReceipt: async () => ({
          status: "success",
          logs: [],
        }),
      }),
    };

    const fakeWalletClient = {
      chain: { id: 50312 },
      writeContract: async (params: { args: unknown[] }) => {
        capturedArgs = params.args;
        return "0xcanceltx2";
      },
    };

    const result = await cancelOrderAsOperator(
      fakeClient as any,
      {
        walletClient: fakeWalletClient as any,
        account: { address: "0x0000000000000000000000000000000000000001" },
      } as any,
      "0x00000000000000000000000000000000000000a1" as any,
      "0x0000000000000000000000000000000000000001" as any,
      999n,
    );

    assert.equal(result.hash, "0xcanceltx2");
    assert.equal(capturedArgs[1], 999n);
  });

  it("wraps errors with pool/owner/orderId context", async () => {
    const fakeClient = {
      isGloballyApproved: async () => {
        throw new Error("RPC timeout");
      },
      isApprovedForPool: async () => false,
      isOperatorAuthorized: async () => false,
      getViemClient: () => ({}),
    };

    await assert.rejects(
      () =>
        cancelOrderAsOperator(
          fakeClient as any,
          {
            walletClient: { writeContract: async () => "0x", chain: {} },
            account: { address: "0x0000000000000000000000000000000000000001" },
          } as any,
          "0x00000000000000000000000000000000000000a1" as any,
          "0x0000000000000000000000000000000000000099" as any,
          "77",
        ),
      (err: Error) => {
        assert.ok(err.message.includes("getOperatorPermissions"));
        assert.ok(err.message.includes("0x0000000000000000000000000000000000000099"));
        assert.ok(err.message.includes("RPC timeout"));
        return true;
      },
    );
  });
});

// ─── enableSessionTrading tests ──────────────────────────────────────────────

describe("enableSessionTrading", () => {
  it("grants both placeOrderFor and cancelOrderFor globally", async () => {
    let capturedParams: Record<string, unknown> = {};
    const fakeTrader = {
      setOperatorApprovalGlobal: async (params: Record<string, unknown>) => {
        capturedParams = params;
        return { hash: "0xenable", receipt: {} };
      },
      setOperatorApprovalForPool: async () => ({ hash: "0x", receipt: {} }),
    };

    const result = await enableSessionTrading(
      fakeTrader as any,
      "0x0000000000000000000000000000000000000042" as any,
    );

    assert.equal(result.hash, "0xenable");
    assert.equal(capturedParams.operator, "0x0000000000000000000000000000000000000042");
    assert.equal(capturedParams.approved, true);
    assert.deepEqual(capturedParams.selectors, [
      "0x80054449", // PLACE_ORDER_FOR_SELECTOR
      "0xe37b444b", // CANCEL_ORDER_FOR_SELECTOR
    ]);
  });

  it("wraps errors from grantOperatorPermissions", async () => {
    const failingTrader = {
      setOperatorApprovalGlobal: async () => {
        throw new Error("Unauthorized");
      },
      setOperatorApprovalForPool: async () => ({ hash: "0x", receipt: {} }),
    };

    await assert.rejects(
      () =>
        enableSessionTrading(
          failingTrader as any,
          "0x0000000000000000000000000000000000000099" as any,
        ),
      (err: Error) => {
        assert.ok(err.message.includes("grantOperatorPermissions"));
        assert.ok(err.message.includes("0x0000000000000000000000000000000000000099"));
        assert.ok(err.message.includes("Unauthorized"));
        return true;
      },
    );
  });

  it("uses per-pool grant when pool address is provided", async () => {
    let capturedParams: Record<string, unknown> = {};
    const fakeTrader = {
      setOperatorApprovalGlobal: async () => ({ hash: "0x", receipt: {} }),
      setOperatorApprovalForPool: async (params: Record<string, unknown>) => {
        capturedParams = params;
        return { hash: "0xpool-grant", receipt: {} };
      },
    };

    const result = await enableSessionTrading(
      fakeTrader as any,
      "0x0000000000000000000000000000000000000042" as any,
      "0x0000000000000000000000000000000000000099" as any,
    );

    assert.equal(result.hash, "0xpool-grant");
    assert.equal(capturedParams.pool, "0x0000000000000000000000000000000000000099");
    assert.equal(capturedParams.operator, "0x0000000000000000000000000000000000000042");
    assert.equal(capturedParams.approved, true);
    assert.deepEqual(capturedParams.selectors, [
      "0x80054449", // PLACE_ORDER_FOR_SELECTOR
      "0xe37b444b", // CANCEL_ORDER_FOR_SELECTOR
    ]);
  });
});

// ─── grantOperatorPermissionsForPool tests ───────────────────────────────────

describe("grantOperatorPermissionsForPool", () => {
  it("passes correct pool, operator, and selectors to setOperatorApprovalForPool", async () => {
    let capturedParams: Record<string, unknown> = {};
    const fakeTrader = {
      setOperatorApprovalForPool: async (params: Record<string, unknown>) => {
        capturedParams = params;
        return { hash: "0xpool-grant", receipt: {} };
      },
    };

    const result = await grantOperatorPermissionsForPool(
      fakeTrader as any,
      "0x0000000000000000000000000000000000000042" as any,
      "0x0000000000000000000000000000000000000099" as any,
      ["placeOrderFor", "cancelOrderFor"],
    );

    assert.equal(result.hash, "0xpool-grant");
    assert.equal(capturedParams.pool, "0x0000000000000000000000000000000000000099");
    assert.equal(capturedParams.operator, "0x0000000000000000000000000000000000000042");
    assert.equal(capturedParams.approved, true);
    assert.deepEqual(capturedParams.selectors, [
      "0x80054449", // PLACE_ORDER_FOR_SELECTOR
      "0xe37b444b", // CANCEL_ORDER_FOR_SELECTOR
    ]);
  });

  it("wraps errors with pool context", async () => {
    const failingTrader = {
      setOperatorApprovalForPool: async () => {
        throw new Error("Pool not registered");
      },
    };

    await assert.rejects(
      () =>
        grantOperatorPermissionsForPool(
          failingTrader as any,
          "0x0000000000000000000000000000000000000042" as any,
          "0x0000000000000000000000000000000000000099" as any,
          ["placeOrderFor"],
        ),
      (err: Error) => {
        assert.ok(err.message.includes("grantOperatorPermissionsForPool"));
        assert.ok(err.message.includes("0x0000000000000000000000000000000000000099"));
        assert.ok(err.message.includes("Pool not registered"));
        return true;
      },
    );
  });
});
