/**
 * V1 address-based access tokens.
 *
 * A user visits the Pulse-hosted `/connect` page, enters their PUBLIC wallet
 * address, and receives a unique bearer token bound to that address. The token
 * is what MCP clients send as `Authorization: Bearer <token>` so portfolio
 * tools know which address to query.
 *
 * HONEST LIMITATIONS (documented in README.md):
 * - The token proves the holder *knows the address*, not that they own the
 *   wallet. This is acceptable ONLY because every tool is read-only or
 *   draft-only: portfolio data is public chain data, and draft_trade_link
 *   never executes anything. A future OAuth 2.1 flow (per the MCP
 *   authorization spec) should replace this before any non-public data or
 *   real execution is added.
 * - Tokens live in memory only: they are lost on restart, are not revocable
 *   across instances, and issuance has no rate limit yet.
 */

import { randomBytes } from "node:crypto";

export interface AuthTokenRecord {
  /** The opaque bearer token handed to the client. */
  token: string;
  /** Lowercased public wallet address the token is bound to. */
  address: string;
  /** Unix ms timestamp of issuance. */
  createdAt: number;
}

/**
 * What the request handlers need from an auth implementation.
 *
 * Two implementations exist:
 *  - `AuthStore` — in-memory token map (long-running hosts: Railway etc.).
 *  - `HmacTokenIssuer` — stateless signed tokens (serverless hosts: Vercel).
 */
export interface TokenIssuer {
  /** Issue a token bound to `address` (already normalized/checksummed). */
  issue(address: string): { address: string; token: string };
  /** Resolve a bearer token to its bound address, or null when unknown/expired/bad. */
  resolve(token: string): string | null;
}

export class AuthStore implements TokenIssuer {
  private readonly tokensByValue = new Map<string, AuthTokenRecord>();

  /** Create a new unique token bound to `address`. Alias of issue. */
  create(address: string): AuthTokenRecord {
    return this.issue(address);
  }

  /** TokenIssuer.issue — create a new unique token bound to `address`. */
  issue(address: string): AuthTokenRecord {
    const token = randomBytes(32).toString("hex");
    const record: AuthTokenRecord = {
      token,
      address: address.toLowerCase(),
      createdAt: Date.now(),
    };
    this.tokensByValue.set(token, record);
    return record;
  }

  /** Resolve a bearer token to its bound address (TokenIssuer.resolve). */
  resolve(token: string): string | null {
    return this.lookup(token)?.address ?? null;
  }

  /** Resolve a bearer token to its record, or undefined when unknown. */
  lookup(token: string): AuthTokenRecord | undefined {
    return this.tokensByValue.get(token);
  }

  /** Revoke a token. Returns true when a token was actually removed. */
  revoke(token: string): boolean {
    return this.tokensByValue.delete(token);
  }

  get size(): number {
    return this.tokensByValue.size;
  }
}
