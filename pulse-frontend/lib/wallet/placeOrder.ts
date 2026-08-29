'use client';

/**
 * Client-side order placement using wagmi walletClient + viem.
 *
 * Sends an approve + placeOrder transaction pair through the user's connected
 * wallet. No server-side private key needed.
 */

import { encodeFunctionData, type Hex, type WalletClient, type Account } from 'viem';
import { somniaTestnet } from './wagmiConfig';

// -- Constants ---------------------------------------------------------------

/** Somnia Shannon testnet test USDC contract. */
const TEST_USDC = '0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E' as const;

/** Pool's placeOrder ABI (from @somnia-chain/markets-sdk tradeAbi.ts). */
const POOL_PLACE_ORDER_ABI = [
  {
    type: 'function',
    name: 'placeOrder',
    stateMutability: 'payable',
    inputs: [
      { name: 'isBid', type: 'bool' },
      { name: 'userData', type: 'uint64' },
      { name: 'price', type: 'uint256' },
      { name: 'quantity', type: 'uint256' },
      { name: 'expireTimestampNs', type: 'uint64' },
      { name: 'orderType', type: 'uint8' },
      { name: 'selfMatchingOption', type: 'uint8' },
      { name: 'builder', type: 'address' },
      { name: 'builderFeeBpsTimes1k', type: 'uint96' },
    ],
    outputs: [],
  },
] as const;

/** Standard ERC-20 approve ABI. */
const ERC20_APPROVE_ABI = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

/** IOC = Immediate-or-Cancel (market order). */
const ORDER_TYPE_IOC = 1;

/** ADDRESS(0) for builder field (no builder fee). */
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

// -- Helpers (pure, no SDK imports) ------------------------------------------

/**
 * Convert a human-readable number/string to a bigint scaled by `decimals`.
 */
function toBigintAmount(human: number | string, decimals: number): bigint {
  const str = typeof human === 'string' ? human : String(human);
  if (str === '0' || str === '0.0' || str === '0.') return 0n;

  const sign = str.startsWith('-') ? -1n : 1n;
  const abs = str.startsWith('-') ? str.slice(1) : str;

  const dotIdx = abs.indexOf('.');
  const intPart = dotIdx === -1 ? abs : abs.slice(0, dotIdx);
  let fracPart = dotIdx === -1 ? '' : abs.slice(dotIdx + 1);

  if (fracPart.length > decimals) {
    throw new Error(
      `Input has ${fracPart.length} decimal places but only ${decimals} are allowed: "${str}"`,
    );
  }

  fracPart = fracPart.padEnd(decimals, '0');
  const combined = intPart + fracPart;
  const value = combined === '' ? 0n : BigInt(combined);
  return sign * value;
}

// -- Types -------------------------------------------------------------------

export interface PlaceClientOrderParams {
  /** The binary pool contract address. */
  poolAddress: string;
  /** Trade side. */
  side: 'BUY_YES' | 'BUY_NO' | 'SELL_YES' | 'SELL_NO';
  /** Price in cents (e.g. 62 for 62%). */
  priceCents: number;
  /** USDC amount to spend (human units). */
  amount: number;
  /** Token decimals (default 6 for test USDC). */
  decimals?: number;
}

export interface PlaceClientOrderResult {
  /** Transaction hash of the placeOrder call. */
  hash: string;
}

// -- Main export -------------------------------------------------------------

/**
 * Place a market order (IOC) via the user's connected wallet.
 *
 * Steps:
 *   1. Approve the pool to spend the user's test USDC
 *   2. Call placeOrder on the pool contract
 */
export async function placeClientOrder(
  walletClient: WalletClient,
  account: Account,
  params: PlaceClientOrderParams,
): Promise<PlaceClientOrderResult> {
  const {
    poolAddress,
    side,
    priceCents,
    amount,
    decimals = 6,
  } = params;

  if (!account?.address) {
    throw new Error('Wallet not connected -- please connect your wallet first.');
  }

  const isBid = side === 'BUY_YES' || side === 'BUY_NO';
  const humanPrice = (priceCents / 100).toFixed(decimals);
  const humanQuantity = (amount / (priceCents / 100)).toFixed(decimals);

  const price = toBigintAmount(humanPrice, decimals);
  const quantity = toBigintAmount(humanQuantity, decimals);

  // -- Step 1: Approve pool to spend test USDC -------------------------------
  const approveCalldata = encodeFunctionData({
    abi: ERC20_APPROVE_ABI,
    functionName: 'approve',
    args: [poolAddress as Hex, quantity],
  });

  let approveHash: `0x${string}`;
  try {
    approveHash = await walletClient.sendTransaction({
      to: TEST_USDC,
      data: approveCalldata,
      chain: somniaTestnet,
      account,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('does not match the target chain')) {
      throw new Error(
        'Wrong network -- your wallet is not on Somnia Testnet (chain 50312). '
        + 'Switch networks in MetaMask and try again.',
      );
    }
    throw err;
  }

  // -- Step 2: Place the order on the pool -----------------------------------
  const placeOrderCalldata = encodeFunctionData({
    abi: POOL_PLACE_ORDER_ABI,
    functionName: 'placeOrder',
    args: [
      isBid,          // isBid
      0n,             // userData (opaque MM tag, 0 unused)
      price,          // price
      quantity,       // quantity
      0n,             // expireTimestampNs (0 for IOC)
      ORDER_TYPE_IOC, // orderType (1 = IOC / market)
      0,              // selfMatchingOption (0 = CANCEL_TAKER default)
      ZERO_ADDRESS,   // builder (no builder)
      0n,             // builderFeeBpsTimes1k (no fee)
    ],
  });

  const placeHash = await walletClient.sendTransaction({
    to: poolAddress as Hex,
    data: placeOrderCalldata,
    value: 0n, // ERC-20 pool -- no native token needed
    chain: somniaTestnet,
    account,
  });

  return { hash: placeHash };
}
