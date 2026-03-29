import { NextRequest, NextResponse } from 'next/server';
import { runSMCAnalysis } from '@/lib/trading/smc';
import { MarketDirection, Candle } from '@/lib/trading/types';
import { db } from '@/lib/db';

// SMC Analysis API Route
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const timeframe = searchParams.get('timeframe') || '5m';
    const htfBias = searchParams.get('htfBias') as MarketDirection || MarketDirection.NEUTRAL;

    if (!symbol) {
      return NextResponse.json({
        success: false,
        error: 'Symbol is required'
      }, { status: 400 });
    }

    const symbolData = await db.symbol.findUnique({
      where: { symbol },
      include: {
        candles: {
          where: { timeframe },
          orderBy: { timestamp: 'asc' },
          take: 200
        }
      }
    });

    if (!symbolData || symbolData.candles.length < 50) {
      return NextResponse.json({
        success: false,
        error: 'Insufficient data for analysis'
      }, { status: 400 });
    }

    const candles: Candle[] = symbolData.candles.map(c => ({
      id: c.id,
      symbolId: c.symbolId,
      timeframe: c.timeframe as any,
      timestamp: c.timestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume
    }));

    const analysis = runSMCAnalysis(symbolData.id, timeframe, candles, htfBias);

    return NextResponse.json({
      success: true,
      data: {
        symbol: symbolData.symbol,
        timeframe,
        analysis
      }
    });
  } catch (error) {
    console.error('SMC Analysis Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to run SMC analysis'
    }, { status: 500 });
  }
}
