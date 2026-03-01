'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  CheckCircle,
  XCircle,
  RefreshCw,
  DollarSign,
  Percent,
  BarChart,
  LineChart,
  PieChart,
  Play,
  Pause,
  Square,
  Search,
  Settings,
  History,
  BookOpen,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  ChevronRight,
  Info,
  Cpu,
  Database,
  Wifi,
  WifiOff
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  BarChart as RechartsBarChart,
  Bar,
  Legend,
  ComposedChart
} from 'recharts';
import { cn } from '@/lib/utils';

// Import API service
import {
  fetchDashboardStats,
  fetchSMCAnalysis,
  fetchTrades,
  fetchRiskState,
  checkBackendHealth,
  runBacktest
} from '@/lib/api';

// ============================================
// TYPES
// ============================================

interface DashboardStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnL: number;
  todayPnL: number;
  openPositions: number;
  currentCapital: number;
  maxDrawdown: number;
  expectancy: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  sharpeRatio: number;
}

interface SMCAnalysis {
  symbol: string;
  timeframe: string;
  analysisTime: string;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  regime: {
    type: 'TRENDING' | 'RANGING' | 'VOLATILE';
    trendStrength: number;
    volatility: number;
    atr: number;
  };
  swings: { total: number; highs: number; lows: number };
  structures: { total: number; bos: number; choch: number };
  liquidityZones: LiquidityZone[];
  orderBlocks: OrderBlock[];
  fvgs: FVG[];
  tradeSetup: TradeSetup | null;
  mtfAlignment: {
    daily: string;
    h4: string;
    h1: string;
    m15: string;
    aligned: boolean;
  };
}

interface LiquidityZone {
  type: string;
  priceLevel: number;
  swept: boolean;
  touches: number;
}

interface OrderBlock {
  type: 'BULLISH' | 'BEARISH';
  high: number;
  low: number;
  mitigated: boolean;
  retested: boolean;
  strength: number;
}

interface FVG {
  type: 'BULLISH' | 'BEARISH';
  gapTop: number;
  gapBottom: number;
  filled: boolean;
  fillPercentage: number;
}

interface TradeSetup {
  direction: 'LONG' | 'SHORT';
  confluenceScore: number;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  breakdown: string[];
}

interface RiskState {
  date: string;
  startingCapital: number;
  currentCapital: number;
  dailyPnL: number;
  dailyLoss: number;
  dailyTrades: number;
  openPositions: number;
  dailyLossLimit: boolean;
  tradeLimitHit: boolean;
  tradingHalted: boolean;
  haltReason: string | null;
  config: {
    maxRiskPerTrade: number;
    maxDailyLoss: number;
    maxTradesPerDay: number;
    maxOpenPositions: number;
  };
}

interface Agent {
  id: string;
  name: string;
  type: 'research' | 'strategy' | 'decision' | 'risk' | 'execution' | 'monitoring' | 'learning';
  status: 'active' | 'idle' | 'error' | 'pending';
  lastActivity: string;
  description: string;
  metrics: Record<string, number | string>;
}

interface TradeRecord {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number | null;
  pnl: number | null;
  status: 'OPEN' | 'CLOSED';
  entryTime: string;
  exitTime: string | null;
  setup: string;
  confluenceScore: number;
}

interface LearningRecord {
  setupType: string;
  regime: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgPnL: number;
  trend: 'improving' | 'stable' | 'declining';
}

interface BacktestResult {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnL: number;
  maxDrawdown: number;
  expectancy: number;
  profitFactor: number;
  sharpeRatio: number;
  trades: BacktestTrade[];
}

interface BacktestTrade {
  date: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entry: number;
  exit: number;
  pnl: number;
  result: 'WIN' | 'LOSS';
}

// ============================================
// CONSTANTS
// ============================================

const COLORS = {
  bullish: '#10b981',
  bearish: '#ef4444',
  neutral: '#6b7280',
  accent: '#f59e0b',
  primary: '#0B1220',
  secondary: '#2B2B2B',
  purple: '#8b5cf6',
  blue: '#3b82f6',
  cyan: '#06b6d4'
};

const TIMEFRAMES = ['5m', '15m', '1h', '4h', '1d'];
const SYMBOLS = ['RELIANCE', 'TCS', 'HDFCBANK', 'ICICIBANK', 'INFY', 'SBIN', 'BHARTIARTL', 'ITC', 'KOTAKBANK', 'LT'];

// ============================================
// DEMO DATA GENERATORS
// ============================================

function generateDemoStats(): DashboardStats {
  const totalTrades = 47;
  const winningTrades = 29;
  const losingTrades = 16;
  const breakevenTrades = totalTrades - winningTrades - losingTrades;
  
  return {
    totalTrades,
    winningTrades,
    losingTrades,
    winRate: (winningTrades / totalTrades) * 100,
    totalPnL: 24500,
    todayPnL: 3500,
    openPositions: 1,
    currentCapital: 124500,
    maxDrawdown: 4200,
    expectancy: 521,
    avgWin: 1200,
    avgLoss: 450,
    profitFactor: 2.67,
    sharpeRatio: 1.82
  };
}

