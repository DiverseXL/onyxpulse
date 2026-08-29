# DreamDEX SDK & Documentation Feedback Report

**Project:** Pulse — Onyx-style consumer prediction-market trading engine
**Built with:** `@somnia-chain/markets-sdk` v0.28.x on Somnia Shannon testnet (chain 50312)
**Date:** August 2026

This report documents real limitations, gaps, and friction points we encountered while building Pulse end-to-end on live testnet. Every finding is backed by source inspection or live execution evidence. We写 it to help improve the developer experience for future hackathon participants and production builders.

---

## Finding 1: `createClient` is not exported from the SDK root — README quickstart is incorrect

**Category:** Documentation accuracy
**Severity:** High (blocks onboarding)

### Issue

The SDK's README quickstart uses `createClient()` as the entry point, but this function is **not exported** from the SDK's root barrel (`@somnia-chain/markets-sdk`). The actual public entry point is the `SomniaMarkets` class.

### Evidence

- README example: `import { createClient } from "@somnia-chain/markets-sdk"`
- SDK root barrel exports (verified via `package.json` exports map and `dist/index.d.ts`): only `.`, `./chains`, `./native`, `./react`, `./reactivity` — no `createClient` at root
- The correct entry point is: `new SomniaMarkets({ chain, wsRpcUrl, indexerUrl, addresses })`
- `createClient` exists internally (`createClient.js`) but is not part of the public API surface

### Impact

Any new developer following the README verbatim will hit an import error immediately. This was our first blocker during initial setup.

### Suggestion

Update the README quickstart to use `SomniaMarkets` as the entry point, or re-export `createClient` from the root barrel if it's intended as the public API.

---

## Finding 2: FakeOracle address is undocumented and inaccessible

