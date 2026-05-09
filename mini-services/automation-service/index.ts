/**
 * Trading Automation Service
 * 
 * FULLY AUTOMATED TRADING SYSTEM:
 * - Runs ONCE DAILY at 10:00 AM IST
 * - Full Process: Data Update → Signal Generation → Tracking → Learning
 * 
 * User Requirements:
 * - Daily morning 10 AM automation
 * - No auto refresh to avoid load
 * - One full process execution per day
 * - Data: Last 2 years saved, daily updated
 */

import { db } from '../../src/lib/db';
import { getYahooSymbol } from '../../src/lib/trading/nifty500';

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  PORT: 3030,
  DATA_FETCH_BATCH_SIZE: 30,
  SIGNAL_MIN_CONFIDENCE: 80,
  TRACKING_DAYS: 5,
  IST_OFFSET_HOURS: 5.5,
  SCHEDULE_HOUR_IST: 10, // 10 AM IST
  SCHEDULE_MINUTE_IST: 0,
};

// ============================================
// LOGGING
// ============================================

function log(level: 'INFO' | 'WARNING' | 'ERROR', category: string, message: string) {
  const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const icon = level === 'INFO' ? '✅' : level === 'WARNING' ? '⚠️' : '❌';
  console.log(`${icon} [${timestamp}] [${category}] ${message}`);
  
  // Save to database
  db.systemLog.create({
    data: { level, category, message }
  }).catch(() => {});
}

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
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      if (response.ok) return response;
      if (response.status === 429) {
        await new Promise(r => setTimeout(r, 10000));
        continue;
      }
      await new Promise(r => setTimeout(r, 2000));
    } catch {
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  return null;
}

// Fetch last 7 days for incremental update
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

async function updateData(): Promise<{ stocksUpdated: number; newCandles: number }> {
  log('INFO', 'DATA', 'Starting incremental data update...');
  
  // Get all stocks that already have data
  const stocksWithData = await db.stock.findMany({
    where: { dailyCandles: { some: {} }, isActive: true },
    select: { id: true, symbol: true },
  });
  
  log('INFO', 'DATA', `Found ${stocksWithData.length} stocks to check for updates`);
  
  let stocksUpdated = 0;
  let newCandles = 0;
  
  // Process in batches
  const batchSize = CONFIG.DATA_FETCH_BATCH_SIZE;
  for (let i = 0; i < stocksWithData.length; i += batchSize) {
    const batch = stocksWithData.slice(i, i + batchSize);
    
    for (const stock of batch) {
      try {
        // Get latest candle date from DB
        const latestCandle = await db.dailyCandle.findFirst({
          where: { stockId: stock.id },
          orderBy: { date: 'desc' },
        });
        
        if (!latestCandle) continue;
        
        // Fetch last 7 days to ensure we catch any missing data
        const candles = await fetchRecentData(stock.symbol, 7);
        
        // Only save candles newer than the latest in DB
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
        log('WARNING', 'DATA', `Error updating ${stock.symbol}`);
      }
    }
    
    // Progress update
    if ((i + batchSize) % 60 === 0 || i + batchSize >= stocksWithData.length) {
      log('INFO', 'DATA', `Progress: ${Math.min(i + batchSize, stocksWithData.length)}/${stocksWithData.length}`);
    }
    
    await new Promise(r => setTimeout(r, 300));
  }
  
  log('INFO', 'DATA', `Data update complete: ${stocksUpdated} stocks, ${newCandles} new candles`);
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
}