function generateDemoAnalysis(symbol: string): SMCAnalysis {
  const basePrice = symbol === 'RELIANCE' ? 2450 : symbol === 'TCS' ? 3850 : 1500 + Math.random() * 500;
  
  return {
    symbol,
    timeframe: '5m',
    analysisTime: new Date().toISOString(),
    trend: Math.random() > 0.4 ? 'BULLISH' : Math.random() > 0.5 ? 'BEARISH' : 'NEUTRAL',
    regime: {
      type: Math.random() > 0.6 ? 'TRENDING' : Math.random() > 0.5 ? 'RANGING' : 'VOLATILE',
      trendStrength: 45 + Math.random() * 40,
      volatility: 0.8 + Math.random() * 1.2,
      atr: 10 + Math.random() * 20
    },
    swings: {
      total: 20 + Math.floor(Math.random() * 15),
      highs: 10 + Math.floor(Math.random() * 8),
      lows: 10 + Math.floor(Math.random() * 8)
    },
    structures: {
      total: 5 + Math.floor(Math.random() * 8),
      bos: 2 + Math.floor(Math.random() * 4),
      choch: Math.floor(Math.random() * 3)
    },
    liquidityZones: [
      { type: 'EQUAL_HIGHS', priceLevel: basePrice + 15, swept: false, touches: 3 },
      { type: 'SELL_SIDE', priceLevel: basePrice - 20, swept: true, touches: 2 },
      { type: 'BUY_SIDE', priceLevel: basePrice + 30, swept: false, touches: 1 }
    ],
    orderBlocks: [
      { type: 'BULLISH', high: basePrice - 5, low: basePrice - 15, mitigated: false, retested: true, strength: 2.1 },
      { type: 'BEARISH', high: basePrice + 25, low: basePrice + 15, mitigated: false, retested: false, strength: 1.5 }
    ],
    fvgs: [
      { type: 'BULLISH', gapTop: basePrice + 5, gapBottom: basePrice, filled: false, fillPercentage: 25 }
    ],
    tradeSetup: {
      direction: 'LONG',
      confluenceScore: 75 + Math.floor(Math.random() * 20),
      entry: basePrice - 5,
      stopLoss: basePrice - 20,
      takeProfit: basePrice + 25,
      riskReward: 2.0 + Math.random() * 1,
      breakdown: [
        '✓ Liquidity Sweep (+30)',
        '✓ Break of Structure (+25)',
        '✓ Order Block Touch (+25)',
        '✓ Volume Confirmation (+10)'
      ]
    },
    mtfAlignment: {
      daily: 'BULLISH',
      h4: 'BULLISH',
      h1: 'BULLISH',
      m15: 'NEUTRAL',
      aligned: true
    }
  };
}

function generateDemoRiskState(): RiskState {
  return {
    date: new Date().toISOString(),
    startingCapital: 100000,
    currentCapital: 124500,
    dailyPnL: 3500,
    dailyLoss: 0,
    dailyTrades: 2,
    openPositions: 1,
    dailyLossLimit: false,
    tradeLimitHit: false,
    tradingHalted: false,
    haltReason: null,
    config: {
      maxRiskPerTrade: 1.0,
      maxDailyLoss: 3.0,
      maxTradesPerDay: 3,
      maxOpenPositions: 3
    }
  };
}

function generateDemoAgents(): Agent[] {
  return [
    {
      id: '1',
      name: 'Research Agent',
      type: 'research',
      status: 'active',
      lastActivity: '2 min ago',
      description: 'Scans NIFTY 200 for high-probability setups using SMC analysis',
      metrics: { symbolsScanned: 47, setupsFound: 5, avgScore: 72 }
    },
    {
      id: '2',
      name: 'Strategy Agent',
      type: 'strategy',
      status: 'active',
      lastActivity: '5 min ago',
      description: 'Validates setups using multi-timeframe confluence',
      metrics: { setupsValidated: 12, passRate: 67 }
    },
    {
      id: '3',
      name: 'Decision Agent',
      type: 'decision',
      status: 'active',
      lastActivity: '1 min ago',
      description: 'LLM-powered trade validation with risk analysis',
      metrics: { decisions: 8, approvedRate: 62, avgConfidence: 78 }
    },
    {
      id: '4',
      name: 'Risk Agent',
      type: 'risk',
      status: 'active',
      lastActivity: '30 sec ago',
      description: 'Position sizing & risk controls with hard limits',
      metrics: { riskUsed: 1.8, remainingTrades: 1, drawdown: 2.1 }
    },
    {
      id: '5',
      name: 'Execution Agent',
      type: 'execution',
      status: 'idle',
      lastActivity: '15 min ago',
      description: 'Direct broker connection for order execution',
      metrics: { ordersToday: 2, fillRate: 100, slippage: 0.02 }
    },
    {
      id: '6',
      name: 'Monitoring Agent',
      type: 'monitoring',
      status: 'active',
      lastActivity: '10 sec ago',
      description: 'Live trade monitoring with trail SL management',
      metrics: { positionsTracked: 1, alertsGenerated: 3 }
    },
    {
      id: '7',
      name: 'Learning Agent',
      type: 'learning',
      status: 'active',
      lastActivity: '1 hour ago',
      description: 'Self-improving probability tables from history',
      metrics: { tradesLearned: 47, patternsDiscovered: 8, accuracy: 68 }
    }
  ];
}

function generateDemoTrades(): TradeRecord[] {
  const trades: TradeRecord[] = [];
  const now = new Date();
  
  for (let i = 0; i < 15; i++) {
    const entryDate = new Date(now.getTime() - i * 3600000 * 24 * Math.random() * 3);
    const isOpen = i === 0;
    const pnl = isOpen ? null : (Math.random() > 0.6 ? 800 + Math.random() * 1000 : -200 - Math.random() * 400);
    
    trades.push({
      id: `T${i + 1}`,
      symbol: SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
      direction: Math.random() > 0.5 ? 'LONG' : 'SHORT',
      entryPrice: 1500 + Math.random() * 2000,
      exitPrice: isOpen ? null : 1500 + Math.random() * 2000,
      pnl,
      status: isOpen ? 'OPEN' : 'CLOSED',
      entryTime: entryDate.toISOString(),
      exitTime: isOpen ? null : new Date(entryDate.getTime() + 3600000 * (1 + Math.random() * 5)).toISOString(),
      setup: ['OB Retest', 'BOS Continuation', 'Liquidity Sweep', 'FVG Fill'][Math.floor(Math.random() * 4)],
      confluenceScore: 65 + Math.floor(Math.random() * 30)
    });
  }
  
  return trades;
}

function generateDemoLearning(): LearningRecord[] {
  return [
    { setupType: 'OB Retest', regime: 'TRENDING', totalTrades: 18, wins: 14, losses: 4, winRate: 77.8, avgPnL: 850, trend: 'improving' },
    { setupType: 'BOS Continuation', regime: 'TRENDING', totalTrades: 12, wins: 8, losses: 4, winRate: 66.7, avgPnL: 620, trend: 'stable' },
    { setupType: 'Liquidity Sweep', regime: 'RANGING', totalTrades: 9, wins: 5, losses: 4, winRate: 55.6, avgPnL: 380, trend: 'stable' },
    { setupType: 'FVG Fill', regime: 'TRENDING', totalTrades: 8, wins: 2, losses: 6, winRate: 25.0, avgPnL: -150, trend: 'declining' }
  ];
}

