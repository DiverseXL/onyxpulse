# Pulse MCP Server (hosted)

A deployable, **hosted Model Context Protocol (MCP) server** for Pulse — DreamDEX
binary markets on the Somnia Shannon testnet. It uses the official
`@modelcontextprotocol/sdk` **Streamable HTTP** transport (`server/streamableHttp.js`),
the current standard for remote/hosted MCP servers.

> This is a hosted HTTP service (deployable to Railway / Render / Fly / a VPS),
> **not** a local stdio script.

## Security posture — read this first

This server is **read-only and draft-only by construction**:

- It **never holds a private key** and has **no delegated trading authority** —
  there is no bot wallet with trading permissions anywhere in this service.
- Every tool either reads public chain/indexer data or produces a *draft link*.
- `draft_trade_link` **never executes anything**. It validates the inputs
  (market exists, side valid, amount a positive decimal) and returns a real,
  clickable URL back to Pulse's own app, pre-filled with the requested side and
  amount. The user must open that link in their own connected browser wallet and
  confirm the trade themselves. The tool's response states this explicitly:
  *"This link opens Pulse with your trade pre-filled. You must review and
  confirm it yourself — nothing has been submitted."*

## Tools

| Tool | Wraps (engine) | Notes |
|---|---|---|
| `list_live_markets` | `getLiveBinaryMarkets` | Live binary markets with id/question/asset/strike/status/expiry |
| `get_market_details(marketId)` | `getMarketById` | Full market row |
| `get_order_book(marketId)` | `getOrderBookSnapshot` | YES-side book (bids/asks with prices + quantities) |
| `get_spot_price(asset)` | `getSpotPrice` | BTC/ETH on-chain EMA oracle spot |
| `get_my_portfolio()` | `getMyPortfolio` | Portfolio for the token-bound wallet address |
| `get_my_open_positions()` | `getMyOpenPositions` | Non-zero, unsettled positions for the token-bound address |
| `get_my_claimable_positions()` | `getMyRedeemablePositions` | Settled positions ready to redeem |
| `draft_trade_link(marketId, side, humanAmount)` | `getMarketById` + local validation | **Draft-only.** Returns a pre-filled trade URL for the user to confirm |

All portfolio tools resolve the wallet address from the caller's access token —
the user provides their own **public** address during the connection flow
(an address is public information, not a secret).

## Connection / auth flow (V1 — honest simplification)

1. A user opens the Pulse-hosted **`/connect`** page (served by this server),
   enters/confirms their **public wallet address**, and receives a unique opaque
   bearer token bound to that address.
2. That token is what Claude Desktop / another MCP client sends as
   `Authorization: Bearer <token>` on every request to `/mcp`.
3. The server validates the token on each request, resolves the bound address,
   and portfolio tools query that address.

**Explicit, documented V1 limitations (do not paper over these):**

- The token proves the holder *knows the address*, **not** that they own the
  wallet. This is acceptable **only** because every tool is read-only or
  draft-only: portfolio data is public chain data, and `draft_trade_link`
  never executes anything.
- This is **address-based auth, not a full OAuth 2.1 implementation** per the
  MCP authorization spec. A proper OAuth 2.1 / account-linking flow is a real
  future improvement — this server does not pretend otherwise. Clients that
  require server OAuth (e.g. some hosted connectors) will not work against V1;
  Claude Desktop with a custom `Authorization` header is the supported path.
- Tokens live **in memory only**: they are lost on restart, not revocable
  across instances, and issuance has no rate limit yet.
- No CORS headers: browser-origin MCP clients are not supported yet.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Health / endpoint info (JSON) |
| `GET` | `/connect` | Address entry form (HTML) |
| `POST` | `/connect` | Issue token for `{ "address": "0x…" }` (JSON or form) |
| `GET/POST/DELETE` | `/mcp` | MCP Streamable HTTP endpoint |

## Configuration (env vars)

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | Listen port (Railway injects `PORT`) |
| `PULSE_APP_URL` | `http://localhost:3000` | Pulse web app origin used to build `draft_trade_link` URLs |
| `PULSE_MCP_PUBLIC_URL` | request Host header | Public origin of THIS server (shown on /connect as the MCP URL) |
| `PULSE_MCP_SIGNING_SECRET` | unset | **Required on Vercel.** Stateless HMAC token secret so any serverless instance can verify tokens (generate: `openssl rand -hex 32`). Unset → in-memory token store (single long-running instance only) |
| `PULSE_MCP_TOKEN_TTL_MS` | 30 days | Lifetime of issued tokens |
| `PULSE_MCP_STATELESS` | unset | `1` disables sessions (one transport per request, JSON responses). Forced on Vercel |
| `PULSE_MCP_SESSION_IDLE_TTL_MS` | `1800000` | In-memory session idle timeout before the sweeper closes it (long-running hosts) |

## Running locally

```bash
cd pulse/mcp-server
npm install
npm start          # Node >= 22.6 (native TS type stripping)
```

Then:

