/**
 * JSON-safe serialization helpers for MCP tool results.
 *
 * Engine outputs contain bigints (claimable amounts) and raw scaled integers
 * (balances, prices, volumes). These must be converted to plain strings/objects
 * before being embedded in JSON-RPC tool results.
 */

import type { BinaryMarket } from "../../src/engine/index.ts";
import type {
  OrderBookSnapshot,
  Portfolio,
  PortfolioPosition,
  SpotPrice,
  ClaimablePositionInfo,
} from "../../src/engine/index.ts";
import { fromBigintAmount } from "../../src/engine/index.ts";

/** Convert a raw scaled integer (bigint or decimal string) to human units. */
function humanUnits(raw: bigint | string, decimals: number): string {
  return fromBigintAmount(typeof raw === "string" ? BigInt(raw) : raw, decimals);
}

/** Derive a rough YES probability in cents from the market's last fill price. */
function lastPriceCents(market: BinaryMarket): string | null {
  if (market.lastPrice === null || market.lastPrice === undefined) return null;
  try {
    const raw = BigInt(market.lastPrice);
    const price = Number(fromBigintAmount(raw, market.quoteDecimals));
    if (!Number.isFinite(price)) return null;
    return (price * 100).toFixed(1);
  } catch {
    return null;
  }
}

/** A compact, LLM-friendly market summary. */
export function formatMarket(market: BinaryMarket): Record<string, unknown> {
  return {
    id: market.marketId ?? market.id,
    question: market.question,
    asset: market.asset,
    strike: market.strike,
    status: market.status,
    expiry: market.expiry,
    tradingStart: market.tradingStart,
    interval: market.interval ?? null,
    quoteDecimals: market.quoteDecimals,
    lastPriceCents: lastPriceCents(market),
    cumulativeQuoteVolume: humanUnits(market.cumulativeQuoteVolume, market.quoteDecimals),
    tradeCount: market.tradeCount,
    poolAddress: market.poolAddress,
    marketAddress: market.marketAddress,
  };
}

export function formatMarketsList(markets: BinaryMarket[]): Record<string, unknown>[] {
  return markets.map(formatMarket);
}

/** The order book is already human-readable — return it verbatim. */
export function formatOrderBook(book: OrderBookSnapshot): OrderBookSnapshot {
  return book;
}

export function formatSpotPrice(asset: string, spot: SpotPrice): Record<string, unknown> {
  return {
    asset,
    price: spot.price,
    timestamp: spot.timestamp,
  };
}

/** Format a single portfolio position with its market context. */
function formatPosition(position: PortfolioPosition): Record<string, unknown> {
  const decimals = position.market.quoteDecimals;
  return {
    marketId: position.market.id,
    question: position.market.question,
    asset: position.market.asset,
    status: position.market.status,
    expiry: position.market.expiry,
    outcome: position.outcomeIndex === 0 ? "YES" : "NO",
    balance: humanUnits(position.balance, decimals),
    // Raw too — some consumers prefer exact units.
    balanceRaw: position.balance,
    quoteDecimals: decimals,
  };
}

export function formatPortfolio(portfolio: Portfolio): Record<string, unknown> {
  return {
    account: portfolio.account,
    positions: portfolio.positions.map(formatPosition),
    openOrders: portfolio.openOrders.map((o) => ({
      id: o.id,
      orderId: o.orderId,
      side: o.side,
      price: humanUnits(o.price, o.market.quoteDecimals),
      quantityRemaining: humanUnits(o.quantityRemaining, o.market.quoteDecimals),
      marketId: o.market.id,
      question: o.market.question,
      status: o.market.status,
    })),
    trades: portfolio.trades.map((t) => ({
      id: t.id,
      side: t.side ?? null,
      asMaker: t.asMaker,
      fillPrice: humanUnits(t.fillPrice, t.market.quoteDecimals),
      quantity: humanUnits(t.quantity, t.market.quoteDecimals),
      timestamp: t.timestamp,
      txHash: t.txHash,
      marketId: t.market.marketAddress,
      asset: t.market.asset,
    })),
  };
}

export function formatPositions(positions: PortfolioPosition[]): Record<string, unknown>[] {
  return positions.map(formatPosition);
}

export function formatClaimables(items: ClaimablePositionInfo[]): Record<string, unknown>[] {
  return items.map((c) => ({
    marketId: c.marketId,
    pool: c.pool,
    outcome: c.outcomeIdx === 0 ? "YES" : "NO",
    amount: c.amount.toString(),
    estPayout: c.estPayout.toString(),
    status: c.status,
  }));
}