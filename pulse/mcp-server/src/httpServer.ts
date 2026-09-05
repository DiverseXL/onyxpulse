/**
 * Long-running Node http server for the Pulse MCP service.
 *
 * NOTE: deliberately NOT named `server.ts` — Vercel auto-detects `server.ts`
 * (root or src/) as a Node.js server entrypoint and would deploy this
 * long-running host instead of the serverless `api/*` functions.
 *
 * Suitable for Railway / Render / Fly / a VPS. Stateful MCP sessions are kept
 * in memory and swept after an idle TTL. Serverless hosts (Vercel) do NOT use
 * this module — they use the handlers in `handlers.ts` directly via `api/*`.
 *
 * Routes:
 *   GET  /          — health / endpoint info (JSON)
 *   GET  /connect   — address entry form (HTML)
 *   POST /connect   — issue an access token bound to a public wallet address
 *   GET/POST/DELETE /mcp — MCP Streamable HTTP endpoint
 */

import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { McpServerConfig } from "./config.ts";
import type { SessionRecord } from "./handlers.ts";
import { createRequestHandlers } from "./handlers.ts";
import type { TokenIssuer } from "./authStore.ts";

export interface McpHttpOptions {
  config: McpServerConfig;
  tokens: TokenIssuer;
}

export function createHttpServer(opts: McpHttpOptions): http.Server {
  const { config, tokens } = opts;
  // A Map satisfies the SessionStore interface (get/set/delete) and is iterable
  // for the idle sweeper.
  const sessions = new Map<string, SessionRecord>();
  const handlers = createRequestHandlers({ config, tokens, sessions });

  // Idle session sweeper — in-memory sessions must not accumulate forever.
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [sessionId, record] of sessions) {
      if (now - record.lastActivity > config.sessionIdleTtlMs) {
        record.transport.close().catch(() => undefined);
        sessions.delete(sessionId);
      }
    }
  }, 60_000);
  sweeper.unref();

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error", detail: String(err?.message ?? err) }));
      } else {
        res.end();
      }
    });
  });

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const path = url.pathname;

    if (path === "/" && req.method === "GET") return handlers.handleInfo(res);
    if (path === "/connect" && req.method === "GET") return handlers.handleConnectForm(req, res);
    if (path === "/connect" && req.method === "POST") return handlers.handleConnectIssue(req, res);
    if (path === "/mcp") return handlers.handleMcp(req, res);

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found", path, method: req.method }));
  }

  return server;
}