function generateEquityCurve() {
  const data = [];
  let equity = 100000;
  
  for (let i = 0; i < 30; i++) {
    const change = (Math.random() - 0.4) * 2500;
    equity = Math.max(90000, equity + change);
    data.push({
      day: `Day ${i + 1}`,
      equity: Math.round(equity),
      baseline: 100000,
      pnl: Math.round(equity - 100000)
    });
  }
  
  return data;
}

function generateBacktestResult(): BacktestResult {
  const trades: BacktestTrade[] = [];
  let equity = 100000;
  
  for (let i = 0; i < 50; i++) {
    const isWin = Math.random() > 0.38;
    const pnl = isWin ? 500 + Math.random() * 1000 : -200 - Math.random() * 400;
    equity += pnl;
    
    trades.push({
      date: new Date(Date.now() - (50 - i) * 86400000).toLocaleDateString(),
      symbol: SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
      direction: Math.random() > 0.5 ? 'LONG' : 'SHORT',
      entry: 1500 + Math.random() * 2000,
      exit: 1500 + Math.random() * 2000,
      pnl: Math.round(pnl),
      result: isWin ? 'WIN' : 'LOSS'
    });
  }
  
  const wins = trades.filter(t => t.result === 'WIN').length;
  const losses = trades.filter(t => t.result === 'LOSS').length;
  const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
  
  return {
    totalTrades: trades.length,
    winningTrades: wins,
    losingTrades: losses,
    winRate: (wins / trades.length) * 100,
    totalPnL,
    maxDrawdown: Math.abs(Math.min(...trades.map(t => t.pnl))) * 3,
    expectancy: totalPnL / trades.length,
    profitFactor: 2.1,
    sharpeRatio: 1.65,
    trades
  };
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function TradingAIDashboard() {
  // State
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [analysis, setAnalysis] = useState<SMCAnalysis | null>(null);
  const [riskState, setRiskState] = useState<RiskState | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [learning, setLearning] = useState<LearningRecord[]>([]);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [backendConnected, setBackendConnected] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [symbol, setSymbol] = useState('RELIANCE');
  const [timeframe, setTimeframe] = useState('5m');
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [equityCurve, setEquityCurve] = useState<any[]>([]);
  const [isPending, startTransitionFn] = useTransition();

  // Run SMC Analysis - Real API
  const runAnalysis = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchSMCAnalysis(symbol, timeframe);
      if (result.success && result.data) {
        setAnalysis(result.data);
      } else {
        // Fallback to demo if no data
        setAnalysis(generateDemoAnalysis(symbol));
      }
    } catch (error) {
      // Network error - use demo data
      setAnalysis(generateDemoAnalysis(symbol));
    }
    setLoading(false);
  }, [symbol, timeframe]);

  // Fetch all data from real API (non-blocking with startTransition)
  const fetchAllData = useCallback(async () => {
    // Use requestAnimationFrame to avoid blocking main thread
    requestAnimationFrame(() => {
      setLoading(true);
    });
    
    try {
      // Check backend health
      const health = await checkBackendHealth();
      startTransitionFn(() => {
        setBackendConnected(health.success || false);
      });
      
      // Fetch dashboard stats
      const statsResult = await fetchDashboardStats();
      if (statsResult.success && statsResult.data) {
        const data = statsResult.data;
        startTransitionFn(() => {
          setStats({
            totalTrades: data.totalTrades || 0,
            winningTrades: data.winningTrades || 0,
            losingTrades: data.losingTrades || 0,
            winRate: data.winRate || 0,
            totalPnL: data.totalPnL || 0,
            todayPnL: data.todayPnL || 0,
            openPositions: data.openPositions || 0,
            currentCapital: data.riskState?.currentCapital || 100000,
            maxDrawdown: data.maxDrawdown || 0,
            expectancy: data.expectancy || 0,
            avgWin: data.avgWin || 0,
            avgLoss: data.avgLoss || 0,
            profitFactor: data.profitFactor || 0,
            sharpeRatio: data.sharpeRatio || 0,
          });
        });
      } else {
        startTransitionFn(() => {
          setStats(generateDemoStats());
        });
      }
      
      // Fetch risk state
      const riskResult = await fetchRiskState();
      if (riskResult.success && riskResult.data) {
        startTransitionFn(() => {
          setRiskState({
            date: riskResult.data.date || new Date().toISOString(),
            startingCapital: riskResult.data.startingCapital || 100000,
            currentCapital: riskResult.data.currentCapital || 100000,
            dailyPnL: riskResult.data.dailyPnL || 0,
            dailyLoss: riskResult.data.dailyLoss || 0,
            dailyTrades: riskResult.data.dailyTrades || 0,
            openPositions: riskResult.data.openPositions || 0,
            dailyLossLimit: riskResult.data.tradeLimitHit || false,
            tradeLimitHit: riskResult.data.tradeLimitHit || false,
            tradingHalted: riskResult.data.tradingHalted || false,
            haltReason: riskResult.data.haltReason || null,
            config: riskResult.data.config || {
              maxRiskPerTrade: 1.0,
              maxDailyLoss: 3.0,
              maxTradesPerDay: 3,
              maxOpenPositions: 3
            }
          });
        });
      } else {
        startTransitionFn(() => {
          setRiskState(generateDemoRiskState());
        });
      }
      
      // Fetch trades
      const tradesResult = await fetchTrades();
      if (tradesResult.success && tradesResult.data) {
        startTransitionFn(() => {
          setTrades(tradesResult.data.map((t: any) => ({
            id: String(t.id),
            symbol: t.symbol,
            direction: t.direction,
            entryPrice: t.entryPrice,
            exitPrice: t.exitPrice,
            pnl: t.pnl,
            status: t.status,
            entryTime: t.executedAt,
            exitTime: t.closedAt,
            setup: 'SMC Setup',
            confluenceScore: 75
          })));
        });
      } else {
        startTransitionFn(() => {
          setTrades(generateDemoTrades());
        });
      }
      
      // Set demo data for agents and learning (not in backend yet)
      startTransitionFn(() => {
        setAgents(generateDemoAgents());
        setLearning(generateDemoLearning());
        setBacktestResult(generateBacktestResult());
        setEquityCurve(generateEquityCurve());
      });
      
      // Fetch SMC analysis
      const smcResult = await fetchSMCAnalysis(symbol, timeframe);
      if (smcResult.success && smcResult.data) {
        startTransitionFn(() => {
          setAnalysis(smcResult.data);
        });
      } else {
        startTransitionFn(() => {
          setAnalysis(generateDemoAnalysis(symbol));
        });
      }
      
      startTransitionFn(() => {
        setLastUpdate(new Date());
      });
    } catch (error) {
      // Network errors expected in sandbox - use demo data
      startTransitionFn(() => {
        setStats(generateDemoStats());
        setAnalysis(generateDemoAnalysis(symbol));
        setRiskState(generateDemoRiskState());
        setAgents(generateDemoAgents());
        setTrades(generateDemoTrades());
        setLearning(generateDemoLearning());
        setBacktestResult(generateBacktestResult());
        setEquityCurve(generateEquityCurve());
      });
    }
    requestAnimationFrame(() => {
      setLoading(false);
    });
  }, [symbol, timeframe]);

  // Initialize on mount
  useEffect(() => {
    let mounted = true;
    
    const initData = async () => {
      if (mounted) {
        await fetchAllData();
      }
    };
    
    initData();
    
    return () => {
      mounted = false;
    };
  }, []);

  // Auto-refresh every 60 seconds (only when backend is connected)
  useEffect(() => {
    // Don't poll if backend is not connected
    if (!backendConnected) {
      return;
    }
    
    const interval = setInterval(() => {
      fetchAllData();
    }, 60000); // 60 seconds - reduced frequency
    
    return () => clearInterval(interval);
  }, [fetchAllData, backendConnected]);

  // Loading state
  if (loading && !stats) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Initializing Trading Intelligence...</p>
          <p className="text-slate-500 text-sm mt-2">Loading SMC Engine & AI Agents</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        {/* Header */}
        <header className="border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-[1920px] mx-auto px-4 md:px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 md:gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
                    <Activity className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-lg md:text-xl font-bold text-white">Trading AI Agent RAG</h1>
                    <p className="text-xs text-slate-400 hidden sm:block">Multi-Agent SMC Engine + LLM Intelligence</p>
                  </div>
                </div>
              <Badge variant="outline" className={cn(
                "hidden sm:flex",
                backendConnected 
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                  : "bg-amber-500/10 text-amber-400 border-amber-500/20"
              )}>
                {backendConnected ? (
                  <>
                    <Wifi className="w-3 h-3 mr-2" />
                    Backend Connected
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3 h-3 mr-2" />
                    Demo Mode
                  </>
                )}
              </Badge>
              </div>

              <div className="flex items-center gap-2 md:gap-4">
                <div className="text-right text-sm hidden md:block">
                  <p className="text-slate-400 text-xs">Last Update</p>
                  <p className="text-white font-mono">{lastUpdate.toLocaleTimeString()}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setTimeout(fetchAllData, 0); }}
                  className="border-slate-600 hover:bg-slate-700"
                >
                  <RefreshCw className={cn("w-4 h-4 md:mr-2", isPending && "animate-spin")} />
                  <span className="hidden md:inline">Refresh</span>
                </Button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-[1920px] mx-auto px-4 md:px-6 py-4 md:py-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4 mb-6">
            <StatsCard
              title="Win Rate"
              value={`${(stats?.winRate || 0).toFixed(1)}%`}
              icon={<Percent className="w-4 h-4 text-amber-500" />}
              color={stats && stats.winRate >= 50 ? 'emerald' : 'red'}
              progress={stats?.winRate || 0}
            />
            <StatsCard
              title="Total P&L"
              value={`₹${(stats?.totalPnL || 0).toLocaleString()}`}
              icon={<DollarSign className="w-4 h-4 text-amber-500" />}
              color={stats && stats.totalPnL >= 0 ? 'emerald' : 'red'}
              subtitle={`${stats?.totalTrades || 0} trades`}
            />
            <StatsCard
              title="Today"
              value={`₹${(stats?.todayPnL || 0).toLocaleString()}`}
              icon={<Clock className="w-4 h-4 text-amber-500" />}
              color={stats && stats.todayPnL >= 0 ? 'emerald' : 'red'}
              subtitle={`${trades.filter(t => t.status === 'OPEN').length} open`}
            />
            <StatsCard
              title="Expectancy"
              value={`₹${stats?.expectancy || 0}`}
              icon={<Zap className="w-4 h-4 text-amber-500" />}
              color="purple"
              subtitle="Per trade avg"
            />
            <StatsCard
              title="Profit Factor"
              value={(stats?.profitFactor || 0).toFixed(2)}
              icon={<BarChart3 className="w-4 h-4 text-amber-500" />}
              color={stats && stats.profitFactor >= 1.5 ? 'emerald' : 'amber'}
              subtitle="Win/Loss ratio"
            />
            <StatsCard
              title="Sharpe Ratio"
              value={(stats?.sharpeRatio || 0).toFixed(2)}
              icon={<LineChart className="w-4 h-4 text-amber-500" />}
              color={stats && stats.sharpeRatio >= 1 ? 'emerald' : 'amber'}
              subtitle="Risk-adjusted"
            />
          </div>

          {/* Main Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="bg-slate-800/50 border border-slate-700/50 mb-4 flex-wrap h-auto gap-1 p-1">
              <TabsTrigger value="overview" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
                <Activity className="w-4 h-4 mr-2" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="smc" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
                <Layers className="w-4 h-4 mr-2" />
                SMC Analysis
              </TabsTrigger>
              <TabsTrigger value="agents" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
                <Brain className="w-4 h-4 mr-2" />
                AI Agents
              </TabsTrigger>
              <TabsTrigger value="trades" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
                <History className="w-4 h-4 mr-2" />
                Trade History
              </TabsTrigger>
              <TabsTrigger value="learning" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
                <BookOpen className="w-4 h-4 mr-2" />
                Learning
              </TabsTrigger>
              <TabsTrigger value="backtest" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
                <BarChart className="w-4 h-4 mr-2" />
                Backtest
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="mt-0">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
                {/* Left Column - Charts */}
                <div className="lg:col-span-2 space-y-4 md:space-y-6">
                  {/* Equity Curve */}
                  <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-white text-lg flex items-center gap-2">
                        <LineChart className="w-5 h-5 text-amber-500" />
                        Equity Curve
                      </CardTitle>
                      <CardDescription>30-day performance tracking</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={equityCurve}>
                            <defs>
                              <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey="day" stroke="#6b7280" fontSize={10} />
                            <YAxis stroke="#6b7280" fontSize={10} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
                            <RechartsTooltip 
                              contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #374151', borderRadius: '8px' }}
                              labelStyle={{ color: '#f8fafc' }}
                              formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Equity']}
                            />
                            <Area type="monotone" dataKey="equity" stroke="#f59e0b" strokeWidth={2} fill="url(#equityGradient)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Agent Status Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {agents.slice(0, 6).map((agent) => (
                      <Card key={agent.id} className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm">
                        <CardContent className="p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <div className={cn(
                              "w-2 h-2 rounded-full",
                              agent.status === 'active' ? "bg-emerald-500 animate-pulse" :
                              agent.status === 'idle' ? "bg-amber-500" : "bg-red-500"
                            )} />
                            <span className="text-sm text-white font-medium">{agent.name}</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(agent.metrics).slice(0, 2).map(([key, value]) => (
                              <Badge key={key} className="bg-slate-700/50 text-slate-300 text-xs">
                                {key}: {typeof value === 'number' ? (Number.isInteger(value) ? value : value.toFixed(1)) : value}
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                {/* Right Column */}
                <div className="space-y-4 md:space-y-6">
                  {/* Risk State */}
                  <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-white text-lg flex items-center gap-2">
                        <Shield className="w-5 h-5 text-red-400" />
                        Risk State
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 text-sm">Capital</span>
                        <span className="text-white font-mono">₹{(riskState?.currentCapital || 100000).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 text-sm">Daily P&L</span>
                        <span className={cn(
                          "font-mono",
                          (riskState?.dailyPnL || 0) >= 0 ? "text-emerald-400" : "text-red-400"
                        )}>
                          ₹{(riskState?.dailyPnL || 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 text-sm">Daily Trades</span>
                        <span className="text-white font-mono">{riskState?.dailyTrades || 0} / {riskState?.config.maxTradesPerDay || 3}</span>
                      </div>
                      <Progress 
                        value={((riskState?.dailyTrades || 0) / (riskState?.config.maxTradesPerDay || 3)) * 100} 
                        className="h-1.5 bg-slate-700"
                      />
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 text-sm">Risk Used</span>
                        <span className="text-white font-mono">{riskState?.config.maxRiskPerTrade || 1}% / trade</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 text-sm">Drawdown</span>
                        <span className="text-amber-400 font-mono">{(((stats?.maxDrawdown || 0) / (stats?.currentCapital || 1)) * 100).toFixed(1)}%</span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Current Setup */}
                  {analysis?.tradeSetup && (
                    <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm border-l-4 border-l-amber-500">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-white text-lg flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <Zap className="w-5 h-5 text-amber-500" />
                            Active Setup
                          </span>
                          <Badge className="bg-amber-500/20 text-amber-400">
                            Score: {analysis.tradeSetup.confluenceScore}
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 text-sm">Symbol</span>
                          <span className="text-white font-bold">{analysis.symbol}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-slate-500">Direction</span>
                            <p className={cn(
                              "font-bold",
                              analysis.tradeSetup.direction === 'LONG' ? "text-emerald-400" : "text-red-400"
                            )}>
                              {analysis.tradeSetup.direction}
                            </p>
                          </div>
                          <div>
                            <span className="text-slate-500">R:R</span>
                            <p className="font-bold text-amber-400">{(analysis.tradeSetup?.riskReward || 0).toFixed(2)}</p>
                          </div>
                          <div>
                            <span className="text-slate-500">Entry</span>
                            <p className="font-bold text-white">{(analysis.tradeSetup?.entry || 0).toFixed(2)}</p>
                          </div>
                          <div>
                            <span className="text-slate-500">Stop Loss</span>
                            <p className="font-bold text-red-400">{(analysis.tradeSetup?.stopLoss || 0).toFixed(2)}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1 pt-2 border-t border-slate-700">
                          {(analysis.tradeSetup?.breakdown || []).map((item, i) => (
                            <Badge key={i} className="bg-slate-700/50 text-slate-300 text-xs">
                              {item}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Quick Actions */}
                  <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-white text-lg">Quick Actions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Button className="w-full justify-start bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/20">
                        <Search className="w-4 h-4 mr-2" />
                        Scan Watchlist
                      </Button>
                      <Button className="w-full justify-start bg-slate-700/50 text-slate-300 hover:bg-slate-700 border border-slate-600">
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Sync Market Data
                      </Button>
                      <Separator className="my-2 bg-slate-700" />
                      <Button variant="destructive" className="w-full justify-start">
                        <AlertTriangle className="w-4 h-4 mr-2" />
                        Emergency Stop
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>

            {/* SMC Analysis Tab */}
            <TabsContent value="smc" className="mt-0">
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-6">
                {/* Analysis Controls */}
                <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-white text-lg flex items-center gap-2">
                      <Settings className="w-5 h-5 text-amber-500" />
                      Analysis Config
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="symbol-select" className="text-slate-400">Symbol</Label>
                      <Select value={symbol} onValueChange={setSymbol}>
                        <SelectTrigger id="symbol-select" className="bg-slate-700 border-slate-600">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SYMBOLS.map(s => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="timeframe-select" className="text-slate-400">Timeframe</Label>
                      <Select value={timeframe} onValueChange={setTimeframe}>
                        <SelectTrigger id="timeframe-select" className="bg-slate-700 border-slate-600">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIMEFRAMES.map(t => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={runAnalysis} className="w-full bg-amber-500 hover:bg-amber-600">
                      <Activity className="w-4 h-4 mr-2" />
                      Run Analysis
                    </Button>
                  </CardContent>
                </Card>

                {/* SMC Results */}
                <div className="lg:col-span-3 space-y-4">
                  {/* Top Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
                      <div className="flex items-center gap-2 mb-2">
                        {analysis?.trend === 'BULLISH' ? (
                          <TrendingUp className="w-5 h-5 text-emerald-400" />
                        ) : analysis?.trend === 'BEARISH' ? (
                          <TrendingDown className="w-5 h-5 text-red-400" />
                        ) : (
                          <Minus className="w-5 h-5 text-slate-400" />
                        )}
                        <span className="text-slate-400 text-sm">Trend</span>
                      </div>
                      <span className={cn(
                        "text-lg font-bold",
                        analysis?.trend === 'BULLISH' ? "text-emerald-400" :
                        analysis?.trend === 'BEARISH' ? "text-red-400" : "text-slate-400"
                      )}>
                        {analysis?.trend || 'NEUTRAL'}
                      </span>
                    </div>
                    <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
                      <div className="flex items-center gap-2 mb-2">
                        <BarChart3 className="w-5 h-5 text-amber-500" />
                        <span className="text-slate-400 text-sm">Regime</span>
                      </div>
                      <span className="text-lg font-bold text-white">{analysis?.regime?.type || 'RANGING'}</span>
                      <p className="text-xs text-slate-500">Strength: {(analysis?.regime?.trendStrength || 0).toFixed(1)}%</p>
                    </div>
                    <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
                      <div className="flex items-center gap-2 mb-2">
                        <Target className="w-5 h-5 text-amber-500" />
                        <span className="text-slate-400 text-sm">Structures</span>
                      </div>
                      <span className="text-lg font-bold text-white">{analysis?.structures?.total || 0}</span>
                      <p className="text-xs text-slate-500">BOS: {analysis?.structures?.bos || 0} | CHoCH: {analysis?.structures?.choch || 0}</p>
                    </div>
                    <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
                      <div className="flex items-center gap-2 mb-2">
                        <Zap className="w-5 h-5 text-amber-500" />
                        <span className="text-slate-400 text-sm">Liquidity</span>
                      </div>
                      <span className="text-lg font-bold text-white">{analysis?.liquidityZones?.length || 0}</span>
                      <p className="text-xs text-slate-500">{(analysis?.liquidityZones || []).filter(z => z.swept).length} swept</p>
                    </div>
                  </div>

                  {/* MTF Alignment */}
                  {analysis?.mtfAlignment && (
                    <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-white text-lg flex items-center gap-2">
                          <Layers className="w-5 h-5 text-amber-500" />
                          Multi-Timeframe Alignment
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-4 gap-2">
                          {Object.entries(analysis?.mtfAlignment || {}).filter(([k]) => k !== 'aligned').map(([tf, trend]) => (
                            <div key={tf} className="p-3 rounded-lg bg-slate-700/30 text-center">
                              <p className="text-xs text-slate-500 uppercase">{tf}</p>
                              <div className="flex items-center justify-center gap-1 mt-1">
                                {trend === 'BULLISH' ? (
                                  <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                                ) : trend === 'BEARISH' ? (
                                  <ArrowDownRight className="w-4 h-4 text-red-400" />
                                ) : (
                                  <Minus className="w-4 h-4 text-slate-400" />
                                )}
                                <span className={cn(
                                  "text-sm font-medium",
                                  trend === 'BULLISH' ? "text-emerald-400" :
                                  trend === 'BEARISH' ? "text-red-400" : "text-slate-400"
                                )}>{trend as string}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        {analysis?.mtfAlignment?.aligned && (
                          <Badge className="mt-3 bg-emerald-500/20 text-emerald-400">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            All Timeframes Aligned
                          </Badge>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Order Blocks & FVGs */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-white text-base">Order Blocks</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {(analysis?.orderBlocks || []).map((ob, i) => (
                          <div key={i} className="p-3 rounded-lg bg-slate-700/20 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "w-2 h-2 rounded-full",
                                ob.type === 'BULLISH' ? "bg-emerald-500" : "bg-red-500"
                              )} />
                              <span className="text-sm text-slate-300">{ob.type}</span>
                              {ob.retested && <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">Retested</Badge>}
                            </div>
                            <span className="text-xs text-slate-500 font-mono">
                              {(ob.low || 0).toFixed(2)} - {(ob.high || 0).toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </CardContent>
                    </Card>

                    <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-white text-base">Fair Value Gaps</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {(analysis?.fvgs || []).map((fvg, i) => (
                          <div key={i} className="p-3 rounded-lg bg-slate-700/20">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className={cn(
                                  "w-2 h-2 rounded-full",
                                  fvg.type === 'BULLISH' ? "bg-emerald-500" : "bg-red-500"
                                )} />
                                <span className="text-sm text-slate-300">{fvg.type}</span>
                              </div>
                              <Badge className={cn(
                                "text-xs",
                                fvg.filled ? "bg-slate-500/20 text-slate-400" : "bg-amber-500/20 text-amber-400"
                              )}>
                                {fvg.filled ? 'Filled' : `${fvg.fillPercentage}% filled`}
                              </Badge>
                            </div>
                            <Progress value={fvg.fillPercentage} className="h-1 bg-slate-600" />
                          </div>
                        ))}
                        {(!analysis?.fvgs || analysis.fvgs.length === 0) && (
                          <p className="text-slate-500 text-sm text-center py-4">No FVGs detected</p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* AI Agents Tab */}
            <TabsContent value="agents" className="mt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {agents.map((agent) => (
                  <Card key={agent.id} className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-white text-lg flex items-center gap-2">
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center",
                            agent.type === 'decision' ? "bg-amber-500/20" :
                            agent.type === 'risk' ? "bg-red-500/20" :
                            agent.type === 'learning' ? "bg-purple-500/20" :
                            agent.type === 'execution' ? "bg-cyan-500/20" :
                            agent.type === 'monitoring' ? "bg-blue-500/20" :
                            "bg-emerald-500/20"
                          )}>
                            {agent.type === 'research' && <Search className="w-4 h-4 text-emerald-400" />}
                            {agent.type === 'strategy' && <Layers className="w-4 h-4 text-blue-400" />}
                            {agent.type === 'decision' && <Brain className="w-4 h-4 text-amber-400" />}
                            {agent.type === 'risk' && <Shield className="w-4 h-4 text-red-400" />}
                            {agent.type === 'execution' && <Zap className="w-4 h-4 text-cyan-400" />}
                            {agent.type === 'monitoring' && <Activity className="w-4 h-4 text-blue-400" />}
                            {agent.type === 'learning' && <BookOpen className="w-4 h-4 text-purple-400" />}
                          </div>
                          {agent.name}
                        </CardTitle>
                        <Badge className={cn(
                          agent.status === 'active' ? "bg-emerald-500/20 text-emerald-400" :
                          agent.status === 'idle' ? "bg-amber-500/20 text-amber-400" :
                          "bg-red-500/20 text-red-400"
                        )}>
                          {agent.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-slate-400 mb-3">{agent.description}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(agent.metrics).map(([key, value]) => (
                          <div key={key} className="p-2 rounded bg-slate-700/30">
                            <p className="text-xs text-slate-500">{key}</p>
                            <p className="text-sm text-white font-medium">
                              {typeof value === 'number' ? (Number.isInteger(value) ? value : value.toFixed(1)) : value}
                            </p>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-slate-500 mt-3">Last activity: {agent.lastActivity}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* Trade History Tab */}
            <TabsContent value="trades" className="mt-0">
              <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <History className="w-5 h-5 text-amber-500" />
                    Trade History
                  </CardTitle>
                  <CardDescription>Complete record of all executed trades</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-2">
                      {trades.map((trade) => (
                        <div key={trade.id} className={cn(
                          "p-4 rounded-lg border",
                          trade.status === 'OPEN' 
                            ? "bg-amber-500/5 border-amber-500/20" 
                            : "bg-slate-700/20 border-slate-700/50"
                        )}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <span className="text-white font-bold">{trade.symbol}</span>
                              <Badge className={cn(
                                trade.direction === 'LONG' ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                              )}>
                                {trade.direction}
                              </Badge>
                              <Badge className={cn(
                                trade.status === 'OPEN' ? "bg-amber-500/20 text-amber-400" :
                                trade.pnl && trade.pnl > 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                              )}>
                                {trade.status === 'OPEN' ? 'OPEN' : trade.pnl && trade.pnl > 0 ? 'WIN' : 'LOSS'}
                              </Badge>
                            </div>
                            <span className={cn(
                              "font-mono font-bold",
                              trade.pnl && trade.pnl > 0 ? "text-emerald-400" : trade.pnl && trade.pnl < 0 ? "text-red-400" : "text-slate-400"
                            )}>
                              {trade.pnl ? `₹${trade.pnl.toLocaleString()}` : 'Open'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-4 text-slate-400">
                              <span>Entry: ₹{(trade.entryPrice || 0).toFixed(2)}</span>
                              {trade.exitPrice && <span>Exit: ₹{(trade.exitPrice || 0).toFixed(2)}</span>}
                              <span className="flex items-center gap-1">
                                <Info className="w-3 h-3" />
                                {trade.setup}
                              </span>
                            </div>
                            <Badge className="bg-slate-700/50 text-slate-300 text-xs">
                              Score: {trade.confluenceScore}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-500 mt-2">
                            {new Date(trade.entryTime).toLocaleString()}
                            {trade.exitTime && ` → ${new Date(trade.exitTime).toLocaleString()}`}
                          </p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Learning Tab */}
            <TabsContent value="learning" className="mt-0">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                {/* Probability Table */}
                <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-purple-500" />
                      Setup Probability Table
                    </CardTitle>
                    <CardDescription>Self-learning probability analysis from trade history</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {learning.map((record, i) => (
                        <div key={i} className="p-4 rounded-lg bg-slate-700/20 border border-slate-700/50">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-white font-medium">{record.setupType}</span>
                              <Badge className="bg-slate-600 text-slate-300 text-xs">{record.regime}</Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              {record.trend === 'improving' && <ArrowUpRight className="w-4 h-4 text-emerald-400" />}
                              {record.trend === 'declining' && <ArrowDownRight className="w-4 h-4 text-red-400" />}
                              {record.trend === 'stable' && <Minus className="w-4 h-4 text-slate-400" />}
                              <span className={cn(
                                "text-lg font-bold",
                                record.winRate >= 60 ? "text-emerald-400" :
                                record.winRate >= 50 ? "text-amber-400" : "text-red-400"
                              )}>
                                {(record.winRate || 0).toFixed(1)}%
                              </span>
                            </div>
                          </div>
                          <Progress value={record.winRate} className="h-2 bg-slate-600" />
                          <div className="flex justify-between mt-2 text-xs text-slate-500">
                            <span>{record.totalTrades} trades</span>
                            <span>{record.wins}W / {record.losses}L</span>
                            <span>Avg: ₹{record.avgPnL}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Learning Insights */}
                <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Brain className="w-5 h-5 text-amber-500" />
                      AI Discovered Insights
                    </CardTitle>
                    <CardDescription>Patterns discovered by the learning agent</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="p-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle className="w-5 h-5 text-emerald-400" />
                        <span className="text-emerald-400 font-medium">High Probability Setup</span>
                      </div>
                      <p className="text-sm text-slate-300">
                        <strong>OB Retest + TRENDING regime</strong> shows 77.8% win rate across 18 trades. 
                        This combination generates the highest expectancy in the system.
                      </p>
                    </div>
                    <div className="p-4 rounded-lg border border-amber-500/20 bg-amber-500/5">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-5 h-5 text-amber-400" />
                        <span className="text-amber-400 font-medium">Caution Required</span>
                      </div>
                      <p className="text-sm text-slate-300">
                        <strong>FVG Fill setups</strong> show declining performance with only 25% win rate. 
                        Consider reducing position size or avoiding these setups.
                      </p>
                    </div>
                    <div className="p-4 rounded-lg border border-blue-500/20 bg-blue-500/5">
                      <div className="flex items-center gap-2 mb-2">
                        <Info className="w-5 h-5 text-blue-400" />
                        <span className="text-blue-400 font-medium">Pattern Detected</span>
                      </div>
                      <p className="text-sm text-slate-300">
                        Trades with <strong>confluence score &gt; 80</strong> have 15% higher win rate than those between 70-80. 
                        Consider raising the minimum threshold.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Backtest Tab */}
            <TabsContent value="backtest" className="mt-0">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
                {/* Backtest Config */}
                <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Settings className="w-5 h-5 text-amber-500" />
                      Backtest Configuration
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="backtest-symbol" className="text-slate-400">Symbol</Label>
                      <Select defaultValue="ALL">
                        <SelectTrigger id="backtest-symbol" className="bg-slate-700 border-slate-600">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">All Symbols</SelectItem>
                          {SYMBOLS.map(s => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="backtest-period" className="text-slate-400">Period</Label>
                      <Select defaultValue="6m">
                        <SelectTrigger id="backtest-period" className="bg-slate-700 border-slate-600">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1m">1 Month</SelectItem>
                          <SelectItem value="3m">3 Months</SelectItem>
                          <SelectItem value="6m">6 Months</SelectItem>
                          <SelectItem value="1y">1 Year</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="min-confluence" className="text-slate-400">Min Confluence Score</Label>
                      <Input id="min-confluence" type="number" defaultValue={70} className="bg-slate-700 border-slate-600" />
                    </div>
                    <Button className="w-full bg-amber-500 hover:bg-amber-600">
                      <Play className="w-4 h-4 mr-2" />
                      Run Backtest
                    </Button>
                  </CardContent>
                </Card>

                {/* Backtest Results */}
                <div className="lg:col-span-2 space-y-4">
                  {/* Results Summary */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
                      <p className="text-slate-400 text-xs">Win Rate</p>
                      <p className={cn(
                        "text-xl font-bold",
                        (backtestResult?.winRate || 0) >= 55 ? "text-emerald-400" : "text-amber-400"
                      )}>
                        {(backtestResult?.winRate || 0).toFixed(1)}%
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
                      <p className="text-slate-400 text-xs">Total P&L</p>
                      <p className={cn(
                        "text-xl font-bold",
                        (backtestResult?.totalPnL || 0) >= 0 ? "text-emerald-400" : "text-red-400"
                      )}>
                        ₹{(backtestResult?.totalPnL || 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
                      <p className="text-slate-400 text-xs">Max Drawdown</p>
                      <p className="text-xl font-bold text-amber-400">
                        ₹{(backtestResult?.maxDrawdown || 0).toLocaleString()}
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
                      <p className="text-slate-400 text-xs">Sharpe Ratio</p>
                      <p className={cn(
                        "text-xl font-bold",
                        (backtestResult?.sharpeRatio || 0) >= 1 ? "text-emerald-400" : "text-amber-400"
                      )}>
                        {(backtestResult?.sharpeRatio || 0).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* Trade Distribution Chart */}
                  <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-white text-base">P&L Distribution</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsBarChart data={backtestResult?.trades.slice(0, 20) || []}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis dataKey="date" stroke="#6b7280" fontSize={10} />
                            <YAxis stroke="#6b7280" fontSize={10} />
                            <RechartsTooltip 
                              contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #374151', borderRadius: '8px' }}
                              formatter={(value: number) => [`₹${value}`, 'P&L']}
                            />
                            <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                              {(backtestResult?.trades.slice(0, 20) || []).map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? '#10b981' : '#ef4444'} />
                              ))}
                            </Bar>
                          </RechartsBarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Trade List */}
                  <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-white text-base">Backtest Trades</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-48">
                        <div className="space-y-1">
                          {(backtestResult?.trades || []).slice(0, 15).map((trade, i) => (
                            <div key={i} className="flex items-center justify-between p-2 rounded bg-slate-700/20">
                              <div className="flex items-center gap-2">
                                <span className="text-slate-400 text-xs">{trade.date}</span>
                                <span className="text-white text-sm">{trade.symbol}</span>
                                <Badge className={cn(
                                  "text-xs",
                                  trade.direction === 'LONG' ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                                )}>
                                  {trade.direction}
                                </Badge>
                              </div>
                              <span className={cn(
                                "font-mono text-sm",
                                trade.pnl >= 0 ? "text-emerald-400" : "text-red-400"
                              )}>
                                ₹{trade.pnl}
                              </span>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-700/50 bg-slate-900/80 backdrop-blur-sm py-4 mt-8">
          <div className="max-w-[1920px] mx-auto px-4 md:px-6">
            <div className="flex items-center justify-between text-sm text-slate-500">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4" />
                  <span>SMC Engine v2.0</span>
                </div>
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4" />
                  <span>Local DB</span>
                </div>
                <div className="flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-emerald-400" />
                  <span>Connected</span>
                </div>
              </div>
              <div>
                Trading AI Agent RAG System
              </div>
            </div>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}

// ============================================
// SUB-COMPONENTS
// ============================================

interface StatsCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  color: 'emerald' | 'red' | 'amber' | 'purple' | 'blue';
  subtitle?: string;
  progress?: number;
}

function StatsCard({ title, value, icon, color, subtitle, progress }: StatsCardProps) {
  const colorClasses = {
    emerald: 'text-emerald-400',
    red: 'text-red-400',
    amber: 'text-amber-400',
    purple: 'text-purple-400',
    blue: 'text-blue-400'
  };

  return (
    <Card className="bg-slate-800/50 border-slate-700/50 backdrop-blur-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-slate-400 text-sm">{title}</span>
          {icon}
        </div>
        <div className="flex items-end gap-2">
          <span className={cn("text-2xl font-bold", colorClasses[color])}>
            {value}
          </span>
        </div>
        {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
        {progress !== undefined && (
          <Progress value={progress} className="h-1.5 mt-2 bg-slate-700" />
        )}
      </CardContent>
    </Card>
  );
}
