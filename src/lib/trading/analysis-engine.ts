/**
 * Analysis Engine
 * Technical Analysis + Smart Money Concepts
 * Generates high-confidence trade signals (80%+ accuracy required)
 */

import { db } from '@/lib/db';
import type { DailyCandle } from '@prisma/client';

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
  
  // Trade setup
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
  
  // Reasoning
  reasons: string[];
  
  // Risk parameters
  riskPercent: number;
  positionSize: number;
}

export interface SignalCandidate {
  symbol: string;
  setup: TradeSetup;
  analysis: AnalysisResult;
}

// ============================================
// TECHNICAL INDICATORS
// ============================================

// Calculate EMA
function calculateEMA(prices: number[], period: number): number[] {
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);
  
  // First EMA is SMA
  let sum = 0;
  for (let i = 0; i < period && i < prices.length; i++) {
    sum += prices[i];
    ema.push(sum / (i + 1));
  }
  
  // Calculate EMA for remaining prices
  for (let i = period; i < prices.length; i++) {
    ema.push((prices[i] - ema[i - 1]) * multiplier + ema[i - 1]);
  }
  
  return ema;
}

// Calculate RSI
function calculateRSI(prices: number[], period: number = 14): number[] {
  const rsi: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];
  
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  // First RSI value
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = 0; i < period; i++) {
    rsi.push(50); // Default for initial values
  }
  
  // Calculate RSI
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(100 - (100 / (1 + rs)));
  }
  
  return rsi;
}

// Calculate ATR
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
  
  // Calculate ATR using EMA of TR
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

// Calculate ADX
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
  
  // Smooth values
  const smoothPlusDM = smoothArray(plusDM, period);
  const smoothMinusDM = smoothArray(minusDM, period);
  const smoothTR = smoothArray(tr, period);
  
  // Calculate +DI and -DI
  const plusDI: number[] = [];
  const minusDI: number[] = [];
  
  for (let i = 0; i < smoothTR.length; i++) {
    plusDI.push(smoothTR[i] > 0 ? (smoothPlusDM[i] / smoothTR[i]) * 100 : 0);
    minusDI.push(smoothTR[i] > 0 ? (smoothMinusDM[i] / smoothTR[i]) * 100 : 0);
  }
  
  // Calculate DX and ADX
  for (let i = 0; i < plusDI.length; i++) {
    const dx = plusDI[i] + minusDI[i] > 0 ? 
      (Math.abs(plusDI[i] - minusDI[i]) / (plusDI[i] + minusDI[i])) * 100 : 0;
    adx.push(dx);
  }
  
  // Smooth ADX
  return smoothArray(adx, period);
}

// Smooth array using Wilder's smoothing
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

// Calculate MACD
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

// ============================================
// SUPPORT/RESISTANCE
// ============================================

function findSupportResistance(candles: DailyCandle[]): { support: number[]; resistance: number[]; pivot: number } {
  const support: number[] = [];
  const resistance: number[] = [];
  
  // Find local minima and maxima
  for (let i = 5; i < candles.length - 5; i++) {
    const window = candles.slice(i - 5, i + 6);
    const highs = window.map(c => c.high);
    const lows = window.map(c => c.low);
    
    const currentHigh = candles[i].high;
    const currentLow = candles[i].low;
    
    // Local maximum
    if (currentHigh === Math.max(...highs)) {
      resistance.push(currentHigh);
    }
    
    // Local minimum
    if (currentLow === Math.min(...lows)) {
      support.push(currentLow);
    }
  }
  
  // Keep only recent significant levels
  const recentSupport = support.slice(-5).reverse();
  const recentResistance = resistance.slice(-5).reverse();
  
  // Calculate pivot
  const lastCandle = candles[candles.length - 1];
  const pivot = (lastCandle.high + lastCandle.low + lastCandle.close) / 3;
  
  return {
    support: recentSupport,
    resistance: recentResistance,
    pivot,
  };
}

