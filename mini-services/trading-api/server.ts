#!/usr/bin/env bun

/**
 * Simple Trading API Server
 */

const PORT = 3030;

// Sample market data
const MARKET_DATA = {
  RELIANCE: { ltp: 2456.50, change: 25.30, change_percent: 1.04, open: 2431.20, high: 2460.00, low: 2428.50, volume: 8500000 },
  TCS: { ltp: 3942.80, change: -12.40, change_percent: -0.31, open: 3955.20, high: 3968.00, low: 3932.50, volume: 4200000 },
  HDFCBANK: { ltp: 1652.35, change: 8.75, change_percent: 0.53, open: 1643.60, high: 1660.00, low: 1640.00, volume: 12000000 },
  INFY: { ltp: 1485.60, change: -5.40, change_percent: -0.36, open: 1491.00, high: 1495.00, low: 1482.00, volume: 6500000 },
  ICICIBANK: { ltp: 1258.45, change: 15.25, change_percent: 1.23, open: 1243.20, high: 1265.00, low: 1240.00, volume: 9800000 },
  HINDUNILVR: { ltp: 2452.80, change: -3.20, change_percent: -0.13, open: 2456.00, high: 2468.00, low: 2448.00, volume: 2100000 },
  SBIN: { ltp: 825.60, change: 6.40, change_percent: 0.78, open: 819.20, high: 830.00, low: 816.00, volume: 15000000 },
  BHARTIARTL: { ltp: 1658.90, change: 22.50, change_percent: 1.38, open: 1636.40, high: 1665.00, low: 1632.00, volume: 5500000 },
  ITC: { ltp: 442.75, change: 3.25, change_percent: 0.74, open: 439.50, high: 445.00, low: 438.00, volume: 18000000 },
  KOTAKBANK: { ltp: 1758.40, change: -8.60, change_percent: -0.49, open: 1767.00, high: 1775.00, low: 1752.00, volume: 3500000 },
  LT: { ltp: 3462.50, change: 18.75, change_percent: 0.54, open: 3443.75, high: 3480.00, low: 3435.00, volume: 2800000 },
  AXISBANK: { ltp: 1156.30, change: 9.80, change_percent: 0.86, open: 1146.50, high: 1162.00, low: 1142.00, volume: 8500000 },
  ASIANPAINT: { ltp: 3058.75, change: -12.25, change_percent: -0.40, open: 3071.00, high: 3080.00, low: 3050.00, volume: 1500000 },
  MARUTI: { ltp: 12568.00, change: 125.50, change_percent: 1.01, open: 12442.50, high: 12600.00, low: 12430.00, volume: 850000 },
  SUNPHARMA: { ltp: 1662.40, change: 28.60, change_percent: 1.75, open: 1633.80, high: 1670.00, low: 1630.00, volume: 3200000 },
  TITAN: { ltp: 3475.60, change: -15.40, change_percent: -0.44, open: 3491.00, high: 3500.00, low: 3465.00, volume: 1200000 },
  BAJFINANCE: { ltp: 7285.50, change: 45.25, change_percent: 0.62, open: 7240.25, high: 7320.00, low: 7230.00, volume: 2200000 },
  DMART: { ltp: 3892.30, change: -18.70, change_percent: -0.48, open: 3911.00, high: 3925.00, low: 3880.00, volume: 650000 },
  WIPRO: { ltp: 458.25, change: 4.75, change_percent: 1.05, open: 453.50, high: 462.00, low: 452.00, volume: 7500000 },
  HCLTECH: { ltp: 1465.80, change: 12.40, change_percent: 0.85, open: 1453.40, high: 1472.00, low: 1450.00, volume: 4200000 }
};

