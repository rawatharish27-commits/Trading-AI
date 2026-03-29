"""
Market Data Module - Data Handler
"""

from typing import List, Dict, Any, Optional
from datetime import datetime
import numpy as np

from app.smc import Candle


class CandleBuilder:
    """
    Build candles from tick data
    
    Aggregates tick data into OHLCV candles
    """
    
    def __init__(self, timeframe_seconds: int = 300):
        """
        Initialize Candle Builder
        
        Args:
            timeframe_seconds: Candle timeframe in seconds (default 5 min)
        """
        self.timeframe_seconds = timeframe_seconds
        self.current_candle: Optional[Dict] = None
        self.candles: List[Candle] = []
    
    def add_tick(self, price: float, volume: float, timestamp: datetime, symbol: str):
        """Add tick data and build candle"""
        # Calculate candle period
        period_start = self._get_period_start(timestamp)
        
        if self.current_candle is None or self.current_candle['period_start'] != period_start:
            # Save previous candle
            if self.current_candle:
                self.candles.append(self._build_candle(self.current_candle))
            
            # Start new candle
            self.current_candle = {
                'period_start': period_start,
                'symbol': symbol,
                'timeframe': self._get_timeframe_str(),
                'open': price,
                'high': price,
                'low': price,
                'close': price,
                'volume': volume,
                'timestamp': period_start
            }
        else:
            # Update current candle
            self.current_candle['high'] = max(self.current_candle['high'], price)
            self.current_candle['low'] = min(self.current_candle['low'], price)
            self.current_candle['close'] = price
            self.current_candle['volume'] += volume
    
    def _get_period_start(self, timestamp: datetime) -> datetime:
        """Get candle period start time"""
        epoch = timestamp.timestamp()
        period_start = (epoch // self.timeframe_seconds) * self.timeframe_seconds
        return datetime.fromtimestamp(period_start)
    
    def _get_timeframe_str(self) -> str:
        """Get timeframe string"""
        minutes = self.timeframe_seconds // 60
        if minutes >= 60:
            hours = minutes // 60
            return f"{hours}h"
        return f"{minutes}m"
    
    def _build_candle(self, data: Dict) -> Candle:
        """Build Candle object from data"""
        return Candle(
            timestamp=data['timestamp'],
            open=data['open'],
            high=data['high'],
            low=data['low'],
            close=data['close'],
            volume=data['volume'],
            symbol=data['symbol'],
            timeframe=data['timeframe']
        )
    
    def get_candles(self) -> List[Candle]:
        """Get all built candles"""
        candles = self.candles.copy()
        if self.current_candle:
            candles.append(self._build_candle(self.current_candle))
        return candles
    
    def clear(self):
        """Clear all candles"""
        self.candles = []
        self.current_candle = None


class MarketDataValidator:
    """Validate market data quality"""
    
    @staticmethod
    def validate_candle(candle: Candle) -> bool:
        """Validate single candle"""
        # Check prices
        if candle.high < candle.low:
            return False
        if candle.high < candle.open or candle.high < candle.close:
            return False
        if candle.low > candle.open or candle.low > candle.close:
            return False
        
        # Check for invalid values
        if candle.open <= 0 or candle.high <= 0 or candle.low <= 0 or candle.close <= 0:
            return False
        
        return True
    
    @staticmethod
    def validate_candles(candles: List[Candle]) -> List[Candle]:
        """Filter valid candles"""
        return [c for c in candles if MarketDataValidator.validate_candle(c)]
    
    @staticmethod
    def check_data_quality(candles: List[Candle]) -> Dict[str, Any]:
        """Check data quality metrics"""
        if not candles:
            return {'quality': 0, 'issues': ['No data']}
        
        issues = []
        
        # Check for gaps
        timestamps = [c.timestamp for c in candles]
        # Gap detection logic...
        
        # Check for outliers
        closes = [c.close for c in candles]
        mean_close = np.mean(closes)
        std_close = np.std(closes)
        
        outliers = sum(1 for c in candles if abs(c.close - mean_close) > 3 * std_close)
        if outliers > 0:
            issues.append(f"{outliers} outlier candles detected")
        
        # Quality score
        quality = max(0, 100 - len(issues) * 20)
        
        return {
            'quality': quality,
            'issues': issues,
            'total_candles': len(candles),
            'outliers': outliers
        }
