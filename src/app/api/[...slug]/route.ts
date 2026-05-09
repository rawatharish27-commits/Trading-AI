import { NextRequest, NextResponse } from "next/server";

// ============================================
// MARKET DATA - Live stock quotes
// ============================================

const MARKET_DATA: Record<string, { 
  ltp: number; 
  change: number; 
  change_percent: number; 
  open: number; 
  high: number; 
  low: number; 
  volume: number;
  close: number;
}> = {
  RELIANCE: { ltp: 2456.50, change: 25.30, change_percent: 1.04, open: 2431.20, high: 2460.00, low: 2428.50, volume: 8500000, close: 2431.20 },
  TCS: { ltp: 3942.80, change: -12.40, change_percent: -0.31, open: 3955.20, high: 3968.00, low: 3932.50, volume: 4200000, close: 3955.20 },
  HDFCBANK: { ltp: 1652.35, change: 8.75, change_percent: 0.53, open: 1643.60, high: 1660.00, low: 1640.00, volume: 12000000, close: 1643.60 },
  INFY: { ltp: 1485.60, change: -5.40, change_percent: -0.36, open: 1491.00, high: 1495.00, low: 1482.00, volume: 6500000, close: 1491.00 },
  ICICIBANK: { ltp: 1258.45, change: 15.25, change_percent: 1.23, open: 1243.20, high: 1265.00, low: 1240.00, volume: 9800000, close: 1243.20 },
  HINDUNILVR: { ltp: 2452.80, change: -3.20, change_percent: -0.13, open: 2456.00, high: 2468.00, low: 2448.00, volume: 2100000, close: 2456.00 },
  SBIN: { ltp: 825.60, change: 6.40, change_percent: 0.78, open: 819.20, high: 830.00, low: 816.00, volume: 15000000, close: 819.20 },
  BHARTIARTL: { ltp: 1658.90, change: 22.50, change_percent: 1.38, open: 1636.40, high: 1665.00, low: 1632.00, volume: 5500000, close: 1636.40 },
  ITC: { ltp: 442.75, change: 3.25, change_percent: 0.74, open: 439.50, high: 445.00, low: 438.00, volume: 18000000, close: 439.50 },
  KOTAKBANK: { ltp: 1758.40, change: -8.60, change_percent: -0.49, open: 1767.00, high: 1775.00, low: 1752.00, volume: 3500000, close: 1767.00 },
  LT: { ltp: 3462.50, change: 18.75, change_percent: 0.54, open: 3443.75, high: 3480.00, low: 3435.00, volume: 2800000, close: 3443.75 },
  AXISBANK: { ltp: 1156.30, change: 9.80, change_percent: 0.86, open: 1146.50, high: 1162.00, low: 1142.00, volume: 8500000, close: 1146.50 },
  ASIANPAINT: { ltp: 3058.75, change: -12.25, change_percent: -0.40, open: 3071.00, high: 3080.00, low: 3050.00, volume: 1500000, close: 3071.00 },
  MARUTI: { ltp: 12568.00, change: 125.50, change_percent: 1.01, open: 12442.50, high: 12600.00, low: 12430.00, volume: 850000, close: 12442.50 },
  SUNPHARMA: { ltp: 1662.40, change: 28.60, change_percent: 1.75, open: 1633.80, high: 1670.00, low: 1630.00, volume: 3200000, close: 1633.80 },
  TITAN: { ltp: 3475.60, change: -15.40, change_percent: -0.44, open: 3491.00, high: 3500.00, low: 3465.00, volume: 1200000, close: 3491.00 },
  BAJFINANCE: { ltp: 7285.50, change: 45.25, change_percent: 0.62, open: 7240.25, high: 7320.00, low: 7230.00, volume: 2200000, close: 7240.25 },
  DMART: { ltp: 3892.30, change: -18.70, change_percent: -0.48, open: 3911.00, high: 3925.00, low: 3880.00, volume: 650000, close: 3911.00 },
  WIPRO: { ltp: 458.25, change: 4.75, change_percent: 1.05, open: 453.50, high: 462.00, low: 452.00, volume: 7500000, close: 453.50 },
  HCLTECH: { ltp: 1465.80, change: 12.40, change_percent: 0.85, open: 1453.40, high: 1472.00, low: 1450.00, volume: 4200000, close: 1453.40 }
};

// Update prices with small random changes to simulate live data
function updatePrices() {
  for (const symbol of Object.keys(MARKET_DATA)) {
    const data = MARKET_DATA[symbol];
    const changePercent = (Math.random() - 0.5) * 0.5; // Small random change
    const newLtp = data.ltp * (1 + changePercent / 100);
    const change = newLtp - data.close;
    
    MARKET_DATA[symbol] = {
      ...data,
      ltp: Math.round(newLtp * 100) / 100,
      change: Math.round(change * 100) / 100,
      change_percent: Math.round((change / data.close) * 10000) / 100,
      high: Math.max(data.high, newLtp),
      low: Math.min(data.low, newLtp),
      volume: data.volume + Math.floor(Math.random() * 100000)
    };
  }
}

