# Pulse Engine — Backend Documentation

## 1. Overview

Pulse is an Onyx-style consumer prediction-market trading engine built on DreamDEX Event Contracts (Somnia Shannon testnet). It wraps all `@somnia-chain/markets-sdk` interaction behind a single barrel export (`src/engine/index.ts`), designed so a future Rust or alternative implementation could satisfy the same interface. The frontend is not yet built; this document covers the backend/engine layer only.

## 2. Verified Environment & Configuration

| Parameter | Value | Source |
|-----------|-------|--------|
| Chain | Somnia Shannon testnet | Confirmed via DreamDEX docs + SDK source |
| Chain ID | 50312 | `somniaShannon` from `@somnia-chain/markets-sdk/chains` |
| Indexer URL | `https://dev.smk.somnia.host/v1/graphql` | `createPulseClient()` in `client.ts` |
| WS RPC URL | `wss://api.infra.testnet.somnia.network/ws` | `createPulseClient()` in `client.ts` |
| Addresses | `SOMNIA_TESTNET_ADDRESSES` (baked into SDK) | SDK export, verified via source inspection |
| Price Feed | `SOMNIA_TESTNET_PRICE_FEED` (Hasura-backed) | SDK export, configured on client |
| Collateral | 6-decimal test USDC (not 18dp USDso — mainnet only) | Confirmed via live SDK source + on-chain inspection |

This config was verified via live SDK source inspection and DreamDEX docs — not assumed.

## 3. Module-by-Module Reference

### `client.ts` — Client initialization

**Purpose:** Creates configured Pulse client and trader instances.

| Export | Signature |
|--------|-----------|
| `PulseClient` (type) | `{ client: SomniaMarketsClient; exchange: SomniaMarkets }` |
| `createPulseClient()` | `(): PulseClient` |
| `createPulseMainnetClient()` | `(): PulseClient` |
| `createTrader(pulseClient, privateKey, decimals?)` | `(PulseClient, string, number=6) → Trader` |
| `requestDemoFunds(privateKey, amount?)` | `(string, bigint?) → Promise<TxResult>` |

**Design notes:** `requestDemoFunds` creates a throwaway client with the private key for signing — it does not reuse the caller's client. The `SOMNIA_TESTNET_PRICE_FEED` is configured automatically on the testnet client, enabling `watchSpotPrice` without extra setup.

---

### `units.ts` — BigInt conversion and tick snapping

**Purpose:** Precise string-based conversion between human-readable numbers and scaled bigints. No `Number()` multiplication — avoids IEEE 754 precision loss.

| Export | Signature |
|--------|-----------|
| `toBigintAmount(human, decimals)` | `(number \| string, number) → bigint` |
| `fromBigintAmount(raw, decimals)` | `(bigint, number) → string` |
| `snapToTick(price, tickSize)` | `(bigint, bigint) → bigint` |
| `getPoolTickSize(client, pool)` | `(SomniaMarketsClient, string) → Promise<bigint>` |

**Design notes:** `toBigintAmount` throws if input has more fractional digits than `decimals` allows — never silently truncates. Tick size is per-market and must be read at runtime via `getPoolTickSize`; never hardcoded.

---

### `markets.ts` — Market discovery

**Purpose:** Fetch and filter binary markets from the indexer.

| Export | Signature |
|--------|-----------|
| `BinaryMarket` (type) | Re-exported from SDK |
| `BinaryMarketStatus` (type) | Re-exported from SDK |
| `Market` (type) | Re-exported from SDK |
| `isBinaryMarket(market)` | Type guard (SDK re-export) |
| `getLiveBinaryMarkets(client)` | `(SomniaMarketsClient) → Promise<BinaryMarket[]>` |
| `getUpcomingBinaryMarkets(client)` | `(SomniaMarketsClient) → Promise<BinaryMarket[]>` |
| `getFinalizedBinaryMarkets(client)` | `(SomniaMarketsClient) → Promise<BinaryMarket[]>` |
| `getMarketById(client, marketId)` | `(SomniaMarketsClient, string) → Promise<BinaryMarket \| null>` |

