"""
Angel One SmartAPI Integration for Real Market Data
Fetches real-time and historical candle data from NSE/BSE
"""

import requests
import pyotp
import json
import time
import logging
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class Candle:
    """Candle data structure"""
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int
    symbol: str
    timeframe: str


class AngelOneClient:
    """
    Angel One SmartAPI Client for fetching market data
    
    Features:
    - Login with TOTP authentication
    - Fetch historical candle data
    - Get real-time quotes
    - Generate session tokens
    """
    
    BASE_URL = "https://apiconnect.angelbroking.com"
    
    # Symbol tokens for NIFTY 50 stocks
    SYMBOL_TOKENS = {
        'RELIANCE': '2885',
        'TCS': '11536',
        'HDFCBANK': '1333',
        'ICICIBANK': '4963',
        'INFY': '1594',
        'SBIN': '3045',
        'BHARTIARTL': '10604',
        'ITC': '1660',
        'KOTAKBANK': '4923',
        'LT': '11483',
        'AXISBANK': '5900',
        'BAJFINANCE': '317',
        'HINDUNILVR': '1353',
        'MARUTI': '10999',
        'ASIANPAINT': '1808',
        'SUNPHARMA': '3351',
        'DMART': '12795',
        'WIPRO': '3787',
        'ULTRACEMCO': '2912',
        'NTPC': '11630',
        'POWERGRID': '14977',
        'TITAN': '3506',
        'NESTLEIND': '17963',
        'HCLTECH': '1901',
        'GRASIM': '1232',
        'ONGC': '2475',
        'JSWSTEEL': '11723',
        'TATAMOTORS': '3456',
        'M&M': '1348',
        'ADANIENT': '3154',
    }
    
    def __init__(self, api_key: str, api_secret: str, client_code: str, 
                 password: str, totp_secret: str):
        self.api_key = api_key
        self.api_secret = api_secret
        self.client_code = client_code
        self.password = password
        self.totp_secret = totp_secret
        
        self.session_token: Optional[str] = None
        self.refresh_token: Optional[str] = None
        self.feed_token: Optional[str] = None
        self.last_login: Optional[datetime] = None
        
        self._session = requests.Session()
        self._session.headers.update({
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-UserType': 'USER',
            'X-SourceID': 'WEB',
            'X-ClientLocalIP': '127.0.0.1',
            'X-ClientPublicIP': '106.193.147.98',
            'X-MACAddress': 'fe80::216e:6507:4b90:3516',
            'X-PrivateKey': self.api_key,
        })
    
    def login(self) -> bool:
        """
        Login to Angel One API using TOTP
        Returns True if successful
        """
        try:
            # Generate TOTP
            totp = pyotp.TOTP(self.totp_secret)
            totp_code = totp.now()
            
            # Login request
            url = f"{self.BASE_URL}/rest/auth/angelbroking/user/v1/loginByPassword"
            
            payload = {
                "clientcode": self.client_code,
                "password": self.password,
                "totp": totp_code
            }
            
            response = self._session.post(url, json=payload)
            data = response.json()
            
            if data.get('status') and data.get('data'):
                self.session_token = data['data']['jwtToken']
                self.refresh_token = data['data']['refreshToken']
                self.feed_token = data['data']['feedToken']
                self.last_login = datetime.now()
                
                # Update headers with session token
                self._session.headers.update({
                    'Authorization': f"Bearer {self.session_token}"
                })
                
                logger.info(f"✅ Angel One login successful for {self.client_code}")
                return True
            else:
                logger.error(f"❌ Angel One login failed: {data.get('message', 'Unknown error')}")
                return False
                
        except Exception as e:
            logger.error(f"❌ Angel One login error: {e}")
            return False
    
    def logout(self) -> bool:
        """Logout from Angel One API"""
        try:
            url = f"{self.BASE_URL}/rest/secure/angelbroking/user/v1/logout"
            response = self._session.post(url, json={"clientcode": self.client_code})
            self.session_token = None
            self.refresh_token = None
            self.feed_token = None
            logger.info("✅ Angel One logged out")
            return True
        except Exception as e:
            logger.error(f"Logout error: {e}")
            return False
    
    def get_quote(self, symbol: str) -> Optional[Dict[str, Any]]:
        """
        Get real-time quote for a symbol
        
        Args:
            symbol: Stock symbol (e.g., 'RELIANCE')
            
        Returns:
            Quote data or None
        """
        if not self.session_token:
            if not self.login():
                return None
        
        try:
            token = self.SYMBOL_TOKENS.get(symbol)
            if not token:
                logger.warning(f"Symbol token not found for {symbol}")
                return None
            
            url = f"{self.BASE_URL}/rest/secure/angelbroking/market/v1/quote"
            
            payload = {
                "mode": "FULL",
                "exchangeTokens": {
                    "NSE": [token]
                }
            }
            
            response = self._session.post(url, json=payload)
            data = response.json()
            
            if data.get('status') and data.get('data'):
                quote_data = data['data']['fetched'][0]
                return {
                    'symbol': symbol,
                    'ltp': float(quote_data.get('ltp', 0)),
                    'open': float(quote_data.get('open', 0)),
                    'high': float(quote_data.get('high', 0)),
                    'low': float(quote_data.get('low', 0)),
                    'close': float(quote_data.get('close', 0)),
                    'volume': int(quote_data.get('tradeVolume', 0)),
                    'change': float(quote_data.get('netChange', 0)),
                    'change_percent': float(quote_data.get('perChange', 0)),
                    'timestamp': datetime.now().isoformat()
                }
            else:
                logger.error(f"Quote fetch failed: {data.get('message')}")
                return None
                
        except Exception as e:
            logger.error(f"Quote fetch error: {e}")
            return None
    
    def get_historical_data(self, symbol: str, interval: str = 'FIVE_MINUTE',
                           days: int = 7) -> Optional[List[Candle]]:
        """
        Fetch historical candle data
        
        Args:
            symbol: Stock symbol (e.g., 'RELIANCE')
            interval: Candle interval (ONE_MINUTE, FIVE_MINUTE, FIFTEEN_MINUTE, 
                     THIRTY_MINUTE, ONE_HOUR, ONE_DAY)
            days: Number of days of historical data
            
        Returns:
            List of Candle objects
        """
        if not self.session_token:
            if not self.login():
                return None
        
        try:
            token = self.SYMBOL_TOKENS.get(symbol)
            if not token:
                logger.warning(f"Symbol token not found for {symbol}")
                return None
            
            # Calculate date range
            to_date = datetime.now()
            from_date = to_date - timedelta(days=days)
            
            url = f"{self.BASE_URL}/rest/secure/angelbroking/historical/v1/getCandleData"
            
            params = {
                "symboltoken": token,
                "exchange": "NSE",
                "interval": interval,
                "fromdate": from_date.strftime("%Y-%m-%d %H:%M"),
                "todate": to_date.strftime("%Y-%m-%d %H:%M")
            }
            
            response = self._session.get(url, params=params)
            data = response.json()
            
            if data.get('status') and data.get('data'):
                candles = []
                for item in data['data']:
                    # Data format: [timestamp, open, high, low, close, volume]
                    timestamp = datetime.fromisoformat(item[0].replace('T', ' '))
                    candle = Candle(
                        timestamp=timestamp,
                        open=float(item[1]),
                        high=float(item[2]),
                        low=float(item[3]),
                        close=float(item[4]),
                        volume=int(item[5]),
                        symbol=symbol,
                        timeframe=interval
                    )
                    candles.append(candle)
                
                logger.info(f"✅ Fetched {len(candles)} candles for {symbol}")
                return candles
            else:
                logger.error(f"Historical data fetch failed: {data.get('message')}")
                return None
                
        except Exception as e:
            logger.error(f"Historical data fetch error: {e}")
            return None
    
    def get_all_symbols_quote(self, symbols: List[str] = None) -> Dict[str, Dict]:
        """
        Get quotes for multiple symbols
        
        Args:
            symbols: List of symbols (default: all tracked symbols)
            
        Returns:
            Dictionary of symbol -> quote data
        """
        if symbols is None:
            symbols = list(self.SYMBOL_TOKENS.keys())
        
        quotes = {}
        for symbol in symbols:
            quote = self.get_quote(symbol)
            if quote:
                quotes[symbol] = quote
            time.sleep(0.1)  # Rate limiting
        
        return quotes
    
    def fetch_and_store_candles(self, symbol: str, interval: str = 'FIVE_MINUTE',
                                days: int = 7, db_session=None) -> int:
        """
        Fetch historical candles and store in database
        
        Args:
            symbol: Stock symbol
            interval: Candle interval
            days: Days of history
            db_session: Database session for storage
            
        Returns:
            Number of candles stored
        """
        candles = self.get_historical_data(symbol, interval, days)
        
        if not candles:
            return 0
        
        if db_session is None:
            return len(candles)
        
        try:
            # Import here to avoid circular imports
            from app.database import Symbol, Candle as DBCandle
            
            # Get or create symbol
            symbol_obj = db_session.query(Symbol).filter(
                Symbol.symbol == symbol
            ).first()
            
            if not symbol_obj:
                symbol_obj = Symbol(symbol=symbol, name=symbol)
                db_session.add(symbol_obj)
                db_session.commit()
                db_session.refresh(symbol_obj)
            
            # Store candles
            stored = 0
            for candle in candles:
                # Check if candle already exists
                existing = db_session.query(DBCandle).filter(
                    DBCandle.symbol_id == symbol_obj.id,
                    DBCandle.timeframe == interval,
                    DBCandle.timestamp == candle.timestamp
                ).first()
                
                if not existing:
                    db_candle = DBCandle(
                        symbol_id=symbol_obj.id,
                        timeframe=interval,
                        timestamp=candle.timestamp,
                        open=candle.open,
                        high=candle.high,
                        low=candle.low,
                        close=candle.close,
                        volume=candle.volume
                    )
                    db_session.add(db_candle)
                    stored += 1
            
            db_session.commit()
            logger.info(f"✅ Stored {stored} new candles for {symbol}")
            return stored
            
        except Exception as e:
            logger.error(f"Error storing candles: {e}")
            db_session.rollback()
            return 0


