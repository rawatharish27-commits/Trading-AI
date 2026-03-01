/**
 * Trading AI Agent - API Service
 * Connects frontend to Python backend on Render
 */

// Backend URL from environment variable (set in .env or deployment platform)
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

// Log warning only on client side and only once
if (typeof window !== 'undefined' && !API_BASE_URL) {
  console.warn('NEXT_PUBLIC_API_URL is not set. Running in demo mode.');
}

// Track backend connection status
let backendReachable = false;

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  source?: string;
}

// ============================================
// DASHBOARD API
// ============================================

export async function fetchDashboardStats(): Promise<ApiResponse<any>> {
  try {
    if (!API_BASE_URL) {
      return { success: false, error: 'API URL not configured', source: 'config' };
    }
    const response = await fetch(`${API_BASE_URL}/api/dashboard/stats`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}`, source: 'http' };
    }
    const data = await response.json();
    backendReachable = true;
    return data;
  } catch (error) {
    // Network error - UI will use demo data
    return { success: false, error: 'Backend not reachable', source: 'network' };
  }
}

// ============================================
// SMC ANALYSIS API
// ============================================

export async function fetchSMCAnalysis(symbol: string, timeframe: string = '5m', htfBias: string = 'NEUTRAL'): Promise<ApiResponse<any>> {
  try {
    if (!API_BASE_URL) {
      return { success: false, error: 'API URL not configured', source: 'config' };
    }
    const url = `${API_BASE_URL}/api/smc/analyze?symbol=${symbol}&timeframe=${timeframe}&htf_bias=${htfBias}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}`, source: 'http' };
    }
    const data = await response.json();
    backendReachable = true;
    return data;
  } catch (error) {
    // Network error - UI will use demo data
    return { success: false, error: 'Backend not reachable', source: 'network' };
  }
}

// ============================================
// TRADES API
// ============================================

export async function fetchTrades(status?: string, limit: number = 50): Promise<ApiResponse<any[]>> {
  try {
    if (!API_BASE_URL) {
      return { success: false, error: 'API URL not configured', source: 'config' };
    }
    let url = `${API_BASE_URL}/api/trades?limit=${limit}`;
    if (status) {
      url += `&status=${status}`;
    }
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}`, source: 'http' };
    }
    const data = await response.json();
    backendReachable = true;
    return data;
  } catch (error) {
    // Network error - UI will use demo data
    return { success: false, error: 'Backend not reachable', source: 'network' };
  }
}

export async function createTrade(tradeData: {
  symbol: string;
  direction: string;
  entry_price: number;
  quantity: number;
  stop_loss: number;
  take_profit?: number;
  risk_percent?: number;
}): Promise<ApiResponse<{ trade_id: number }>> {
  try {
    if (!API_BASE_URL) {
      return { success: false, error: 'API URL not configured', source: 'config' };
    }
    const response = await fetch(`${API_BASE_URL}/api/trades`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tradeData),
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}`, source: 'http' };
    }
    return await response.json();
  } catch (error) {
    // Network error
    return { success: false, error: 'Backend not reachable', source: 'network' };
  }
}

export async function closeTrade(tradeId: number, exitPrice: number): Promise<ApiResponse<any>> {
  try {
    if (!API_BASE_URL) {
      return { success: false, error: 'API URL not configured', source: 'config' };
    }
    const response = await fetch(`${API_BASE_URL}/api/trades/close`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trade_id: tradeId, exit_price: exitPrice }),
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}`, source: 'http' };
    }
    return await response.json();
  } catch (error) {
    // Network error
    return { success: false, error: 'Backend not reachable', source: 'network' };
  }
}

// ============================================
// RISK API
// ============================================

export async function fetchRiskState(): Promise<ApiResponse<any>> {
  try {
    if (!API_BASE_URL) {
      return { success: false, error: 'API URL not configured', source: 'config' };
    }
    const response = await fetch(`${API_BASE_URL}/api/risk/state`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}`, source: 'http' };
    }
    const data = await response.json();
    backendReachable = true;
    return data;
  } catch (error) {
    // Network error - UI will use demo data
    return { success: false, error: 'Backend not reachable', source: 'network' };
  }
}

// ============================================
// MARKET DATA API
// ============================================

export async function fetchCandles(symbol: string, timeframe: string = '5m', limit: number = 100): Promise<ApiResponse<any[]>> {
  try {
    if (!API_BASE_URL) {
      return { success: false, error: 'API URL not configured', source: 'config' };
    }
    const url = `${API_BASE_URL}/api/market/candles?symbol=${symbol}&timeframe=${timeframe}&limit=${limit}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}`, source: 'http' };
    }
    return await response.json();
  } catch (error) {
    // Network error
    return { success: false, error: 'Backend not reachable', source: 'network' };
  }
}

export async function addCandles(data: {
  symbol: string;
  timeframe: string;
  candles: Array<{
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }>;
}): Promise<ApiResponse<{ inserted: number }>> {
  try {
    if (!API_BASE_URL) {
      return { success: false, error: 'API URL not configured', source: 'config' };
    }
    const response = await fetch(`${API_BASE_URL}/api/market/candles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}`, source: 'http' };
    }
    return await response.json();
  } catch (error) {
    // Network error
    return { success: false, error: 'Backend not reachable', source: 'network' };
  }
}

// ============================================
// SAFETY / KILL SWITCH API
// ============================================

export async function fetchSafetyStatus(): Promise<ApiResponse<any>> {
  try {
    if (!API_BASE_URL) {
      return { success: false, error: 'API URL not configured', source: 'config' };
    }
    const response = await fetch(`${API_BASE_URL}/api/safety/status`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}`, source: 'http' };
    }
    return await response.json();
  } catch (error) {
    // Network error
    return { success: false, error: 'Backend not reachable', source: 'network' };
  }
}

