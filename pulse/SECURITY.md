# Pulse Engine — Security Audit

**Audit date:** 2026-08-26 (engine) / 2026-09-05 (MCP server, section 11)  
**Scope:** `pulse/src/engine/**`, `pulse/mcp-server/**`, spike adapters (`spike-thirdweb-aa/`, `spike-privy-pimlico/`), demo scripts, frontend `/connect-agent` page  
**Standard:** Onyx-equivalent rigor — prove, don't trust; bound blast radius; honest demo.

---

## Executive Summary

**Overall risk posture: GOOD (testnet), needs hardening for production.**

The engine is well-structured with explicit security patterns: on-chain status gates on all write paths, void-aware redemption, string-based decimal arithmetic, and typed error mapping. The primary risks are operational (secrets leakage, no `.gitignore`) and design-level (Thirdweb adapter stubs, float arithmetic in risk engine, unlimited ERC-20 approvals). No critical fund-loss paths were found in the engine itself — DreamDEX contracts handle custody, and the engine is a thin signing layer.

**Risk posture by area:**
- Value integrity: **Strong** — string-based `toBigintAmount`, `snapToTick`, on-chain balance reads
- Market lifecycle: **Strong** — `assertMarketWritable` gates all writes, on-chain status check
- Settlement/redemption: **Strong** — void-aware dual-side redemption, on-chain balance reads
- Gas sponsorship: **Good** — Thirdweb `sponsorGas` tested end-to-end; thin adapter is clean but un-audited
- Secrets/ops: **Weak** — `.env` files with real API keys exist in spike dirs, no `.gitignore` anywhere
- Risk engine: **Medium** — `parseFloat` in `checkRiskLimits` can lose precision; `flattenBeforeExpiry` uses `lastPrice` as bigint but it's a string

---

## 1. Threat Model

| Adversary | Goal | Assets at Risk | Who Can Authorize | Blast Radius Limit |
|-----------|------|----------------|--------------------|--------------------|
| Malicious frontend / XSS | Trigger unintended trades or approvals | User's outcome tokens, collateral | Browser session (embedded wallet) | Thirdweb `sponsorGas` is per-transaction; engine checks market status on-chain before each write |
| Stolen browser session | Drain positions, place predatory orders | All open positions, resting orders | Thirdweb personal account (guest login) | Guest login = disposable; no long-term savings key; smart account has separate custody |
| Stolen server key (DEMO_PRIVATE_KEY) | Trade as demo wallet | Demo wallet's collateral + gas | Server env var | Demo-only; labeled DEMO-ONLY in `demo.ts` docs; mainnet guard in `assertTestnet` |
| Hostile RPC / poisoned indexer | Wrong prices, false "resolved", false balances | Incorrect trade decisions (not direct fund loss) | N/A — read-only | Engine reads on-chain status for all writes (`assertMarketWritable`); redeem uses on-chain ERC-6909 balance |
| Sponsorship abuse | Drain Thirdweb gas budget | Thirdweb's gas sponsorship pool | Thirdweb account | Thirdweb manages sponsorship limits; no open faucet→withdraw loop in engine |
| User error | Trade after lock, redeem wrong side | Position value | User | Engine refuses writes when Locked/Resolved/Voided; voided markets trigger dual-side redeem |
| Supply-chain | Malicious dependency | N/A (supply chain) | N/A | Engine uses pinned `@somnia-chain/markets-sdk@^0.28.1` + `viem@^2.55.19`; no transitive risk from engine code |

### Key Architecture Insight

```
User → Thirdweb in-app wallet (personal key, guest/social login)
     → Thirdweb smart wallet (sponsorGas: true, ERC-4337)
     → OperatorSigner adapter (~30 lines, wraps sendTransaction as writeContract)
     → Engine (placeMarketOrder, mintCompleteSet, redeemMarket, etc.)
     → DreamDEX contracts (BinaryPool, BinarySettlement, TestUSDC)
```