- Get a token: `curl -X POST localhost:4000/connect -H 'Content-Type: application/json' -d '{"address":"0xYourPublicAddress"}'`
- MCP endpoint: `http://localhost:4000/mcp`
- Open `http://localhost:4000/connect` in a browser for the guided flow.

Tests + typecheck:

```bash
npm test          # node:test unit + integration (initialize/tools-list handshake, auth gate)
npm run typecheck # tsc --noEmit over the service
node scripts/smoke.mjs http://localhost:4000 0xYourPublicAddress   # live read tools + draft link
```

## Connecting Claude Desktop (or another header-capable MCP client)

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pulse": {
      "type": "http",
      "url": "https://your-deployment.example.com/mcp",
      "headers": {
        "Authorization": "Bearer <token-from-connect>"
      }
    }
  }
}
```

## Deployment

Two deployment surfaces exist, sharing one code path (`src/handlers.ts`):

### Option A — long-running Node host (Railway / Render / Fly / VPS)

Point the host at the `pulse/mcp-server` directory and run
`npm install && npm start`. Railway injects `PORT` automatically. Sessions are
stateful (in-memory, idle-swept) and tokens live in the in-memory store unless
`PULSE_MCP_SIGNING_SECRET` is set.

`npm start` runs this mode directly.

### Option B — Vercel (serverless)

Vercel cannot hold state between requests, so this mode differs in two honest
ways:

1. **Stateless MCP transport.** Each request gets a fresh transport + server
   with JSON responses (`sessionIdGenerator: undefined`,
   `enableJsonResponse: true`). No sessions, no SSE notification streams. This
   is fine for request/response tool calls; server-push notifications are not
   supported.
2. **HMAC-signed tokens.** An in-memory token store would randomly reject
   valid tokens across instances, so `PULSE_MCP_SIGNING_SECRET` is REQUIRED
   (set it, or `/mcp` and `/connect` return 503 with instructions). Tokens are
   self-contained `payload.signature` values verifiable by any instance.

Steps:
1. Create a Vercel project with **Root Directory** `pulse/mcp-server` and
   **Framework Preset: Other**.
2. `vercel.json` in that directory rewrites `/mcp → api/mcp`,
   `/connect → api/connect`, `/ → api/index` and raises the function budget to
   60s (indexer reads can take a few seconds).
3. Add env vars: `PULSE_MCP_SIGNING_SECRET` (required),
   `PULSE_APP_URL`, `PULSE_MCP_PUBLIC_URL`.
4. Deploy. Your MCP endpoint is `<project>.vercel.app/mcp`.

Local check for the exact Vercel code path:

```bash
PULSE_MCP_SIGNING_SECRET=$(openssl rand -hex 32) npm run serve:vercel
node scripts/smoke.mjs http://localhost:4790 0xYourPublicAddress
```

**Known Vercel tradeoffs (documented, not hidden):** serverless function
cold-starts add latency to the first call; the function-duration cap means a
very slow indexer day could time out; and clients that require SSE or
long-lived sessions (rather than JSON responses) will not connect. Claude
Desktop with an `Authorization` header over a stateless server is the intended
client for V1 on Vercel.

Set `PULSE_APP_URL` to the real Pulse web app origin in the deployed
environment so `draft_trade_link` returns URLs users can actually open.

## Architecture notes

- `src/handlers.ts` — ALL request handling lives here, shared by both hosts:
  `createRequestHandlers` returns the `/`, `/connect`, and `/mcp` handlers.
- `src/httpServer.ts` + `src/railway.ts` — long-running host only (`npm start`
  → Railway / Render / Fly / a VPS): `httpServer.ts` routes paths to the
  handlers and owns the stateful session map + idle sweeper; `railway.ts` is
  the entrypoint. Neither is named `index.ts`/`server.ts` because Vercel
  auto-detects those as a Node server entrypoint and would route every
  request to it, shadowing the serverless functions below.
- `api/*.ts` — Vercel serverless functions: thin adapters that call the same
  handlers in stateless mode. `vercel.json` rewrites clean `/mcp`, `/connect`,
  `/` paths onto them.
- **One `McpServer` + transport per session** (an SDK `McpServer` instance can
  connect to exactly one transport); sessions are reused via the
  `Mcp-Session-Id` header and swept after idle TTL. Stateless mode creates a
  fresh pair per request.
- `src/tools.ts` — the 8 tool definitions. Handlers import the existing
  read-only engine functions (`pulse/src/engine/index.ts`).
- `src/authStore.ts` — in-memory token store (long-running hosts).
- `src/hmacToken.ts` — stateless HMAC-signed tokens (serverless hosts);
  `src/tokenIssuer.ts` picks the implementation from config.
- `src/draft.ts` — pure `draft_trade_link` validation + URL construction
  (no network, unit-tested in isolation).
- `src/requestContext.ts` — per-request wallet address via `AsyncLocalStorage`.
- `src/address.ts` — public-address validation/normalization (viem checksum).
- `src/format.ts` — engine outputs → JSON-safe MCP tool results.
- `src/connectPage.ts` — the `/connect` HTML pages.
