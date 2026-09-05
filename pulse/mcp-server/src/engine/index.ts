/**
 * Pulse Engine — public API surface.
 *
 * VENDORED COPY (Vercel-root containment): this directory is a copy of
 * `pulse/src/engine/` (source of truth) kept INSIDE the mcp-server package so
 * the Vercel serverless build (root directory = pulse/mcp-server) never has to
 * resolve imports outside its root — zero-config api/* functions cannot load
 * out-of-root modules at runtime. Keep this copy in sync with
 * `pulse/src/engine/` (same commit); `demo.ts` is intentionally absent so it
 * can never ship in the serverless bundle. Import specifiers here use the
 * compiled `.js` extension (NodeNext ESM convention) — Vercel transpiles
 * files to `.js` without rewriting literal `.ts` specifiers, so `.ts`
 * specifiers break every serverless function at runtime
 * (ERR_MODULE_NOT_FOUND). Local Node >= 22.13 resolves `.js` -> `.ts`,
 * so the same files run under `node --experimental-strip-types`.
 *
 *
 * This is the single import boundary for all frontend and service code.
 * Import everything from here; never import directly from:
 *   - `@somnia-chain/markets-sdk` (the raw SDK)
 *   - Individual engine files (`./client`, `./units`, `./markets`, etc.)
 *
 * Exception: `demo.ts` is intentionally NOT re-exported. It must be imported
 * explicitly by path (`import { ... } from "../engine/demo.js"`) so it can
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
 * } from "../engine/index.js";
 * ```
 */

// ─── Errors ─────────────────────────────────────────────────────────────────

export {
  PulseErrorCode,
  PulseEngineError,
  mapSdkError,
} from "./errors.js";

// ─── Client ──────────────────────────────────────────────────────────────────

export {
  type PulseClient,
  createPulseClient,
  createPulseMainnetClient,
  createTrader,
  requestDemoFunds,
} from "./client.js";

// ─── Units ───────────────────────────────────────────────────────────────────

export {
  toBigintAmount,
  fromBigintAmount,
  snapToTick,
  getPoolTickSize,
} from "./units.js";

// ─── Status Gate ─────────────────────────────────────────────────────────────

export {
  getOnChainMarketStatus,
  assertMarketWritable,
} from "./statusGate.js";

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
} from "./markets.js";

// ─── Trading ─────────────────────────────────────────────────────────────────

export {
  placeMarketOrder,
  placeLimitOrder,
  cancelOrder,
  getOpenOrdersForTrader,
} from "./trading.js";

// ─── Settlement ──────────────────────────────────────────────────────────────

export {
  type ResolutionData,
  type ReceiptData,
  redeemMarket,
  redeemMultipleMarkets,
  getResolution,
  buildReceiptData,
} from "./settlement.js";

// ─── Shareable Receipt ──────────────────────────────────────────────────────

export {
  type PulseReceiptEvent,
  type PulseReceipt,
  buildShareableReceipt,
  receiptToShareableUrl,
  receiptToJson,
} from "./receipt.js";

// ─── Claim All ──────────────────────────────────────────────────────────────

export {
  type ClaimAllResult,
  type ClaimAllProgressStatus,
  claimAllRedeemable,
} from "./claimAll.js";

// ─── Complete Sets ───────────────────────────────────────────────────────────

export {
  mintCompleteSet,
  burnCompleteSet,
  mintCompleteSetNative,
} from "./sets.js";

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
} from "./operator.js";

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
} from "./portfolio.js";

// ─── Order Book ──────────────────────────────────────────────────────────────

export {
  type OrderBookLevel,
  type OrderBookSnapshot,
  getOrderBookSnapshot,
  watchOrderBook,
  computeDefaultExpiry,
  DEFAULT_ORDER_EXPIRY_BUFFER_SECONDS,
} from "./orderbook.js";

// ─── Price Feed ─────────────────────────────────────────────────────────────

export {
  type PriceAsset,
  type SpotPrice,
  getSpotPrice,
  watchSpotPrice,
  getFairProbability,
} from "./priceFeed.js";

// ─── Risk Engine ────────────────────────────────────────────────────────────

export {
  type RiskLimits,
  type RiskCheckResult,
  checkRiskLimits,
  flattenBeforeExpiry,
} from "./riskEngine.js";

// ─── Candles ───────────────────────────────────────────────────────────────

export {
  type Candle,
  getMarketCandles,
  listBinaryMarketsByVolume,
  getMarketVolume,
} from "./candles.js";

// ─── Ladder ─────────────────────────────────────────────────────────────────

export {
  type LadderLevel,
  type LadderLevelResult,
  placeLadderOrders,
  rollToNextWindow,
  rankMarketsByOpportunity,
} from "./ladder.js";

// ─── Reactive Engine ────────────────────────────────────────────────────────

export {
  type ReactiveEngineHandlers,
  type ReactiveEngineHandle,
  createReactiveEngine,
} from "./reactiveEngine.js";
