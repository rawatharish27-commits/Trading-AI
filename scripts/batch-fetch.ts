/**
 * Batch Data Fetcher - Fetches data in small batches
 * Run: bun run scripts/batch-fetch.ts
 */

import { db } from '../src/lib/db';
import { NIFTY_500_SYMBOLS, getYahooSymbol, NIFTY_500_LIST } from '../src/lib/trading/nifty500';

const YAHOO_FINANCE_BASE = 'https://query1.finance.yahoo.com';

async function fetchHistoricalData(symbol: string, years: number = 2) {
  const yahooSymbol = getYahooSymbol(symbol);
  const endDate = Math.floor(Date.now() / 1000);
  const startDate = Math.floor((Date.now() - years * 365 * 24 * 60 * 60 * 1000) / 1000);
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

async function main() {
  // Get stocks without data
  const stocksNeedingData = await db.stock.findMany({
    where: { dailyCandles: { none: {} }, isActive: true },
    select: { symbol: true },
    take: 30,
  });
  
  if (stocksNeedingData.length === 0) {
    console.log('✅ All stocks have data!');
    process.exit(0);
  }
  
  console.log(`\n📊 Fetching data for ${stocksNeedingData.length} stocks...\n`);
  
  for (const { symbol } of stocksNeedingData) {
    process.stdout.write(`📈 ${symbol.padEnd(12)} ... `);
    
    try {
      const info = NIFTY_500_SYMBOLS[symbol];
      const stock = await db.stock.upsert({
        where: { symbol },
        update: { name: info?.name || symbol, sector: info?.sector || 'UNKNOWN', yahooSymbol: getYahooSymbol(symbol) },
        create: { symbol, name: info?.name || symbol, sector: info?.sector || 'UNKNOWN', yahooSymbol: getYahooSymbol(symbol), isActive: true },
      });
      
      const candles = await fetchHistoricalData(symbol, 2);
      if (candles.length === 0) { console.log('❌ No data'); continue; }
      
      let saved = 0;
      for (const c of candles) {
        try {
          await db.dailyCandle.upsert({
            where: { stockId_date: { stockId: stock.id, date: new Date(c.date) } },
            update: { open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume },
            create: { stockId: stock.id, date: new Date(c.date), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume },
          });
          saved++;
        } catch {}
      }
      console.log(`✅ ${saved} candles`);
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      console.log('❌ Error');
    }
  }
  
  const totalStocks = await db.stock.count({ where: { dailyCandles: { some: {} } } });
  const totalCandles = await db.dailyCandle.count();
  console.log(`\n📊 Total: ${totalStocks} stocks, ${totalCandles} candles\n`);
  process.exit(0);
}

main();
