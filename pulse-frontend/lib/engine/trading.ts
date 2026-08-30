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

import { toBigintAmount, getPoolBookParams, snapToTick, snapToLotSize } from "./units.ts";
import { assertMarketWritable } from "./statusGate.ts";
import { computeDefaultExpiry } from "./orderbook.ts";
import { mapSdkError, PulseEngineError, PulseErrorCode } from "./errors.ts";

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
    // FRESH on-chain re-fetch: read the pool's current market binding from the
    // indexer immediately before constructing the order. This ensures we don't
    // hold stale market data from page load (e.g. if the pool recycled to a new
    // market/window while the user was connecting wallet / getting faucet funds).
    const market = await client.getMarketByPool(pool);
    if (market && "marketId" in market) {
      // On-chain status gate: verify the market is tradeable at THIS block.
      // Uses getMarketOnchain (direct eth_call, not indexer) for freshness.
      await assertMarketWritable(client, market.marketId, "Trading");
    }

    // The SDK's trader.placeOrder → binaryOrderCall will also read
    // pool.marketExpiryNs() on-chain to compute the default order expiry,
    // so the expiry always reflects the pool's current state — not a stale
    // cached value. This is the contract-level defense against Hypothesis 2.

    // Snap price and quantity to the pool's on-chain grid before submission.
    // The SDK does NOT do this — it passes raw values to the contract,
    // which rejects off-grid orders with InvalidQuantity.
    const bookParams = await getPoolBookParams(client, pool);

    const price = snapToTick(
      toBigintAmount(humanPrice, decimals),
      bookParams.tickSize,
    );
    let quantity = snapToLotSize(
      toBigintAmount(humanQuantity, decimals),
      bookParams.lotSize,
    );

    // Enforce minimum order size: the pool rejects anything below minQuantity
    // (error: MinQuantityNotMet). If the snapped quantity is too small, bump
    // it up to one lot (the smallest valid order).
    if (quantity < bookParams.minQuantity) {
      quantity = bookParams.minQuantity;
    }

    // Final guard: if quantity is still zero after snapping, the order is
    // too small to place at all.
    if (quantity <= 0n) {
      throw new PulseEngineError(
        PulseErrorCode.INVALID_PRICE,
        ctx,
        `Quantity too small for this pool's minimum order size. ` +
          `Minimum: ${bookParams.minQuantity.toString()} raw units. ` +
          `Lot size: ${bookParams.lotSize.toString()}.`,
      );
    }

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
    // FRESH on-chain re-fetch: read the pool's current market binding from the
    // indexer immediately before constructing the order. This ensures we don't
    // hold stale market data from page load (e.g. if the pool recycled to a new
    // market/window while the user was connecting wallet / getting faucet funds).
    const onChainMarket = await client.getMarketByPool(pool);
    if (onChainMarket && "marketId" in onChainMarket) {
      // On-chain status gate: verify the market is tradeable at THIS block.
      await assertMarketWritable(client, onChainMarket.marketId, "Trading");
    }

    // Snap price and quantity to the pool's on-chain grid before submission.
    const bookParams = await getPoolBookParams(client, pool);

    const price = snapToTick(
      toBigintAmount(humanPrice, decimals),
      bookParams.tickSize,
    );
    let quantity = snapToLotSize(
      toBigintAmount(humanQuantity, decimals),
      bookParams.lotSize,
    );

    // Enforce minimum order size.
    if (quantity < bookParams.minQuantity) {
      quantity = bookParams.minQuantity;
    }

    if (quantity <= 0n) {
      throw new PulseEngineError(
        PulseErrorCode.INVALID_PRICE,
        ctx,
        `Quantity too small for this pool's minimum order size. ` +
          `Minimum: ${bookParams.minQuantity.toString()} raw units. ` +
          `Lot size: ${bookParams.lotSize.toString()}.`,
      );
    }

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
