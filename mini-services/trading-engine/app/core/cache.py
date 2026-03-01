"""
Trading AI Agent RAG - Cache Manager
Redis for real-time data caching

Uses:
- Live market data caching
- Signal caching
- Rate limiting
"""

import json
import redis
from typing import Optional, Any, List
from datetime import datetime
import asyncio

from app.core.config import settings
from app.core.logger import logger


class CacheManager:
    """Redis Cache Manager"""
    
    def __init__(self):
        self.client: Optional[redis.Redis] = None
        self.enabled = settings.REDIS_ENABLED
    
    def connect(self):
        """Connect to Redis"""
        if not self.enabled:
            logger.warning("Redis is disabled, using in-memory cache")
            return False
        
        try:
            self.client = redis.from_url(
                settings.REDIS_URL,
                decode_responses=True,
                socket_connect_timeout=5
            )
            self.client.ping()
            logger.info("✅ Connected to Redis")
            return True
        except Exception as e:
            logger.error(f"❌ Redis connection failed: {e}")
            self.enabled = False
            return False
    
    def disconnect(self):
        """Disconnect from Redis"""
        if self.client:
            self.client.close()
    
    # ========================================
    # Basic Operations
    # ========================================
    
    def set(self, key: str, value: Any, ttl: int = 300) -> bool:
        """Set value with TTL (default 5 minutes)"""
        if not self.enabled or not self.client:
            return False
        
        try:
            serialized = json.dumps(value) if not isinstance(value, str) else value
            return self.client.setex(key, ttl, serialized)
        except Exception as e:
            logger.error(f"Cache set error: {e}")
            return False
    
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache"""
        if not self.enabled or not self.client:
            return None
        
        try:
            value = self.client.get(key)
            if value:
                try:
                    return json.loads(value)
                except:
                    return value
            return None
        except Exception as e:
            logger.error(f"Cache get error: {e}")
            return None
    
    def delete(self, key: str) -> bool:
        """Delete key from cache"""
        if not self.enabled or not self.client:
            return False
        
        try:
            return bool(self.client.delete(key))
        except Exception as e:
            logger.error(f"Cache delete error: {e}")
            return False
    
    # ========================================
    # Market Data Cache
    # ========================================
    
    def cache_candle(self, symbol: str, timeframe: str, candle: dict, ttl: int = 60):
        """Cache latest candle"""
        key = f"candle:{symbol}:{timeframe}"
        return self.set(key, candle, ttl)
    
    def get_cached_candle(self, symbol: str, timeframe: str) -> Optional[dict]:
        """Get cached candle"""
        key = f"candle:{symbol}:{timeframe}"
        return self.get(key)
    
    def cache_candles(self, symbol: str, timeframe: str, candles: List[dict], ttl: int = 300):
        """Cache multiple candles"""
        key = f"candles:{symbol}:{timeframe}"
        return self.set(key, candles, ttl)
    
    def get_cached_candles(self, symbol: str, timeframe: str) -> Optional[List[dict]]:
        """Get cached candles"""
        key = f"candles:{symbol}:{timeframe}"
        return self.get(key)
    
    # ========================================
    # SMC Analysis Cache
    # ========================================
    
    def cache_smc_analysis(self, symbol: str, timeframe: str, analysis: dict, ttl: int = 300):  # 5 minutes TTL
        """Cache SMC analysis result"""
        key = f"smc:{symbol}:{timeframe}"
        
        # Convert datetime objects to strings
        def serialize(obj):
            if isinstance(obj, datetime):
                return obj.isoformat()
            elif isinstance(obj, dict):
                return {k: serialize(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [serialize(i) for i in obj]
            return obj
        
        return self.set(key, serialize(analysis), ttl)
    
    def get_cached_smc(self, symbol: str, timeframe: str) -> Optional[dict]:
        """Get cached SMC analysis"""
        key = f"smc:{symbol}:{timeframe}"
        return self.get(key)
    
    # ========================================
    # Signal Cache
    # ========================================
    
    def cache_signal(self, symbol: str, signal: dict, ttl: int = 300):
        """Cache trade signal"""
        key = f"signal:{symbol}"
        return self.set(key, signal, ttl)
    
    def get_cached_signal(self, symbol: str) -> Optional[dict]:
        """Get cached signal"""
        key = f"signal:{symbol}"
        return self.get(key)
    
    # ========================================
    # Risk State Cache
    # ========================================
    
    def cache_risk_state(self, risk_state: dict, ttl: int = 3600):
        """Cache daily risk state"""
        return self.set("risk:state", risk_state, ttl)
    
    def get_cached_risk_state(self) -> Optional[dict]:
        """Get cached risk state"""
        return self.get("risk:state")
    
    # ========================================
    # Watchlist Cache
    # ========================================
    
    def cache_watchlist(self, watchlist: List[str], ttl: int = 3600):
        """Cache watchlist"""
        return self.set("watchlist", watchlist, ttl)
    
    def get_cached_watchlist(self) -> Optional[List[str]]:
        """Get cached watchlist"""
        return self.get("watchlist")


# In-Memory Fallback Cache
class MemoryCache:
    """Simple in-memory cache for when Redis is unavailable"""
    
    def __init__(self):
        self._cache = {}
        self._expiry = {}
    
    def set(self, key: str, value: Any, ttl: int = 300) -> bool:
        import time
        self._cache[key] = value
        self._expiry[key] = time.time() + ttl
        return True
    
    def get(self, key: str) -> Optional[Any]:
        import time
        if key not in self._cache:
            return None
        if time.time() > self._expiry.get(key, 0):
            del self._cache[key]
            del self._expiry[key]
            return None
        return self._cache[key]
    
    def delete(self, key: str) -> bool:
        if key in self._cache:
            del self._cache[key]
            del self._expiry[key]
            return True
        return False


# Global cache instance
cache = CacheManager()
memory_cache = MemoryCache()


def get_cache():
    """Get cache instance (Redis or Memory fallback)"""
    if cache.enabled and cache.client:
        return cache
    return memory_cache
