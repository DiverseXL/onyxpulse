/**
 * Vercel function: / — endpoint info.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

import { vercelSetup } from "./_shared.ts";

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const { handlers } = vercelSetup();
    if (req.method === "GET") {
      handlers.handleInfo(res);
      return;
    }
    res.writeHead(405, { "Content-Type": "application/json", Allow: "GET" });
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