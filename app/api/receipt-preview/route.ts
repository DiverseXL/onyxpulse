import { NextResponse } from 'next/server';
import {
  createPulseClient,
  getFinalizedBinaryMarkets,
  buildShareableReceipt,
  type PulseReceipt,
} from '@/lib/engine';

export type ReceiptPreviewData = {
  receipt: PulseReceipt | null;
};

export async function GET() {
  try {
    const pulse = createPulseClient();

    // Fetch finalized markets — these are resolved/voided and ready for receipt display.
    const finalized = await getFinalizedBinaryMarkets(pulse.client).catch(() => []);

    if (finalized.length === 0) {
      return NextResponse.json({ receipt: null });
    }

    // Pick the most recently finalized market (first in list, sorted by indexer recency).
    const market = finalized[0];

    // Build the shareable receipt from on-chain data.
    const receipt = await buildShareableReceipt(pulse.client, market.marketId);

    return NextResponse.json({ receipt });
  } catch (error) {
    console.error('Receipt preview API error:', error);
    return NextResponse.json({ receipt: null });
  }
}