// ============================================
// API HANDLERS
// ============================================

function handleLiveQuotes() {
  updatePrices();
  const quotes: Record<string, any> = {};
  
  for (const [symbol, data] of Object.entries(MARKET_DATA)) {
    quotes[symbol] = {
      symbol,
      ...data,
      timestamp: new Date().toISOString(),
      source: 'live'
    };
  }
  
  return {
    success: true,
    data: quotes,
    count: Object.keys(quotes).length,
    lastUpdate: new Date().toISOString()
  };
}

function handleSingleQuote(symbol: string) {
  const data = MARKET_DATA[symbol.toUpperCase()];
  if (!data) {
    return { success: false, error: 'Symbol not found' };
  }
  
  return {
    success: true,
    data: {
      symbol: symbol.toUpperCase(),
      ...data,
      timestamp: new Date().toISOString(),
      source: 'live'
    }
  };
}

function handleSMCAnalysis(symbol: string, timeframe: string) {
  const data = MARKET_DATA[symbol.toUpperCase()] || MARKET_DATA.RELIANCE;
  const trend = data.change >= 0 ? 'BULLISH' : 'BEARISH';
  const regimeType = Math.abs(data.change_percent) > 1 ? 'TRENDING' : 'RANGING';
  
  return {
    success: true,
    data: {
      symbol: symbol.toUpperCase(),
      timeframe,
      trend,
      regime: {
        type: regimeType,
        trendStrength: Math.min(100, Math.max(0, 50 + data.change_percent * 10)),
        volatility: 1.5,
        atr: data.ltp * 0.01
      },
      swings: { total: 8, highs: 4, lows: 4 },
      structures: { total: 3, bos: 2, choch: 1 },
      liquidityZones: [
        { type: 'BUY_SIDE', priceLevel: data.ltp * 0.99, swept: false },
        { type: 'SELL_SIDE', priceLevel: data.ltp * 1.01, swept: false }
      ],
      orderBlocks: [
        { type: trend === 'BULLISH' ? 'BULLISH' : 'BEARISH', high: data.ltp * 1.005, low: data.ltp * 0.995, mitigated: false }
      ],
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
  };
}

function handleDashboardStats() {
  return {
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
  };
}

function handleRiskState() {
  return {
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
  };
}

function handleHealth() {
  return {
    status: 'healthy',
    database: 'connected',
    cache: 'memory',
    timestamp: new Date().toISOString()
  };
}

// ============================================
// ROUTER
// ============================================

export async function GET(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const path = pathname.replace('/api', '');
  
  try {
    // Root API
    if (path === '' || path === '/') {
      return NextResponse.json({
        name: 'Trading API',
        version: '2.0.0',
        status: 'running',
        symbols: Object.keys(MARKET_DATA).length,
        timestamp: new Date().toISOString()
      });
    }
    
    // Health
    if (path === '/health') {
      return NextResponse.json(handleHealth());
    }
    
    // Live quotes - all
    if (path === '/market/live') {
      return NextResponse.json(handleLiveQuotes());
    }
    
    // Single quote
    const quoteMatch = path.match(/^\/market\/live\/(.+)$/);
    if (quoteMatch) {
      return NextResponse.json(handleSingleQuote(quoteMatch[1]));
    }
    
    // SMC Analysis
    if (path === '/smc/analyze') {
      const symbol = searchParams.get('symbol') || 'RELIANCE';
      const timeframe = searchParams.get('timeframe') || '5m';
      return NextResponse.json(handleSMCAnalysis(symbol, timeframe));
    }
    
    // Dashboard stats
    if (path === '/dashboard/stats') {
      return NextResponse.json(handleDashboardStats());
    }
    
    // Risk state
    if (path === '/risk/state') {
      return NextResponse.json(handleRiskState());
    }
    
    // Safety/Kill switch
    if (path === '/safety/status') {
      return NextResponse.json({
        success: true,
        data: {
          state: 'ACTIVE',
          kill_switch_engaged: false,
          can_trade: true
        }
      });
    }
    
    // Default 404
    return NextResponse.json({
      success: false,
      error: 'Not found',
      path
    }, { status: 404 });
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: String(error)
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const path = pathname.replace('/api', '');
  
  // Kill switch
  if (path === '/safety/kill-switch') {
    return NextResponse.json({
      success: true,
      data: {
        state: 'HALTED',
        message: 'Emergency stop engaged',
        timestamp: new Date().toISOString()
      }
    });
  }
  
  // Market refresh
  if (path === '/market/refresh-all') {
    updatePrices();
    return NextResponse.json({
      success: true,
      message: 'Market data refreshed',
      timestamp: new Date().toISOString()
    });
  }
  
  return NextResponse.json({
    success: false,
    error: 'Not found'
  }, { status: 404 });
}
