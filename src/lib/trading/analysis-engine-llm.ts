/**
 * LLM-Enhanced Analysis Engine
 * Combines technical analysis with LLM-based decision making
 * Uses local LLaMA as the "brain" for trading decisions
 */

import { db } from '@/lib/db';
import type { DailyCandle } from '@prisma/client';
import { getTradingBrain, type LLMAnalysisInput, type LLMDecision } from './llm-brain';

// Re-export types from llm-brain
export type { LLMDecision, LLMAnalysisInput };

// ============================================
// TYPES
// ============================================

export interface AnalysisResult {
  symbol: string;
  timeframe: string;
  trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
  trendStrength: number;
  regime: 'TRENDING' | 'RANGING' | 'VOLATILE';
  confidence: number;
  
  // Technical indicators
  indicators: {
    ema20: number;
    ema50: number;
    ema200: number;
    rsi: number;
    atr: number;
    adx: number;
    macd: { value: number; signal: number; histogram: number };
    volume: { current: number; avg: number; ratio: number };
  };
  
  // Support/Resistance
  levels: {
    support: number[];
    resistance: number[];
    pivot: number;
  };
  
  // LLM Decision
  llmDecision: LLMDecision | null;
  
  // Trade setup (from LLM)
  setup: TradeSetup | null;
}

export interface TradeSetup {
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  riskReward: number;
  confluenceScore: number;
  confidence: number;
  reasons: string[];
  riskPercent: number;
  positionSize: number;
  llmReasoning: string;
}

export interface SignalCandidate {
  symbol: string;
  setup: TradeSetup;
  analysis: AnalysisResult;
}

// ============================================
// TECHNICAL INDICATORS (Same as before)
// ============================================

function calculateEMA(prices: number[], period: number): number[] {
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);
  
  let sum = 0;
  for (let i = 0; i < period && i < prices.length; i++) {
    sum += prices[i];
    ema.push(sum / (i + 1));
  }
  
  for (let i = period; i < prices.length; i++) {
    ema.push((prices[i] - ema[i - 1]) * multiplier + ema[i - 1]);
  }
  
  return ema;
}

function calculateRSI(prices: number[], period: number = 14): number[] {
  const rsi: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];
  
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = 0; i < period; i++) {
    rsi.push(50);
  }
  
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(100 - (100 / (1 + rs)));
  }
  
  return rsi;
}

function calculateATR(candles: { high: number; low: number; close: number }[], period: number = 14): number[] {
  const atr: number[] = [];
  const tr: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      tr.push(candles[i].high - candles[i].low);
    } else {
      const hl = candles[i].high - candles[i].low;
      const hc = Math.abs(candles[i].high - candles[i - 1].close);
      const lc = Math.abs(candles[i].low - candles[i - 1].close);
      tr.push(Math.max(hl, hc, lc));
    }
  }
  
  let sum = 0;
  for (let i = 0; i < period && i < tr.length; i++) {
    sum += tr[i];
    atr.push(sum / (i + 1));
  }
  
  for (let i = period; i < tr.length; i++) {
    atr.push((atr[i - 1] * (period - 1) + tr[i]) / period);
  }
  
  return atr;
}

