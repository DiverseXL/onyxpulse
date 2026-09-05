import type { Address } from "viem";
import type {
  PlaceOrderResult,
  PlaceOrderParams,
  TxResult,
  SomniaMarketsClient,
  OpenOrder,
  BinaryMarket,
} from "@somnia-chain/markets-sdk";
import { ORDER_TYPE } from "@somnia-chain/markets-sdk";

import { toBigintAmount } from "./units.js";
import { assertMarketWritable } from "./statusGate.js";
import { computeDefaultExpiry } from "./orderbook.js";
import { mapSdkError } from "./errors.js";

/**
 * A Trader instance bound to a signing key.
 * Created via `client.createTrader({ privateKey, decimals })`.
 */
type Trader = {
  placeOrder(params: PlaceOrderParams): Promise<PlaceOrderResult>;
  cancelOrder(params: { pool: Address; orderId: bigint | string }): Promise<TxResult>;
};

/**
 * Place a market order (Immediate-or-Cancel) on a binary pool.
 *
 * Converts human-readable price and quantity to bigint via {@link toBigintAmount},
 * then sends via the SDK's `trader.placeOrder` with `ORDER_TYPE.MARKET`. The
 * SDK auto-approves the escrow token and awaits the transaction receipt — no
 * polling needed.
 *
 * @param trader - A Trader instance (from createTrader).
 * @param params.pool - The binary pool address.
 * @param params.side - BUY_YES, SELL_YES, BUY_NO, or SELL_NO.
 * @param params.humanPrice - Price in human units (e.g. "0.62" for 62% YES probability).
 * @param params.humanQuantity - Quantity in human units (e.g. "10" for 10 outcome tokens).
 * @param params.decimals - Token decimals (read from BinaryMarket.quoteDecimals at runtime).
 * @returns The confirmed transaction result with order id and fills.
 */
export async function placeMarketOrder(
  client: SomniaMarketsClient,
  trader: Trader,
  params: {
    pool: Address;
    side: "BUY_YES" | "SELL_YES" | "BUY_NO" | "SELL_NO";
    humanPrice: string;
    humanQuantity: string;
    decimals: number;
  },
): Promise<PlaceOrderResult> {
  const { pool, side, humanPrice, humanQuantity, decimals } = params;
  const ctx = `placeMarketOrder for pool ${pool} (side=${side})`;

  try {
    // On-chain status gate: verify the market is tradeable before sending.
    const market = await client.getMarketByPool(pool);
    if (market && "marketId" in market) {
      await assertMarketWritable(client, market.marketId, "Trading");
    }

    const price = toBigintAmount(humanPrice, decimals);
    const quantity = toBigintAmount(humanQuantity, decimals);

    return await trader.placeOrder({
      pool,
      side,
      price,
      quantity,
      orderType: ORDER_TYPE.MARKET,
    });
  } catch (error) {
    throw mapSdkError(error, ctx);
  }
}

/**
 * Place a limit order that rests on the book.
 *
 * Converts human-readable price and quantity to bigint via {@link toBigintAmount},
 * then sends via the SDK's `trader.placeOrder` with `ORDER_TYPE.LIMIT`. The order
 * rests until filled, cancelled, or expired.
 *
 * @param trader - A Trader instance (from createTrader).
 * @param params.pool - The binary pool address.
 * @param params.side - BUY_YES, SELL_YES, BUY_NO, or SELL_NO.
 * @param params.humanPrice - Limit price in human units (e.g. "0.62" for 62%).
 * @param params.humanQuantity - Quantity in human units.
 * @param params.decimals - Token decimals (read from BinaryMarket.quoteDecimals at runtime).
 * @returns The confirmed transaction result with order id and any immediate fills.
 */
export async function placeLimitOrder(
  client: SomniaMarketsClient,
  trader: Trader,
  params: {
    pool: Address;
    side: "BUY_YES" | "SELL_YES" | "BUY_NO" | "SELL_NO";
    humanPrice: string;
    humanQuantity: string;
    decimals: number;
    /**
     * Order expiry in nanoseconds. Defaults to computeDefaultExpiry(market)
     * (now + 60s) for a short-lived requote window. Pass explicit value to
     * override. The SDK's own default (pool market expiry) applies when this
     * is omitted AND computeDefaultExpiry is not called — but we always
     * provide an explicit value for limit orders to avoid stale resting.
     */
    expireTimestampNs?: bigint;
    /** The BinaryMarket row, required when expireTimestampNs is omitted so
     *  computeDefaultExpiry can derive a sensible default. */
    market?: BinaryMarket;
  },
): Promise<PlaceOrderResult> {
  const {
    pool,
    side,
    humanPrice,
    humanQuantity,
    decimals,
    expireTimestampNs,
    market,
  } = params;
  const ctx = `placeLimitOrder for pool ${pool} (side=${side}, price=${humanPrice})`;

  try {
    // On-chain status gate: verify the market is tradeable before sending.
    const onChainMarket = await client.getMarketByPool(pool);
    if (onChainMarket && "marketId" in onChainMarket) {
      await assertMarketWritable(client, onChainMarket.marketId, "Trading");
    }

    const price = toBigintAmount(humanPrice, decimals);
    const quantity = toBigintAmount(humanQuantity, decimals);

    // Compute expiry: explicit > derived from market > SDK default.
    const expiry =
      expireTimestampNs ??
      (market ? computeDefaultExpiry(market) : undefined);

    return await trader.placeOrder({
      pool,
      side,
      price,
      quantity,
      orderType: ORDER_TYPE.LIMIT,
      ...(expiry !== undefined ? { expireTimestampNs: expiry } : {}),
    });
  } catch (error) {
    throw mapSdkError(error, ctx);
  }
}

/**
 * Cancel a resting order on its pool.
 *
 * Works for both binary and spot pools. The SDK awaits the receipt — no polling.
 *
 * @param trader - A Trader instance (from createTrader).
 * @param pool - The pool address hosting the resting order.
 * @param orderId - The on-chain order id (decimal string or bigint).
 * @returns The confirmed cancellation receipt.
 */
export async function cancelOrder(
  trader: Trader,
  pool: Address,
  orderId: string,
): Promise<TxResult> {
  const ctx = `cancelOrder for pool ${pool} (orderId=${orderId})`;

  try {
    return await trader.cancelOrder({ pool, orderId });
  } catch (error) {
    throw mapSdkError(error, ctx);
  }
}

/**
 * Fetch a trader's currently-open orders via the indexer.
 *
 * Returns full `OpenOrder` rows with market context, prices, and remaining
 * quantities. For on-chain reads (fresher but only order ids), use the SDK's
 * `client.getOwnOpenOrdersOnchain(pool, owner)` directly.
 *
 * @param client - The SomniaMarketsClient (from createPulseClient).
 * @param traderAddress - The trader's wallet address.
 * @param opts - Optional: restrict to one pool, or set limit/offset.
 */
export async function getOpenOrdersForTrader(
  client: SomniaMarketsClient,
  traderAddress: Address,
  opts?: { pool?: string; limit?: number; offset?: number },
): Promise<OpenOrder[]> {
  const ctx = `getOpenOrdersForTrader for ${traderAddress}`;

  try {
    return await client.getOpenOrders(traderAddress, opts);
  } catch (error) {
    throw mapSdkError(error, ctx);
  }
}