async function generateSignals(): Promise<GeneratedSignal[]> {
  log('INFO', 'SIGNAL', 'Starting signal generation...');
  
  const stocks = await db.stock.findMany({
    where: { isActive: true, dailyCandles: { some: {} } },
    include: { dailyCandles: { orderBy: { date: 'desc' }, take: 300 } }
  });
  
  const signals: GeneratedSignal[] = [];
  let analyzed = 0;
  
  for (const stock of stocks) {
    if (stock.dailyCandles.length < 200) continue;
    analyzed++;
    
    const candles = stock.dailyCandles.reverse();
    const closes = candles.map(c => c.close);
    
    // Calculate indicators
    const ema20 = calculateEMA(closes, 20);
    const ema50 = calculateEMA(closes, 50);
    const ema200 = calculateEMA(closes, 200);
    const rsi = calculateRSI(closes);
    const atr = calculateATR(candles);
    const adx = calculateADX(candles);
    
    const lastClose = closes[closes.length - 1];
    const lastEma20 = ema20[ema20.length - 1];
    const lastEma50 = ema50[ema50.length - 1];
    const lastEma200 = ema200[ema200.length - 1];
    const lastRsi = rsi[rsi.length - 1];
    const lastAtr = atr[atr.length - 1];
    const lastAdx = adx[adx.length - 1];
    
    // Calculate confluence score
    let confluenceScore = 0;
    const factors: string[] = [];
    
    // Trend analysis
    if (lastEma20 > lastEma50 && lastEma50 > lastEma200) {
      confluenceScore += 25;
      factors.push('EMA Bullish Stack');
    } else if (lastEma20 < lastEma50 && lastEma50 < lastEma200) {
      confluenceScore += 25;
      factors.push('EMA Bearish Stack');
    }
    
    // Price position
    if (lastClose > lastEma20) { confluenceScore += 10; factors.push('Above EMA20'); }
    if (lastClose > lastEma50) { confluenceScore += 10; factors.push('Above EMA50'); }
    if (lastClose > lastEma200) { confluenceScore += 10; factors.push('Above EMA200'); }
    
    // RSI
    if (lastRsi > 50 && lastRsi < 70) { confluenceScore += 15; factors.push('RSI Bullish'); }
    else if (lastRsi < 50 && lastRsi > 30) { confluenceScore += 15; factors.push('RSI Bearish'); }
    
    // ADX
    if (lastAdx > 25) { confluenceScore += 15; factors.push('Strong Trend'); }
    else if (lastAdx > 20) { confluenceScore += 10; factors.push('Moderate Trend'); }
    
    // Volume
    const avgVolume = candles.slice(-20).reduce((sum, c) => sum + c.volume, 0) / 20;
    const lastVolume = candles[candles.length - 1].volume;
    if (lastVolume > avgVolume * 1.5) { confluenceScore += 15; factors.push('High Volume'); }
    
    // Direction
    const direction: 'BUY' | 'SELL' = lastEma20 > lastEma50 ? 'BUY' : 'SELL';
    
    // Only generate signal if confidence >= 80%
    if (confluenceScore >= CONFIG.SIGNAL_MIN_CONFIDENCE) {
      const atrMult = 1.5;
      const stopLoss = direction === 'BUY' 
        ? lastClose - lastAtr * atrMult 
        : lastClose + lastAtr * atrMult;
      const targetPrice = direction === 'BUY'
        ? lastClose + lastAtr * atrMult * 2
        : lastClose - lastAtr * atrMult * 2;
      
      signals.push({
        symbol: stock.symbol,
        direction,
        entryPrice: lastClose,
        stopLoss: Math.round(stopLoss * 100) / 100,
        targetPrice: Math.round(targetPrice * 100) / 100,
        confidence: confluenceScore,
        reasoning: factors.join(' | '),
      });
      
      log('INFO', 'SIGNAL', `${stock.symbol}: ${direction} @ ${lastClose} (${confluenceScore}%)`);
    }
  }
  
  log('INFO', 'SIGNAL', `Analyzed ${analyzed} stocks, generated ${signals.length} signals (80%+ confidence)`);
  return signals;
}

async function saveSignalsToDB(signals: GeneratedSignal[]): Promise<number> {
  let saved = 0;
  
  for (const signal of signals) {
    try {
      const stock = await db.stock.findUnique({ where: { symbol: signal.symbol } });
      if (!stock) continue;
      
      // Check if similar signal exists in last 24 hours
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
      
      const newSignal = await db.tradeSignal.create({
        data: {
          stockId: stock.id,
          signalType: signal.direction,
          status: 'PENDING',
          confidence: signal.confidence,
          entryPrice: signal.entryPrice,
          stopLoss: signal.stopLoss,
          targetPrice: signal.targetPrice,
          riskReward: 2.0,
          timeframe: 'DAILY',
          reasoning: signal.reasoning,
          validTill,
        },
      });
      
      await db.signalTracking.create({
        data: { signalId: newSignal.id }
      });
      
      saved++;
    } catch (error) {
      log('WARNING', 'SIGNAL', `Error saving ${signal.symbol}`);
    }
  }
  
  return saved;
}