function calculateADX(candles: { high: number; low: number; close: number }[], period: number = 14): number[] {
  const adx: number[] = [];
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const tr: number[] = [0];
  
  for (let i = 1; i < candles.length; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    
    const hl = candles[i].high - candles[i].low;
    const hc = Math.abs(candles[i].high - candles[i - 1].close);
    const lc = Math.abs(candles[i].low - candles[i - 1].close);
    tr.push(Math.max(hl, hc, lc));
  }
  
  const smoothPlusDM = smoothArray(plusDM, period);
  const smoothMinusDM = smoothArray(minusDM, period);
  const smoothTR = smoothArray(tr, period);
  
  for (let i = 0; i < smoothTR.length; i++) {
    const plusDI = smoothTR[i] > 0 ? (smoothPlusDM[i] / smoothTR[i]) * 100 : 0;
    const minusDI = smoothTR[i] > 0 ? (smoothMinusDM[i] / smoothTR[i]) * 100 : 0;
    const dx = plusDI + minusDI > 0 ? (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100 : 0;
    adx.push(dx);
  }
  
  return smoothArray(adx, period);
}

function smoothArray(arr: number[], period: number): number[] {
  const smoothed: number[] = [];
  let sum = 0;
  
  for (let i = 0; i < arr.length; i++) {
    if (i < period) {
      sum += arr[i];
      smoothed.push(sum / (i + 1));
    } else {
      sum = smoothed[i - 1] * (period - 1) + arr[i];
      smoothed.push(sum / period);
    }
  }
  
  return smoothed;
}

function calculateMACD(prices: number[]): { value: number; signal: number; histogram: number }[] {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  
  const macdLine: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i >= 25) {
      macdLine.push(ema12[i] - ema26[i]);
    } else {
      macdLine.push(0);
    }
  }
  
  const signalLine = calculateEMA(macdLine, 9);
  
  const result: { value: number; signal: number; histogram: number }[] = [];
  for (let i = 0; i < macdLine.length; i++) {
    result.push({
      value: macdLine[i],
      signal: signalLine[i],
      histogram: macdLine[i] - signalLine[i],
    });
  }
  
  return result;
}

function findSupportResistance(candles: DailyCandle[]): { support: number[]; resistance: number[]; pivot: number } {
  const support: number[] = [];
  const resistance: number[] = [];
  
  for (let i = 5; i < candles.length - 5; i++) {
    const window = candles.slice(i - 5, i + 6);
    const highs = window.map(c => c.high);
    const lows = window.map(c => c.low);
    
    const currentHigh = candles[i].high;
    const currentLow = candles[i].low;
    
    if (currentHigh === Math.max(...highs)) {
      resistance.push(currentHigh);
    }
    
    if (currentLow === Math.min(...lows)) {
      support.push(currentLow);
    }
  }
  
  const lastCandle = candles[candles.length - 1];
  const pivot = (lastCandle.high + lastCandle.low + lastCandle.close) / 3;
  
  return {
    support: support.slice(-5).reverse(),
    resistance: resistance.slice(-5).reverse(),
    pivot,
  };
}

function analyzeTrend(
  candles: DailyCandle[],
  ema20: number[],
  ema50: number[],
  ema200: number[],
  adx: number[]
): { trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS'; trendStrength: number; regime: 'TRENDING' | 'RANGING' | 'VOLATILE' } {
  if (candles.length < 200) {
    return { trend: 'SIDEWAYS', trendStrength: 50, regime: 'RANGING' };
  }
  
  const lastClose = candles[candles.length - 1].close;
  const lastEma20 = ema20[ema20.length - 1];
  const lastEma50 = ema50[ema50.length - 1];
  const lastEma200 = ema200[ema200.length - 1];
  const lastAdx = adx[adx.length - 1];
  
  let bullishScore = 0;
  let bearishScore = 0;
  
  if (lastEma20 > lastEma50 && lastEma50 > lastEma200) bullishScore += 3;
  if (lastEma20 < lastEma50 && lastEma50 < lastEma200) bearishScore += 3;
  
  if (lastClose > lastEma20) bullishScore++;
  if (lastClose > lastEma50) bullishScore++;
  if (lastClose > lastEma200) bullishScore++;
  if (lastClose < lastEma20) bearishScore++;
  if (lastClose < lastEma50) bearishScore++;
  if (lastClose < lastEma200) bearishScore++;
  
  const recentCandles = candles.slice(-10);
  const recentHighs = recentCandles.filter(c => c.close > c.open).length;
  if (recentHighs > 6) bullishScore += 2;
  if (recentHighs < 4) bearishScore += 2;
  
  let trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
  let trendStrength: number;
  
  if (bullishScore > bearishScore + 2) {
    trend = 'BULLISH';
    trendStrength = Math.min(100, (bullishScore / (bullishScore + bearishScore)) * 100);
  } else if (bearishScore > bullishScore + 2) {
    trend = 'BEARISH';
    trendStrength = Math.min(100, (bearishScore / (bullishScore + bearishScore)) * 100);
  } else {
    trend = 'SIDEWAYS';
    trendStrength = 50;
  }
  
  let regime: 'TRENDING' | 'RANGING' | 'VOLATILE';
  if (lastAdx > 25) {
    regime = 'TRENDING';
  } else if (lastAdx < 20) {
    regime = 'RANGING';
  } else {
    const atrValues = calculateATR(candles.slice(-20));
    const lastAtr = atrValues[atrValues.length - 1];
    const atrPercent = (lastAtr / lastClose) * 100;
    regime = atrPercent > 3 ? 'VOLATILE' : 'RANGING';
  }
  
  return { trend, trendStrength, regime };
}

