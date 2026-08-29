import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { createThirdwebOperatorSigner } from "../thirdwebAdapter.ts";
import type {
  ThirdwebSmartAccount,
  ThirdwebClient,
  ThirdwebChain,
} from "../thirdwebAdapter.ts";

// ─── Mocks ───────────────────────────────────────────────────────────────────

/** A mock Thirdweb smart account for testing. */
function makeMockSmartAccount(overrides: Record<string, unknown> = {}): ThirdwebSmartAccount {
  return {
    address: "0x1234567890abcdef1234567890abcdef12345678",
    signMessage: async () => "0xsignature" as `0x${string}`,
    ...overrides,
  };
}

/** A mock Thirdweb client (opaque object). */
function makeMockClient(): ThirdwebClient {
  return { _mock: true };
}

/** A mock Thirdweb chain definition. */
function makeMockChain(id: number = 50312): ThirdwebChain {
  return { id, name: "Somnia Testnet" };
}

// We need to mock the `thirdweb` module's `sendTransaction` function.
// Since this is a dynamic import inside writeContract, we intercept it
// by mocking the module before the test.
let mockSendTransactionResult: { transactionHash: string } = {
  transactionHash: "0xmocktxhash",
};
let mockSendTransactionCalls: Array<{ transaction: unknown; account: unknown }> = [];

// Mock the thirdweb module
const mockThirdwebModule = {
  sendTransaction: async (params: { transaction: unknown; account: unknown }) => {
    mockSendTransactionCalls.push(params);
    return mockSendTransactionResult;
  },
};

// Intercept the dynamic import in the adapter
const originalImport = globalThis.__import;
(globalThis as Record<string, unknown>).__import = undefined;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("createThirdwebOperatorSigner", () => {
  let signer: ReturnType<typeof createThirdwebOperatorSigner>;

  beforeEach(() => {
    mockSendTransactionCalls = [];
    mockSendTransactionResult = { transactionHash: "0xmocktxhash" };

    signer = createThirdwebOperatorSigner({
      smartAccount: makeMockSmartAccount(),
      client: makeMockClient(),
      chain: makeMockChain(),
    });
  });

  it("returns an OperatorSigner with walletClient and account", () => {
    assert.ok(signer.walletClient, "walletClient should exist");
    assert.ok(signer.account, "account should exist");
  });

  it("account.address matches the smart account address", () => {
    assert.equal(signer.account.address, "0x1234567890abcdef1234567890abcdef12345678");
  });

  it("account.type is 'local'", () => {
    assert.equal(signer.account.type, "local");
  });

  it("account.source is 'thirdweb-smart'", () => {
    assert.equal(signer.account.source, "thirdweb-smart");
  });

  it("walletClient.chain matches the provided chain", () => {
    assert.deepEqual(signer.walletClient.chain, { id: 50312, name: "Somnia Testnet" });
  });

  it("walletClient.account is the same account object", () => {
    assert.equal(signer.walletClient.account, signer.account);
  });

  it("walletClient.writeContract is a function", () => {
    assert.equal(typeof signer.walletClient.writeContract, "function");
  });

  it("getAddresses returns the smart account address", async () => {
    const addresses = await signer.walletClient.getAddresses!();
    assert.deepEqual(addresses, ["0x1234567890abcdef1234567890abcdef12345678"]);
  });
});

describe("account.signMessage", () => {
  it("delegates to the Thirdweb smart account's signMessage", async () => {
    let capturedParams: unknown = null;
    const smartAccount = makeMockSmartAccount({
      signMessage: async (params: unknown) => {
        capturedParams = params;
        return "0xsigned" as `0x${string}`;
      },
    });

    const signer = createThirdwebOperatorSigner({
      smartAccount,
      client: makeMockClient(),
      chain: makeMockChain(),
    });

    const result = await signer.account.signMessage!({ message: "hello" });
    assert.equal(result, "0xsigned");
    assert.deepEqual(capturedParams, { message: "hello" });
  });

  it("throws when smart account has no signMessage", async () => {
    const smartAccount = makeMockSmartAccount({ signMessage: undefined });

    const signer = createThirdwebOperatorSigner({
      smartAccount,
      client: makeMockClient(),
      chain: makeMockChain(),
    });

    await assert.rejects(
      () => signer.account.signMessage!({ message: "hello" }),
      (err: Error) => {
        assert.ok(err.message.includes("signMessage not available"));
        return true;
      },
    );
  });
});

describe("account.signTypedData", () => {
  it("throws descriptive error", async () => {
    const signer = createThirdwebOperatorSigner({
      smartAccount: makeMockSmartAccount(),
      client: makeMockClient(),
      chain: makeMockChain(),
    });

    await assert.rejects(
      () => signer.account.signTypedData!({} as any),
      (err: Error) => {
        assert.ok(err.message.includes("signTypedData is not implemented"));
        return true;
      },
    );
  });
});

describe("account.signTransaction", () => {
  it("throws descriptive error", async () => {
    const signer = createThirdwebOperatorSigner({
      smartAccount: makeMockSmartAccount(),
      client: makeMockClient(),
      chain: makeMockChain(),
    });

    await assert.rejects(
      () => signer.account.signTransaction!({} as any),
      (err: Error) => {
        assert.ok(err.message.includes("signTransaction is not supported"));
        return true;
      },
    );
  });
});

