/**
 * Trade Tracking and Learning System
 * Monitors signals for 5-day holding period
 * Learns from successes and losses
 */

import { db } from '@/lib/db';
import type { TradeSignal, SignalTracking, DailyCandle } from '@prisma/client';

// ============================================
// TYPES
// ============================================

export interface TradeResult {
  signalId: string;
  symbol: string;
  result: 'SUCCESS' | 'LOSS' | 'BREAKEVEN';
  pnlPercent: number;
  maxProfit: number;
  maxLoss: number;
  daysHeld: number;
  exitReason: string;
}

export interface LearningInsight {
  category: string;
  insight: string;
  suggestion: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
}

// ============================================
// NSE TRADING CALENDAR
// ============================================

const NSE_HOLIDAYS_2024 = [
  '2024-01-26', // Republic Day
  '2024-03-08', // Mahashivratri
  '2024-03-25', // Holi
  '2024-03-29', // Good Friday
  '2024-04-11', // Id-Ul-Fitr
  '2024-04-14', // Dr. Baba Saheb Ambedkar Jayanti
  '2024-05-01', // Maharashtra Day
  '2024-06-17', // Bakri Id
  '2024-07-17', // Moharram
  '2024-08-15', // Independence Day
  '2024-10-02', // Gandhi Jayanti
  '2024-11-01', // Diwali
  '2024-11-15', // Guru Nanak Jayanti
  '2024-12-25', // Christmas
];

const NSE_HOLIDAYS_2025 = [
  '2025-01-26', // Republic Day
  '2025-02-26', // Mahashivratri
  '2025-03-14', // Holi
  '2025-03-31', // Id-Ul-Fitr
  '2025-04-10', // Dr. Baba Saheb Ambedkar Jayanti
  '2025-04-14', // Ambedkar Jayanti
  '2025-05-01', // Maharashtra Day
  '2025-08-15', // Independence Day
  '2025-10-02', // Gandhi Jayanti
  '2025-10-20', // Diwali
  '2025-11-05', // Guru Nanak Jayanti
  '2025-12-25', // Christmas
];

function isTradingDay(date: Date): boolean {
  const day = date.getDay();
  if (day === 0 || day === 6) return false; // Weekend
  
  const dateStr = date.toISOString().split('T')[0];
  if (NSE_HOLIDAYS_2024.includes(dateStr) || NSE_HOLIDAYS_2025.includes(dateStr)) {
    return false;
  }
  
  return true;
}

