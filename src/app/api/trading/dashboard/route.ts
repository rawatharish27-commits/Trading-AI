import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Dashboard Stats API Route
// Returns comprehensive trading statistics

export async function GET(request: NextRequest) {
  try {
    // Get all trades
    const trades = await db.trade.findMany({
      include: {
        symbol: { select: { symbol: true } }
      }
    });

    // Get open trades
    const openTrades = trades.filter(t => t.status === 'OPEN');
    
    // Get closed trades
    const closedTrades = trades.filter(t => t.status === 'CLOSED');
    
    // Calculate statistics
    const winningTrades = closedTrades.filter(t => t.pnl && t.pnl > 0);
    const losingTrades = closedTrades.filter(t => t.pnl && t.pnl < 0);
    
    const totalPnL = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    
    // Today's trades
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTrades = closedTrades.filter(t => t.executedAt >= today);
    const todayPnL = todayTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);

    // Calculate win rate
    const winRate = closedTrades.length > 0 
      ? (winningTrades.length / closedTrades.length) * 100 
      : 0;

    // Calculate max drawdown
    let peak = 0;
    let maxDrawdown = 0;
    let runningPnL = 0;
    
    const sortedTrades = [...closedTrades].sort((a, b) => 
      a.executedAt.getTime() - b.executedAt.getTime()
    );
    
    for (const trade of sortedTrades) {
      runningPnL += trade.pnl || 0;
      if (runningPnL > peak) {
        peak = runningPnL;
      }
      const drawdown = peak - runningPnL;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    // Calculate expectancy
    const avgWin = winningTrades.length > 0
      ? winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) / winningTrades.length
      : 0;
    
    const avgLoss = losingTrades.length > 0
      ? Math.abs(losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) / losingTrades.length)
      : 0;
    
    const winProb = winRate / 100;
    const lossProb = 1 - winProb;
    const expectancy = (winProb * avgWin) - (lossProb * avgLoss);

    // Get risk state
    const todayRiskState = await db.dailyRiskState.findUnique({
      where: { date: today }
    });

    // Get recent setups
    const recentSetups = await db.tradeSetup.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' }
    });

    // Get learning stats
    const learningRecords = await db.learningRecord.findMany();
    const setupStats = new Map<string, { wins: number; total: number }>();
    
    for (const record of learningRecords) {
      const stats = setupStats.get(record.setupType) || { wins: 0, total: 0 };
      stats.total++;
      if (record.result === 'WIN') {
        stats.wins++;
      }
      setupStats.set(record.setupType, stats);
    }

    const bestSetup = Array.from(setupStats.entries())
      .map(([type, stats]) => ({
        type,
        winRate: stats.total > 0 ? (stats.wins / stats.total) * 100 : 0,
        trades: stats.total
      }))
      .filter(s => s.trades >= 3)
      .sort((a, b) => b.winRate - a.winRate)[0];

    return NextResponse.json({
      success: true,
      data: {
        totalTrades: trades.length,
        closedTrades: closedTrades.length,
        winningTrades: winningTrades.length,
        losingTrades: losingTrades.length,
        winRate: Math.round(winRate * 10) / 10,
        totalPnL: Math.round(totalPnL * 100) / 100,
        todayPnL: Math.round(todayPnL * 100) / 100,
        todayTrades: todayTrades.length,
        openPositions: openTrades.length,
        maxDrawdown: Math.round(maxDrawdown * 100) / 100,
        expectancy: Math.round(expectancy * 100) / 100,
        avgWin: Math.round(avgWin * 100) / 100,
        avgLoss: Math.round(avgLoss * 100) / 100,
        riskState: todayRiskState,
        recentSetups,
        bestSetup: bestSetup || null,
        openTrades: openTrades.map(t => ({
          id: t.id,
          symbol: t.symbol.symbol,
          direction: t.direction,
          entryPrice: t.entryPrice,
          quantity: t.quantity,
          stopLoss: t.stopLoss,
          pnl: t.pnl
        }))
      }
    });
  } catch (error) {
    console.error('Dashboard Stats Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch dashboard stats'
    }, { status: 500 });
  }
}
