# spike-privy-pimlico

**THROWAWAY SPIKE — not integrated into pulse/src/engine or frontend.**

## Question being tested

Does **Privy (wallet layer) + Pimlico (ERC-4337 bundler/paymaster)** sponsor gas
end-to-end on Somnia Shannon testnet (50312) when calling **arbitrary
third-party contracts** — the test USDC faucet AND a real DreamDEX BinaryPool
`mintSet` — not just each provider's own demo flow?

This is independent of DreamDEX's operator/session-key system (spot-only);
AA sponsorship operates at the Somnia wallet layer and should apply to binary
pools too, but must be verified empirically.

## Success criterion

- Privy EOA STT = 0 AND smart account STT = 0 before, during, and after
- Sponsored `faucet(10_000 USDC)` userOp confirms; USDC actually minted
- Sponsored batched `approve + mintSet(yesTo, noTo, 5 USDC)` against a live
  DreamDEX binary pool confirms
- → GO: gasless trading is buildable for Pulse's frontend.

## Run

1. Copy `.env.example` → `.env`, fill:
   - `PRIVY_APP_ID` + `PRIVY_APP_SECRET` — https://dashboard.privy.io
   - `PIMLICO_API_KEY` — https://dashboard.pimlico.io
2. `npm install`
3. `npm run spike`

## What it does (per test)

**TEST 1 — Privy:** headless server wallet via `PrivyClient.walletApi.create()`
(embedded wallets require browser UI — noted as adaptation), converted to a
viem-compatible `Account` via `createViemAccount` (`@privy-io/server-auth/viem`).

**TEST 2 — Pimlico:** `createPimlicoClient` pointed at
`https://api.pimlico.io/v2/50312/rpc`; sanity-checked via
`getUserOperationGasPrice`. Pimlico's supported-chains table confirms Somnia
Testnet bundler+paymaster on EntryPoint V06 + V07 (V07 =
`0x0000000071727De22E5E9d8BAf0edAc6f37da032`, still current), SimpleAccount
supported.

**TEST 3 — End-to-end sponsored calls:** `toSimpleSmartAccount` v0.7 owned by
the Privy viem account → `createSmartAccountClient` with Pimlico paymaster:

- 3a. `testUsdc.faucet(10_000)` — simple third-party call
- 3b. batched `[erc20.approve(pool, 5e6), pool.mintSet(sa, sa, 5e6)]` in ONE
      userOp — real DreamDEX BinaryPool ABI (mirrored verbatim from
      `@somnia-chain/markets-sdk@0.28.1 src/tradeAbi.ts`); pool auto-discovered
      via the SDK indexer (first `Trading` market) or forced via `DREAMDEX_POOL`.

STT balances of EOA + smart account are logged at every stage.
