/**
 * Vercel function: /mcp — the MCP Streamable HTTP endpoint.
 *
 * Runs stateless (one transport + McpServer per request, JSON responses, no
 * SSE streams) because serverless instances share no memory. Auth is the V1
 * bearer token gate resolved from the HMAC-signed token store.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

import { vercelSetup } from "./_shared.ts";

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const { handlers } = vercelSetup();
    await handlers.handleMcp(req, res);
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err instanceof Error ? err.message : err) }));
    } else {
      res.end();
    }
  }
}