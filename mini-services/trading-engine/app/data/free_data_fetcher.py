"""
NSE/Yahoo Finance Data Fetcher
NO Angel One API - Only Free Data Sources

Features:
- Yahoo Finance for historical data (FREE)
- NSE website for live quotes (FREE)
- 2 years historical data
- Daily and Hourly timeframes
- Nifty 500 stocks support

Author: Trading AI Agent
"""

import os
import time
import logging
import asyncio
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from dataclasses import dataclass
import json

logger = logging.getLogger(__name__)

# Import Nifty 500 symbols
try:
    from app.data.nifty500_symbols import NIFTY_500_SYMBOLS, NIFTY_500_LIST
    HAS_NIFTY500 = True
except ImportError:
    HAS_NIFTY500 = False
    NIFTY_500_SYMBOLS = {}
    NIFTY_500_LIST = []


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


class YahooFinanceFetcher:
    """
    Yahoo Finance Data Fetcher
    
    FREE data source for:
    - Historical daily candles (up to 10 years)
    - Historical hourly candles (up to 730 days)
    - No API key required
    - No rate limits (reasonable use)
    """
    
    BASE_URL = "https://query1.finance.yahoo.com/v8/finance/chart/"
    
    # Yahoo Finance symbol suffix for NSE
    NSE_SUFFIX = ".NS"
    
    # Interval mapping
    INTERVAL_MAP = {
        '1d': ('1d', '1d'),
        '1h': ('1h', '1h'),
        '5m': ('5m', '5m'),
        '15m': ('15m', '15m'),
    }
    
    def __init__(self):
        self._session = None
    
    def _get_yahoo_symbol(self, symbol: str) -> str:
        """Convert NSE symbol to Yahoo Finance format"""
        return f"{symbol}{self.NSE_SUFFIX}"
    
    async def _get_session(self):
        """Get aiohttp session"""
        if self._session is None:
            try:
                import aiohttp
                self._session = aiohttp.ClientSession()
            except ImportError:
                logger.warning("aiohttp not installed, using requests")
        return self._session
    
    async def fetch_historical_data(self,
                                   symbol: str,
                                   interval: str = '1d',
                                   days: int = 730) -> Optional[List[MarketCandle]]:
        """
        Fetch historical candle data from Yahoo Finance
        
        Args:
            symbol: NSE symbol (e.g., 'RELIANCE')
            interval: '1d', '1h', '5m', '15m'
            days: Number of days of history
            
        Returns:
            List of MarketCandle objects
        """
        yahoo_symbol = self._get_yahoo_symbol(symbol)
        
        # Calculate time range
        end_time = int(datetime.now().timestamp())
        start_time = int((datetime.now() - timedelta(days=days)).timestamp())
        
        # Build URL
        url = f"{self.BASE_URL}{yahoo_symbol}"
        params = {
            'period1': start_time,
            'period2': end_time,
            'interval': self.INTERVAL_MAP.get(interval, ('1d', '1d'))[0],
            'includePrePost': 'false',
        }
        
        try:
            import aiohttp
            session = await self._get_session()
            
            async with session.get(url, params=params, timeout=30) as response:
                if response.status == 200:
                    data = await response.json()
                    return self._parse_yahoo_response(data, symbol, interval)
                else:
                    logger.error(f"Yahoo Finance error for {symbol}: {response.status}")
                    return None
                    
        except asyncio.TimeoutError:
            logger.error(f"Timeout fetching {symbol} from Yahoo Finance")
            return None
        except Exception as e:
            logger.error(f"Error fetching {symbol} from Yahoo Finance: {e}")
            return None
    
    def _parse_yahoo_response(self, data: dict, symbol: str, interval: str) -> Optional[List[MarketCandle]]:
        """Parse Yahoo Finance response"""
        try:
            result = data.get('chart', {}).get('result', [])
            if not result:
                return None
            
            quote = result[0]
            timestamp = quote.get('timestamp', [])
            indicators = quote.get('indicators', {})
            quotes = indicators.get('quote', [{}])[0]
            
            candles = []
            for i, ts in enumerate(timestamp):
                try:
                    candle = MarketCandle(
                        timestamp=datetime.fromtimestamp(ts),
                        open=float(quotes.get('open', [0])[i]),
                        high=float(quotes.get('high', [0])[i]),
                        low=float(quotes.get('low', [0])[i]),
                        close=float(quotes.get('close', [0])[i]),
                        volume=int(quotes.get('volume', [0])[i]),
                        symbol=symbol,
                        timeframe=interval
                    )
                    candles.append(candle)
                except (IndexError, TypeError, ValueError) as e:
                    continue
            
            logger.info(f"✅ Fetched {len(candles)} candles for {symbol} from Yahoo Finance")
            return candles
            
        except Exception as e:
            logger.error(f"Error parsing Yahoo response for {symbol}: {e}")
            return None
    
    async def fetch_multiple_symbols(self,
                                     symbols: List[str],
                                     interval: str = '1d',
                                     days: int = 730,
                                     batch_size: int = 10) -> Dict[str, List[MarketCandle]]:
        """
        Fetch data for multiple symbols with rate limiting
        
        Args:
            symbols: List of symbols
            interval: Timeframe
            days: Historical days
            batch_size: Concurrent requests
            
        Returns:
            Dict of symbol -> candles
        """
        results = {}
        total = len(symbols)
        
        for i in range(0, total, batch_size):
            batch = symbols[i:i + batch_size]
            tasks = [self.fetch_historical_data(s, interval, days) for s in batch]
            batch_results = await asyncio.gather(*tasks)
            
            for symbol, candles in zip(batch, batch_results):
                if candles:
                    results[symbol] = candles
            
            # Progress logging
            logger.info(f"📊 Fetched {len(results)}/{total} symbols")
            
            # Rate limiting between batches
            if i + batch_size < total:
                await asyncio.sleep(1)
        
        return results
    
    async def close(self):
        """Close session"""
        if self._session:
            await self._session.close()
            self._session = None


