/**
 * Pulse MCP server entrypoint (long-running host only — Railway / Render /
 * Fly / a VPS).
 *
 * NOTE: this file is intentionally NOT named `index.ts` or `server.ts` and
 * `httpServer.ts` is intentionally NOT named `server.ts`: Vercel auto-detects
 * those filenames as a Node.js server entrypoint and routes every request to
 * it, which would shadow the serverless `api/*` functions. The Vercel
 * deployment uses ONLY `api/*.ts` (see vercel.json rewrites); this entrypoint
 * is for platforms that run `npm start` as a long-lived process.
 *
 * A hosted, remote MCP server (Streamable HTTP transport) for Pulse —
 * DreamDEX binary markets on the Somnia Shannon testnet. All tools are
 * read-only or draft-only; the server never holds a private key and can
 * never move funds.
 *
 * Deploy as a long-running Node process (Railway / Render / Fly / a VPS).
 * Node >= 22.6 is required (native TypeScript type stripping).
 */

import { readConfig } from "./config.ts";
import { createTokenIssuer, tokenModeLabel } from "./tokenIssuer.ts";
import { createHttpServer } from "./httpServer.ts";

const config = readConfig();
const tokens = createTokenIssuer(config);

const server = createHttpServer({ config, tokens });

server.listen(config.port, () => {
  const publicUrl = config.publicUrl ?? `http://localhost:${config.port}`;
  console.log(`[pulse-mcp] listening on ${config.port}`);
  console.log(`[pulse-mcp] MCP endpoint: ${publicUrl}/mcp (Streamable HTTP)`);
  console.log(`[pulse-mcp] Connect page: ${publicUrl}/connect`);
  console.log(`[pulse-mcp] transport: ${config.stateless ? "stateless" : "stateful-sessions"}`);
  console.log(`[pulse-mcp] tokens: ${tokenModeLabel(config)}`);
  console.log(`[pulse-mcp] trade-draft links point at Pulse app: ${config.pulseAppUrl}`);
});

function shutdown(signal: string): void {
  console.log(`[pulse-mcp] ${signal} received, shutting down`);
  server.close(() => process.exit(0));
  // Force-exit if connections linger.
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));