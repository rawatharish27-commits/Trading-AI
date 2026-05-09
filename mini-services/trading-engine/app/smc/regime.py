"""
SMC Engine - Market Regime Detection Module
Mathematical implementation of Trend, Range, Volatility detection

Mathematical Formulas:

1. ATR (Average True Range):
   TR = max(high - low, |high - prev_close|, |low - prev_close|)
   ATR = SMA(TR, period)

2. EMA (Exponential Moving Average):
   EMA = price * multiplier + prev_EMA * (1 - multiplier)
   multiplier = 2 / (period + 1)

3. Trend Strength:
   trend_strength = |EMA50 - EMA200| / avg_price * 100

4. Regime Classification:
   - Trending: trend_strength > threshold
   - Ranging: trend_strength <= threshold
   - Volatile: ATR > avg_ATR * 1.5

Author: Trading AI Agent
"""

from dataclasses import dataclass
from typing import List, Tuple
from enum import Enum
import numpy as np

from .swing import Candle


class MarketRegime(Enum):
    """Market Regime Types"""
    TRENDING = "TRENDING"
    RANGING = "RANGING"
    VOLATILE = "VOLATILE"


class TrendDirection(Enum):
    """Trend Direction"""
    BULLISH = "BULLISH"
    BEARISH = "BEARISH"
    NEUTRAL = "NEUTRAL"


@dataclass
class RegimeData:
    """Market Regime Analysis Result"""
    regime: MarketRegime
    trend_direction: TrendDirection
    trend_strength: float
    volatility: float
    atr: float
    ema_spread: float
    avg_range: float
    range_ratio: float


class RegimeDetector:
    """
    Market Regime Detection using mathematical formulas
    
    Identifies:
    - Trending markets (directional)
    - Ranging markets (sideways)
    - Volatile markets (news events)
    """
    
    def __init__(self, 
                 atr_period: int = 14,
                 ema_short: int = 50,
                 ema_long: int = 200,
                 trend_threshold: float = 0.5,
                 volatility_mult: float = 1.5):
        """
        Initialize Regime Detector
        
        Args:
            atr_period: Period for ATR calculation
            ema_short: Short EMA period
            ema_long: Long EMA period
            trend_threshold: EMA spread % for trending
            volatility_mult: ATR multiplier for volatile detection
        """
        self.atr_period = atr_period
        self.ema_short = ema_short
        self.ema_long = ema_long
        self.trend_threshold = trend_threshold
        self.volatility_mult = volatility_mult
    
    def calculate_atr(self, candles: List[Candle], period: int = None) -> float:
        """
        Calculate ATR (Average True Range)
        
        Mathematical Formula:
        TR = max(high - low, |high - prev_close|, |low - prev_close|)
        ATR = SMA(TR, period)
        """
        if period is None:
            period = self.atr_period
        
        if len(candles) < period + 1:
            return 0.0
        
        true_ranges = []
        
        for i in range(1, len(candles)):
            high = candles[i].high
            low = candles[i].low
            prev_close = candles[i - 1].close
            
            # True Range formula
            tr = max(
                high - low,
                abs(high - prev_close),
                abs(low - prev_close)
            )
            true_ranges.append(tr)
        
        # Simple Moving Average of TR
        recent_tr = true_ranges[-period:]
        return sum(recent_tr) / len(recent_tr)
    
    def calculate_ema(self, prices: List[float], period: int) -> float:
        """
        Calculate EMA (Exponential Moving Average)
        
        Mathematical Formula:
        multiplier = 2 / (period + 1)
        EMA = price * multiplier + prev_EMA * (1 - multiplier)
        """
        if len(prices) < period:
            return prices[-1] if prices else 0.0
        
        multiplier = 2 / (period + 1)
        
        # Start with SMA
        ema = sum(prices[:period]) / period
        
        # Calculate EMA
        for price in prices[period:]:
            ema = price * multiplier + ema * (1 - multiplier)
        
        return ema
    
    def calculate_trend_strength(self, candles: List[Candle]) -> float:
        """
        Calculate Trend Strength
        
        Mathematical Formula:
        ema_spread = |EMA_short - EMA_long|
        trend_strength = ema_spread / avg_price * 100
        """
        if len(candles) < self.ema_long:
            return 0.0
        
        closes = [c.close for c in candles]
        
        ema_short = self.calculate_ema(closes, self.ema_short)
        ema_long = self.calculate_ema(closes, self.ema_long)
        
        spread = abs(ema_short - ema_long)
        avg_price = (ema_short + ema_long) / 2
        
        # Convert to percentage
        trend_strength = (spread / avg_price) * 100 if avg_price > 0 else 0
        
        # Normalize to 0-100 scale
        return min(trend_strength * 20, 100)
    
    def calculate_volatility(self, candles: List[Candle]) -> float:
        """Calculate volatility as percentage of price"""
        atr = self.calculate_atr(candles)
        avg_price = candles[-1].close if candles else 1
        
        return (atr / avg_price) * 100 if avg_price > 0 else 0
    
    def calculate_historical_atr(self, candles: List[Candle], 
                                lookback: int = 50) -> float:
        """Calculate historical average ATR"""
        if len(candles) < self.atr_period + lookback:
            return self.calculate_atr(candles)
        
        atr_values = []
        
        for i in range(self.atr_period + 1, len(candles)):
            slice_candles = candles[:i]
            atr = self.calculate_atr(slice_candles)
            atr_values.append(atr)
        
        recent = atr_values[-lookback:] if len(atr_values) >= lookback else atr_values
        return sum(recent) / len(recent) if recent else 0
    
    def detect_regime(self, candles: List[Candle]) -> RegimeData:
        """
        Detect Current Market Regime
        
        Classification Logic:
        1. Volatile: ATR > historical_ATR * volatility_mult
        2. Trending: trend_strength > threshold AND ema_spread indicates direction
        3. Ranging: Default (no clear trend)
        """
        if len(candles) < self.ema_long:
            return RegimeData(
                regime=MarketRegime.RANGING,
                trend_direction=TrendDirection.NEUTRAL,
                trend_strength=0,
                volatility=0,
                atr=0,
                ema_spread=0,
                avg_range=0,
                range_ratio=1
            )
        
        # Calculate metrics
        atr = self.calculate_atr(candles)
        volatility = self.calculate_volatility(candles)
        trend_strength = self.calculate_trend_strength(candles)
        
        # Calculate EMA spread
        closes = [c.close for c in candles]
        ema_short = self.calculate_ema(closes, self.ema_short)
        ema_long = self.calculate_ema(closes, self.ema_long)
        ema_spread = ema_short - ema_long
        
        # Average range
        ranges = [c.high - c.low for c in candles[-20:]]
        avg_range = sum(ranges) / len(ranges) if ranges else 0
        current_range = candles[-1].high - candles[-1].low
        range_ratio = current_range / avg_range if avg_range > 0 else 1
        
        # Determine regime
        historical_atr = self.calculate_historical_atr(candles)
        
        if atr > historical_atr * self.volatility_mult:
            regime = MarketRegime.VOLATILE
        elif trend_strength > 30:
            regime = MarketRegime.TRENDING
        else:
            regime = MarketRegime.RANGING
        
        # Determine trend direction
        if ema_spread > 0:
            trend_direction = TrendDirection.BULLISH
        elif ema_spread < 0:
            trend_direction = TrendDirection.BEARISH
        else:
            trend_direction = TrendDirection.NEUTRAL
        
        return RegimeData(
            regime=regime,
            trend_direction=trend_direction,
            trend_strength=trend_strength,
            volatility=volatility,
            atr=atr,
            ema_spread=ema_spread,
            avg_range=avg_range,
            range_ratio=range_ratio
        )
    
    def is_tradeable(self, regime_data: RegimeData) -> bool:
        """Check if market conditions are suitable for trading"""
        # Don't trade in volatile markets
        if regime_data.regime == MarketRegime.VOLATILE:
            return False
        
        # Avoid extreme volatility
        if regime_data.volatility > 3:
            return False
        
        return True
    
    def get_recommended_strategy(self, regime_data: RegimeData) -> str:
        """Get recommended trading strategy for current regime"""
        if regime_data.regime == MarketRegime.TRENDING:
            if regime_data.trend_strength > 60:
                return 'BOS_FOLLOW'
            return 'PULLBACK'
        
        if regime_data.regime == MarketRegime.RANGING:
            return 'LIQUIDITY'
        
        return 'AVOID'


