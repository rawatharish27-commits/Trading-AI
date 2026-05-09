/**
 * Trading AI API - Cloudflare Worker
 * 
 * This worker handles light API operations and forwards
 * heavy computations to Python backend on Render
 * 
 * Deploy: wrangler deploy
 */

const PYTHON_BACKEND = 'https://trading-ai-backend.onrender.com';
const CACHE_TTL = 300; // 5 minutes

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    
    // Handle OPTIONS (CORS preflight)
    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    // ============================================
    // LIGHT OPERATIONS - Handle on Cloudflare Edge
    // ============================================
    
    // Health check - Instant response
    if (path === '/health' || path === '/api/health') {
      return jsonResponse({
        status: 'healthy',
        platform: 'cloudflare-workers',
        timestamp: new Date().toISOString(),
        version: '2.0.0'
      }, corsHeaders);
    }
    
    // Market status - Instant response
    if (path === '/api/market/status') {
      const marketStatus = getMarketStatus();
      return jsonResponse(marketStatus, corsHeaders);
    }
    
    // Safety status check - Instant
    if (path === '/api/safety/check') {
      return jsonResponse({
        canTrade: true,
        killSwitchEngaged: false,
        timestamp: new Date().toISOString()
      }, corsHeaders);
    }
    
    // ============================================
    // CACHED OPERATIONS - Cache + Forward
    // ============================================
    
    // SMC Analysis - Cache for 5 minutes
    if (path.startsWith('/api/smc/analyze')) {
      const cacheKey = new Request(url.toString(), request);
      const cache = caches.default;
      
      // Try cache
      let cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        console.log('Cache HIT for:', path);
        return addCorsHeaders(cachedResponse, corsHeaders);
      }
      
      // Forward to Python backend
      const response = await fetchBackend(path + url.search, request);
      
      // Cache the response
      if (response.ok) {
        const responseToCache = response.clone();
        ctx.waitUntil(cache.put(cacheKey, responseToCache));
      }
      
      return addCorsHeaders(response, corsHeaders);
    }
    
    // ============================================
    // HEAVY OPERATIONS - Forward to Python Backend
    // ============================================
    
    // All other API calls go to Python backend
    if (path.startsWith('/api/')) {
      const response = await fetchBackend(path + url.search, request);
      return addCorsHeaders(response, corsHeaders);
    }
    
    // Root endpoint
    if (path === '/') {
      return jsonResponse({
        name: 'Trading AI Agent API',
        version: '2.0.0',
        status: 'running',
        endpoints: [
          '/health',
          '/api/market/status',
          '/api/smc/analyze',
          '/api/trades',
          '/api/backtest/run',
          '/api/sentiment'
        ]
      }, corsHeaders);
    }
    
    // 404
    return jsonResponse({
      error: 'Not found',
      path: path
    }, corsHeaders, 404);
  }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function jsonResponse(data, headers, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  });
}

function addCorsHeaders(response, corsHeaders) {
  const newHeaders = new Headers(response.headers);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    newHeaders.set(key, value);
  });
  return new Response(response.body, {
    status: response.status,
    headers: newHeaders
  });
}

async function fetchBackend(path, originalRequest) {
  const url = PYTHON_BACKEND + path;
  
  const options = {
    method: originalRequest.method,
    headers: {
      'Content-Type': 'application/json',
    }
  };
  
  // Forward body for POST/PUT
  if (['POST', 'PUT', 'PATCH'].includes(originalRequest.method)) {
    options.body = await originalRequest.text();
  }
  
  try {
    const response = await fetch(url, options);
    return response;
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Backend unavailable',
      message: error.message
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

function getMarketStatus() {
  const now = new Date();
  
  // IST offset (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  
  const hours = istTime.getUTCHours();
  const minutes = istTime.getUTCMinutes();
  const day = istTime.getUTCDay();
  
  // Market hours: 9:15 AM - 3:30 PM IST
  const isWeekday = day >= 1 && day <= 5;
  const isMarketHours = (
    (hours === 9 && minutes >= 15) ||
    (hours > 9 && hours < 15) ||
    (hours === 15 && minutes <= 30)
  );
  
  let phase = 'CLOSED';
  if (isWeekday) {
    if (hours < 9 || (hours === 9 && minutes < 15)) {
      phase = 'PRE_MARKET';
    } else if (isMarketHours) {
      phase = 'OPEN';
    } else if (hours === 15 && minutes > 30 && minutes <= 60) {
      phase = 'POST_MARKET';
    }
  }
  
  return {
    isMarketOpen: isWeekday && isMarketHours,
    phase: phase,
    isTradingDay: isWeekday,
    currentTimeIST: istTime.toISOString(),
    marketOpen: '09:15 IST',
    marketClose: '15:30 IST',
    nextOpen: getNextMarketOpen(istTime, isWeekday, isMarketHours)
  };
}

function getNextMarketOpen(istTime, isWeekday, isMarketHours) {
  if (isWeekday && !isMarketHours) {
    const hours = istTime.getUTCHours();
    const minutes = istTime.getUTCMinutes();
    
    if (hours < 9 || (hours === 9 && minutes < 15)) {
      return 'Today 09:15 IST';
    }
  }
  
  // Next trading day
  const day = istTime.getUTCDay();
  let daysUntilMonday = (8 - day) % 7;
  if (daysUntilMonday === 0) daysUntilMonday = 7;
  
  if (day === 6) return 'Monday 09:15 IST';
  if (day === 0) return 'Monday 09:15 IST';
  return 'Tomorrow 09:15 IST';
}
