/**
 * Daily Automation Script
 * Runs once daily at 10 AM IST
 * 
 * Tasks:
 * 1. Update data for all stocks (incremental - only new days)
 * 2. Generate signals with 80%+ confidence
 * 3. Track existing signals (5-day holding)
 * 4. Update learning system
 */

import { db } from '../src/lib/db';
import { getYahooSymbol, NIFTY_500_LIST } from '../src/lib/trading/nifty500';
import { analyzeStock, saveSignal } from '../src/lib/trading/analysis-engine-llm';

const YAHOO_FINANCE_BASE = 'https://query1.finance.yahoo.com';

// ============================================
// LOGGING
// ============================================

interface LogEntry {
  timestamp: Date;
  level: 'INFO' | 'WARNING' | 'ERROR';
  category: string;
  message: string;
  details?: string;
}

const logs: LogEntry[] = [];

function log(level: LogEntry['level'], category: string, message: string, details?: string) {
  const entry: LogEntry = {
    timestamp: new Date(),
    level,
    category,
    message,
    details,
  };
  logs.push(entry);
  
  const icon = level === 'INFO' ? '✅' : level === 'WARNING' ? '⚠️' : '❌';
  console.log(`${icon} [${category}] ${message}`);
  if (details) console.log(`   ${details}`);
}

// ============================================
// DATA UPDATE (Incremental)
// ============================================

async function fetchLatestData(symbol: string, daysBack: number = 7): Promise<any[]> {
  const yahooSymbol = getYahooSymbol(symbol);
  const endDate = Math.floor(Date.now() / 1000);
  const startDate = Math.floor((Date.now() - daysBack * 24 * 60 * 60 * 1000) / 1000);
  const url = `${YAHOO_FINANCE_BASE}/v8/finance/chart/${yahooSymbol}?period1=${startDate}&period2=${endDate}&interval=1d`;
  
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.chart?.result?.[0]) return [];
    
    const q = data.chart.result[0].indicators?.quote?.[0];
    const ts = data.chart.result[0].timestamp;
    if (!q || !ts) return [];
    
    const candles = [];
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
  } catch { return []; }
}

async function updateStockData(): Promise<{ updated: number; newCandles: number }> {
  log('INFO', 'DATA', 'Starting incremental data update...');
  
  // Get all stocks that already have data
  const stocksWithData = await db.stock.findMany({
    where: { dailyCandles: { some: {} }, isActive: true },
    select: { id: true, symbol: true },
  });
  
  log('INFO', 'DATA', `Found ${stocksWithData.length} stocks to update`);
  
  let updated = 0;
  let newCandles = 0;
  
  // Process in batches of 10
  const batchSize = 10;
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
        
        // Fetch last 7 days to ensure we get any missing data
        const candles = await fetchLatestData(stock.symbol, 7);
        
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
          updated++;
        }
        
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 100));
      } catch (error) {
        log('WARNING', 'DATA', `Error updating ${stock.symbol}`, error instanceof Error ? error.message : 'Unknown');
      }
    }
    
    // Delay between batches
    if (i + batchSize < stocksWithData.length) {
      await new Promise(r => setTimeout(r, 500));
    }
    
    // Progress update
    if ((i + batchSize) % 50 === 0 || i + batchSize >= stocksWithData.length) {
      log('INFO', 'DATA', `Progress: ${Math.min(i + batchSize, stocksWithData.length)}/${stocksWithData.length}`);
    }
  }
  
  log('INFO', 'DATA', `Data update complete: ${updated} stocks updated, ${newCandles} new candles`);
  return { updated, newCandles };
}

// ============================================
// SIGNAL GENERATION
// ============================================

