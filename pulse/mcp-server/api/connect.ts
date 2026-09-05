/**
 * Vercel function: /connect — the Pulse-hosted address entry page + token
 * issuance (GET form, POST issue). Tokens are HMAC-signed so any serverless
 * instance can verify them.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

import { vercelSetup } from "./_shared.js";

/**
 * The /connect endpoint is called cross-origin from the Pulse frontend
 * (the /connect-agent page), so it must answer CORS preflights and include
 * CORS headers on every response. This endpoint only issues public-address
 * tokens (no secrets, no cookies), so a wildcard origin is safe here.
 */
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
};

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(name, value);
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const { handlers } = vercelSetup();
    if (req.method === "GET") {
      handlers.handleConnectForm(req, res);
      return;
    }
    if (req.method === "POST") {
      await handlers.handleConnectIssue(req, res);
      return;
    }
    res.writeHead(405, { "Content-Type": "application/json", Allow: "GET, POST" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err instanceof Error ? err.message : err) }));
    } else {
      res.end();
    }
  }
}