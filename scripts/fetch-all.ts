/**
 * Fetch ALL Nifty 500 Stocks Data
 * 
 * Usage: bun run scripts/fetch-all.ts
 */

import { db } from '../src/lib/db';
import { NIFTY_500_SYMBOLS, getYahooSymbol, NIFTY_500_LIST } from '../src/lib/trading/nifty500';

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
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
      });
      
      if (response.ok) return response;
      
      if (response.status === 429) {
        console.log('  ⚠️ Rate limited, waiting 15 seconds...');
        await new Promise(r => setTimeout(r, 15000));
        continue;
      }
      
      await new Promise(r => setTimeout(r, 3000 * (i + 1)));
    } catch (error) {
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  return null;
}

async function fetchHistoricalData(symbol: string, years: number = 2): Promise<YahooCandle[]> {
  const yahooSymbol = getYahooSymbol(symbol);
  const endDate = Math.floor(Date.now() / 1000);
  const startDate = Math.floor((Date.now() - years * 365 * 24 * 60 * 60 * 1000) / 1000);
  
  const url = `${YAHOO_FINANCE_BASE}/v8/finance/chart/${yahooSymbol}?period1=${startDate}&period2=${endDate}&interval=1d&includePrePost=false`;
  
  const response = await fetchWithRetry(url);
  if (!response) return [];
  
  try {
    const data = await response.json();
    if (!data.chart?.result?.[0]) return [];
    
    const result = data.chart.result[0];
    const quotes = result.indicators?.quote?.[0];
    const timestamps = result.timestamp;
    
    if (!quotes || !timestamps) return [];
    
    const candles: YahooCandle[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (quotes.open[i] !== null && quotes.close[i] !== null) {
        candles.push({
          date: timestamps[i] * 1000,
          open: quotes.open[i],
          high: quotes.high[i],
          low: quotes.low[i],
          close: quotes.close[i],
          volume: quotes.volume[i] || 0,
        });
      }
    }
    return candles;
  } catch {
    return [];
  }
}

async function ensureStockExists(symbol: string): Promise<string> {
  let stock = await db.stock.findUnique({ where: { symbol } });
  
  if (!stock) {
    const info = NIFTY_500_SYMBOLS[symbol];
    stock = await db.stock.create({
      data: {
        symbol,
        name: info?.name || symbol,
        sector: info?.sector || 'UNKNOWN',
        yahooSymbol: getYahooSymbol(symbol),
        isActive: true,
      },
    });
  }
  return stock.id;
}

async function saveCandles(stockId: string, candles: YahooCandle[]): Promise<number> {
  if (candles.length === 0) return 0;
  
  let saved = 0;
  for (const candle of candles) {
    try {
      await db.dailyCandle.upsert({
        where: { stockId_date: { stockId, date: new Date(candle.date) } },
        update: { open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: candle.volume },
        create: { stockId, date: new Date(candle.date), open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: candle.volume },
      });
      saved++;
    } catch {}
  }
  return saved;
}

async function main() {
  console.log('\n========================================');
  console.log('📊 FETCHING ALL NIFTY 500 STOCKS');
  console.log('🆓 YAHOO FINANCE - FREE DATA');
  console.log('========================================\n');
  
  const symbols = NIFTY_500_LIST;
  const batchSize = 3; // Smaller batch to avoid rate limits
  
  let stocksUpdated = 0;
  let totalCandles = 0;
  let failed = 0;
  
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const progress = Math.min(i + batchSize, symbols.length);
    
    console.log(`\n📦 Progress: ${progress}/${symbols.length} (${Math.round(progress/symbols.length*100)}%)`);
    
    for (const symbol of batch) {
      process.stdout.write(`   📈 ${symbol.padEnd(12)} ... `);
      
      try {
        const stockId = await ensureStockExists(symbol);
        const candles = await fetchHistoricalData(symbol, 2);
        
        if (candles.length === 0) {
          console.log('❌ No data');
          failed++;
          continue;
        }
        
        const saved = await saveCandles(stockId, candles);
        stocksUpdated++;
        totalCandles += saved;
        console.log(`✅ ${saved} candles`);
        
        await new Promise(r => setTimeout(r, 500));
      } catch (error) {
        console.log('❌ Error');
        failed++;
      }
    }
    
    // Delay between batches
    if (i + batchSize < symbols.length) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  
  console.log('\n========================================');
  console.log('✅ SYNC COMPLETE');
  console.log(`📊 Stocks: ${stocksUpdated}/${symbols.length}`);
  console.log(`📈 Candles: ${totalCandles}`);
  console.log(`❌ Failed: ${failed}`);
  console.log('========================================\n');
  
  process.exit(0);
}

main();