async function generateSignals(): Promise<{ generated: number; highConfidence: number }> {
  log('INFO', 'SIGNAL', 'Starting signal generation...');
  
  // Get stocks with sufficient data (200+ candles)
  const stocksWithData = await db.stock.findMany({
    where: { 
      isActive: true,
      dailyCandles: { some: {} }
    },
    select: { symbol: true, _count: { select: { dailyCandles: true } } },
  });
  
  const validStocks = stocksWithData.filter(s => s._count.dailyCandles >= 200);
  log('INFO', 'SIGNAL', `Found ${validStocks.length} stocks with sufficient data (200+ candles)`);
  
  let generated = 0;
  let highConfidence = 0;
  const signals: { symbol: string; direction: string; confidence: number }[] = [];
  
  // Analyze each stock (limit to top 50 for performance)
  const stocksToAnalyze = validStocks.slice(0, 50);
  
  for (const stock of stocksToAnalyze) {
    try {
      const analysis = await analyzeStock(stock.symbol);
      
      if (analysis && analysis.setup && analysis.setup.confidence >= 80) {
        // Save signal to database
        const signalId = await saveSignal(stock.symbol, analysis.setup, analysis);
        
        if (signalId) {
          generated++;
          highConfidence++;
          signals.push({
            symbol: stock.symbol,
            direction: analysis.setup.direction,
            confidence: analysis.setup.confidence,
          });
          log('INFO', 'SIGNAL', `New signal: ${stock.symbol} ${analysis.setup.direction} @ ${analysis.setup.entryPrice} (${analysis.setup.confidence}% confidence)`);
        }
      }
    } catch (error) {
      log('WARNING', 'SIGNAL', `Error analyzing ${stock.symbol}`, error instanceof Error ? error.message : 'Unknown');
    }
  }
  
  log('INFO', 'SIGNAL', `Signal generation complete: ${generated} signals, ${highConfidence} high confidence (80%+)`);
  return { generated, highConfidence };
}

// ============================================
// SIGNAL TRACKING (5-Day Holding)
// ============================================

async function trackSignals(): Promise<{ tracked: number; closed: number }> {
  log('INFO', 'TRACKING', 'Starting signal tracking...');
  
  // Get active signals (status PENDING or ACTIVE)
  const activeSignals = await db.tradeSignal.findMany({
    where: { 
      status: { in: ['PENDING', 'ACTIVE'] },
      generatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
    },
    include: {
      stock: { select: { symbol: true } },
      tracking: true,
    },
  });
  
  log('INFO', 'TRACKING', `Found ${activeSignals.length} active signals to track`);
  
  let tracked = 0;
  let closed = 0;
  
  for (const signal of activeSignals) {
    if (!signal.tracking) continue;
    
    try {
      // Get latest candle for this stock
      const stock = await db.stock.findUnique({
        where: { id: signal.stockId },
        include: {
          dailyCandles: {
            orderBy: { date: 'desc' },
            take: 1,
          },
        },
      });
      
      if (!stock || stock.dailyCandles.length === 0) continue;
      
      const latestCandle = stock.dailyCandles[0];
      const daysSinceSignal = Math.floor((Date.now() - signal.generatedAt.getTime()) / (24 * 60 * 60 * 1000));
      
      // Update tracking based on day
      const updateData: any = {};
      
      if (daysSinceSignal >= 1 && !signal.tracking.day1Close) {
        updateData.day1Date = latestCandle.date;
        updateData.day1High = latestCandle.high;
        updateData.day1Low = latestCandle.low;
        updateData.day1Close = latestCandle.close;
      }
      if (daysSinceSignal >= 2 && !signal.tracking.day2Close) {
        updateData.day2Date = latestCandle.date;
        updateData.day2High = latestCandle.high;
        updateData.day2Low = latestCandle.low;
        updateData.day2Close = latestCandle.close;
      }
      if (daysSinceSignal >= 3 && !signal.tracking.day3Close) {
        updateData.day3Date = latestCandle.date;
        updateData.day3High = latestCandle.high;
        updateData.day3Low = latestCandle.low;
        updateData.day3Close = latestCandle.close;
      }
      if (daysSinceSignal >= 4 && !signal.tracking.day4Close) {
        updateData.day4Date = latestCandle.date;
        updateData.day4High = latestCandle.high;
        updateData.day4Low = latestCandle.low;
        updateData.day4Close = latestCandle.close;
      }
      if (daysSinceSignal >= 5 && !signal.tracking.day5Close) {
        updateData.day5Date = latestCandle.date;
        updateData.day5High = latestCandle.high;
        updateData.day5Low = latestCandle.low;
        updateData.day5Close = latestCandle.close;
      }
      
      if (Object.keys(updateData).length > 0) {
        await db.signalTracking.update({
          where: { signalId: signal.id },
          data: updateData,
        });
        tracked++;
      }
      
      // Check if signal should be closed (5 days or target/stop hit)
      const currentPrice = latestCandle.close;
      const hitTarget = signal.signalType === 'BUY' 
        ? currentPrice >= signal.targetPrice 
        : currentPrice <= signal.targetPrice;
      const hitStopLoss = signal.signalType === 'BUY'
        ? currentPrice <= signal.stopLoss
        : currentPrice >= signal.stopLoss;
      
      if (daysSinceSignal >= 5 || hitTarget || hitStopLoss) {
        let finalResult = 'BREAKEVEN';
        const pnlPercent = ((currentPrice - signal.entryPrice) / signal.entryPrice) * 100;
        
        if (hitTarget || (signal.signalType === 'BUY' && pnlPercent > 2) || (signal.signalType === 'SELL' && pnlPercent < -2)) {
          finalResult = 'SUCCESS';
        } else if (hitStopLoss || (signal.signalType === 'BUY' && pnlPercent < -2) || (signal.signalType === 'SELL' && pnlPercent > 2)) {
          finalResult = 'LOSS';
        }
        
        await db.tradeSignal.update({
          where: { id: signal.id },
          data: {
            status: finalResult === 'SUCCESS' ? 'SUCCESS' : finalResult === 'LOSS' ? 'LOSS' : 'CANCELLED',
            closedAt: new Date(),
          },
        });
        
        await db.signalTracking.update({
          where: { signalId: signal.id },
          data: {
            finalResult,
            finalPnlPercent: pnlPercent,
          },
        });
        
        closed++;
        log('INFO', 'TRACKING', `Signal closed: ${stock.symbol} - ${finalResult} (${pnlPercent.toFixed(2)}%)`);
      }
    } catch (error) {
      log('WARNING', 'TRACKING', `Error tracking signal ${signal.id}`, error instanceof Error ? error.message : 'Unknown');
    }
  }
  
  log('INFO', 'TRACKING', `Tracking complete: ${tracked} updated, ${closed} closed`);
  return { tracked, closed };
}

