/**
 * Quick Data Fetcher - Fetch data for specific stocks
 */

import { db } from '../src/lib/db';
import { NIFTY_500_SYMBOLS, getYahooSymbol } from '../src/lib/trading/nifty500';

const YAHOO_FINANCE_BASE = 'https://query1.finance.yahoo.com';

interface YahooCandle {
  date: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function fetchHistoricalData(symbol: string, years: number = 2): Promise<YahooCandle[]> {
  const yahooSymbol = getYahooSymbol(symbol);
  const endDate = Math.floor(Date.now() / 1000);
  const startDate = Math.floor((Date.now() - years * 365 * 24 * 60 * 60 * 1000) / 1000);
  
  const url = `${YAHOO_FINANCE_BASE}/v8/finance/chart/${yahooSymbol}?period1=${startDate}&period2=${endDate}&interval=1d`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    if (!response.ok) return [];
    
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
  // Get stocks that don't have data yet
  const stocksNeedingData = await db.stock.findMany({
    where: {
      dailyCandles: { none: {} },
      isActive: true,
    },
    select: { symbol: true },
  });
  
  const symbolsToFetch = stocksNeedingData.map(s => s.symbol);
  
  console.log(`\n📊 Fetching data for ${symbolsToFetch.length} stocks without data...\n`);
  
  let fetched = 0;
  let failed = 0;
  let totalCandles = 0;
  
  // Process 5 at a time
  for (let i = 0; i < symbolsToFetch.length; i += 5) {
    const batch = symbolsToFetch.slice(i, 5);
    
    for (const symbol of batch) {
      process.stdout.write(`📈 ${symbol} ... `);
      
      try {
        const stockId = await ensureStockExists(symbol);
        const candles = await fetchHistoricalData(symbol, 2);
        
        if (candles.length === 0) {
          console.log('❌ No data');
          failed++;
          continue;
        }
        
        const saved = await saveCandles(stockId, candles);
        fetched++;
        totalCandles += saved;
        console.log(`✅ ${saved} candles`);
        
        await new Promise(r => setTimeout(r, 300));
      } catch (error) {
        console.log('❌ Error');
        failed++;
      }
      
      // Only process first 10 to avoid timeout
      if (fetched >= 10) {
        console.log('\n✅ Batch complete. Run again for more data.');
        break;
      }
    }
    
    if (fetched >= 10) break;
  }
  
  // Show final stats
  const totalStocksWithData = await db.stock.count({
    where: { dailyCandles: { some: {} } },
  });
  const totalCandlesInDb = await db.dailyCandle.count();
  
  console.log('\n========================================');
  console.log('📊 STATUS');
  console.log(`✅ Stocks with data: ${totalStocksWithData}`);
  console.log(`📈 Total candles: ${totalCandlesInDb}`);
  console.log('========================================\n');
  
  process.exit(0);
}

main();