# Singleton instance
_client: Optional[AngelOneClient] = None


def get_angel_one_client() -> Optional[AngelOneClient]:
    """Get or create Angel One client instance"""
    global _client
    
    if _client is None:
        import os
        api_key = os.environ.get('ANGEL_ONE_API_KEY')
        api_secret = os.environ.get('ANGEL_ONE_API_SECRET', '')
        client_code = os.environ.get('ANGEL_ONE_CLIENT_CODE')
        password = os.environ.get('ANGEL_ONE_PASSWORD')
        totp_secret = os.environ.get('ANGEL_ONE_TOTP_SECRET')
        
        if all([api_key, client_code, password, totp_secret]):
            _client = AngelOneClient(
                api_key=api_key,
                api_secret=api_secret,
                client_code=client_code,
                password=password,
                totp_secret=totp_secret
            )
        else:
            logger.warning("Angel One credentials not configured")
    
    return _client


def fetch_live_data(symbol: str) -> Optional[Dict]:
    """Fetch live quote for a symbol"""
    client = get_angel_one_client()
    if client:
        return client.get_quote(symbol)
    return None


def fetch_historical_data(symbol: str, timeframe: str = '5m', days: int = 7) -> Optional[List[Candle]]:
    """
    Fetch historical candle data
    
    Args:
        symbol: Stock symbol
        timeframe: '1m', '5m', '15m', '30m', '1h', '1d'
        days: Days of history
    """
    # Map timeframe to Angel One interval
    interval_map = {
        '1m': 'ONE_MINUTE',
        '5m': 'FIVE_MINUTE',
        '15m': 'FIFTEEN_MINUTE',
        '30m': 'THIRTY_MINUTE',
        '1h': 'ONE_HOUR',
        '4h': 'ONE_HOUR',  # Angel One doesn't have 4H
        '1d': 'ONE_DAY'
    }
    
    interval = interval_map.get(timeframe, 'FIVE_MINUTE')
    
    client = get_angel_one_client()
    if client:
        return client.get_historical_data(symbol, interval, days)
    return None


def fetch_all_symbols_data(symbols: List[str] = None, timeframe: str = '5m', days: int = 7) -> Dict[str, List[Candle]]:
    """
    Fetch historical data for multiple symbols
    
    Args:
        symbols: List of symbols (default: all tracked symbols)
        timeframe: Candle timeframe
        days: Days of history
        
    Returns:
        Dictionary mapping symbol to list of candles
    """
    client = get_angel_one_client()
    if not client:
        logger.error("Angel One client not available")
        return {}
    
    if symbols is None:
        symbols = list(AngelOneClient.SYMBOL_TOKENS.keys())
    
    results = {}
    for symbol in symbols:
        try:
            candles = fetch_historical_data(symbol, timeframe, days)
            if candles:
                results[symbol] = candles
                logger.info(f"✅ Fetched {len(candles)} candles for {symbol}")
            time.sleep(0.3)  # Rate limiting
        except Exception as e:
            logger.error(f"Error fetching {symbol}: {e}")
    
    return results
