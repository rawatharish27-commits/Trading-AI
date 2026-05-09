import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { scanSymbol, scanSymbols, generateResearchReport } from '@/lib/trading/agents/research-agent';
import { Candle } from '@/lib/trading/types';

// Market Scanner API Route
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbols = searchParams.get('symbols')?.split(',') || [];
    const minScore = parseInt(searchParams.get('minScore') || '50');

    if (symbols.length === 0) {
      // Get all active symbols
      const activeSymbols = await db.symbol.findMany({
        where: { isActive: true },
        select: { id: true, symbol: true }
      });
      symbols.push(...activeSymbols.map(s => s.symbol));
    }

    const results = [];

    for (const symbol of symbols) {
      // Get candles for analysis
      const symbolData = await db.symbol.findUnique({
        where: { symbol },
        include: {
          candles: {
            where: { timeframe: '5m' },
            orderBy: { timestamp: 'desc' },
            take: 200
          }
        }
      });

      if (!symbolData || symbolData.candles.length < 50) {
        continue;
      }

      // Convert to analysis format
      const candles: Candle[] = symbolData.candles.reverse().map(c => ({
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

      // Scan symbol
      const scanResult = scanSymbol(symbol, candles);
      
      if (scanResult.score >= minScore) {
        results.push(scanResult);
      }
    }

    // Sort by score
    results.sort((a, b) => b.score - a.score);

    return NextResponse.json({
      success: true,
      data: {
        results,
        totalScanned: symbols.length,
        passingScore: results.length,
        report: generateResearchReport(results)
      }
    });
  } catch (error) {
    console.error('Scan Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to scan markets'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, candles } = body;

    if (!symbol || !candles) {
      return NextResponse.json({
        success: false,
        error: 'Symbol and candles are required'
      }, { status: 400 });
    }

    // Convert to analysis format
    const analysisCandles: Candle[] = candles.map((c: any) => ({
      symbolId: symbol,
      timeframe: '5m',
      timestamp: new Date(c.timestamp),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume || 0
    }));

    const result = scanSymbol(symbol, analysisCandles);

    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Single Scan Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to scan symbol'
    }, { status: 500 });
  }
}