// ============================================
// STEP 3: SIGNAL TRACKING (5-Day Holding)
// ============================================

async function trackSignals(): Promise<{ tracked: number; closed: number }> {
  log('INFO', 'TRACKING', 'Starting signal tracking...');
  
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
    
    // Update tracking
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
    
    // Check stop loss / target
    let shouldClose = false;
    let result: 'SUCCESS' | 'LOSS' = 'SUCCESS';
    
    if (signal.signalType === 'BUY') {
      if (todayCandle.low <= signal.stopLoss) {
        shouldClose = true;
        result = 'LOSS';
      } else if (todayCandle.high >= signal.targetPrice) {
        shouldClose = true;
        result = 'SUCCESS';
      }
    } else {
      if (todayCandle.high >= signal.stopLoss) {
        shouldClose = true;
        result = 'LOSS';
      } else if (todayCandle.low <= signal.targetPrice) {
        shouldClose = true;
        result = 'SUCCESS';
      }
    }
    
    // Close after 5 days
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
      log('INFO', 'TRACKING', `${signal.stock.symbol}: Closed as ${result} (${pnl.toFixed(2)}%)`);
    }
  }
  
  log('INFO', 'TRACKING', `Tracking complete: ${tracked} updated, ${closed} closed`);
  return { tracked, closed };
}

// ============================================
// STEP 4: LEARNING UPDATE
// ============================================

async function updateLearning(): Promise<number> {
  log('INFO', 'LEARNING', 'Starting learning analysis...');
  
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
  
  // Update strategy performance
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
  
  log('INFO', 'LEARNING', `Learning complete: ${analyzed} signals analyzed, Success rate: ${total > 0 ? ((successCount / total) * 100).toFixed(1) : 0}%`);
  return analyzed;
}

// ============================================
// MAIN DAILY AUTOMATION
// ============================================

