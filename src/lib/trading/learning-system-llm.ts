/**
 * LLM-Enhanced Learning System
 * Uses LLM to learn from trades and improve strategies
 */

import { db } from '@/lib/db';
import type { TradeSignal, SignalTracking, DailyCandle } from '@prisma/client';
import { getTradingBrain, type LLMLearningInput, type LLMLearningOutput } from './llm-brain';

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
  '2024-01-26', '2024-03-08', '2024-03-25', '2024-03-29', '2024-04-11',
  '2024-04-14', '2024-05-01', '2024-06-17', '2024-07-17', '2024-08-15',
  '2024-10-02', '2024-11-01', '2024-11-15', '2024-12-25',
];

const NSE_HOLIDAYS_2025 = [
  '2025-01-26', '2025-02-26', '2025-03-14', '2025-03-31', '2025-04-10',
  '2025-04-14', '2025-05-01', '2025-08-15', '2025-10-02', '2025-10-20',
  '2025-11-05', '2025-12-25',
];

function isTradingDay(date: Date): boolean {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;
  const dateStr = date.toISOString().split('T')[0];
  return !NSE_HOLIDAYS_2024.includes(dateStr) && !NSE_HOLIDAYS_2025.includes(dateStr);
}

// ============================================
// SIGNAL TRACKING
// ============================================

