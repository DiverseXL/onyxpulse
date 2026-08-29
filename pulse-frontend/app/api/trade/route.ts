import { NextResponse } from 'next/server';
import {
  createPulseClient,
  createTrader,
  placeMarketOrder,
} from '@/lib/engine';

/**
 * POST /api/trade
 *
 * Places a market order (Immediate-or-Cancel) on a binary Event Contract pool.
 *
 * Body (JSON):
 *   {
 *     marketAddress: string;   // The pool's on-chain address
 *     side: "BUY_YES" | "BUY_NO" | "SELL_YES" | "SELL_NO";
 *     amount: number;          // Human-unit USDC amount to spend
 *     priceCents: number;      // Price in cents (e.g. 62 for 62%)
 *     decimals: number;        // Token decimals (default 6)
 *   }
 *
 * Uses a demo private key from DEMO_PRIVATE_KEY env var for testnet.
 * The key is used server-side only — never exposed to the client.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      marketAddress,
      side,
      amount,
      priceCents,
      decimals = 6,
    } = body as {
      marketAddress: string;
      side: 'BUY_YES' | 'BUY_NO' | 'SELL_YES' | 'SELL_NO';
      amount: number;
      priceCents: number;
      decimals?: number;
    };

    // Validate required fields
    if (!marketAddress || !side || !amount || !priceCents) {
      return NextResponse.json(
        { error: 'Missing required fields: marketAddress, side, amount, priceCents' },
        { status: 400 },
      );
    }

    // Validate side enum
    const validSides = ['BUY_YES', 'BUY_NO', 'SELL_YES', 'SELL_NO'];
    if (!validSides.includes(side)) {
      return NextResponse.json(
        { error: `Invalid side: "${side}". Must be one of: ${validSides.join(', ')}` },
        { status: 400 },
      );
    }

    // Get demo private key from environment
    const privateKey = process.env.DEMO_PRIVATE_KEY;
    if (!privateKey) {
      return NextResponse.json(
        {
          error: 'Trading not configured. Set DEMO_PRIVATE_KEY in .env.local for testnet.',
        },
        { status: 503 },
      );
    }

    // Create pulse client and trader
    const pulse = createPulseClient();
    const trader = createTrader(pulse, privateKey, decimals);

    // Convert price from cents to human decimal (e.g. 62 -> "0.62")
    const humanPrice = (priceCents / 100).toFixed(2);

    // Quantity = amount / price (how many outcome tokens you get)
    const humanQuantity = (amount / (priceCents / 100)).toFixed(2);

    // Place the market order
    const result = await placeMarketOrder(pulse.client, trader, {
      pool: marketAddress as `0x${string}`,
      side,
      humanPrice,
      humanQuantity,
      decimals,
    });

    return NextResponse.json({
      success: true,
      hash: result.hash,
      orderId: result.orderId?.toString() ?? null,
      fillsCount: result.fills?.length ?? 0,
    });
  } catch (error: unknown) {
    console.error('Trade API error:', error);

    const message =
      error instanceof Error ? error.message : 'Unknown error occurred';

    return NextResponse.json(
      { error: `Order failed: ${message}` },
      { status: 500 },
    );
  }
}
