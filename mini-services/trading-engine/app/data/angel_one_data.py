"""
Angel One SmartAPI Data Fetcher
Real-time and Historical Market Data

Features:
- TOTP Authentication
- Historical Candle Data
- Real-time Quotes
- Auto Token Refresh
- Fallback to Yahoo Finance when needed
- Nifty 500 Support

Author: Trading AI Agent
"""

import os
import time
import logging
import asyncio
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Import Nifty 500 symbols
try:
    from app.data.nifty500_symbols import NIFTY_500_SYMBOLS, NIFTY_500_LIST, NIFTY_500_COUNT
    HAS_NIFTY500 = True
except ImportError:
    HAS_NIFTY500 = False
    logger.warning("Nifty 500 symbols not found, using default symbols")

# Check for SmartAPI availability
try:
    from SmartApi import SmartConnect
    SMARTAPI_AVAILABLE = True
except ImportError:
    SMARTAPI_AVAILABLE = False
    logger.warning("SmartAPI not installed. Run: pip install angelone-smartapi")

try:
    import pyotp
    PYOTP_AVAILABLE = True
except ImportError:
    PYOTP_AVAILABLE = False
    logger.warning("pyotp not installed. Run: pip install pyotp")


@dataclass
class MarketCandle:
    """Candle data structure"""
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int
    symbol: str
    timeframe: str