- **BinaryPool has no operator gate** — `placeOrderFor` / operator session UX is not available for binary markets.
- Gas sponsorship and smart wallets make the **owner path** seamless; they do **not** add BinaryPool operators.
- The operator permissions registry (`0x15C7e8CE38F021c5b45d098AaD788f63090bF20A`) is configured in `client.ts` but **not used** by any engine write path — all writes go through the owner (smart account) directly.

---

## 2. Findings

| ID | Severity | Area | Finding | Status |
|----|----------|------|---------|--------|
| SEC-01 | **CRITICAL** | Ops | `.env` files with real API keys in spike dirs, no `.gitignore` | OPEN |
| SEC-02 | **HIGH** | Sponsorship | Thirdweb `writeContract` adapter has untyped stubs | OPEN |
| SEC-03 | **HIGH** | Value Integrity | `riskEngine.ts` uses `parseFloat` for amount conversion | OPEN |
| SEC-04 | **MEDIUM** | Value Integrity | `flattenBeforeExpiry` uses `lastPrice` as bigint but it's a string | OPEN |
| SEC-05 | **MEDIUM** | Gas Sponsorship | No rate limiting on faucet calls | OPEN |
| SEC-06 | **MEDIUM** | Gas Sponsorship | `mintCompleteSetNative` path is UNTESTED against DreamDEX | OPEN |
| SEC-07 | **LOW** | Settlement | `redeemMultipleMarkets` uses `market.netBacking` for amount, not on-chain balance | OPEN |
| SEC-08 | **LOW** | Testing | No integration tests against live Shannon testnet | OPEN |
| SEC-09 | **INFO** | Settlement | Oracle explorer URL format is best-effort, unverified | OPEN |

---

## 3. Detailed Findings

### SEC-01 — CRITICAL: Secrets in `.env` files with no `.gitignore`

**Files:**
- `spike-privy-pimlico/.env` — contains `PRIVY_APP_SECRET`, `PIMLICO_API_KEY`
- `spike-privy-pimlico/src/.env` — same credentials (copied for runtime)
- `spike-thirdweb-aa/.env` — contains `THIRDWEB_SECRET_KEY`
- `spike-thirdweb-aa/src/.env` — same credentials (copied for runtime)

**No `.gitignore` exists anywhere in the repository** — not at root, not in `pulse/`, not in spike dirs. If any of these directories are committed, all API keys and secrets are exposed in git history.

**Impact:** An attacker with repo access gets Privy app admin access, Pimlico API access, and Thirdweb secret key access. These can be used to impersonate the app, access user wallets (Privy), or sponsor transactions on the app's behalf (Pimlico/Thirdweb).

**Fix:**
1. Create a root `.gitignore` that excludes `.env` files, `node_modules/`, and build artifacts.
2. Rotate all exposed credentials immediately.
3. Move spike `.env` files to `.env.local` (already gitignored by convention) or ensure they're in `.gitignore`.

---

### SEC-02 — HIGH: Thirdweb `writeContract` adapter has untyped stubs

**File:** `spike-thirdweb-aa/src/spike.ts` (lines ~100-130)

The `createOperatorSignerAdapter` creates a `WalletClient` with stub methods:

```ts
async sendTransaction() { throw new Error("use writeContract"); },
async signMessage() { throw new Error("use account.signMessage"); },
async signTypedData() { throw new Error("use account.signTypedData"); },
async signTransaction() { throw new Error("use account.signTransaction"); },
async getAddresses() { return [accountAddress]; },
async request() { throw new Error("not implemented"); },
```

These stubs satisfy the viem `WalletClient` type at compile time but throw at runtime. If any engine code path (now or in future) calls `sendTransaction` or `request` on the wallet client, it will fail silently at the wrong layer.

**Impact:** Medium — currently no engine code calls these stubs, but the type system gives false confidence.

**Fix:** Add JSDoc warnings on each stub, and consider throwing a more descriptive error that includes the caller context. When integrating into the engine, add a type guard or wrapper that validates the adapter shape.