**Critical rule:** `BinaryMarket.poolAddress` is a **time-varying binding** — the same pool contract serves successive markets. Always key by `market.id` (bytes32 marketId), never by `poolAddress` alone. `getFinalizedBinaryMarkets` documents that "Finalized" is indexer-only — a market can be `Resolved` or `Voided` on-chain but NOT yet `Finalized` in the indexer; handle that gap gracefully.

---

### `trading.ts` — Order placement and management

**Purpose:** Place market/limit orders, cancel, and query open orders.

| Export | Signature |
|--------|-----------|
| `placeMarketOrder(client, trader, params)` | `(SomniaMarketsClient, Trader, { pool, side, humanPrice, humanQuantity, decimals }) → Promise<PlaceOrderResult>` |
| `placeLimitOrder(client, trader, params)` | `(SomniaMarketsClient, Trader, { pool, side, humanPrice, humanQuantity, decimals, expireTimestampNs?, market? }) → Promise<PlaceOrderResult>` |
| `cancelOrder(trader, pool, orderId)` | `(Trader, Address, string) → Promise<TxResult>` |
| `getOpenOrdersForTrader(client, traderAddress, opts?)` | `(SomniaMarketsClient, Address, { pool?, limit?, offset? }?) → Promise<OpenOrder[]>` |

**Design notes:** Both `placeMarketOrder` and `placeLimitOrder` call `assertMarketWritable` before sending — reads on-chain status (not indexer) to prevent stale-indexer writes. `placeLimitOrder` defaults expiry to `computeDefaultExpiry(market)` (now + 60s, clamped to market expiry) when `market` is provided.

---

### `settlement.ts` — Redemption and receipt building

**Purpose:** Redeem resolved/voided markets, fetch resolution data, build receipts.

| Export | Signature |
|--------|-----------|
| `ResolutionData` (type) | `{ winningOutcome, events, reference, closingAnswer, openingAnswer }` |
| `ReceiptData` (type) | `{ market, resolution, explorerTxUrl, voided, voidedNote, oracleExplorerUrl }` |
| `redeemMarket(trader, client, marketId, ownerAddress?)` | `(Trader, SomniaMarketsClient, string, string?) → Promise<TxResult>` |
| `redeemMultipleMarkets(trader, client, marketIds)` | `(Trader, SomniaMarketsClient, string[]) → Promise<TxResult>` |
| `getResolution(client, marketId)` | `(SomniaMarketsClient, string) → Promise<ResolutionData>` |
| `buildReceiptData(client, marketId, chainId?)` | `(SomniaMarketsClient, string, number=50312) → Promise<ReceiptData>` |

**Design notes — voided markets:** `redeemMarket` handles both resolved and voided markets. For voided markets (oracle failure → both sides redeem at par), it checks **both** YES and NO balances via `getOutcomeTokenBalance` and makes one `trader.redeem()` call per non-zero balance. This is critical because the SDK's auto-lookup (`redeem()` without `outcomeIdx`) defaults to YES when both payout numerators are equal — a tiebreak bug that would miss the NO-side balance entirely. `redeemMultipleMarkets` **skips** voided markets (they require per-side redemption that can't be batched into `redeemMany`). `buildReceiptData` includes `oracleExplorerUrl` (best-effort — see Known Gaps).

---

### `operator.ts` — Session-key / delegated trading

**Purpose:** One-signature-then-frictionless trading via the OperatorPermissionsRegistry.