class AngelOneDataFetcher:
    """
    Angel One SmartAPI Data Fetcher
    
    Provides real-time and historical market data from Angel One.
    Falls back to Yahoo Finance if Angel One is unavailable.
    """
    
    # Default Symbol to Token mapping (fallback)
    DEFAULT_SYMBOL_TOKENS = {
        'RELIANCE': '2885',
        'TCS': '11536',
        'HDFCBANK': '1333',
        'INFY': '1594',
        'ICICIBANK': '4963',
        'HINDUNILVR': '14366',
        'SBIN': '3045',
        'BHARTIARTL': '10604',
        'ITC': '1660',
        'KOTAKBANK': '4949',
        'LT': '11483',
        'AXISBANK': '5900',
        'ASIANPAINT': '18069',
        'MARUTI': '10999',
        'SUNPHARMA': '3351',
        'TITAN': '3506',
        'BAJFINANCE': '317',
        'DMART': '14349',
        'WIPRO': '3787',
        'HCLTECH': '7229',
    }
    
    # Load Nifty 500 symbols if available
    if HAS_NIFTY500:
        SYMBOL_TOKENS = NIFTY_500_SYMBOLS
    else:
        SYMBOL_TOKENS = DEFAULT_SYMBOL_TOKENS
    
    # Interval mapping for Angel One API
    INTERVAL_MAP = {
        '1m': 'ONE_MINUTE',
        '5m': 'FIVE_MINUTE',
        '15m': 'FIFTEEN_MINUTE',
        '30m': 'THIRTY_MINUTE',
        '1h': 'ONE_HOUR',
        '1d': 'ONE_DAY'
    }
    
    EXCHANGE_NSE = "NSE"
    
    def __init__(self):
        self.smart_api = None
        self.session_token = None
        self.feed_token = None
        self.last_login = None
        self.is_connected = False
        
        # Get credentials from environment
        self.api_key = os.getenv('ANGEL_ONE_API_KEY', '')
        self.client_code = os.getenv('ANGEL_ONE_CLIENT_CODE', '')
        self.password = os.getenv('ANGEL_ONE_PASSWORD', '')
        self.totp_secret = os.getenv('ANGEL_ONE_TOTP_SECRET', '')
    
    @classmethod
    def get_all_symbols(cls) -> List[str]:
        """Get all supported symbols"""
        return list(cls.SYMBOL_TOKENS.keys())
    
    @classmethod
    def get_symbols_count(cls) -> int:
        """Get count of supported symbols"""
        return len(cls.SYMBOL_TOKENS)
        
    def can_connect(self) -> bool:
        """Check if Angel One credentials are available"""
        return all([
            SMARTAPI_AVAILABLE,
            PYOTP_AVAILABLE,
            self.api_key,
            self.client_code,
            self.password,
            self.totp_secret
        ])
    
    def login(self) -> Dict[str, Any]:
        """Login to Angel One SmartAPI"""
        if not self.can_connect():
            logger.warning("Angel One credentials not configured, using Yahoo Finance fallback")
            return {"status": False, "message": "Credentials not configured"}
        
        try:
            # Initialize SmartConnect
            self.smart_api = SmartConnect(self.api_key)
            
            # Generate TOTP
            totp = pyotp.TOTP(self.totp_secret)
            totp_code = totp.now()
            
            # Login
            data = self.smart_api.generateSession(
                self.client_code,
                self.password,
                totp_code
            )
            
            if data.get('status'):
                self.session_token = data['data']['jwtToken']
                self.feed_token = self.smart_api.getfeedToken()
                self.last_login = datetime.utcnow()
                self.is_connected = True
                
                logger.info(f"✅ Angel One login successful for {self.client_code}")
                
                return {
                    "status": True,
                    "message": "Login successful",
                    "client_code": self.client_code
                }
            else:
                error_msg = data.get('message', 'Unknown error')
                logger.error(f"Angel One login failed: {error_msg}")
                return {"status": False, "message": error_msg}
                
        except Exception as e:
            logger.error(f"Angel One login error: {e}")
            return {"status": False, "message": str(e)}
    
    def logout(self) -> bool:
        """Logout from Angel One"""
        try:
            if self.smart_api:
                self.smart_api.terminateSession(self.client_code)
                self.session_token = None
                self.feed_token = None
                self.is_connected = False
                logger.info("Angel One logged out successfully")
            return True
        except Exception as e:
            logger.error(f"Logout error: {e}")
            return False
    
    def get_symbol_token(self, symbol: str) -> Optional[str]:
        """Get Angel One token for symbol"""
        return self.SYMBOL_TOKENS.get(symbol.upper())
    
    def get_quote(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Get real-time quote from Angel One"""
        token = self.get_symbol_token(symbol)
        
        if not token:
            logger.warning(f"Token not found for symbol: {symbol}")
            return None
        
        if not self.is_connected:
            # Try to login
            login_result = self.login()
            if not login_result.get('status'):
                return None
        
        try:
            response = self.smart_api.ltpData(
                self.EXCHANGE_NSE,
                symbol.upper(),
                token
            )
            
            if response.get('status'):
                data = response['data']
                ltp = float(data.get('ltp', 0))
                prev_close = float(data.get('close', 0))
                
                return {
                    'symbol': symbol,
                    'ltp': ltp,
                    'open': float(data.get('open', 0)),
                    'high': float(data.get('high', 0)),
                    'low': float(data.get('low', 0)),
                    'close': prev_close,
                    'volume': int(data.get('totaltradedvolume', 0)),
                    'change': ltp - prev_close,
                    'change_percent': ((ltp - prev_close) / prev_close * 100) if prev_close else 0,
                    'timestamp': datetime.now().isoformat(),
                    'source': 'angel_one'
                }
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting quote for {symbol}: {e}")
            return None
    
    def get_historical_data(self, 
                           symbol: str, 
                           interval: str = '5m',
                           days: int = 7) -> Optional[List[MarketCandle]]:
        """
        Fetch historical candle data from Angel One
        
        Args:
            symbol: Stock symbol (e.g., 'RELIANCE')
            interval: '1m', '5m', '15m', '30m', '1h', '1d'
            days: Number of days of history
        """
        token = self.get_symbol_token(symbol)
        
        if not token:
            logger.warning(f"Token not found for symbol: {symbol}")
            return None
        
        if not self.is_connected:
            # Try to login
            login_result = self.login()
            if not login_result.get('status'):
                return None
        
        try:
            # Calculate date range
            to_date = datetime.now()
            from_date = to_date - timedelta(days=days)
            
            # Map interval
            ao_interval = self.INTERVAL_MAP.get(interval, 'FIVE_MINUTE')
            
            response = self.smart_api.getCandleData({
                "exchange": self.EXCHANGE_NSE,
                "symboltoken": token,
                "interval": ao_interval,
                "fromdate": from_date.strftime("%Y-%m-%d %H:%M"),
                "todate": to_date.strftime("%Y-%m-%d %H:%M")
            })
            
            if response.get('status') and response.get('data'):
                candles = []
                for c in response['data']:
                    try:
                        # Parse timestamp (format: "2024-01-15T09:15:00+05:30")
                        ts_str = c[0]
                        if 'T' in ts_str:
                            timestamp = datetime.fromisoformat(ts_str.replace('+05:30', '+05:30'))
                        else:
                            timestamp = datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S")
                        
                        candle = MarketCandle(
                            timestamp=timestamp,
                            open=float(c[1]),
                            high=float(c[2]),
                            low=float(c[3]),
                            close=float(c[4]),
                            volume=int(c[5]),
                            symbol=symbol,
                            timeframe=interval
                        )
                        candles.append(candle)
                    except (IndexError, TypeError, ValueError) as e:
                        logger.debug(f"Skipping candle: {e}")
                        continue
                
                logger.info(f"✅ Fetched {len(candles)} candles for {symbol} from Angel One")
                return candles
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting historical data for {symbol}: {e}")
            return None
    
    def get_all_quotes(self, symbols: List[str] = None) -> Dict[str, Dict]:
        """Get quotes for multiple symbols"""
        if symbols is None:
            symbols = list(self.SYMBOL_TOKENS.keys())[:10]
        
        results = {}
        for symbol in symbols:
            quote = self.get_quote(symbol)
            if quote:
                results[symbol] = quote
            time.sleep(0.1)  # Rate limiting
        
        return results


# Singleton instance
_angel_one_fetcher: Optional[AngelOneDataFetcher] = None


def get_angel_one_fetcher() -> AngelOneDataFetcher:
    """Get Angel One data fetcher singleton"""
    global _angel_one_fetcher
    if _angel_one_fetcher is None:
        _angel_one_fetcher = AngelOneDataFetcher()
    return _angel_one_fetcher


def get_real_time_quote(symbol: str) -> Optional[Dict[str, Any]]:
    """Get real-time quote - Angel One with Yahoo Finance fallback"""
    from app.data.market_data import get_live_quote as yahoo_quote
    
    # Try Angel One first
    ao = get_angel_one_fetcher()
    if ao.can_connect():
        quote = ao.get_quote(symbol)
        if quote:
            return quote
    
    # Fallback to Yahoo Finance
    return yahoo_quote(symbol)


def get_real_historical_data(symbol: str, 
                             interval: str = '5m',
                             days: int = 7) -> Optional[List[MarketCandle]]:
    """Get historical data - Angel One with Yahoo Finance fallback"""
    from app.data.market_data import get_historical_candles as yahoo_historical
    
    # Try Angel One first
    ao = get_angel_one_fetcher()
    if ao.can_connect():
        candles = ao.get_historical_data(symbol, interval, days)
        if candles:
            return candles
    
    # Fallback to Yahoo Finance
    yahoo_candles = yahoo_historical(symbol, interval, days)
    if yahoo_candles:
        return yahoo_candles
    
    return None


def fetch_all_symbols_data(symbols: List[str] = None,
                          interval: str = '5m',
                          days: int = 7) -> Dict[str, List[MarketCandle]]:
    """Fetch data for multiple symbols"""
    if symbols is None:
        symbols = list(AngelOneDataFetcher.SYMBOL_TOKENS.keys())
    
    results = {}
    ao = get_angel_one_fetcher()
    
    # Use Angel One if available
    if ao.can_connect():
        for symbol in symbols:
            try:
                candles = ao.get_historical_data(symbol, interval, days)
                if candles:
                    results[symbol] = candles
                time.sleep(0.2)  # Rate limiting
            except Exception as e:
                logger.error(f"Error fetching {symbol}: {e}")
    else:
        # Fallback to Yahoo Finance
        from app.data.market_data import fetch_all_symbols_historical
        yahoo_results = fetch_all_symbols_historical(symbols, interval, days)
        results = yahoo_results
    
    return results
