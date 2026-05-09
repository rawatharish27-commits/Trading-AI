import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Trades API Route
// Manages trade records

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const trades = await db.trade.findMany({
      where,
      include: {
        symbol: {
          select: { symbol: true, name: true }
        }
      },
      orderBy: { executedAt: 'desc' },
      take: limit
    });

    return NextResponse.json({
      success: true,
      data: trades
    });
  } catch (error) {
    console.error('Trades Fetch Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch trades'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      symbolId,
      direction,
      entryPrice,
      quantity,
      stopLoss,
      takeProfit,
      riskPercent,
      setupId,
      tags,
      notes
    } = body;

    // Get symbol
    const symbol = await db.symbol.findUnique({
      where: { id: symbolId }
    });

    if (!symbol) {
      return NextResponse.json({
        success: false,
        error: 'Symbol not found'
      }, { status: 400 });
    }

    const trade = await db.trade.create({
      data: {
        symbolId,
        setupId,
        direction,
        status: 'OPEN',
        entryPrice,
        quantity,
        stopLoss,
        takeProfit,
        riskPercent: riskPercent || 1.0,
        tags: tags ? JSON.stringify(tags) : null,
        notes
      }
    });

    // Log the trade
    await db.systemLog.create({
      data: {
        level: 'INFO',
        category: 'EXECUTION',
        message: `New ${direction} trade opened for ${symbol.symbol}`,
        details: JSON.stringify({ tradeId: trade.id, entryPrice, quantity }),
        symbol: symbol.symbol
      }
    });

    return NextResponse.json({
      success: true,
      data: trade
    });
  } catch (error) {
    console.error('Trade Create Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create trade'
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { tradeId, exitPrice, pnl, pnlPercent, notes } = body;

    const trade = await db.trade.update({
      where: { id: tradeId },
      data: {
        status: 'CLOSED',
        exitPrice,
        pnl,
        pnlPercent,
        closedAt: new Date(),
        notes
      }
    });

    // Create learning record
    const result = pnl && pnl > 0 ? 'WIN' : pnl && pnl < 0 ? 'LOSS' : 'BREAKEVEN';
    
    await db.learningRecord.create({
      data: {
        tradeId: trade.id,
        setupType: 'CONFLUENCE',
        result,
        pnlPercent: pnlPercent || 0,
        holdTime: Math.floor((new Date().getTime() - trade.executedAt.getTime()) / 60000)
      }
    });

    return NextResponse.json({
      success: true,
      data: trade
    });
  } catch (error) {
    console.error('Trade Update Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update trade'
    }, { status: 500 });
  }
}