// ============================================
// LEARNING SYSTEM UPDATE
// ============================================

async function updateLearning(): Promise<{ analyzed: number }> {
  log('INFO', 'LEARNING', 'Starting learning system update...');
  
  // Get closed signals that haven't been analyzed for learning
  const closedSignals = await db.tradeSignal.findMany({
    where: {
      status: { in: ['SUCCESS', 'LOSS'] },
      tracking: { analyzedForLearning: false },
    },
    include: {
      stock: { select: { symbol: true, sector: true } },
      tracking: true,
    },
  });
  
  log('INFO', 'LEARNING', `Found ${closedSignals.length} signals to analyze`);
  
  let analyzed = 0;
  
  for (const signal of closedSignals) {
    if (!signal.tracking) continue;
    
    try {
      // Create learning record
      await db.learningRecord.create({
        data: {
          signalId: signal.id,
          setupType: signal.regime || 'UNKNOWN',
          trendDirection: signal.trendDirection,
          regime: signal.regime,
          sector: signal.stock.sector,
          result: signal.tracking.finalResult || 'BREAKEVEN',
          pnlPercent: signal.tracking.finalPnlPercent,
          maxDrawdown: signal.tracking.maxLoss,
          maxProfit: signal.tracking.maxProfit,
          whatWorked: signal.tracking.finalResult === 'SUCCESS' ? 'Setup matched market conditions' : undefined,
          whatFailed: signal.tracking.finalResult === 'LOSS' ? 'Market conditions changed' : undefined,
        },
      });
      
      // Mark as analyzed
      await db.signalTracking.update({
        where: { signalId: signal.id },
        data: { analyzedForLearning: true },
      });
      
      analyzed++;
    } catch (error) {
      log('WARNING', 'LEARNING', `Error analyzing signal ${signal.id}`, error instanceof Error ? error.message : 'Unknown');
    }
  }
  
  // Update strategy performance
  const strategyPerf = await db.strategyPerformance.upsert({
    where: { strategyName: 'LLM_CONFLUENCE_80' },
    update: {},
    create: {
      strategyName: 'LLM_CONFLUENCE_80',
      description: 'LLM-enhanced confluence strategy with 80%+ confidence threshold',
    },
  });
  
  // Calculate stats
  const allSignals = await db.tradeSignal.findMany({
    where: { status: { in: ['SUCCESS', 'LOSS', 'BREAKEVEN'] } },
  });
  
  const successCount = allSignals.filter(s => s.status === 'SUCCESS').length;
  const lossCount = allSignals.filter(s => s.status === 'LOSS').length;
  const total = allSignals.length;
  
  await db.strategyPerformance.update({
    where: { id: strategyPerf.id },
    data: {
      totalSignals: total,
      successCount,
      lossCount,
      successRate: total > 0 ? (successCount / total) * 100 : 0,
      lastLearnedAt: new Date(),
    },
  });
  
  log('INFO', 'LEARNING', `Learning update complete: ${analyzed} signals analyzed`);
  log('INFO', 'LEARNING', `Strategy stats: ${successCount}/${total} success (${total > 0 ? ((successCount / total) * 100).toFixed(1) : 0}%)`);
  
  return { analyzed };
}