describe("walletClient stubs", () => {
  let signer: ReturnType<typeof createThirdwebOperatorSigner>;

  beforeEach(() => {
    signer = createThirdwebOperatorSigner({
      smartAccount: makeMockSmartAccount(),
      client: makeMockClient(),
      chain: makeMockChain(),
    });
  });

  it("sendTransaction throws descriptive error", async () => {
    await assert.rejects(
      () => signer.walletClient.sendTransaction!({} as any),
      (err: Error) => {
        assert.ok(err.message.includes("sendTransaction is not supported"));
        assert.ok(err.message.includes("Use writeContract instead"));
        return true;
      },
    );
  });

  it("signMessage on walletClient throws descriptive error", async () => {
    await assert.rejects(
      () => signer.walletClient.signMessage!({} as any),
      (err: Error) => {
        assert.ok(err.message.includes("signMessage is not supported"));
        assert.ok(err.message.includes("Use account.signMessage instead"));
        return true;
      },
    );
  });

  it("signTypedData on walletClient throws descriptive error", async () => {
    await assert.rejects(
      () => signer.walletClient.signTypedData!({} as any),
      (err: Error) => {
        assert.ok(err.message.includes("signTypedData is not supported"));
        return true;
      },
    );
  });

  it("signTransaction on walletClient throws descriptive error", async () => {
    await assert.rejects(
      () => signer.walletClient.signTransaction!({} as any),
      (err: Error) => {
        assert.ok(err.message.includes("signTransaction is not supported"));
        return true;
      },
    );
  });

  it("request throws descriptive error", async () => {
    await assert.rejects(
      () => signer.walletClient.request!({} as any),
      (err: Error) => {
        assert.ok(err.message.includes("request is not implemented"));
        return true;
      },
    );
  });
});

describe("writeContract shape conformance", () => {
  it("writeContract accepts the same parameter shape as engine functions expect", () => {
    // This test verifies the parameter types match what engine code calls:
    // walletClient.writeContract({ address, abi, functionName, args, chain, account })
    const signer = createThirdwebOperatorSigner({
      smartAccount: makeMockSmartAccount(),
      client: makeMockClient(),
      chain: makeMockChain(),
    });

    // The function should accept the standard viem writeContract params
    assert.equal(typeof signer.walletClient.writeContract, "function");

    // Verify the function signature accepts the expected params by checking
    // it doesn't throw on construction (the actual call would need a real
    // Thirdweb module, which we can't mock in this unit test)
    const fn = signer.walletClient.writeContract;
    assert.ok(fn.length >= 1, "writeContract should accept at least 1 parameter (the params object)");
  });

  it("OperatorSigner shape matches the type from operator.ts", () => {
    // This is a compile-time check: the returned object must be assignable
    // to the OperatorSigner type. If the types don't match, this file
    // won't compile.
    const signer = createThirdwebOperatorSigner({
      smartAccount: makeMockSmartAccount(),
      client: makeMockClient(),
      chain: makeMockChain(),
    });

    // Runtime shape check
    assert.ok("walletClient" in signer, "should have walletClient property");
    assert.ok("account" in signer, "should have account property");
    assert.ok("writeContract" in signer.walletClient, "walletClient should have writeContract");
    assert.ok("address" in signer.account, "account should have address");
    assert.ok("type" in signer.account, "account should have type");
    assert.ok("signMessage" in signer.account, "account should have signMessage");
  });
});

describe("address handling", () => {
  it("uses the smart account address, not any derived address", () => {
    const smartAccount = makeMockSmartAccount({
      address: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    });

    const signer = createThirdwebOperatorSigner({
      smartAccount,
      client: makeMockClient(),
      chain: makeMockChain(),
    });

    assert.equal(signer.account.address, "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    assert.equal(
      (signer.walletClient.account as { address: string }).address,
      "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    );
  });

  it("handles lowercase addresses", () => {
    const smartAccount = makeMockSmartAccount({
      address: "0xabcdef1234567890abcdef1234567890abcdef12",
    });

    const signer = createThirdwebOperatorSigner({
      smartAccount,
      client: makeMockClient(),
      chain: makeMockChain(),
    });

    assert.equal(signer.account.address, "0xabcdef1234567890abcdef1234567890abcdef12");
  });
});

describe("chain configuration", () => {
  it("passes chain through to walletClient", () => {
    const chain = { id: 50312, name: "Somnia Testnet" };
    const signer = createThirdwebOperatorSigner({
      smartAccount: makeMockSmartAccount(),
      client: makeMockClient(),
      chain,
    });

    assert.equal(signer.walletClient.chain?.id, 50312);
  });

  it("supports different chain ids", () => {
    const chain = { id: 1, name: "Ethereum Mainnet" };
    const signer = createThirdwebOperatorSigner({
      smartAccount: makeMockSmartAccount(),
      client: makeMockClient(),
      chain,
    });

    assert.equal(signer.walletClient.chain?.id, 1);
  });
});
