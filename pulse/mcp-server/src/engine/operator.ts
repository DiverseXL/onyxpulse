/**
 * Operator / session-key module for delegated trading.
 *
 * This enables the one-signature-then-frictionless UX from the product spec.
 * Operator key can never move user funds — only manage orders settling to the
 * owner. Confirm exact selector string values against operatorAbi.d.ts before
 * wiring into the frontend.
 *
 * Flow:
 *   1. Owner calls grantOperatorPermissions() — one tx, one signature.
 *   2. Operator calls placeOrderAsOperator() — no owner interaction needed.
 *   3. Owner calls revokeOperatorPermissions() to take back control.
 *
 * Security model (from OperatorPermissionsRegistry):
 *   - Grants are per (owner, operator, selector) — each function selector
 *     (placeOrderFor, cancelOrderFor, reduceOrderFor) is independent.
 *   - Grants can be global (all pools) or per-pool (one SpotPool).
 *   - Per-pool DENIAL overrides a global grant.
 *   - The operator can NEVER withdraw funds — orders settle back to the owner.
 */

import type { Address, Hex, PublicClient, WalletClient, Account } from "viem";
import { encodeFunctionData, decodeEventLog } from "viem";
import type {
  PlaceOrderResult,
  SomniaMarketsClient,
  TxResult,
} from "@somnia-chain/markets-sdk";
import {
  PLACE_ORDER_FOR_SELECTOR,
  CANCEL_ORDER_FOR_SELECTOR,
} from "@somnia-chain/markets-sdk";

import { PulseEngineError, PulseErrorCode, mapSdkError } from "./errors.js";

// ─── Selector constants ──────────────────────────────────────────────────────

/**
 * 4-byte function selector for `placeOrderFor(address owner, ...)`.
 * Confirmed against spot/operatorGrants.d.ts: "0x80054449".
 */
export const SELECTOR_PLACE_ORDER_FOR = PLACE_ORDER_FOR_SELECTOR;

/**
 * 4-byte function selector for `cancelOrderFor(uint128 orderId)`.
 * Confirmed against spot/operatorGrants.d.ts: "0xe37b444b".
 */
export const SELECTOR_CANCEL_ORDER_FOR = CANCEL_ORDER_FOR_SELECTOR;

// ─── For-variant ABIs (local, not in SDK) ───────────────────────────────────

/**
 * The `placeOrderFor` function ABI — mirrors the pool's `placeOrder` signature
 * with `address owner` prepended. Derived from `spotPoolWriteAbi.placeOrder`
 * (confirmed against tradeAbi.d.ts) plus the owner parameter from the pool's
 * inherited OrderBook base.
 *
 * The SDK does NOT include `placeOrderFor` in `spotPoolWriteAbi` — only
 * `placeOrder` is typed. This local ABI entry is the minimal extension needed.
 */
const PLACE_ORDER_FOR_ABI = [
  {
    name: "placeOrderFor",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { type: "address", name: "owner" },
      { type: "bool", name: "isBid" },
      { type: "uint64", name: "userData" },
      { type: "uint256", name: "price" },
      { type: "uint256", name: "quantity" },
      { type: "uint64", name: "expireTimestampNs" },
      { type: "uint8", name: "orderType" },
      { type: "uint8", name: "selfMatchingOption" },
      { type: "address", name: "builder" },
      { type: "uint96", name: "builderFeeBpsTimes1k" },
    ],
    outputs: [],
  },
] as const;

/**
 * The `cancelOrderFor` function ABI — mirrors the pool's `cancelOrder(uint128)`
 * with `address owner` prepended. Derived from `spotPoolWriteAbi.cancelOrder`
 * (confirmed against tradeAbi.d.ts: cancelOrder takes only `uint128 orderId`).
 *
 * The SDK does NOT include `cancelOrderFor` in `spotPoolWriteAbi` — only
 * `cancelOrder` is typed. This local ABI entry is the minimal extension needed.
 */
const CANCEL_ORDER_FOR_ABI = [
  {
    name: "cancelOrderFor",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { type: "address", name: "owner" },
      { type: "uint128", name: "orderId" },
    ],
    outputs: [],
  },
] as const;

// ─── OrderBook event ABIs (for receipt decoding) ─────────────────────────────

/**
 * Minimal event ABIs for decoding order placement receipts.
 * The pool emits OrderPlaced(orderId, owner, isBid, price, quantity, …) and
 * OrderFilled events. We decode just enough to extract orderId and fills.
 */