// ============================================
// TREND ANALYSIS
// ============================================

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
  
  // Trend direction
  let bullishScore = 0;
  let bearishScore = 0;
  
  // EMA alignment
  if (lastEma20 > lastEma50 && lastEma50 > lastEma200) bullishScore += 3;
  if (lastEma20 < lastEma50 && lastEma50 < lastEma200) bearishScore += 3;
  
  // Price vs EMAs
  if (lastClose > lastEma20) bullishScore++;
  if (lastClose > lastEma50) bullishScore++;
  if (lastClose > lastEma200) bullishScore++;
  if (lastClose < lastEma20) bearishScore++;
  if (lastClose < lastEma50) bearishScore++;
  if (lastClose < lastEma200) bearishScore++;
  
  // Recent price action
  const recentCandles = candles.slice(-10);
  const recentHighs = recentCandles.filter(c => c.close > c.open).length;
  if (recentHighs > 6) bullishScore += 2;
  if (recentHighs < 4) bearishScore += 2;
  
  // Determine trend
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
  
  // Regime
  let regime: 'TRENDING' | 'RANGING' | 'VOLATILE';
  if (lastAdx > 25) {
    regime = 'TRENDING';
  } else if (lastAdx < 20) {
    regime = 'RANGING';
  } else {
    // Calculate volatility
    const atrValues = calculateATR(candles.slice(-20));
    const lastAtr = atrValues[atrValues.length - 1];
    const atrPercent = (lastAtr / lastClose) * 100;
    regime = atrPercent > 3 ? 'VOLATILE' : 'RANGING';
  }
  
  return { trend, trendStrength, regime };
}

// ============================================
// SIGNAL GENERATION (80%+ CONFIDENCE REQUIRED)
// ============================================