| Export | Signature |
|--------|-----------|
| `SELECTOR_PLACE_ORDER_FOR` (const) | `"0x80054449"` |
| `SELECTOR_CANCEL_ORDER_FOR` (const) | `"0xe37b444b"` |
| `OperatorSelector` (type) | `"placeOrderFor" \| "cancelOrderFor" \| "reduceOrderFor"` |
| `OperatorPermissions` (type) | `{ globallyApproved, poolApproved, authorized }` |
| `grantOperatorPermissions(trader, operatorAddress, selectors)` | `(Trader, Address, OperatorSelector[]) → Promise<TxResult>` |
| `grantOperatorPermissionsForPool(trader, operatorAddress, pool, selectors)` | `(Trader, Address, Address, OperatorSelector[]) → Promise<TxResult>` |
| `revokeOperatorPermissions(trader, operatorAddress)` | `(Trader, Address) → Promise<TxResult>` |
| `getOperatorPermissions(client, owner, operator, pool, selector?)` | `(SomniaMarketsClient, Address, Address, Address, OperatorSelector?) → Promise<OperatorPermissions>` |
| `placeOrderAsOperator(client, signer, onBehalfOf, orderParams)` | `(SomniaMarketsClient, OperatorSigner, Address, {...}) → Promise<PlaceOrderResult>` |
| `cancelOrderAsOperator(client, signer, onBehalfOf, pool, orderId)` | `(SomniaMarketsClient, OperatorSigner, Address, Address, string\|bigint) → Promise<TxResult>` |
| `enableSessionTrading(trader, operatorAddress, pool?)` | `(Trader, Address, Address?) → Promise<TxResult>` |

**Design notes:** `placeOrderAsOperator` and `cancelOrderAsOperator` perform authorization pre-checks via `getOperatorPermissions` before attempting the contract call — never let it fail on an opaque revert. The local ABI entries (`PLACE_ORDER_FOR_ABI`, `CANCEL_ORDER_FOR_ABI`) are derived from the SDK's `spotPoolWriteAbi` with `address owner` prepended; the SDK does not export `For`-variant ABIs.

**⚠️ Spot-only limitation (confirmed):** Operator/session-key functionality is architecturally limited to SPOT markets. BinaryPool has no operator gate — it escrows through the module directly. `isOperatorAuthorized()` reverts (not returns false) when checked against a BinaryPool address. `enableSessionTrading` accepts an optional `pool` parameter for per-pool grants, which is the recommended path for binary pools. See Known Gaps §7 for full details.

---

### `sets.ts` — Complete-set mint/burn

**Purpose:** Mint equal YES + NO tokens from collateral (sell anytime without prior holdings).

| Export | Signature |
|--------|-----------|
| `mintCompleteSet(trader, client, pool, humanAmount, decimals)` | `(Trader, SomniaMarketsClient, Address, string, number) → Promise<TxResult>` |
| `burnCompleteSet(trader, client, pool, humanAmount, decimals)` | `(Trader, SomniaMarketsClient, Address, string, number) → Promise<TxResult>` |
| `mintCompleteSetNative(trader, client, pool, humanAmount)` | `(Trader, SomniaMarketsClient, Address, string) → Promise<TxResult>` |

**Design notes:** All functions gate on on-chain status "Trading" before proceeding. `mintCompleteSetNative` is **untested** against DreamDEX's actual testnet collateral (6dp USDC) — it uses 18dp native-token path. See Known Gaps.

---

### `statusGate.ts` — On-chain write gating

**Purpose:** Prevent writes against stale indexer status by reading live on-chain state.

| Export | Signature |
|--------|-----------|
| `getOnChainMarketStatus(client, marketId)` | `(SomniaMarketsClient, string) → Promise<BinaryMarketStatus>` |
| `assertMarketWritable(client, marketId, requiredStatus)` | `(SomniaMarketsClient, string, BinaryMarketStatus \| BinaryMarketStatus[]) → Promise<void>` |

**Design notes:** Uses `client.getMarketOnchain(marketId)` — a direct `eth_call` to the BinaryMarketsModule contract. The on-chain enum is 0–5 (Listed through Voided); "Finalized" is indexer-only. The on-chain status map is derived from `store.d.ts` `BINARY_MARKET_STATUS` (not exported from root barrel).