---

### SEC-03 — HIGH: `riskEngine.ts` uses `parseFloat` for amount conversion

**File:** `pulse/src/engine/riskEngine.ts` (lines ~180, ~200)

```ts
const proposedRaw = BigInt(
  Math.round(parseFloat(proposedHumanAmount) * 10 ** marketDecimals),
);
```

`parseFloat("0.1") * 10 ** 6` = `99999.99999999999` → `BigInt(Math.round(...))` = `100000n` — this works for small values but **fails for values where float precision matters**:

- `parseFloat("0.1234567") * 10 ** 6` = `1234566.9999999999` → `1234567n` ✓ (rounds correctly)
- `parseFloat("999999.99") * 10 ** 6` = `999999990000` → `999999990000n` ✗ (should be `999999990000n` but `999999.99 × 10^6` in float is `999999990000.000012` which rounds to `999999990000n` — acceptable)

The real risk: **`proposedHumanAmount` is an untrusted input** from the UI/caller. If it contains more than ~15 significant digits, `parseFloat` silently truncates, allowing a position that exceeds the risk limit to pass the check.

**Impact:** A user (or malicious frontend) could submit a position size with excessive precision that passes `checkRiskLimits` due to float truncation, then the engine converts it correctly via `toBigintAmount` (which uses string math) — resulting in a position larger than the limit.

**Fix:** Replace `parseFloat(proposedHumanAmount) * 10 ** marketDecimals` with `toBigintAmount(proposedHumanAmount, marketDecimals)` which uses string arithmetic and rejects over-precision inputs. The existing `toBigintAmount` function in `units.ts` already handles this correctly.

---

### SEC-04 — MEDIUM: `flattenBeforeExpiry` uses `lastPrice` as bigint but it's a string

**File:** `pulse/src/engine/riskEngine.ts` (line ~265)

```ts
const lastPrice = (market as { lastPrice?: string | null }).lastPrice;
const price = lastPrice && parseFloat(lastPrice) > 0
  ? fromBigintAmount(BigInt(lastPrice), quoteDecimals)
  : "0.51";
```

`lastPrice` from `BinaryMarket` is a **string** (e.g. `"600000"` for 0.6 at 6dp), but the code treats it as a raw bigint by calling `BigInt(lastPrice)` then `fromBigintAmount`. This only works if `lastPrice` is already in raw bigint-scaled format. If the SDK changes `lastPrice` to be human-readable (e.g. `"0.6"`), this breaks silently and produces wrong prices.

Additionally, `parseFloat(lastPrice) > 0` uses float comparison which is fine for this use case but inconsistent with the engine's string-math philosophy.

**Impact:** If `lastPrice` format changes, `flattenBeforeExpiry` sends orders at wildly wrong prices — potentially selling positions at 0 or at the wrong scale.

**Fix:** Validate the `lastPrice` format explicitly. If it's already in raw units, use `fromBigintAmount(BigInt(lastPrice), quoteDecimals)`. If it could be human-readable, add a format detection step. Document the expected format.

---

### SEC-05 — MEDIUM: No rate limiting on faucet calls

**File:** `pulse/src/engine/demo.ts`, `pulse/src/engine/client.ts`

