"""
Market Data - Live WebSocket Data Feed
Real-time market data streaming from Angel One

Features:
- WebSocket connection management
- Tick to Candle aggregation
- Multiple timeframe support
- Auto-reconnect on disconnect
- Redis caching for real-time data

Author: Trading AI Agent
"""

from dataclasses import dataclass, field
from typing import List, Dict, Optional, Callable, Any
from datetime import datetime, timedelta
from enum import Enum
import asyncio
import json
import time
from collections import defaultdict

try:
    from SmartApi.smartWebSocketV2 import SmartWebSocketV2
    WEBSOCKET_AVAILABLE = True
except ImportError:
    WEBSOCKET_AVAILABLE = False

from app.core.config import settings
from app.core.logger import logger
from app.core.cache import cache, get_cache
from app.smc import Candle
from app.data.handler import CandleBuilder


class FeedType(Enum):
    """WebSocket feed types"""
    TICK = "tick"
    CANDLE = "candle"
    DEPTH = "depth"


@dataclass
class Tick:
    """Real-time tick data"""
    symbol: str
    token: str
    ltp: float
    volume: int
    open: float
    high: float
    low: float
    close: float
    timestamp: datetime
    trade_count: int = 0
    
    def to_dict(self) -> Dict:
        return {
            "symbol": self.symbol,
            "token": self.token,
            "ltp": self.ltp,
            "volume": self.volume,
            "timestamp": self.timestamp.isoformat()
        }


@dataclass
class Subscription:
    """Symbol subscription"""
    symbol: str
    token: str
    exchange: str = "NSE"
    feed_type: FeedType = FeedType.TICK
    callback: Optional[Callable] = None