---

### `portfolio.ts` — Portfolio and position queries

**Purpose:** Read-only queries for trader positions, orders, PnL, and claimable balances.

| Export | Signature |
|--------|-----------|
| `Portfolio`, `PortfolioPosition`, `PortfolioOrder`, `PortfolioTrade`, `OpenPositionPnL` (types) | Re-exported from SDK |
| `ClaimablePositionInfo` (type) | `{ marketId, pool, outcomeIdx, amount, estPayout, status }` |
| `getMyPortfolio(client, traderAddress, opts?)` | `(SomniaMarketsClient, Address, {...}?) → Promise<Portfolio>` |
| `getMyOpenPositions(client, traderAddress)` | `(SomniaMarketsClient, Address) → Promise<PortfolioPosition[]>` |
| `getMyRedeemablePositions(client, traderAddress)` | `(SomniaMarketsClient, Address) → Promise<ClaimablePositionInfo[]>` |
| `getPositionPnL(client, traderAddress, marketId)` | `(SomniaMarketsClient, Address, string) → Promise<OpenPositionPnL>` |
| `getOutcomeTokenBalance(client, traderAddress, market, outcome)` | `(SomniaMarketsClient, Address, BinaryMarket, 0\|1) → Promise<bigint>` |

**Design notes:** All data is indexer-sourced (display-grade, not for gating writes). `getOutcomeTokenBalance` reads ERC-6909 state directly for voided-market redemption.

---

### `orderbook.ts` — Order-book snapshots and live streaming

**Purpose:** Human-readable order-book data and live streaming.

| Export | Signature |
|--------|-----------|
| `OrderBookLevel` (type) | `{ price: string; quantity: string }` |
| `OrderBookSnapshot` (type) | `{ bestBid, bestAsk, bids: OrderBookLevel[], asks: OrderBookLevel[] }` |
| `getOrderBookSnapshot(client, pool, decimals, depth?)` | `(SomniaMarketsClient, Address, number, number=10) → Promise<OrderBookSnapshot>` |
| `watchOrderBook(client, pool, decimals, onUpdate, depth?)` | `(SomniaMarketsClient, Address, number, (OrderBookSnapshot) → void, number=10) → () => void` |
| `computeDefaultExpiry(market)` | `(BinaryMarket) → bigint` |
| `DEFAULT_ORDER_EXPIRY_BUFFER_SECONDS` (const) | `60` |

**Design notes:** `watchOrderBook` uses ref-counted `client.watchMarket` — calling twice on the same pool shares one subscription. `computeDefaultExpiry` clamps to market expiry minus 5s safety margin; throws if the market is expiring too soon for any safe order window.

---

### `priceFeed.ts` — Spot price and fair probability

**Purpose:** BTC/ETH price queries and a heuristic fair-probability estimate.

| Export | Signature |
|--------|-----------|
| `PriceAsset` (type) | `"BTC" \| "ETH"` |
| `SpotPrice` (type) | `{ price: string; timestamp: number }` |
| `getSpotPrice(client, asset)` | `(SomniaMarketsClient, PriceAsset) → Promise<SpotPrice \| null>` |
| `watchSpotPrice(client, asset, onUpdate)` | `(SomniaMarketsClient, PriceAsset, (SpotPrice) → void) → () => void` |
| `getFairProbability(spotPrice, strikePrice, secondsRemaining)` | `(string, string, number) → number` |

**Design notes:** `getSpotPrice` uses `client.fetchPrice()` (one HTTP round-trip, no watch needed). `watchSpotPrice` uses `client.watchPrice()` + `client.subscribePrices()`. `getFairProbability` is a simplified Black-Scholes normal CDF with 40% assumed volatility — **heuristic only, not a pricing tool**. Price feed decimals are always 18 (`PRICE_FEED_DECIMALS`).

---

### `errors.ts` — Typed error mapping

