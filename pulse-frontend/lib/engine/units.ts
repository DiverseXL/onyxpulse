import type { SomniaMarketsClient } from "@somnia-chain/markets-sdk";

/**
 * Convert a human-readable number or decimal string to a bigint scaled by `decimals`.
 *
 * Uses string-based arithmetic to avoid IEEE 754 precision loss — never multiplies
 * a float by 10^decimals. Throws if the input has more fractional digits than
 * `decimals` allows (e.g. `toBigintAmount(0.123, 2)` rejects because 3 > 2).
 *
 * @example
 * toBigintAmount(10, 6)        // 10_000_000n
 * toBigintAmount("0.62", 18)   // 620_000_000_000_000_000n
 * toBigintAmount(100, 0)       // 100n
 */
export function toBigintAmount(
  human: number | string,
  decimals: number,
): bigint {
  const str = typeof human === "string" ? human : String(human);

  if (str === "0" || str === "0.0" || str === "0.") return 0n;

  const sign = str.startsWith("-") ? -1n : 1n;
  const abs = str.startsWith("-") ? str.slice(1) : str;

  const dotIdx = abs.indexOf(".");
  let intPart: string;
  let fracPart: string;

  if (dotIdx === -1) {
    intPart = abs;
    fracPart = "";
  } else {
    intPart = abs.slice(0, dotIdx);
    fracPart = abs.slice(dotIdx + 1);
  }

  if (fracPart.length > decimals) {
    throw new Error(
      `Input has ${fracPart.length} decimal places but only ${decimals} are allowed: "${str}"`,
    );
  }

  // Pad fractional part to exactly `decimals` digits (e.g. "62" + decimals=6 → "620000")
  const paddedFrac = fracPart.padEnd(decimals, "0");

  const combined = intPart + paddedFrac;
  const value = combined === "" ? 0n : BigInt(combined);

  return sign * value;
}

/**
 * Convert a raw bigint (scaled by `decimals`) back to a human-readable decimal string.
 *
 * @example
 * fromBigintAmount(10_000_000n, 6)                          // "10000000"
 * fromBigintAmount(620_000_000_000_000_000n, 18)            // "0.62"
 * fromBigintAmount(620_000_000_000_000_000n, 18).toFixed(2) // "0.62"
 */
export function fromBigintAmount(raw: bigint, decimals: number): string {
  if (raw === 0n) return "0";

  const negative = raw < 0n;
  const abs = negative ? -raw : raw;

  const str = abs.toString();
  if (str.length <= decimals) {
    const padded = str.padStart(decimals + 1, "0");
    const frac = padded.slice(-decimals).replace(/0+$/, "");
    return negative ? `-${padded.slice(0, -decimals)}.${frac}` : `${padded.slice(0, -decimals)}.${frac}`;
  }

  const intPart = str.slice(0, str.length - decimals);
  const frac = str.slice(str.length - decimals).replace(/0+$/, "");
  if (frac === "") return negative ? `-${intPart}` : intPart;
  const formatted = `${intPart}.${frac}`;
  return negative ? `-${formatted}` : formatted;
}

/**
 * Snap a raw price down to the nearest valid tick on the pool's grid.
 *
 * The tick size is per-market and must be read at runtime (via {@link getPoolTickSize}
 * or the SDK's `getBinaryBookParams`). Never hardcode tick sizes.
 *
 * @example
 * snapToTick(625000000000000000n, 1000000000000000n) // 625000000000000000n (on grid)
 * snapToTick(625500000000000000n, 1000000000000000n) // 625000000000000000n (snapped down)
 */
export function snapToTick(price: bigint, tickSize: bigint): bigint {
  if (tickSize <= 0n) {
    throw new Error(`tickSize must be positive, got ${tickSize.toString()}`);
  }
  return price - (price % tickSize);
}

/**
 * Read the pool's tick size (price grid increment) from the on-chain order book params.
 *
 * Returns the raw `tickSize` bigint from `BinaryBookParams` — the minimum price
 * increment the pool enforces. This is per-market and can change between markets
 * served by the same recycled pool, so always read it fresh before snapping.
 *
 * Currently wraps the binary pool's `getBinaryBookParams`. For spot markets, read
 * `tickSize` directly from the `SpotMarket` row instead.
 *
 * @param client - The SomniaMarketsClient (from createPulseClient).
 * @param pool - The pool address (lowercased hex).
 * @returns The raw tick size in quote units.
 */
export async function getPoolTickSize(
  client: SomniaMarketsClient,
  pool: string,
): Promise<bigint> {
  const params = await client.getBinaryBookParams(pool);
  return params.tickSize;
}

/**
 * Read the pool's full order-book parameters (tick size, lot size, min quantity).
 *
 * Returns the raw `BinaryBookParams` from the on-chain `getOrderBookParameters`
 * view — the grid the pool enforces on all orders:
 * - `tickSize`: price must be a multiple of this
 * - `lotSize`: quantity must be a multiple of this
 * - `minQuantity`: quantity must be >= this (and a lot multiple)
 *
 * All values are raw bigint (outcome-token units, scaled by quoteDecimals).
 * Per-market and recycled per pool — always read fresh before placing an order.
 *
 * @param client - The SomniaMarketsClient (from createPulseClient).
 * @param pool - The pool address (lowercased hex).
 * @returns The full BinaryBookParams with tickSize, lotSize, minQuantity.
 */
export async function getPoolBookParams(
  client: SomniaMarketsClient,
  pool: string,
): Promise<{ tickSize: bigint; lotSize: bigint; minQuantity: bigint }> {
  return await client.getBinaryBookParams(pool);
}

/**
 * Snap a raw quantity down to the nearest valid lot on the pool's grid.
 *
 * The pool rejects any order whose quantity is not a multiple of `lotSize`
 * (error: `InvalidQuantity` / `QuantityNotAligned`). This rounds DOWN to the
 * nearest whole lot, matching the SDK's own internal pattern in derivedReads.
 *
 * @example
 * snapToLotSize(16129032n, 1000000n) // 16000000n (snapped to 16 lots)
 * snapToLotSize(16000000n, 1000000n) // 16000000n (already aligned)
 */
export function snapToLotSize(quantity: bigint, lotSize: bigint): bigint {
  if (lotSize <= 0n) {
    throw new Error(`lotSize must be positive, got ${lotSize.toString()}`);
  }
  return quantity - (quantity % lotSize);
}