class NSEDataFetcher:
    """
    NSE India Data Fetcher
    
    Direct data from NSE website:
    - Live quotes
    - OHLC data
    - No API key required
    """
    
    BASE_URL = "https://www.nseindia.com/api"
    
    # Headers for NSE requests
    HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
    }
    
    def __init__(self):
        self._session = None
        self._cookies = None
    
    async def _get_session(self):
        """Get session with NSE cookies"""
        if self._session is None:
            try:
                import aiohttp
                self._session = aiohttp.ClientSession(headers=self.HEADERS)
                
                # Get cookies from NSE homepage
                async with self._session.get("https://www.nseindia.com", timeout=10) as response:
                    self._cookies = response.cookies
                    
            except Exception as e:
                logger.error(f"Error creating NSE session: {e}")
        
        return self._session
    
    async def get_quote(self, symbol: str) -> Optional[Dict[str, Any]]:
        """
        Get live quote from NSE
        
        Args:
            symbol: NSE symbol
            
        Returns:
            Quote dictionary
        """
        try:
            session = await self._get_session()
            if not session:
                return None
            
            url = f"{self.BASE_URL}/quote-equity?symbol={symbol}"
            
            async with session.get(url, cookies=self._cookies, timeout=10) as response:
                if response.status == 200:
                    data = await response.json()
                    return self._parse_nse_quote(data, symbol)
                else:
                    logger.error(f"NSE quote error for {symbol}: {response.status}")
                    return None
                    
        except Exception as e:
            logger.error(f"Error fetching NSE quote for {symbol}: {e}")
            return None
    
    def _parse_nse_quote(self, data: dict, symbol: str) -> Dict[str, Any]:
        """Parse NSE quote response"""
        try:
            price_info = data.get('priceInfo', {})
            return {
                'symbol': symbol,
                'ltp': float(price_info.get('lastPrice', 0)),
                'open': float(price_info.get('open', 0)),
                'high': float(price_info.get('intraDayHighLow', {}).get('max', 0)),
                'low': float(price_info.get('intraDayHighLow', {}).get('min', 0)),
                'close': float(price_info.get('previousClose', 0)),
                'volume': int(data.get('securityWiseTradeVolume', {}).get('totalTradedVolume', 0)),
                'change': float(price_info.get('change', 0)),
                'change_percent': float(price_info.get('pChange', 0)),
                'timestamp': datetime.now().isoformat(),
                'source': 'NSE'
            }
        except Exception as e:
            logger.error(f"Error parsing NSE quote: {e}")
            return {'symbol': symbol, 'error': str(e)}
    
    async def close(self):
        """Close session"""
        if self._session:
            await self._session.close()
            self._session = None


