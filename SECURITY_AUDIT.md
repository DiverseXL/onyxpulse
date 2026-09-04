# Pulse Frontend -- Security Audit

**Date:** 2026-09-01
**Scope:** `pulse-frontend/` -- Next.js 16 client-side application
**Chain:** Somnia Shannon Testnet (chain 50312)
**Reviewer:** Automated audit (Codebuff)

---

## 1. Executive Summary

Pulse is a client-side Next.js application for binary options trading on the Somnia Shannon testnet. The app connects to user wallets via MetaMask (injected connector), places on-chain orders, and manages settlement/redemption. Because the application operates exclusively on a testnet with no real-value assets, the overall risk profile is low. However, the codebase is clearly designed to be production-ready, so this audit applies mainnet-grade criteria.

**Overall rating: PASS with caveats.** No critical or high-severity vulnerabilities were found that would compromise user funds or private keys. Several medium and low-severity issues are documented below with remediation guidance.

---

## 2. Architecture Overview

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 16.3.3 (App Router) | Client-side rendering only (`'use client'`) |
| Wallet | wagmi 2.14 + viem 2.55 | Injected connector only (MetaMask) |
| State | React Context + TanStack Query | No Redux, no server state leaking |
| SDK | `@somnia-chain/markets-sdk` 0.28.1 | Whitelisted import boundary via `lib/engine/index.ts` |
| Styling | CSS Modules + Tailwind | No inline `style` with user input |
| Testing | Vitest + Playwright | Unit, integration, and E2E coverage |

**Key security boundary:** All on-chain transactions flow through `lib/wallet/placeOrder.ts` -> `lib/engine/trading.ts` -> SDK. The wallet's private key never leaves MetaMask; the app only calls `walletClient.sendTransaction()`.

---

## 3. Findings

### 3.1 CRITICAL -- None identified

No critical vulnerabilities found. Private keys are never handled by the application code (they remain inside MetaMask/injected wallet). The `createTrader({ privateKey })` function exists in `lib/engine/client.ts` but is only used for server-side/CLI tooling (`demo.ts`), which is explicitly excluded from the public export boundary in `lib/engine/index.ts`.

### 3.2 HIGH -- None identified

### 3.3 MEDIUM

#### M-01: Missing `rel="noopener noreferrer"` on some external links

**Files:** `components/markets/AppChromeNav.tsx` (lines 81-82, 143-144)

Several `<a>` tags linking to external sites (`shannon-faucet.somnia.network`) use `target="_blank"` but omit `rel="noopener noreferrer"`. In older browsers, this allows the opened page to access `window.opener` and potentially redirect the parent page (reverse tabnapping).

**Recommendation:** Add `rel="noopener noreferrer"` to all external `<a target="_blank">` links. The faucet accordion items (`app/faucet/page.tsx`) correctly use `window.open()` with explicit `noopener,noreferrer`, which is the preferred pattern already in use.

**Status:** Low risk on testnet. Should be fixed before mainnet.

---

#### M-02: No Content Security Policy (CSP) headers configured

**File:** `next.config.ts`

The Next.js configuration is empty (`nextConfig: {}`). There are no CSP, X-Frame-Options, X-Content-Type-Options, or Strict-Transport-Security headers. This means:
- The app can be framed by malicious sites (clickjacking).
- No restriction on script sources (XSS surface if any injection point is found).
- No强制 HTTPS (though the RPC endpoints use HTTPS).

**Recommendation:** Add security headers in `next.config.ts`:
```ts
const nextConfig: NextConfig = {
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    },
  ],
};
```

**Status:** Low risk on testnet. Should be implemented before mainnet.

---

#### M-03: Dynamic import via `Function()` constructor

**File:** `lib/wallet/thirdwebAdapter.ts` (line 78)

```ts
const tw = await (Function('return import("thirdweb")')() as Promise<...>);
```

This uses the `Function` constructor to create a dynamic import, which is functionally equivalent to `eval()`. While the string is a static literal (not user-controlled), this pattern:
- Bypasses static analysis tools and bundler tree-shaking.
- Could be flagged by CSP `script-src` policies.
- Is a code smell that may hide dependency issues.

