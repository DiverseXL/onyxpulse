/**
 * Canvas-based receipt renderer.
 *
 * Generates a thermal-printer-style PNG image using the native browser Canvas API.
 * Combines public settlement receipt data with the connected wallet's personal
 * trade details. Includes a QR code linking to the shareable receipt URL.
 *
 * NO EMOJI anywhere.
 */

import QRCode from 'qrcode';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Public settlement receipt data (from buildShareableReceipt). */
export interface ReceiptData {
  marketId: string;
  question: string;
  asset: string;
  strike: string;
  expiry: string;
  status: string;
  winningOutcome: number | null;
  voided: boolean;
  voidedNote: string | null;
  explorerTxUrl: string | null;
}

/** Connected wallet's personal trade data for this market. */
export interface TradeData {
  /** 0 = YES, 1 = NO. */
  outcomeIndex: 0 | 1;
  /** Human-readable quantity. */
  quantity: string;
  /** Human-readable entry price (e.g. "0.62"). */
  entryPrice: string;
  /** Human-readable cost in test USDC. */
  cost: string;
  /** Human-readable payout. */
  payout: string;
  /** Human-readable net P&L with +/- sign. */
  netPnl: string;
  /** Transaction hash of the trade, if available. */
  txHash: string | null;
}

/** Full dataset for rendering the receipt image. */
export interface ReceiptImageData {
  receipt: ReceiptData;
  trade: TradeData;
}

// ─── Canvas constants ─────────────────────────────────────────────────────────

const WIDTH = 400;
const PADDING = 28;
const CONTENT_WIDTH = WIDTH - PADDING * 2;
const LINE_HEIGHT = 20;
const FONT_FAMILY = 'JetBrains Mono, Courier New, monospace';

// ─── Drawing helpers ──────────────────────────────────────────────────────────

function drawDashedLine(
  ctx: CanvasRenderingContext2D,
  y: number,
  dash = '-',
) {
  ctx.textAlign = 'center';
  ctx.fillText(dash.repeat(Math.floor(CONTENT_WIDTH / ctx.measureText(dash).width)), WIDTH / 2, y);
}

