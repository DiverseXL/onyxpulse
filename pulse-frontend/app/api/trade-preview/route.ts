import { NextResponse } from 'next/server';
import {
  createPulseClient,
  getLiveBinaryMarkets,
  getOrderBookSnapshot,
  getMarketVolume,
  getFairProbability,
  getSpotPrice,
  getMarketCandles,
  type BinaryMarket,
} from '@/lib/engine';

export type TradePreviewData = {
  marketId: string;
  marketAddress: string;
  poolAddress: string;
  quoteDecimals: number;
  title: string;
  contextLine: string;
  asset: string;
  windowDuration: string;
  yesCents: number;
  noCents: number;
  yesAskCents: number;  // YES best ask — what you pay to buy YES
  noAskCents: number;   // NO best ask = 100 - YES best bid — what you pay to buy NO
  deltaLabel: string;
  deltaPositive: boolean;
  volumeLabel: string;
  currentSpot: string;
  points: [number, number][]; // [timestamp_ms, yesPriceCents]
  useRealSeries: boolean;
  timeframePoints: {
    '1H': [number, number][];
    '1D': [number, number][];
    All: [number, number][];
  };
  quote: {
    quantity: number;
    cost: number;
    toWin: number;
  };
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedMarketId = searchParams.get('marketId');

    const pulse = createPulseClient();
    const liveMarkets = await getLiveBinaryMarkets(pulse.client).catch(() => []);

    let targetMarket: BinaryMarket | null = null;
    if (requestedMarketId) {
      // Find the specific market requested (from Markets tab's Trade button)
      targetMarket = liveMarkets.find((m) => m.marketId === requestedMarketId || m.id === requestedMarketId) || null;
    }
    if (!targetMarket && liveMarkets.length > 0) {
      targetMarket = liveMarkets[0];
    }

    const now = Date.now();

    if (targetMarket) {
      const asset = targetMarket.asset || 'BTC';
      const quoteDecimals = targetMarket.quoteDecimals || 6;
      const volumeStr = getMarketVolume(targetMarket);
      const volumeFormatted = Number(volumeStr).toLocaleString('en-US', {
        maximumFractionDigits: 2,
      });

      let yesCents = 58;
      let yesAskCents = 59;
      let noAskCents = 59;
      try {
        const orderBookSnapshot = await getOrderBookSnapshot(
          pulse.client,
          targetMarket.marketAddress,
          quoteDecimals,
        );
        if (orderBookSnapshot && orderBookSnapshot.bestBid !== '0') {
          const bid = Number(orderBookSnapshot.bestBid);
          const ask = Number(orderBookSnapshot.bestAsk || orderBookSnapshot.bestBid);
          yesCents = Math.round(((bid + ask) / 2) * 100);
          // CLOB ask prices: YES ask is what you pay to buy YES;
          // NO ask = 100 - YES bid (complementary side of the book)
          yesAskCents = Math.round(ask * 100);
          noAskCents = Math.round((1 - bid) * 100);
        }
      } catch {
        // Fallback to fair probability calculation
      }

      // Check spot price and fair probability heuristic
      let spotPriceStr = '64280.50';
      try {
        const spot = await getSpotPrice(pulse.client, asset === 'ETH' ? 'ETH' : 'BTC');
        if (spot) {
          spotPriceStr = spot.price;
          const expirySec = Number(targetMarket.expiry);
          const secondsRemaining = expirySec - Math.floor(now / 1000);
          // Use spot price as strike fallback — the question text contains the real strike
          const prob = getFairProbability(
            spot.price,
            spot.price,
            secondsRemaining,
          );
          if (yesCents === 58 && prob > 0 && prob < 1) {
            yesCents = Math.round(prob * 100);
          }
        }
      } catch {
        // spot fallback
      }

      yesCents = Math.max(1, Math.min(99, yesCents));
      const noCents = 100 - yesCents;
      yesAskCents = Math.max(1, Math.min(99, yesAskCents));
      noAskCents = Math.max(1, Math.min(99, noAskCents));

      // Attempt historical candles
      let useRealSeries = false;
      let seriesPoints: [number, number][] = [];

      try {
        const candles = await getMarketCandles(
          pulse.client,
          targetMarket.marketAddress,
          60, // 1m candles
          50,
        );
        if (candles && candles.length >= 5) {
          seriesPoints = candles.map((c) => [
            Number(c.bucketStart) * 1000,
            Math.round(Number(c.closePrice) * 100),
          ]);
          useRealSeries = true;
        }
      } catch {
        // Real series not available yet
      }

      if (!useRealSeries || seriesPoints.length < 5) {
        seriesPoints = generateIllustrativeSeries(yesCents, now, 60 * 60 * 1000); // 1h
        useRealSeries = false;
      }

      const points1H = generateIllustrativeSeries(yesCents, now, 60 * 60 * 1000);
      const points1D = generateIllustrativeSeries(yesCents, now, 24 * 60 * 60 * 1000);
      const pointsAll = seriesPoints;

      const durationMin = Math.round((Number(targetMarket.expiry) - Number(targetMarket.tradingStart)) / 60) || 15;

      const data: TradePreviewData = {
        marketId: targetMarket.id,
        marketAddress: targetMarket.marketAddress,
        poolAddress: targetMarket.poolAddress,
        quoteDecimals: targetMarket.quoteDecimals || 6,
        title: targetMarket.question || `Will ${asset}/USDC settle above strike at window close?`,
        contextLine: `${asset} · ${durationMin}m window`,
        asset,
        windowDuration: `${durationMin}m`,
        yesCents,
        noCents,
        yesAskCents,
        noAskCents,
        deltaLabel: computeDeltaLabel(seriesPoints),
        deltaPositive: seriesPoints.length >= 2 && seriesPoints[seriesPoints.length - 1][1] >= seriesPoints[seriesPoints.length - 2][1],
        volumeLabel: `${volumeFormatted} test USDC volume`,
        currentSpot: spotPriceStr,
        points: pointsAll,
        useRealSeries,
        timeframePoints: {
          '1H': points1H,
          '1D': points1D,
          All: pointsAll,
        },
        quote: {
          quantity: 172.41,
          cost: 100,
          toWin: 72.41,
        },
      };

      return NextResponse.json(data);
    }

    // Default Somnia Shannon live fallback when no active market is queried
    const fallbackYesCents = 58;
    const fallbackNoCents = 42;
    const fallbackPoints1H = generateIllustrativeSeries(fallbackYesCents, now, 60 * 60 * 1000);
    const fallbackPoints1D = generateIllustrativeSeries(fallbackYesCents, now, 24 * 60 * 60 * 1000);
    const fallbackPointsAll = generateIllustrativeSeries(fallbackYesCents, now, 2 * 60 * 60 * 1000);

    const fallbackData: TradePreviewData = {
      marketId: '0x0000000000000000000000000000000000000000000000000000000000000001',
      marketAddress: '',
      poolAddress: '',
      quoteDecimals: 6,
      title: "Will BTC/USDC's price be at or above 64,250 at 16:30 UTC?",
      contextLine: 'BTC · 15m window',
      asset: 'BTC',
      windowDuration: '15m',
      yesCents: fallbackYesCents,
      noCents: fallbackNoCents,
      yesAskCents: fallbackYesCents + 1,
      noAskCents: fallbackNoCents + 1,
      deltaLabel: '+5.4%',
      deltaPositive: true,
      volumeLabel: '14,820.00 test USDC volume',
      currentSpot: '64,310.20',
      points: fallbackPointsAll,
      useRealSeries: false,
      timeframePoints: {
        '1H': fallbackPoints1H,
        '1D': fallbackPoints1D,
        All: fallbackPointsAll,
      },
      quote: {
        quantity: 172.41,
        cost: 100,
        toWin: 72.41,
      },
    };

    return NextResponse.json(fallbackData);
  } catch (error) {
    console.error('Trade preview API error:', error);
    const now = Date.now();
    const fallbackYesCents = 58;
    return NextResponse.json({
      marketId: '0x0000000000000000000000000000000000000000000000000000000000000001',
      marketAddress: '',
      poolAddress: '',
      quoteDecimals: 6,
      title: "Will BTC/USDC's price be at or above 64,250 at 16:30 UTC?",
      contextLine: 'BTC · 15m window',
      asset: 'BTC',
      windowDuration: '15m',
      yesCents: fallbackYesCents,
      noCents: 100 - fallbackYesCents,
      yesAskCents: fallbackYesCents + 1,
      noAskCents: 100 - fallbackYesCents + 1,
      deltaLabel: '+4.2%',
      deltaPositive: true,
      volumeLabel: '12,450.00 test USDC volume',
      currentSpot: '64,285.00',
      points: generateIllustrativeSeries(fallbackYesCents, now, 60 * 60 * 1000),
      useRealSeries: false,
      timeframePoints: {
        '1H': generateIllustrativeSeries(fallbackYesCents, now, 60 * 60 * 1000),
        '1D': generateIllustrativeSeries(fallbackYesCents, now, 24 * 60 * 60 * 1000),
        All: generateIllustrativeSeries(fallbackYesCents, now, 2 * 60 * 60 * 1000),
      },
      quote: {
        quantity: 172.41,
        cost: 100,
        toWin: 72.41,
      },
    });
  }
}

