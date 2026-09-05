'use client';

/**
 * /connect-agent -- Discover and set up AI-assistant (MCP) access to Pulse.
 *
 * This page is a nicer wrapper around the live MCP server's real /connect
 * endpoint: it POSTs the user's public wallet address to the server and
 * displays the real HMAC-signed token it returns. The frontend never
 * mints or fabricates a token -- the token is always the server's own
 * response.
 *
 * NO EMOJI in code, comments, or UI copy.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Bot,
  KeyRound,
  Copy,
  CheckCircle,
  AlertCircle,
  Shield,
  Loader2,
  Info,
} from 'lucide-react';
import styles from './ConnectAgent.module.css';
import AppChromeNav from '@/components/markets/AppChromeNav';
import { usePulseWallet } from '@/lib/wallet/PulseWalletContext';
import {
  useReducedMotionSafe,
  safeVariants,
  safeTransition,
  fadeSlideUp,
  MOTION_MEDIUM,
  EASE_OUT,
} from '@/lib/motion';

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

/** Base URL of the deployed Pulse MCP server. */
const MCP_BASE_URL =
  process.env.NEXT_PUBLIC_MCP_URL || 'https://onyxpulsemcp-lyart.vercel.app';

/** POST { address } -> { ok, address, token, mcpUrl, note } (Accept: application/json). */
const CONNECT_ENDPOINT = `${MCP_BASE_URL}/connect`;

/** The Streamable HTTP MCP endpoint used in the Claude Desktop config. */
const MCP_ENDPOINT = `${MCP_BASE_URL}/mcp`;

/** Basic EVM wallet shape: 0x + 40 hex chars. */
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

/** Shape of the MCP server's own /connect JSON response (Accept: application/json). */
interface ConnectTokenResponse {
  ok?: boolean;
  address?: string;
  token?: string;
  mcpUrl?: string;
  error?: string;
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function ConnectAgentPage() {
  const reducedMotion = useReducedMotionSafe();
  const wallet = usePulseWallet();
  const isConnected = wallet.connectionStatus === 'connected' && !!wallet.address;

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /* -- Address input ------------------------------------------------------- */
  const [addressInput, setAddressInput] = useState('');

  /* -- Token request state ------------------------------------------------- */
  const [requestStatus, setRequestStatus] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tokenAddress, setTokenAddress] = useState<string | null>(null);

