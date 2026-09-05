/**
 * Request handlers shared by every deployment surface.
 *
 * Both the long-running Node http server (`httpServer.ts`, started by
 * `railway.ts`) and the Vercel serverless functions (`api/*.ts`) dispatch
 * through these — one code path, so behavior (auth gate, session semantics,
 * tool registration) cannot drift between hosts.
 *
 * Auth (V1): every /mcp request must carry `Authorization: Bearer <token>`
 * where the token came from POST /connect. Tokens bind a public wallet
 * address; portfolio tools query that address. This is a deliberate,
 * documented simplification of the MCP authorization spec — not full
 * OAuth 2.1.
 */

import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Address } from "viem";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import type { McpServerConfig } from "./config.ts";
import type { TokenIssuer } from "./authStore.ts";
import { normalizeAddress } from "./address.ts";
import { registerTools } from "./tools.ts";
import { mcpRequestContext } from "./requestContext.ts";
import { connectFormPage, connectResultPage } from "./connectPage.ts";

export const SERVER_NAME = "pulse";
export const SERVER_VERSION = "0.1.0";

export interface SessionStore {
  get(sessionId: string): SessionRecord | undefined;
  set(sessionId: string, record: SessionRecord): void;
  delete(sessionId: string): void;
}

export interface SessionRecord {
  /** Dedicated McpServer for this session — an McpServer connects to ONE transport. */
  server: McpServer;
  transport: StreamableHTTPServerTransport;
  lastActivity: number;
}

export interface RequestHandlersOptions {
  config: McpServerConfig;
  /** Token issuer/resolver — in-memory (AuthStore) or stateless (HmacTokenIssuer). */
  tokens: TokenIssuer;
  /** Session map for stateful mode. Omit (stateless) on serverless hosts. */
  sessions?: SessionStore;
}

export function createMcpServer(pulseAppUrl: string): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: { tools: {} },
      instructions:
        "Pulse MCP server (DreamDEX binary markets on the Somnia Shannon testnet). " +
        "All tools are READ-ONLY or DRAFT-ONLY: this server holds no private key and can never move funds. " +
        "For trades, use draft_trade_link — it returns a link you give to the user to open, review and confirm " +
        "in their own connected browser wallet. Portfolio tools read public chain data for the address bound to " +
        "the access token.",
    },
  );
  registerTools(server, pulseAppUrl);
  return server;
}

export interface PulseRequestHandlers {
  handleInfo(res: ServerResponse): void;
  handleConnectForm(req: IncomingMessage, res: ServerResponse): void;
  handleConnectIssue(req: IncomingMessage, res: ServerResponse): Promise<void>;
  handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void>;
}