def calculate_adx(candles: List[Candle], period: int = 14) -> float:
    """
    Calculate ADX (Average Directional Index)
    
    Mathematical Formula:
    +DM = max(high - prev_high, 0) if high - prev_high > prev_low - low
    -DM = max(prev_low - low, 0) if prev_low - low > high - prev_high
    
    +DI = (+DM / ATR) * 100
    -DI = (-DM / ATR) * 100
    
    DX = |+DI - -DI| / (+DI + -DI) * 100
    ADX = smoothed DX
    """
    if len(candles) < period * 2:
        return 0.0
    
    plus_dm = []
    minus_dm = []
    tr_list = []
    
    for i in range(1, len(candles)):
        high = candles[i].high
        low = candles[i].low
        prev_high = candles[i - 1].high
        prev_low = candles[i - 1].low
        prev_close = candles[i - 1].close
        
        # Directional Movement
        up_move = high - prev_high
        down_move = prev_low - low
        
        if up_move > down_move and up_move > 0:
            plus_dm.append(up_move)
        else:
            plus_dm.append(0)
        
        if down_move > up_move and down_move > 0:
            minus_dm.append(down_move)
        else:
            minus_dm.append(0)
        
        # True Range
        tr = max(
            high - low,
            abs(high - prev_close),
            abs(low - prev_close)
        )
        tr_list.append(tr)
    
    # Smooth values
    def smooth(data: List[float], period: int) -> List[float]:
        smoothed = []
        # First value is SMA
        smoothed.append(sum(data[:period]) / period)
        
        for i in range(period, len(data)):
            new_val = (smoothed[-1] * (period - 1) + data[i]) / period
            smoothed.append(new_val)
        
        return smoothed
    
    smooth_tr = smooth(tr_list, period)
    smooth_plus_dm = smooth(plus_dm, period)
    smooth_minus_dm = smooth(minus_dm, period)
    
    # Calculate DI
    plus_di = [(smooth_plus_dm[i] / smooth_tr[i] * 100) if smooth_tr[i] > 0 else 0 
               for i in range(len(smooth_tr))]
    minus_di = [(smooth_minus_dm[i] / smooth_tr[i] * 100) if smooth_tr[i] > 0 else 0 
                for i in range(len(smooth_tr))]
    
    # Calculate DX
    dx = []
    for i in range(len(plus_di)):
        total = plus_di[i] + minus_di[i]
        if total > 0:
            dx.append(abs(plus_di[i] - minus_di[i]) / total * 100)
        else:
            dx.append(0)
    
    # ADX is smoothed DX
    adx_values = smooth(dx, period)
    
    return adx_values[-1] if adx_values else 0
