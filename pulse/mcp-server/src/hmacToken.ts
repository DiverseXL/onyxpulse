/**
 * Stateless HMAC-signed access tokens — the serverless variant of AuthStore.
 *
 * Serverless hosts (Vercel) do not share memory between instances, so an
 * in-memory token map cannot work: an instance that issued a token is not the
 * instance that verifies the next request. Instead, each token SELF-CONTAINS
 * its bound address and an expiry, signed with a server secret
 * (PULSE_MCP_SIGNING_SECRET). Any instance holding the secret can verify.
 *
 * V1 honest framing (unchanged): the token binds a PUBLIC wallet address —
 * proving knowledge of the address, not wallet ownership. Read-only +
 * draft-only tools keep that acceptable. Revocation is by expiry only.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type { TokenIssuer } from "./authStore.ts";

export interface HmacTokenOptions {
  secret: string;
  /** Token lifetime in ms. */
  ttlMs: number;
}

const PAYLOAD_SEPARATOR = ".";

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(secret: string, payloadB64: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

export class HmacTokenIssuer implements TokenIssuer {
  private readonly secret: string;
  private readonly ttlMs: number;

  constructor(opts: HmacTokenOptions) {
    if (!opts.secret || opts.secret.length < 16) {
      throw new Error("HmacTokenIssuer requires a PULSE_MCP_SIGNING_SECRET of at least 16 characters.");
    }
    this.secret = opts.secret;
    this.ttlMs = opts.ttlMs;
  }

  issue(address: string): { address: string; token: string } {
    const payload = {
      addr: address,
      iat: Date.now(),
      exp: Date.now() + this.ttlMs,
    };
    const payloadB64 = base64url(JSON.stringify(payload));
    const sig = sign(this.secret, payloadB64);
    return { address, token: `${payloadB64}${PAYLOAD_SEPARATOR}${sig}` };
  }

  /** Verify signature + expiry, returning the bound address or null. */
  resolve(token: string): string | null {
    const sepIdx = token.lastIndexOf(PAYLOAD_SEPARATOR);
    if (sepIdx <= 0) return null;
    const payloadB64 = token.slice(0, sepIdx);
    const sig = token.slice(sepIdx + 1);

    const expected = sign(this.secret, payloadB64);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    try {
      const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as {
        addr?: unknown;
        exp?: unknown;
      };
      if (typeof payload.addr !== "string" || typeof payload.exp !== "number") return null;
      if (Date.now() > payload.exp) return null;
      return payload.addr;
    } catch {
      return null;
    }
  }
}