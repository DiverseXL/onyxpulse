import { NextResponse } from 'next/server';
import {
  createPulseClient,
  getLiveBinaryMarkets,
  getUpcomingBinaryMarkets,
  getOrderBookSnapshot,
  getFairProbability,
  getMarketVolume,
  getMarketCandles,
  getSpotPrice,
  type BinaryMarket,
} from '@/lib/engine';

export type MarketPreviewRow = {
  id: string;
  marketId: string;
  asset: string;
  question: string;
  expiry: number;
  tradingStart: number;
  yesCents: number;
  volumeLabel: string;
  sparklinePoints: [number, number][];
  status: 'Trading' | 'Listed';
  durationMin: number;
};

export type MarketsPreviewData = {
  live: MarketPreviewRow[];
  upcoming: MarketPreviewRow[];
  nextWindowStart: number | null;
};

async function buildMarketRow(
  client: ReturnType<typeof createPulseClient>['client'],
  market: BinaryMarket,
  status: 'Trading' | 'Listed',
): Promise<MarketPreviewRow> {
  const asset = market.asset || 'BTC';
  const quoteDecimals = market.quoteDecimals || 6;
  const now = Math.floor(Date.now() / 1000);
  const expirySec = parseInt(market.expiry, 10);
  const tradingStartSec = parseInt(market.tradingStart, 10);
  const secondsRemaining = Math.max(0, expirySec - now);
  const durationMin = Math.round((expirySec - tradingStartSec) / 60) || 15;

  // Volume
  const volumeStr = getMarketVolume(market);
  const volumeNum = Number(volumeStr);
  const volumeFormatted = volumeNum >= 1000
    ? `${(volumeNum / 1000).toFixed(1)}k`
    : volumeNum.toFixed(2);
  const volumeLabel = `${volumeFormatted} test USDC vol`;

  // YES price: try order book mid, fall back to fair probability
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
    // Fallback to fair probability heuristic
    try {
      const priceAsset = asset === 'ETH' ? 'ETH' : 'BTC';
      const spot = await getSpotPrice(client, priceAsset);
      if (spot) {
        // Use spot as approximate strike for the heuristic
        const prob = getFairProbability(spot.price, spot.price, secondsRemaining);
        if (prob > 0 && prob < 1) {
          yesCents = Math.round(prob * 100);
        }
      }
    } catch {
      // keep default 50
    }
  }
  yesCents = Math.max(1, Math.min(99, yesCents));

  // Sparkline from candles (best-effort, omit if insufficient data)
  let sparklinePoints: [number, number][] = [];
  try {
    const candles = await getMarketCandles(client, market.marketAddress, 60, 30);
    if (candles && candles.length >= 3) {
      sparklinePoints = candles.map((c) => [
        Number(c.bucketStart) * 1000,
        Math.round(Number(c.closePrice) * 100),
      ]);
    }
  } catch {
    // Insufficient candle data — omit sparkline
  }

  return {
    id: market.id,
    marketId: market.marketId,
    asset,
    question: market.question || `Will ${asset}/USDC settle above strike?`,
    expiry: expirySec,
    tradingStart: tradingStartSec,
    yesCents,
    volumeLabel,
    sparklinePoints,
    status,
    durationMin,
  };
}

export async function GET() {
  try {
    const pulse = createPulseClient();

    const [liveMarkets, upcomingMarkets] = await Promise.all([
      getLiveBinaryMarkets(pulse.client).catch(() => []),
      getUpcomingBinaryMarkets(pulse.client).catch(() => []),
    ]);

    // Sort live by soonest-expiring first
    const sortedLive = [...liveMarkets].sort((a, b) => {
      return parseInt(a.expiry, 10) - parseInt(b.expiry, 10);
    });

    // Sort upcoming by soonest trading start
    const sortedUpcoming = [...upcomingMarkets].sort((a, b) => {
      return parseInt(a.tradingStart, 10) - parseInt(b.tradingStart, 10);
    });

    // Build rows (limit to reasonable count for performance)
    const liveRows = await Promise.all(
      sortedLive.slice(0, 20).map((m) => buildMarketRow(pulse.client, m, 'Trading')),
    );

    const upcomingRows = await Promise.all(
      sortedUpcoming.slice(0, 10).map((m) => buildMarketRow(pulse.client, m, 'Listed')),
    );

    // Next window start for empty state
    const nextWindowStart = upcomingRows.length > 0
      ? upcomingRows[0].tradingStart
      : null;

    return NextResponse.json({
      live: liveRows,
      upcoming: upcomingRows,
      nextWindowStart,
    });
  } catch (error) {
    console.error('Markets preview API error:', error);
    return NextResponse.json({
      live: [],
      upcoming: [],
      nextWindowStart: null,
    });
  }
}
