/**
 * Tool definitions for the Pulse MCP server.
 *
 * Every tool is READ-ONLY or DRAFT-ONLY. This server holds no private key and
 * can never move funds:
 *   - Market/price tools read public chain + indexer data.
 *   - Portfolio tools read public chain data for the address bound to the
 *     caller's access token (the user provides their own public address during
 *     the /connect flow — no secret involved).
 *   - `draft_trade_link` validates inputs and returns a clickable URL back to
 *     Pulse's own app where the USER reviews and confirms the trade in their
 *     own connected browser wallet. Nothing is submitted by this server.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SomniaMarketsClient } from "@somnia-chain/markets-sdk";

import {
  createPulseClient,
  getLiveBinaryMarkets,
  getMarketById,
  getOrderBookSnapshot,
  getSpotPrice,
  getMyPortfolio,
  getMyOpenPositions,
  getMyRedeemablePositions,
} from "../../src/engine/index.ts";

import {
  formatMarket,
  formatMarketsList,
  formatOrderBook,
  formatSpotPrice,
  formatPortfolio,
  formatPositions,
  formatClaimables,
} from "./format.ts";
import { validateDraftTrade } from "./draft.ts";

/**
 * The bound address of the current request (resolved from the bearer token by
 * the HTTP layer). Read inside tool handlers via requireRequestAddress().
 */
import { requireRequestAddress } from "./requestContext.ts";

const ADDRESSED_TOOLS_NOTE =
  "Portfolio data comes from the public chain via the address bound to your access token.";

/** Compact JSON text for tool result content. */
function text(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}

export function registerTools(server: McpServer, pulseAppUrl: string): void {
  // ─── 1. list_live_markets ───────────────────────────────────────────────────
  server.tool(
    "list_live_markets",
    "List binary markets currently open for trading on Pulse (DreamDEX on the Somnia Shannon testnet). " +
      "Returns each market's id (the bytes32 marketId used by every other market-scoped tool), question, " +
      "asset, strike, status, expiry, and a rough YES price in cents.",
    async () => {
      const client = getEngineClient();
      const markets = await getLiveBinaryMarkets(client);
      return { content: [{ type: "text", text: text(formatMarketsList(markets)) }] };
    },
  );

  // ─── 2. get_market_details ──────────────────────────────────────────────────
  server.tool(
    "get_market_details",
    "Get full details for a single binary market by its bytes32 marketId (as returned by list_live_markets).",
    { marketId: z.string().describe("The market's bytes32 id (0x + 64 hex chars).") },
    async (args) => {
      const client = getEngineClient();
      const market = await getMarketById(client, args.marketId.trim());
      if (!market) {
        throw new Error(`No market found with id ${args.marketId}. It may not be live — use list_live_markets.`);
      }
      return { content: [{ type: "text", text: text(formatMarket(market)) }] };
    },
  );

  // ─── 3. get_order_book ──────────────────────────────────────────────────────
  server.tool(
    "get_order_book",
    "Get the current YES-side order book (bids + asks with prices and quantities) for a binary market.",
    { marketId: z.string().describe("The market's bytes32 id (0x + 64 hex chars).") },
    async (args) => {
      const client = getEngineClient();
      const market = await getMarketById(client, args.marketId.trim());
      if (!market) {
        throw new Error(`No market found with id ${args.marketId}. It may not be live — use list_live_markets.`);
      }
      const book = await getOrderBookSnapshot(client, market.poolAddress, market.quoteDecimals, 10);
      return { content: [{ type: "text", text: text(formatOrderBook(book)) }] };
    },
  );

  // ─── 4. get_spot_price ──────────────────────────────────────────────────────
  server.tool(
    "get_spot_price",
    "Get the current on-chain spot price of BTC or ETH from the EMA oracle price feed.",
    { asset: z.enum(["BTC", "ETH"]).describe("Asset symbol.") },
    async (args) => {
      const client = getEngineClient();
      const spot = await getSpotPrice(client, args.asset);
      if (!spot) {
        throw new Error(`No spot observations yet for ${args.asset} — the oracle may have no ticks.`);
      }
      return { content: [{ type: "text", text: text(formatSpotPrice(args.asset, spot)) }] };
    },
  );

  // ─── 5. get_my_portfolio ────────────────────────────────────────────────────
  server.tool(
    "get_my_portfolio",
    `Fetch the full portfolio (positions, open orders, recent trades) for the wallet address bound to the access token. ${ADDRESSED_TOOLS_NOTE}`,
    async () => {
      const address = requireRequestAddress();
      const client = getEngineClient();
      const portfolio = await getMyPortfolio(client, address);
      return { content: [{ type: "text", text: text(formatPortfolio(portfolio)) }] };
    },
  );

  // ─── 6. get_my_open_positions ───────────────────────────────────────────────
  server.tool(
    "get_my_open_positions",
    `List the wallet's open (non-zero, unsettled) binary positions. ${ADDRESSED_TOOLS_NOTE}`,
    async () => {
      const address = requireRequestAddress();
      const client = getEngineClient();
      const positions = await getMyOpenPositions(client, address);
      return { content: [{ type: "text", text: text(formatPositions(positions)) }] };
    },
  );

  // ─── 7. get_my_claimable_positions ──────────────────────────────────────────
  server.tool(
    "get_my_claimable_positions",
    `List positions that have settled and are ready to redeem. ${ADDRESSED_TOOLS_NOTE}`,
    async () => {
      const address = requireRequestAddress();
      const client = getEngineClient();
      const claimables = await getMyRedeemablePositions(client, address);
      return { content: [{ type: "text", text: text(formatClaimables(claimables)) }] };
    },
  );

  // ─── 8. draft_trade_link — THE KEY TOOL (draft-only, zero execution) ────────
  server.tool(
    "draft_trade_link",
    "DRAFT-ONLY: validate a trade the user is thinking about and return a real, clickable Pulse URL with the " +
      "side and amount pre-filled. This tool NEVER executes anything — the user must open the returned link and " +
      "confirm the trade themselves in their own connected browser wallet.",
    {
      marketId: z.string().describe("The market's bytes32 id (0x + 64 hex chars), from list_live_markets."),
      side: z.string().describe('Outcome side: "yes" or "no".'),
      humanAmount: z.string().describe('Human-readable amount in test USDC, e.g. "25" or "12.5".'),
    },
    async (args) => {
      const client = getEngineClient();

      // Inputs must reference a real, live market before we build a draft link.
      const market = await getMarketById(client, args.marketId.trim());
      if (!market) {
        throw new Error(`No market found with id ${args.marketId}. It may not be live — use list_live_markets.`);
      }

      const draft = validateDraftTrade({
        marketId: args.marketId,
        side: args.side,
        humanAmount: args.humanAmount,
        appUrl: pulseAppUrl,
      });

      if (!draft.ok) {
        throw new Error(draft.error);
      }

      const payload = {
        ok: true,
        marketId: args.marketId.trim(),
        question: market.question,
        side: draft.side,
        amount: draft.amountText,
        tradeDraftUrl: draft.url,
        warning:
          "This link opens Pulse with your trade pre-filled. You must review and confirm it yourself — " +
          "nothing has been submitted.",
      };
      return { content: [{ type: "text", text: text(payload) }] };
    },
  );
}

// ─── Engine client (one lazy shared instance per process) ────────────────────

let sharedClient: SomniaMarketsClient | null = null;

function getEngineClient(): SomniaMarketsClient {
  if (!sharedClient) {
    sharedClient = createPulseClient().client;
  }
  return sharedClient;
}