// ============================================
// LLM-ENHANCED ANALYSIS
// ============================================

export async function analyzeStock(symbol: string): Promise<AnalysisResult | null> {
  const stock = await db.stock.findUnique({
    where: { symbol },
    include: {
      dailyCandles: {
        orderBy: { date: 'asc' },
        take: 500,
      },
      performance: true,
    },
  });
  
  if (!stock || stock.dailyCandles.length < 200) {
    return null;
  }
  
  const candles = stock.dailyCandles;
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  
  // Calculate technical indicators
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const ema200 = calculateEMA(closes, 200);
  const rsi = calculateRSI(closes);
  const atr = calculateATR(candles);
  const adx = calculateADX(candles);
  const macd = calculateMACD(closes);
  
  // Get last values
  const lastEma20 = ema20[ema20.length - 1];
  const lastEma50 = ema50[ema50.length - 1];
  const lastEma200 = ema200[ema200.length - 1];
  const lastRsi = rsi[rsi.length - 1];
  const lastAtr = atr[atr.length - 1];
  const lastAdx = adx[adx.length - 1];
  const lastMacd = macd[macd.length - 1];
  const lastCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];
  
  // Volume analysis
  const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const lastVolume = volumes[volumes.length - 1];
  
  // Trend analysis
  const { trend, trendStrength, regime } = analyzeTrend(candles, ema20, ema50, ema200, adx);
  
  // Support/Resistance
  const levels = findSupportResistance(candles);
  
  // Build indicators object
  const indicators: AnalysisResult['indicators'] = {
    ema20: lastEma20,
    ema50: lastEma50,
    ema200: lastEma200,
    rsi: lastRsi,
    atr: lastAtr,
    adx: lastAdx,
    macd: lastMacd,
    volume: {
      current: lastVolume,
      avg: avgVolume,
      ratio: lastVolume / avgVolume,
    },
  };
  
  // ============================================
  // LLM DECISION MAKING (The Brain)
  // ============================================
  
  let llmDecision: LLMDecision | null = null;
  let setup: TradeSetup | null = null;
  
  try {
    const brain = await getTradingBrain();
    
    // Prepare input for LLM
    const llmInput: LLMAnalysisInput = {
      symbol,
      marketData: {
        symbol,
        sector: stock.sector,
        currentPrice: lastCandle.close,
        priceChange: lastCandle.close - prevCandle.close,
        priceChangePercent: ((lastCandle.close - prevCandle.close) / prevCandle.close) * 100,
        volume: lastVolume,
        avgVolume,
        high52w: Math.max(...closes.slice(-252)),
        low52w: Math.min(...closes.slice(-252)),
      },
      indicators: {
        ema20: lastEma20,
        ema50: lastEma50,
        ema200: lastEma200,
        rsi: lastRsi,
        atr: lastAtr,
        adx: lastAdx,
        macd: lastMacd,
        volumeRatio: lastVolume / avgVolume,
      },
      context: {
        trend,
        trendStrength,
        regime,
        support: levels.support,
        resistance: levels.resistance,
      },
      historicalPerformance: stock.performance ? {
        totalSignals: stock.performance.totalSignals,
        successRate: stock.performance.successRate,
        avgPnl: stock.performance.avgPnl,
      } : undefined,
    };
    
    // Get LLM decision
    llmDecision = await brain.analyzeAndDecide(llmInput);
    
    // Convert LLM decision to trade setup if confidence >= 80%
    if (llmDecision.decision !== 'HOLD' && llmDecision.confidence >= 80) {
      setup = {
        direction: llmDecision.decision,
        entryPrice: llmDecision.entryPrice,
        stopLoss: llmDecision.stopLoss,
        targetPrice: llmDecision.targetPrice,
        riskReward: llmDecision.riskReward,
        confluenceScore: llmDecision.confidence,
        confidence: llmDecision.confidence,
        reasons: llmDecision.keyFactors,
        riskPercent: 2.0,
        positionSize: 100,
        llmReasoning: llmDecision.reasoning,
      };
    }
  } catch (error) {
    console.error(`LLM analysis failed for ${symbol}:`, error);
  }
  
  return {
    symbol,
    timeframe: 'DAILY',
    trend,
    trendStrength,
    regime,
    confidence: llmDecision?.confidence || 0,
    indicators,
    levels,
    llmDecision,
    setup,
  };
}