**Recommendation:** Replace with a standard dynamic `import()` call:
```ts
const tw = await import('thirdweb');
```

**Status:** The thirdweb adapter appears to be legacy code (the app now uses wagmi/injected connector). Consider removing the file entirely if unused.

---

#### M-04: `createTrader()` and `requestDemoFunds()` accept raw private keys

**File:** `lib/engine/client.ts` (lines 58-105)

The `createTrader()` and `requestDemoFunds()` functions accept hex-encoded private keys as string parameters. While these are not exposed in the browser bundle (they are not imported by any client page), they exist in the `lib/` directory which is co-located with client code.

If a bundler misconfiguration or serverless function accidentally imports these into a client bundle, private keys could be leaked.

**Recommendation:**
1. Move `createTrader` and `requestDemoFunds` into a separate `lib/server/` or `scripts/` directory that is excluded from the client bundle.
2. Add a build-time assertion or ESLint rule to prevent importing these from client code.
3. The `lib/engine/index.ts` correctly excludes `demo.ts` -- apply the same pattern to `client.ts`'s private-key functions.

**Status:** Not exploitable in current architecture. Precautionary for production.

---

### 3.4 LOW

#### L-01: Settings stored in localStorage without integrity checks

**File:** `lib/settings.ts`

User settings (risk limits, auto-flatten preferences, default trade amounts) are stored in `localStorage` keyed by wallet address. The `loadSettings()` function uses `JSON.parse()` with a `try/catch` fallback to defaults, but does not validate the shape of parsed data.

A user (or browser extension) could tamper with `localStorage` to:
- Set `riskLimitsEnabled: false` to bypass risk checks.
- Set extreme risk limit values.
- Set `defaultTradeAmount` to a very large number.

**Mitigating factors:**
- Risk limits are opt-in and user-configurable by design.
- All values are re-validated at the point of use (e.g., `validateAmount()` before order submission).
- The risk engine reads on-chain positions, not localStorage values, for exposure calculations.

**Recommendation:** Add schema validation (e.g., Zod) when loading settings, or at minimum validate that numeric fields are finite and within reasonable bounds.

---

#### L-02: Clipboard API access without error handling scope

**Files:** `app/faucet/page.tsx`, `app/portfolio/page.tsx`

