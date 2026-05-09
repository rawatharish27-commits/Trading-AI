'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Activity, TrendingUp, TrendingDown, Target, Brain, BarChart3, RefreshCw,
  Play, History, BookOpen, Layers, Wifi, Circle, ArrowUpRight, ArrowDownRight,
  Database, Sparkles, Zap, CheckCircle2, XCircle, MinusCircle, Clock,
  AlertCircle, Cpu, MessageSquare, Settings, Power, Bot, Calendar
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

// Types
interface TradeSignal {
  id: string;
  signalType: string;
  status: string;
  confidence: number;
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  riskReward: number;
  generatedAt: string;
  stock: { symbol: string; name: string | null; sector: string | null };
  tracking?: { finalPnlPercent: number | null; finalResult: string | null };
}

interface LearningRecord {
  id: string;
  setupType: string;
  result: string;
  pnlPercent: number | null;
  whatWorked: string | null;
  whatFailed: string | null;
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

interface AutomationStatus {
  status: string;
  database: { totalStocks: number; stocksWithData: number; totalCandles: number };
  signals: { total: number; pending: number; success: number };
  scheduledTasks: string[];
}

// API Helpers
async function apiGet(type: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams({ type, ...params }).toString();
  try {
    const res = await fetch(`/api/trading?${query}`);
    return await res.json();
  } catch {
    return { success: false };
  }
}

async function apiPost(data: Record<string, unknown>) {
  try {
    const res = await fetch('/api/trading', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await res.json();
  } catch {
    return { success: false };
  }
}

async function automationApi(action: string) {
  try {
    const res = await fetch('/api/automation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    return await res.json();
  } catch {
    return { success: false, error: 'Automation service offline' };
  }
}

// Stats Card Component
function StatsCard({ title, value, icon, color }: { title: string; value: string; icon: React.ReactNode; color: string }) {
  const colorClasses: Record<string, string> = {
    emerald: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30',
    red: 'from-red-500/20 to-red-600/10 border-red-500/30',
    amber: 'from-amber-500/20 to-amber-600/10 border-amber-500/30',
    blue: 'from-blue-500/20 to-blue-600/10 border-blue-500/30',
    purple: 'from-purple-500/20 to-purple-600/10 border-purple-500/30',
  };
  
  return (
    <div className={`p-4 rounded-xl bg-gradient-to-br ${colorClasses[color]} border`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-slate-400 text-sm">{title}</span>
        {icon}
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </div>
  );
}

// Main Component
export default function TradingDashboard() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [signals, setSignals] = useState<TradeSignal[]>([]);
  const [signalFilter, setSignalFilter] = useState('all');
  const [automationStatus, setAutomationStatus] = useState<AutomationStatus | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const initialLoadDone = useRef(false);

  // Load Dashboard
  const loadDashboard = useCallback(async () => {
    const [dashRes, statusRes] = await Promise.all([
      apiGet('dashboard', { section: 'overview' }),
      fetch('/api/automation?action=status').then(r => r.json()).catch(() => ({ success: false })),
    ]);
    
    if (dashRes.success) setDashboardStats(dashRes.data);
    if (statusRes.success) setAutomationStatus(statusRes);
    setLoading(false);
    setLastUpdate(new Date());
  }, []);

  // Load signals
  useEffect(() => {
    if (activeTab === 'signals') {
      apiGet('dashboard', { section: 'signals', status: signalFilter === 'all' ? '' : signalFilter })
        .then(res => res.success && setSignals(res.data.signals || []));
    }
  }, [activeTab, signalFilter]);

  // Auto refresh every 30 seconds + initial load
  useEffect(() => {
    // Initial load using ref to prevent strict mode double-fetch
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadDashboard(); // void to explicitly ignore the promise - this is an intentional data fetch
    }
    
    if (!autoRefresh) return;
    const interval = setInterval(loadDashboard, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadDashboard]);

  // Automation Actions
  const runAutomation = async (action: string) => {
    setIsRunning(true);
    const res = await automationApi(action);
    if (res.success) {
      await loadDashboard();
    }
    setIsRunning(false);
  };

  // Format helpers
  const formatPrice = (p: number) => `₹${p.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  const formatPercent = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

  if (loading) {
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
                <h1 className="text-lg font-bold text-white flex items-center gap-2">
                  Trading AI Agent
                  {automationStatus?.status === 'running' && (
                    <Badge className="bg-emerald-500/20 text-emerald-400">
                      <Bot className="w-3 h-3 mr-1" />Automated
                    </Badge>
                  )}
                </h1>
                <p className="text-xs text-slate-400">Nifty 500 • Swing Trading • Auto-Signals</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="text-xs text-slate-400 mr-2">
                Last: {lastUpdate.toLocaleTimeString()}
              </div>
              <Button
                onClick={() => setAutoRefresh(!autoRefresh)}
                variant="ghost"
                size="sm"
                className={autoRefresh ? 'text-emerald-400' : 'text-slate-400'}
              >
                <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                onClick={() => runAutomation('run-all')}
                disabled={isRunning}
                className="bg-amber-500 hover:bg-amber-600 text-black"
              >
                {isRunning ? (
                  <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Running...</>
                ) : (
                  <><Power className="w-4 h-4 mr-2" />Run All</>
                )}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-[1920px] mx-auto w-full px-4 py-4">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          <StatsCard title="Win Rate" value={`${(dashboardStats?.winRate || 0).toFixed(1)}%`} icon={<Target className="w-5 h-5 text-amber-400" />} color={(dashboardStats?.winRate || 0) >= 60 ? 'emerald' : 'amber'} />
          <StatsCard title="Total Signals" value={(dashboardStats?.totalSignals || 0).toString()} icon={<BarChart3 className="w-5 h-5 text-blue-400" />} color="blue" />
          <StatsCard title="Success" value={(dashboardStats?.successSignals || 0).toString()} icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />} color="emerald" />
          <StatsCard title="Loss" value={(dashboardStats?.lossSignals || 0).toString()} icon={<XCircle className="w-5 h-5 text-red-400" />} color="red" />
          <StatsCard title="Active" value={(dashboardStats?.activeSignals || 0).toString()} icon={<Activity className="w-5 h-5 text-amber-400" />} color="amber" />
          <StatsCard title="Pending" value={(dashboardStats?.pendingSignals || 0).toString()} icon={<Clock className="w-5 h-5 text-purple-400" />} color="purple" />
        </div>

        {/* Automation Controls */}
        <Card className="bg-slate-800/50 border-slate-700/50 mb-4">
          <CardContent className="py-4">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => runAutomation('fetch-data')} disabled={isRunning} variant="outline" className="border-blue-500 text-blue-400">
                <Database className="w-4 h-4 mr-2" />Fetch Data
              </Button>
              <Button onClick={() => runAutomation('generate-signals')} disabled={isRunning} variant="outline" className="border-amber-500 text-amber-400">
                <Sparkles className="w-4 h-4 mr-2" />Generate Signals
              </Button>
              <Button onClick={() => runAutomation('track-signals')} disabled={isRunning} variant="outline" className="border-purple-500 text-purple-400">
                <Activity className="w-4 h-4 mr-2" />Track Signals
              </Button>
              <Button onClick={() => runAutomation('run-learning')} disabled={isRunning} variant="outline" className="border-emerald-500 text-emerald-400">
                <Brain className="w-4 h-4 mr-2" />Run Learning
              </Button>
            </div>
            {automationStatus && (
              <div className="mt-3 text-xs text-slate-400 flex gap-4">
                <span>📊 {automationStatus.database?.stocksWithData || 0} stocks</span>
                <span>📈 {automationStatus.database?.totalCandles || 0} candles</span>
                <span>🎯 {automationStatus.signals?.total || 0} signals</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
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
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="bg-slate-800/50 border-slate-700/50">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Zap className="w-5 h-5 text-amber-500" />Recent Signals
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    {dashboardStats?.recentSignals?.length ? (
                      <div className="space-y-2">
                        {dashboardStats.recentSignals.map((s) => (
                          <div key={s.id} className="p-3 bg-slate-700/30 rounded-lg border border-slate-600/30">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-white">{s.stock.symbol}</span>
                                <Badge className={s.signalType === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}>
                                  {s.signalType}
                                </Badge>
                              </div>
                              <span className="text-amber-400 font-mono">{s.confidence.toFixed(0)}%</span>
                            </div>
                            <div className="grid grid-cols-4 gap-2 text-xs">
                              <div><span className="text-slate-400">Entry</span><p className="text-white font-mono">{formatPrice(s.entryPrice)}</p></div>
                              <div><span className="text-slate-400">SL</span><p className="text-red-400 font-mono">{formatPrice(s.stopLoss)}</p></div>
                              <div><span className="text-slate-400">Target</span><p className="text-emerald-400 font-mono">{formatPrice(s.targetPrice)}</p></div>
                              <div><span className="text-slate-400">R:R</span><p className="text-amber-400 font-mono">{s.riskReward.toFixed(2)}</p></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-slate-400">
                        <Target className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>No signals yet. Click "Run All" to start automation.</p>
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card className="bg-slate-800/50 border-slate-700/50">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Brain className="w-5 h-5 text-amber-500" />Learning History
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    {dashboardStats?.recentLearning?.length ? (
                      <div className="space-y-2">
                        {dashboardStats.recentLearning.map((r) => (
                          <div key={r.id} className="p-3 bg-slate-700/30 rounded-lg border border-slate-600/30">
                            <div className="flex items-center justify-between">
                              <Badge className={r.result === 'SUCCESS' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}>
                                {r.result}
                              </Badge>
                              <span className="font-mono">{r.pnlPercent ? formatPercent(r.pnlPercent) : 'N/A'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-slate-400">
                        <BookOpen className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>Learning records will appear after trades complete.</p>
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
                  <CardTitle className="text-white">Trade Signals</CardTitle>
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
                  {signals.length ? (
                    <div className="space-y-2">
                      {signals.map((s) => (
                        <div key={s.id} className="p-4 bg-slate-700/30 rounded-lg border border-slate-600/30">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-lg">{s.stock.symbol}</span>
                              <Badge className={s.signalType === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}>
                                {s.signalType === 'BUY' ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
                                {s.signalType}
                              </Badge>
                              <Badge className={s.status === 'SUCCESS' ? 'bg-emerald-500/20 text-emerald-400' : s.status === 'LOSS' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'}>
                                {s.status}
                              </Badge>
                            </div>
                            <div className="text-amber-400 font-mono text-lg">{s.confidence.toFixed(0)}%</div>
                          </div>
                          <div className="grid grid-cols-4 gap-2 text-sm">
                            <div className="bg-slate-800/50 p-2 rounded"><span className="text-slate-400 text-xs">Entry</span><p className="text-white font-mono">{formatPrice(s.entryPrice)}</p></div>
                            <div className="bg-red-500/10 p-2 rounded"><span className="text-slate-400 text-xs">SL</span><p className="text-red-400 font-mono">{formatPrice(s.stopLoss)}</p></div>
                            <div className="bg-emerald-500/10 p-2 rounded"><span className="text-slate-400 text-xs">Target</span><p className="text-emerald-400 font-mono">{formatPrice(s.targetPrice)}</p></div>
                            <div className="bg-slate-800/50 p-2 rounded"><span className="text-slate-400 text-xs">R:R</span><p className="text-amber-400 font-mono">{s.riskReward.toFixed(2)}</p></div>
                          </div>
                          <div className="text-xs text-slate-400 mt-2">{formatDate(s.generatedAt)}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-slate-400">
                      <Target className="w-16 h-16 mx-auto mb-4 opacity-50" />
                      <p>No signals found</p>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Learning Tab */}
          <TabsContent value="learning">
            <Card className="bg-slate-800/50 border-slate-700/50">
              <CardHeader>
                <CardTitle className="text-white">Learning Records</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-slate-400">
                  <Brain className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p>Learning data will appear after signal tracking completes.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-700/50 bg-slate-900/90 py-3 mt-auto">
        <div className="max-w-[1920px] mx-auto px-4 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-4">
            <span>🤖 Auto-Data: 6:00 PM IST</span>
            <span>🎯 Auto-Signals: 6:30 PM IST</span>
            <span>📊 Auto-Tracking: Hourly</span>
          </div>
          <div className="flex items-center gap-2">
            {automationStatus?.status === 'running' ? (
              <><Circle className="w-2 h-2 fill-emerald-400 text-emerald-400" /><span>Automation Active</span></>
            ) : (
              <><Circle className="w-2 h-2 fill-red-400 text-red-400" /><span>Automation Offline</span></>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