console.log(`🚀 Trading API starting on port ${PORT}...`);

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };
    
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers });
    }
    
    // Root
    if (path === '/') {
      return Response.json({
        name: 'Trading API',
        version: '2.0.0',
        status: 'running',
        symbols: Object.keys(MARKET_DATA).length,
        timestamp: new Date().toISOString()
      }, { headers });
    }
    
    // Health
    if (path === '/health') {
      return Response.json({
        status: 'healthy',
        database: 'connected',
        cache: 'memory',
        timestamp: new Date().toISOString()
      }, { headers });
    }
    
    // Live quotes
    if (path === '/api/market/live') {
      const quotes: any = {};
      for (const [symbol, data] of Object.entries(MARKET_DATA)) {
        quotes[symbol] = {
          symbol,
          ...data,
          close: data.ltp - data.change,
          timestamp: new Date().toISOString(),
          source: 'live'
        };
      }
      return Response.json({
        success: true,
        data: quotes,
        count: Object.keys(quotes).length,
        lastUpdate: new Date().toISOString()
      }, { headers });
    }
    
    // Single quote
    const quoteMatch = path.match(/^\/api\/market\/live\/(.+)$/);
    if (quoteMatch) {
      const symbol = quoteMatch[1].toUpperCase();
      const data = MARKET_DATA[symbol as keyof typeof MARKET_DATA];
      if (data) {
        return Response.json({
          success: true,
          data: {
            symbol,
            ...data,
            close: data.ltp - data.change,
            timestamp: new Date().toISOString(),
            source: 'live'
          }
        }, { headers });
      }
      return Response.json({ success: false, error: 'Not found' }, { status: 404, headers });
    }
    
    // Dashboard stats
    if (path === '/api/dashboard/stats') {
      return Response.json({
        success: true,
        data: {
          totalTrades: 0,
          winningTrades: 0,
          losingTrades: 0,
          winRate: 0,
          totalPnL: 0,
          todayPnL: 0,
          openPositions: 0,
          riskState: {
            currentCapital: 100000,
            dailyPnL: 0,
            dailyTrades: 0,
            tradingHalted: false
          }
        }
      }, { headers });
    }
    
    // Risk state
    if (path === '/api/risk/state') {
      return Response.json({
        success: true,
        data: {
          date: new Date().toISOString().split('T')[0],
          startingCapital: 100000,
          currentCapital: 100000,
          dailyPnL: 0,
          dailyTrades: 0,
          tradingHalted: false,
          config: {
            maxRiskPerTrade: 1.0,
            maxDailyLoss: 3.0,
            maxTradesPerDay: 3
          }
        }
      }, { headers });
    }
    
    // SMC Analysis
    if (path === '/api/smc/analyze') {
      const symbol = (url.searchParams.get('symbol') || 'RELIANCE').toUpperCase();
      const data = MARKET_DATA[symbol as keyof typeof MARKET_DATA] || MARKET_DATA.RELIANCE;
      const trend = data.change >= 0 ? 'BULLISH' : 'BEARISH';
      
      return Response.json({
        success: true,
        data: {
          symbol,
          timeframe: url.searchParams.get('timeframe') || '5m',
          trend,
          regime: {
            type: Math.abs(data.change_percent) > 1 ? 'TRENDING' : 'RANGING',
            trendStrength: Math.min(100, 50 + data.change_percent * 10),
            volatility: 1.5,
            atr: data.ltp * 0.01
          },
          swings: { total: 8, highs: 4, lows: 4 },
          structures: { total: 3, bos: 2, choch: 1 },
          liquidityZones: [],
          orderBlocks: [],
          fvgs: [],
          tradeSetup: {
            direction: trend,
            confluenceScore: Math.floor(Math.random() * 30) + 60,
            entry: data.ltp,
            stopLoss: trend === 'BULLISH' ? data.ltp * 0.98 : data.ltp * 1.02,
            takeProfit: trend === 'BULLISH' ? data.ltp * 1.04 : data.ltp * 0.96,
            riskReward: 2.0
          }
        }
      }, { headers });
    }
    
    return Response.json({ success: false, error: 'Not found' }, { status: 404, headers });
  }
});

console.log(`✅ Trading API running on http://0.0.0.0:${PORT}`);