// ============================================
// SYSTEM LOG
// ============================================

async function saveLogs(runId: string) {
  for (const entry of logs) {
    try {
      await db.systemLog.create({
        data: {
          level: entry.level,
          category: entry.category,
          message: entry.message,
          details: entry.details,
        },
      });
    } catch {}
  }
}

// ============================================
// MAIN AUTOMATION
// ============================================

async function main() {
  const startTime = Date.now();
  const runId = `RUN_${Date.now()}`;
  
  console.log('\n========================================');
  console.log('🤖 TRADING AI - DAILY AUTOMATION');
  console.log(`📅 Started at: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
  console.log('========================================\n');
  
  log('INFO', 'SYSTEM', 'Starting daily automation run', runId);
  
  // Create analysis run record
  const analysisRun = await db.analysisRun.create({
    data: {
      type: 'FULL',
      status: 'RUNNING',
      timeframe: 'DAILY',
    },
  });
  
  try {
    // Step 1: Update Data
    console.log('\n📊 STEP 1: DATA UPDATE');
    console.log('------------------------');
    const dataResult = await updateStockData();
    
    // Step 2: Generate Signals
    console.log('\n🎯 STEP 2: SIGNAL GENERATION');
    console.log('-----------------------------');
    const signalResult = await generateSignals();
    
    // Step 3: Track Existing Signals
    console.log('\n📈 STEP 3: SIGNAL TRACKING');
    console.log('---------------------------');
    const trackingResult = await trackSignals();
    
    // Step 4: Update Learning System
    console.log('\n🧠 STEP 4: LEARNING UPDATE');
    console.log('---------------------------');
    const learningResult = await updateLearning();
    
    // Update analysis run
    const duration = Date.now() - startTime;
    await db.analysisRun.update({
      where: { id: analysisRun.id },
      data: {
        status: 'COMPLETED',
        stocksAnalyzed: dataResult.updated,
        signalsGenerated: signalResult.generated,
        highAccuracySignals: signalResult.highConfidence,
        completedAt: new Date(),
        durationMs: duration,
      },
    });
    
    // Summary
    console.log('\n========================================');
    console.log('📊 DAILY AUTOMATION SUMMARY');
    console.log('========================================');
    console.log(`✅ Data Updated: ${dataResult.updated} stocks, ${dataResult.newCandles} new candles`);
    console.log(`✅ Signals Generated: ${signalResult.generated} (${signalResult.highConfidence} high confidence)`);
    console.log(`✅ Signals Tracked: ${trackingResult.tracked} updated, ${trackingResult.closed} closed`);
    console.log(`✅ Learning Records: ${learningResult.analyzed} analyzed`);
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
    
    log('ERROR', 'SYSTEM', 'Daily automation failed', error instanceof Error ? error.message : 'Unknown');
  }
  
  // Save logs
  await saveLogs(runId);
  
  process.exit(0);
}

main();
