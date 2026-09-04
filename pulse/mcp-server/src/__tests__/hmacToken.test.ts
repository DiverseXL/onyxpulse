import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { HmacTokenIssuer } from "../hmacToken.ts";

const ADDRESS = "0x1234567890AbcdEF1234567890aBcdef12345678";
const SECRET = "test-secret-that-is-long-enough-0123456789";

describe("HmacTokenIssuer", () => {
  it("issues a token that resolves back to the address", () => {
    const issuer = new HmacTokenIssuer({ secret: SECRET, ttlMs: 60_000 });
    const { token } = issuer.issue(ADDRESS);
    assert.equal(issuer.resolve(token), ADDRESS);
  });

  it("resolves on a FRESH instance with the same secret (serverless property)", () => {
    const issuerA = new HmacTokenIssuer({ secret: SECRET, ttlMs: 60_000 });
    const { token } = issuerA.issue(ADDRESS);
    // A different instance — no shared state — must still verify the token.
    const issuerB = new HmacTokenIssuer({ secret: SECRET, ttlMs: 60_000 });
    assert.equal(issuerB.resolve(token), ADDRESS);
  });

  it("rejects tampered tokens and garbage", () => {
    const issuer = new HmacTokenIssuer({ secret: SECRET, ttlMs: 60_000 });
    const { token } = issuer.issue(ADDRESS);
    assert.equal(issuer.resolve(token.slice(0, -1) + "x"), null);
    assert.equal(issuer.resolve("not-a-token"), null);
    assert.equal(issuer.resolve(""), null);
    assert.equal(issuer.resolve("payload.only"), null);
  });

  it("rejects tokens signed with a different secret", () => {
    const issuerA = new HmacTokenIssuer({ secret: SECRET, ttlMs: 60_000 });
    const issuerB = new HmacTokenIssuer({ secret: SECRET + "-other", ttlMs: 60_000 });
    const { token } = issuerA.issue(ADDRESS);
    assert.equal(issuerB.resolve(token), null);
  });

  it("rejects expired tokens", () => {
    const issuer = new HmacTokenIssuer({ secret: SECRET, ttlMs: 60_000 });
    const { token } = issuer.issue(ADDRESS);
    // Rewrite the payload's exp to the past — signature must still be valid,
    // so the ONLY reason to reject is expiry.
    const [payloadB64, sig] = token.split(".");
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    payload.exp = Date.now() - 1000;
    const forgedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const forgedSig = createHmac("sha256", SECRET).update(forgedPayload).digest("base64url");
    assert.equal(issuer.resolve(`${forgedPayload}.${forgedSig}`), null);
  });

  it("rejects a too-short secret at construction", () => {
    assert.throws(() => new HmacTokenIssuer({ secret: "short", ttlMs: 1000 }), /at least 16 characters/);
  });

  it("timing-safe compare paths do not throw on mismatched lengths", () => {
    const issuer = new HmacTokenIssuer({ secret: SECRET, ttlMs: 60_000 });
    assert.equal(issuer.resolve(`${"a".repeat(100)}.${"b".repeat(5)}`), null);
  });
});