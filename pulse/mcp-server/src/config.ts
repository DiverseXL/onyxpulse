/**
 * Runtime configuration for the Pulse MCP server.
 *
 * All values are read from environment variables so the same code deploys to
 * a long-running host (Railway: `PORT` is injected) or a serverless one.
 */

export interface McpServerConfig {
  /** HTTP port to listen on. Railway injects `PORT`. */
  port: number;
  /** Public origin of the Pulse web app (used to build draft_trade_link URLs). */
  pulseAppUrl: string;
  /**
   * Public origin of THIS MCP server (shown to clients as the /mcp endpoint
   * on /connect). Falls back to the request's Host header when unset.
   */
  publicUrl?: string;
  /**
   * Stateless mode disables MCP sessions: every request is handled
   * independently with a fresh JSON-response transport. Needed for
   * serverless hosts where in-memory session state cannot survive.
   */
  stateless: boolean;
  /** In-memory sessions idle longer than this (ms) are closed by the sweeper. */
  sessionIdleTtlMs: number;
  /**
   * Server secret for STATELESS HMAC-signed tokens (serverless hosts where an
   * in-memory token store cannot be shared across instances). When unset, the
   * in-memory AuthStore is used instead. Generate e.g. with
   * `openssl rand -hex 32`.
   */
  signingSecret?: string;
  /** Lifetime of issued tokens (ms). Applies to both token implementations. */
  tokenTtlMs: number;
}

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
}

export function readConfig(): McpServerConfig {
  return {
    port: parsePort(env("PORT") ?? env("PULSE_MCP_PORT"), 4000),
    pulseAppUrl: env("PULSE_APP_URL") ?? "http://localhost:3000",
    publicUrl: env("PULSE_MCP_PUBLIC_URL"),
    stateless: env("PULSE_MCP_STATELESS") === "1",
    sessionIdleTtlMs: parsePort(env("PULSE_MCP_SESSION_IDLE_TTL_MS"), 30 * 60 * 1000),
    signingSecret: env("PULSE_MCP_SIGNING_SECRET"),
    tokenTtlMs: parsePort(env("PULSE_MCP_TOKEN_TTL_MS"), 30 * 24 * 60 * 60 * 1000),
  };
}