async function runDailyAutomation(): Promise<void> {
  const startTime = Date.now();
  
  console.log('\n========================================');
  console.log('🤖 TRADING AI - DAILY AUTOMATION');
  console.log(`📅 Started at: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
  console.log('========================================\n');
  
  // Create analysis run record
  const analysisRun = await db.analysisRun.create({
    data: {
      type: 'FULL',
      status: 'RUNNING',
      timeframe: 'DAILY',
    },
  });
  
  try {
    // STEP 1: Update Data
    console.log('\n📊 STEP 1: DATA UPDATE');
    console.log('------------------------');
    const dataResult = await updateData();
    
    // STEP 2: Generate Signals
    console.log('\n🎯 STEP 2: SIGNAL GENERATION');
    console.log('-----------------------------');
    const signals = await generateSignals();
    const savedSignals = await saveSignalsToDB(signals);
    
    // STEP 3: Track Signals
    console.log('\n📈 STEP 3: SIGNAL TRACKING');
    console.log('---------------------------');
    const trackingResult = await trackSignals();
    
    // STEP 4: Update Learning
    console.log('\n🧠 STEP 4: LEARNING UPDATE');
    console.log('---------------------------');
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
    console.log(`✅ Signals Generated: ${savedSignals} high-confidence (80%+)`);
    console.log(`✅ Signals Tracked: ${trackingResult.tracked} updated, ${trackingResult.closed} closed`);
    console.log(`✅ Learning Records: ${learningResult} analyzed`);
    console.log(`⏱️ Total Duration: ${(duration / 1000 / 60).toFixed(2)} minutes`);
    console.log('========================================\n');
    
    log('INFO', 'SYSTEM', 'Daily automation completed successfully');
    
  } catch (error) {
    await db.analysisRun.update({
      where: { id: analysisRun.id },
      data: {
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
      },
    });
    
    log('ERROR', 'SYSTEM', `Daily automation failed: ${error instanceof Error ? error.message : 'Unknown'}`);
  }
}

// ============================================
// SCHEDULER (10 AM IST)
// ============================================

function scheduleDaily10AM() {
  const now = new Date();
  
  // Get current IST time as offset from UTC
  const istOffset = 5.5 * 60 * 60 * 1000; // 5.5 hours in ms
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
  const istTime = new Date(utcTime + istOffset);
  
  // Calculate next 10 AM IST
  const next10AM = new Date(istTime);
  next10AM.setHours(CONFIG.SCHEDULE_HOUR_IST, CONFIG.SCHEDULE_MINUTE_IST, 0, 0);
  
  // If already past 10 AM today, schedule for tomorrow
  if (istTime >= next10AM) {
    next10AM.setDate(next10AM.getDate() + 1);
  }
  
  // Calculate delay in milliseconds
  const delay = next10AM.getTime() - istTime.getTime();
  
  console.log(`\n⏰ Current IST time: ${istTime.toLocaleString('en-IN')} IST`);
  console.log(`⏰ Next automation scheduled at: ${next10AM.toLocaleString('en-IN')} IST (10:00 AM)`);
  console.log(`   (in ${Math.round(delay / 1000 / 60)} minutes)\n`);
  
  setTimeout(async () => {
    await runDailyAutomation();
    // Schedule next day
    scheduleDaily10AM();
  }, delay);
}

// ============================================
// HTTP SERVER
// ============================================

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers });
  }
  
  try {
    if (path === '/health') {
      return Response.json({ status: 'ok', timestamp: new Date().toISOString() }, { headers });
    }
    
    // Manual trigger - Run full automation now
    if (path === '/api/run-now' && req.method === 'POST') {
      runDailyAutomation().catch(console.error);
      return Response.json({ success: true, message: 'Automation started' }, { headers });
    }
    
    // Status
    if (path === '/api/status') {
      const totalStocks = await db.stock.count();
      const stocksWithData = await db.stock.count({ where: { dailyCandles: { some: {} } } });
      const totalCandles = await db.dailyCandle.count();
      const totalSignals = await db.tradeSignal.count();
      const pendingSignals = await db.tradeSignal.count({ where: { status: 'PENDING' } });
      const successSignals = await db.tradeSignal.count({ where: { status: 'SUCCESS' } });
      const lastRun = await db.analysisRun.findFirst({ orderBy: { startedAt: 'desc' } });
      
      return Response.json({
        status: 'running',
        schedule: 'Daily at 10:00 AM IST',
        database: { totalStocks, stocksWithData, totalCandles },
        signals: { total: totalSignals, pending: pendingSignals, success: successSignals },
        lastRun: lastRun ? {
          status: lastRun.status,
          startedAt: lastRun.startedAt,
          completedAt: lastRun.completedAt,
          signalsGenerated: lastRun.signalsGenerated,
        } : null,
      }, { headers });
    }
    
    return Response.json({ error: 'Not found' }, { status: 404, headers });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500, headers });
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('\n========================================');
  console.log('🤖 TRADING AUTOMATION SERVICE');
  console.log('========================================');
  console.log(`🚀 Port: ${CONFIG.PORT}`);
  console.log(`⏰ Schedule: Daily at 10:00 AM IST`);
  console.log(`🌍 Timezone: Asia/Kolkata (IST)`);
  console.log('========================================');
  
  // Schedule daily 10 AM automation
  scheduleDaily10AM();
  
  // Start HTTP server
  const server = Bun.serve({
    port: CONFIG.PORT,
    fetch: handleRequest,
  });
  
  console.log(`\n✅ Automation Service running at http://localhost:${CONFIG.PORT}`);
  console.log('\n📡 API Endpoints:');
  console.log('   POST /api/run-now   - Manually trigger full automation');
  console.log('   GET  /api/status    - Service status');
  console.log('   GET  /health        - Health check');
  console.log('');
}

main();