/**
 * Generate a realistic illustrative random-walk series that converges to the target price.
 */
function generateIllustrativeSeries(
  targetPriceCents: number,
  endTimestampMs: number,
  durationMs: number,
  count = 40,
): [number, number][] {
  const points: [number, number][] = [];
  const startTimestampMs = endTimestampMs - durationMs;
  const interval = durationMs / count;

  let current = Math.max(20, Math.min(80, targetPriceCents - (Math.random() * 16 - 8)));

  for (let i = 0; i <= count; i++) {
    const t = startTimestampMs + i * interval;
    const progress = i / count;
    // Pull towards target price as progress approaches 1
    const pull = (targetPriceCents - current) * progress * 0.4;
    const noise = (Math.random() - 0.5) * 4 * (1 - progress * 0.5);
    current = Math.max(5, Math.min(95, current + pull + noise));

    if (i === count) {
      current = targetPriceCents;
    }

    points.push([t, Math.round(current * 10) / 10]);
  }

  return points;
}

/**
 * Compute a delta label from the last two data points in a price series.
 * Returns a formatted string like '+2.3%' or '-1.8%'.
 */
function computeDeltaLabel(points: [number, number][]): string {
  if (points.length < 2) return '+0.0%';
  const prev = points[points.length - 2][1];
  const curr = points[points.length - 1][1];
  if (prev === 0) return '+0.0%';
  const pct = ((curr - prev) / prev) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}