The `requestTestFunds` / `requestDemoFunds` functions call the testnet faucet with no rate limiting. On testnet this is low-risk (it's free test USDC), but the same pattern could be copy-pasted to mainnet faucet contracts.

**Impact:** On testnet, a script could drain the faucet contract's balance. On mainnet (if a faucet exists), this could be exploitable.

**Fix:** Add a comment noting this is testnet-only. For production, implement per-address rate limiting or use a server-side relay with auth.

---

### SEC-06 — MEDIUM: `mintCompleteSetNative` path is UNTESTED

**File:** `pulse/src/engine/sets.ts` (line ~95)

```ts
/**
 * **UNTESTED against DreamDEX's confirmed 6dp test USDC collateral path.**
 * DreamDEX Event Contracts use test USDC (ERC-20), not native SOMI. This
 * function is for markets where the collateral IS wrapped native (wSOMI).
 * Verify this path is deployed before using it in production.
 */
```

The function is exported from `index.ts` and available to callers. If someone uses it on a USDC-collateral market, it will fail or behave unexpectedly.

**Impact:** Calling `mintCompleteSetNative` on a USDC-collateral market would attempt to pay with native STT instead of ERC-20 USDC, likely reverting on-chain.

**Fix:** The existing comment is adequate. Ensure the function is not called on USDC-collateral markets by checking the market's `collateral` field before dispatching.

---

### SEC-07 — LOW: `redeemMultipleMarkets` uses `market.netBacking` for amount

**File:** `pulse/src/engine/settlement.ts` (line ~180)

```ts
const backingStr = market.netBacking ?? market.backing;
const amount = BigInt(backingStr);
```

For batch redemption, the code uses `netBacking` (pool-level total) rather than the user's actual on-chain balance. This works when the user holds the full pool backing (rare), but for partial holders, the redeem will revert with `InsufficientBalance`.

Compare with `redeemMarket` (single-market), which correctly uses `getOutcomeBalanceOnchain` for the actual user balance.

**Impact:** Low — the on-chain contract will reject the batch if the user doesn't hold enough tokens, so no fund loss. But the error message is opaque (contract revert instead of a clear engine error).

**Fix:** Use `getOutcomeBalanceOnchain` for each market in the batch, matching the single-market pattern.

---

### SEC-08 — LOW: No integration tests against live Shannon testnet

**File:** `pulse/src/engine/__tests__/*.test.ts` (all 20 files)

All tests use mocked clients with fake data. There are no integration tests that hit the real Shannon testnet RPC or indexer. The demo script (`scripts/demo-lifecycle.ts`) serves as an informal integration test but is not automated.

**Impact:** Bugs in SDK interaction, RPC response parsing, or indexer desync would only be caught at runtime.

**Fix:** Add a `test:integration` script that runs a minimal happy-path against testnet (discover market → mint → place → cancel → redeem) with real RPC calls. Mark it as `testnet-only` and skip in CI if env vars are not set.

---

### SEC-09 — INFO: Oracle explorer URL format is best-effort

**File:** `pulse/src/engine/settlement.ts` (line ~65)

```ts
const ORACLE_EXPLORER_BASE = "https://prd.oracle.somnia.host/explore";
// Best-effort deep link: base + /{questionId}
// Verified format TBD — see ORACLE_EXPLORER_BASE comment above.
```

The oracle explorer URL is constructed by appending `/{questionId}` to the base URL. The exact deep-link format has not been verified against a real resolved market.

**Impact:** Info only — the receipt page renders correctly with a null URL if the format is wrong. No security impact.

**Fix:** Verify against a real resolved market before demo day.

---

## 4. Contract / Method Allowlist

The engine may call these DreamDEX contracts and methods:

| Contract | Address (Testnet) | Methods | Purpose |
|----------|-------------------|---------|---------|
| TestUSDC | `0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E` | `faucet(uint256)`, `approve(address,uint256)`, `balanceOf(address)` | Test collateral |
| BinaryPool | Dynamic (per market) | `mintSet(address,address,uint256)`, `burnSet(address,address,uint256)`, `placeOrder(...)`, `cancelOrder(...)` | Core trading |
| BinarySettlement | `SOMNIA_TESTNET_ADDRESSES.binarySettlement` | `finalizeAndRedeem(...)`, `redeem(...)` | Settlement |
| ERC-6909 Outcome Token | `SOMNIA_TESTNET_ADDRESSES.outcomeToken` | `balanceOf(address,uint256)` | Balance reads |
| BinaryMarketsModule | `SOMNIA_TESTNET_ADDRESSES.binaryMarketsModule` | `getMarketOnchain(bytes32)` | Status reads |
| OperatorPermissionsRegistry | `0x15C7e8CE38F021c5b45d098AaD788f63090bF20A` | (not called by engine) | Configured but unused |
| FakeOracle | Not in default addresses | `resolve(...)`, `voidMarket(...)` | Testnet force-resolve (demo only) |

---

## 5. Key Hierarchy Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER'S DEVICE                               │
│                                                                     │
│  ┌──────────────────┐    ┌──────────────────────────────────────┐  │
│  │ Thirdweb In-App   │    │ Thirdweb Smart Wallet                │  │
│  │ Wallet (Personal) │───▶│ (sponsorGas: true)                   │  │
│  │                   │    │ ERC-4337, gas sponsored               │  │
│  │ - Guest login     │    │                                      │  │
│  │ - EOA key         │    │ - 4337 entry point                   │  │
│  │ - Disposable      │    │ - Paymaster = Thirdweb               │  │
│  └──────────────────┘    └───────────┬──────────────────────────┘  │
│                                       │                             │
│  ┌────────────────────────────────────▼──────────────────────────┐  │
│  │ OperatorSigner Adapter (~30 lines)                            │  │
│  │ Wraps sendTransaction as writeContract                        │  │
│  │ Exposes: { walletClient: viem.WalletClient, account: Account }│  │
│  └────────────────────────────────────┬──────────────────────────┘  │
│                                       │                             │
│  ┌────────────────────────────────────▼──────────────────────────┐  │
│  │ Pulse Engine (src/engine/)                                     │  │
│  │ - placeMarketOrder, placeLimitOrder                           │  │
│  │ - mintCompleteSet, burnCompleteSet                            │  │
│  │ - redeemMarket, claimAllRedeemable                            │  │
│  │ - statusGate (on-chain check before every write)              │  │
│  │ - riskEngine (position limits)                                │  │
│  └────────────────────────────────────┬──────────────────────────┘  │
│                                       │                             │
└───────────────────────────────────────┼─────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     SOMNIA SHANNON TESTNET (50312)                   │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ BinaryPool    │  │ TestUSDC     │  │ BinarySettlement         │  │
│  │ (per market)  │  │ (ERC-20)     │  │ (singleton)              │  │
│  │               │  │              │  │                          │  │
│  │ NO operator   │  │ faucet()     │  │ finalizeAndRedeem()      │  │
│  │ gate on       │  │ approve()    │  │                          │  │
│  │ binary pools  │  │ balanceOf()  │  │                          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
│                                                                     │
│  msg.sender = Smart Account address (ERC-4337)                     │
│  No operator delegation — owner path only                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. Abuse Cases for Sponsorship + Faucet

### Abuse Case 1: Faucet → Withdraw Profit Loop

**Scenario:** User calls `faucet()` to get 10,000 test USDC, sells on the order book, withdraws profit via settlement.

**Mitigation:**
- Testnet only — test USDC has no real value
- No withdrawal path from DreamDEX to external address (only settlement to the same address)
- The faucet contract has its own rate limiting (not controlled by Pulse)
- Document: "Test tokens are not redeemable for real assets"

### Abuse Case 2: Sponsorship Gas Drain

**Scenario:** Attacker calls `faucet()` repeatedly to drain Thirdweb's gas sponsorship budget.

**Mitigation:**
- Thirdweb manages sponsorship limits at the account level
- Guest login creates a new account per session — no persistent abuse vector
- Engine does not expose an open faucet endpoint
- Thirdweb's `sponsorGas` policy is configured per-app in their dashboard

### Abuse Case 3: Smart Account Takeover

**Scenario:** Attacker gains access to the Thirdweb in-app wallet (personal account) and signs transactions as the smart account.

**Mitigation:**
- Guest login = disposable key, no long-term value
- Smart account only holds testnet tokens (no mainnet funds)
- Engine performs on-chain status checks before every write
- Thirdweb's SDK handles key management (keys never leave the device in production)

---

## 7. Honest Limitations (Protocol + Demo)

### Protocol Limitations

1. **BinaryPool has no operator gate** — `placeOrderFor` / operator session-key trading is not available for binary event contracts. The operator permissions registry (`0x15C7e8CE38F021c5b45d098AaD788f63090bF20A`) is configured but unused.

2. **Gas sponsorship is Thirdweb-dependent** — if Thirdweb's sponsorship goes down, users need STT gas. No fallback path is implemented.

3. **SDK version pinned to `^0.28.1`** — breaking changes in the SDK could affect engine behavior. No version lockfile detected.

4. **`mintCompleteSetNative` is UNTESTED** — the native-token collateral path is not confirmed to work on DreamDEX testnet.

### Demo Limitations

1. **Test USDC is not real money** — all faucet calls produce test tokens with no economic value.

2. **Demo script waits for natural resolution** (~15 min) — this is a real oracle resolution, not force-resolved. Force-resolve requires an undocumented FakeOracle address not available to us.

3. **Seeded liquidity** — the demo places limit orders at 0.55 which may or may not fill depending on order book state. This is not fabricated — it's a real order on a real pool.

4. **Sponsorship depends on Thirdweb account standing** — if the app's Thirdweb account is suspended or out of quota, sponsorship fails. This is a testnet dependency, not a code bug.

5. **Oracle explorer URL is best-effort** — the exact deep-link format for `prd.oracle.somnia.host/explore/{questionId}` has not been verified against a real resolved market.

---

## 8. Remediation Plan (Ordered by Severity)

### Immediate (before demo)

| # | Finding | Fix | Effort |
|---|---------|-----|--------|
| 1 | SEC-01: `.env` with real keys, no `.gitignore` | Create root `.gitignore`; rotate all exposed credentials | 15 min |
| 2 | SEC-03: `parseFloat` in risk engine | Replace with `toBigintAmount(proposedHumanAmount, marketDecimals)` | 30 min |
| 3 | SEC-02: Thirdweb adapter stubs | Add JSDoc warnings + descriptive errors | 15 min |

### Short-term (before production)

| # | Finding | Fix | Effort |
|---|---------|-----|--------|
| 4 | SEC-04: `lastPrice` format in `flattenBeforeExpiry` | Add format detection or document expected format | 1 hour |
| 5 | SEC-07: `redeemMultipleMarkets` uses netBacking | Switch to `getOutcomeBalanceOnchain` per market | 2 hours |
| 6 | SEC-05: No faucet rate limiting | Add per-address rate limit comment + server-side relay plan | 30 min |
| 7 | SEC-08: No integration tests | Add `test:integration` script with real testnet calls | 4 hours |

### Before mainnet

| # | Finding | Fix | Effort |
|---|---------|-----|--------|
| 8 | SEC-06: `mintCompleteSetNative` untested | Test on testnet or remove from public API | 2 hours |
| 9 | SEC-09: Oracle explorer URL unverified | Verify against real resolved market | 30 min |
| 10 | Thirdweb adapter type safety | Replace stubs with proper viem-compatible wrapper or use SDK's own adapter when available | 4 hours |

---

## 9. Test / Proof Plan

### Automated Tests (existing)

All 20 engine modules have unit tests (`src/engine/__tests__/*.test.ts`). Run with:

```bash
cd pulse && npm test
```

### Live Proof (manual)

```bash
# Full lifecycle demo (real testnet, natural resolution)
DEMO_PRIVATE_KEY=0x... npm run demo

# Thirdweb sponsorship spike (gasless, end-to-end)
cd spike-thirdweb-aa && npm run spike
```

### Integration Test (proposed)

```bash
# Automated testnet integration (to be added)
npm run test:integration
```

Should exercise: `faucet → mint → place → cancel → redeem → receipt` with real RPC calls and print tx hashes.

---

## 10. Residual Risk After Fixes

| Risk | After Fix | Residual |
|------|-----------|----------|
| Secrets exposure | `.gitignore` + credential rotation | Low — depends on git history not being public |
| Float precision in risk engine | `toBigintAmount` replacement | Low — string math is exact |
| Thirdweb adapter type safety | JSDoc + descriptive errors | Low — no runtime surprises |
| `redeemMultipleMarkets` wrong amount | `getOutcomeBalanceOnchain` | Low — on-chain read is authoritative |
| Sponsorship dependency | Thirdweb dashboard config | Medium — external dependency, no fallback |
| BinaryPool no operator gate | Protocol limitation, documented | N/A — cannot be fixed in code |
| SDK breaking changes | Version pinning | Low — requires monitoring |

---

---

## 11. Pulse MCP Server — Security Review (2026-09-05)

**Scope:** `pulse/mcp-server/**` (Vercel serverless functions `api/*.ts`, shared `src/*` handlers, vendored engine copy `src/engine/`, long-running host `src/railway.ts` + `src/httpServer.ts`), and the frontend `/connect-agent` page that wraps the live `/connect` endpoint.  
**Posture: GOOD for testnet read-only/draft-only access; NOT a production auth boundary.**

The MCP server is a separate deployable (own `package.json`, own Vercel project) that imports a vendored copy of the engine for read-only tool implementations. It deliberately holds no private key and has no execution path: every tool either reads public chain/indexer data or returns a draft link that the user must confirm in their own wallet.

### 11.1 Architecture

```
Browser (/connect-agent page)                    MCP client (Claude Desktop)
        | POST { address } to /connect                  |  Authorization: Bearer <token>
        v                                               v
/connect (Vercel fn)  -> HMAC token issued         /mcp (Vercel fn) -> tool execution
  (CORS-enabled)         bound to the public        (no CORS)         via vendored engine
                         wallet address                             -> read-only SDK calls
```

- **Token model:** `HmacTokenIssuer` (`src/hmacToken.ts`) signs `{ addr, iat, exp }` with HMAC-SHA256 over a server secret (`PULSE_MCP_SIGNING_SECRET`), verified with `timingSafeEqual` on every `/mcp` request. Serverless instances need no shared memory — the token self-contains its bound address and expiry. Revocation is by expiry only (default TTL 30 days, `PULSE_MCP_TOKEN_TTL_MS`).
- **Auth is address-based, not account-based:** the token proves the caller knew a public wallet address, NOT ownership of that wallet. Anyone can mint a token for any public address. This is acceptable only because every tool is read-only or draft-only and the data is public chain data.
- **Tool boundary (8 tools, all read-only / draft-only):** `list_live_markets`, `get_market_details`, `get_order_book`, `get_spot_price`, `get_my_portfolio`, `get_my_open_positions`, `get_my_claimable_positions`, `draft_trade_link`. The last validates inputs and returns a clickable Pulse URL (`src/draft.ts`); it never submits anything.
- **Serverless vs long-running host:** Vercel runs stateless (`PULSE_MCP_STATELESS=1`, no MCP sessions, JSON responses). Railway/Render run `src/railway.ts` (`src/httpServer.ts`) with in-memory sessions. On Vercel the signing secret is REQUIRED — `vercelSetup()` throws `TokenIssuerError` if `PULSE_MCP_SIGNING_SECRET` is unset, because the in-memory `AuthStore` cannot be shared across instances.
- **CORS:** `/connect` answers OPTIONS preflights and returns `Access-Control-Allow-Origin: *` (methods GET/POST/OPTIONS, headers Content-Type/Accept). Safe only because the endpoint issues public-address tokens and uses no cookies or credentials. `/mcp` sets NO CORS headers, so browsers cannot call it directly — desktop/server MCP clients are unaffected.

### 11.2 Threat Model

| Adversary | Goal | Assets at Risk | Blast Radius Limit |
|-----------|------|----------------|--------------------|
| Anyone | Mint a token for any public address | Public on-chain data of that address | Read-only tools only; no funds, no private keys, no submission path |
| Token thief (config copied / token leaked) | Use a stolen bearer token | Read-only data + draft links for the bound address | Token is bearer — treat as non-confidential; TTL limits reuse; no write path |
| Forger | Guess or forge a token | All address-bound reads | HMAC-SHA256 with a >= 16-char secret; `timingSafeEqual` comparison; forged payloads rejected |
| Malicious MCP client | Exfiltrate more than intended | The bound public address's data only | Tools never take a private key; portfolio tools read the token-bound address, not the client's |
| Supply chain | Compromise dependencies | MCP server execution | Pinned `@somnia-chain/markets-sdk@0.28.1` + `viem@2.55.19` (match `pulse/package.json`), `@modelcontextprotocol/sdk@^1.30.0`, `zod@^4.5.0`; vendored engine copy excludes `demo.ts` (no key material ships) |
| Cross-origin abuse | Use /connect from an attacker's site | Nothing — public token issuance only | Wildcard CORS is acceptable because the endpoint exposes no secrets and the tokens gate read-only access |

### 11.3 Findings

| ID | Severity | Area | Finding | Status |
|----|----------|------|---------|--------|
| MCP-01 | MEDIUM | Auth | Address-based auth proves knowledge of an address, not wallet ownership; tokens are bearer credentials | BY DESIGN (documented in code + `/connect-agent` honesty callout) |
| MCP-02 | MEDIUM | Ops | No rate limiting on `/connect` token issuance — anyone can mint tokens for any address | OPEN (acceptable on testnet read-only; add rate limiting before any production use) |
| MCP-03 | LOW | Supply chain | Vendored engine copy in `mcp-server/src/engine/` can drift from `pulse/src/engine/` | OPEN (sync discipline documented in the copy's header) |
| MCP-04 | INFO | Config hygiene | Tokens are stored in plaintext inside the Claude Desktop config the user pastes | OPEN (bearer value is limited to read-only access; still worth telling users in the page copy) |
| MCP-05 | INFO | CORS | `Access-Control-Allow-Origin: *` on `/connect` | BY DESIGN — no credentials, no cookies, public-address tokens only |
| MCP-06 | INFO | Lifecycle | Token revocation is by expiry only (default 30 days) | BY DESIGN (documented in `hmacToken.ts`) |

### 11.4 Honest Limitations

1. **Not account security.** The `/connect` flow binds a public wallet address; it does not prove the caller owns the wallet. This is stated on the `/connect-agent` page: "Authentication in this version is address-based, not full account security — do not rely on this as a private or exclusive access method."
2. **ChatGPT / OAuth not supported.** The hosted ChatGPT connector requires OAuth, which this version does not implement. Claude Desktop is the supported client. The `/connect-agent` page states this explicitly.
3. **Read-only + draft-only by construction.** The server holds no private key and cannot execute trades. `draft_trade_link` only returns a URL; the user must open, review, and confirm it in their own connected browser wallet.
4. **Testnet dependency.** All data is Somnia Shannon testnet. The SDK pins and addresses are testnet-only and must be re-reviewed before any mainnet deployment.

### 11.5 Environment Variables

| Variable | Required on Vercel | Purpose |
|----------|-------------------|---------|
| `PULSE_MCP_SIGNING_SECRET` | Yes | HMAC secret for stateless tokens (>= 16 chars; `openssl rand -hex 32`) |
| `PULSE_APP_URL` | No (defaults) | Base URL for `draft_trade_link` targets |
| `PULSE_MCP_PUBLIC_URL` | No | Canonical public origin shown to MCP clients |
| `PULSE_MCP_STATELESS` | Yes (`=1`) | Disable MCP sessions (serverless hosts) |
| `PULSE_MCP_TOKEN_TTL_MS` | No | Token lifetime (default 30 days) |
| `PULSE_MCP_SESSION_IDLE_TTL_MS` | No | Idle session TTL for the long-running host (default 30 min) |
| `PORT` / `PULSE_MCP_PORT` | No | Listen port for the long-running host |

---

*Generated by security audit on 2026-08-26, MCP server review 2026-09-05. Review before demo day.*
