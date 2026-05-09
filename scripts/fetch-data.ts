/**
 * Yahoo Finance Data Fetcher for Nifty 500 Stocks
 * 
 * FREE DATA SOURCE - NO API KEY REQUIRED
 * 
 * This script fetches 2 years of historical data for Nifty 500 stocks
 * using Yahoo Finance's free API.
 * 
 * Usage: bun run scripts/fetch-data.ts
 */

import { db } from '../src/lib/db';
import { NIFTY_500_SYMBOLS, getYahooSymbol, NIFTY_500_LIST } from '../src/lib/trading/nifty500';

// ============================================
// YAHOO FINANCE API (FREE - NO API KEY)
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

// Fetch with retry and rate limiting
async function fetchWithRetry(url: string, retries = 3): Promise<Response | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      
      if (response.ok) return response;
      
      // Rate limited - wait longer
      if (response.status === 429) {
        console.log('  ⚠️ Rate limited, waiting 10 seconds...');
        await new Promise(r => setTimeout(r, 10000));
        continue;
      }
      
      // Other error
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    } catch (error) {
      console.log(`  ⚠️ Network error, retry ${i + 1}/${retries}`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  return null;
}

// Fetch historical data from Yahoo Finance
async function fetchHistoricalData(
  symbol: string,
  years: number = 2
): Promise<YahooCandle[]> {
  const yahooSymbol = getYahooSymbol(symbol);
  
  const endDate = Math.floor(Date.now() / 1000);
  const startDate = Math.floor((Date.now() - years * 365 * 24 * 60 * 60 * 1000) / 1000);
  
  const url = `${YAHOO_FINANCE_BASE}/v8/finance/chart/${yahooSymbol}?period1=${startDate}&period2=${endDate}&interval=1d&includePrePost=false`;
  
  const response = await fetchWithRetry(url);
  
  if (!response) {
    return [];
  }
  
  try {
    const data = await response.json();
    
    if (!data.chart?.result?.[0]) {
      console.log(`  ⚠️ No data for ${symbol}`);
      return [];
    }
    
    const result = data.chart.result[0];
    const quotes = result.indicators?.quote?.[0];
    const timestamps = result.timestamp;
    
    if (!quotes || !timestamps) {
      return [];
    }
    
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
  } catch (error) {
    console.log(`  ⚠️ Parse error for ${symbol}`);
    return [];
  }
}

// Ensure stock exists in database
async function ensureStockExists(symbol: string): Promise<string> {
  let stock = await db.stock.findUnique({
    where: { symbol },
  });
  
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

// Save candles to database
async function saveCandles(stockId: string, candles: YahooCandle[]): Promise<number> {
  if (candles.length === 0) return 0;
  
  let saved = 0;
  const batchSize = 100;
  
  for (let i = 0; i < candles.length; i += batchSize) {
    const batch = candles.slice(i, i + batchSize);
    
    for (const candle of batch) {
      try {
        await db.dailyCandle.upsert({
          where: {
            stockId_date: {
              stockId,
              date: new Date(candle.date),
            },
          },
          update: {
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
          },
          create: {
            stockId,
            date: new Date(candle.date),
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
          },
        });
        saved++;
      } catch (error) {
        // Skip duplicate
      }
    }
  }
  
  return saved;
}

// ============================================
// MAIN SYNC FUNCTION
// ============================================

async function syncStockData(
  symbols: string[] = NIFTY_500_LIST,
  years: number = 2,
  batchSize: number = 5
) {
  console.log('\n========================================');
  console.log('📊 YAHOO FINANCE DATA FETCHER');
  console.log('🆓 FREE - NO API KEY REQUIRED');
  console.log('========================================\n');
  
  console.log(`📋 Total stocks to fetch: ${symbols.length}`);
  console.log(`📅 Data period: ${years} years`);
  console.log(`📦 Batch size: ${batchSize} stocks\n`);
  
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - years);
  
  let stocksUpdated = 0;
  let totalCandles = 0;
  let failed = 0;
  
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(symbols.length / batchSize);
    
    console.log(`\n📦 Batch ${batchNum}/${totalBatches}`);
    console.log(`   Progress: ${i}/${symbols.length} stocks\n`);
    
    for (const symbol of batch) {
      process.stdout.write(`   📈 ${symbol.padEnd(12)} ... `);
      
      try {
        // Ensure stock exists
        const stockId = await ensureStockExists(symbol);
        
        // Fetch data
        const candles = await fetchHistoricalData(symbol, years);
        
        if (candles.length === 0) {
          console.log('❌ No data');
          failed++;
          continue;
        }
        
        // Save to database
        const saved = await saveCandles(stockId, candles);
        
        if (saved > 0) {
          stocksUpdated++;
          totalCandles += saved;
          console.log(`✅ ${saved} candles (${candles.length > 0 ? new Date(candles[0].date).toLocaleDateString() : 'N/A'} - ${candles.length > 0 ? new Date(candles[candles.length - 1].date).toLocaleDateString() : 'N/A'})`);
        } else {
          console.log('⚠️ Already up to date');
        }
        
        // Rate limiting - small delay between stocks
        await new Promise(r => setTimeout(r, 300));
        
      } catch (error) {
        console.log('❌ Error:', error instanceof Error ? error.message : 'Unknown');
        failed++;
      }
    }
    
    // Longer delay between batches
    if (i + batchSize < symbols.length) {
      console.log(`\n   ⏳ Waiting 2 seconds before next batch...`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  
  // Summary
  console.log('\n========================================');
  console.log('📊 SYNC COMPLETE');
  console.log('========================================');
  console.log(`✅ Stocks updated: ${stocksUpdated}`);
  console.log(`📈 Total candles saved: ${totalCandles}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Date range: ${startDate.toLocaleDateString()} - ${new Date().toLocaleDateString()}`);
  console.log('========================================\n');
  
  return {
    success: true,
    stocksUpdated,
    totalCandles,
    failed,
  };
}

// Run the sync
async function main() {
  try {
    // First, test with top 20 stocks
    const TOP_20 = [
      'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
      'HINDUNILVR', 'SBIN', 'BHARTIARTL', 'ITC', 'KOTAKBANK',
      'LT', 'AXISBANK', 'ASIANPAINT', 'MARUTI', 'SUNPHARMA',
      'TITAN', 'BAJFINANCE', 'WIPRO', 'HCLTECH', 'TATAMOTORS'
    ];
    
    console.log('🚀 Starting with TOP 20 stocks for testing...\n');
    
    // Fetch top 20 first
    await syncStockData(TOP_20, 2, 5);
    
    // Ask to continue with all stocks
    console.log('\n✅ Top 20 stocks fetched successfully!');
    console.log('💡 To fetch ALL stocks, run: bun run scripts/fetch-all.ts\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