const ORDER_PLACED_EVENT_ABI = {
  name: "OrderPlaced",
  type: "event",
  inputs: [
    { name: "orderId", type: "uint128", indexed: false },
    { name: "owner", type: "address", indexed: false },
    { name: "isBid", type: "bool", indexed: false },
    { name: "price", type: "uint256", indexed: false },
    { name: "quantity", type: "uint256", indexed: false },
  ],
} as const;

const ORDER_FILLED_EVENT_ABI = {
  name: "OrderFilled",
  type: "event",
  inputs: [
    { name: "takerOrderId", type: "uint128", indexed: false },
    { name: "makerOrderId", type: "uint128", indexed: false },
    { name: "quantityFilled", type: "uint256", indexed: false },
    { name: "takerRemainingQuantity", type: "uint256", indexed: false },
    { name: "makerRemainingQuantity", type: "uint256", indexed: false },
    { name: "fillPrice", type: "uint256", indexed: false },
  ],
} as const;

// ─── Types ───────────────────────────────────────────────────────────────────

/** The function selectors an operator can be granted. */
export type OperatorSelector = "placeOrderFor" | "cancelOrderFor" | "reduceOrderFor";

/** Current grant state for an operator on a specific pool. */
export interface OperatorPermissions {
  /** Whether the operator has a global grant (all pools). */
  globallyApproved: boolean;
  /** Whether the operator has a per-pool grant for this specific pool. */
  poolApproved: boolean;
  /** Whether the pool's resolved gate allows the operator (accounts for denials). */
  authorized: boolean;
}

/** Minimal signer shape needed by placeOrderAsOperator. */
export interface OperatorSigner {
  /** The viem WalletClient for sending transactions. */
  walletClient: WalletClient;
  /** The operator's signing account. */
  account: Account;
}

// ─── Trader type (matches SDK's Trader interface) ────────────────────────────