  /* -- Copy state ---------------------------------------------------------- */
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* -- Pre-fill from the connected wallet (only if the field is untouched) - */
  useEffect(() => {
    if (isConnected && wallet.address && addressInput === '') {
      setAddressInput(wallet.address);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, wallet.address]);

  /* -- Cleanup timers ------------------------------------------------------ */
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  /* -- Claude Desktop config JSON with the real token substituted ---------- */
  const configJson = useMemo(() => {
    if (!token) return '';
    return JSON.stringify(
      {
        mcpServers: {
          pulse: {
            url: MCP_ENDPOINT,
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        },
      },
      null,
      2,
    );
  }, [token]);

  /* -- Request a real token from the MCP server ---------------------------- */
  const handleGetToken = useCallback(async () => {
    const trimmed = addressInput.trim();
    if (!ADDRESS_PATTERN.test(trimmed)) {
      setErrorMessage(
        'That does not look like a valid wallet address. Use 0x followed by 40 hex characters (for example 0x1234...abcd).',
      );
      setRequestStatus('error');
      return;
    }

    setRequestStatus('submitting');
    setErrorMessage(null);

    try {
      const res = await fetch(CONNECT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ address: trimmed }),
      });
      const data = (await res.json().catch(() => null)) as ConnectTokenResponse | null;

      if (!res.ok || !data || data.ok !== true || typeof data.token !== 'string') {
        setErrorMessage(
          data?.error
            ? String(data.error)
            : `The MCP server returned an error (HTTP ${res.status}). Please try again.`,
        );
        setRequestStatus('error');
        return;
      }

      setToken(data.token);
      setTokenAddress(data.address ?? trimmed);
      setRequestStatus('success');
    } catch {
      setErrorMessage(
        'Could not reach the Pulse MCP server. Check your internet connection and try again.',
      );
      setRequestStatus('error');
    }
  }, [addressInput]);

  /* -- Clipboard helpers ---------------------------------------------------- */
  const copyText = useCallback(async (text: string, kind: 'token' | 'config') => {
    try {
      await navigator.clipboard.writeText(text);
      if (kind === 'token') {
        setCopiedToken(true);
      } else {
        setCopiedConfig(true);
      }
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        setCopiedToken(false);
        setCopiedConfig(false);
      }, 2500);
    } catch {
      // Clipboard API may be unavailable (e.g. non-secure context)
    }
  }, []);

  /* -- Hydration gate (wallet state is not available server-side) ----------- */
  if (!mounted) {
    return (
      <div className={styles.page}>
        <AppChromeNav />
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
          <h1 className={styles.h1}>Connect Pulse to Claude or ChatGPT</h1>
          <p className={styles.subcopy}>
            Ask your AI assistant about your portfolio, live markets, and draft
            trades — you always confirm the final action yourself in Pulse.
          </p>
        </motion.div>

        {/* Explainer */}
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
            <Bot size={16} className={styles.cardIcon} aria-hidden="true" />
            <h2 className={styles.cardTitle}>What is this?</h2>
          </div>
          <p className={styles.explainerText}>
            Pulse has a Model Context Protocol (MCP) server — a standard way
            for AI assistants like Claude to securely read live data. Once
            connected, you can ask things like &quot;what&apos;s my portfolio
            look like?&quot; or &quot;draft me a trade for 10 USDC on the next
            BTC window.&quot; Your AI assistant can see your public on-chain
            data and prepare trades for you, but it can never execute a trade
            or move funds on its own — every trade requires you to open a real
            link and confirm it yourself in Pulse.
          </p>
        </motion.div>

        {/* Honesty callout */}
        <motion.div
          className={styles.honestyCallout}
          variants={safeVariants(reducedMotion, fadeSlideUp)}
          initial="hidden"
          animate="visible"
          transition={safeTransition(reducedMotion, {
            duration: MOTION_MEDIUM,
            ease: EASE_OUT,
          })}
        >
          <Shield size={14} className={styles.honestyIcon} aria-hidden="true" />
          <p className={styles.honestyText}>
            This is a read-only and draft-only connection. Your AI assistant
            cannot hold funds, execute trades, or access anything beyond your
            public wallet address. Authentication in this version is
            address-based, not full account security — do not rely on this as a
            private or exclusive access method.
          </p>
        </motion.div>

        {/* Connection card */}
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
            <KeyRound size={16} className={styles.cardIcon} aria-hidden="true" />
            <h2 className={styles.cardTitle}>Get your access token</h2>
          </div>

          <form
            className={styles.fieldGroup}
            onSubmit={(e) => {
              e.preventDefault();
              handleGetToken();
            }}
          >
            <label htmlFor="mcp-address" className={styles.fieldLabel}>
              Wallet address
            </label>
            <input
              id="mcp-address"
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              placeholder="0x1234...abcd"
              className={styles.addressInput}
            />
            <p className={styles.fieldHint}>
              Pre-filled from your connected wallet if you have one, but you can
              edit it — the MCP token is independent of your browser wallet
              session, so you can request a token for any public address you
              want to monitor.
            </p>

            {requestStatus === 'error' && errorMessage && (
              <div className={styles.errorBox} role="alert">
                <AlertCircle size={14} className={styles.errorIcon} aria-hidden="true" />
                <p className={styles.errorText}>{errorMessage}</p>
              </div>
            )}

            <button
              type="submit"
              className={`${styles.primaryButton} ${
                requestStatus === 'submitting' ? styles.buttonDisabled : ''
              }`}
              disabled={requestStatus === 'submitting'}
            >
              {requestStatus === 'submitting' ? (
                <>
                  <Loader2 size={14} className="spin" aria-hidden="true" />
                  Requesting token...
                </>
              ) : requestStatus === 'success' ? (
                <>
                  <CheckCircle size={14} aria-hidden="true" />
                  Token ready
                </>
              ) : (
                'Get Access Token'
              )}
            </button>
          </form>

          {requestStatus === 'success' && token && (
            <div className={styles.successSection}>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Access token</span>
                <div className={styles.codeRow}>
                  <pre className={styles.codeBlock}>
                    <code aria-label="Your Pulse MCP access token">{token}</code>
                  </pre>
                  <button
                    type="button"
                    className={styles.copyButton}
                    onClick={() => copyText(token, 'token')}
                    aria-label="Copy access token to clipboard"
                  >
                    {copiedToken ? (
                      <CheckCircle size={14} aria-hidden="true" />
                    ) : (
                      <Copy size={14} aria-hidden="true" />
                    )}
                    <span className={styles.copyButtonText}>
                      {copiedToken ? 'Copied' : 'Copy'}
                    </span>
                  </button>
                </div>
                <div aria-live="polite" className="sr-only">
                  {copiedToken ? 'Access token copied to clipboard' : ''}
                </div>
                {tokenAddress && (
                  <p className={styles.fieldHint}>
                    Token is bound to {tokenAddress}. You can copy it manually
                    if the button is unavailable.
                  </p>
                )}
              </div>

              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Claude Desktop config</span>
                <pre className={styles.codeBlock}>
                  <code aria-label="Claude Desktop MCP configuration JSON">
                    {configJson}
                  </code>
                </pre>
                <div className={styles.copyRow}>
                  <button
                    type="button"
                    className={styles.copyButton}
                    onClick={() => copyText(configJson, 'config')}
                    aria-label="Copy Claude Desktop config to clipboard"
                  >
                    {copiedConfig ? (
                      <CheckCircle size={14} aria-hidden="true" />
                    ) : (
                      <Copy size={14} aria-hidden="true" />
                    )}
                    <span className={styles.copyButtonText}>
                      {copiedConfig ? 'Copied' : 'Copy Config'}
                    </span>
                  </button>
                </div>
                <div aria-live="polite" className="sr-only">
                  {copiedConfig ? 'Claude Desktop config copied to clipboard' : ''}
                </div>
              </div>
            </div>
          )}
        </motion.div>

        {/* How to use */}
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
            <Bot size={16} className={styles.cardIcon} aria-hidden="true" />
            <h2 className={styles.cardTitle}>How to use this</h2>
          </div>
          <ol className={styles.stepsList}>
            <li>Copy the config above.</li>
            <li>
              Open Claude Desktop&apos;s settings and paste it into your MCP
              server configuration.
            </li>
            <li>Restart Claude Desktop.</li>
            <li>Ask Claude about your Pulse portfolio.</li>
          </ol>
        </motion.div>

        {/* Supported clients note */}
        <motion.div
          className={styles.infoCallout}
          variants={safeVariants(reducedMotion, fadeSlideUp)}
          initial="hidden"
          animate="visible"
          transition={safeTransition(reducedMotion, {
            duration: MOTION_MEDIUM,
            ease: EASE_OUT,
            delay: 0.15,
          })}
        >
          <Info size={14} className={styles.infoIcon} aria-hidden="true" />
          <p className={styles.infoText}>
            ChatGPT&apos;s hosted connector requires a more advanced
            authentication method (OAuth) that this version doesn&apos;t support
            yet — Claude Desktop is the supported client for now.
          </p>
        </motion.div>
      </main>
    </div>
  );
}