class MarketDataFetcher:
    """
    Unified Market Data Fetcher
    
    Combines Yahoo Finance and NSE for comprehensive data:
    - Historical data: Yahoo Finance
    - Live quotes: NSE (fallback to Yahoo)
    - Free, no API key required
    """
    
    def __init__(self):
        self.yahoo = YahooFinanceFetcher()
        self.nse = NSEDataFetcher()
    
    async def fetch_historical_candles(self,
                                       symbol: str,
                                       interval: str = '1d',
                                       days: int = 730) -> Optional[List[MarketCandle]]:
        """Fetch historical candles (Yahoo Finance)"""
        return await self.yahoo.fetch_historical_data(symbol, interval, days)
    
    async def fetch_batch_historical(self,
                                     symbols: List[str],
                                     interval: str = '1d',
                                     days: int = 730) -> Dict[str, List[MarketCandle]]:
        """Fetch historical data for multiple symbols"""
        return await self.yahoo.fetch_multiple_symbols(symbols, interval, days)
    
    async def get_live_quote(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Get live quote (NSE with Yahoo fallback)"""
        # Try NSE first
        quote = await self.nse.get_quote(symbol)
        if quote and quote.get('ltp'):
            return quote
        
        # Fallback to Yahoo (get latest price)
        candles = await self.yahoo.fetch_historical_data(symbol, '1d', 1)
        if candles:
            last = candles[-1]
            return {
                'symbol': symbol,
                'ltp': last.close,
                'open': last.open,
                'high': last.high,
                'low': last.low,
                'close': last.close,
                'volume': last.volume,
                'timestamp': last.timestamp.isoformat(),
                'source': 'Yahoo'
            }
        
        return None
    
    async def fetch_all_nifty500_daily(self, days: int = 730) -> Dict[str, List[MarketCandle]]:
        """Fetch daily data for all Nifty 500 stocks"""
        symbols = NIFTY_500_LIST if HAS_NIFTY500 else list(NIFTY_500_SYMBOLS.keys())[:100]
        return await self.fetch_batch_historical(symbols, '1d', days)
    
    async def fetch_all_nifty500_hourly(self, days: int = 60) -> Dict[str, List[MarketCandle]]:
        """Fetch hourly data for all Nifty 500 stocks"""
        symbols = NIFTY_500_LIST if HAS_NIFTY500 else list(NIFTY_500_SYMBOLS.keys())[:50]
        return await self.fetch_batch_historical(symbols, '1h', days)
    
    async def close(self):
        """Close all sessions"""
        await self.yahoo.close()
        await self.nse.close()


# Singleton
_fetcher_instance: Optional[MarketDataFetcher] = None


def get_data_fetcher() -> MarketDataFetcher:
    """Get data fetcher singleton"""
    global _fetcher_instance
    if _fetcher_instance is None:
        _fetcher_instance = MarketDataFetcher()
    return _fetcher_instance


# Sync wrapper for convenience
def fetch_historical_data_sync(symbol: str, interval: str = '1d', days: int = 730) -> Optional[List[MarketCandle]]:
    """Sync wrapper for historical data fetch"""
    import asyncio
    fetcher = get_data_fetcher()
    return asyncio.run(fetcher.fetch_historical_candles(symbol, interval, days))
