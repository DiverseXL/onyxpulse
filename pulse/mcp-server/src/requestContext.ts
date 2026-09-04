/**
 * Per-request context for MCP tool handlers.
 *
 * The HTTP layer resolves the caller's `Authorization: Bearer <token>` to a
 * wallet address BEFORE dispatching each request into the transport, then runs
 * the transport under an AsyncLocalStorage context. Tool handlers read the
 * bound address from here — no global mutable state, and concurrent requests
 * never leak addresses into each other.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { Address } from "viem";

export interface RequestContext {
  /** Checksummed public wallet address bound to the caller's access token. */
  address: Address;
}

export const mcpRequestContext = new AsyncLocalStorage<RequestContext>();

/** Read the current request's bound address. Throws when absent (should never happen: the HTTP layer 401s unauthenticated requests). */
export function requireRequestAddress(): Address {
  const ctx = mcpRequestContext.getStore();
  if (!ctx?.address) {
    throw new Error("No wallet address bound to this request. Connect via the Pulse MCP /connect flow first.");
  }
  return ctx.address;
}