**Category:** SDK capability gap
**Severity:** Medium (hackathon-specific friction; doesn't affect production)

### Issue

The SDK's testnet module exposes `resolve()` and `voidMarket()` functions for force-resolving/voiding markets on testnet. These require a `fakeOracle` address parameter that does **not exist** in `SOMNIA_TESTNET_ADDRESSES`, is not published in DreamDEX docs, the bot-kit, or the testnet explorer. It appears to be an internal dev-only tool.

### Evidence

- `SOMNIA_TESTNET_ADDRESSES` contents (verified via live import): `{ binaryModule, binaryPoolImpl, binarySettlement, clobFactory, collateral, collateralRouter, marketCreator, marketCreatorFactory, marketsCore, oracleHub, testUsdc, lend }` — no `fakeOracle` field
- SDK source (`binary/settlement.js`): `resolve()` calls `p.fakeOracle ?? w.addresses().fakeOracle` — neither is set by default
- `testnet.d.ts`: `ResolveParams` has `fakeOracle?: Address` as optional, confirming the address must be supplied per-call
- DreamDEX docs, bot-kit (`ec-*` strategies), and Shannon testnet explorer: no mention of a FakeOracle contract address

### Impact

External hackathon participants cannot force-resolve markets for demo purposes. We had to completely redesign our demo script (`scripts/demo-lifecycle.ts`) to wait for real market resolution (~5–20 minutes per run), which is a meaningful friction point for hackathon demos where time is limited.

### Suggestion

Either:
- **(a)** Publish the FakeOracle address in `SOMNIA_TESTNET_ADDRESSES` (or document it prominently) so testnet users can force-resolve for demos
- **(b)** Add a note in the testnet module docs that `resolve()`/`voidMarket()` require an undisclosed internal address and are not usable by external developers

---

## Finding 3: `operatorPermissionsRegistry` address missing from `SOMNIA_TESTNET_ADDRESSES`

**Category:** SDK configuration gap
**Severity:** Medium (blocks operator/session-key features without manual config)

### Issue

The `operatorPermissionsRegistry` address is required for all operator/session-key functions (`setOperatorApprovalGlobal`, `setOperatorApprovalForPool`, `isOperatorAuthorized`, etc.) but is **not included** in the SDK's default `SOMNIA_TESTNET_ADDRESSES` config, despite being deployed and documented separately.

### Evidence

- `SOMNIA_TESTNET_ADDRESSES` (verified): does not contain `operatorPermissionsRegistry`
- SDK config type (`config.d.ts:53`): `operatorPermissionsRegistry?: Address` — the field exists but is optional and unset by default
- Correct address (from DreamDEX docs): `0x15C7e8CE38F021c5b45d098AaD788f63090bF20A`
- Without it, operator functions throw `NotConfiguredError` with no indication of where to find the address

### Impact

A developer must specifically search DreamDEX's docs site to find this address and manually merge it into the config. There's no error message or SDK guidance pointing to the correct source.

### Suggestion

Include `operatorPermissionsRegistry` in `SOMNIA_TESTNET_ADDRESSES` (and `SOMNIA_MAINNET_ADDRESSES` when mainnet is live). The address is already deployed and documented — it should be baked into the SDK defaults like the other contract addresses.

---

## Finding 4: Operator/session-keys do not extend to binary Event Contract pools — and this isn't documented

**Category:** SDK scope limitation / Documentation gap
**Severity:** High (blocks expected functionality, wastes debugging time)

### Issue

Operator/session-key functionality (`grantOperatorPermissions`, `placeOrderAsOperator`, `cancelOrderAsOperator`) is fully implemented and tested, but architecturally limited to **SPOT markets only**. BinaryPool has no operator gate — it escrows through the `BinaryMarketsModule` directly. `isOperatorAuthorized()` **reverts** (rather than returning `false`) when checked against a BinaryPool address.

### Evidence

- Live testnet execution: `grantOperatorPermissions` succeeds (registry write goes through), but `isOperatorAuthorized` reverts when checked against a BinaryPool address
- SDK source comment (`packages/sdk/src/spot/operatorGrants.ts`): *"SPOT-ONLY: the registry gates SpotPool's operator entry points... A BinaryPool escrows through the module and has no operator gate."*
- BinaryPool's `placeOrder` function verifies authorization internally through the `BinaryMarketsModule`, which has a different (non-operator) access control model
- DreamDEX's own official `ec-*` bot-kit strategies use only direct owner-key trading — no operator/session-key flow — confirming this is the intended, current design

### Reproduction

```ts
// 1. Grant permissions (succeeds — registry write goes through)
await trader.setOperatorApprovalGlobal({
  operator: operatorAddress,
  selectors: ["0x80054449"], // PLACE_ORDER_FOR_SELECTOR
  approved: true,
});

// 2. Check authorization against a BinaryPool (reverts)
await client.isOperatorAuthorized({
  pool: binaryPoolAddress,  // ← BinaryPool, not SpotPool
  owner: ownerAddress,
  operator: operatorAddress,
  selector: "0x80054449",
});
// → ContractRevertError (reverts, not returns false)
```

### Impact

The official Operators & Session Keys docs page (`docs.dreamdex.io/trading/readme-1/operators`) does not scope the feature as spot-only — it reads as if operator/session-keys apply broadly across market types. A developer building an Event Contracts app (as we were) would reasonably expect this feature to work and lose significant time debugging an opaque revert before discovering the architectural boundary.

### Suggestion

Either:
- **(a)** Explicitly document that operator/session-keys are currently **spot-only** and do not extend to binary Event Contract pools
- **(b)** Consider extending operator support to BinaryPools in a future release — session-key UX is genuinely valuable for consumer-facing Event Contract apps (e.g., a "one-tap trading" button where the user signs once and a bot handles order placement)

---

## Finding 5: Tick size and lot size are per-market, not clearly signposted for onboarding

**Category:** Documentation clarity
**Severity:** Low (correct design, but onboarding friction)

### Issue

Tick size and lot size are per-market/per-pool parameters that must be read at runtime via pool params or SDK helpers. This is correct design (markets legitimately have different ticks), but it's not clearly signposted in onboarding docs for developers accustomed to fixed-tick venues.

### Evidence

- `getPoolTickSize(client, pool)` returns a runtime-read bigint — confirmed working
- No global constant or documentation warning that tick sizes vary across markets
- An early implementation assumption of a fixed 0.001 tick (1e15 at 18dp) was plausible but wrong for at least one market with a different tick

### Impact

Minor onboarding friction — a developer might initially hardcode a tick size and then hit unexpected behavior on markets with different ticks. The SDK provides the correct tool (`getPoolTickSize`) but the need to use it isn't obvious from the docs.

### Suggestion

Add a brief note in the binary market trading docs: *"Tick size is per-pool and varies by market. Always read it at runtime via `getPoolTickSize()` or the pool's `getPoolParams()` — never assume a fixed constant."*

---

## Finding 6: Indexer lag vs on-chain truth is a real, recurring gap

**Category:** SDK behavior / Documentation gap
**Severity:** Medium (causes failed transactions and confusing UX if unhandled)

### Issue

Multiple operations — order fills, redeemable balances, market status — can show stale or incorrect data via the indexer for several seconds after a transaction confirms on-chain. This is a real architectural gap that requires explicit handling, not a hypothetical edge case.

### Evidence

- **Market status lag:** Indexer labeled a market "Resolved" while on-chain status was still `Settling` (3). Attempting `redeemMarket` at this point would revert with `WrongStatus`.
- **Balance lag:** After an order filled on-chain, `getOutcomeBalances` (indexer read) returned 0 for several seconds, causing `InsufficientBalance` on redemption.
- **Fix implemented:** We built `getOutcomeBalanceOnchain()` using the SDK's direct `client.getOutcomeBalance(p)` (ERC-6909 `eth_call`) to bypass the indexer for balance reads, and `getOnChainMarketStatus()` using `client.getMarketOnchain()` for status reads.

### Impact

Without explicit on-chain fallbacks, developers will encounter:
- Failed `redeemMarket` calls due to stale status
- `InsufficientBalance` errors despite confirmed fills
- Confusing UX where operations appear to fail for no clear reason

### Suggestion

Call this out prominently in onboarding docs as a **"must handle" pattern**, not something developers discover through trial and error. Consider adding a "Lag and Timing" section to the SDK docs, or an `ensureOnChainStatus()` helper that the SDK provides natively.

---

## Finding 7: Voided-market redemption requires manual dual-outcome handling

**Category:** SDK correctness trap
**Severity:** Medium (silent partial refund if unhandled)

### Issue

The SDK's `redeem()` function takes an explicit `outcomeIdx` (0 = YES, 1 = NO). When `outcomeIdx` is omitted, it auto-looks up the winning outcome via `payoutNumerators` argmax. In a **voided market** (oracle failure → both sides redeem at par), both payout numerators are equal — and the auto-lookup picks YES via a tiebreak (index 0 wins when values are equal). This means naive use of the auto-lookup path silently redeems only YES, missing the user's entire NO-side balance.

### Evidence

- SDK source (`binary/settlement.js`): auto-lookup uses `argmax(payoutNumerators)` — when both are equal, index 0 (YES) wins the tiebreak
- `RedeemParams.outcomeIdx` docs: *"Looked up via `market.winningOutcome()` when omitted"* — but voided markets have `winningOutcome: null`, so the lookup falls back to `payoutNumerators`
- We verified this by reading both balances and making separate `redeem()` calls per outcome

### Impact

A developer using `trader.redeem({ marketId, amount })` without specifying `outcomeIdx` on a voided market would get back only ~50% of their refund. The remaining YES-side balance would be permanently locked unless they make a second explicit call for the NO side.

### Suggestion

Document explicitly: *"For voided markets, always pass `outcomeIdx` explicitly and make separate `redeem()` calls for each outcome with a non-zero balance. Do not rely on the auto-lookup path."* Consider adding a `redeemVoided(marketId, yesAmount, noAmount)` convenience method.

---

## Finding 8: Redeem amount must be read from actual on-chain outcome-token balance, not pool backing

**Category:** Documentation clarity
**Severity:** Medium (causes `InsufficientBalance` if wrong value used)

### Issue

The value to pass as `amount` in `trader.redeem()` must be the user's **actual on-chain outcome-token balance** for the relevant outcome — not the pool's `backing` or `netBacking` field. These are pool-level aggregate figures, not per-user holdings. Using them as the redeem amount causes `InsufficientBalance` if the user holds less than the full pool backing (which is almost always the case).

### Evidence

- Early implementation used `BigInt(market.netBacking ?? market.backing)` as the redeem amount — this is the pool's total backing, not the user's balance
- Live testnet failure: `InsufficientBalance` revert when attempting to redeem 10 USDC worth of tokens when the user only held ~5 USDC from a partial fill
- Fix: read actual balance via `client.getOutcomeBalance({ outcomeToken, account, id })` (ERC-6909 direct read) and use that as the redeem amount

### Impact

Any developer who reads `backing`/`netBacking` from the market object and passes it to `redeem()` will hit `InsufficientBalance` on any partially-filled or traded position.

### Suggestion

Add to the settlement/redemption docs: *"The `amount` parameter must be your on-chain outcome-token balance (read via `getOutcomeBalance` or equivalent), NOT any pool-level aggregate figure like `backing` or `netBacking`."*

---

## Summary

Despite these eight findings, the core SDK — trading (`placeOrder`, `cancelOrder`), settlement (`redeem`, `redeemMany`), portfolio queries (`getPortfolio`, `getOutcomeBalances`), market discovery (`fetchMarkets`), and order book streaming (`watchMarket`) — worked reliably and let us build a fully functional, tested trading engine end-to-end on live testnet. The SDK's bigint-exact arithmetic, ERC-6909 outcome-token model, and module-routed settlement are solid architectural foundations.

The gaps documented above are primarily in documentation accuracy and configuration completeness — the underlying contract and SDK implementations are sound. Addressing these findings would meaningfully reduce onboarding friction for the next wave of hackathon participants and production builders.

**223 unit tests passing, 0 failing** — covering client creation, bigint conversion, market filtering, order placement, settlement (resolved + voided), operator grants, complete-set minting, on-chain status gating, portfolio queries, order book streaming, price feeds, and error mapping.
