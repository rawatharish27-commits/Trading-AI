"""
Real Market Data Fetcher
Supports multiple data sources: Angel One, Yahoo Finance, NSE India
"""

import requests
import time
import logging
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from dataclasses import dataclass
import json

logger = logging.getLogger(__name__)


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


class YahooFinanceAPI:
    """
    Yahoo Finance API for fetching market data (FREE, no auth required)
    Used as primary source for NSE/BSE stocks
    """
    
    BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart"
    
    # NSE stock symbols with .NS suffix
    NSE_SYMBOLS = {
        'RELIANCE': 'RELIANCE.NS',
        'TCS': 'TCS.NS',
        'HDFCBANK': 'HDFCBANK.NS',
        'ICICIBANK': 'ICICIBANK.NS',
        'INFY': 'INFY.NS',
        'SBIN': 'SBIN.NS',
        'BHARTIARTL': 'BHARTIARTL.NS',
        'ITC': 'ITC.NS',
        'KOTAKBANK': 'KOTAKBANK.NS',
        'LT': 'LT.NS',
        'AXISBANK': 'AXISBANK.NS',
        'BAJFINANCE': 'BAJFINANCE.NS',
        'HINDUNILVR': 'HINDUNILVR.NS',
        'MARUTI': 'MARUTI.NS',
        'ASIANPAINT': 'ASIANPAINT.NS',
        'SUNPHARMA': 'SUNPHARMA.NS',
        'DMART': 'DMART.NS',
        'WIPRO': 'WIPRO.NS',
        'ULTRACEMCO': 'ULTRACEMCO.NS',
        'NTPC': 'NTPC.NS',
        'POWERGRID': 'POWERGRID.NS',
        'TITAN': 'TITAN.NS',
        'NESTLEIND': 'NESTLEIND.NS',
        'HCLTECH': 'HCLTECH.NS',
        'GRASIM': 'GRASIM.NS',
        'ONGC': 'ONGC.NS',
        'JSWSTEEL': 'JSWSTEEL.NS',
        'TATAMOTORS': 'TATAMOTORS.NS',
        'M&M': 'M&M.NS',
        'ADANIENT': 'ADANIENT.NS',
    }
    
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
    
    def get_quote(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Get current quote for a symbol"""
        try:
            yahoo_symbol = self.NSE_SYMBOLS.get(symbol, f"{symbol}.NS")
            url = f"{self.BASE_URL}/{yahoo_symbol}"
            
            params = {
                'interval': '1m',
                'range': '1d'
            }
            
            response = self.session.get(url, params=params, timeout=10)
            data = response.json()
            
            if 'chart' in data and 'result' in data['chart'] and data['chart']['result']:
                result = data['chart']['result'][0]
                meta = result.get('meta', {})
                
                return {
                    'symbol': symbol,
                    'ltp': meta.get('regularMarketPrice', 0),
                    'open': meta.get('regularMarketOpen', 0),
                    'high': meta.get('regularMarketDayHigh', 0),
                    'low': meta.get('regularMarketDayLow', 0),
                    'close': meta.get('previousClose', 0),
                    'volume': meta.get('regularMarketVolume', 0),
                    'change': meta.get('regularMarketPrice', 0) - meta.get('previousClose', 0),
                    'change_percent': ((meta.get('regularMarketPrice', 0) - meta.get('previousClose', 0)) / meta.get('previousClose', 1)) * 100,
                    'timestamp': datetime.now().isoformat()
                }
            
            return None
            
        except Exception as e:
            logger.error(f"Yahoo Finance quote error for {symbol}: {e}")
            return None
    
    def get_historical_data(self, symbol: str, interval: str = '5m', 
                           days: int = 7) -> Optional[List[MarketCandle]]:
        """
        Fetch historical candle data
        
        Args:
            symbol: Stock symbol
            interval: '1m', '5m', '15m', '30m', '60m', '1d'
            days: Number of days of history
        """
        try:
            yahoo_symbol = self.NSE_SYMBOLS.get(symbol, f"{symbol}.NS")
            
            # Map interval
            interval_map = {
                '1m': '1m',
                '5m': '5m',
                '15m': '15m',
                '30m': '30m',
                '1h': '60m',
                '1d': '1d'
            }
            
            yahoo_interval = interval_map.get(interval, '5m')
            
            # Calculate range
            if yahoo_interval == '1d':
                range_str = f'{days}d'
            elif yahoo_interval in ['60m', '30m']:
                range_str = f'{min(days, 60)}d'  # Yahoo limits
            else:
                range_str = f'{min(days, 7)}d'  # Intraday limited to 7 days
            
            url = f"{self.BASE_URL}/{yahoo_symbol}"
            
            params = {
                'interval': yahoo_interval,
                'range': range_str
            }
            
            response = self.session.get(url, params=params, timeout=15)
            data = response.json()
            
            if 'chart' in data and 'result' in data['chart'] and data['chart']['result']:
                result = data['chart']['result'][0]
                timestamps = result.get('timestamp', [])
                indicators = result.get('indicators', {}).get('quote', [{}])[0]
                
                candles = []
                for i, ts in enumerate(timestamps):
                    try:
                        candle = MarketCandle(
                            timestamp=datetime.fromtimestamp(ts),
                            open=float(indicators.get('open', [0])[i]),
                            high=float(indicators.get('high', [0])[i]),
                            low=float(indicators.get('low', [0])[i]),
                            close=float(indicators.get('close', [0])[i]),
                            volume=int(indicators.get('volume', [0])[i]),
                            symbol=symbol,
                            timeframe=interval
                        )
                        candles.append(candle)
                    except (IndexError, TypeError):
                        continue
                
                logger.info(f"✅ Fetched {len(candles)} candles for {symbol} from Yahoo")
                return candles
            
            return None
            
        except Exception as e:
            logger.error(f"Yahoo Finance historical data error for {symbol}: {e}")
            return None


class NSEIndiaAPI:
    """
    NSE India direct API (FREE, no auth required)
    Fallback for real-time quotes
    """
    
    BASE_URL = "https://www.nseindia.com/api"
    
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
        })
        
        # Initialize session
        try:
            self.session.get('https://www.nseindia.com', timeout=10)
        except:
            pass
    
    def get_quote(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Get real-time quote from NSE"""
        try:
            url = f"{self.BASE_URL}/quote-equity?symbol={symbol}"
            response = self.session.get(url, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                price_info = data.get('priceInfo', {})
                
                return {
                    'symbol': symbol,
                    'ltp': price_info.get('lastPrice', 0),
                    'open': price_info.get('open', 0),
                    'high': price_info.get('intraDayHighLow', {}).get('max', 0),
                    'low': price_info.get('intraDayHighLow', {}).get('min', 0),
                    'close': price_info.get('previousClose', 0),
                    'volume': data.get('securityWiseTrade', {}).get('totalTradedVolume', 0),
                    'change': price_info.get('change', 0),
                    'change_percent': price_info.get('pChange', 0),
                    'timestamp': datetime.now().isoformat()
                }
            
            return None
            
        except Exception as e:
            logger.error(f"NSE quote error for {symbol}: {e}")
            return None


# Singleton instances
_yahoo_client: Optional[YahooFinanceAPI] = None
_nse_client: Optional[NSEIndiaAPI] = None


def get_yahoo_client() -> YahooFinanceAPI:
    """Get Yahoo Finance client"""
    global _yahoo_client
    if _yahoo_client is None:
        _yahoo_client = YahooFinanceAPI()
    return _yahoo_client


def get_nse_client() -> NSEIndiaAPI:
    """Get NSE India client"""
    global _nse_client
    if _nse_client is None:
        _nse_client = NSEIndiaAPI()
    return _nse_client


def get_live_quote(symbol: str) -> Optional[Dict[str, Any]]:
    """Get live quote - tries multiple sources"""
    
    # Try Yahoo Finance first (more reliable)
    yahoo = get_yahoo_client()
    quote = yahoo.get_quote(symbol)
    if quote and quote.get('ltp'):
        return quote
    
    # Fallback to NSE
    nse = get_nse_client()
    quote = nse.get_quote(symbol)
    if quote and quote.get('ltp'):
        return quote
    
    return None


def get_historical_candles(symbol: str, interval: str = '5m', 
                          days: int = 7) -> Optional[List[MarketCandle]]:
    """Get historical candles from Yahoo Finance"""
    yahoo = get_yahoo_client()
    return yahoo.get_historical_data(symbol, interval, days)


def fetch_all_symbols_historical(symbols: List[str] = None, 
                                  interval: str = '5m',
                                  days: int = 7) -> Dict[str, List[MarketCandle]]:
    """Fetch historical data for multiple symbols"""
    
    if symbols is None:
        symbols = list(YahooFinanceAPI.NSE_SYMBOLS.keys())
    
    results = {}
    yahoo = get_yahoo_client()
    
    for symbol in symbols:
        try:
            candles = yahoo.get_historical_data(symbol, interval, days)
            if candles:
                results[symbol] = candles
                logger.info(f"✅ Fetched {len(candles)} candles for {symbol}")
            time.sleep(0.3)  # Rate limiting
        except Exception as e:
            logger.error(f"Error fetching {symbol}: {e}")
    
    return results


def get_all_live_quotes(symbols: List[str] = None) -> Dict[str, Dict]:
    """Get live quotes for multiple symbols"""
    
    if symbols is None:
        symbols = list(YahooFinanceAPI.NSE_SYMBOLS.keys())[:10]
    
    results = {}
    for symbol in symbols:
        quote = get_live_quote(symbol)
        if quote:
            results[symbol] = quote
        time.sleep(0.2)
    
    return results
