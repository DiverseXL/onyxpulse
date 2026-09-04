/**
 * The Pulse-hosted /connect page — where a user enters/confirms their PUBLIC
 * wallet address and receives a unique access token bound to it.
 *
 * Honest V1 framing (also in README.md):
 *   - The token proves the holder KNOWS the address, not that they own the
 *     wallet. That is acceptable ONLY because every tool is read-only or
 *     draft-only — portfolio data is public chain data and draft_trade_link
 *     never executes anything.
 *   - This is NOT a full OAuth 2.1 flow yet (per the MCP authorization spec).
 *     Full account-linking OAuth is a real future improvement.
 */

export function connectFormPage(opts: { mcpUrl: string; error?: string }): string {
  const errorHtml = opts.error
    ? `<p class="error" role="alert">${escapeHtml(opts.error)}</p>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Connect Pulse to an MCP client</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #0c0d10; color: #e7e7ea; font-family: system-ui, -apple-system, sans-serif;
    padding: 24px;
  }
  .card { max-width: 560px; width: 100%; background: #16171c; border: 1px solid #2a2b31; border-radius: 16px; padding: 32px; }
  h1 { margin: 0 0 8px; font-size: 20px; }
  .sub { color: #9a9ba3; font-size: 13px; line-height: 1.5; margin: 0 0 20px; }
  label { display: block; font-size: 13px; color: #c6c7cc; margin-bottom: 6px; }
  input[type="text"] {
    width: 100%; padding: 12px 14px; border-radius: 8px; border: 1px solid #33343b;
    background: #0c0d10; color: #fff; font-family: ui-monospace, monospace; font-size: 14px;
  }
  input[type="text"]:focus { outline: 2px solid #4f6ef7; border-color: transparent; }
  button {
    margin-top: 16px; width: 100%; padding: 12px; border: 0; border-radius: 8px;
    background: #4f6ef7; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer;
  }
  button:hover { background: #6280ff; }
  .error { background: #3a1416; border: 1px solid #6b2327; color: #ffb4b0; padding: 10px 12px; border-radius: 8px; font-size: 13px; margin: 0 0 16px; }
  .note { font-size: 12px; color: #8f9098; line-height: 1.6; margin-top: 20px; border-top: 1px solid #26272d; padding-top: 14px; }
  .note code { color: #b9babe; }
</style>
</head>
<body>
  <div class="card">
    <h1>Connect Pulse to Claude / ChatGPT</h1>
    <p class="sub">
      Enter your <strong>public</strong> wallet address to receive an access token for the Pulse MCP server.
      Your address is public information — <strong>never enter a private key or seed phrase here.</strong>
    </p>
    ${errorHtml}
    <form method="post" action="/connect">
      <label for="address">Public wallet address (0x…)</label>
      <input id="address" name="address" type="text" placeholder="0x1234…abcd" autocomplete="off" spellcheck="false" required />
      <button type="submit">Get access token</button>
    </form>
    <p class="note">
      V1 honest disclaimer: this token is bound to your address, not to proof of wallet ownership.
      Every tool is <strong>read-only or draft-only</strong> — nothing here can move funds. This is an
      address-based flow, <strong>not</strong> a full OAuth 2.1 implementation yet (that is a real future improvement).
    </p>
  </div>
</body>
</html>`;
}

export function connectResultPage(opts: {
  mcpUrl: string;
  address: string;
  token: string;
  expiresNote?: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Pulse MCP — access token ready</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #0c0d10; color: #e7e7ea; font-family: system-ui, -apple-system, sans-serif;
    padding: 24px;
  }
  .card { max-width: 640px; width: 100%; background: #16171c; border: 1px solid #2a2b31; border-radius: 16px; padding: 32px; }
  h1 { margin: 0 0 8px; font-size: 20px; color: #7ee2a8; }
  .sub { color: #9a9ba3; font-size: 13px; line-height: 1.5; margin: 0 0 20px; }
  .kv { display: grid; grid-template-columns: 110px 1fr; gap: 8px 12px; font-size: 13px; margin-bottom: 20px; }
  .kv dt { color: #8f9098; }
  .kv dd { margin: 0; font-family: ui-monospace, monospace; word-break: break-all; color: #cfe0ff; }
  .token { background: #0c0d10; border: 1px solid #33343b; border-radius: 8px; padding: 12px; font-family: ui-monospace, monospace; font-size: 12px; color: #cfe0ff; word-break: break-all; margin: 0 0 8px; }
  .copy { background: #26272d; color: #e7e7ea; border: 1px solid #3a3b43; border-radius: 8px; padding: 8px 12px; font-size: 13px; cursor: pointer; margin-bottom: 20px; }
  .copy:hover { background: #2f3038; }
  pre { background: #0c0d10; border: 1px solid #33343b; border-radius: 8px; padding: 14px; font-size: 12px; overflow-x: auto; color: #c6c7cc; line-height: 1.5; margin: 0 0 20px; }
  .note { font-size: 12px; color: #8f9098; line-height: 1.6; border-top: 1px solid #26272d; padding-top: 14px; margin-top: 4px; }
  .note code { color: #b9babe; }
  a { color: #6280ff; }
</style>
</head>
<body>
  <div class="card">
    <h1>Token ready</h1>
    <p class="sub">Copy this token and paste it into your MCP client (see the config snippet below).</p>
    <dl class="kv">
      <dt>Wallet</dt><dd>${escapeHtml(opts.address)}</dd>
      <dt>MCP endpoint</dt><dd>${escapeHtml(opts.mcpUrl)}</dd>
    </dl>
    <p class="token" id="token">${escapeHtml(opts.token)}</p>
    <button class="copy" type="button" onclick="copyToken()">Copy token</button>
    <pre>{
  "mcpServers": {
    "pulse": {
      "type": "http",
      "url": "${escapeHtml(opts.mcpUrl)}",
      "headers": {
        "Authorization": "Bearer &lt;paste-token-here&gt;"
      }
    }
  }
}</pre>
    <p class="note">
      Every tool is <strong>read-only or draft-only</strong> — this server never holds a private key and can never
      move funds. Tokens are stored in memory and are lost when the server restarts. This is an address-based V1
      flow, not a full OAuth 2.1 implementation yet.
    </p>
  </div>
  <script>
    function copyToken() {
      const el = document.getElementById('token');
      navigator.clipboard.writeText(el.textContent.trim());
      el.style.outline = '2px solid #7ee2a8';
      setTimeout(() => { el.style.outline = ''; }, 900);
    }
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}