function getNextTradingDay(date: Date): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  while (!isTradingDay(next)) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function getTradingDaysBetween(start: Date, end: Date): number {
  let count = 0;
  const current = new Date(start);
  while (current <= end) {
    if (isTradingDay(current)) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

// ============================================
// SIGNAL TRACKING
// ============================================

export async function activateSignal(signalId: string): Promise<boolean> {
  try {
    const signal = await db.tradeSignal.update({
      where: { id: signalId },
      data: {
        status: 'ACTIVE',
        activatedAt: new Date(),
      },
    });
    
    return !!signal;
  } catch (error) {
    console.error('Error activating signal:', error);
    return false;
  }
}

export async function updateSignalTracking(
  signalId: string,
  dayNumber: 1 | 2 | 3 | 4 | 5,
  high: number,
  low: number,
  close: number
): Promise<void> {
  const tracking = await db.signalTracking.findUnique({
    where: { signalId },
  });
  
  if (!tracking) return;
  
  const date = new Date();
  const updateData: Partial<SignalTracking> = {};
  
  switch (dayNumber) {
    case 1:
      updateData.day1Date = date;
      updateData.day1High = high;
      updateData.day1Low = low;
      updateData.day1Close = close;
      break;
    case 2:
      updateData.day2Date = date;
      updateData.day2High = high;
      updateData.day2Low = low;
      updateData.day2Close = close;
      break;
    case 3:
      updateData.day3Date = date;
      updateData.day3High = high;
      updateData.day3Low = low;
      updateData.day3Close = close;
      break;
    case 4:
      updateData.day4Date = date;
      updateData.day4High = high;
      updateData.day4Low = low;
      updateData.day4Close = close;
      break;
    case 5:
      updateData.day5Date = date;
      updateData.day5High = high;
      updateData.day5Low = low;
      updateData.day5Close = close;
      break;
  }
  
  // Calculate max profit and loss
  const signal = await db.tradeSignal.findUnique({
    where: { id: signalId },
  });
  
  if (signal) {
    const entryPrice = signal.entryPrice;
    
    if (signal.signalType === 'BUY') {
      const maxProfitPercent = Math.max(
        tracking.maxProfit || 0,
        ((high - entryPrice) / entryPrice) * 100
      );
      const maxLossPercent = Math.min(
        tracking.maxLoss || 0,
        ((low - entryPrice) / entryPrice) * 100
      );
      updateData.maxProfit = maxProfitPercent;
      updateData.maxLoss = maxLossPercent;
    } else {
      const maxProfitPercent = Math.max(
        tracking.maxProfit || 0,
        ((entryPrice - low) / entryPrice) * 100
      );
      const maxLossPercent = Math.min(
        tracking.maxLoss || 0,
        ((entryPrice - high) / entryPrice) * 100
      );
      updateData.maxProfit = maxProfitPercent;
      updateData.maxLoss = maxLossPercent;
    }
  }
  
  await db.signalTracking.update({
    where: { signalId },
    data: updateData,
  });
}

export async function finalizeSignalResult(signalId: string): Promise<TradeResult | null> {
  const signal = await db.tradeSignal.findUnique({
    where: { id: signalId },
    include: {
      tracking: true,
      stock: true,
    },
  });
  
  if (!signal || !signal.tracking) return null;
  
  const tracking = signal.tracking;
  const entryPrice = signal.entryPrice;
  const stopLoss = signal.stopLoss;
  const targetPrice = signal.targetPrice;
  
  let result: 'SUCCESS' | 'LOSS' | 'BREAKEVEN' = 'BREAKEVEN';
  let pnlPercent = 0;
  let exitReason = 'TIME_EXPIRED';
  
  // Check each day for stop loss or target hit
  const days = [tracking.day1Close, tracking.day2Close, tracking.day3Close, tracking.day4Close, tracking.day5Close];
  const highs = [tracking.day1High, tracking.day2High, tracking.day3High, tracking.day4High, tracking.day5High];
  const lows = [tracking.day1Low, tracking.day2Low, tracking.day3Low, tracking.day4Low, tracking.day5Low];
  
  for (let i = 0; i < 5; i++) {
    if (days[i] === null) break;
    
    const dayHigh = highs[i]!;
    const dayLow = lows[i]!;
    const dayClose = days[i]!;
    
    if (signal.signalType === 'BUY') {
      // Check stop loss hit
      if (dayLow <= stopLoss) {
        result = 'LOSS';
        pnlPercent = ((stopLoss - entryPrice) / entryPrice) * 100;
        exitReason = 'STOP_LOSS_HIT';
        break;
      }
      // Check target hit
      if (dayHigh >= targetPrice) {
        result = 'SUCCESS';
        pnlPercent = ((targetPrice - entryPrice) / entryPrice) * 100;
        exitReason = 'TARGET_HIT';
        break;
      }
      // Use final close if time expired
      if (i === 4) {
        pnlPercent = ((dayClose - entryPrice) / entryPrice) * 100;
        result = pnlPercent > 1 ? 'SUCCESS' : pnlPercent < -1 ? 'LOSS' : 'BREAKEVEN';
      }
    } else {
      // SELL signal
      if (dayHigh >= stopLoss) {
        result = 'LOSS';
        pnlPercent = ((entryPrice - stopLoss) / entryPrice) * 100;
        exitReason = 'STOP_LOSS_HIT';
        break;
      }
      if (dayLow <= targetPrice) {
        result = 'SUCCESS';
        pnlPercent = ((entryPrice - targetPrice) / entryPrice) * 100;
        exitReason = 'TARGET_HIT';
        break;
      }
      if (i === 4) {
        pnlPercent = ((entryPrice - dayClose) / entryPrice) * 100;
        result = pnlPercent > 1 ? 'SUCCESS' : pnlPercent < -1 ? 'LOSS' : 'BREAKEVEN';
      }
    }
  }
  
  // Update signal and tracking
  await db.tradeSignal.update({
    where: { id: signalId },
    data: {
      status: result === 'SUCCESS' ? 'SUCCESS' : result === 'LOSS' ? 'LOSS' : 'CANCELLED',
      closedAt: new Date(),
    },
  });
  
  await db.signalTracking.update({
    where: { signalId },
    data: {
      finalResult: result,
      finalPnlPercent: pnlPercent,
    },
  });
  
  // Create learning record
  await createLearningRecord(signal, result, pnlPercent, tracking);
  
  return {
    signalId,
    symbol: signal.stock.symbol,
    result,
    pnlPercent,
    maxProfit: tracking.maxProfit || 0,
    maxLoss: tracking.maxLoss || 0,
    daysHeld: 5,
    exitReason,
  };
}

// ============================================
// LEARNING SYSTEM
// ============================================

async function createLearningRecord(
  signal: TradeSignal & { stock: { symbol: string; sector: string | null } },
  result: 'SUCCESS' | 'LOSS' | 'BREAKEVEN',
  pnlPercent: number,
  tracking: SignalTracking
): Promise<void> {
  // Determine setup type
  const indicators = signal.indicators ? JSON.parse(signal.indicators as string) : {};
  const reasoning = signal.reasoning ? JSON.parse(signal.reasoning as string) : [];
  
  let setupType = 'PULLBACK';
  if (reasoning.includes('breakout') || reasoning.includes('Breakout')) {
    setupType = 'BREAKOUT';
  } else if (reasoning.includes('reversal') || reasoning.includes('Reversal')) {
    setupType = 'REVERSAL';
  } else if (reasoning.includes('trend') || reasoning.includes('Trend')) {
    setupType = 'TREND_FOLLOW';
  }
  
  await db.learningRecord.create({
    data: {
      signalId: signal.id,
      setupType,
      trendDirection: signal.trendDirection,
      regime: signal.regime,
      volumeProfile: indicators.volume?.ratio > 1.5 ? 'HIGH' : indicators.volume?.ratio < 0.8 ? 'LOW' : 'NORMAL',
      sector: signal.stock.sector,
      dayOfWeek: new Date(signal.generatedAt).getDay(),
      month: new Date(signal.generatedAt).getMonth() + 1,
      result,
      pnlPercent,
      maxDrawdown: tracking.maxLoss,
      maxProfit: tracking.maxProfit,
      whatWorked: result === 'SUCCESS' ? reasoning.join(', ') : null,
      whatFailed: result === 'LOSS' ? generateFailureReason(signal, tracking) : null,
      improvement: result === 'LOSS' ? generateImprovement(signal, tracking) : null,
    },
  });
  
  // Update strategy performance
  await updateStrategyPerformance(setupType, result, pnlPercent, tracking);
  
  // Update stock performance
  await updateStockPerformance(signal.stockId, result, pnlPercent);
}

function generateFailureReason(signal: TradeSignal, tracking: SignalTracking): string {
  const reasons: string[] = [];
  
  if (signal.trendDirection === 'BULLISH' && signal.signalType === 'SELL') {
    reasons.push('Counter-trend trade failed');
  }
  
  if (tracking.maxLoss && tracking.maxLoss < -3) {
    reasons.push('Large adverse move before stop loss');
  }
  
  if (signal.confidence < 85) {
    reasons.push('Low confidence signal');
  }
  
  return reasons.join('; ') || 'Market moved against position';
}

function generateImprovement(signal: TradeSignal, tracking: SignalTracking): string {
  const improvements: string[] = [];
  
  if (signal.regime === 'RANGING' && signal.trendDirection !== 'SIDEWAYS') {
    improvements.push('Avoid trend-following in ranging markets');
  }
  
  if (tracking.maxProfit && tracking.maxProfit > 2 && tracking.maxLoss && tracking.maxLoss < -2) {
    improvements.push('Consider trailing stop to lock in profits');
  }
  
  if (signal.confidence < 85) {
    improvements.push('Wait for higher confidence signals (85%+)');
  }
  
  return improvements.join('; ') || 'Review setup conditions';
}

async function updateStrategyPerformance(
  setupType: string,
  result: 'SUCCESS' | 'LOSS' | 'BREAKEVEN',
  pnlPercent: number,
  tracking: SignalTracking
): Promise<void> {
  const existing = await db.strategyPerformance.findUnique({
    where: { strategyName: setupType },
  });
  
  if (existing) {
    const totalSignals = existing.totalSignals + 1;
    const successCount = existing.successCount + (result === 'SUCCESS' ? 1 : 0);
    const lossCount = existing.lossCount + (result === 'LOSS' ? 1 : 0);
    
    await db.strategyPerformance.update({
      where: { strategyName: setupType },
      data: {
        totalSignals,
        successCount,
        lossCount,
        successRate: (successCount / totalSignals) * 100,
        avgProfit: result === 'SUCCESS' 
          ? (existing.avgProfit * existing.successCount + pnlPercent) / successCount 
          : existing.avgProfit,
        avgLoss: result === 'LOSS'
          ? (existing.avgLoss * existing.lossCount + pnlPercent) / lossCount
          : existing.avgLoss,
        maxProfit: Math.max(existing.maxProfit, tracking.maxProfit || 0),
        maxLoss: Math.min(existing.maxLoss, tracking.maxLoss || 0),
        lastLearnedAt: new Date(),
      },
    });
  } else {
    await db.strategyPerformance.create({
      data: {
        strategyName: setupType,
        totalSignals: 1,
        successCount: result === 'SUCCESS' ? 1 : 0,
        lossCount: result === 'LOSS' ? 1 : 0,
        successRate: result === 'SUCCESS' ? 100 : 0,
        avgProfit: result === 'SUCCESS' ? pnlPercent : 0,
        avgLoss: result === 'LOSS' ? pnlPercent : 0,
        maxProfit: tracking.maxProfit || 0,
        maxLoss: tracking.maxLoss || 0,
        lastLearnedAt: new Date(),
      },
    });
  }
}

async function updateStockPerformance(
  stockId: string,
  result: 'SUCCESS' | 'LOSS' | 'BREAKEVEN',
  pnlPercent: number
): Promise<void> {
  const existing = await db.stockPerformance.findUnique({
    where: { stockId },
  });
  
  if (existing) {
    const totalSignals = existing.totalSignals + 1;
    const successCount = existing.successCount + (result === 'SUCCESS' ? 1 : 0);
    const lossCount = existing.lossCount + (result === 'LOSS' ? 1 : 0);
    
    await db.stockPerformance.update({
      where: { stockId },
      data: {
        totalSignals,
        successCount,
        lossCount,
        successRate: (successCount / totalSignals) * 100,
        totalPnl: existing.totalPnl + pnlPercent,
        avgPnl: (existing.avgPnl * existing.totalSignals + pnlPercent) / totalSignals,
        lastSignalAt: new Date(),
        lastSuccessAt: result === 'SUCCESS' ? new Date() : existing.lastSuccessAt,
      },
    });
  } else {
    await db.stockPerformance.create({
      data: {
        stockId,
        totalSignals: 1,
        successCount: result === 'SUCCESS' ? 1 : 0,
        lossCount: result === 'LOSS' ? 1 : 0,
        successRate: result === 'SUCCESS' ? 100 : 0,
        totalPnl: pnlPercent,
        avgPnl: pnlPercent,
        lastSignalAt: new Date(),
        lastSuccessAt: result === 'SUCCESS' ? new Date() : null,
      },
    });
  }
  
  // Update watchlist if stock qualifies (80%+ success rate)
  await updateWatchlist(stockId);
}

async function updateWatchlist(stockId: string): Promise<void> {
  const performance = await db.stockPerformance.findUnique({
    where: { stockId },
  });
  
  if (!performance) return;
  
  // Check if stock qualifies for high accuracy watchlist
  if (performance.totalSignals >= 5 && performance.successRate >= 80) {
    // Find or create default watchlist
    let watchlist = await db.watchlist.findFirst({
      where: { isDefault: true },
    });
    
    if (!watchlist) {
      watchlist = await db.watchlist.create({
        data: {
          name: 'High Accuracy Stocks',
          description: 'Stocks with 80%+ success rate',
          isDefault: true,
        },
      });
    }
    
    // Add or update watchlist item
    await db.watchlistItem.upsert({
      where: { stockId },
      update: {
        successRate: performance.successRate,
        totalSignals: performance.totalSignals,
        avgPnl: performance.avgPnl,
        lastUpdated: new Date(),
      },
      create: {
        watchlistId: watchlist.id,
        stockId,
        successRate: performance.successRate,
        totalSignals: performance.totalSignals,
        avgPnl: performance.avgPnl,
      },
    });
  }
}

// ============================================
// GET LEARNING INSIGHTS
// ============================================

export async function getLearningInsights(): Promise<LearningInsight[]> {
  const insights: LearningInsight[] = [];
  
  // Analyze strategy performance
  const strategies = await db.strategyPerformance.findMany({
    where: { totalSignals: { gte: 5 } },
  });
  
  for (const strategy of strategies) {
    if (strategy.successRate < 50) {
      insights.push({
        category: 'STRATEGY',
        insight: `${strategy.strategyName} has low success rate (${strategy.successRate.toFixed(1)}%)`,
        suggestion: `Consider avoiding ${strategy.strategyName} setups or refine entry criteria`,
        impact: 'HIGH',
      });
    } else if (strategy.successRate >= 70) {
      insights.push({
        category: 'STRATEGY',
        insight: `${strategy.strategyName} performs well (${strategy.successRate.toFixed(1)}% success)`,
        suggestion: `Prioritize ${strategy.strategyName} setups when available`,
        impact: 'HIGH',
      });
    }
  }
  
  // Analyze regime-based performance
  const regimePerformance = await db.learningRecord.groupBy({
    by: ['regime', 'result'],
    _count: true,
    where: { regime: { not: null } },
  });
  
  const regimeStats: Record<string, { total: number; success: number }> = {};
  for (const item of regimePerformance) {
    const regime = item.regime || 'UNKNOWN';
    if (!regimeStats[regime]) {
      regimeStats[regime] = { total: 0, success: 0 };
    }
    regimeStats[regime].total += item._count;
    if (item.result === 'SUCCESS') {
      regimeStats[regime].success += item._count;
    }
  }
  
  for (const [regime, stats] of Object.entries(regimeStats)) {
    const successRate = (stats.success / stats.total) * 100;
    if (successRate < 50) {
      insights.push({
        category: 'REGIME',
        insight: `${regime} market conditions have ${successRate.toFixed(1)}% success rate`,
        suggestion: `Be more selective in ${regime} markets or wait for better conditions`,
        impact: 'MEDIUM',
      });
    }
  }
  
  return insights;
}

// Get performance stats
export async function getPerformanceStats() {
  const [
    totalSignals,
    successSignals,
    lossSignals,
    avgPnl,
    strategies,
    recentRecords,
  ] = await Promise.all([
    db.tradeSignal.count(),
    db.tradeSignal.count({ where: { status: 'SUCCESS' } }),
    db.tradeSignal.count({ where: { status: 'LOSS' } }),
    db.signalTracking.aggregate({
      _avg: { finalPnlPercent: true },
    }),
    db.strategyPerformance.findMany(),
    db.learningRecord.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: { signal: { include: { stock: true } } },
    }),
  ]);
  
  return {
    totalSignals,
    successSignals,
    lossSignals,
    winRate: totalSignals > 0 ? (successSignals / totalSignals) * 100 : 0,
    avgPnl: avgPnl._avg.finalPnlPercent || 0,
    strategies,
    recentRecords,
  };
}
