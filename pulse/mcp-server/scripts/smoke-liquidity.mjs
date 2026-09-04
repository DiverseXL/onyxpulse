// Probe: find a live market with a real order book, then exercise draft error paths.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const [baseUrl, walletAddress] = process.argv.slice(2);
const connectRes = await fetch(`${baseUrl}/connect`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify({ address: walletAddress }),
});
const { token } = await connectRes.json();

const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
const client = new Client({ name: "pulse-smoke2", version: "1.0.0" });
await client.connect(transport);

const marketsRes = await client.callTool({ name: "list_live_markets", arguments: {} });
const markets = JSON.parse(marketsRes.content[0].text);

// Find a market whose book has at least one bid or ask.
let withBook = null;
for (const m of markets) {
  try {
    const bookRes = await client.callTool({ name: "get_order_book", arguments: { marketId: m.id } });
    const book = JSON.parse(bookRes.content[0].text);
    if (book.bids.length > 0 || book.asks.length > 0) {
      withBook = { market: m, book };
      break;
    }
  } catch {}
}
if (withBook) {
  console.log(`liquid market: ${withBook.market.question}`);
  console.log(`  id: ${withBook.market.id}`);
  console.log(`  bestBid=${withBook.book.bestBid} bestAsk=${withBook.book.bestAsk} (${withBook.book.bids.length} bids / ${withBook.book.asks.length} asks)`);
  console.log(`  top bid level: ${JSON.stringify(withBook.book.bids[0])}`);
} else {
  console.log("no live market currently has order-book depth");
}

// draft_trade_link error paths (should surface as isError results, never a URL).
async function expectToolError(name, args) {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content?.[0]?.text ?? "";
  if (r.isError && !text.includes("tradeDraftUrl")) {
    console.log(`✓ ${name} rejected: ${text.slice(0, 100)}`);
  } else {
    console.log(`⚠  ${name} did NOT reject:`, text.slice(0, 140));
  }
}
await expectToolError("draft_trade_link", { marketId: markets[0].id, side: "long", humanAmount: "25" });
await expectToolError("draft_trade_link", { marketId: markets[0].id, side: "yes", humanAmount: "0" });
// A bytes32-shaped id that cannot exist on the indexer (all-ones).
await expectToolError("draft_trade_link", { marketId: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", side: "yes", humanAmount: "25" });

// no-side draft on the first market
const draftNo = await client.callTool({
  name: "draft_trade_link",
  arguments: { marketId: markets[0].id, side: "no", humanAmount: "12.5" },
});
console.log("✓ draft (no side):", JSON.parse(draftNo.content[0].text).tradeDraftUrl);

await client.close();
console.log("LIQUIDITY + ERROR-PATH PROBE COMPLETE");