export function createRequestHandlers(opts: RequestHandlersOptions): PulseRequestHandlers {
  const { config, tokens, sessions } = opts;
  const isStateful = !config.stateless && sessions !== undefined;

  async function createSession(sessionStore: SessionStore): Promise<SessionRecord> {
    let record: SessionRecord;
    const server = createMcpServer(config.pulseAppUrl);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessionStore.set(id, record);
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) sessionStore.delete(transport.sessionId);
    };
    record = { server, transport, lastActivity: Date.now() };
    // Must complete before the transport can route messages to the server.
    await server.connect(transport);
    return record;
  }

  // ─── / ─────────────────────────────────────────────────────────────────────

  function handleInfo(res: ServerResponse): void {
    const toolNames = [
      "list_live_markets",
      "get_market_details",
      "get_order_book",
      "get_spot_price",
      "get_my_portfolio",
      "get_my_open_positions",
      "get_my_claimable_positions",
      "draft_trade_link",
    ];
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        {
          name: SERVER_NAME,
          version: SERVER_VERSION,
          network: "Somnia Shannon testnet",
          mcpEndpoint: "/mcp (Streamable HTTP transport)",
          connect: "GET /connect — enter your public wallet address to get an access token",
          tools: toolNames,
          security:
            "Read-only + draft-only. No private key held; no execution. V1 auth is address-based (bearer token " +
            "bound to a public address), not full OAuth 2.1.",
        },
        null,
        2,
      ),
    );
  }

  // ─── /connect ──────────────────────────────────────────────────────────────

  function handleConnectForm(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(connectFormPage({ mcpUrl: mcpEndpointUrl(req, config) }));
  }

  async function handleConnectIssue(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let raw: string;
    try {
      raw = await readBody(req, 4 * 1024);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid request body" }));
      return;
    }

    let addressValue: unknown;
    const contentType = (req.headers["content-type"] ?? "").toLowerCase();
    if (contentType.includes("application/json")) {
      try {
        addressValue = (JSON.parse(raw) as { address?: unknown }).address;
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: 'Request body must be valid JSON: {"address": "0x…"}' }));
        return;
      }
    } else {
      const params = new URLSearchParams(raw);
      addressValue = params.get("address");
    }

    const validation = normalizeAddress(addressValue);
    if (!validation.ok) {
      const wantsJson = (req.headers.accept ?? "").includes("application/json");
      if (wantsJson) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: validation.error }));
        return;
      }
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      res.end(connectFormPage({ mcpUrl: mcpEndpointUrl(req, config), error: validation.error }));
      return;
    }

    const issued = tokens.issue(validation.address);
    const mcpUrl = mcpEndpointUrl(req, config);

    if ((req.headers.accept ?? "").includes("application/json")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          address: issued.address,
          token: issued.token,
          mcpUrl,
          note: "V1 address-based token. Read-only + draft-only server. Not full OAuth 2.1 yet.",
        }),
      );
      return;
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(connectResultPage({ mcpUrl, address: issued.address, token: issued.token }));
  }

  // ─── /mcp ──────────────────────────────────────────────────────────────────

  async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // V1 auth gate: every request needs a valid bearer token.
    const address = authenticate(req, tokens);
    if (!address) {
      res.writeHead(401, {
        "Content-Type": "application/json",
        "WWW-Authenticate": 'Bearer realm="pulse-mcp"',
      });
      res.end(
        JSON.stringify({
          error: "Unauthorized",
          hint: "Send Authorization: Bearer <token>. Get a token from " + mcpEndpointUrl(req, config).replace(/\/mcp$/, "/connect"),
        }),
      );
      return;
    }

    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (req.method === "DELETE") {
      const record = sessionId && sessions ? sessions.get(sessionId) : undefined;
      if (record && sessionId && sessions) {
        sessions.delete(sessionId);
        await record.transport.close().catch(() => undefined);
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method !== "GET" && req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json", Allow: "GET, POST, DELETE" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }

    if (!isStateful) {
      // Serverless-friendly: one transport AND one McpServer per request
      // (an McpServer instance can connect to only a single transport).
      // No session id is issued (sessionIdGenerator: undefined) and responses
      // come back as JSON — SSE streams are not used.
      const server = createMcpServer(config.pulseAppUrl);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await server.connect(transport);
      await mcpRequestContext.run({ address }, () => transport.handleRequest(req, res));
      return;
    }

    const sessionStore = sessions as SessionStore;

    if (sessionId && sessionStore.get(sessionId)) {
      // Reuse the session's own server + transport.
      const record = sessionStore.get(sessionId)!;
      record.lastActivity = Date.now();
      await mcpRequestContext.run({ address }, () => record.transport.handleRequest(req, res));
      return;
    }

    if (sessionId) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Session not found",
          hint: "Restart the MCP client to create a new session.",
        }),
      );
      return;
    }

    if (req.method === "GET") {
      // Standalone GET (SSE) requires an established session.
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing Mcp-Session-Id header" }));
      return;
    }

    // New session: initialize the transport + its own McpServer. If the body
    // is not an initialize request the transport rejects it via validateSession.
    const record = await createSession(sessionStore);
    await mcpRequestContext.run({ address }, () => record.transport.handleRequest(req, res));
  }

  return { handleInfo, handleConnectForm, handleConnectIssue, handleMcp };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function authenticate(req: IncomingMessage, tokens: TokenIssuer): Address | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const address = tokens.resolve(match[1].trim());
  return address ? (address as Address) : null;
}

/**
 * The public /mcp URL to show clients. Prefers PULSE_MCP_PUBLIC_URL; falls
 * back to the request's Host header (works behind Railway/Vercel proxies);
 * final fallback is the configured app URL.
 */
export function mcpEndpointUrl(req: IncomingMessage, config: McpServerConfig): string {
  if (config.publicUrl) return config.publicUrl.replace(/\/+$/, "") + "/mcp";
  const host = req.headers.host;
  if (host) return `http://${host}/mcp`;
  return config.pulseAppUrl.replace(/\/+$/, "") + "/mcp";
}

export function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}