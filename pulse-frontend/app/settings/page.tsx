'use client';

/**
 * /settings -- Per-wallet preferences: risk limits, auto-flatten, trade defaults.
 *
 * Settings are stored in localStorage keyed per connected wallet address.
 * NO EMOJI in code, comments, or UI copy.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Wallet,
  Copy,
  CheckCircle,
  Shield,
  Clock,
  Sliders,
  Save,
  AlertCircle,
  Unplug,
} from 'lucide-react';
import styles from './Settings.module.css';
import AppChromeNav from '@/components/markets/AppChromeNav';
import { usePulseWallet } from '@/lib/wallet/PulseWalletContext';
import {
  loadSettings,
  saveSettings,
  type PulseSettings,
  DEFAULT_SETTINGS,
} from '@/lib/settings';
import {
  useReducedMotionSafe,
  safeVariants,
  safeTransition,
  fadeSlideUp,
  MOTION_MEDIUM,
  EASE_OUT,
} from '@/lib/motion';

// ─── Toggle component ─────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  id: string;
}) {
  return (
    <label htmlFor={id} className={styles.toggleRow}>
      <span className={styles.toggleLabel}>{label}</span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        className={`${styles.toggle} ${checked ? styles.toggleOn : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.toggleThumb} />
      </button>
    </label>
  );
}

// ─── Page Component ───────────────────────────────────────────────────────────

export default function SettingsPage() {
  const reducedMotion = useReducedMotionSafe();
  const wallet = usePulseWallet();
  const isConnected =
    wallet.connectionStatus === 'connected' && !!wallet.address;

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Settings state
  const [settings, setSettings] = useState<PulseSettings>(DEFAULT_SETTINGS);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saved, setSaved] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load settings when wallet connects
  useEffect(() => {
    if (isConnected && wallet.address) {
      setSettings(loadSettings(wallet.address));
    }
  }, [isConnected, wallet.address]);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  // Copy address
  const handleCopyAddress = useCallback(async () => {
    if (!wallet.address) return;
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard API may fail
    }
  }, [wallet.address]);

  // Save settings
  const handleSave = useCallback(() => {
    if (!wallet.address) return;
    saveSettings(wallet.address, settings);
    setSaved(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSaved(false), 2500);
  }, [wallet.address, settings]);

  // Update a single setting
  const update = useCallback(
    <K extends keyof PulseSettings>(key: K, value: PulseSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // Update a nested risk limit
  const updateRiskLimit = useCallback(
    <K extends keyof PulseSettings['riskLimits']>(
      key: K,
      value: PulseSettings['riskLimits'][K],
    ) => {
      setSettings((prev) => ({
        ...prev,
        riskLimits: { ...prev.riskLimits, [key]: value },
      }));
    },
    [],
  );

  // ── Hydration gate ──
  if (!mounted) {
    return (
      <div className={styles.page}>
        <AppChromeNav />
      </div>
    );
  }

  // ── Disconnected state ──
  if (!isConnected) {
    return (
      <div className={styles.page}>
        <AppChromeNav />
        <main className={styles.main}>
          <motion.div
            className={styles.disconnected}
            variants={safeVariants(reducedMotion, fadeSlideUp)}
            initial="hidden"
            animate="visible"
            transition={safeTransition(reducedMotion, {
              duration: MOTION_MEDIUM,
              ease: EASE_OUT,
            })}
          >
            <Wallet
              size={48}
              className={styles.disconnectedIcon}
              aria-hidden="true"
            />
            <h1 className={styles.disconnectedTitle}>Settings</h1>
            <p className={styles.disconnectedSubcopy}>
              Connect your wallet to manage preferences. Settings are stored
              locally and scoped to your connected wallet.
            </p>
          </motion.div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <AppChromeNav />

      <main className={styles.main}>
        {/* Header */}
        <motion.div
          className={styles.headerSection}
          variants={safeVariants(reducedMotion, fadeSlideUp)}
          initial="hidden"
          animate="visible"
          transition={safeTransition(reducedMotion, {
            duration: MOTION_MEDIUM,
            ease: EASE_OUT,
          })}
        >
          <h1 className={styles.h1}>Settings</h1>
          <p className={styles.subcopy}>
            Preferences are stored locally in your browser, scoped to your
            connected wallet.
          </p>
        </motion.div>

        {/* ── 1. Wallet Card ── */}
        <motion.div
          className={styles.card}
          variants={safeVariants(reducedMotion, fadeSlideUp)}
          initial="hidden"
          animate="visible"
          transition={safeTransition(reducedMotion, {
            duration: MOTION_MEDIUM,
            ease: EASE_OUT,
          })}
        >
          <div className={styles.cardHeader}>
            <Wallet size={16} className={styles.cardIcon} aria-hidden="true" />
            <h2 className={styles.cardTitle}>Wallet</h2>
          </div>

          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Address</span>
            <div className={styles.addressRow}>
              <span className={styles.addressText}>{wallet.address}</span>
              <button
                type="button"
                className={styles.copyButton}
                onClick={handleCopyAddress}
                aria-label="Copy wallet address to clipboard"
              >
                {copied ? (
                  <CheckCircle size={13} aria-hidden="true" />
                ) : (
                  <Copy size={13} aria-hidden="true" />
                )}
              </button>
            </div>
            <div aria-live="polite" className="sr-only">
              {copied ? 'Address copied to clipboard' : ''}
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Network</span>
            <div className={styles.networkRow}>
              <span className={styles.networkDot} />
              <span className={styles.networkText}>
                Somnia Shannon Testnet (50312)
              </span>
            </div>
          </div>

          <button
            type="button"
            className={styles.disconnectButton}
            onClick={wallet.disconnect}
          >
            <Unplug size={13} aria-hidden="true" />
            Disconnect
          </button>
        </motion.div>

        {/* ── 2. Risk Limits Card ── */}
        <motion.div
          className={styles.card}
          variants={safeVariants(reducedMotion, fadeSlideUp)}
          initial="hidden"
          animate="visible"
          transition={safeTransition(reducedMotion, {
            duration: MOTION_MEDIUM,
            ease: EASE_OUT,
            delay: 0.05,
          })}
        >
          <div className={styles.cardHeader}>
            <Shield size={16} className={styles.cardIcon} aria-hidden="true" />
            <h2 className={styles.cardTitle}>Risk Limits</h2>
          </div>

          <Toggle
            id="risk-limits-toggle"
            checked={settings.riskLimitsEnabled}
            onChange={(v) => update('riskLimitsEnabled', v)}
            label="Enable risk limits"
          />

          <p className={styles.honestyNote}>
            When enabled, trades that would exceed these limits are blocked
            before submission -- checked against your real current positions
            each time.
          </p>

          <div className={styles.fieldGroup}>
            <label htmlFor="max-position" className={styles.fieldLabel}>
              Max position size per market
            </label>
            <div className={styles.inputRow}>
              <input
                id="max-position"
                type="number"
                min="0"
                step="1"
                value={settings.riskLimits.maxPositionSizePerMarket}
                onChange={(e) =>
                  updateRiskLimit('maxPositionSizePerMarket', e.target.value)
                }
                className={styles.numberInput}
                disabled={!settings.riskLimitsEnabled}
              />
              <span className={styles.inputUnit}>test USDC</span>
            </div>
            <p className={styles.fieldHint}>
              Blocks new trades that would exceed this position size in a
              single market.
            </p>
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="max-markets" className={styles.fieldLabel}>
              Max open markets
            </label>
            <input
              id="max-markets"
              type="number"
              min="1"
              step="1"
              value={settings.riskLimits.maxOpenMarkets}
              onChange={(e) =>
                updateRiskLimit('maxOpenMarkets', parseInt(e.target.value) || 1)
              }
              className={styles.numberInput}
              disabled={!settings.riskLimitsEnabled}
            />
            <p className={styles.fieldHint}>
              Limits how many distinct markets you can hold positions in at
              once.
            </p>
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="max-exposure" className={styles.fieldLabel}>
              Max total exposure
            </label>
            <div className={styles.inputRow}>
              <input
                id="max-exposure"
                type="number"
                min="0"
                step="1"
                value={settings.riskLimits.maxTotalExposure}
                onChange={(e) =>
                  updateRiskLimit('maxTotalExposure', e.target.value)
                }
                className={styles.numberInput}
                disabled={!settings.riskLimitsEnabled}
              />
              <span className={styles.inputUnit}>test USDC</span>
            </div>
            <p className={styles.fieldHint}>
              Maximum total value across all open positions combined.
            </p>
          </div>
        </motion.div>

        {/* ── 3. Auto-Flatten Card ── */}
        <motion.div
          className={styles.card}
          variants={safeVariants(reducedMotion, fadeSlideUp)}
          initial="hidden"
          animate="visible"
          transition={safeTransition(reducedMotion, {
            duration: MOTION_MEDIUM,
            ease: EASE_OUT,
            delay: 0.1,
          })}
        >
          <div className={styles.cardHeader}>
            <Clock size={16} className={styles.cardIcon} aria-hidden="true" />
            <h2 className={styles.cardTitle}>Auto-Flatten</h2>
          </div>

          <Toggle
            id="auto-flatten-toggle"
            checked={settings.autoFlattenEnabled}
            onChange={(v) => update('autoFlattenEnabled', v)}
            label="Auto-flatten positions before market close"
          />

          <div className={styles.fieldGroup}>
            <label htmlFor="flatten-seconds" className={styles.fieldLabel}>
              Seconds before expiry to flatten
            </label>
            <input
              id="flatten-seconds"
              type="number"
              min="5"
              max="600"
              step="1"
              value={settings.autoFlattenSeconds}
              onChange={(e) =>
                update(
                  'autoFlattenSeconds',
                  Math.max(5, parseInt(e.target.value) || 30),
                )
              }
              className={styles.numberInput}
              disabled={!settings.autoFlattenEnabled}
            />
          </div>

          <div className={styles.caveatBox}>
            <AlertCircle size={14} className={styles.caveatIcon} aria-hidden="true" />
            <p className={styles.caveatText}>
              This only works while Pulse is open in your browser tab -- it is
              not a background service. Closing the tab or losing connection
              stops this feature. Use with care; it does not run when you are
              offline.
            </p>
          </div>
        </motion.div>

        {/* ── 4. Trade Defaults Card ── */}
        <motion.div
          className={styles.card}
          variants={safeVariants(reducedMotion, fadeSlideUp)}
          initial="hidden"
          animate="visible"
          transition={safeTransition(reducedMotion, {
            duration: MOTION_MEDIUM,
            ease: EASE_OUT,
            delay: 0.15,
          })}
        >
          <div className={styles.cardHeader}>
            <Sliders size={16} className={styles.cardIcon} aria-hidden="true" />
            <h2 className={styles.cardTitle}>Trade Defaults</h2>
          </div>

          <div className={styles.fieldGroup}>
            <label htmlFor="default-amount" className={styles.fieldLabel}>
              Default trade amount
            </label>
            <div className={styles.inputRow}>
              <input
                id="default-amount"
                type="number"
                min="1"
                step="1"
                value={settings.defaultTradeAmount}
                onChange={(e) =>
                  update(
                    'defaultTradeAmount',
                    Math.max(1, parseInt(e.target.value) || 100),
                  )
                }
                className={styles.numberInput}
              />
              <span className={styles.inputUnit}>test USDC</span>
            </div>
            <p className={styles.fieldHint}>
              Pre-fills the amount field when you open a market to trade.
            </p>
          </div>

          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Preferred asset</span>
            <div className={styles.radioGroup} role="radiogroup" aria-label="Preferred asset">
              {(['none', 'BTC', 'ETH'] as const).map((opt) => (
                <label
                  key={opt}
                  className={`${styles.radioOption} ${
                    settings.preferredAsset === opt ? styles.radioOptionActive : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="preferred-asset"
                    value={opt}
                    checked={settings.preferredAsset === opt}
                    onChange={() => update('preferredAsset', opt)}
                    className={styles.radioInput}
                  />
                  {opt === 'none' ? 'No preference' : opt}
                </label>
              ))}
            </div>
            <p className={styles.fieldHint}>
              Pre-selects the asset filter on the Markets page.
            </p>
          </div>
        </motion.div>

        {/* ── Save Button ── */}
        <motion.div
          className={styles.saveSection}
          variants={safeVariants(reducedMotion, fadeSlideUp)}
          initial="hidden"
          animate="visible"
          transition={safeTransition(reducedMotion, {
            duration: MOTION_MEDIUM,
            ease: EASE_OUT,
            delay: 0.2,
          })}
        >
          <button
            type="button"
            className={styles.saveButton}
            onClick={handleSave}
            disabled={saved}
          >
            {saved ? (
              <>
                <CheckCircle size={14} aria-hidden="true" />
                Saved
              </>
            ) : (
              <>
                <Save size={14} aria-hidden="true" />
                Save Settings
              </>
            )}
          </button>
          <div aria-live="polite" className="sr-only">
            {saved ? 'Settings saved successfully' : ''}
          </div>
        </motion.div>
      </main>
    </div>
  );
}
