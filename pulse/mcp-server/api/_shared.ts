/**
 * Shared setup for the Vercel serverless functions.
 *
 * Files starting with `_` are not routed by Vercel, so this is import-only.
 *
 * Vercel is serverless: no shared memory between instances. Therefore:
 *  - The MCP transport runs STATELESS (no sessions, JSON responses).
 *  - Tokens MUST be HMAC-signed (PULSE_MCP_SIGNING_SECRET) so any instance
 *    can verify a token issued by any other instance. An in-memory store
 *    would randomly reject valid tokens on cold-start / instance switches.
 */

import { readConfig } from "../src/config.js";
import type { McpServerConfig } from "../src/config.js";
import { createRequestHandlers } from "../src/handlers.js";
import type { PulseRequestHandlers } from "../src/handlers.js";
import { HmacTokenIssuer } from "../src/hmacToken.js";
import { TokenIssuerError } from "../src/serverlessErrors.js";

export function vercelSetup(): { config: McpServerConfig; handlers: PulseRequestHandlers } {
  const config = readConfig();

  if (!config.signingSecret) {
    throw new TokenIssuerError(
      "PULSE_MCP_SIGNING_SECRET is not configured. On Vercel (serverless) tokens must be " +
        "HMAC-signed so every instance can verify them. Set PULSE_MCP_SIGNING_SECRET " +
        "(e.g. `openssl rand -hex 32`) in the project's environment variables.",
    );
  }

  const tokens = new HmacTokenIssuer({ secret: config.signingSecret, ttlMs: config.tokenTtlMs });
  // No session store passed → handlers run stateless (fresh transport per request).
  const handlers = createRequestHandlers({ config, tokens });
  return { config, handlers };
}