type Trader = {
  setOperatorApprovalForPool(params: {
    pool: Address;
    operator: Address;
    selectors: readonly Hex[];
    approved: boolean;
  }): Promise<TxResult>;
  setOperatorApprovalGlobal(params: {
    operator: Address;
    selectors: readonly Hex[];
    approved: boolean;
  }): Promise<TxResult>;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Map human selector names to their 4-byte hex values. */
const SELECTOR_MAP: Record<string, Hex> = {
  placeOrderFor: PLACE_ORDER_FOR_SELECTOR,
  cancelOrderFor: CANCEL_ORDER_FOR_SELECTOR,
  // reduceOrderFor is not currently exported by the SDK — documented here
  // for future use. The selector must be verified against the pool ABI
  // before wiring.
};

function resolveSelectors(selectors: OperatorSelector[]): Hex[] {
  return selectors.map((name) => {
    const hex = SELECTOR_MAP[name];
    if (!hex) {
      throw new Error(
        `Unknown selector "${name}". Valid selectors: ${Object.keys(SELECTOR_MAP).join(", ")}. ` +
          `reduceOrderFor is not yet available in the SDK — verify its selector against the pool ABI.`,
      );
    }
    return hex;
  });
}

/** Map binary side enum to the isBid boolean the pool expects. */
function sideToIsBid(side: string): boolean {
  if (side === "BUY_YES" || side === "BUY_NO") return true;
  if (side === "SELL_YES" || side === "SELL_NO") return false;
  throw new Error(`Invalid side: "${side}". Must be BUY_YES, SELL_YES, BUY_NO, or SELL_NO.`);
}

// ─── Exports ─────────────────────────────────────────────────────────────────

/**
 * Grant operator permissions for specific function selectors on ALL pools.
 *
 * This is the one-time approval a user signs to enable low-friction trading.
 * The operator key can never withdraw funds — only manage orders settling
 * to the owner's account.
 *
 * Prefer {@link grantOperatorPermissionsForPool} for a bot that trades one
 * venue — same admission, far less blast radius.
 *
 * @param trader - A Trader instance (from createTrader, signed as the OWNER).
 * @param operatorAddress - The hot key / contract being authorized.
 * @param selectors - Which capabilities to grant (e.g. ["placeOrderFor", "cancelOrderFor"]).
 * @returns The confirmation receipt.
 */
export async function grantOperatorPermissions(
  trader: Trader,
  operatorAddress: Address,
  selectors: OperatorSelector[],
): Promise<TxResult> {
  try {
    const hexSelectors = resolveSelectors(selectors);
    return await trader.setOperatorApprovalGlobal({
      operator: operatorAddress,
      selectors: hexSelectors,
      approved: true,
    });
  } catch (error) {
    if (error instanceof PulseEngineError) throw error;
    throw mapSdkError(error, `grantOperatorPermissions for operator ${operatorAddress}`);
  }
}

/**
 * Grant operator permissions for specific function selectors on ONE pool.
 *
 * Prefer this over {@link grantOperatorPermissions} when the bot trades a
 * single venue — same admission, far less blast radius. Especially important
 * for binary Event Contract pools, which may not be covered by a global grant
 * if they aren't registered in SpotPoolRegistry.
 *
 * @param trader - A Trader instance (from createTrader, signed as the OWNER).
 * @param operatorAddress - The hot key / contract being authorized.
 * @param pool - The specific pool address to grant on.
 * @param selectors - Which capabilities to grant.
 * @returns The confirmation receipt.
 */
export async function grantOperatorPermissionsForPool(
  trader: Trader,
  operatorAddress: Address,
  pool: Address,
  selectors: OperatorSelector[],
): Promise<TxResult> {
  try {
    const hexSelectors = resolveSelectors(selectors);
    return await trader.setOperatorApprovalForPool({
      pool,
      operator: operatorAddress,
      selectors: hexSelectors,
      approved: true,
    });
  } catch (error) {
    if (error instanceof PulseEngineError) throw error;
    throw mapSdkError(
      error,
      `grantOperatorPermissionsForPool for operator ${operatorAddress} on pool ${pool}`,
    );
  }
}

/**
 * Revoke ALL operator permissions (global) for an operator.
 *
 * Takes back every selector grant across all pools. For granular revocation
 * (one selector, one pool), use the SDK's trader directly.
 *
 * @param trader - A Trader instance (signed as the OWNER).
 * @param operatorAddress - The operator whose grants to revoke.
 */
export async function revokeOperatorPermissions(
  trader: Trader,
  operatorAddress: Address,
): Promise<TxResult> {
  try {
    // Revoke all known selectors. The registry removes per-selector, so we
    // revoke each one individually. Unknown selectors are skipped gracefully.
    const allSelectors = Object.values(SELECTOR_MAP).filter(Boolean);
    return await trader.setOperatorApprovalGlobal({
      operator: operatorAddress,
      selectors: allSelectors,
      approved: false,
    });
  } catch (error) {
    if (error instanceof PulseEngineError) throw error;
    throw mapSdkError(error, `revokeOperatorPermissions for operator ${operatorAddress}`);
  }
}

/**
 * Read an operator's current grant state for a specific pool.
 *
 * Checks three levels:
 *   1. Global grant (all pools)
 *   2. Per-pool grant (this specific pool)
 *   3. Resolved authorization (pool's own gate, accounting for denials)
 *
 * @param client - The SomniaMarketsClient.
 * @param ownerAddress - The account that granted (or would grant) permissions.
 * @param operatorAddress - The operator to check.
 * @param pool - The pool address to check against.
 * @param selector - Which function selector to check (default: placeOrderFor).
 */
export async function getOperatorPermissions(
  client: SomniaMarketsClient,
  ownerAddress: Address,
  operatorAddress: Address,
  pool: Address,
  selector: OperatorSelector = "placeOrderFor",
): Promise<OperatorPermissions> {
  try {
    const hexSelector = resolveSelectors([selector])[0];

    const [globallyApproved, poolApproved, authorized] = await Promise.all([
      client.isGloballyApproved({
        owner: ownerAddress,
        operator: operatorAddress,
        selector: hexSelector,
      }),
      client.isApprovedForPool({
        pool,
        owner: ownerAddress,
        operator: operatorAddress,
        selector: hexSelector,
      }),
      client.isOperatorAuthorized({
        pool,
        owner: ownerAddress,
        operator: operatorAddress,
        selector: hexSelector,
      }),
    ]);

    return { globallyApproved, poolApproved, authorized };
  } catch (error) {
    if (error instanceof PulseEngineError) throw error;
    throw mapSdkError(error, `getOperatorPermissions for ${ownerAddress} → ${operatorAddress} on ${pool}`);
  }
}

/**
 * Place an order as an operator on behalf of an owner.
 *
 * Calls the pool's `placeOrderFor(address owner, …)` function directly via
 * `writeContract`. The pool verifies the operator grant via
 * OperatorPermissionsRegistry before executing — this function pre-checks
 * authorization and throws a clear error if the grant is missing.
 *
 * The operator signs and sends the transaction; the order settles to the
 * owner's account. The operator can NEVER withdraw funds.
 *
 * @param client - The SomniaMarketsClient (for authorization pre-check).
 * @param signer - The operator's viem wallet client + account.
 * @param onBehalfOf - The owner address whose account the order settles to.
 * @param orderParams - The order parameters (pool, side, price, quantity).
 * @returns The confirmed order result with order id and fills.
 */
export async function placeOrderAsOperator(
  client: SomniaMarketsClient,
  signer: OperatorSigner,
  onBehalfOf: Address,
  orderParams: {
    pool: Address;
    side: "BUY_YES" | "SELL_YES" | "BUY_NO" | "SELL_NO";
    price: bigint;
    quantity: bigint;
    orderType?: number;
    expireTimestampNs?: bigint;
    builder?: Address;
    builderFeeBpsTimes1k?: bigint;
  },
): Promise<PlaceOrderResult> {
  const { pool, side, price, quantity } = orderParams;

  try {
    // ── Step 1: Authorization pre-check ────────────────────────────────
    const permissions = await getOperatorPermissions(
      client,
      onBehalfOf,
      signer.account.address,
      pool,
      "placeOrderFor",
    );

    if (!permissions.authorized) {
      const grantHint = permissions.poolApproved
        ? "The operator has a per-pool grant, but the pool's resolved gate denied it (possible denial override)."
        : permissions.globallyApproved
          ? "The operator has a global grant, but the pool's resolved gate denied it (pool may not be registered or a denial override is active)."
          : "No grant found. The owner must call grantOperatorPermissions() first.";

      throw new PulseEngineError(
        PulseErrorCode.NOT_AUTHORIZED_OPERATOR,
        `placeOrderAsOperator for pool ${pool}`,
        `Operator ${signer.account.address} is NOT authorized to call placeOrderFor on behalf of ${onBehalfOf} on pool ${pool}. ${grantHint}`,
      );
    }

    // ── Step 2: Encode the placeOrderFor call ──────────────────────────
    const isBid = sideToIsBid(side);
    const orderType = orderParams.orderType ?? 0; // 0 = LIMIT
    const expireTimestampNs = orderParams.expireTimestampNs ?? 0n;
    const builder = orderParams.builder ?? "0x0000000000000000000000000000000000000000";
    const builderFeeBpsTimes1k = orderParams.builderFeeBpsTimes1k ?? 0n;

    const data = encodeFunctionData({
      abi: PLACE_ORDER_FOR_ABI,
      functionName: "placeOrderFor",
      args: [
        onBehalfOf,
        isBid,
        0n, // userData — opaque MM bookkeeping tag, 0 when unused
        price,
        quantity,
        expireTimestampNs,
        orderType,
        0, // selfMatchingOption — 0 = CANCEL_TAKER (default)
        builder,
        builderFeeBpsTimes1k,
      ],
    });

    // ── Step 3: Send the transaction ───────────────────────────────────
    const hash = await signer.walletClient.writeContract({
      address: pool,
      abi: PLACE_ORDER_FOR_ABI,
      functionName: "placeOrderFor",
      args: [
        onBehalfOf,
        isBid,
        0n,
        price,
        quantity,
        expireTimestampNs,
        orderType,
        0,
        builder,
        builderFeeBpsTimes1k,
      ],
      chain: signer.walletClient.chain,
      account: signer.account,
    });

    // ── Step 4: Wait for receipt ───────────────────────────────────────
    const publicClient = client.getViemClient();
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === "reverted") {
      throw new PulseEngineError(
        PulseErrorCode.UNKNOWN,
        `placeOrderAsOperator for pool ${pool}`,
        `Transaction reverted: ${hash}`,
      );
    }

    // ── Step 5: Decode order id and fills from receipt logs ─────────────
    let orderId: bigint | undefined;
    const fills: PlaceOrderResult["fills"] = [];

    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: [ORDER_PLACED_EVENT_ABI],
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === "OrderPlaced") {
          orderId = decoded.args.orderId as bigint;
        }
      } catch {
        // Not an OrderPlaced event — try OrderFilled
      }

      try {
        const decoded = decodeEventLog({
          abi: [ORDER_FILLED_EVENT_ABI],
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === "OrderFilled") {
          fills.push({
            takerOrderId: decoded.args.takerOrderId as bigint,
            makerOrderId: decoded.args.makerOrderId as bigint,
            quantityFilled: decoded.args.quantityFilled as bigint,
            takerRemainingQuantity: decoded.args.takerRemainingQuantity as bigint,
            makerRemainingQuantity: decoded.args.makerRemainingQuantity as bigint,
            fillPrice: decoded.args.fillPrice as bigint,
          });
        }
      } catch {
        // Not an OrderFilled event
      }
    }

    return { hash, receipt, orderId, fills };
  } catch (error) {
    if (error instanceof PulseEngineError) throw error;
    throw mapSdkError(error, `placeOrderAsOperator for pool ${pool} (owner=${onBehalfOf}, side=${side})`);
  }
}