class LiveDataFeed:
    """
    Live Market Data Feed Manager
    
    Manages WebSocket connection and data streaming:
    - Connect to Angel One WebSocket
    - Subscribe to symbols
    - Aggregate ticks to candles
    - Cache real-time data
    - Auto-reconnect on failure
    """
    
    # Timeframe mappings
    TIMEFRAME_SECONDS = {
        "1m": 60,
        "5m": 300,
        "15m": 900,
        "1h": 3600,
        "1d": 86400
    }
    
    def __init__(self,
                 auth_token: str = None,
                 api_key: str = None,
                 client_code: str = None,
                 feed_token: str = None,
                 auto_reconnect: bool = True,
                 max_reconnect_attempts: int = 5,
                 reconnect_delay: int = 5):
        """
        Initialize Live Data Feed
        
        Args:
            auth_token: JWT auth token from login
            api_key: Angel One API key
            client_code: Client code
            feed_token: Feed token from login
            auto_reconnect: Enable auto reconnect
            max_reconnect_attempts: Max reconnection attempts
            reconnect_delay: Seconds between reconnect attempts
        """
        self.auth_token = auth_token
        self.api_key = api_key
        self.client_code = client_code
        self.feed_token = feed_token
        
        self.auto_reconnect = auto_reconnect
        self.max_reconnect_attempts = max_reconnect_attempts
        self.reconnect_delay = reconnect_delay
        
        # WebSocket
        self.ws = None
        self.is_connected = False
        self._reconnect_count = 0
        
        # Subscriptions
        self.subscriptions: Dict[str, Subscription] = {}
        
        # Tick data
        self.ticks: Dict[str, List[Tick]] = defaultdict(list)
        
        # Candle builders for each symbol/timeframe
        self.candle_builders: Dict[str, Dict[str, CandleBuilder]] = defaultdict(dict)
        
        # Latest data cache
        self.latest_ticks: Dict[str, Tick] = {}
        self.latest_candles: Dict[str, Dict[str, Candle]] = defaultdict(dict)
        
        # Callbacks
        self._tick_callbacks: List[Callable] = []
        self._candle_callbacks: List[Callable] = []
        self._error_callbacks: List[Callable] = []
        
        # Tasks
        self._running = False
        self._tasks: List[asyncio.Task] = []
    
    def set_credentials(self,
                       auth_token: str,
                       api_key: str,
                       client_code: str,
                       feed_token: str):
        """Set credentials after login"""
        self.auth_token = auth_token
        self.api_key = api_key
        self.client_code = client_code
        self.feed_token = feed_token
    
    async def connect(self) -> bool:
        """
        Connect to WebSocket
        
        Returns:
            True if connected successfully
        """
        if not WEBSOCKET_AVAILABLE:
            logger.warning("WebSocket not available - using simulated mode")
            self.is_connected = True
            self._running = True
            return True
        
        if not all([self.auth_token, self.api_key, self.client_code, self.feed_token]):
            logger.warning("Missing credentials - using simulated mode")
            self.is_connected = True
            self._running = True
            return True
        
        try:
            # Create WebSocket connection
            self.ws = SmartWebSocketV2(
                self.auth_token,
                self.api_key,
                self.client_code,
                self.feed_token
            )
            
            # Set callbacks
            self.ws.on_open = self._on_open
            self.ws.on_data = self._on_data
            self.ws.on_error = self._on_error
            self.ws.on_close = self._on_close
            
            # Connect
            self.ws.connect()
            
            # Wait for connection
            await asyncio.sleep(2)
            
            self._running = True
            logger.info("✅ WebSocket connected successfully")
            return True
            
        except Exception as e:
            logger.error(f"WebSocket connection error: {e}")
            self.is_connected = False
            return False
    
    def _on_open(self, ws):
        """WebSocket open callback"""
        self.is_connected = True
        self._reconnect_count = 0
        logger.info("WebSocket connection opened")
        
        # Resubscribe to symbols
        if self.subscriptions:
            self._resubscribe()
    
    def _on_data(self, ws, message):
        """WebSocket data callback"""
        try:
            data = json.loads(message) if isinstance(message, str) else message
            
            # Parse tick data
            if 'token' in data:
                tick = self._parse_tick(data)
                if tick:
                    self._process_tick(tick)
        
        except Exception as e:
            logger.error(f"Error processing data: {e}")
    
    def _on_error(self, ws, error):
        """WebSocket error callback"""
        logger.error(f"WebSocket error: {error}")
        
        for callback in self._error_callbacks:
            try:
                callback(error)
            except Exception as e:
                logger.error(f"Error callback error: {e}")
    
    def _on_close(self, ws, close_status_code, close_msg):
        """WebSocket close callback"""
        self.is_connected = False
        logger.warning(f"WebSocket closed: {close_status_code} - {close_msg}")
        
        # Auto reconnect
        if self.auto_reconnect and self._running:
            asyncio.create_task(self._reconnect())
    
    async def _reconnect(self):
        """Attempt to reconnect"""
        self._reconnect_count += 1
        
        if self._reconnect_count > self.max_reconnect_attempts:
            logger.error("Max reconnect attempts reached")
            return
        
        logger.info(f"Reconnecting... Attempt {self._reconnect_count}/{self.max_reconnect_attempts}")
        
        await asyncio.sleep(self.reconnect_delay)
        
        if await self.connect():
            logger.info("Reconnected successfully")
    
    def _parse_tick(self, data: Dict) -> Optional[Tick]:
        """Parse tick data from WebSocket message"""
        try:
            token = str(data.get('token', ''))
            
            # Find symbol for token
            symbol = None
            for sub in self.subscriptions.values():
                if sub.token == token:
                    symbol = sub.symbol
                    break
            
            if not symbol:
                return None
            
            return Tick(
                symbol=symbol,
                token=token,
                ltp=float(data.get('ltp', 0)),
                volume=int(data.get('volume', 0)),
                open=float(data.get('open', 0)),
                high=float(data.get('high', 0)),
                low=float(data.get('low', 0)),
                close=float(data.get('last_traded_price', data.get('ltp', 0)) / 100),
                timestamp=datetime.utcnow()
            )
            
        except Exception as e:
            logger.error(f"Error parsing tick: {e}")
            return None
    
    def _process_tick(self, tick: Tick):
        """Process incoming tick"""
        symbol = tick.symbol
        
        # Store tick
        self.ticks[symbol].append(tick)
        self.latest_ticks[symbol] = tick
        
        # Keep only last 1000 ticks
        if len(self.ticks[symbol]) > 1000:
            self.ticks[symbol] = self.ticks[symbol][-1000:]
        
        # Update candle builders
        for timeframe, builder in self.candle_builders[symbol].items():
            builder.add_tick(
                price=tick.ltp,
                volume=tick.volume,
                timestamp=tick.timestamp,
                symbol=symbol
            )
        
        # Cache latest tick
        get_cache().set(f"tick:{symbol}", tick.to_dict(), ttl=60)
        
        # Call tick callbacks
        for callback in self._tick_callbacks:
            try:
                callback(tick)
            except Exception as e:
                logger.error(f"Tick callback error: {e}")
    
    def _resubscribe(self):
        """Resubscribe to all symbols after reconnect"""
        if not self.ws or not self.subscriptions:
            return
        
        tokens = [sub.token for sub in self.subscriptions.values()]
        
        # Subscribe
        self.ws.subscribe(tokens, "tick", "NSE")
        logger.info(f"Resubscribed to {len(tokens)} symbols")
    
    async def subscribe(self,
                       symbol: str,
                       token: str,
                       timeframes: List[str] = None,
                       callback: Callable = None) -> bool:
        """
        Subscribe to symbol for real-time data
        
        Args:
            symbol: Stock symbol
            token: Angel One token
            timeframes: List of timeframes to build candles
            callback: Optional callback for tick data
            
        Returns:
            True if subscribed successfully
        """
        # Create subscription
        subscription = Subscription(
            symbol=symbol,
            token=token,
            callback=callback
        )
        
        self.subscriptions[symbol] = subscription
        
        # Create candle builders
        if timeframes is None:
            timeframes = ["5m", "15m", "1h"]
        
        for tf in timeframes:
            seconds = self.TIMEFRAME_SECONDS.get(tf, 300)
            self.candle_builders[symbol][tf] = CandleBuilder(timeframe_seconds=seconds)
        
        # Subscribe via WebSocket
        if self.ws and self.is_connected:
            try:
                self.ws.subscribe([token], "tick", "NSE")
                logger.info(f"Subscribed to {symbol} ({token})")
                return True
            except Exception as e:
                logger.error(f"Subscribe error: {e}")
                return False
        
        return True
    
    async def unsubscribe(self, symbol: str) -> bool:
        """Unsubscribe from symbol"""
        if symbol not in self.subscriptions:
            return False
        
        subscription = self.subscriptions[symbol]
        
        if self.ws and self.is_connected:
            try:
                self.ws.unsubscribe([subscription.token], "tick", "NSE")
            except Exception as e:
                logger.error(f"Unsubscribe error: {e}")
        
        del self.subscriptions[symbol]
        del self.candle_builders[symbol]
        
        if symbol in self.ticks:
            del self.ticks[symbol]
        
        return True
    
    def on_tick(self, callback: Callable):
        """Register tick callback"""
        self._tick_callbacks.append(callback)
    
    def on_candle(self, callback: Callable):
        """Register candle callback"""
        self._candle_callbacks.append(callback)
    
    def on_error(self, callback: Callable):
        """Register error callback"""
        self._error_callbacks.append(callback)
    
    def get_latest_tick(self, symbol: str) -> Optional[Tick]:
        """Get latest tick for symbol"""
        return self.latest_ticks.get(symbol)
    
    def get_ticks(self, symbol: str, limit: int = 100) -> List[Tick]:
        """Get recent ticks for symbol"""
        return self.ticks.get(symbol, [])[-limit:]
    
    def get_candles(self, symbol: str, timeframe: str = "5m") -> List[Candle]:
        """Get built candles for symbol"""
        if symbol not in self.candle_builders:
            return []
        
        if timeframe not in self.candle_builders[symbol]:
            return []
        
        return self.candle_builders[symbol][timeframe].get_candles()
    
    async def start_simulation(self, symbol: str, initial_price: float = 100):
        """
        Start simulated tick feed for testing
        
        Generates realistic tick data when WebSocket not available
        """
        logger.info(f"Starting simulated feed for {symbol}")
        
        price = initial_price
        
        while self._running:
            # Generate simulated tick
            import random
            
            # Random price movement
            change = random.uniform(-0.5, 0.5)
            price = price * (1 + change / 100)
            
            tick = Tick(
                symbol=symbol,
                token="SIMULATED",
                ltp=price,
                volume=random.randint(100, 10000),
                open=price * 0.999,
                high=price * 1.001,
                low=price * 0.998,
                close=price,
                timestamp=datetime.utcnow(),
                trade_count=random.randint(1, 100)
            )
            
            self._process_tick(tick)
            
            # Wait before next tick
            await asyncio.sleep(1)
    
    async def stop(self):
        """Stop WebSocket connection"""
        self._running = False
        
        # Cancel tasks
        for task in self._tasks:
            task.cancel()
        
        # Close WebSocket
        if self.ws:
            try:
                self.ws.close()
            except:
                pass
        
        self.is_connected = False
        logger.info("WebSocket stopped")


# Singleton instance
_feed_instance: Optional[LiveDataFeed] = None


def get_feed() -> Optional[LiveDataFeed]:
    """Get feed singleton instance"""
    return _feed_instance


def init_feed(auth_token: str = None,
              api_key: str = None,
              client_code: str = None,
              feed_token: str = None) -> LiveDataFeed:
    """Initialize feed singleton"""
    global _feed_instance
    _feed_instance = LiveDataFeed(
        auth_token=auth_token,
        api_key=api_key,
        client_code=client_code,
        feed_token=feed_token
    )
    return _feed_instance