**Purpose:** Map raw SDK/contract reverts to consistent, typed errors.

| Export | Signature |
|--------|-----------|
| `PulseErrorCode` (const) | `{ INVALID_PRICE, INCORRECT_SENDER, INSUFFICIENT_BALANCE, WRONG_STATUS, NOT_AUTHORIZED_OPERATOR, MARKET_NOT_FOUND, ALREADY_REDEEMED, UNKNOWN }` |
| `PulseEngineError` (class) | `extends Error { code, context, originalError? }` |
| `mapSdkError(err, context)` | `(unknown, string) → PulseEngineError` |

**Design notes:** `mapSdkError` inspects errors in priority order: `ContractRevertError` with `errorName` → mapped code; `SomniaMarketsError` → UNKNOWN; generic `Error` → UNKNOWN. All engine functions throw `PulseEngineError` rather than raw SDK errors so the frontend can switch on `error.code`.

---

### `demo.ts` — Testnet-only demo utilities

**Purpose:** Faucet, force-resolve, force-void for testnet demos and integration tests.

| Export | Signature |
|--------|-----------|
| `requestTestFunds(trader, client, params?)` | `(Trader, SomniaMarketsClient, { amount?, gas? }?) → Promise<TxResult>` |
| `forceResolveMarket(trader, client, marketAddress, params)` | `(Trader, SomniaMarketsClient, Address, { outcomeIdx, fakeOracleAddress, gas? }) → Promise<TxResult>` |
| `forceVoidMarket(trader, client, marketAddress, params)` | `(Trader, SomniaMarketsClient, Address, { fakeOracleAddress, gas? }) → Promise<TxResult>` |

**⚠️ TESTNET-ONLY.** Excluded from the main barrel (`index.ts`) — must be imported by explicit path. Runtime guard checks `chain.id !== 5031`.

**Critical finding — FakeOracle:** `SOMNIA_TESTNET_ADDRESSES` does **not** include a `fakeOracle` address. The SDK's `resolve()` reads `p.fakeOracle ?? w.addresses().fakeOracle` — since neither is set by default, callers must supply the `fakeOracleAddress` parameter manually. This address is **undocumented and inaccessible** — the demo-lifecycle script uses natural oracle resolution instead (see Section 6). `forceResolveMarket` and `forceVoidMarket` exist in the codebase for potential future use if the address is discovered, but are not wired into any running demo.

---

### `index.ts` — Barrel export

**Purpose:** Single import boundary for all frontend and service code.

Re-exports 50+ symbols from all modules **except** `demo.ts`. Convention: import everything from `src/engine/index.ts`, never directly from `@somnia-chain/markets-sdk` or individual engine files.

---

## 4. Critical Correctness Rules

These rules are enforced by the codebase and must be maintained by any future implementation:

| Rule | Enforcement |
|------|-------------|
| **Always key markets by `marketId`, never `poolAddress` alone** | `poolAddress` is a time-varying binding — same pool serves successive markets |
| **Never use `Number()`/float math for prices/quantities** | `toBigintAmount`/`fromBigintAmount` only — IEEE 754 loses precision at 18dp |
| **Always call `assertMarketWritable` before any write** | Reads live on-chain status (not indexer) — prevents writes against stale indexer lag |
| **Voided markets: check both YES and NO balances, redeem each separately** | SDK's auto-lookup defaults to YES when both payout numerators are equal (tiebreak bug) |
| **Operator calls require pre-authorization checks** | `getOperatorPermissions` before `placeOrderFor`/`cancelOrderFor` — never let it fail on opaque contract revert |
| **Redemption uses on-chain gate, not indexer** | On-chain enum (0–5) does not include "Finalized" — gate on `["Resolved", "Voided"]` |
| **Tick sizes are per-market, read at runtime** | `getPoolTickSize` before `snapToTick` — never hardcode |

---

## 5. Testing

**Current status: 223 tests passing, 0 failing.**

