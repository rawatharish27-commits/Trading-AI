'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Target,
  Brain,
  BarChart3,
  RefreshCw,
  Play,
  History,
  BookOpen,
  Layers,
  Wifi,
  Circle,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  Database,
  Search,
  LineChart,
  PieChart,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Sparkles,
  Zap,
  Filter,
  Download,
  Eye,
  Clock,
  Calendar,
  Percent,
  DollarSign,
  Award,
  Lightbulb,
  AlertCircle,
  Cpu,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

// ============================================
// TYPES
// ============================================

interface DataStatus {
  totalStocks: number;
  stocksWithData: number;
  lastSessionDate: string | null;
  lastDataDate: string | null;
  firstDataDate: string | null;
  isUpToDate: boolean;
}

interface TradeSignal {
  id: string;
  stockId: string;
  signalType: string;
  status: string;
  confidence: number;
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  riskReward: number;
  timeframe: string;
  trendDirection: string | null;
  regime: string | null;
  confluenceScore: number | null;
  reasoning: string | null;
  generatedAt: string;
  validTill: string | null;
  activatedAt: string | null;
  closedAt: string | null;
  stock: {
    symbol: string;
    name: string | null;
    sector: string | null;
  };
  tracking?: SignalTracking | null;
}

interface SignalTracking {
  maxProfit: number | null;
  maxLoss: number | null;
  finalResult: string | null;
  finalPnlPercent: number | null;
}

interface LearningRecord {
  id: string;
  setupType: string;
  trendDirection: string | null;
  regime: string | null;
  volumeProfile: string | null;
  sector: string | null;
  result: string;
  pnlPercent: number | null;
  maxDrawdown: number | null;
  maxProfit: number | null;
  whatWorked: string | null;
  whatFailed: string | null;
  improvement: string | null;
  createdAt: string;
}

interface StrategyPerformance {
  id: string;
  strategyName: string;
  totalSignals: number;
  successCount: number;
  lossCount: number;
  successRate: number;
  avgProfit: number;
  avgLoss: number;
  maxProfit: number;
  maxLoss: number;
  isActive: boolean;
}

interface WatchlistItem {
  id: string;
  successRate: number;
  totalSignals: number;
  avgPnl: number;
  stock: {
    symbol: string;
    name: string | null;
    sector: string | null;
  };
}

interface DashboardStats {
  totalSignals: number;
  pendingSignals: number;
  activeSignals: number;
  successSignals: number;
  lossSignals: number;
  winRate: number;
  recentSignals: TradeSignal[];
  recentLearning: LearningRecord[];
}

// ============================================
// API HELPERS
// ============================================

async function apiGet(type: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams({ type, ...params }).toString();
  try {
    const res = await fetch(`/api/trading?${query}`);
    if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
    return await res.json();
  } catch (error) {
    return { success: false, error: 'Network error' };
  }
}

