import { NextResponse } from 'next/server';
import {
  createPulseClient,
  buildReceiptData,
  buildShareableReceipt,
  type PulseReceipt,
} from '@/lib/engine';

/** Terminal statuses where a receipt can be built. */
const TERMINAL_STATUSES = new Set(['Resolved', 'Finalized', 'Voided']);

export type ReceiptApiResponse =
  | { receipt: PulseReceipt; status: 'resolved' }
  | { receipt: null; status: 'pending'; currentStatus: string; marketId: string }
  | { receipt: null; status: 'not_found' }
  | { receipt: null; status: 'error'; error: string };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ marketId: string }> },
) {
  try {
    const { marketId } = await params;

    if (!marketId || !marketId.startsWith('0x')) {
      return NextResponse.json(
        { receipt: null, status: 'not_found' } satisfies ReceiptApiResponse,
        { status: 404 },
      );
    }

    const pulse = createPulseClient();

    // First, fetch the raw receipt data to inspect the market's current status.
    // buildReceiptData calls client.getBinaryMarket internally — if the market
    // doesn't exist, it throws, which we catch below as "not found".
    let receiptData;
    try {
      receiptData = await buildReceiptData(pulse.client, marketId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('not found') || msg.includes('Not found')) {
        return NextResponse.json(
          { receipt: null, status: 'not_found' } satisfies ReceiptApiResponse,
          { status: 404 },
        );
      }
      throw err;
    }

    const marketStatus = receiptData.market.status;

    // If the market hasn't reached a terminal status yet, return pending.
    if (!TERMINAL_STATUSES.has(marketStatus)) {
      return NextResponse.json(
        {
          receipt: null,
          status: 'pending',
          currentStatus: marketStatus,
          marketId,
        } satisfies ReceiptApiResponse,
        { status: 200 },
      );
    }

    // Terminal status — build the full shareable receipt.
    const receipt = await buildShareableReceipt(pulse.client, marketId);

    return NextResponse.json(
      { receipt, status: 'resolved' } satisfies ReceiptApiResponse,
      { status: 200 },
    );
  } catch (error: unknown) {
    console.error('Receipt API error:', error);
    return NextResponse.json(
      {
        receipt: null,
        status: 'error',
        error: 'Failed to load receipt data',
      } satisfies ReceiptApiResponse,
      { status: 500 },
    );
  }
}
