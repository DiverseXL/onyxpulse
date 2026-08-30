/**
 * /receipt/[marketId] -- Public, shareable, verifiable settlement receipt.
 *
 * Server component: exports generateMetadata for SEO/shareability.
 * Fetches receipt data server-side and passes to client component for
 * interactive features (copy link, raw JSON toggle).
 * No wallet connection required.
 * NO EMOJI anywhere.
 */

import type { Metadata } from 'next';
import ReceiptClient from './ReceiptClient';

type PageProps = {
  params: Promise<{ marketId: string }>;
};

// ─── API response types ───────────────────────────────────────────────────────

type ReceiptApiResponse =
  | { receipt: ReceiptData; status: 'resolved' }
  | { receipt: null; status: 'pending'; currentStatus: string; marketId: string }
  | { receipt: null; status: 'not_found' }
  | { receipt: null; status: 'error'; error: string };

type ReceiptData = {
  schemaVersion: string;
  marketId: string;
  question: string;
  asset: string;
  strike: string;
  expiry: string;
  status: string;
  winningOutcome: number | null;
  voided: boolean;
  voidedNote: string | null;
  resolutionEvents: Array<{
    kind: string;
    winningOutcome: number | null;
    blockNumber: string;
    timestamp: string;
    txHash: string;
    voided: boolean;
  }>;
  explorerTxUrl: string | null;
  oracleExplorerUrl: string | null;
  generatedAt: string;
};

// ─── Server-side data fetch ───────────────────────────────────────────────────

async function fetchReceiptData(
  marketId: string,
): Promise<ReceiptApiResponse> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/receipt/${encodeURIComponent(marketId)}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    return { receipt: null, status: 'not_found' };
  }

  return res.json();
}

// ─── generateMetadata ─────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  try {
    const { marketId } = await params;
    const data = await fetchReceiptData(marketId);

    if (data.status === 'resolved' && data.receipt) {
      const r = data.receipt;
      const winner =
        !r.voided && r.winningOutcome !== null
          ? r.winningOutcome === 0
            ? 'YES'
            : 'NO'
          : null;

      const statusLabel = r.voided ? 'Voided' : `Resolved ${winner || ''}`.trim();
      const title = `Pulse Receipt -- ${r.asset} -- ${statusLabel}`;
      const description = r.question;

      return {
        title,
        description,
        openGraph: {
          title,
          description,
          type: 'website',
        },
      };
    }

    if (data.status === 'pending') {
      return {
        title: 'Pulse Receipt -- Pending Settlement',
        description:
          'This market has not settled yet. Check back after it resolves.',
      };
    }

    return {
      title: 'Pulse Receipt -- Market Not Found',
      description: 'This market ID does not exist.',
    };
  } catch {
    return {
      title: 'Pulse Receipt',
      description: 'Verified settlement receipt for a DreamDEX market.',
    };
  }
}

// ─── Page component ───────────────────────────────────────────────────────────

export default async function ReceiptPage({ params }: PageProps) {
  const { marketId } = await params;

  // Server-side fetch of receipt data
  let data: ReceiptApiResponse;
  try {
    data = await fetchReceiptData(marketId);
  } catch {
    data = { receipt: null, status: 'error', error: 'Failed to load' };
  }

  return <ReceiptClient marketId={marketId} initialData={data} />;
}
