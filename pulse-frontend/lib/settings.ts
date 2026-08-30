/**
 * Client-side settings persistence.
 *
 * Stores user preferences in localStorage, keyed per connected wallet address
 * so different wallets don't share preferences. Provides sensible defaults.
 *
 * NO EMOJI in code or comments.
 */

import type { RiskLimits } from '@/lib/engine';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PulseSettings {
  /** Whether risk-limit enforcement is active (opt-in, default OFF). */
  riskLimitsEnabled: boolean;
  /** Risk-limit thresholds (ignored when riskLimitsEnabled is false). */
  riskLimits: RiskLimits;
  /** Auto-flatten positions before market close. */
  autoFlattenEnabled: boolean;
  /** Seconds before expiry to trigger auto-flatten. */
  autoFlattenSeconds: number;
  /** Default trade amount pre-filled on the order form (human USDC). */
  defaultTradeAmount: number;
  /** Preferred asset filter for /markets page. */
  preferredAsset: 'BTC' | 'ETH' | 'none';
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: PulseSettings = {
  riskLimitsEnabled: false,
  riskLimits: {
    maxPositionSizePerMarket: '100',
    maxOpenMarkets: 5,
    maxTotalExposure: '500',
  },
  autoFlattenEnabled: false,
  autoFlattenSeconds: 30,
  defaultTradeAmount: 100,
  preferredAsset: 'none',
};

// ─── Storage helpers ──────────────────────────────────────────────────────────

function storageKey(address: string): string {
  return `pulse-settings-${address.toLowerCase()}`;
}

/**
 * Load settings for a connected wallet address.
 * Returns defaults if nothing is stored or if parsing fails.
 */
export function loadSettings(address: string): PulseSettings {
  try {
    const raw = localStorage.getItem(storageKey(address));
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<PulseSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Save settings for a connected wallet address.
 */
export function saveSettings(
  address: string,
  settings: PulseSettings,
): void {
  try {
    localStorage.setItem(storageKey(address), JSON.stringify(settings));
  } catch {
    // localStorage may be full or disabled — fail silently
  }
}
