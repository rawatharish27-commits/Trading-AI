import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Market Data API Route
// Fetches and manages OHLCV candle data

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const timeframe = searchParams.get('timeframe') || '5m';
    const limit = parseInt(searchParams.get('limit') || '100');

    if (!symbol) {
      return NextResponse.json({ 
        success: false, 
        error: 'Symbol is required' 
      }, { status: 400 });
    }

    // Get symbol ID
    const symbolData = await db.symbol.findUnique({
      where: { symbol }
    });

    if (!symbolData) {
      const newSymbol = await db.symbol.create({
        data: { symbol, name: symbol }
      });
      
      return NextResponse.json({
        success: true,
        data: {
          symbol: newSymbol,
          candles: []
        }
      });
    }

    // Get candles
    const candles = await db.candle.findMany({
      where: {
        symbolId: symbolData.id,
        timeframe
      },
      orderBy: { timestamp: 'desc' },
      take: limit
    });

    return NextResponse.json({
      success: true,
      data: {
        symbol: symbolData,
        candles: candles.reverse()
      }
    });
  } catch (error) {
    console.error('Market Data Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch market data'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, timeframe, candles } = body;

    if (!symbol || !timeframe || !candles || !Array.isArray(candles)) {
      return NextResponse.json({
        success: false,
        error: 'Symbol, timeframe, and candles array are required'
      }, { status: 400 });
    }

    let symbolData = await db.symbol.findUnique({
      where: { symbol }
    });

    if (!symbolData) {
      symbolData = await db.symbol.create({
        data: { symbol, name: symbol }
      });
    }

    let inserted = 0;
    let skipped = 0;

    for (const candle of candles) {
      try {
        await db.candle.create({
          data: {
            symbolId: symbolData.id,
            timeframe,
            timestamp: new Date(candle.timestamp),
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume || 0
          }
        });
        inserted++;
      } catch {
        skipped++;
      }
    }

    return NextResponse.json({
      success: true,
      data: { inserted, skipped }
    });
  } catch (error) {
    console.error('Market Data Insert Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to insert market data'
    }, { status: 500 });
  }
}
