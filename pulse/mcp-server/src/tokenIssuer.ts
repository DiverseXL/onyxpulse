/**
 * Token-issuer factory.
 *
 * Long-running hosts (Railway) can use the in-memory `AuthStore`.
 * Serverless hosts (Vercel) MUST use the stateless `HmacTokenIssuer` —
 * instances do not share memory, so each request may land on a different
 * instance and tokens must verify without a shared store.
 */

import type { McpServerConfig } from "./config.ts";
import { AuthStore } from "./authStore.ts";
import type { TokenIssuer } from "./authStore.ts";
import { HmacTokenIssuer } from "./hmacToken.ts";

export function createTokenIssuer(config: McpServerConfig): TokenIssuer {
  if (config.signingSecret) {
    return new HmacTokenIssuer({ secret: config.signingSecret, ttlMs: config.tokenTtlMs });
  }
  return new AuthStore();
}

/** Describe which token mode is active (for logs and /info). */
export function tokenModeLabel(config: McpServerConfig): string {
  return config.signingSecret ? "hmac-signed (stateless, serverless-safe)" : "in-memory (single instance)";
}