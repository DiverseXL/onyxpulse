/**
 * Wallet-address validation for the connection flow and portfolio tools.
 *
 * V1 auth is address-based: the connected user provides their OWN public
 * wallet address (public information, not a secret). This module validates
 * and normalizes addresses — nothing here ever touches a private key.
 */

import { isAddress, getAddress } from "viem";

export type AddressValidationOk = {
  ok: true;
  /** EIP-55 checksummed address (safe for display and as an indexer query key). */
  address: string;
};

export type AddressValidationErr = {
  ok: false;
  error: string;
};

export type AddressValidationResult = AddressValidationOk | AddressValidationErr;

/** A public EVM wallet address: 0x + 40 hex chars, valid checksum. */
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

/**
 * Validate + normalize a raw wallet address from user input.
 *
 * Accepts 0x-prefixed addresses in any case (EIP-55 mixed case is validated;
 * all-lower and all-upper pass too, since they carry no checksum signal) and
 * returns the canonical checksummed form.
 */
export function normalizeAddress(raw: unknown): AddressValidationResult {
  if (typeof raw !== "string") {
    return { ok: false, error: "Wallet address must be a string." };
  }
  const trimmed = raw.trim();
  if (!ADDRESS_PATTERN.test(trimmed)) {
    return {
      ok: false,
      error:
        `"${trimmed}" is not a valid EVM wallet address — expected 0x followed by ` +
        "40 hex characters (e.g. 0x1234…abcd).",
    };
  }
  if (!isAddress(trimmed)) {
    return {
      ok: false,
      error: `"${trimmed}" failed the EIP-55 checksum check.`,
    };
  }
  return { ok: true, address: getAddress(trimmed) };
}