/**
 * Cancel an order as an operator on behalf of an owner.
 *
 * Calls the pool's `cancelOrderFor(address owner, uint128 orderId)` function
 * directly via `writeContract`. The pool verifies the operator grant via
 * OperatorPermissionsRegistry before executing — this function pre-checks
 * authorization and throws a clear error if the grant is missing.
 *
 * Mirrors the exact implementation pattern of {@link placeOrderAsOperator}:
 *   1. Authorization pre-check via getOperatorPermissions (cancelOrderFor selector)
 *   2. Encode the cancelOrderFor call
 *   3. Send via operator's wallet
 *   4. Wait for receipt
 *   5. Return hash + receipt
 *
 * @param client - The SomniaMarketsClient (for authorization pre-check).
 * @param signer - The operator's viem wallet client + account.
 * @param onBehalfOf - The owner address whose order to cancel.
 * @param orderId - The on-chain order id (uint128, passed as string or bigint).
 * @returns The confirmed cancellation receipt.
 */
export async function cancelOrderAsOperator(
  client: SomniaMarketsClient,
  signer: OperatorSigner,
  onBehalfOf: Address,
  pool: Address,
  orderId: string | bigint,
): Promise<TxResult> {
  try {
    // ── Step 1: Authorization pre-check ────────────────────────────────
    const permissions = await getOperatorPermissions(
      client,
      onBehalfOf,
      signer.account.address,
      pool,
      "cancelOrderFor",
    );

    if (!permissions.authorized) {
      const grantHint = permissions.poolApproved
        ? "The operator has a per-pool grant, but the pool's resolved gate denied it (possible denial override)."
        : permissions.globallyApproved
          ? "The operator has a global grant, but the pool's resolved gate denied it (pool may not be registered or a denial override is active)."
          : "No grant found. The owner must call grantOperatorPermissions() first.";

      throw new PulseEngineError(
        PulseErrorCode.NOT_AUTHORIZED_OPERATOR,
        `cancelOrderAsOperator for pool ${pool}`,
        `Operator ${signer.account.address} is NOT authorized to call cancelOrderFor on behalf of ${onBehalfOf} on pool ${pool}. ${grantHint}`,
      );
    }

    // ── Step 2: Encode the cancelOrderFor call ─────────────────────────
    const orderIdBigInt = BigInt(orderId);

    // ── Step 3: Send the transaction ───────────────────────────────────
    const hash = await signer.walletClient.writeContract({
      address: pool,
      abi: CANCEL_ORDER_FOR_ABI,
      functionName: "cancelOrderFor",
      args: [onBehalfOf, orderIdBigInt],
      chain: signer.walletClient.chain,
      account: signer.account,
    });

    // ── Step 4: Wait for receipt ───────────────────────────────────────
    const publicClient = client.getViemClient();
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === "reverted") {
      throw new PulseEngineError(
        PulseErrorCode.UNKNOWN,
        `cancelOrderAsOperator for pool ${pool}`,
        `Transaction reverted: ${hash}`,
      );
    }

    return { hash, receipt };
  } catch (error) {
    if (error instanceof PulseEngineError) throw error;
    throw mapSdkError(error, `cancelOrderAsOperator for pool ${pool} (owner=${onBehalfOf}, orderId=${orderId})`);
  }
}

/**
 * Convenience wrapper: enable session-key trading with both place + cancel.
 *
 * Grants both "placeOrderFor" and "cancelOrderFor" selectors in one call.
 * This is the single function a frontend "Enable one-tap trading" button
 * would call.
 *
 * When a pool address is provided, grants per-pool (safer, recommended for
 * binary Event Contract pools that may not be covered by a global grant if
 * they aren't registered in SpotPoolRegistry). When omitted, grants globally
 * across all pools.
 *
 * The operator key can never withdraw funds — only manage orders settling
 * to the owner's account.
 *
 * @param trader - A Trader instance (from createTrader, signed as the OWNER).
 * @param operatorAddress - The hot key / contract being authorized.
 * @param pool - Optional specific pool for per-pool grant. Omit for global.
 * @returns The confirmation receipt.
 */
export async function enableSessionTrading(
  trader: Trader,
  operatorAddress: Address,
  pool?: Address,
): Promise<TxResult> {
  const selectors: OperatorSelector[] = ["placeOrderFor", "cancelOrderFor"];
  if (pool) {
    return grantOperatorPermissionsForPool(trader, operatorAddress, pool, selectors);
  }
  return grantOperatorPermissions(trader, operatorAddress, selectors);
}
