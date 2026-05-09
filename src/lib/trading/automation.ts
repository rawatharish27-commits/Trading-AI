/**
 * Trading Automation Module
 * Runs directly on port 3000 (main Next.js app)
 * 
 * Schedule: Daily at 10:00 AM IST
 * Tasks: Data Update → Signal Generation → Tracking → Learning
 */

import { db } from '@/lib/db';
import { getYahooSymbol } from './nifty500';

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  SIGNAL_MIN_CONFIDENCE: 80,
  TRACKING_DAYS: 5,
};

// ============================================
// YAHOO FINANCE DATA FETCHER
// ============================================

const YAHOO_FINANCE_BASE = 'https://query1.finance.yahoo.com';

interface YahooCandle {
  date: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function fetchWithRetry(url: string, retries = 3): Promise<Response | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });
      if (response.ok) return response;
      if (response.status === 429) await new Promise(r => setTimeout(r, 10000));
      else await new Promise(r => setTimeout(r, 2000));
    } catch {
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  return null;
}

async function fetchRecentData(symbol: string, daysBack: number = 7): Promise<YahooCandle[]> {
  const yahooSymbol = getYahooSymbol(symbol);
  const endDate = Math.floor(Date.now() / 1000);
  const startDate = Math.floor((Date.now() - daysBack * 24 * 60 * 60 * 1000) / 1000);
  const url = `${YAHOO_FINANCE_BASE}/v8/finance/chart/${yahooSymbol}?period1=${startDate}&period2=${endDate}&interval=1d`;
  
  const response = await fetchWithRetry(url);
  if (!response) return [];
  
  try {
    const data = await response.json();
    if (!data.chart?.result?.[0]) return [];
    
    const q = data.chart.result[0].indicators?.quote?.[0];
    const ts = data.chart.result[0].timestamp;
    if (!q || !ts) return [];
    
    const candles: YahooCandle[] = [];
    for (let i = 0; i < ts.length; i++) {
      if (q.open[i] !== null && q.close[i] !== null) {
        candles.push({
          date: ts[i] * 1000,
          open: q.open[i], high: q.high[i], low: q.low[i],
          close: q.close[i], volume: q.volume[i] || 0,
        });
      }
    }
    return candles;
  } catch {
    return [];
  }
}

// ============================================
// TECHNICAL INDICATORS
// ============================================

function calculateEMA(prices: number[], period: number): number[] {
  const ema: number[] = [];
  const mult = 2 / (period + 1);
  let sum = 0;
  
  for (let i = 0; i < prices.length; i++) {
    if (i < period) {
      sum += prices[i];
      ema.push(sum / (i + 1));
    } else {
      ema.push((prices[i] - ema[i - 1]) * mult + ema[i - 1]);
    }
  }
  return ema;
}

function calculateRSI(prices: number[], period = 14): number[] {
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
  
  for (let i = 0; i < period; i++) rsi.push(50);
  
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(100 - (100 / (1 + rs)));
  }
  return rsi;
}

function calculateATR(candles: { high: number; low: number; close: number }[], period = 14): number[] {
  const atr: number[] = [];
  const tr: number[] = [];
  
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      tr.push(candles[i].high - candles[i].low);
    } else {
      tr.push(Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      ));
    }
  }
  
  let sum = 0;
  for (let i = 0; i < tr.length; i++) {
    if (i < period) {
      sum += tr[i];
      atr.push(sum / (i + 1));
    } else {
      atr.push((atr[i - 1] * (period - 1) + tr[i]) / period);
    }
  }
  return atr;
}

