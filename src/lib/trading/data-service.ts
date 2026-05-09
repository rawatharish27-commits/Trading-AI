/**
 * Data Fetching Service
 * Fetches stock data from Yahoo Finance API
 * No dependency on Angel One for data
 */

import { db } from '@/lib/db';
import { getYahooSymbol, NIFTY_500_SYMBOLS, NIFTY_500_LIST } from './nifty500';

// Types
interface YahooCandle {
  date: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface YahooQuote {
  symbol: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketOpen: number;
  regularMarketDayHigh: number;
  regularMarketDayLow: number;
  regularMarketVolume: number;
  previousClose: number;
}

// ============================================
// YAHOO FINANCE API HELPERS
// ============================================

const YAHOO_FINANCE_BASE = 'https://query1.finance.yahoo.com';

// Custom fetch with retry logic
async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      if (response.ok) return response;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    } catch {
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries} retries`);
}

// Get historical data from Yahoo Finance
export async function fetchHistoricalData(
  symbol: string,
  startDate: Date,
  endDate: Date,
  interval: '1d' | '1h' = '1d'
): Promise<YahooCandle[]> {
  const yahooSymbol = getYahooSymbol(symbol);
  const startTimestamp = Math.floor(startDate.getTime() / 1000);
  const endTimestamp = Math.floor(endDate.getTime() / 1000);
  
  const url = `${YAHOO_FINANCE_BASE}/v8/finance/chart/${yahooSymbol}?period1=${startTimestamp}&period2=${endTimestamp}&interval=${interval}&includePrePost=false`;
  
  try {
    const response = await fetchWithRetry(url);
    const data = await response.json();
    
    if (!data.chart?.result?.[0]) {
      console.warn(`No data found for ${symbol}`);
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
    console.error(`Error fetching data for ${symbol}:`, error);
    return [];
  }
}

// Get latest quote from Yahoo Finance
export async function fetchLatestQuote(symbol: string): Promise<YahooQuote | null> {
  const yahooSymbol = getYahooSymbol(symbol);
  const url = `${YAHOO_FINANCE_BASE}/v7/finance/quote?symbols=${yahooSymbol}`;
  
  try {
    const response = await fetchWithRetry(url);
    const data = await response.json();
    
    if (!data.quoteResponse?.result?.[0]) {
      return null;
    }
    
    const quote = data.quoteResponse.result[0];
    
    return {
      symbol,
      regularMarketPrice: quote.regularMarketPrice || 0,
      regularMarketChange: quote.regularMarketChange || 0,
      regularMarketChangePercent: quote.regularMarketChangePercent || 0,
      regularMarketOpen: quote.regularMarketOpen || 0,
      regularMarketDayHigh: quote.regularMarketDayHigh || 0,
      regularMarketDayLow: quote.regularMarketDayLow || 0,
      regularMarketVolume: quote.regularMarketVolume || 0,
      previousClose: quote.regularMarketPreviousClose || 0,
    };
  } catch (error) {
    console.error(`Error fetching quote for ${symbol}:`, error);
    return null;
  }
}

// Batch fetch quotes
export async function fetchBatchQuotes(symbols: string[]): Promise<Record<string, YahooQuote>> {
  const quotes: Record<string, YahooQuote> = {};
  
  // Process in batches of 10 to avoid rate limiting
  const batchSize = 10;
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const yahooSymbols = batch.map(s => getYahooSymbol(s));
    
    const url = `${YAHOO_FINANCE_BASE}/v7/finance/quote?symbols=${yahooSymbols.join(',')}`;
    
    try {
      const response = await fetchWithRetry(url);
      const data = await response.json();
      
      if (data.quoteResponse?.result) {
        for (const quote of data.quoteResponse.result) {
          const originalSymbol = batch.find(
            s => getYahooSymbol(s) === quote.symbol
          );
          if (originalSymbol) {
            quotes[originalSymbol] = {
              symbol: originalSymbol,
              regularMarketPrice: quote.regularMarketPrice || 0,
              regularMarketChange: quote.regularMarketChange || 0,
              regularMarketChangePercent: quote.regularMarketChangePercent || 0,
              regularMarketOpen: quote.regularMarketOpen || 0,
              regularMarketDayHigh: quote.regularMarketDayHigh || 0,
              regularMarketDayLow: quote.regularMarketDayLow || 0,
              regularMarketVolume: quote.regularMarketVolume || 0,
              previousClose: quote.regularMarketPreviousClose || 0,
            };
          }
        }
      }
      
      // Rate limiting delay
      if (i + batchSize < symbols.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (error) {
      console.error('Error fetching batch quotes:', error);
    }
  }
  
  return quotes;
}

// ============================================
// DATABASE OPERATIONS
// ============================================

// Check last data session
export async function getLastDataSession(timeframe: string): Promise<Date | null> {
  const session = await db.dataSession.findFirst({
    where: { timeframe },
    orderBy: { lastDate: 'desc' },
  });
  return session?.lastDate || null;
}

// Update data session
export async function updateDataSession(
  timeframe: string,
  lastDate: Date,
  stocksUpdated: number,
  status: string,
  error?: string
) {
  await db.dataSession.create({
    data: {
      timeframe,
      lastDate,
      stocksUpdated,
      status,
      error,
    },
  });
}

// Ensure stock exists in database
export async function ensureStockExists(symbol: string): Promise<string> {
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

// Save daily candles to database
export async function saveDailyCandles(
  stockId: string,
  candles: YahooCandle[]
): Promise<number> {
  if (candles.length === 0) return 0;
  
  let saved = 0;
  for (const candle of candles) {
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
      console.error('Error saving candle:', error);
    }
  }
  
  return saved;
}

// Save hourly candles to database
export async function saveHourlyCandles(
  stockId: string,
  candles: YahooCandle[]
): Promise<number> {
  if (candles.length === 0) return 0;
  
  let saved = 0;
  for (const candle of candles) {
    try {
      await db.hourlyCandle.upsert({
        where: {
          stockId_timestamp: {
            stockId,
            timestamp: new Date(candle.date),
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
          timestamp: new Date(candle.date),
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
        },
      });
      saved++;
    } catch (error) {
      console.error('Error saving hourly candle:', error);
    }
  }
  
  return saved;
}

// ============================================
// MAIN DATA SYNC FUNCTIONS
// ============================================

export interface DataSyncResult {
  success: boolean;
  stocksUpdated: number;
  candlesSaved: number;
  error?: string;
  startDate: Date;
  endDate: Date;
}

// Sync historical data for all stocks
export async function syncHistoricalData(
  years: number = 2,
  symbols?: string[]
): Promise<DataSyncResult> {
  const targetSymbols = symbols || NIFTY_500_LIST;
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - years);
  
  let stocksUpdated = 0;
  let totalCandles = 0;
  
  try {
    // Check last session
    const lastSession = await getLastDataSession('DAILY');
    const fetchFrom = lastSession ? new Date(lastSession) : startDate;
    
    console.log(`Starting data sync from ${fetchFrom.toDateString()} to ${endDate.toDateString()}`);
    
    // Process stocks in batches
    const batchSize = 5;
    for (let i = 0; i < targetSymbols.length; i += batchSize) {
      const batch = targetSymbols.slice(i, i + batchSize);
      
      for (const symbol of batch) {
        try {
          const stockId = await ensureStockExists(symbol);
          
          // Fetch daily data
          const dailyCandles = await fetchHistoricalData(symbol, fetchFrom, endDate, '1d');
          const savedDaily = await saveDailyCandles(stockId, dailyCandles);
          
          if (savedDaily > 0) {
            stocksUpdated++;
            totalCandles += savedDaily;
          }
          
          // Small delay between stocks
          await new Promise(r => setTimeout(r, 200));
        } catch (error) {
          console.error(`Error processing ${symbol}:`, error);
        }
      }
      
      // Delay between batches
      if (i + batchSize < targetSymbols.length) {
        await new Promise(r => setTimeout(r, 1000));
      }
      
      console.log(`Progress: ${Math.min(i + batchSize, targetSymbols.length)}/${targetSymbols.length} stocks processed`);
    }
    
    // Update session
    await updateDataSession('DAILY', endDate, stocksUpdated, 'COMPLETED');
    
    return {
      success: true,
      stocksUpdated,
      candlesSaved: totalCandles,
      startDate: fetchFrom,
      endDate,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await updateDataSession('DAILY', endDate, stocksUpdated, 'FAILED', errorMessage);
    
    return {
      success: false,
      stocksUpdated,
      candlesSaved: totalCandles,
      error: errorMessage,
      startDate: fetchFrom,
      endDate,
    };
  }
}

// Verify if database is up to date
export async function verifyDataStatus(): Promise<{
  isUpToDate: boolean;
  lastSessionDate: Date | null;
  totalStocks: number;
  stocksWithData: number;
  oldestDataDate: Date | null;
  newestDataDate: Date | null;
}> {
  const lastSession = await getLastDataSession('DAILY');
  
  const totalStocks = await db.stock.count();
  const stocksWithData = await db.stock.count({
    where: {
      dailyCandles: {
        some: {},
      },
    },
  });
  
  // Get oldest and newest dates
  const oldestCandle = await db.dailyCandle.findFirst({
    orderBy: { date: 'asc' },
  });
  
  const newestCandle = await db.dailyCandle.findFirst({
    orderBy: { date: 'desc' },
  });
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const lastSessionDate = lastSession ? new Date(lastSession) : null;
  
  // Check if data is from last trading day
  const isUpToDate = lastSessionDate ? 
    (today.getTime() - lastSessionDate.getTime()) < 3 * 24 * 60 * 60 * 1000 : // Within 3 days
    false;
  
  return {
    isUpToDate,
    lastSessionDate,
    totalStocks,
    stocksWithData,
    oldestDataDate: oldestCandle?.date || null,
    newestDataDate: newestCandle?.date || null,
  };
}

// Get candles for a stock
export async function getStockCandles(
  symbol: string,
  startDate?: Date,
  endDate?: Date,
  limit: number = 500
) {
  const stock = await db.stock.findUnique({
    where: { symbol },
  });
  
  if (!stock) return [];
  
  const candles = await db.dailyCandle.findMany({
    where: {
      stockId: stock.id,
      ...(startDate && { date: { gte: startDate } }),
      ...(endDate && { date: { lte: endDate } }),
    },
    orderBy: { date: 'asc' },
    take: limit,
  });
  
  return candles;
}

// Initialize stocks in database
export async function initializeStocks(): Promise<number> {
  let count = 0;
  
  for (const symbol of NIFTY_500_LIST) {
    try {
      const info = NIFTY_500_SYMBOLS[symbol];
      await db.stock.upsert({
        where: { symbol },
        update: {
          name: info?.name || symbol,
          sector: info?.sector || 'UNKNOWN',
          yahooSymbol: getYahooSymbol(symbol),
        },
        create: {
          symbol,
          name: info?.name || symbol,
          sector: info?.sector || 'UNKNOWN',
          yahooSymbol: getYahooSymbol(symbol),
          isActive: true,
        },
      });
      count++;
    } catch (error) {
      console.error(`Error initializing ${symbol}:`, error);
    }
  }
  
  return count;
}