export async function activateSignal(signalId: string): Promise<boolean> {
  try {
    await db.tradeSignal.update({
      where: { id: signalId },
      data: { status: 'ACTIVE', activatedAt: new Date() },
    });
    return true;
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
  const tracking = await db.signalTracking.findUnique({ where: { signalId } });
  if (!tracking) return;
  
  const date = new Date();
  const updateData: Record<string, Date | number> = {};
  
  updateData[`day${dayNumber}Date`] = date;
  updateData[`day${dayNumber}High`] = high;
  updateData[`day${dayNumber}Low`] = low;
  updateData[`day${dayNumber}Close`] = close;
  
  const signal = await db.tradeSignal.findUnique({ where: { id: signalId } });
  if (signal) {
    const entryPrice = signal.entryPrice;
    if (signal.signalType === 'BUY') {
      updateData.maxProfit = Math.max(tracking.maxProfit || 0, ((high - entryPrice) / entryPrice) * 100);
      updateData.maxLoss = Math.min(tracking.maxLoss || 0, ((low - entryPrice) / entryPrice) * 100);
    } else {
      updateData.maxProfit = Math.max(tracking.maxProfit || 0, ((entryPrice - low) / entryPrice) * 100);
      updateData.maxLoss = Math.min(tracking.maxLoss || 0, ((entryPrice - high) / entryPrice) * 100);
    }
  }
  
  await db.signalTracking.update({ where: { signalId }, data: updateData });
}

// ============================================
// LLM-ENHANCED FINALIZATION
// ============================================

export async function finalizeSignalResult(signalId: string): Promise<TradeResult | null> {
  const signal = await db.tradeSignal.findUnique({
    where: { id: signalId },
    include: { tracking: true, stock: true },
  });
  
  if (!signal || !signal.tracking) return null;
  
  const tracking = signal.tracking;
  const entryPrice = signal.entryPrice;
  const stopLoss = signal.stopLoss;
  const targetPrice = signal.targetPrice;
  
  let result: 'SUCCESS' | 'LOSS' | 'BREAKEVEN' = 'BREAKEVEN';
  let pnlPercent = 0;
  let exitReason = 'TIME_EXPIRED';
  
  const days = [tracking.day1Close, tracking.day2Close, tracking.day3Close, tracking.day4Close, tracking.day5Close];
  const highs = [tracking.day1High, tracking.day2High, tracking.day3High, tracking.day4High, tracking.day5High];
  const lows = [tracking.day1Low, tracking.day2Low, tracking.day3Low, tracking.day4Low, tracking.day5Low];
  
  for (let i = 0; i < 5; i++) {
    if (days[i] === null) break;
    const dayHigh = highs[i]!;
    const dayLow = lows[i]!;
    const dayClose = days[i]!;
    
    if (signal.signalType === 'BUY') {
      if (dayLow <= stopLoss) {
        result = 'LOSS';
        pnlPercent = ((stopLoss - entryPrice) / entryPrice) * 100;
        exitReason = 'STOP_LOSS_HIT';
        break;
      }
      if (dayHigh >= targetPrice) {
        result = 'SUCCESS';
        pnlPercent = ((targetPrice - entryPrice) / entryPrice) * 100;
        exitReason = 'TARGET_HIT';
        break;
      }
      if (i === 4) {
        pnlPercent = ((dayClose - entryPrice) / entryPrice) * 100;
        result = pnlPercent > 1 ? 'SUCCESS' : pnlPercent < -1 ? 'LOSS' : 'BREAKEVEN';
      }
    } else {
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
    data: { status: result === 'SUCCESS' ? 'SUCCESS' : result === 'LOSS' ? 'LOSS' : 'CANCELLED', closedAt: new Date() },
  });
  
  await db.signalTracking.update({
    where: { signalId },
    data: { finalResult: result, finalPnlPercent: pnlPercent },
  });
  
  // Create learning record with LLM
  await createLLMLearningRecord(signal, result, pnlPercent, tracking);
  
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
// LLM LEARNING
// ============================================

async function createLLMLearningRecord(
  signal: TradeSignal & { stock: { symbol: string; sector: string | null } },
  result: 'SUCCESS' | 'LOSS' | 'BREAKEVEN',
  pnlPercent: number,
  tracking: SignalTracking
): Promise<void> {
  const reasoning = signal.reasoning ? JSON.parse(signal.reasoning as string) : {};
  const indicators = signal.indicators ? JSON.parse(signal.indicators as string) : {};
  
  let setupType = 'SWING';
  if (reasoning.factors) {
    const factors = reasoning.factors.join(' ').toLowerCase();
    if (factors.includes('breakout')) setupType = 'BREAKOUT';
    else if (factors.includes('pullback')) setupType = 'PULLBACK';
    else if (factors.includes('reversal')) setupType = 'REVERSAL';
    else if (factors.includes('trend')) setupType = 'TREND_FOLLOW';
  }
  
  // Get LLM learning insights
  let llmLearning: LLMLearningOutput | null = null;
  
  try {
    const brain = await getTradingBrain();
    
    // Parse the LLM decision from signal
    const llmDecision = {
      decision: signal.signalType as 'BUY' | 'SELL',
      confidence: signal.confidence,
      entryPrice: signal.entryPrice,
      stopLoss: signal.stopLoss,
      targetPrice: signal.targetPrice,
      riskReward: signal.riskReward,
      holdingDays: 5,
      reasoning: reasoning.llmReasoning || reasoning.factors?.join(', ') || '',
      keyFactors: reasoning.keyFactors || reasoning.factors || [],
      riskFactors: reasoning.riskFactors || [],
      marketOutlook: reasoning.marketOutlook || '',
    };
    
    const learningInput: LLMLearningInput = {
      symbol: signal.stock.symbol,
      decision: llmDecision,
      result,
      pnlPercent,
      maxProfit: tracking.maxProfit || 0,
      maxLoss: tracking.maxLoss || 0,
      daysHeld: 5,
      marketConditionAtEntry: {
        trend: signal.trendDirection as 'BULLISH' | 'BEARISH' | 'SIDEWAYS' || 'SIDEWAYS',
        trendStrength: 50,
        regime: signal.regime as 'TRENDING' | 'RANGING' | 'VOLATILE' || 'RANGING',
        support: [],
        resistance: [],
      },
      marketConditionAtExit: {
        trend: 'SIDEWAYS', // Would need to fetch actual exit conditions
        trendStrength: 50,
        regime: 'RANGING',
        support: [],
        resistance: [],
      },
    };
    
    llmLearning = await brain.learnFromTrade(learningInput);
  } catch (error) {
    console.error('LLM learning failed:', error);
  }
  
  // Create learning record
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
      whatWorked: result === 'SUCCESS' ? llmLearning?.whatWentRight : null,
      whatFailed: result === 'LOSS' ? llmLearning?.whatWentWrong : null,
      improvement: llmLearning?.improvementSuggestions?.join('; ') || null,
    },
  });
  
  // Update strategy and stock performance
  await updateStrategyPerformance(setupType, result, pnlPercent, tracking);
  await updateStockPerformance(signal.stockId, result, pnlPercent);
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
        avgProfit: result === 'SUCCESS' ? (existing.avgProfit * existing.successCount + pnlPercent) / successCount : existing.avgProfit,
        avgLoss: result === 'LOSS' ? (existing.avgLoss * existing.lossCount + pnlPercent) / lossCount : existing.avgLoss,
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
  const existing = await db.stockPerformance.findUnique({ where: { stockId } });
  
  if (existing) {
    const totalSignals = existing.totalSignals + 1;
    const successCount = existing.successCount + (result === 'SUCCESS' ? 1 : 0);
    
    await db.stockPerformance.update({
      where: { stockId },
      data: {
        totalSignals,
        successCount,
        lossCount: existing.lossCount + (result === 'LOSS' ? 1 : 0),
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
  
  await updateWatchlist(stockId);
}

async function updateWatchlist(stockId: string): Promise<void> {
  const performance = await db.stockPerformance.findUnique({ where: { stockId } });
  if (!performance) return;
  
  if (performance.totalSignals >= 5 && performance.successRate >= 80) {
    let watchlist = await db.watchlist.findFirst({ where: { isDefault: true } });
    
    if (!watchlist) {
      watchlist = await db.watchlist.create({
        data: { name: 'High Accuracy Stocks', description: 'Stocks with 80%+ success rate', isDefault: true },
      });
    }
    
    await db.watchlistItem.upsert({
      where: { stockId },
      update: { successRate: performance.successRate, totalSignals: performance.totalSignals, avgPnl: performance.avgPnl, lastUpdated: new Date() },
      create: { watchlistId: watchlist.id, stockId, successRate: performance.successRate, totalSignals: performance.totalSignals, avgPnl: performance.avgPnl },
    });
  }
}

// ============================================
// GET LEARNING INSIGHTS
// ============================================

export async function getLearningInsights(): Promise<LearningInsight[]> {
  const insights: LearningInsight[] = [];
  
  const strategies = await db.strategyPerformance.findMany({ where: { totalSignals: { gte: 5 } } });
  
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
  
  return insights;
}

export async function getPerformanceStats() {
  const [totalSignals, successSignals, lossSignals, avgPnl, strategies, recentRecords] = await Promise.all([
    db.tradeSignal.count(),
    db.tradeSignal.count({ where: { status: 'SUCCESS' } }),
    db.tradeSignal.count({ where: { status: 'LOSS' } }),
    db.signalTracking.aggregate({ _avg: { finalPnlPercent: true } }),
    db.strategyPerformance.findMany(),
    db.learningRecord.findMany({ take: 50, orderBy: { createdAt: 'desc' }, include: { signal: { include: { stock: true } } } }),
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