// Scan all stocks for signals using LLM
export async function scanForSignals(
  symbols?: string[],
  minConfidence: number = 80
): Promise<SignalCandidate[]> {
  const targetSymbols = symbols || (await db.stock.findMany({
    where: { isActive: true },
    select: { symbol: true },
  })).map(s => s.symbol);
  
  const signals: SignalCandidate[] = [];
  
  for (const symbol of targetSymbols) {
    try {
      const analysis = await analyzeStock(symbol);
      
      if (analysis && analysis.setup && analysis.setup.confidence >= minConfidence) {
        signals.push({
          symbol,
          setup: analysis.setup,
          analysis,
        });
      }
    } catch (error) {
      console.error(`Error analyzing ${symbol}:`, error);
    }
  }
  
  // Sort by confidence
  signals.sort((a, b) => b.setup.confidence - a.setup.confidence);
  
  return signals;
}

// Save signal to database
export async function saveSignal(
  symbol: string,
  setup: TradeSetup,
  analysis: AnalysisResult
): Promise<string | null> {
  const stock = await db.stock.findUnique({
    where: { symbol },
  });
  
  if (!stock) return null;
  
  const validTill = new Date();
  validTill.setDate(validTill.getDate() + 7);
  
  const signal = await db.tradeSignal.create({
    data: {
      stockId: stock.id,
      signalType: setup.direction,
      status: 'PENDING',
      confidence: setup.confidence,
      entryPrice: setup.entryPrice,
      stopLoss: setup.stopLoss,
      targetPrice: setup.targetPrice,
      riskReward: setup.riskReward,
      timeframe: 'DAILY',
      trendDirection: analysis.trend,
      regime: analysis.regime,
      confluenceScore: setup.confluenceScore,
      reasoning: JSON.stringify({
        factors: setup.reasons,
        llmReasoning: setup.llmReasoning,
        keyFactors: analysis.llmDecision?.keyFactors,
        riskFactors: analysis.llmDecision?.riskFactors,
        marketOutlook: analysis.llmDecision?.marketOutlook,
      }),
      indicators: JSON.stringify(analysis.indicators),
      validTill,
    },
  });
  
  await db.signalTracking.create({
    data: {
      signalId: signal.id,
    },
  });
  
  return signal.id;
}