The clipboard write operations use `navigator.clipboard.writeText()` with a `try/catch` that silently swallows errors. While this is acceptable UX (the button just doesn't copy), it means the user gets no feedback when clipboard access is denied by the browser.

**Recommendation:** Show a brief error state (e.g., "Copy failed -- check browser permissions") instead of silently failing.

---

#### L-03: Chain ID validation reads from wallet client but does not re-verify after async gaps

**File:** `lib/wallet/chainGuard.ts`

`assertCorrectChain()` reads `walletClient.chain?.id` at call time. This is correct and reads the live wallet state. However, in `placeOrder.ts`, there is a window between the chain check and the actual `sendTransaction` call where the user could switch chains in MetaMask (the prompt is visible for several seconds).

**Mitigating factors:**
- MetaMask prevents chain switching while a transaction prompt is open.
- The SDK likely includes its own chain validation.
- This is a known limitation of all client-side dApps.

**Recommendation:** Acceptable as-is for testnet. For mainnet, consider adding a post-send chain verification or using wagmi's `sendTransaction` which handles chain validation internally.

---

#### L-04: `window.open()` used without return value check

**File:** `app/faucet/page.tsx` (line 263)

```ts
onClick={() => window.open(source.url, '_blank', 'noopener,noreferrer')}
```

`window.open()` can return `null` if the browser blocks the popup. The current code does not handle this case, but since the intent is navigation (not popup-dependent logic), this is acceptable.

---

### 3.5 INFORMATIONAL

#### I-01: No private keys in the repository

Searched for hex strings matching the pattern `0x[0-9a-fA-F]{64}` -- all matches are either:
- Hardcoded test market IDs (e.g., `0x000...001`).
- Example receipt data in `ReceiptBody.tsx`.
- Type annotations in engine code.

No private keys or secrets were found committed to the repository. The `.gitignore` correctly excludes `.env` files.

---

#### I-02: RPC endpoints are public testnet endpoints

**File:** `lib/wallet/wagmiConfig.ts`, `lib/engine/client.ts`

All RPC URLs (`https://api.infra.testnet.somnia.network/http`, `wss://api.infra.testnet.somnia.network/ws`) and indexer URLs (`https://dev.smk.somnia.host/v1/graphql`) are hardcoded public testnet endpoints. No API keys are required. This is correct for testnet but should be moved to environment variables for mainnet with rate-limited API keys.

---

#### I-03: Test coverage for security-critical paths

The following security-critical paths have test coverage:

| Path | Test file | Coverage |
|---|---|---|
| Chain ID guard | `__tests__/chainGuard.test.ts` | Thorough -- verifies assertion runs before every transaction type |
| Claim confirmation gate | `__tests__/claimAll-confirmation.test.ts` | Verifies modal before `claimAllRedeemable` |
| Double-submission prevention | `__tests__/double-submission.test.ts` | Verifies idempotent settings saves |
| Amount validation | `__tests__/validateAmount.test.ts` | Covers negative, zero, NaN, scientific notation, over-precision |
| Trade threshold | `__tests__/tradeThreshold.test.ts` | Edge cases in price/amount validation |
| Risk engine | `__tests__/riskEngine-freshRead.test.ts` | Verifies fresh on-chain reads, not cached state |

**Missing coverage:**
- No tests for the `thirdwebAdapter.ts` dynamic import.
- No tests for external link `rel` attributes.
- No tests verifying that `demo.ts` / `createTrader` are excluded from client bundles.

---

#### I-04: No server-side rendering of sensitive data

All pages are marked `'use client'` and do not use server components, API routes, or `getServerSideProps`. The only API route found (`app/api/trade-preview/route.ts`) uses hardcoded test data and does not process user input. No server-side secret leakage risk.

---

#### I-05: Thirdweb integration appears dormant

The `@types/qrcode` and `qrcode` dependencies, plus the Thirdweb adapter file, suggest a previous or planned account-abstraction integration. The current app uses wagmi/injected connector exclusively. The `.env.example` references `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` and `THIRDWEB_SECRET_KEY`, but neither is used in active code paths.

**Recommendation:** Remove unused Thirdweb dependencies and the adapter file to reduce attack surface.

---

## 4. Summary of Recommendations

| Priority | Item | Effort |
|---|---|---|
| Medium | Add `rel="noopener noreferrer"` to all external `<a target="_blank">` | Low |
| Medium | Add security headers (X-Frame-Options, X-Content-Type-Options, etc.) | Low |
| Medium | Replace `Function()` constructor with standard `import()` | Low |
| Medium | Relocate private-key-accepting functions to `lib/server/` | Low |
| Low | Add Zod schema validation for localStorage settings | Medium |
| Low | Show clipboard error feedback to users | Low |
| Info | Remove unused Thirdweb dependencies and adapter | Low |
| Info | Add bundle analysis to verify no server-only code leaks to client | Medium |

---

## 5. Conclusion

The Pulse frontend demonstrates solid security practices for a testnet dApp:

- **Private keys never leave MetaMask.** The app only calls `walletClient.sendTransaction()`.
- **Chain ID validation runs before every transaction** via `assertCorrectChain()`.
- **Input validation is thorough** -- `validateAmount()` rejects negative, zero, NaN, scientific notation, and over-precision inputs.
- **No secrets are committed** -- `.gitignore` correctly excludes `.env` files, and no private keys were found in the repository.
- **The SDK import boundary is well-defined** -- `lib/engine/index.ts` acts as a whitelist, and `demo.ts` is explicitly excluded.
- **Error handling is typed and consistent** -- `PulseEngineError` with machine-readable codes prevents fragile string matching.

The findings in this audit are primarily hardening measures for production readiness. None represent an immediate exploit risk on testnet.

---

*This audit covers the codebase as of commit `094577f` on the `master` branch. It does not cover the `@somnia-chain/markets-sdk` dependency, smart contracts, or infrastructure. A separate smart-contract audit should be conducted before mainnet deployment.*
