'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Target,
  Shield,
  Brain,
  BarChart3,
  Clock,
  Zap,
  AlertTriangle,
  RefreshCw,
  DollarSign,
  Percent,
  BarChart,
  LineChart,
  Play,
  Search,
  History,
  BookOpen,
  Layers,
  Wifi,
  Circle,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart as RechartsBarChart,
  Bar,
  Cell
} from 'recharts';
import { cn } from '@/lib/utils';

// ============================================
// API FUNCTIONS - Real Data Only
// ============================================

// API base is proxied via next.config.ts rewrites
const API_BASE = '';

async function apiGet(endpoint: string) {
  try {
    const res = await fetch(`/api${endpoint}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
    return await res.json();
  } catch {
    return { success: false, error: 'Network error' };
  }
}

async function apiPost(endpoint: string) {
  try {
    const res = await fetch(`/api${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
    return await res.json();
  } catch {
    return { success: false, error: 'Network error' };
  }
}

// ============================================
// TYPES
// ============================================

interface LiveQuote {
  symbol: string;
  ltp: number;
  change: number;
  change_percent: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface SMCAnalysis {
  symbol: string;
  timeframe: string;
  trend: string;
  regime: { type: string; trendStrength: number };
  swings: { total: number; highs: number; lows: number };
  structures: { total: number; bos: number; choch: number };
  liquidityZones: Array<{ type: string; priceLevel: number; swept: boolean }>;
  orderBlocks: Array<{ type: string; high: number; low: number; mitigated: boolean }>;
  tradeSetup: {
    direction: string;
    confluenceScore: number;
    entry: number;
    stopLoss: number;
    takeProfit: number;
    riskReward: number;
  } | null;
}

interface DashboardStats {
  totalTrades: number;
  winRate: number;
  totalPnL: number;
  todayPnL: number;
  openPositions: number;
}

// ============================================
// CONSTANTS
// ============================================

const SYMBOLS = ['RELIANCE', 'TCS', 'HDFCBANK', 'ICICIBANK', 'INFY', 'SBIN', 'BHARTIARTL', 'ITC', 'KOTAKBANK', 'LT'];
const TIMEFRAMES = ['5m', '15m', '1h', '4h', '1d'];
const REFRESH_INTERVAL = 5000; // 5 seconds for live data
const SCAN_INTERVAL = 30000; // 30 seconds for watchlist scan

// ============================================
// MAIN COMPONENT
// ============================================

export default function TradingDashboard() {
  // Core State
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  
  // Market Data
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [analysis, setAnalysis] = useState<SMCAnalysis | null>(null);
  const [symbol, setSymbol] = useState('RELIANCE');
  const [timeframe, setTimeframe] = useState('5m');
  
  // Dashboard Data
  const [stats, setStats] = useState<DashboardStats>({
    totalTrades: 0,
    winRate: 0,
    totalPnL: 0,
    todayPnL: 0,
    openPositions: 0
  });
  const [riskState, setRiskState] = useState({
    currentCapital: 100000,
    dailyPnL: 0,
    dailyTrades: 0,
    tradingHalted: false
  });
  
  // Scanning State
  const [scanResults, setScanResults] = useState<Array<{ symbol: string; score: number; direction: string }>>([]);
  const [scanning, setScanning] = useState(false);
  const [syncing, setSyncing] = useState(false);
  
  // Refs for intervals
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ============================================
  // DATA FETCHING - Real Time
  // ============================================

  const fetchLiveQuotes = useCallback(async () => {
    const result = await apiGet('/market/live');
    if (result.success && result.data) {
      setQuotes(result.data);
      setConnected(true);
    }
  }, []);

  const fetchAnalysis = useCallback(async (sym: string, tf: string) => {
    const result = await apiGet(`/smc/analyze?symbol=${sym}&timeframe=${tf}`);
    if (result.success && result.data) {
      setAnalysis(result.data);
    }
  }, []);

  const fetchDashboardStats = useCallback(async () => {
    const result = await apiGet('/dashboard/stats');
    if (result.success && result.data) {
      setStats({
        totalTrades: result.data.totalTrades || 0,
        winRate: result.data.winRate || 0,
        totalPnL: result.data.totalPnL || 0,
        todayPnL: result.data.todayPnL || 0,
        openPositions: result.data.openPositions || 0
      });
      if (result.data.riskState) {
        setRiskState({
          currentCapital: result.data.riskState.currentCapital || 100000,
          dailyPnL: result.data.riskState.dailyPnL || 0,
          dailyTrades: result.data.riskState.dailyTrades || 0,
          tradingHalted: result.data.riskState.tradingHalted || false
        });
      }
    }
  }, []);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      fetchLiveQuotes(),
      fetchAnalysis(symbol, timeframe),
      fetchDashboardStats()
    ]);
    setLastUpdate(new Date());
    setLoading(false);
  }, [symbol, timeframe, fetchLiveQuotes, fetchAnalysis, fetchDashboardStats]);

  // ============================================
  // ACTIONS
  // ============================================

  const scanWatchlist = useCallback(async () => {
    setScanning(true);
    const results: Array<{ symbol: string; score: number; direction: string }> = [];
    
    for (const sym of SYMBOLS) {
      const result = await apiGet(`/smc/analyze?symbol=${sym}&timeframe=5m`);
      if (result.success && result.data?.tradeSetup) {
        results.push({
          symbol: sym,
          score: result.data.tradeSetup.confluenceScore,
          direction: result.data.tradeSetup.direction
        });
      }
    }
    
    results.sort((a, b) => b.score - a.score);
    setScanResults(results.slice(0, 5));
    setScanning(false);
  }, []);

  const syncMarketData = useCallback(async () => {
    setSyncing(true);
    await apiPost('/market/refresh-all?timeframe=5m&days=1');
    await fetchAllData();
    setSyncing(false);
  }, [fetchAllData]);

  const engageKillSwitch = useCallback(async () => {
    if (confirm('⚠️ EMERGENCY STOP\n\nThis will halt all trading immediately. Continue?')) {
      const result = await apiPost('/safety/kill-switch?user=WEB&reason=Emergency&close_positions=true');
      if (result.success) {
        alert('🛑 Emergency Stop Engaged!');
        fetchAllData();
      }
    }
  }, [fetchAllData]);

  // ============================================
  // REAL-TIME UPDATES
  // ============================================

  // Initial load - only run once
  useEffect(() => {
    // Initial data fetch on mount
    const loadInitialData = async () => {
      setLoading(true);
      try {
        const [quotesRes, statsRes, analysisRes] = await Promise.all([
          fetch('/api/market/live').then(r => r.json()),
          fetch('/api/dashboard/stats').then(r => r.json()),
          fetch(`/api/smc/analyze?symbol=${symbol}&timeframe=${timeframe}`).then(r => r.json())
        ]);
        
        if (quotesRes?.success && quotesRes.data) {
          setQuotes(quotesRes.data);
          setConnected(true);
        }
        
        if (statsRes?.success && statsRes.data) {
          setStats({
            totalTrades: statsRes.data.totalTrades || 0,
            winRate: statsRes.data.winRate || 0,
            totalPnL: statsRes.data.totalPnL || 0,
            todayPnL: statsRes.data.todayPnL || 0,
            openPositions: statsRes.data.openPositions || 0
          });
          if (statsRes.data.riskState) {
            setRiskState({
              currentCapital: statsRes.data.riskState.currentCapital || 100000,
              dailyPnL: statsRes.data.riskState.dailyPnL || 0,
              dailyTrades: statsRes.data.riskState.dailyTrades || 0,
              tradingHalted: statsRes.data.riskState.tradingHalted || false
            });
          }
        }
        
        if (analysisRes?.success && analysisRes.data) {
          setAnalysis(analysisRes.data);
        }
        
        setLastUpdate(new Date());
      } catch (error) {
        console.error('Failed to fetch initial data:', error);
      }
      setLoading(false);
    };
    
    loadInitialData();
  }, []); // Only run on mount

  // Set up real-time refresh interval
  useEffect(() => {
    refreshIntervalRef.current = setInterval(async () => {
      try {
        const [quotesRes, statsRes] = await Promise.all([
          fetch('/api/market/live').then(r => r.json()),
          fetch('/api/dashboard/stats').then(r => r.json())
        ]);
        
        if (quotesRes?.success && quotesRes.data) {
          setQuotes(quotesRes.data);
          setConnected(true);
        }
        
        if (statsRes?.success && statsRes.data) {
          setStats({
            totalTrades: statsRes.data.totalTrades || 0,
            winRate: statsRes.data.winRate || 0,
            totalPnL: statsRes.data.totalPnL || 0,
            todayPnL: statsRes.data.todayPnL || 0,
            openPositions: statsRes.data.openPositions || 0
          });
        }
        
        setLastUpdate(new Date());
      } catch (error) {
        console.error('Failed to refresh data:', error);
      }
    }, REFRESH_INTERVAL);
    
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
  }, []);

  // Set up periodic watchlist scan
  useEffect(() => {
    scanIntervalRef.current = setInterval(() => {
      scanWatchlist();
    }, SCAN_INTERVAL);
    
    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    };
  }, [scanWatchlist]);

  // Re-fetch analysis when symbol/timeframe changes
  useEffect(() => {
    const fetchNewAnalysis = async () => {
      try {
        const res = await fetch(`/api/smc/analyze?symbol=${symbol}&timeframe=${timeframe}`);
        const data = await res.json();
        if (data?.success && data.data) {
          setAnalysis(data.data);
        }
      } catch (error) {
        console.error('Failed to fetch analysis:', error);
      }
    };
    
    fetchNewAnalysis();
  }, [symbol, timeframe]);

  // ============================================
  // RENDER HELPERS
  // ============================================

  const getTrendColor = (trend: string) => {
    if (trend === 'BULLISH') return 'text-emerald-400';
    if (trend === 'BEARISH') return 'text-red-400';
    return 'text-slate-400';
  };

  const formatPrice = (price: number) => `₹${price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

  // ============================================
  // RENDER
  // ============================================

  if (loading && !connected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Connecting to Live Market...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700/50 bg-slate-900/90 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[1920px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Trading AI Agent</h1>
                <p className="text-xs text-slate-400">Real-Time SMC Engine</p>
              </div>
              <Badge className={cn(
                "ml-2",
                connected ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
              )}>
                <Circle className={cn("w-2 h-2 mr-1", connected ? "fill-emerald-400" : "fill-red-400")} />
                {connected ? 'LIVE' : 'CONNECTING'}
              </Badge>
            </div>
            
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">
                Updated: {lastUpdate.toLocaleTimeString()}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchAllData}
                className="border-slate-600 hover:bg-slate-700"
              >
                <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1920px] mx-auto px-4 py-4">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          <StatsCard
            title="Win Rate"
            value={`${stats.winRate.toFixed(1)}%`}
            color={stats.winRate >= 50 ? 'emerald' : 'red'}
          />
          <StatsCard
            title="Total P&L"
            value={formatPrice(stats.totalPnL)}
            color={stats.totalPnL >= 0 ? 'emerald' : 'red'}
          />
          <StatsCard
            title="Today P&L"
            value={formatPrice(stats.todayPnL)}
            color={stats.todayPnL >= 0 ? 'emerald' : 'red'}
          />
          <StatsCard
            title="Open Positions"
            value={stats.openPositions.toString()}
            color="amber"
          />
          <StatsCard
            title="Capital"
            value={formatPrice(riskState.currentCapital)}
            color="purple"
          />
          <StatsCard
            title="Daily Trades"
            value={`${riskState.dailyTrades}/3`}
            color={riskState.dailyTrades >= 3 ? 'red' : 'emerald'}
          />
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left - Live Quotes & Chart */}
          <div className="lg:col-span-2 space-y-4">
            {/* Live Quotes Table */}
            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-lg flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-500" />
                  Live Market Quotes
                  <Badge className="bg-emerald-500/20 text-emerald-400 text-xs ml-auto">
                    Auto-refresh: 5s
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-slate-400 border-b border-slate-700">
                        <th className="text-left py-2 px-2">Symbol</th>
                        <th className="text-right py-2 px-2">LTP</th>
                        <th className="text-right py-2 px-2">Change</th>
                        <th className="text-right py-2 px-2">High</th>
                        <th className="text-right py-2 px-2">Low</th>
                        <th className="text-right py-2 px-2">Volume</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(quotes).slice(0, 10).map(([sym, quote]) => (
                        <tr
                          key={sym}
                          onClick={() => setSymbol(sym)}
                          className={cn(
                            "border-b border-slate-700/50 cursor-pointer hover:bg-slate-700/30",
                            sym === symbol && "bg-amber-500/10"
                          )}
                        >
                          <td className="py-2 px-2 font-medium text-white">{sym}</td>
                          <td className="text-right py-2 px-2 text-white font-mono">
                            {formatPrice(quote.ltp)}
                          </td>
                          <td className={cn(
                            "text-right py-2 px-2 font-mono",
                            quote.change >= 0 ? "text-emerald-400" : "text-red-400"
                          )}>
                            <span className="flex items-center justify-end gap-1">
                              {quote.change >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                              {quote.change_percent.toFixed(2)}%
                            </span>
                          </td>
                          <td className="text-right py-2 px-2 text-emerald-400 font-mono">{formatPrice(quote.high)}</td>
                          <td className="text-right py-2 px-2 text-red-400 font-mono">{formatPrice(quote.low)}</td>
                          <td className="text-right py-2 px-2 text-slate-400">{(quote.volume / 1000000).toFixed(2)}M</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* SMC Analysis */}
            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white text-lg flex items-center gap-2">
                    <Layers className="w-5 h-5 text-amber-500" />
                    SMC Analysis
                  </CardTitle>
                  <div className="flex gap-2">
                    <Select value={symbol} onValueChange={setSymbol}>
                      <SelectTrigger className="w-32 bg-slate-700 border-slate-600">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SYMBOLS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={timeframe} onValueChange={setTimeframe}>
                      <SelectTrigger className="w-20 bg-slate-700 border-slate-600">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMEFRAMES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {analysis ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-slate-700/30 rounded-lg p-3">
                      <span className="text-slate-400 text-xs">Trend</span>
                      <p className={cn("text-lg font-bold", getTrendColor(analysis.trend))}>
                        {analysis.trend}
                      </p>
                    </div>
                    <div className="bg-slate-700/30 rounded-lg p-3">
                      <span className="text-slate-400 text-xs">Regime</span>
                      <p className="text-lg font-bold text-white">{analysis.regime?.type || 'N/A'}</p>
                    </div>
                    <div className="bg-slate-700/30 rounded-lg p-3">
                      <span className="text-slate-400 text-xs">Swings</span>
                      <p className="text-lg font-bold text-white">{analysis.swings?.total || 0}</p>
                    </div>
                    <div className="bg-slate-700/30 rounded-lg p-3">
                      <span className="text-slate-400 text-xs">BOS/CHOCH</span>
                      <p className="text-lg font-bold text-white">
                        {analysis.structures?.bos || 0}/{analysis.structures?.choch || 0}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-400">
                    Loading analysis...
                  </div>
                )}

                {/* Trade Setup */}
                {analysis?.tradeSetup && (
                  <div className="mt-4 p-4 bg-gradient-to-r from-amber-500/10 to-orange-500/10 rounded-lg border border-amber-500/30">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-amber-400 font-semibold">Active Trade Setup</span>
                      <Badge className={cn(
                        analysis.tradeSetup.direction === 'LONG' ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                      )}>
                        {analysis.tradeSetup.direction}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-4 gap-3 text-sm">
                      <div>
                        <span className="text-slate-400 text-xs">Entry</span>
                        <p className="text-white font-mono">{formatPrice(analysis.tradeSetup.entry)}</p>
                      </div>
                      <div>
                        <span className="text-slate-400 text-xs">Stop Loss</span>
                        <p className="text-red-400 font-mono">{formatPrice(analysis.tradeSetup.stopLoss)}</p>
                      </div>
                      <div>
                        <span className="text-slate-400 text-xs">Target</span>
                        <p className="text-emerald-400 font-mono">{formatPrice(analysis.tradeSetup.takeProfit)}</p>
                      </div>
                      <div>
                        <span className="text-slate-400 text-xs">R:R</span>
                        <p className="text-amber-400 font-mono">{analysis.tradeSetup.riskReward.toFixed(2)}</p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <Progress value={analysis.tradeSetup.confluenceScore} className="h-2 bg-slate-700" />
                      <span className="text-xs text-slate-400 mt-1 block">
                        Confluence Score: {analysis.tradeSetup.confluenceScore}%
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right - Actions & Results */}
          <div className="space-y-4">
            {/* Quick Actions */}
            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  className="w-full bg-amber-500 hover:bg-amber-600 text-black"
                  onClick={scanWatchlist}
                  disabled={scanning}
                >
                  {scanning ? (
                    <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Scanning...</>
                  ) : (
                    <><Search className="w-4 h-4 mr-2" />Scan Watchlist</>
                  )}
                </Button>
                <Button
                  variant="outline"
                  className="w-full border-slate-600 hover:bg-slate-700"
                  onClick={syncMarketData}
                  disabled={syncing}
                >
                  {syncing ? (
                    <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Syncing...</>
                  ) : (
                    <><RefreshCw className="w-4 h-4 mr-2" />Sync Market Data</>
                  )}
                </Button>
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={engageKillSwitch}
                >
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  Emergency Stop
                </Button>
              </CardContent>
            </Card>

            {/* Scan Results */}
            {scanResults.length > 0 && (
              <Card className="bg-slate-800/50 border-slate-700/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-lg flex items-center gap-2">
                    <Target className="w-5 h-5 text-amber-500" />
                    Top Setups
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {scanResults.map((result, i) => (
                      <div
                        key={result.symbol}
                        className="flex items-center justify-between p-2 bg-slate-700/30 rounded-lg cursor-pointer hover:bg-slate-700/50"
                        onClick={() => setSymbol(result.symbol)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-amber-400 font-bold">#{i + 1}</span>
                          <span className="text-white font-medium">{result.symbol}</span>
                          <Badge className={cn(
                            "text-xs",
                            result.direction === 'LONG' ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                          )}>
                            {result.direction}
                          </Badge>
                        </div>
                        <Badge className="bg-amber-500/20 text-amber-400">
                          {result.score}%
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Risk Status */}
            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-lg flex items-center gap-2">
                  <Shield className="w-5 h-5 text-red-400" />
                  Risk Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-slate-400 text-sm">Capital</span>
                  <span className="text-white font-mono">{formatPrice(riskState.currentCapital)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 text-sm">Daily P&L</span>
                  <span className={cn(
                    "font-mono",
                    riskState.dailyPnL >= 0 ? "text-emerald-400" : "text-red-400"
                  )}>
                    {formatPrice(riskState.dailyPnL)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 text-sm">Trades Today</span>
                  <span className="text-white font-mono">{riskState.dailyTrades}/3</span>
                </div>
                <Progress value={(riskState.dailyTrades / 3) * 100} className="h-1.5 bg-slate-700" />
                {riskState.tradingHalted && (
                  <div className="p-2 bg-red-500/20 rounded text-red-400 text-sm text-center">
                    ⚠️ Trading Halted
                  </div>
                )}
              </CardContent>
            </Card>

            {/* System Status */}
            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Backend</span>
                  <span className={cn("flex items-center gap-1", connected ? "text-emerald-400" : "text-red-400")}>
                    <Circle className={cn("w-2 h-2", connected ? "fill-emerald-400" : "fill-red-400")} />
                    {connected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm mt-2">
                  <span className="text-slate-400">Data Source</span>
                  <span className="text-emerald-400">Angel One</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-2">
                  <span className="text-slate-400">Refresh Rate</span>
                  <span className="text-amber-400">5 seconds</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-700/50 bg-slate-900/90 mt-8 py-4">
        <div className="max-w-[1920px] mx-auto px-4 text-center text-sm text-slate-400">
          Trading AI Agent RAG • Real-Time Market Data • Auto-refresh every 5s
        </div>
      </footer>
    </div>
  );
}

// ============================================
// HELPER COMPONENTS
// ============================================

function StatsCard({ 
  title, 
  value, 
  color 
}: { 
  title: string; 
  value: string; 
  color: 'emerald' | 'red' | 'amber' | 'purple';
}) {
  const colorClasses = {
    emerald: 'text-emerald-400',
    red: 'text-red-400',
    amber: 'text-amber-400',
    purple: 'text-purple-400'
  };

  return (
    <Card className="bg-slate-800/50 border-slate-700/50">
      <CardContent className="p-4">
        <p className="text-slate-400 text-xs">{title}</p>
        <p className={cn("text-xl font-bold mt-1", colorClasses[color])}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
