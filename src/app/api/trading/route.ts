/**
 * Trading System API Route
 * LLM-Enhanced Trading System with Local LLaMA Brain
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTradingBrain } from '@/lib/trading/llm-brain';

// ============================================
// DATA SYNC ENDPOINTS
// ============================================

async function handleDataSync(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  
  if (action === 'status') {
    const totalStocks = await db.stock.count();
    const stocksWithData = await db.stock.count({
      where: { dailyCandles: { some: {} } },
    });
    
    const lastSession = await db.dataSession.findFirst({
      where: { timeframe: 'DAILY' },
      orderBy: { lastDate: 'desc' },
    });
    
    const lastCandle = await db.dailyCandle.findFirst({
      orderBy: { date: 'desc' },
    });
    
    const firstCandle = await db.dailyCandle.findFirst({
      orderBy: { date: 'asc' },
    });
    
    return NextResponse.json({
      success: true,
      data: {
        totalStocks,
        stocksWithData,
        lastSessionDate: lastSession?.lastDate || null,
        lastDataDate: lastCandle?.date || null,
        firstDataDate: firstCandle?.date || null,
        isUpToDate: lastSession ? 
          (Date.now() - new Date(lastSession.lastDate).getTime()) < 3 * 24 * 60 * 60 * 1000 : 
          false,
      },
    });
  }
  
  if (action === 'init-stocks') {
    const { NIFTY_500_SYMBOLS, getYahooSymbol } = await import('@/lib/trading/nifty500');
    
    let count = 0;
    for (const [symbol, info] of Object.entries(NIFTY_500_SYMBOLS)) {
      try {
        await db.stock.upsert({
          where: { symbol },
          update: {
            name: info.name,
            sector: info.sector,
            yahooSymbol: getYahooSymbol(symbol),
          },
          create: {
            symbol,
            name: info.name,
            sector: info.sector,
            yahooSymbol: getYahooSymbol(symbol),
            isActive: true,
          },
        });
        count++;
      } catch (error) {
        console.error(`Error initializing ${symbol}:`, error);
      }
    }
    
    return NextResponse.json({
      success: true,
      data: { stocksInitialized: count },
    });
  }
  
  return NextResponse.json({
    success: false,
    error: 'Invalid action',
  });
}

// ============================================
// ANALYSIS ENDPOINTS (LLM-ENHANCED)
// ============================================

async function handleAnalyze(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol');
  const action = searchParams.get('action');
  
  if (action === 'scan') {
    // LLM-based scan for signals
    const { scanForSignals } = await import('@/lib/trading/analysis-engine-llm');
    const minConfidence = parseInt(searchParams.get('minConfidence') || '80');
    
    const signals = await scanForSignals(undefined, minConfidence);
    
    return NextResponse.json({
      success: true,
      data: {
        signals: signals.slice(0, 20),
        totalFound: signals.length,
        scanTime: new Date(),
      },
    });
  }
  
  if (action === 'llm-status') {
    try {
      const brain = await getTradingBrain();
      return NextResponse.json({
        success: true,
        data: { llmReady: true, message: 'LLM Trading Brain initialized' },
      });
    } catch (error) {
      return NextResponse.json({
        success: false,
        data: { llmReady: false, message: 'LLM initialization failed' },
      });
    }
  }
  
  if (symbol) {
    // Analyze specific stock with LLM
    const { analyzeStock } = await import('@/lib/trading/analysis-engine-llm');
    const analysis = await analyzeStock(symbol);
    
    if (!analysis) {
      return NextResponse.json({
        success: false,
        error: 'Unable to analyze stock. Insufficient data.',
      });
    }
    
    return NextResponse.json({
      success: true,
      data: analysis,
    });
  }
  
  return NextResponse.json({
    success: false,
    error: 'Symbol or action required',
  });
}

// ============================================
// SIGNALS ENDPOINTS
// ============================================

async function handleSignals(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const signalId = searchParams.get('signalId');
  
  if (action === 'generate') {
    // Generate signals using LLM
    const { scanForSignals, saveSignal } = await import('@/lib/trading/analysis-engine-llm');
    
    const candidates = await scanForSignals(undefined, 80);
    const generatedSignals: string[] = [];
    
    for (const candidate of candidates.slice(0, 10)) {
      const id = await saveSignal(candidate.symbol, candidate.setup, candidate.analysis);
      if (id) generatedSignals.push(id);
    }
    
    return NextResponse.json({
      success: true,
      data: {
        generated: generatedSignals.length,
        signalIds: generatedSignals,
      },
    });
  }
  
  if (action === 'list') {
    const status = searchParams.get('status') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50');
    
    const signals = await db.tradeSignal.findMany({
      where: status ? { status: status as any } : undefined,
      take: limit,
      orderBy: { generatedAt: 'desc' },
      include: {
        stock: { select: { symbol: true, name: true, sector: true } },
        tracking: true,
      },
    });
    
    return NextResponse.json({
      success: true,
      data: signals,
    });
  }
  
  if (signalId) {
    const signal = await db.tradeSignal.findUnique({
      where: { id: signalId },
      include: { stock: true, tracking: true },
    });
    
    if (!signal) {
      return NextResponse.json({ success: false, error: 'Signal not found' });
    }
    
    return NextResponse.json({ success: true, data: signal });
  }
  
  return NextResponse.json({ success: false, error: 'Action required' });
}

// ============================================
// DASHBOARD ENDPOINTS
// ============================================

async function handleDashboard(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const section = searchParams.get('section') || 'overview';
  
  if (section === 'overview') {
    const [
      totalSignals,
      pendingSignals,
      successSignals,
      lossSignals,
      activeSignals,
      recentSignals,
      recentLearning,
    ] = await Promise.all([
      db.tradeSignal.count(),
      db.tradeSignal.count({ where: { status: 'PENDING' } }),
      db.tradeSignal.count({ where: { status: 'SUCCESS' } }),
      db.tradeSignal.count({ where: { status: 'LOSS' } }),
      db.tradeSignal.count({ where: { status: 'ACTIVE' } }),
      db.tradeSignal.findMany({
        take: 10,
        orderBy: { generatedAt: 'desc' },
        include: { stock: { select: { symbol: true, name: true } } },
      }),
      db.learningRecord.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    
    const winRate = totalSignals > 0 ? (successSignals / (successSignals + lossSignals)) * 100 : 0;
    
    return NextResponse.json({
      success: true,
      data: {
        totalSignals,
        pendingSignals,
        activeSignals,
        successSignals,
        lossSignals,
        winRate,
        recentSignals,
        recentLearning,
      },
    });
  }
  
  if (section === 'signals') {
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    
    const signals = await db.tradeSignal.findMany({
      where: status ? { status: status as any } : undefined,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { generatedAt: 'desc' },
      include: {
        stock: { select: { symbol: true, name: true, sector: true } },
        tracking: true,
      },
    });
    
    const total = await db.tradeSignal.count({
      where: status ? { status: status as any } : undefined,
    });
    
    return NextResponse.json({
      success: true,
      data: {
        signals,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
    });
  }
  
  if (section === 'learning') {
    const records = await db.learningRecord.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
    });
    
    const strategies = await db.strategyPerformance.findMany();
    
    const successBySetup = await db.learningRecord.groupBy({
      by: ['setupType', 'result'],
      _count: true,
    });
    
    const successByRegime = await db.learningRecord.groupBy({
      by: ['regime', 'result'],
      _count: true,
      where: { regime: { not: null } },
    });
    
    return NextResponse.json({
      success: true,
      data: { records, strategies, successBySetup, successByRegime },
    });
  }
  
  if (section === 'watchlist') {
    const watchlist = await db.watchlist.findFirst({
      where: { isDefault: true },
      include: {
        items: {
          include: { stock: { select: { symbol: true, name: true, sector: true } } },
          orderBy: { successRate: 'desc' },
        },
      },
    });
    
    return NextResponse.json({
      success: true,
      data: watchlist?.items || [],
    });
  }
  
  if (section === 'pnl') {
    const tracking = await db.signalTracking.findMany({
      where: { finalPnlPercent: { not: null } },
      include: { signal: { include: { stock: { select: { symbol: true } } } } },
    });
    
    const totalPnl = tracking.reduce((sum, t) => sum + (t.finalPnlPercent || 0), 0);
    const avgPnl = tracking.length > 0 ? totalPnl / tracking.length : 0;
    
    const profitTrades = tracking.filter(t => (t.finalPnlPercent || 0) > 0);
    const lossTrades = tracking.filter(t => (t.finalPnlPercent || 0) < 0);
    
    return NextResponse.json({
      success: true,
      data: {
        totalPnl,
        avgPnl,
        profitTrades: profitTrades.length,
        lossTrades: lossTrades.length,
        totalProfit: profitTrades.reduce((sum, t) => sum + (t.finalPnlPercent || 0), 0),
        totalLoss: lossTrades.reduce((sum, t) => sum + (t.finalPnlPercent || 0), 0),
        tracking,
      },
    });
  }
  
  if (section === 'strategies') {
    const strategies = await db.strategyPerformance.findMany({
      orderBy: { successRate: 'desc' },
    });
    
    return NextResponse.json({
      success: true,
      data: strategies,
    });
  }
  
  return NextResponse.json({ success: false, error: 'Invalid section' });
}

// ============================================
// DATA FETCH (YAHOO FINANCE)
// ============================================

async function handleDataFetch(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  
  if (action === 'sync') {
    const { syncHistoricalData, initializeStocks } = await import('@/lib/trading/data-service');
    
    await initializeStocks();
    const result = await syncHistoricalData(2);
    
    return NextResponse.json({
      success: result.success,
      data: result,
    });
  }
  
  if (action === 'quotes') {
    const { fetchBatchQuotes } = await import('@/lib/trading/data-service');
    const symbols = searchParams.get('symbols')?.split(',') || [];
    
    if (symbols.length === 0) {
      const stocks = await db.stock.findMany({
        where: { isActive: true },
        select: { symbol: true },
        take: 100,
      });
      symbols.push(...stocks.map(s => s.symbol));
    }
    
    const quotes = await fetchBatchQuotes(symbols);
    
    return NextResponse.json({
      success: true,
      data: quotes,
    });
  }
  
  return NextResponse.json({ success: false, error: 'Invalid action' });
}

// ============================================
// LLM BRAIN ENDPOINTS
// ============================================

async function handleLLM(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  
  if (action === 'status') {
    try {
      const brain = await getTradingBrain();
      return NextResponse.json({
        success: true,
        data: {
          initialized: true,
          message: 'Trading Brain (LLM) is ready',
        },
      });
    } catch (error) {
      return NextResponse.json({
        success: false,
        data: {
          initialized: false,
          message: 'Trading Brain initialization failed',
        },
      });
    }
  }
  
  if (action === 'strategy-advice') {
    const { getTradingBrain } = await import('@/lib/trading/llm-brain');
    
    const recentSignals = await db.tradeSignal.count();
    const successSignals = await db.tradeSignal.count({ where: { status: 'SUCCESS' } });
    const winRate = recentSignals > 0 ? (successSignals / recentSignals) * 100 : 50;
    
    try {
      const brain = await getTradingBrain();
      const advice = await brain.getStrategyRecommendation(
        { regime: 'MIXED', trend: 'NEUTRAL', volatility: 'NORMAL' },
        { winRate, avgPnl: 0 }
      );
      
      return NextResponse.json({
        success: true,
        data: advice,
      });
    } catch (error) {
      return NextResponse.json({
        success: false,
        error: 'Failed to get strategy advice',
      });
    }
  }
  
  return NextResponse.json({ success: false, error: 'Invalid action' });
}

// ============================================
// MAIN ROUTE HANDLER
// ============================================

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  
  switch (type) {
    case 'data':
      return handleDataSync(req);
    case 'analyze':
      return handleAnalyze(req);
    case 'signals':
      return handleSignals(req);
    case 'dashboard':
      return handleDashboard(req);
    case 'fetch':
      return handleDataFetch(req);
    case 'llm':
      return handleLLM(req);
    default:
      return NextResponse.json({
        success: false,
        error: 'Invalid type. Use: data, analyze, signals, dashboard, fetch, llm',
      });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { type, action, ...data } = body;
  
  if (type === 'fetch' && action === 'sync') {
    const { syncHistoricalData, initializeStocks } = await import('@/lib/trading/data-service');
    
    await initializeStocks();
    const result = await syncHistoricalData(data.years || 2, data.symbols);
    
    return NextResponse.json({
      success: result.success,
      data: result,
    });
  }
  
  if (type === 'analyze' && action === 'generate-signals') {
    const { scanForSignals, saveSignal } = await import('@/lib/trading/analysis-engine-llm');
    
    const candidates = await scanForSignals(undefined, 80);
    const generatedSignals: string[] = [];
    
    for (const candidate of candidates.slice(0, 10)) {
      const id = await saveSignal(candidate.symbol, candidate.setup, candidate.analysis);
      if (id) generatedSignals.push(id);
    }
    
    return NextResponse.json({
      success: true,
      data: {
        generated: generatedSignals.length,
        signalIds: generatedSignals,
      },
    });
  }
  
  return NextResponse.json({
    success: false,
    error: 'Invalid request',
  });
}
