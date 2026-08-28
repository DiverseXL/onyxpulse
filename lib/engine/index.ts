/**
 * Pulse Engine — public API surface.
 *
 * This is the single import boundary for all frontend and service code.
 * Import everything from here; never import directly from:
 *   - `@somnia-chain/markets-sdk` (the raw SDK)
 *   - Individual engine files (`./client`, `./units`, `./markets`, etc.)
 *
 * Exception: `demo.ts` is intentionally NOT re-exported. It must be imported
 * explicitly by path (`import { ... } from "../engine/demo.ts"`) so it can
 * never accidentally ship in a production build. Tree-shaking alone is not a
 * guarantee — a misconfigured bundler or a serverless function that resolves
 * at runtime can still pull it in. Explicit path imports make the intent
 * visible and auditable.
 *
 * @example
 * ```ts
 * import {
 *   createPulseClient,
 *   createTrader,
 *   placeMarketOrder,
 *   toBigintAmount,
 *   getLiveBinaryMarkets,
 * } from "../engine/index.ts";
 * ```
 */

// ─── Errors ─────────────────────────────────────────────────────────────────

export {
  PulseErrorCode,
  PulseEngineError,
  mapSdkError,
} from "./errors.ts";

// ─── Client ──────────────────────────────────────────────────────────────────

export {
  type PulseClient,
  createPulseClient,
  createPulseMainnetClient,
  createTrader,
  requestDemoFunds,
} from "./client.ts";

// ─── Units ───────────────────────────────────────────────────────────────────

export {
  toBigintAmount,
  fromBigintAmount,
  snapToTick,
  getPoolTickSize,
} from "./units.ts";

// ─── Status Gate ─────────────────────────────────────────────────────────────

export {
  getOnChainMarketStatus,
  assertMarketWritable,
} from "./statusGate.ts";

// ─── Markets ─────────────────────────────────────────────────────────────────

export {
  type BinaryMarket,
  type BinaryMarketStatus,
  type Market,
  isBinaryMarket,
  getLiveBinaryMarkets,
  getUpcomingBinaryMarkets,
  getFinalizedBinaryMarkets,
  getMarketById,
} from "./markets.ts";

// ─── Trading ─────────────────────────────────────────────────────────────────

export {
  placeMarketOrder,
  placeLimitOrder,
  cancelOrder,
  getOpenOrdersForTrader,
} from "./trading.ts";

// ─── Settlement ──────────────────────────────────────────────────────────────

export {
  type ResolutionData,
  type ReceiptData,
  redeemMarket,
  redeemMultipleMarkets,
  getResolution,
  buildReceiptData,
} from "./settlement.ts";

// ─── Shareable Receipt ──────────────────────────────────────────────────────

export {
  type PulseReceiptEvent,
  type PulseReceipt,
  buildShareableReceipt,
  receiptToShareableUrl,
  receiptToJson,
} from "./receipt.ts";

// ─── Claim All ──────────────────────────────────────────────────────────────

export {
  type ClaimAllResult,
  type ClaimAllProgressStatus,
  claimAllRedeemable,
} from "./claimAll.ts";

// ─── Complete Sets ───────────────────────────────────────────────────────────

export {
  mintCompleteSet,
  burnCompleteSet,
  mintCompleteSetNative,
} from "./sets.ts";

// ─── Operator ────────────────────────────────────────────────────────────────

export {
  SELECTOR_PLACE_ORDER_FOR,
  SELECTOR_CANCEL_ORDER_FOR,
  type OperatorSelector,
  type OperatorPermissions,
  type OperatorSigner,
  grantOperatorPermissions,
  grantOperatorPermissionsForPool,
  revokeOperatorPermissions,
  getOperatorPermissions,
  placeOrderAsOperator,
  cancelOrderAsOperator,
  enableSessionTrading,
} from "./operator.ts";

// ─── Portfolio ───────────────────────────────────────────────────────────────

export {
  type Portfolio,
  type PortfolioPosition,
  type PortfolioOrder,
  type PortfolioTrade,
  type OpenPositionPnL,
  type ClaimablePositionInfo,
  getMyPortfolio,
  getMyOpenPositions,
  getMyRedeemablePositions,
  getPositionPnL,
  getOutcomeTokenBalance,
  getOutcomeBalanceOnchain,
} from "./portfolio.ts";

// ─── Order Book ──────────────────────────────────────────────────────────────

export {
  type OrderBookLevel,
  type OrderBookSnapshot,
  getOrderBookSnapshot,
  watchOrderBook,
  computeDefaultExpiry,
  DEFAULT_ORDER_EXPIRY_BUFFER_SECONDS,
} from "./orderbook.ts";

// ─── Price Feed ─────────────────────────────────────────────────────────────

export {
  type PriceAsset,
  type SpotPrice,
  getSpotPrice,
  watchSpotPrice,
  getFairProbability,
} from "./priceFeed.ts";

// ─── Risk Engine ────────────────────────────────────────────────────────────

export {
  type RiskLimits,
  type RiskCheckResult,
  checkRiskLimits,
  flattenBeforeExpiry,
} from "./riskEngine.ts";

// ─── Candles ───────────────────────────────────────────────────────────────

export {
  type Candle,
  getMarketCandles,
  listBinaryMarketsByVolume,
  getMarketVolume,
} from "./candles.ts";

// ─── Ladder ─────────────────────────────────────────────────────────────────

export {
  type LadderLevel,
  type LadderLevelResult,
  placeLadderOrders,
  rollToNextWindow,
  rankMarketsByOpportunity,
} from "./ladder.ts";

// ─── Reactive Engine ────────────────────────────────────────────────────────

export {
  type ReactiveEngineHandlers,
  type ReactiveEngineHandle,
  createReactiveEngine,
} from "./reactiveEngine.ts";
