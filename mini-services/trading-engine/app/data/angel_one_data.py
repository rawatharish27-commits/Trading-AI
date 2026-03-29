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


# ============================================
# ANGEL ONE PROFILE / HOLDINGS / POSITIONS / FUNDS
# ============================================

def get_profile() -> Optional[Dict[str, Any]]:
    """Get user profile from Angel One"""
    ao = get_angel_one_fetcher()
    
    if not ao.can_connect():
        logger.warning("Angel One credentials not configured")
        return None
    
    try:
        # Login if not connected
        if not ao.is_connected:
            login_result = ao.login()
            if not login_result.get('status'):
                return None
        
        # Get profile using SmartAPI
        profile_data = ao.smart_api.getProfile(ao.smart_api.refresh_token)
        
        if profile_data.get('status') and profile_data.get('data'):
            data = profile_data['data']
            return {
                "client_code": data.get('clientcode', ''),
                "name": data.get('name', ''),
                "email": data.get('email', ''),
                "phone": data.get('mobileno', ''),
                "broker_name": "Angel One",
                "exchanges": data.get('exchanges', []),
                "products": data.get('products', []),
                "client_type": data.get('clienttype', ''),
                "last_login": ao.last_login.isoformat() if ao.last_login else None,
                "source": "angel_one"
            }
        
        return None
        
    except Exception as e:
        logger.error(f"Error getting profile: {e}")
        return None


def get_holdings() -> Optional[List[Dict[str, Any]]]:
    """Get user holdings from Angel One"""
    ao = get_angel_one_fetcher()
    
    if not ao.can_connect():
        logger.warning("Angel One credentials not configured")
        return None
    
    try:
        # Login if not connected
        if not ao.is_connected:
            login_result = ao.login()
            if not login_result.get('status'):
                return None
        
        # Get holdings using SmartAPI
        holdings_data = ao.smart_api.holding()
        
        if holdings_data.get('status') and holdings_data.get('data'):
            holdings = []
            for h in holdings_data['data']:
                holdings.append({
                    "symbol": h.get('symbol', ''),
                    "exchange": h.get('exchange', ''),
                    "quantity": int(h.get('quantity', 0)),
                    "available_quantity": int(h.get('availablequantity', 0)),
                    "average_price": float(h.get('averageprice', 0)),
                    "ltp": float(h.get('ltp', 0)),
                    "pnl": float(h.get('pnl', 0)),
                    "pnl_percent": float(h.get('pnlpercentage', 0)),
                    "product": h.get('producttype', ''),
                    "source": "angel_one"
                })
            
            return holdings
        
        return []
        
    except Exception as e:
        logger.error(f"Error getting holdings: {e}")
        return None


def get_positions() -> Optional[Dict[str, Any]]:
    """Get user positions from Angel One (Net and Day)"""
    ao = get_angel_one_fetcher()
    
    if not ao.can_connect():
        logger.warning("Angel One credentials not configured")
        return None
    
    try:
        # Login if not connected
        if not ao.is_connected:
            login_result = ao.login()
            if not login_result.get('status'):
                return None
        
        # Get positions using SmartAPI
        positions_data = ao.smart_api.position()
        
        net_positions = []
        day_positions = []
        
        if positions_data.get('status') and positions_data.get('data'):
            for p in positions_data['data']:
                position = {
                    "symbol": p.get('symbol', ''),
                    "exchange": p.get('exchange', ''),
                    "trading_symbol": p.get('tradingsymbol', ''),
                    "quantity": int(p.get('quantity', 0)),
                    "average_price": float(p.get('averageprice', 0)),
                    "ltp": float(p.get('ltp', 0)),
                    "pnl": float(p.get('pnl', 0)),
                    "product": p.get('producttype', ''),
                    "type": p.get('type', ''),  # BUY or SELL
                    "source": "angel_one"
                }
                
                if p.get('producttype') == 'CNC':
                    net_positions.append(position)
                else:
                    day_positions.append(position)
        
        return {
            "net_positions": net_positions,
            "day_positions": day_positions,
            "total_positions": len(net_positions) + len(day_positions),
            "source": "angel_one"
        }
        
    except Exception as e:
        logger.error(f"Error getting positions: {e}")
        return None


def get_funds() -> Optional[Dict[str, Any]]:
    """Get user funds/RMS from Angel One"""
    ao = get_angel_one_fetcher()
    
    if not ao.can_connect():
        logger.warning("Angel One credentials not configured")
        return None
    
    try:
        # Login if not connected
        if not ao.is_connected:
            login_result = ao.login()
            if not login_result.get('status'):
                return None
        
        # Get RMS (Risk Management System) data
        rms_data = ao.smart_api.rmsLimit()
        
        if rms_data.get('status') and rms_data.get('data'):
            data = rms_data['data']
            return {
                "available_cash": float(data.get('availablecash', 0)),
                "available_intraday_payin": float(data.get('availableintradaypayin', 0)),
                "available_limit_margin": float(data.get('availablelimitmargin', 0)),
                "margin_used": float(data.get('marginused', 0)),
                "margin_available": float(data.get('marginavailable', 0)),
                "exposure_margin": float(data.get('exposuremargin', 0)),
                "span_margin": float(data.get('spanmargin', 0)),
                "total_balance": float(data.get('net', 0)),
                "source": "angel_one"
            }
        
        return None
        
    except Exception as e:
        logger.error(f"Error getting funds: {e}")
        return None


def get_order_book() -> Optional[List[Dict[str, Any]]]:
    """Get order book from Angel One"""
    ao = get_angel_one_fetcher()
    
    if not ao.can_connect():
        logger.warning("Angel One credentials not configured")
        return None
    
    try:
        # Login if not connected
        if not ao.is_connected:
            login_result = ao.login()
            if not login_result.get('status'):
                return None
        
        # Get order book
        order_data = ao.smart_api.orderBook()
        
        if order_data.get('status') and order_data.get('data'):
            orders = []
            for o in order_data['data']:
                orders.append({
                    "order_id": o.get('orderid', ''),
                    "symbol": o.get('tradingsymbol', ''),
                    "exchange": o.get('exchange', ''),
                    "type": o.get('transactiontype', ''),
                    "order_type": o.get('ordertype', ''),
                    "quantity": int(o.get('quantity', 0)),
                    "filled_quantity": int(o.get('filledquantity', 0)),
                    "price": float(o.get('price', 0)),
                    "average_price": float(o.get('averageprice', 0)),
                    "status": o.get('status', ''),
                    "product": o.get('producttype', ''),
                    "order_time": o.get('updatetime', ''),
                    "source": "angel_one"
                })
            
            return orders
        
        return []
        
    except Exception as e:
        logger.error(f"Error getting order book: {e}")
        return None
