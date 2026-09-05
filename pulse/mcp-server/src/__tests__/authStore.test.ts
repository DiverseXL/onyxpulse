import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { AuthStore } from "../authStore.js";

describe("AuthStore", () => {
  it("issues unique tokens bound to lowercased addresses", () => {
    const store = new AuthStore();
    const a = store.create("0x1234567890aBcDef1234567890AbCdEf12345678");
    const b = store.create("0x1234567890aBcDef1234567890AbCdEf12345678");
    assert.notEqual(a.token, b.token);
    assert.equal(a.address, "0x1234567890abcdef1234567890abcdef12345678");
    assert.equal(store.lookup(a.token)?.address, a.address);
  });

  it("lookup returns undefined for unknown tokens", () => {
    const store = new AuthStore();
    assert.equal(store.lookup("nope"), undefined);
  });

  it("revoke removes a token", () => {
    const store = new AuthStore();
    const record = store.create("0x1234567890aBcDef1234567890AbCdEf12345678");
    assert.equal(store.size, 1);
    assert.equal(store.revoke(record.token), true);
    assert.equal(store.revoke(record.token), false);
    assert.equal(store.lookup(record.token), undefined);
    assert.equal(store.size, 0);
  });
});