/**
 * Integration test for the HTTP layer — no network calls are made (we only
 * exercise /, /connect, the auth gate, and the MCP initialize + tools/list
 * handshake, none of which hit the Somnia indexer).
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { readConfig } from "../config.js";
import { AuthStore } from "../authStore.js";
import { createHttpServer } from "../httpServer.js";

const VALID_ADDRESS = "0x1234567890AbcdEF1234567890aBcdef12345678";

let server: http.Server;
let baseUrl: string;
let authStore: AuthStore;

before(async () => {
  authStore = new AuthStore();
  const config = readConfig();
  config.port = 0;
  server = createHttpServer({ config, tokens: authStore });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

function postJson(path: string, body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; json: unknown }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${baseUrl}${path}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 0, json: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode ?? 0, json: data });
          }
        });
      },
    );
    req.on("error", reject);
    req.end(JSON.stringify(body));
  });
}

function get(path: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(`${baseUrl}${path}`, { headers }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
    });
    req.on("error", reject);
  });
}

describe("HTTP layer", () => {
  it("serves endpoint info at /", async () => {
    const res = await get("/");
    assert.equal(res.status, 200);
    const info = JSON.parse(res.body) as { name: string; tools: string[] };
    assert.equal(info.name, "pulse");
    assert.ok(info.tools.includes("draft_trade_link"));
    assert.equal(info.tools.length, 8);
  });

  it("serves the /connect form", async () => {
    const res = await get("/connect");
    assert.equal(res.status, 200);
    assert.ok(res.body.includes("Public wallet address"));
    assert.ok(res.body.includes("not"));
  });

  it("issues a token bound to the address via /connect", async () => {
    const res = await postJson("/connect", { address: VALID_ADDRESS });
    assert.equal(res.status, 200);
    const body = res.json as { ok: boolean; address: string; token: string; mcpUrl: string };
    assert.equal(body.ok, true);
    assert.equal(body.address, VALID_ADDRESS.toLowerCase());
    assert.ok(body.token.length >= 32);
    assert.ok(body.mcpUrl.endsWith("/mcp"));
    // Token must be resolvable in the store.
    assert.equal(authStore.lookup(body.token)?.address, VALID_ADDRESS.toLowerCase());
  });

  it("rejects a malformed address on /connect", async () => {
    const res = await postJson("/connect", { address: "0x123" });
    assert.equal(res.status, 400);
    assert.ok((res.json as { error: string }).error.includes("not a valid EVM wallet address"));
  });

  it("rejects /mcp without a token (401)", async () => {
    const res = await postJson("/mcp", { jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    assert.equal(res.status, 401);
    const body = res.json as { error: string };
    assert.equal(body.error, "Unauthorized");
  });

  it("rejects /mcp with an unknown token (401)", async () => {
    const res = await postJson("/mcp", { jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, {
      Authorization: "Bearer not-a-real-token",
    });
    assert.equal(res.status, 401);
  });

  it("completes the MCP initialize + tools/list handshake with a valid token", async () => {
    const record = authStore.create(VALID_ADDRESS);
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${record.token}` } },
    });
    const client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(transport);
    try {
      const tools = await client.listTools();
      const names = tools.tools.map((t) => t.name);
      assert.deepEqual(names, [
        "list_live_markets",
        "get_market_details",
        "get_order_book",
        "get_spot_price",
        "get_my_portfolio",
        "get_my_open_positions",
        "get_my_claimable_positions",
        "draft_trade_link",
      ]);
    } finally {
      await client.close();
    }
  });
});