| Test file | Coverage |
|-----------|----------|
| `__tests__/client.test.ts` | Client creation, trader binding, `requestDemoFunds` |
| `__tests__/units.test.ts` | `toBigintAmount`, `fromBigintAmount`, `snapToTick`, `getPoolTickSize` |
| `__tests__/markets.test.ts` | Market filtering, `isBinaryMarket` type guard |
| `__tests__/trading.test.ts` | Order placement (market/limit), cancel, open orders |
| `__tests__/settlement.test.ts` | Redemption (resolved + voided), resolution data, receipt building |
| `__tests__/operator.test.ts` | Grant/revoke, pre-checks, `placeOrderAsOperator`, `cancelOrderAsOperator` |
| `__tests__/sets.test.ts` | Mint/burn complete sets, native mint |
| `__tests__/statusGate.test.ts` | On-chain status reads, assertion behavior |
| `__tests__/portfolio.test.ts` | Portfolio queries, position filtering, PnL |
| `__tests__/orderbook.test.ts` | Snapshot conversion, `computeDefaultExpiry` edge cases |
| `__tests__/priceFeed.test.ts` | Spot price, watch, fair probability heuristic |
| `__tests__/errors.test.ts` | `mapSdkError` mapping, `PulseEngineError` construction |
| `__tests__/index.test.ts` | Barrel re-export verification |

Run with: `npm test`

---

## 6. Demo Scripts

### `scripts/demo-lifecycle.ts` — Full market lifecycle

Step-by-step walkthrough:

1. **Pre-flight:** Check `DEMO_PRIVATE_KEY` env var
2. **Create client + trader:** `createPulseClient()` → `createTrader()`
3. **Request test USDC:** `requestDemoFunds()` — faucet call (needs STT gas first)
4. **Discover market:** `getLiveBinaryMarkets()` → pick shortest-expiry BTC/ETH market with ≥15s runway
5. **Mint complete set:** `mintCompleteSet()` — deposits 10 USDC, mints YES + NO
6. **Order book snapshot (before):** `getOrderBookSnapshot()`
7. **Place limit order:** `placeLimitOrder()` — BUY_YES @ 0.55 for 5 USDC
8. **Order book snapshot (after):** Verify order is visible in book
9. **Wait for natural resolution:** Poll `getOnChainMarketStatus()` every 8s (max 20 min). **Does NOT force-resolve** — FakeOracle address is inaccessible, so the script waits for the market's real oracle window to close.
10. **Redeem:** `redeemMarket()` after 5s indexer-sync wait
11. **Build receipt:** `buildReceiptData()` — prints question, winner, explorer link
12. **Cleanup:** `pulse.client.stopLive()` + `process.exit(0)` to tear down WebSocket connections

**Env vars:** `DEMO_PRIVATE_KEY` (required)

**Run:** `npm run demo`

**Timing:** Full lifecycle takes 5–20 minutes due to real oracle resolution windows (~15 min). This is not instant — it waits for genuine on-chain market expiry and oracle settlement.

### `scripts/demo-session.ts` — Operator session-key flow

Step-by-step:

1. **Pre-flight:** Check `OWNER_KEY` env var (optionally `OPERATOR_KEY`)
2. **Create clients:** Separate owner + operator clients (or same key for demo mode)
3. **Ensure test USDC:** Faucet call
4. **Discover market:** Find live BTC/ETH market
5. **Check permissions:** `getOperatorPermissions()` — show current state
6. **Grant permissions:** `grantOperatorPermissions()` — placeOrderFor + cancelOrderFor
7. **Verify permissions:** Confirm authorized after grant
8. **Order book:** Show current book state
9. **Document operator order flow:** Log the `placeOrderAsOperator` call signature (not executed — requires full viem wallet wiring)
10. **Revoke permissions:** `revokeOperatorPermissions()`
11. **Verify revoke:** Confirm unauthorized after revoke