function drawLabelValue(
  ctx: CanvasRenderingContext2D,
  y: number,
  label: string,
  value: string,
  bold = false,
) {
  ctx.font = `${bold ? 'bold ' : ''}13px ${FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.fillText(label, PADDING, y);
  ctx.textAlign = 'right';
  ctx.fillText(value, WIDTH - PADDING, y);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  lineHeight: number,
  startY: number,
): number {
  const words = text.split(' ');
  let line = '';
  let y = startY;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line) {
      ctx.textAlign = 'left';
      ctx.fillText(line, PADDING, y);
      line = word;
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) {
    ctx.textAlign = 'left';
    ctx.fillText(line, PADDING, y);
    y += lineHeight;
  }
  return y;
}

// ─── Main render function ─────────────────────────────────────────────────────

/**
 * Render a receipt image on a canvas and return the canvas element.
 *
 * @param data - Combined receipt + trade data.
 * @param shareUrl - The full shareable URL for the QR code.
 * @returns The rendered canvas element.
 */
export async function renderReceiptCanvas(
  data: ReceiptImageData,
  shareUrl: string,
): Promise<HTMLCanvasElement> {
  const { receipt, trade } = data;

  // Pre-generate QR code as data URL
  const qrDataUrl = await QRCode.toDataURL(shareUrl, {
    width: 120,
    margin: 0,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
  });

  // Load QR image
  const qrImg = new Image();
  await new Promise<void>((resolve, reject) => {
    qrImg.onload = () => resolve();
    qrImg.onerror = () => reject(new Error('Failed to load QR code image'));
    qrImg.src = qrDataUrl;
  });

  // ── First pass: measure height ──────────────────────────────────────────
  const offscreen = document.createElement('canvas');
  offscreen.width = WIDTH;
  const measureCtx = offscreen.getContext('2d')!;
  measureCtx.font = `bold 22px ${FONT_FAMILY}`;

  let totalHeight = PADDING;
  totalHeight += LINE_HEIGHT; // PULSE header
  totalHeight += LINE_HEIGHT; // subheader
  totalHeight += LINE_HEIGHT * 1.5; // dashed line + spacing
  totalHeight += LINE_HEIGHT; // timestamp
  totalHeight += LINE_HEIGHT * 1.5; // question (wrapped, estimate 2 lines max)
  totalHeight += LINE_HEIGHT; // dashed line
  totalHeight += LINE_HEIGHT * 6; // itemized lines (ASSET, SIDE, QTY, PRICE, COST, blank)
  totalHeight += LINE_HEIGHT; // dashed line
  totalHeight += LINE_HEIGHT; // OUTCOME
  totalHeight += LINE_HEIGHT; // PAYOUT
  totalHeight += LINE_HEIGHT; // NET P&L
  totalHeight += LINE_HEIGHT; // dashed line
  totalHeight += LINE_HEIGHT * 2; // tx hash (wrapped)
  totalHeight += LINE_HEIGHT; // spacing before QR
  totalHeight += 130; // QR code
  totalHeight += LINE_HEIGHT * 2; // footer text
  totalHeight += PADDING; // bottom padding

  // ── Second pass: actual render ──────────────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = '#FAFAF5';
  ctx.fillRect(0, 0, WIDTH, totalHeight);

  // Text color
  ctx.fillStyle = '#1A1A1A';

  let y = PADDING;

  // a. Header: "PULSE"
  ctx.font = `bold 22px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.fillText('PULSE', WIDTH / 2, y);
  y += LINE_HEIGHT;

  // b. Subheader
  ctx.font = `11px ${FONT_FAMILY}`;
  ctx.fillStyle = '#666666';
  ctx.fillText('Somnia Shannon Testnet', WIDTH / 2, y);
  y += LINE_HEIGHT;
  ctx.fillStyle = '#1A1A1A';

  // c. Dashed separator
  y += 4;
  ctx.font = `12px ${FONT_FAMILY}`;
  drawDashedLine(ctx, y);
  y += LINE_HEIGHT * 0.8;

  // d. Timestamp
  ctx.font = `12px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  const settlementDate = new Date(Number(receipt.expiry) * 1000);
  ctx.fillText(
    settlementDate.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
      hour12: false,
    }) + ' UTC',
    WIDTH / 2,
    y,
  );
  y += LINE_HEIGHT;

  // e. Market question (wrapped)
  ctx.font = `bold 12px ${FONT_FAMILY}`;
  y = wrapText(ctx, receipt.question, CONTENT_WIDTH, LINE_HEIGHT, y);
  y += 4;

  // f. Dashed separator
  ctx.font = `12px ${FONT_FAMILY}`;
  drawDashedLine(ctx, y);
  y += LINE_HEIGHT * 0.8;

  // g. Itemized lines
  const outcomeLabel = trade.outcomeIndex === 0 ? 'YES' : 'NO';
  drawLabelValue(ctx, y, 'ASSET', receipt.asset);
  y += LINE_HEIGHT;
  drawLabelValue(ctx, y, 'SIDE', outcomeLabel);
  y += LINE_HEIGHT;
  drawLabelValue(ctx, y, 'QUANTITY', trade.quantity);
  y += LINE_HEIGHT;
  drawLabelValue(ctx, y, 'ENTRY PRICE', trade.entryPrice);
  y += LINE_HEIGHT;
  drawLabelValue(ctx, y, 'COST', `${trade.cost} USDC`);
  y += LINE_HEIGHT * 1.5;

  // h. Dashed separator
  drawDashedLine(ctx, y);
  y += LINE_HEIGHT * 0.8;

  // i. OUTCOME
  let outcomeText: string;
  if (receipt.voided) {
    outcomeText = 'VOID -- REFUNDED AT PAR';
  } else if (receipt.winningOutcome !== null) {
    const winner = receipt.winningOutcome === 0 ? 'YES' : 'NO';
    outcomeText = winner;
  } else {
    outcomeText = 'PENDING';
  }
  drawLabelValue(ctx, y, 'OUTCOME', outcomeText, true);
  y += LINE_HEIGHT;

  // j. PAYOUT
  drawLabelValue(ctx, y, 'PAYOUT', `${trade.payout} USDC`, true);
  y += LINE_HEIGHT;

  // k. NET P&L
  const pnlColor = trade.netPnl.startsWith('+')
    ? '#2E7D32'
    : trade.netPnl.startsWith('-')
      ? '#C62828'
      : '#1A1A1A';
  ctx.font = `bold 13px ${FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#1A1A1A';
  ctx.fillText('NET P&L', PADDING, y);
  ctx.textAlign = 'right';
  ctx.fillStyle = pnlColor;
  ctx.fillText(trade.netPnl, WIDTH - PADDING, y);
  ctx.fillStyle = '#1A1A1A';
  y += LINE_HEIGHT;

  // l. Dashed separator
  y += 4;
  ctx.font = `12px ${FONT_FAMILY}`;
  drawDashedLine(ctx, y);
  y += LINE_HEIGHT * 0.8;

  // m. Transaction hash
  if (trade.txHash) {
    ctx.font = `10px ${FONT_FAMILY}`;
    ctx.fillStyle = '#888888';
    // Wrap long hash
    const hash = trade.txHash;
    const halfLen = Math.ceil(hash.length / 2);
    ctx.textAlign = 'center';
    ctx.fillText(hash.slice(0, halfLen), WIDTH / 2, y);
    y += 14;
    ctx.fillText(hash.slice(halfLen), WIDTH / 2, y);
    y += LINE_HEIGHT;
    ctx.fillStyle = '#1A1A1A';
  }

  // n. QR code
  y += 8;
  const qrSize = 120;
  const qrX = (WIDTH - qrSize) / 2;
  ctx.drawImage(qrImg, qrX, y, qrSize, qrSize);
  y += qrSize + 12;

  // o. Footer text
  ctx.font = `10px ${FONT_FAMILY}`;
  ctx.fillStyle = '#888888';
  ctx.textAlign = 'center';
  ctx.fillText('Settled via DreamDEX Event Contracts', WIDTH / 2, y);
  y += 14;
  ctx.fillText('Verify anytime -- scan or visit the link above', WIDTH / 2, y);

  return canvas;
}

/**
 * Trigger a PNG download of the rendered receipt.
 *
 * @param data - Combined receipt + trade data.
 * @param marketId - The market ID (used in the filename).
 */
export async function downloadReceipt(
  data: ReceiptImageData,
  marketId: string,
): Promise<void> {
  const baseUrl =
    typeof window !== 'undefined' ? window.location.origin : '';
  const shareUrl = `${baseUrl}/receipt/${marketId}`;

  const canvas = await renderReceiptCanvas(data, shareUrl);

  // Convert to PNG and trigger download
  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  const shortId = marketId.slice(0, 10);
  link.download = `pulse-receipt-${shortId}.png`;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