function calculateADX(candles: { high: number; low: number; close: number }[], period = 14): number[] {
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const tr: number[] = [0];
  
  for (let i = 1; i < candles.length; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    tr.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    ));
  }
  
  const smoothPlus = smoothArray(plusDM, period);
  const smoothMinus = smoothArray(minusDM, period);
  const smoothTR = smoothArray(tr, period);
  
  const adx: number[] = [];
  for (let i = 0; i < smoothTR.length; i++) {
    const plusDI = smoothTR[i] > 0 ? (smoothPlus[i] / smoothTR[i]) * 100 : 0;
    const minusDI = smoothTR[i] > 0 ? (smoothMinus[i] / smoothTR[i]) * 100 : 0;
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

// ============================================
// STEP 1: DATA UPDATE (Incremental)
// ============================================

export async function updateData(): Promise<{ stocksUpdated: number; newCandles: number }> {
  console.log('[AUTOMATION] Starting incremental data update...');
  
  const stocksWithData = await db.stock.findMany({
    where: { dailyCandles: { some: {} }, isActive: true },
    select: { id: true, symbol: true },
  });
  
  console.log(`[AUTOMATION] Found ${stocksWithData.length} stocks to check`);
  
  let stocksUpdated = 0;
  let newCandles = 0;
  
  for (const stock of stocksWithData) {
    try {
      const latestCandle = await db.dailyCandle.findFirst({
        where: { stockId: stock.id },
        orderBy: { date: 'desc' },
      });
      
      if (!latestCandle) continue;
      
      const candles = await fetchRecentData(stock.symbol, 7);
      const latestDate = new Date(latestCandle.date).getTime();
      const newCandlesList = candles.filter(c => c.date > latestDate);
      
      if (newCandlesList.length > 0) {
        for (const c of newCandlesList) {
          await db.dailyCandle.upsert({
            where: { stockId_date: { stockId: stock.id, date: new Date(c.date) } },
            update: { open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume },
            create: { stockId: stock.id, date: new Date(c.date), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume },
          });
        }
        newCandles += newCandlesList.length;
        stocksUpdated++;
      }
      
      await new Promise(r => setTimeout(r, 100));
    } catch (error) {
      console.log(`[AUTOMATION] Error updating ${stock.symbol}`);
    }
  }
  
  console.log(`[AUTOMATION] Data update: ${stocksUpdated} stocks, ${newCandles} new candles`);
  return { stocksUpdated, newCandles };
}

// ============================================
// STEP 2: SIGNAL GENERATION
// ============================================

interface GeneratedSignal {
  symbol: string;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  confidence: number;
  reasoning: string;
  detailedAnalysis: {
    trendDirection: string;
    trendStrength: string;
    pricePosition: string;
    rsiStatus: string;
    volumeStatus: string;
    riskLevel: string;
    whySelected: string[];
    profitProbability: string;
  };
}

interface SignalAnalysis {
  score: number;
  passed: boolean;
  details: string;
}

export async function generateSignals(): Promise<GeneratedSignal[]> {
  console.log('[AUTOMATION] Generating signals with detailed analysis...');
  
  const stocks = await db.stock.findMany({
    where: { isActive: true, dailyCandles: { some: {} } },
    include: { dailyCandles: { orderBy: { date: 'desc' }, take: 300 } }
  });
  
  const signals: GeneratedSignal[] = [];
  
  for (const stock of stocks) {
    if (stock.dailyCandles.length < 200) continue;
    
    const candles = stock.dailyCandles.reverse();
    const closes = candles.map(c => c.close);
    
    const ema20 = calculateEMA(closes, 20);
    const ema50 = calculateEMA(closes, 50);
    const ema200 = calculateEMA(closes, 200);
    const rsi = calculateRSI(closes);
    const atr = calculateATR(candles);
    const adx = calculateADX(candles);
    
    const lastClose = closes[closes.length - 1];
    const prevClose = closes[closes.length - 2];
    const lastEma20 = ema20[ema20.length - 1];
    const lastEma50 = ema50[ema50.length - 1];
    const lastEma200 = ema200[ema200.length - 1];
    const lastRsi = rsi[rsi.length - 1];
    const lastAtr = atr[atr.length - 1];
    const lastAdx = adx[adx.length - 1];
    
    // Detailed Analysis with Scores
    const analysis: {
      trend: SignalAnalysis;
      pricePosition: SignalAnalysis;
      rsi: SignalAnalysis;
      adx: SignalAnalysis;
      volume: SignalAnalysis;
      momentum: SignalAnalysis;
    } = {
      trend: { score: 0, passed: false, details: '' },
      pricePosition: { score: 0, passed: false, details: '' },
      rsi: { score: 0, passed: false, details: '' },
      adx: { score: 0, passed: false, details: '' },
      volume: { score: 0, passed: false, details: '' },
      momentum: { score: 0, passed: false, details: '' },
    };
    
    const whySelected: string[] = [];
    let confluenceScore = 0;
    
    // 1. TREND ANALYSIS (Max 25 points)
    const emaBullish = lastEma20 > lastEma50 && lastEma50 > lastEma200;
    const emaBearish = lastEma20 < lastEma50 && lastEma50 < lastEma200;
    
    if (emaBullish) {
      analysis.trend = {
        score: 25,
        passed: true,
        details: `EMA20 (${lastEma20.toFixed(2)}) > EMA50 (${lastEma50.toFixed(2)}) > EMA200 (${lastEma200.toFixed(2)}) - Strong Uptrend`
      };
      whySelected.push('📈 EMA Stack Bullish: Price in strong uptrend with proper EMA alignment');
    } else if (emaBearish) {
      analysis.trend = {
        score: 25,
        passed: true,
        details: `EMA20 (${lastEma20.toFixed(2)}) < EMA50 (${lastEma50.toFixed(2)}) < EMA200 (${lastEma200.toFixed(2)}) - Strong Downtrend`
      };
      whySelected.push('📉 EMA Stack Bearish: Price in strong downtrend with proper EMA alignment');
    } else {
      analysis.trend = {
        score: 10,
        passed: false,
        details: `EMA alignment mixed - Trend unclear`
      };
    }
    confluenceScore += analysis.trend.score;
    
    // 2. PRICE POSITION (Max 30 points)
    let pricePoints = 0;
    const priceDetails: string[] = [];
    
    if (lastClose > lastEma20) {
      pricePoints += 10;
      priceDetails.push('Above EMA20');
      whySelected.push('✅ Price above EMA20 - Short-term bullish');
    }
    if (lastClose > lastEma50) {
      pricePoints += 10;
      priceDetails.push('Above EMA50');
      whySelected.push('✅ Price above EMA50 - Medium-term bullish');
    }
    if (lastClose > lastEma200) {
      pricePoints += 10;
      priceDetails.push('Above EMA200');
      whySelected.push('✅ Price above EMA200 - Long-term bullish');
    }
    
    analysis.pricePosition = {
      score: pricePoints,
      passed: pricePoints >= 20,
      details: `Price ₹${lastClose.toFixed(2)} is ${priceDetails.join(', ')}`
    };
    confluenceScore += pricePoints;
    
    // 3. RSI ANALYSIS (Max 15 points)
    if (lastRsi > 50 && lastRsi < 70) {
      analysis.rsi = {
        score: 15,
        passed: true,
        details: `RSI at ${lastRsi.toFixed(1)} - Bullish zone with room to run`
      };
      whySelected.push(`🎯 RSI ${lastRsi.toFixed(1)}: In bullish zone (50-70), has momentum without being overbought`);
    } else if (lastRsi < 50 && lastRsi > 30) {
      analysis.rsi = {
        score: 15,
        passed: true,
        details: `RSI at ${lastRsi.toFixed(1)} - Bearish zone with room to fall`
      };
      whySelected.push(`🎯 RSI ${lastRsi.toFixed(1)}: In bearish zone (30-50), has momentum without being oversold`);
    } else if (lastRsi >= 70) {
      analysis.rsi = {
        score: 5,
        passed: false,
        details: `RSI at ${lastRsi.toFixed(1)} - OVERBOUGHT (risk of reversal)`
      };
    } else if (lastRsi <= 30) {
      analysis.rsi = {
        score: 5,
        passed: false,
        details: `RSI at ${lastRsi.toFixed(1)} - OVERSOLD (potential bounce)`
      };
    } else {
      analysis.rsi = { score: 10, passed: true, details: `RSI at ${lastRsi.toFixed(1)} - Neutral` };
    }
    confluenceScore += analysis.rsi.score;
    
    // 4. ADX TREND STRENGTH (Max 15 points)
    if (lastAdx > 25) {
      analysis.adx = {
        score: 15,
        passed: true,
        details: `ADX at ${lastAdx.toFixed(1)} - STRONG TREND`
      };
      whySelected.push(`💪 ADX ${lastAdx.toFixed(1)}: Strong trend confirmed (>25), momentum is real`);
    } else if (lastAdx > 20) {
      analysis.adx = {
        score: 10,
        passed: true,
        details: `ADX at ${lastAdx.toFixed(1)} - Moderate trend`
      };
      whySelected.push(`💪 ADX ${lastAdx.toFixed(1)}: Developing trend (20-25), gaining momentum`);
    } else {
      analysis.adx = {
        score: 0,
        passed: false,
        details: `ADX at ${lastAdx.toFixed(1)} - WEAK/NO TREND`
      };
    }
    confluenceScore += analysis.adx.score;
    
    // 5. VOLUME ANALYSIS (Max 15 points)
    const avgVolume = candles.slice(-20).reduce((sum, c) => sum + c.volume, 0) / 20;
    const lastVolume = candles[candles.length - 1].volume;
    const volumeRatio = lastVolume / avgVolume;
    
    if (volumeRatio > 1.5) {
      analysis.volume = {
        score: 15,
        passed: true,
        details: `Volume ${(volumeRatio * 100).toFixed(0)}% of average - HIGH INTEREST`
      };
      whySelected.push(`📊 Volume ${volumeRatio.toFixed(1)}x avg: Strong participation confirming the move`);
    } else if (volumeRatio > 1.2) {
      analysis.volume = {
        score: 10,
        passed: true,
        details: `Volume ${(volumeRatio * 100).toFixed(0)}% of average - Above average`
      };
    } else {
      analysis.volume = {
        score: 5,
        passed: false,
        details: `Volume ${(volumeRatio * 100).toFixed(0)}% of average - LOW INTEREST`
      };
    }
    confluenceScore += analysis.volume.score;
    
    // 6. MOMENTUM (Bonus)
    const priceChange = ((lastClose - prevClose) / prevClose) * 100;
    if (Math.abs(priceChange) > 2) {
      analysis.momentum = {
        score: 5,
        passed: true,
        details: `Price moved ${priceChange.toFixed(2)}% today - Strong momentum`
      };
      whySelected.push(`⚡ Momentum: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}% move today`);
      confluenceScore += 5;
    }
    
    // Direction
    const direction: 'BUY' | 'SELL' = lastEma20 > lastEma50 ? 'BUY' : 'SELL';
    
    // Risk Level
    const atrPercent = (lastAtr / lastClose) * 100;
    let riskLevel = 'MEDIUM';
    if (atrPercent < 2) riskLevel = 'LOW';
    else if (atrPercent > 4) riskLevel = 'HIGH';
    
    // Profit Probability
    let profitProbability = 'MODERATE';
    if (confluenceScore >= 90) profitProbability = 'VERY HIGH (90%+)';
    else if (confluenceScore >= 85) profitProbability = 'HIGH (85-90%)';
    else if (confluenceScore >= 80) profitProbability = 'GOOD (80-85%)';
    
    // Only generate signal if confidence >= 80%
    if (confluenceScore >= CONFIG.SIGNAL_MIN_CONFIDENCE) {
      const atrMult = 1.5;
      const stopLoss = direction === 'BUY' 
        ? lastClose - lastAtr * atrMult 
        : lastClose + lastAtr * atrMult;
      const targetPrice = direction === 'BUY'
        ? lastClose + lastAtr * atrMult * 2
        : lastClose - lastAtr * atrMult * 2;
      
      const riskRewardRatio = Math.abs(targetPrice - lastClose) / Math.abs(lastClose - stopLoss);
      
      // Final reason summary
      whySelected.push(`\n🎯 WHY THIS STOCK WAS SELECTED:`);
      whySelected.push(`Confidence Score: ${confluenceScore}/100 (${confluenceScore >= 90 ? 'EXCELLENT' : confluenceScore >= 85 ? 'VERY GOOD' : 'GOOD'})`);
      whySelected.push(`Risk:Reward = 1:${riskRewardRatio.toFixed(1)}`);
      whySelected.push(`Expected Profit: ${((Math.abs(targetPrice - lastClose) / lastClose) * 100).toFixed(1)}%`);
      whySelected.push(`Max Loss: ${((Math.abs(lastClose - stopLoss) / lastClose) * 100).toFixed(1)}%`);
      
      signals.push({
        symbol: stock.symbol,
        direction,
        entryPrice: lastClose,
        stopLoss: Math.round(stopLoss * 100) / 100,
        targetPrice: Math.round(targetPrice * 100) / 100,
        confidence: confluenceScore,
        reasoning: whySelected.join('\n'),
        detailedAnalysis: {
          trendDirection: emaBullish ? 'BULLISH' : emaBearish ? 'BEARISH' : 'SIDEWAYS',
          trendStrength: lastAdx > 25 ? 'STRONG' : lastAdx > 20 ? 'MODERATE' : 'WEAK',
          pricePosition: analysis.pricePosition.details,
          rsiStatus: analysis.rsi.details,
          volumeStatus: analysis.volume.details,
          riskLevel,
          whySelected,
          profitProbability,
        },
      });
      
      console.log(`[SIGNAL] ${stock.symbol}: ${direction} @ ₹${lastClose.toFixed(2)} | Confidence: ${confluenceScore}% | ${profitProbability}`);
    }
  }
  
  // Sort by confidence
  signals.sort((a, b) => b.confidence - a.confidence);
  
  console.log(`[AUTOMATION] Generated ${signals.length} signals (80%+ confidence)`);
  return signals;
}

export async function saveSignalsToDB(signals: GeneratedSignal[]): Promise<number> {
  let saved = 0;
  
  for (const signal of signals) {
    try {
      const stock = await db.stock.findUnique({ where: { symbol: signal.symbol } });
      if (!stock) continue;
      
      const existingSignal = await db.tradeSignal.findFirst({
        where: {
          stockId: stock.id,
          signalType: signal.direction,
          generatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }
      });
      
      if (existingSignal) continue;
      
      const validTill = new Date();
      validTill.setDate(validTill.getDate() + CONFIG.TRACKING_DAYS);
      
      // Calculate risk-reward
      const riskRewardRatio = Math.abs(signal.targetPrice - signal.entryPrice) / Math.abs(signal.entryPrice - signal.stopLoss);
      
      const newSignal = await db.tradeSignal.create({
        data: {
          stockId: stock.id,
          signalType: signal.direction,
          status: 'PENDING',
          confidence: signal.confidence,
          entryPrice: signal.entryPrice,
          stopLoss: signal.stopLoss,
          targetPrice: signal.targetPrice,
          riskReward: riskRewardRatio,
          timeframe: 'DAILY',
          trendDirection: signal.detailedAnalysis.trendDirection,
          regime: signal.detailedAnalysis.trendStrength,
          confluenceScore: signal.confidence,
          reasoning: JSON.stringify({
            summary: signal.reasoning,
            detailedAnalysis: signal.detailedAnalysis,
          }),
          validTill,
        },
      });
      
      await db.signalTracking.create({ data: { signalId: newSignal.id } });
      
      console.log(`[SAVED] ${signal.symbol}: ${signal.direction} @ ₹${signal.entryPrice.toFixed(2)}`);
      console.log(`   └─ Confidence: ${signal.confidence}% | ${signal.detailedAnalysis.profitProbability}`);
      console.log(`   └─ Expected Profit: ${((Math.abs(signal.targetPrice - signal.entryPrice) / signal.entryPrice) * 100).toFixed(1)}%`);
      
      saved++;
    } catch (error) {
      console.log(`[AUTOMATION] Error saving ${signal.symbol}:`, error);
    }
  }
  
  return saved;
}

// ============================================
// STEP 3: SIGNAL TRACKING
// ============================================

export async function trackSignals(): Promise<{ tracked: number; closed: number }> {
  console.log('[AUTOMATION] Tracking signals...');
  
  const activeSignals = await db.tradeSignal.findMany({
    where: {
      status: { in: ['PENDING', 'ACTIVE'] },
      generatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    },
    include: {
      stock: { include: { dailyCandles: { orderBy: { date: 'desc' }, take: 10 } } },
      tracking: true,
    }
  });
  
  let tracked = 0;
  let closed = 0;
  
  for (const signal of activeSignals) {
    if (!signal.tracking || signal.stock.dailyCandles.length === 0) continue;
    
    const daysSinceSignal = Math.floor((Date.now() - signal.generatedAt.getTime()) / (24 * 60 * 60 * 1000));
    const todayCandle = signal.stock.dailyCandles[0];
    
    if (daysSinceSignal >= 1 && daysSinceSignal <= 5) {
      const updateData: Record<string, any> = {};
      updateData[`day${daysSinceSignal}Date`] = todayCandle.date;
      updateData[`day${daysSinceSignal}High`] = todayCandle.high;
      updateData[`day${daysSinceSignal}Low`] = todayCandle.low;
      updateData[`day${daysSinceSignal}Close`] = todayCandle.close;
      
      await db.signalTracking.update({
        where: { signalId: signal.id },
        data: updateData,
      });
      tracked++;
    }
    
    let shouldClose = false;
    let result: 'SUCCESS' | 'LOSS' = 'SUCCESS';
    
    if (signal.signalType === 'BUY') {
      if (todayCandle.low <= signal.stopLoss) { shouldClose = true; result = 'LOSS'; }
      else if (todayCandle.high >= signal.targetPrice) { shouldClose = true; result = 'SUCCESS'; }
    } else {
      if (todayCandle.high >= signal.stopLoss) { shouldClose = true; result = 'LOSS'; }
      else if (todayCandle.low <= signal.targetPrice) { shouldClose = true; result = 'SUCCESS'; }
    }
    
    if (daysSinceSignal >= 5) {
      shouldClose = true;
      const pnl = signal.signalType === 'BUY'
        ? ((todayCandle.close - signal.entryPrice) / signal.entryPrice) * 100
        : ((signal.entryPrice - todayCandle.close) / signal.entryPrice) * 100;
      result = pnl >= 0 ? 'SUCCESS' : 'LOSS';
    }
    
    if (shouldClose) {
      const pnl = signal.signalType === 'BUY'
        ? ((todayCandle.close - signal.entryPrice) / signal.entryPrice) * 100
        : ((signal.entryPrice - todayCandle.close) / signal.entryPrice) * 100;
      
      await db.tradeSignal.update({
        where: { id: signal.id },
        data: { status: result, closedAt: new Date() }
      });
      
      await db.signalTracking.update({
        where: { signalId: signal.id },
        data: { finalResult: result, finalPnlPercent: pnl }
      });
      
      closed++;
    }
  }
  
  console.log(`[AUTOMATION] Tracking: ${tracked} updated, ${closed} closed`);
  return { tracked, closed };
}

// ============================================
// STEP 4: LEARNING UPDATE
// ============================================

export async function updateLearning(): Promise<number> {
  console.log('[AUTOMATION] Updating learning...');
  
  const closedSignals = await db.tradeSignal.findMany({
    where: {
      status: { in: ['SUCCESS', 'LOSS'] },
      tracking: { analyzedForLearning: false }
    },
    include: { stock: true, tracking: true }
  });
  
  let analyzed = 0;
  
  for (const signal of closedSignals) {
    if (!signal.tracking) continue;
    
    await db.learningRecord.create({
      data: {
        signalId: signal.id,
        setupType: signal.regime || 'TRENDING',
        trendDirection: signal.trendDirection,
        regime: signal.regime,
        sector: signal.stock.sector,
        result: signal.status,
        pnlPercent: signal.tracking.finalPnlPercent,
        maxDrawdown: signal.tracking.maxLoss,
        maxProfit: signal.tracking.maxProfit,
        whatWorked: signal.status === 'SUCCESS' ? signal.reasoning : null,
        whatFailed: signal.status === 'LOSS' ? signal.reasoning : null,
      }
    });
    
    await db.signalTracking.update({
      where: { signalId: signal.id },
      data: { analyzedForLearning: true }
    });
    
    analyzed++;
  }
  
  const allSignals = await db.tradeSignal.findMany({
    where: { status: { in: ['SUCCESS', 'LOSS'] } }
  });
  
  const successCount = allSignals.filter(s => s.status === 'SUCCESS').length;
  const lossCount = allSignals.filter(s => s.status === 'LOSS').length;
  const total = allSignals.length;
  
  await db.strategyPerformance.upsert({
    where: { strategyName: 'CONFLUENCE_80' },
    update: {
      totalSignals: total,
      successCount,
      lossCount,
      successRate: total > 0 ? (successCount / total) * 100 : 0,
      lastLearnedAt: new Date(),
    },
    create: {
      strategyName: 'CONFLUENCE_80',
      description: 'Confluence strategy with 80%+ confidence',
      totalSignals: total,
      successCount,
      lossCount,
      successRate: total > 0 ? (successCount / total) * 100 : 0,
    }
  });
  
  console.log(`[AUTOMATION] Learning: ${analyzed} analyzed`);
  return analyzed;
}

// ============================================
// MAIN AUTOMATION RUNNER
// ============================================

export interface AutomationResult {
  success: boolean;
  dataUpdate: { stocksUpdated: number; newCandles: number };
  signals: { generated: number; saved: number };
  tracking: { tracked: number; closed: number };
  learning: { analyzed: number };
  duration: number;
  error?: string;
}

export async function runDailyAutomation(): Promise<AutomationResult> {
  const startTime = Date.now();
  
  console.log('\n========================================');
  console.log('🤖 TRADING AI - DAILY AUTOMATION');
  console.log(`📅 Started at: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
  console.log('========================================\n');
  
  try {
    // Create analysis run record
    const analysisRun = await db.analysisRun.create({
      data: { type: 'FULL', status: 'RUNNING', timeframe: 'DAILY' },
    });
    
    // STEP 1: Data Update
    console.log('\n📊 STEP 1: DATA UPDATE');
    const dataResult = await updateData();
    
    // STEP 2: Signal Generation
    console.log('\n🎯 STEP 2: SIGNAL GENERATION');
    const signals = await generateSignals();
    const savedSignals = await saveSignalsToDB(signals);
    
    // STEP 3: Signal Tracking
    console.log('\n📈 STEP 3: SIGNAL TRACKING');
    const trackingResult = await trackSignals();
    
    // STEP 4: Learning Update
    console.log('\n🧠 STEP 4: LEARNING UPDATE');
    const learningResult = await updateLearning();
    
    const duration = Date.now() - startTime;
    
    // Update analysis run
    await db.analysisRun.update({
      where: { id: analysisRun.id },
      data: {
        status: 'COMPLETED',
        stocksAnalyzed: dataResult.stocksUpdated,
        signalsGenerated: savedSignals,
        highAccuracySignals: savedSignals,
        completedAt: new Date(),
        durationMs: duration,
      },
    });
    
    // Summary
    console.log('\n========================================');
    console.log('📊 DAILY AUTOMATION SUMMARY');
    console.log('========================================');
    console.log(`✅ Data Updated: ${dataResult.stocksUpdated} stocks, ${dataResult.newCandles} new candles`);
    console.log(`✅ Signals Generated: ${savedSignals} (80%+ confidence)`);
    console.log(`✅ Signals Tracked: ${trackingResult.tracked} updated, ${trackingResult.closed} closed`);
    console.log(`✅ Learning Records: ${learningResult} analyzed`);
    console.log(`⏱️ Duration: ${(duration / 1000 / 60).toFixed(2)} minutes`);
    console.log('========================================\n');
    
    return {
      success: true,
      dataUpdate: dataResult,
      signals: { generated: signals.length, saved: savedSignals },
      tracking: trackingResult,
      learning: { analyzed: learningResult },
      duration,
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[AUTOMATION] Error:', error);
    
    return {
      success: false,
      dataUpdate: { stocksUpdated: 0, newCandles: 0 },
      signals: { generated: 0, saved: 0 },
      tracking: { tracked: 0, closed: 0 },
      learning: { analyzed: 0 },
      duration,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