**Env vars:** `OWNER_KEY` (required), `OPERATOR_KEY` (optional — defaults to OWNER_KEY for single-wallet demo)

**Run:** `npm run demo:session`

---

## 7. Wallet Architecture

### Chosen stack: Thirdweb in-app wallet + smart wallet (gas-sponsored)

**Status:** Confirmed via live spike test on Somnia Shannon testnet (chain 50312). **Not wired into frontend yet** — the frontend has not been scaffolded.

**Architecture:**

```
User → Thirdweb In-App Wallet (guest/social login, personal EOA key)
     → Thirdweb Smart Wallet (ERC-4337, sponsorGas: true)
     → ThirdwebOperatorSigner adapter (src/wallet/thirdwebAdapter.ts)
     → Engine write functions (placeMarketOrder, mintCompleteSet, etc.)
     → DreamDEX contracts (BinaryPool, TestUSDC, BinarySettlement)
```

**Why Thirdweb (not Privy+Pimlico):**
- Thirdweb `sponsorGas: true` works end-to-end with zero STT from the user — confirmed live.
- Privy+Pimlico requires a credit card on file at pimlico.io to activate paymaster sponsorship (even for testnets). Without it, UserOps timeout. Thirdweb has no such requirement.
- Thirdweb provides a simpler integration: `smartWallet({ chain, sponsorGas: true })` + `sendTransaction({ account: smartAccount, transaction })`.

**The viemAdapter limitation:**

Thirdweb's built-in `viemAdapter.walletClient.toViem()` throws "Wallet not connected" when used with smart wallets. This is a known Thirdweb limitation — the adapter only works with EOAs, not ERC-4337 smart accounts.

**Resolution:** `src/wallet/thirdwebAdapter.ts` (~200 lines with types/JSDoc). This adapter wraps Thirdweb's `sendTransaction` as a viem-compatible `writeContract`, conforming exactly to the engine's `OperatorSigner` type from `src/engine/operator.ts`.

### `src/wallet/thirdwebAdapter.ts` — Thirdweb → OperatorSigner bridge

| Export | Signature |
|--------|-----------|
| `ThirdwebSmartAccount` (interface) | `{ address: string; signMessage?: ... }` |
| `ThirdwebClient` (interface) | Opaque Thirdweb client type |
| `ThirdwebChain` (interface) | `{ id: number; ... }` |
| `ThirdwebAdapterConfig` (interface) | `{ smartAccount, client, chain }` |
| `createThirdwebOperatorSigner(config)` | `(ThirdwebAdapterConfig) → OperatorSigner` |

**Design notes:**
- The adapter does NOT hold private keys. Signing is delegated to Thirdweb's smart account.
- `writeContract` encodes call data via viem's `encodeFunctionData`, then delegates to Thirdweb's `sendTransaction` — which handles ERC-4337 UserOperation construction, paymaster sponsorship, and bundler submission.
- All other `WalletClient` methods (`sendTransaction`, `signMessage`, etc.) throw descriptive errors — they are stubs to satisfy the viem type, not functional code.
- `import("thirdweb")` is dynamic inside `writeContract` to avoid bundling Thirdweb in server-side contexts.

**Live test results (spike-thirdweb-aa):**

| Test | STT Before | STT After | Result |
|------|-----------|-----------|--------|
| `faucet(10_000 USDC)` via Thirdweb `sendTransaction` | 0 | 0 | ✅ Sponsored |
| `faucet(10_000 USDC)` via OperatorSigner adapter `writeContract` | 0 | 0 | ✅ Sponsored |
| `approve + mintSet` on live DreamDEX BinaryPool via adapter | 0 | 0 | ✅ Sponsored |

**Usage (for future frontend):**

