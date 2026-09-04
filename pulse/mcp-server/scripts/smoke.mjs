// Live smoke test against a running Pulse MCP server.
// Usage: node /tmp/pulse-mcp-smoke.mjs <baseUrl> <walletAddress>
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const [baseUrl, walletAddress] = process.argv.slice(2);
if (!baseUrl || !walletAddress) {
  console.error("usage: node pulse-mcp-smoke.mjs <baseUrl> <walletAddress>");
  process.exit(2);
}

// 1) Connect flow: POST /connect with a public wallet address → bearer token.
const connectRes = await fetch(`${baseUrl}/connect`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify({ address: walletAddress }),
});
const connectBody = await connectRes.json();
if (connectRes.status !== 200) {
  console.error("CONNECT FAILED", connectRes.status, connectBody);
  process.exit(1);
}
console.log("✓ /connect issued token for", connectBody.address);
console.log("  mcpUrl:", connectBody.mcpUrl);

const token = connectBody.token;

// 2) MCP handshake.
const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
const client = new Client({ name: "pulse-smoke", version: "1.0.0" });
await client.connect(transport);
console.log("✓ MCP initialize + session established");

const tools = await client.listTools();
console.log(`✓ tools/list → ${tools.tools.length} tools: ${tools.tools.map((t) => t.name).join(", ")}`);

// 3) list_live_markets — real indexer data.
const marketsRes = await client.callTool({ name: "list_live_markets", arguments: {} });
const markets = JSON.parse(marketsRes.content[0].text);
console.log(`✓ list_live_markets → ${markets.length} live markets`);
if (markets.length === 0) {
  console.log("  (no live markets right now — skipping market-scoped calls)");
} else {
  const first = markets[0];
  console.log("  sample:", first.question, "| id:", first.id.slice(0, 18) + "…", "| yes≈", first.lastPriceCents + "¢");

  // 4) get_market_details
  const detailsRes = await client.callTool({ name: "get_market_details", arguments: { marketId: first.id } });
  const details = JSON.parse(detailsRes.content[0].text);
  console.log(`✓ get_market_details → "${details.question}" status=${details.status}`);

  // 5) get_order_book
  const bookRes = await client.callTool({ name: "get_order_book", arguments: { marketId: first.id } });
  const book = JSON.parse(bookRes.content[0].text);
  console.log(`✓ get_order_book → bestBid=${book.bestBid} bestAsk=${book.bestAsk} (${book.bids.length} bids / ${book.asks.length} asks)`);

  // 6) draft_trade_link — the KEY tool: no execution, returns a real URL.
  const draftRes = await client.callTool({
    name: "draft_trade_link",
    arguments: { marketId: first.id, side: "yes", humanAmount: "25" },
  });
  const draft = JSON.parse(draftRes.content[0].text);
  console.log("✓ draft_trade_link →");
  console.log("  tradeDraftUrl:", draft.tradeDraftUrl);
  console.log("  warning:", draft.warning);
}

// 7) get_spot_price — real oracle feed.
try {
  const spotRes = await client.callTool({ name: "get_spot_price", arguments: { asset: "BTC" } });
  const spot = JSON.parse(spotRes.content[0].text);
  console.log(`✓ get_spot_price → BTC = ${spot.price} @ ts ${spot.timestamp}`);
} catch (e) {
  console.log("✗ get_spot_price:", e.message);
}

// 8) Portfolio tools against the connected address (public data — empty for a fresh address is fine).
try {
  const posRes = await client.callTool({ name: "get_my_open_positions", arguments: {} });
  const positions = JSON.parse(posRes.content[0].text);
  console.log(`✓ get_my_open_positions → ${positions.length} open positions for ${connectBody.address}`);
} catch (e) {
  console.log("✗ get_my_open_positions:", e.message);
}

await client.close();
console.log("SMOKE TEST COMPLETE");