async function apiPost(data: Record<string, unknown>) {
  try {
    const res = await fetch('/api/trading', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
    return await res.json();
  } catch (error) {
    return { success: false, error: 'Network error' };
  }
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function TradingDashboard() {
  // Core State
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Data State
  const [dataStatus, setDataStatus] = useState<DataStatus | null>(null);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [signals, setSignals] = useState<TradeSignal[]>([]);
  const [learningRecords, setLearningRecords] = useState<LearningRecord[]>([]);
  const [strategies, setStrategies] = useState<StrategyPerformance[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  
  // Filter State
  const [signalFilter, setSignalFilter] = useState<string>('all');
  const [syncProgress, setSyncProgress] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // LLM State
  const [llmReady, setLlmReady] = useState(false);
  
  // Check LLM status on mount
  useEffect(() => {
    const checkLLM = async () => {
      try {
        const res = await apiGet('llm', { action: 'status' });
        setLlmReady(res.success && res.data?.initialized);
      } catch {
        setLlmReady(false);
      }
    };
    checkLLM();
  }, []);
  
  // Load initial data
  const loadDashboard = useCallback(async () => {
    setLoading(true);
    
    const [statusRes, dashboardRes] = await Promise.all([
      apiGet('data', { action: 'status' }),
      apiGet('dashboard', { section: 'overview' }),
    ]);
    
    if (statusRes.success && statusRes.data) {
      setDataStatus(statusRes.data);
    }
    
    if (dashboardRes.success && dashboardRes.data) {
      setDashboardStats(dashboardRes.data);
    }
    
    setLoading(false);
  }, []);
  
  // Load tab-specific data
  useEffect(() => {
    const loadTabData = async () => {
      if (activeTab === 'signals') {
        const res = await apiGet('dashboard', { 
          section: 'signals', 
          status: signalFilter === 'all' ? '' : signalFilter 
        });
        if (res.success && res.data) {
          setSignals(res.data.signals || []);
        }
      }
      
      if (activeTab === 'learning') {
        const res = await apiGet('dashboard', { section: 'learning' });
        if (res.success && res.data) {
          setLearningRecords(res.data.records || []);
          setStrategies(res.data.strategies || []);
        }
      }
      
      if (activeTab === 'watchlist') {
        const res = await apiGet('dashboard', { section: 'watchlist' });
        if (res.success && res.data) {
          setWatchlist(res.data);
        }
      }
      
      if (activeTab === 'strategies') {
        const res = await apiGet('dashboard', { section: 'strategies' });
        if (res.success && res.data) {
          setStrategies(res.data);
        }
      }
    };
    
    loadTabData();
  }, [activeTab, signalFilter]);
  
  // Initial load
  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);
  
  // ============================================
  // ACTIONS
  // ============================================
  
  const handleLoadData = async () => {
    setIsSyncing(true);
    setSyncProgress('Initializing stocks...');
    
    try {
      // Initialize stocks first
      const initRes = await apiGet('data', { action: 'init-stocks' });
      
      if (!initRes.success) {
        setSyncProgress('Failed to initialize stocks');
        return;
      }
      
      setSyncProgress(`Initialized ${initRes.data.stocksInitialized} stocks. Fetching data...`);
      
      // Sync data
      const syncRes = await apiPost({
        type: 'fetch',
        action: 'sync',
        years: 2,
      });
      
      if (syncRes.success) {
        setSyncProgress(
          `Sync complete! ${syncRes.data.stocksUpdated} stocks updated, ${syncRes.data.candlesSaved} candles saved.`
        );
        await loadDashboard();
      } else {
        setSyncProgress(`Sync failed: ${syncRes.error}`);
      }
    } catch (error) {
      setSyncProgress('An error occurred during sync');
    } finally {
      setIsSyncing(false);
    }
  };
  
  const handleGenerateSignals = async () => {
    setIsGenerating(true);
    
    try {
      const res = await apiPost({
        type: 'analyze',
        action: 'generate-signals',
      });
      
      if (res.success) {
        await loadDashboard();
        setActiveTab('signals');
      }
    } catch (error) {
      console.error('Error generating signals:', error);
    } finally {
      setIsGenerating(false);
    }
  };
  
  // ============================================
  // RENDER HELPERS
  // ============================================
  
  const formatPrice = (price: number) => 
    `₹${price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  
  const formatPercent = (value: number) => 
    `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  
  const formatDate = (date: string) => 
    new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  
  const formatDateTime = (date: string) =>
    new Date(date).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SUCCESS': return 'text-emerald-400';
      case 'LOSS': return 'text-red-400';
      case 'ACTIVE': return 'text-amber-400';
      case 'PENDING': return 'text-blue-400';
      default: return 'text-slate-400';
    }
  };
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return <Badge className="bg-emerald-500/20 text-emerald-400"><CheckCircle2 className="w-3 h-3 mr-1" />Success</Badge>;
      case 'LOSS':
        return <Badge className="bg-red-500/20 text-red-400"><XCircle className="w-3 h-3 mr-1" />Loss</Badge>;
      case 'ACTIVE':
        return <Badge className="bg-amber-500/20 text-amber-400"><Activity className="w-3 h-3 mr-1" />Active</Badge>;
      case 'PENDING':
        return <Badge className="bg-blue-500/20 text-blue-400"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      default:
        return <Badge className="bg-slate-500/20 text-slate-400">{status}</Badge>;
    }
  };
  
  // ============================================
  // RENDER
  // ============================================
  
  if (loading && !dataStatus) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading Trading System...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
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
                <p className="text-xs text-slate-400">Nifty 500 • Swing Trading • LLM Brain</p>
              </div>
              {llmReady && (
                <Badge className="ml-2 bg-purple-500/20 text-purple-400">
                  <Cpu className="w-2 h-2 mr-1" />
                  LLM Ready
                </Badge>
              )}
              {dataStatus?.isUpToDate && (
                <Badge className="ml-2 bg-emerald-500/20 text-emerald-400">
                  <Circle className="w-2 h-2 mr-1 fill-emerald-400" />
                  Data Up-to-Date
                </Badge>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                onClick={handleLoadData}
                disabled={isSyncing}
                className="bg-amber-500 hover:bg-amber-600 text-black"
              >
                {isSyncing ? (
                  <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Syncing...</>
                ) : (
                  <><Database className="w-4 h-4 mr-2" />Load Data</>
                )}
              </Button>
              <Button
                onClick={handleGenerateSignals}
                disabled={isGenerating || !dataStatus?.isUpToDate}
                variant="outline"
                className="border-amber-500 text-amber-400 hover:bg-amber-500/10"
              >
                {isGenerating ? (
                  <><Sparkles className="w-4 h-4 mr-2 animate-pulse" />Generating...</>
                ) : (
                  <><Sparkles className="w-4 h-4 mr-2" />Generate Signals</>
                )}
              </Button>
            </div>
          </div>
          
          {/* Sync Progress */}
          {syncProgress && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2"
            >
              <Alert className="bg-slate-800/50 border-slate-700">
                <Database className="w-4 h-4" />
                <AlertDescription className="text-slate-300">{syncProgress}</AlertDescription>
              </Alert>
            </motion.div>
          )}
        </div>
      </header>
      
      {/* Main Content */}
      <main className="flex-1 max-w-[1920px] mx-auto w-full px-4 py-4">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          <StatsCard
            title="Win Rate"
            value={`${(dashboardStats?.winRate || 0).toFixed(1)}%`}
            icon={<Target className="w-5 h-5" />}
            color={(dashboardStats?.winRate || 0) >= 60 ? 'emerald' : 'amber'}
          />
          <StatsCard
            title="Total Signals"
            value={(dashboardStats?.totalSignals || 0).toString()}
            icon={<BarChart3 className="w-5 h-5" />}
            color="blue"
          />
          <StatsCard
            title="Success"
            value={(dashboardStats?.successSignals || 0).toString()}
            icon={<CheckCircle2 className="w-5 h-5" />}
            color="emerald"
          />
          <StatsCard
            title="Loss"
            value={(dashboardStats?.lossSignals || 0).toString()}
            icon={<XCircle className="w-5 h-5" />}
            color="red"
          />
          <StatsCard
            title="Active"
            value={(dashboardStats?.activeSignals || 0).toString()}
            icon={<Activity className="w-5 h-5" />}
            color="amber"
          />
          <StatsCard
            title="Pending"
            value={(dashboardStats?.pendingSignals || 0).toString()}
            icon={<Clock className="w-5 h-5" />}
            color="purple"
          />
        </div>
        
        {/* Data Status */}
        {!dataStatus?.isUpToDate && dataStatus && (
          <Alert className="mb-4 bg-amber-500/10 border-amber-500/30">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <AlertTitle className="text-amber-400">Data Sync Required</AlertTitle>
            <AlertDescription className="text-slate-300">
              {dataStatus.totalStocks === 0 
                ? 'No stocks in database. Click "Load Data" to initialize.'
                : `Last data: ${dataStatus.lastDataDate ? formatDate(dataStatus.lastDataDate) : 'Never'}. Click "Load Data" to sync.`
              }
            </AlertDescription>
          </Alert>
        )}
        
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-slate-800/50 border border-slate-700/50 mb-4">
            <TabsTrigger value="overview" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
              <Layers className="w-4 h-4 mr-2" />Overview
            </TabsTrigger>
            <TabsTrigger value="signals" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
              <Zap className="w-4 h-4 mr-2" />Signals
            </TabsTrigger>
            <TabsTrigger value="learning" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
              <Brain className="w-4 h-4 mr-2" />Learning
            </TabsTrigger>
            <TabsTrigger value="strategies" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
              <PieChart className="w-4 h-4 mr-2" />Strategies
            </TabsTrigger>
            <TabsTrigger value="watchlist" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
              <Award className="w-4 h-4 mr-2" />Watchlist
            </TabsTrigger>
          </TabsList>
          
          {/* Overview Tab */}
          <TabsContent value="overview">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Recent Signals */}
              <Card className="bg-slate-800/50 border-slate-700/50">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Zap className="w-5 h-5 text-amber-500" />
                    Recent Signals
                  </CardTitle>
                  <CardDescription>Latest generated trade signals</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    {dashboardStats?.recentSignals && dashboardStats.recentSignals.length > 0 ? (
                      <div className="space-y-2">
                        {dashboardStats.recentSignals.map((signal) => (
                          <div
                            key={signal.id}
                            className="p-3 bg-slate-700/30 rounded-lg border border-slate-600/30"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-white">{signal.stock.symbol}</span>
                                <Badge className={signal.signalType === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}>
                                  {signal.signalType}
                                </Badge>
                                {getStatusBadge(signal.status)}
                              </div>
                              <span className="text-amber-400 font-mono">{signal.confidence.toFixed(0)}%</span>
                            </div>
                            <div className="grid grid-cols-4 gap-2 text-xs">
                              <div>
                                <span className="text-slate-400">Entry</span>
                                <p className="text-white font-mono">{formatPrice(signal.entryPrice)}</p>
                              </div>
                              <div>
                                <span className="text-slate-400">SL</span>
                                <p className="text-red-400 font-mono">{formatPrice(signal.stopLoss)}</p>
                              </div>
                              <div>
                                <span className="text-slate-400">Target</span>
                                <p className="text-emerald-400 font-mono">{formatPrice(signal.targetPrice)}</p>
                              </div>
                              <div>
                                <span className="text-slate-400">R:R</span>
                                <p className="text-amber-400 font-mono">{signal.riskReward.toFixed(2)}</p>
                              </div>
                            </div>
                            {signal.tracking?.finalPnlPercent && (
                              <div className="mt-2 pt-2 border-t border-slate-600/30">
                                <span className={cn(
                                  "font-mono font-bold",
                                  signal.tracking.finalPnlPercent > 0 ? "text-emerald-400" : "text-red-400"
                                )}>
                                  {formatPercent(signal.tracking.finalPnlPercent)}
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-slate-400">
                        <Target className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>No signals generated yet</p>
                        <p className="text-sm">Click "Generate Signals" to start</p>
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
              
              {/* Recent Learning */}
              <Card className="bg-slate-800/50 border-slate-700/50">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Brain className="w-5 h-5 text-amber-500" />
                    Learning History
                  </CardTitle>
                  <CardDescription>Insights from past trades</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    {dashboardStats?.recentLearning && dashboardStats.recentLearning.length > 0 ? (
                      <div className="space-y-2">
                        {dashboardStats.recentLearning.map((record) => (
                          <div
                            key={record.id}
                            className="p-3 bg-slate-700/30 rounded-lg border border-slate-600/30"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Badge className={cn(
                                  record.result === 'SUCCESS' ? 'bg-emerald-500/20 text-emerald-400' :
                                  record.result === 'LOSS' ? 'bg-red-500/20 text-red-400' :
                                  'bg-slate-500/20 text-slate-400'
                                )}>
                                  {record.result}
                                </Badge>
                                <span className="text-slate-300">{record.setupType}</span>
                              </div>
                              <span className={cn(
                                "font-mono",
                                record.pnlPercent && record.pnlPercent > 0 ? "text-emerald-400" : "text-red-400"
                              )}>
                                {record.pnlPercent ? formatPercent(record.pnlPercent) : 'N/A'}
                              </span>
                            </div>
                            {record.whatFailed && (
                              <div className="text-xs text-red-300 bg-red-500/10 p-2 rounded">
                                <span className="font-semibold">Issue:</span> {record.whatFailed}
                              </div>
                            )}
                            {record.improvement && (
                              <div className="text-xs text-amber-300 bg-amber-500/10 p-2 rounded mt-1">
                                <span className="font-semibold">Improvement:</span> {record.improvement}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-slate-400">
                        <BookOpen className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>No learning records yet</p>
                        <p className="text-sm">Complete trades to generate insights</p>
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          {/* Signals Tab */}
          <TabsContent value="signals">
            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white flex items-center gap-2">
                    <Zap className="w-5 h-5 text-amber-500" />
                    Trade Signals
                  </CardTitle>
                  <Select value={signalFilter} onValueChange={setSignalFilter}>
                    <SelectTrigger className="w-32 bg-slate-700 border-slate-600">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="PENDING">Pending</SelectItem>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="SUCCESS">Success</SelectItem>
                      <SelectItem value="LOSS">Loss</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  {signals.length > 0 ? (
                    <div className="space-y-2">
                      {signals.map((signal) => (
                        <div
                          key={signal.id}
                          className="p-4 bg-slate-700/30 rounded-lg border border-slate-600/30 hover:bg-slate-700/50 transition-colors"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div>
                                <span className="font-bold text-white text-lg">{signal.stock.symbol}</span>
                                {signal.stock.name && (
                                  <span className="text-slate-400 text-sm ml-2">{signal.stock.name}</span>
                                )}
                              </div>
                              <Badge className={signal.signalType === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}>
                                {signal.signalType === 'BUY' ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
                                {signal.signalType}
                              </Badge>
                              {getStatusBadge(signal.status)}
                            </div>
                            <div className="text-right">
                              <div className="text-amber-400 font-mono text-lg font-bold">
                                {signal.confidence.toFixed(0)}%
                              </div>
                              <div className="text-slate-400 text-xs">Confidence</div>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-5 gap-4 mb-3">
                            <div className="bg-slate-800/50 p-2 rounded">
                              <span className="text-slate-400 text-xs block">Entry</span>
                              <p className="text-white font-mono font-semibold">{formatPrice(signal.entryPrice)}</p>
                            </div>
                            <div className="bg-red-500/10 p-2 rounded">
                              <span className="text-slate-400 text-xs block">Stop Loss</span>
                              <p className="text-red-400 font-mono font-semibold">{formatPrice(signal.stopLoss)}</p>
                            </div>
                            <div className="bg-emerald-500/10 p-2 rounded">
                              <span className="text-slate-400 text-xs block">Target</span>
                              <p className="text-emerald-400 font-mono font-semibold">{formatPrice(signal.targetPrice)}</p>
                            </div>
                            <div className="bg-slate-800/50 p-2 rounded">
                              <span className="text-slate-400 text-xs block">Risk:Reward</span>
                              <p className="text-amber-400 font-mono font-semibold">{signal.riskReward.toFixed(2)}</p>
                            </div>
                            <div className="bg-slate-800/50 p-2 rounded">
                              <span className="text-slate-400 text-xs block">Holding</span>
                              <p className="text-white font-mono font-semibold">5 Days</p>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <div className="flex items-center gap-4">
                              <span>Generated: {formatDateTime(signal.generatedAt)}</span>
                              {signal.trendDirection && (
                                <span className={signal.trendDirection === 'BULLISH' ? 'text-emerald-400' : 'text-red-400'}>
                                  Trend: {signal.trendDirection}
                                </span>
                              )}
                              {signal.regime && (
                                <span>Regime: {signal.regime}</span>
                              )}
                            </div>
                            {signal.tracking?.finalPnlPercent !== null && signal.tracking?.finalPnlPercent !== undefined && (
                              <span className={cn(
                                "font-mono font-bold text-lg",
                                signal.tracking.finalPnlPercent > 0 ? "text-emerald-400" : "text-red-400"
                              )}>
                                {formatPercent(signal.tracking.finalPnlPercent)}
                              </span>
                            )}
                          </div>
                          
                          {signal.reasoning && (
                            <div className="mt-2 pt-2 border-t border-slate-600/30">
                              {(() => {
                                try {
                                  const reasoning = typeof signal.reasoning === 'string' ? JSON.parse(signal.reasoning) : signal.reasoning;
                                  return (
                                    <>
                                      {reasoning.llmReasoning && (
                                        <div className="mb-2 p-2 bg-purple-500/10 rounded border border-purple-500/20">
                                          <div className="flex items-center gap-1 text-purple-400 text-xs mb-1">
                                            <MessageSquare className="w-3 h-3" />
                                            <span className="font-semibold">LLM Analysis:</span>
                                          </div>
                                          <p className="text-slate-300 text-xs">{reasoning.llmReasoning}</p>
                                        </div>
                                      )}
                                      {reasoning.keyFactors && reasoning.keyFactors.length > 0 && (
                                        <div className="mb-1">
                                          <span className="text-emerald-400 text-xs font-semibold">Key Factors:</span>
                                          <div className="flex flex-wrap gap-1 mt-1">
                                            {reasoning.keyFactors.map((factor: string, i: number) => (
                                              <Badge key={i} variant="outline" className="text-xs border-emerald-500/30 text-emerald-300">
                                                {factor}
                                              </Badge>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      {reasoning.riskFactors && reasoning.riskFactors.length > 0 && (
                                        <div>
                                          <span className="text-red-400 text-xs font-semibold">Risk Factors:</span>
                                          <div className="flex flex-wrap gap-1 mt-1">
                                            {reasoning.riskFactors.map((factor: string, i: number) => (
                                              <Badge key={i} variant="outline" className="text-xs border-red-500/30 text-red-300">
                                                {factor}
                                              </Badge>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      {reasoning.factors && !reasoning.keyFactors && (
                                        <div className="flex flex-wrap gap-1">
                                          {reasoning.factors.map((reason: string, i: number) => (
                                            <Badge key={i} variant="outline" className="text-xs border-slate-600 text-slate-300">
                                              {reason}
                                            </Badge>
                                          ))}
                                        </div>
                                      )}
                                    </>
                                  );
                                } catch {
                                  return (
                                    <div className="flex flex-wrap gap-1">
                                      <Badge variant="outline" className="text-xs border-slate-600 text-slate-300">
                                        {signal.reasoning}
                                      </Badge>
                                    </div>
                                  );
                                }
                              })()}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-slate-400">
                      <Target className="w-16 h-16 mx-auto mb-4 opacity-50" />
                      <p className="text-lg">No signals found</p>
                      <p className="text-sm mt-2">Generate signals or adjust filters</p>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Learning Tab */}
          <TabsContent value="learning">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-amber-500" />
                      Learning Records
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[600px]">
                      {learningRecords.length > 0 ? (
                        <div className="space-y-2">
                          {learningRecords.map((record) => (
                            <div key={record.id} className="p-4 bg-slate-700/30 rounded-lg">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <Badge className={cn(
                                    record.result === 'SUCCESS' ? 'bg-emerald-500/20 text-emerald-400' :
                                    record.result === 'LOSS' ? 'bg-red-500/20 text-red-400' :
                                    'bg-slate-500/20 text-slate-400'
                                  )}>
                                    {record.result === 'SUCCESS' ? <CheckCircle2 className="w-3 h-3 mr-1" /> :
                                     record.result === 'LOSS' ? <XCircle className="w-3 h-3 mr-1" /> :
                                     <MinusCircle className="w-3 h-3 mr-1" />}
                                    {record.result}
                                  </Badge>
                                  <span className="text-white font-medium">{record.setupType}</span>
                                  {record.sector && (
                                    <Badge variant="outline" className="text-slate-400">{record.sector}</Badge>
                                  )}
                                </div>
                                <span className={cn(
                                  "font-mono font-bold",
                                  record.pnlPercent && record.pnlPercent > 0 ? "text-emerald-400" : "text-red-400"
                                )}>
                                  {record.pnlPercent ? formatPercent(record.pnlPercent) : 'N/A'}
                                </span>
                              </div>
                              
                              <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                                {record.trendDirection && (
                                  <div>
                                    <span className="text-slate-400">Trend:</span>
                                    <span className={record.trendDirection === 'BULLISH' ? 'text-emerald-400 ml-1' : 'text-red-400 ml-1'}>
                                      {record.trendDirection}
                                    </span>
                                  </div>
                                )}
                                {record.regime && (
                                  <div>
                                    <span className="text-slate-400">Regime:</span>
                                    <span className="text-white ml-1">{record.regime}</span>
                                  </div>
                                )}
                                {record.volumeProfile && (
                                  <div>
                                    <span className="text-slate-400">Volume:</span>
                                    <span className="text-white ml-1">{record.volumeProfile}</span>
                                  </div>
                                )}
                              </div>
                              
                              {record.whatFailed && (
                                <div className="bg-red-500/10 border border-red-500/30 rounded p-2 text-xs text-red-300 mb-2">
                                  <span className="font-semibold">What went wrong:</span> {record.whatFailed}
                                </div>
                              )}
                              
                              {record.improvement && (
                                <div className="bg-amber-500/10 border border-amber-500/30 rounded p-2 text-xs text-amber-300">
                                  <Lightbulb className="w-3 h-3 inline mr-1" />
                                  <span className="font-semibold">Improvement:</span> {record.improvement}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-12 text-slate-400">
                          <Brain className="w-16 h-16 mx-auto mb-4 opacity-50" />
                          <p>No learning records yet</p>
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
              
              {/* Strategy Summary */}
              <div>
                <Card className="bg-slate-800/50 border-slate-700/50">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <PieChart className="w-5 h-5 text-amber-500" />
                      Strategy Performance
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {strategies.length > 0 ? strategies.map((strategy) => (
                        <div key={strategy.id} className="p-3 bg-slate-700/30 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-white font-medium">{strategy.strategyName}</span>
                            <Badge className={cn(
                              strategy.successRate >= 60 ? 'bg-emerald-500/20 text-emerald-400' :
                              strategy.successRate >= 40 ? 'bg-amber-500/20 text-amber-400' :
                              'bg-red-500/20 text-red-400'
                            )}>
                              {strategy.successRate.toFixed(0)}% Win
                            </Badge>
                          </div>
                          <Progress value={strategy.successRate} className="h-2 bg-slate-700" />
                          <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                            <div>
                              <span className="text-slate-400">Trades</span>
                              <p className="text-white">{strategy.totalSignals}</p>
                            </div>
                            <div>
                              <span className="text-slate-400">Avg Profit</span>
                              <p className="text-emerald-400">{strategy.avgProfit.toFixed(2)}%</p>
                            </div>
                            <div>
                              <span className="text-slate-400">Avg Loss</span>
                              <p className="text-red-400">{strategy.avgLoss.toFixed(2)}%</p>
                            </div>
                          </div>
                        </div>
                      )) : (
                        <div className="text-center py-8 text-slate-400">
                          <p>No strategy data yet</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
          
          {/* Strategies Tab */}
          <TabsContent value="strategies">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {strategies.length > 0 ? strategies.map((strategy) => (
                <Card key={strategy.id} className="bg-slate-800/50 border-slate-700/50">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center justify-between">
                      <span>{strategy.strategyName}</span>
                      {strategy.successRate >= 80 && (
                        <Award className="w-5 h-5 text-amber-400" />
                      )}
                    </CardTitle>
                    <CardDescription>
                      {strategy.totalSignals} signals • {strategy.successCount} wins • {strategy.lossCount} losses
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-slate-400 text-sm">Success Rate</span>
                        <span className={cn(
                          "font-mono font-bold",
                          strategy.successRate >= 60 ? "text-emerald-400" :
                          strategy.successRate >= 40 ? "text-amber-400" : "text-red-400"
                        )}>
                          {strategy.successRate.toFixed(1)}%
                        </span>
                      </div>
                      <Progress 
                        value={strategy.successRate} 
                        className="h-3 bg-slate-700"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="bg-emerald-500/10 p-2 rounded">
                        <span className="text-slate-400 text-xs block">Avg Profit</span>
                        <p className="text-emerald-400 font-mono font-semibold">
                          {formatPercent(strategy.avgProfit)}
                        </p>
                      </div>
                      <div className="bg-red-500/10 p-2 rounded">
                        <span className="text-slate-400 text-xs block">Avg Loss</span>
                        <p className="text-red-400 font-mono font-semibold">
                          {formatPercent(strategy.avgLoss)}
                        </p>
                      </div>
                      <div className="bg-slate-700/30 p-2 rounded">
                        <span className="text-slate-400 text-xs block">Max Profit</span>
                        <p className="text-emerald-400 font-mono">
                          {formatPercent(strategy.maxProfit)}
                        </p>
                      </div>
                      <div className="bg-slate-700/30 p-2 rounded">
                        <span className="text-slate-400 text-xs block">Max Loss</span>
                        <p className="text-red-400 font-mono">
                          {formatPercent(strategy.maxLoss)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )) : (
                <div className="col-span-full text-center py-12 text-slate-400">
                  <PieChart className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p>No strategy performance data yet</p>
                  <p className="text-sm mt-2">Complete trades to build strategy statistics</p>
                </div>
              )}
            </div>
          </TabsContent>
          
          {/* Watchlist Tab */}
          <TabsContent value="watchlist">
            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-500" />
                  High Accuracy Watchlist
                </CardTitle>
                <CardDescription>Stocks with 80%+ success rate (minimum 5 signals)</CardDescription>
              </CardHeader>
              <CardContent>
                {watchlist.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {watchlist.map((item) => (
                      <div
                        key={item.id}
                        className="p-4 bg-gradient-to-br from-amber-500/10 to-orange-500/10 rounded-lg border border-amber-500/30"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <span className="text-white font-bold text-lg">{item.stock.symbol}</span>
                            {item.stock.name && (
                              <p className="text-slate-400 text-sm">{item.stock.name}</p>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="text-amber-400 font-mono font-bold text-xl">
                              {item.successRate.toFixed(0)}%
                            </div>
                            <div className="text-slate-400 text-xs">Success Rate</div>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-slate-400">Signals:</span>
                            <span className="text-white ml-1">{item.totalSignals}</span>
                          </div>
                          <div>
                            <span className="text-slate-400">Avg P&L:</span>
                            <span className={cn("ml-1", item.avgPnl >= 0 ? "text-emerald-400" : "text-red-400")}>
                              {formatPercent(item.avgPnl)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-400">
                    <Award className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p>No high-accuracy stocks yet</p>
                    <p className="text-sm mt-2">Stocks with 80%+ success rate will appear here</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
      
      {/* Footer */}
      <footer className="border-t border-slate-700/50 bg-slate-900/90 py-4 mt-auto">
        <div className="max-w-[1920px] mx-auto px-4 text-center text-sm text-slate-400">
          Trading AI Agent • Nifty 500 • Swing Trading (5-Day Holding) • Learning System
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
  icon,
  color,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  color: 'emerald' | 'red' | 'amber' | 'blue' | 'purple';
}) {
  const colorClasses = {
    emerald: 'text-emerald-400 from-emerald-500/20 to-emerald-500/5',
    red: 'text-red-400 from-red-500/20 to-red-500/5',
    amber: 'text-amber-400 from-amber-500/20 to-amber-500/5',
    blue: 'text-blue-400 from-blue-500/20 to-blue-500/5',
    purple: 'text-purple-400 from-purple-500/20 to-purple-500/5',
  };
  
  return (
    <Card className={`bg-gradient-to-br ${colorClasses[color]} border-slate-700/50`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-slate-400 text-xs">{title}</span>
          <span className={colorClasses[color].split(' ')[0]}>{icon}</span>
        </div>
        <p className={`text-2xl font-bold ${colorClasses[color].split(' ')[0]}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
