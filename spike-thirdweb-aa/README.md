# spike-thirdweb-aa

**THROWAWAY SPIKE — not integrated into pulse/src/engine or frontend.**

## Question being tested

Does Thirdweb smart-account gas sponsorship (`sponsorGas: true`) survive when
the smart account is converted to a **raw viem WalletClient**
(`viemAdapter.walletClient.toViem`) and used to call an arbitrary third-party
contract — rather than going through thirdweb's own
`prepareContractCall`/`sendTransaction` flow?

If yes → Pulse trading could be fully gasless at the Somnia AA level,
independent of DreamDEX's operator/session-key system (which is spot-only).

## Success criterion

- Smart account STT balance = 0 **before** the tx
- Raw `viemWallet.writeContract(...)` call to test USDC `faucet(amount)`
  confirms on-chain
- Smart account STT balance still = 0 after → sponsorship worked end-to-end
  through the raw contract-call path.

## Run

1. Copy `.env.example` → `.env`, fill `THIRDWEB_CLIENT_ID` (+ optionally
   `THIRDWEB_SECRET_KEY`) from https://thirdweb.com/dashboard/settings/api-keys
2. `npm install`
3. `npm run spike`

## What it does

1. Guest in-app wallet login (headless) as the personal key
   (`PRIVATE_KEY` env fallback supported)
2. `smartWallet({ chain: somniaTestnet(50312), sponsorGas: true }).connect(...)`
3. Convert to viem WalletClient; log resulting shape (account type, methods)
4. Raw `writeContract` against DreamDEX test USDC faucet:
   `0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E.faucet(10_000e6)`
5. Wait for receipt, re-check STT balances of both smart account and EOA,
   verify USDC actually minted
6. Print GO / NO-GO verdict

Addresses mirror `pulse/src/engine/client.ts` / SDK
`SOMNIA_TESTNET_ADDRESSES.testUsdc`.