```ts
import { createThirdwebOperatorSigner } from "../wallet/thirdwebAdapter.ts";
import { smartWallet, inAppWallet } from "thirdweb/wallets";
import { createThirdwebClient } from "thirdweb";

const client = createThirdwebClient({ clientId: "..." });
const chain = defineChain({ id: 50312, ... });

// 1. Personal account (guest or social login)
const iaw = inAppWallet();
const personalAccount = await iaw.connect({ client, strategy: "guest" });

// 2. Smart account with gas sponsorship
const swFactory = smartWallet({ chain, sponsorGas: true });
const smartAccount = await swFactory.connect({ client, personalAccount });

// 3. Create OperatorSigner for the engine
const signer = createThirdwebOperatorSigner({
  smartAccount,
  client,
  chain,
});

// 4. Use with engine functions (no STT needed from user)
await mintCompleteSet(signer, pulseClient, pool, "10", 6);
await placeMarketOrder(pulseClient, signer, { pool, side: "BUY_YES", ... });
```

---

## 8. Known Gaps / Honest Limitations

| Gap | Severity | Detail |
|-----|----------|--------|
| **oracleExplorerUrl format unverified** | Medium | The deep-link format (`/{questionId}`) is best-effort — needs verification against a real resolved market's oracle reference data. Link may 404. Receipt still renders correctly with null URL. |
| **`mintCompleteSetNative` untested** | Medium | Uses 18dp native-token path — DreamDEX testnet uses 6dp USDC ERC-20. Verify against actual collateral before production use. |
| **FakeOracle address inaccessible** | Low (demo only) | `SOMNIA_TESTNET_ADDRESSES` does not include it. `forceResolveMarket`/`forceVoidMarket` exist but are not wired into any running demo. Discovery script uses natural resolution. |
| **No Rust implementation yet** | Info | Engine designed for future portability but currently TypeScript-only. The barrel export pattern enables a Rust reimplementation that satisfies the same interface. |
| **Frontend does not exist yet** | Info | This document is backend/engine only. |
| **`reduceOrderFor` selector not available in SDK** | Low | `OperatorSelector` type includes it but `SELECTOR_MAP` does not — the selector must be verified against the pool ABI before wiring. |
| **`operatorPermissionsRegistry` missing from `SOMNIA_TESTNET_ADDRESSES`** | Medium | Required for all operator/session-key functions; not baked into the SDK's default config despite being deployed at `0x15C7e8CE38F021c5b45d098AaD788f63090bF20A`. Merged manually in `createPulseClient`. Developer would hit `NotConfiguredError` with no indication of where to find the address. |
| **`createClient` not exported from SDK root barrel** | Medium | README quickstart uses `createClient()` but it's not in the public API surface. Actual entry point is `new SomniaMarkets(...)`. Confirmed via `package.json` exports map and `dist/index.d.ts`. |
| **Operator/session-key: spot-only limitation (confirmed)** | Medium | `grantOperatorPermissions`, `placeOrderAsOperator`, `cancelOrderAsOperator` are fully implemented and tested, but architecturally limited to SPOT markets. BinaryPool has no operator gate — it escrows through the module directly. Confirmed via: (1) live testnet: `isOperatorAuthorized()` reverts when checked against a BinaryPool address even after successful grant; (2) SDK source comment (`spot/operatorGrants.ts`): "SPOT-ONLY: the registry gates SpotPool's operator entry points... A BinaryPool escrows through the module and has no operator gate."; (3) DreamDEX's own official `ec-*` bot-kit strategies use only direct owner-key trading, confirming this is the intended design. Implication: Pulse's trading UX for Event Contracts uses direct owner-signed transactions, matching DreamDEX's official bot pattern. The operator code remains functional for spot-market features or if DreamDEX extends operator support to BinaryPools in a future release. |

---

## 9. Source of Truth

Every function signature, type, and behavior documented here was verified by direct inspection of `@somnia-chain/markets-sdk`'s source and/or live testnet execution — not assumed from documentation alone. Where DreamDEX's public docs were silent or incomplete (e.g. FakeOracle address, oracle explorer URL format), this is explicitly noted rather than filled in with a guess.