export async function engageKillSwitch(user: string = 'WEB', reason: string = '', closePositions: boolean = true): Promise<ApiResponse<any>> {
  try {
    if (!API_BASE_URL) {
      return { success: false, error: 'API URL not configured', source: 'config' };
    }
    const response = await fetch(`${API_BASE_URL}/api/safety/kill-switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, reason, close_positions: closePositions }),
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}`, source: 'http' };
    }
    return await response.json();
  } catch (error) {
    // Network error
    return { success: false, error: 'Backend not reachable', source: 'network' };
  }
}

export async function disengageKillSwitch(user: string = 'WEB'): Promise<ApiResponse<any>> {
  try {
    if (!API_BASE_URL) {
      return { success: false, error: 'API URL not configured', source: 'config' };
    }
    const response = await fetch(`${API_BASE_URL}/api/safety/kill-switch?user=${user}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}`, source: 'http' };
    }
    return await response.json();
  } catch (error) {
    // Network error
    return { success: false, error: 'Backend not reachable', source: 'network' };
  }
}

// ============================================
// BACKTEST API
// ============================================

export async function runBacktest(params: {
  symbol: string;
  timeframe?: string;
  initial_capital?: number;
  risk_per_trade?: number;
}): Promise<ApiResponse<any>> {
  try {
    if (!API_BASE_URL) {
      return { success: false, error: 'API URL not configured', source: 'config' };
    }
    const queryParams = new URLSearchParams({
      symbol: params.symbol,
      timeframe: params.timeframe || '5m',
      initial_capital: String(params.initial_capital || 100000),
      risk_per_trade: String(params.risk_per_trade || 1.0),
    });
    
    const response = await fetch(`${API_BASE_URL}/api/backtest/run?${queryParams}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}`, source: 'http' };
    }
    return await response.json();
  } catch (error) {
    // Network error
    return { success: false, error: 'Backend not reachable', source: 'network' };
  }
}

// ============================================
// MULTI-TIMEFRAME API
// ============================================

export async function fetchMTFAnalysis(symbol: string): Promise<ApiResponse<any>> {
  try {
    if (!API_BASE_URL) {
      return { success: false, error: 'API URL not configured', source: 'config' };
    }
    const response = await fetch(`${API_BASE_URL}/api/smc/mtf/${symbol}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}`, source: 'http' };
    }
    return await response.json();
  } catch (error) {
    // Network error
    return { success: false, error: 'Backend not reachable', source: 'network' };
  }
}

// ============================================
// HEALTH CHECK
// ============================================

export async function checkBackendHealth(): Promise<ApiResponse<any>> {
  try {
    if (!API_BASE_URL) {
      return { success: false, error: 'API URL not configured', source: 'config' };
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}`, source: 'http' };
    }
    const data = await response.json();
    backendReachable = true;
    return data;
  } catch (error: any) {
    // Network errors are expected when backend is unreachable (sandbox, CORS, etc.)
    // Don't log to console - the UI handles this gracefully with demo data
    return { success: false, error: 'Backend not reachable', source: 'network' };
  }
}

export async function checkBackendRoot(): Promise<ApiResponse<any>> {
  try {
    if (!API_BASE_URL) {
      return { success: false, error: 'API URL not configured', source: 'config' };
    }
    const response = await fetch(`${API_BASE_URL}/`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}`, source: 'http' };
    }
    return await response.json();
  } catch (error) {
    // Network error
    return { success: false, error: 'Backend not reachable', source: 'network' };
  }
}

// ============================================
// REAL MARKET DATA API
// ============================================

export async function fetchLiveQuote(symbol: string): Promise<ApiResponse<any>> {
  try {
    if (!API_BASE_URL) {
      return { success: false, error: 'API URL not configured', source: 'config' };
    }
    const response = await fetch(`${API_BASE_URL}/api/market/live/${symbol}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}`, source: 'http' };
    }
    return await response.json();
  } catch (error) {
    return { success: false, error: 'Backend not reachable', source: 'network' };
  }
}

export async function fetchAllLiveQuotes(): Promise<ApiResponse<any>> {
  try {
    if (!API_BASE_URL) {
      return { success: false, error: 'API URL not configured', source: 'config' };
    }
    const response = await fetch(`${API_BASE_URL}/api/market/live`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}`, source: 'http' };
    }
    return await response.json();
  } catch (error) {
    return { success: false, error: 'Backend not reachable', source: 'network' };
  }
}

export async function refreshMarketData(symbol: string, timeframe: string = '5m', days: number = 7): Promise<ApiResponse<any>> {
  try {
    if (!API_BASE_URL) {
      return { success: false, error: 'API URL not configured', source: 'config' };
    }
    const response = await fetch(`${API_BASE_URL}/api/market/refresh/${symbol}?timeframe=${timeframe}&days=${days}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}`, source: 'http' };
    }
    return await response.json();
  } catch (error) {
    return { success: false, error: 'Backend not reachable', source: 'network' };
  }
}

export async function refreshAllMarketData(timeframe: string = '5m', days: number = 7): Promise<ApiResponse<any>> {
  try {
    if (!API_BASE_URL) {
      return { success: false, error: 'API URL not configured', source: 'config' };
    }
    const response = await fetch(`${API_BASE_URL}/api/market/refresh-all?timeframe=${timeframe}&days=${days}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}`, source: 'http' };
    }
    return await response.json();
  } catch (error) {
    return { success: false, error: 'Backend not reachable', source: 'network' };
  }
}
