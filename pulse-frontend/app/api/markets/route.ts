import { NextResponse } from 'next/server';
import {
  createPulseClient,
  getLiveBinaryMarkets,
  getUpcomingBinaryMarkets,
  getFinalizedBinaryMarkets,
  getOrderBookSnapshot,
  getFairProbability,
  getMarketVolume,
  getMarketCandles,
  getSpotPrice,
  getResolution,
  type BinaryMarket,
} from '@/lib/engine';

export interface MarketCardData {
  id: string; // bytes32
  marketAddress: string;
  asset: string;
  question: string;
  expiry: number;
  tradingStart: number;
  yesCents: number;
  noCents: number;
  volumeLabel: string;
  volumeRaw: number;
  sparklinePoints: [number, number][];
  status: 'Trading' | 'Locked' | 'Resolved' | 'Voided' | 'Settlement pending' | 'Listed';
  durationMin: number;
  resolvedOutcome?: 'YES' | 'NO' | 'VOID';
}

export interface MarketsApiResponse {
  live: MarketCardData[];
  settled: MarketCardData[];
  archive: MarketCardData[];
  stats: {
    liveCount: number;
    settledCount: number;
  };
}

async function processMarket(
  client: ReturnType<typeof createPulseClient>['client'],
  market: BinaryMarket,
  targetCategory: 'live' | 'settled' | 'archive',
): Promise<MarketCardData> {
  const asset = market.asset || 'BTC';
  const quoteDecimals = market.quoteDecimals || 6;
  const now = Math.floor(Date.now() / 1000);
  const expirySec = parseInt(market.expiry, 10);
  const tradingStartSec = parseInt(market.tradingStart, 10);
  const secondsRemaining = Math.max(0, expirySec - now);
  const durationMin = Math.round((expirySec - tradingStartSec) / 60) || 15;

  // Derive status
  let status: MarketCardData['status'] = 'Trading';
  let resolvedOutcome: 'YES' | 'NO' | 'VOID' | undefined = undefined;

  if (targetCategory === 'settled') {
    try {
      const res = await getResolution(client, market.id);
      const isVoided = res.events && res.events.some((e) => e.voided);
      if (isVoided) {
        status = 'Voided';
        resolvedOutcome = 'VOID';
      } else if (res.winningOutcome === 0) {
        status = 'Resolved';
        resolvedOutcome = 'YES';
      } else if (res.winningOutcome === 1) {
        status = 'Resolved';
        resolvedOutcome = 'NO';
      } else {
        status = 'Settlement pending';
      }
    } catch {
      status = 'Resolved';
    }
  } else if (targetCategory === 'archive') {
    if (now < tradingStartSec) {
      status = 'Listed';
    } else {
      status = 'Locked';
    }
  } else {
    // Live
    if (now >= expirySec) {
      status = 'Locked';
    } else {
      status = 'Trading';
    }
  }

  // Volume
  const volumeStr = getMarketVolume(market);
  const volumeRaw = Number(volumeStr) || 0;
  const volumeFormatted = volumeRaw >= 1000
    ? `${(volumeRaw / 1000).toFixed(1)}k`
    : volumeRaw > 0
    ? volumeRaw.toFixed(2)
    : '0';
  const volumeLabel = `${volumeFormatted} test USDC vol`;

  // YES / NO pricing
  let yesCents = 50;
  try {
    const book = await getOrderBookSnapshot(
      client,
      market.marketAddress,
      quoteDecimals,
    );
    if (book && book.bestBid !== '0') {
      const bid = Number(book.bestBid);
      const ask = Number(book.bestAsk || book.bestBid);
      yesCents = Math.round(((bid + ask) / 2) * 100);
    } else {
      throw new Error('empty book');
    }
  } catch {
    // Fair probability fallback
    try {
      const priceAsset = asset === 'ETH' ? 'ETH' : 'BTC';
      const spot = await getSpotPrice(client, priceAsset);
      if (spot) {
        const prob = getFairProbability(spot.price, spot.price, secondsRemaining);
        if (prob > 0 && prob < 1) {
          yesCents = Math.round(prob * 100);
        }
      }
    } catch {
      // keep 50
    }
  }
  yesCents = Math.max(1, Math.min(99, yesCents));
  const noCents = 100 - yesCents;

  // Real candles for sparkline (only if 2+ points exist)
  let sparklinePoints: [number, number][] = [];
  try {
    const candles = await getMarketCandles(client, market.marketAddress, 60, 20);
    if (candles && candles.length >= 2) {
      sparklinePoints = candles.map((c) => [
        Number(c.bucketStart) * 1000,
        Math.round(Number(c.closePrice) * 100),
      ]);
    }
  } catch {
    // No candles -> empty sparkline
  }

  return {
    id: market.id,
    marketAddress: market.marketAddress,
    asset,
    question: market.question || `Will ${asset}/USDC settle above strike?`,
    expiry: expirySec,
    tradingStart: tradingStartSec,
    yesCents,
    noCents,
    volumeLabel,
    volumeRaw,
    sparklinePoints,
    status,
    durationMin,
    resolvedOutcome,
  };
}

export async function GET() {
  try {
    const pulse = createPulseClient();

    const [liveRaw, upcomingRaw, finalizedRaw] = await Promise.all([
      getLiveBinaryMarkets(pulse.client).catch(() => []),
      getUpcomingBinaryMarkets(pulse.client).catch(() => []),
      getFinalizedBinaryMarkets(pulse.client).catch(() => []),
    ]);

    const [live, settled, archive] = await Promise.all([
      Promise.all(liveRaw.slice(0, 30).map((m) => processMarket(pulse.client, m, 'live'))),
      Promise.all(finalizedRaw.slice(0, 30).map((m) => processMarket(pulse.client, m, 'settled'))),
      Promise.all(upcomingRaw.slice(0, 20).map((m) => processMarket(pulse.client, m, 'archive'))),
    ]);

    return NextResponse.json({
      live,
      settled,
      archive,
      stats: {
        liveCount: live.length,
        settledCount: settled.length,
      },
    } satisfies MarketsApiResponse);
  } catch (error) {
    console.error('Markets API error:', error);
    return NextResponse.json(
      {
        live: [],
        settled: [],
        archive: [],
        stats: { liveCount: 0, settledCount: 0 },
      } satisfies MarketsApiResponse,
      { status: 500 },
    );
  }
}
