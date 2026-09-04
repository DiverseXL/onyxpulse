/**
 * Local stand-in for the Vercel deployment.
 *
 * Vercel routes /mcp → api/mcp.ts, /connect → api/connect.ts and / →
 * api/index.ts (see vercel.json). This harness applies the same routing to
 * the SAME api functions, so the code path exercised here is the code that
 * runs on Vercel — stateless transport + HMAC-signed tokens.
 *
 * Usage:
 *   PULSE_MCP_SIGNING_SECRET=$(openssl rand -hex 32) PORT=4790 \
 *     node --experimental-strip-types scripts/serve-vercel-mode.ts
 */

import http from "node:http";
import mcpFn from "../api/mcp.ts";
import connectFn from "../api/connect.ts";
import indexFn from "../api/index.ts";

const port = Number(process.env.PORT ?? 4790);

const server = http.createServer((req, res) => {
  const path = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`).pathname;
  const fn = path === "/mcp" ? mcpFn : path === "/connect" ? connectFn : path === "/" ? indexFn : null;

  if (!fn) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found", path }));
    return;
  }

  Promise.resolve(fn(req, res)).catch((err) => {
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(err instanceof Error ? err.message : err) }));
    } else {
      res.end();
    }
  });
});

server.listen(port, () => {
  console.log(`[vercel-mode] listening on ${port} (stateless + HMAC tokens)`);
});

process.on("SIGINT", () => server.close(() => process.exit(0)));
process.on("SIGTERM", () => server.close(() => process.exit(0)));