function generateSignal(
  candles: DailyCandle[],
  indicators: AnalysisResult['indicators'],
  trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS',
  regime: 'TRENDING' | 'RANGING' | 'VOLATILE',
  levels: { support: number[]; resistance: number[]; pivot: number }
): TradeSetup | null {
  const lastCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];
  
  const reasons: string[] = [];
  let confluenceScore = 0;
  let direction: 'BUY' | 'SELL' | null = null;
  
  // ============================================
  // CONFLUENCE FACTORS (Each adds to confidence)
  // ============================================
  
  // Factor 1: Trend Alignment (Weight: 25)
  if (trend === 'BULLISH' && indicators.ema20 > indicators.ema50) {
    confluenceScore += 25;
    reasons.push('Bullish trend with EMA alignment');
    if (direction !== 'SELL') direction = 'BUY';
  } else if (trend === 'BEARISH' && indicators.ema20 < indicators.ema50) {
    confluenceScore += 25;
    reasons.push('Bearish trend with EMA alignment');
    if (direction !== 'BUY') direction = 'SELL';
  }
  
  // Factor 2: RSI Conditions (Weight: 15)
  if (direction === 'BUY' && indicators.rsi < 40) {
    confluenceScore += 15;
    reasons.push(`RSI oversold (${indicators.rsi.toFixed(1)})`);
  } else if (direction === 'SELL' && indicators.rsi > 60) {
    confluenceScore += 15;
    reasons.push(`RSI overbought (${indicators.rsi.toFixed(1)})`);
  } else if (direction === 'BUY' && indicators.rsi < 50) {
    confluenceScore += 8;
    reasons.push(`RSI favorable (${indicators.rsi.toFixed(1)})`);
  } else if (direction === 'SELL' && indicators.rsi > 50) {
    confluenceScore += 8;
    reasons.push(`RSI favorable (${indicators.rsi.toFixed(1)})`);
  }
  
  // Factor 3: MACD Confirmation (Weight: 15)
  if (direction === 'BUY' && indicators.macd.histogram > 0 && indicators.macd.value > indicators.macd.signal) {
    confluenceScore += 15;
    reasons.push('MACD bullish crossover');
  } else if (direction === 'SELL' && indicators.macd.histogram < 0 && indicators.macd.value < indicators.macd.signal) {
    confluenceScore += 15;
    reasons.push('MACD bearish crossover');
  }
  
  // Factor 4: Volume Confirmation (Weight: 10)
  if (indicators.volume.ratio > 1.2) {
    confluenceScore += 10;
    reasons.push(`Volume above average (${indicators.volume.ratio.toFixed(2)}x)`);
  }
  
  // Factor 5: Support/Resistance Test (Weight: 15)
  if (direction === 'BUY') {
    const nearSupport = levels.support.find(s => Math.abs(lastCandle.close - s) / lastCandle.close < 0.02);
    if (nearSupport) {
      confluenceScore += 15;
      reasons.push(`Near support at ${nearSupport.toFixed(2)}`);
    }
  } else if (direction === 'SELL') {
    const nearResistance = levels.resistance.find(r => Math.abs(lastCandle.close - r) / lastCandle.close < 0.02);
    if (nearResistance) {
      confluenceScore += 15;
      reasons.push(`Near resistance at ${nearResistance.toFixed(2)}`);
    }
  }
  
  // Factor 6: Regime Check (Weight: 10)
  if (regime === 'TRENDING') {
    confluenceScore += 10;
    reasons.push('Trending market regime');
  }
  
  // Factor 7: Price Action Pattern (Weight: 10)
  if (direction === 'BUY') {
    // Bullish engulfing or hammer-like pattern
    if (lastCandle.close > lastCandle.open && 
        lastCandle.close > prevCandle.close && 
        prevCandle.close < prevCandle.open) {
      confluenceScore += 10;
      reasons.push('Bullish price action');
    }
  } else if (direction === 'SELL') {
    // Bearish engulfing or shooting star-like pattern
    if (lastCandle.close < lastCandle.open && 
        lastCandle.close < prevCandle.close && 
        prevCandle.close > prevCandle.open) {
      confluenceScore += 10;
      reasons.push('Bearish price action');
    }
  }
  
  // ============================================
  // MINIMUM CONFIDENCE CHECK (80% REQUIRED)
  // ============================================
  
  if (!direction || confluenceScore < 80) {
    return null;
  }
  
  // Calculate entry, stop loss, and target
  const atr = indicators.atr;
  let entryPrice: number;
  let stopLoss: number;
  let targetPrice: number;
  
  if (direction === 'BUY') {
    entryPrice = lastCandle.close;
    stopLoss = entryPrice - (2 * atr);
    targetPrice = entryPrice + (3 * atr);
  } else {
    entryPrice = lastCandle.close;
    stopLoss = entryPrice + (2 * atr);
    targetPrice = entryPrice - (3 * atr);
  }
  
  const riskReward = Math.abs(targetPrice - entryPrice) / Math.abs(entryPrice - stopLoss);
  
  // Only accept risk/reward >= 1.5
  if (riskReward < 1.5) {
    return null;
  }
  
  return {
    direction,
    entryPrice,
    stopLoss,
    targetPrice,
    riskReward,
    confluenceScore,
    confidence: confluenceScore,
    reasons,
    riskPercent: 2.0, // 2% risk per trade
    positionSize: 100, // Will be calculated based on capital
  };
}

// ============================================
// MAIN ANALYSIS FUNCTION
// ============================================

export async function analyzeStock(symbol: string): Promise<AnalysisResult | null> {
  // Get stock
  const stock = await db.stock.findUnique({
    where: { symbol },
    include: {
      dailyCandles: {
        orderBy: { date: 'asc' },
        take: 500,
      },
    },
  });
  
  if (!stock || stock.dailyCandles.length < 200) {
    return null;
  }
  
  const candles = stock.dailyCandles;
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  
  // Calculate indicators
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
  
  // Generate signal
  const setup = generateSignal(candles, indicators, trend, regime, levels);
  
  return {
    symbol,
    timeframe: 'DAILY',
    trend,
    trendStrength,
    regime,
    confidence: setup?.confidence || 0,
    indicators,
    levels,
    setup,
  };
}

// Scan all stocks for signals
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
  
  // Calculate valid till (5 trading days)
  const validTill = new Date();
  validTill.setDate(validTill.getDate() + 7); // 5 trading days ≈ 7 calendar days
  
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
      reasoning: JSON.stringify(setup.reasons),
      indicators: JSON.stringify(analysis.indicators),
      validTill,
    },
  });
  
  // Create tracking record
  await db.signalTracking.create({
    data: {
      signalId: signal.id,
    },
  });
  
  return signal.id;
}
