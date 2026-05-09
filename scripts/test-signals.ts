/**
 * Test Signal Generation with Real Data
 */

import { db } from '../src/lib/db';
import { analyzeStock, scanForSignals } from '../src/lib/trading/analysis-engine-llm';

async function main() {
  console.log('\n========================================');
  console.log('📊 SIGNAL GENERATION TEST');
  console.log('========================================\n');
  
  // Get stocks with data
  const stocksWithData = await db.stock.findMany({
    where: { dailyCandles: { some: {} } },
    select: { symbol: true, name: true, sector: true, _count: { select: { dailyCandles: true } } },
    take: 20,
  });
  
  console.log(`📋 Stocks with data: ${stocksWithData.length}`);
  console.log(`📊 Stock details:`);
  
  for (const stock of stocksWithData.slice(0, 10)) {
    console.log(`   ${stock.symbol} (${stock._count.dailyCandles} candles) - ${stock.name}`);
  }
  
  console.log('\n📈 Testing signal generation...\n');
  
  // Test with a few stocks
  const testSymbols = stocksWithData.slice(0, 5).map(s => s.symbol);
  
  for (const symbol of testSymbols) {
    process.stdout.write(`📊 Analyzing ${symbol}... `);
    
    try {
      const analysis = await analyzeStock(symbol);
      
      if (!analysis) {
        console.log('❌ Insufficient data (< 200 candles)');
        continue;
      }
      
      console.log(`✅ ${analysis.trend} | RSI: ${analysis.indicators.rsi.toFixed(1)} | ADX: ${analysis.indicators.adx.toFixed(1)} | Confidence: ${analysis.confidence}%`);
      
      if (analysis.setup) {
        console.log(`   🎯 SIGNAL: ${analysis.setup.direction} @ ${analysis.setup.entryPrice}`);
        console.log(`   📌 SL: ${analysis.setup.stopLoss} | Target: ${analysis.setup.targetPrice}`);
        console.log(`   📈 R:R: ${analysis.setup.riskReward}`);
      }
    } catch (error) {
      console.log('❌ Error:', error instanceof Error ? error.message : 'Unknown');
    }
  }
  
  // Try scanning for signals
  console.log('\n🔍 Scanning for high-confidence signals (80%+)...\n');
  
  try {
    const signals = await scanForSignals(testSymbols, 70); // Lower threshold for testing
    console.log(`📊 Found ${signals.length} potential signals`);
    
    for (const signal of signals.slice(0, 5)) {
      console.log(`   ${signal.symbol}: ${signal.setup.direction} @ ${signal.setup.entryPrice} (${signal.setup.confidence}% confidence)`);
    }
  } catch (error) {
    console.log('❌ Scan error:', error instanceof Error ? error.message : 'Unknown');
  }
  
  // Stats
  const totalCandles = await db.dailyCandle.count();
  const totalStocks = await db.stock.count({ where: { dailyCandles: { some: {} } } });
  
  console.log('\n========================================');
  console.log('📊 DATABASE STATS');
  console.log(`📈 Stocks with data: ${totalStocks}`);
  console.log(`📊 Total candles: ${totalCandles}`);
  console.log('========================================\n');
  
  process.exit(0);
}

main();
