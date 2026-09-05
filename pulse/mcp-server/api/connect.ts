/**
 * Vercel function: /connect — the Pulse-hosted address entry page + token
 * issuance (GET form, POST issue). Tokens are HMAC-signed so any serverless
 * instance can verify them.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

import { vercelSetup } from "./_shared.js";

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
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