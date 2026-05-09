"""
SMC Engine - Liquidity Detection Module
Mathematical implementation of Liquidity Zones, Equal Levels, Liquidity Sweeps

Mathematical Formulas:

1. Equal Highs Detection:
   if abs(high1 - high2) < threshold:
       equal_high = True
   threshold = 0.1% price difference

2. Liquidity Sweep Detection:
   if high > eq_high and close < eq_high:
       liquidity_sweep = True (Stop Hunt Detected)

3. Liquidity Strength:
   Based on number of touches at the level

Author: Trading AI Agent
"""

from dataclasses import dataclass
from typing import List, Optional, Tuple
from enum import Enum
from datetime import datetime
import numpy as np

from .swing import Swing, Candle


class LiquidityType(Enum):
    """Types of Liquidity Zones"""
    EQUAL_HIGHS = "EQUAL_HIGHS"
    EQUAL_LOWS = "EQUAL_LOWS"
    BUY_SIDE = "BUY_SIDE"      # Above swing highs (short SLs)
    SELL_SIDE = "SELL_SIDE"    # Below swing lows (long SLs)


@dataclass
class LiquidityZone:
    """Liquidity Zone"""
    type: LiquidityType
    price_level: float
    tolerance: float
    volume: float = 0.0
    swept: bool = False
    swept_at: Optional[datetime] = None
    touches: int = 0
    strength: float = 0.0


@dataclass
class LiquiditySweep:
    """Liquidity Sweep Result"""
    swept: bool
    zone: Optional[LiquidityZone]
    direction: str  # 'BULLISH' or 'BEARISH'
    timestamp: Optional[datetime] = None


class LiquidityDetector:
    """
    Liquidity Detection using mathematical formulas
    
    Smart Money hunts liquidity at:
    - Equal highs/lows (double tops/bottoms)
    - Above swing highs (buy-side)
    - Below swing lows (sell-side)
    """
    
    def __init__(self, equal_threshold: float = 0.1, volume_multiplier: float = 1.5):
        """
        Initialize Liquidity Detector
        
        Args:
            equal_threshold: Percentage threshold for equal levels (0.1%)
            volume_multiplier: Volume threshold for significant zones
        """
        self.equal_threshold = equal_threshold
        self.volume_multiplier = volume_multiplier
    
    def detect_equal_highs(self, swings: List[Swing], candles: List[Candle]) -> List[LiquidityZone]:
        """
        Detect Equal Highs (Double/Triple Tops)
        
        Mathematical Formula:
        if abs(high1 - high2) / avg_price * 100 < threshold:
            equal_high = True
        
        Creates liquidity pool where stop losses cluster
        """
        swing_highs = [s for s in swings if s.type == 'HIGH']
        
        if len(swing_highs) < 2:
            return []
        
        zones = []
        used_indices = set()
        
        for i in range(len(swing_highs)):
            if i in used_indices:
                continue
            
            for j in range(i + 1, len(swing_highs)):
                if j in used_indices:
                    continue
                
                swing1 = swing_highs[i]
                swing2 = swing_highs[j]
                
                # Mathematical condition for equal highs
                price_diff = abs(swing1.price - swing2.price)
                avg_price = (swing1.price + swing2.price) / 2
                percent_diff = (price_diff / avg_price) * 100
                
                if percent_diff <= self.equal_threshold:
                    # Check if swept
                    swept, swept_at = self._check_sweep(candles, avg_price, swing2, 'HIGH')
                    
                    # Count touches
                    touches = self._count_touches(candles, avg_price, 'HIGH')
                    
                    zone = LiquidityZone(
                        type=LiquidityType.EQUAL_HIGHS,
                        price_level=avg_price,
                        tolerance=self.equal_threshold,
                        swept=swept,
                        swept_at=swept_at,
                        touches=touches,
                        strength=self._calculate_strength(touches)
                    )
                    zones.append(zone)
                    used_indices.add(i)
                    used_indices.add(j)
                    break
        
        return zones
    
    def detect_equal_lows(self, swings: List[Swing], candles: List[Candle]) -> List[LiquidityZone]:
        """
        Detect Equal Lows (Double/Triple Bottoms)
        
        Mathematical Formula:
        if abs(low1 - low2) / avg_price * 100 < threshold:
            equal_low = True
        """
        swing_lows = [s for s in swings if s.type == 'LOW']
        
        if len(swing_lows) < 2:
            return []
        
        zones = []
        used_indices = set()
        
        for i in range(len(swing_lows)):
            if i in used_indices:
                continue
            
            for j in range(i + 1, len(swing_lows)):
                if j in used_indices:
                    continue
                
                swing1 = swing_lows[i]
                swing2 = swing_lows[j]
                
                price_diff = abs(swing1.price - swing2.price)
                avg_price = (swing1.price + swing2.price) / 2
                percent_diff = (price_diff / avg_price) * 100
                
                if percent_diff <= self.equal_threshold:
                    swept, swept_at = self._check_sweep(candles, avg_price, swing2, 'LOW')
                    touches = self._count_touches(candles, avg_price, 'LOW')
                    
                    zone = LiquidityZone(
                        type=LiquidityType.EQUAL_LOWS,
                        price_level=avg_price,
                        tolerance=self.equal_threshold,
                        swept=swept,
                        swept_at=swept_at,
                        touches=touches,
                        strength=self._calculate_strength(touches)
                    )
                    zones.append(zone)
                    used_indices.add(i)
                    used_indices.add(j)
                    break
        
        return zones
    
    def detect_buy_side_liquidity(self, swings: List[Swing], 
                                  candles: List[Candle]) -> List[LiquidityZone]:
        """
        Detect Buy-Side Liquidity (Above swing highs)
        
        Stop losses for short positions sit above swing highs
        Smart money hunts these levels
        """
        swing_highs = sorted([s for s in swings if s.type == 'HIGH'],
                           key=lambda s: s.candle_index)
        
        if not swing_highs:
            return []
        
        zones = []
        
        # Get recent swing highs (last 5)
        recent_highs = swing_highs[-5:] if len(swing_highs) >= 5 else swing_highs
        
        for swing in recent_highs:
            swept, swept_at = self._check_sweep(candles, swing.price, swing, 'HIGH')
            
            zone = LiquidityZone(
                type=LiquidityType.BUY_SIDE,
                price_level=swing.price,
                tolerance=self.equal_threshold,
                swept=swept,
                swept_at=swept_at,
                strength=swing.strength
            )
            zones.append(zone)
        
        return zones
    
    def detect_sell_side_liquidity(self, swings: List[Swing],
                                   candles: List[Candle]) -> List[LiquidityZone]:
        """
        Detect Sell-Side Liquidity (Below swing lows)
        
        Stop losses for long positions sit below swing lows
        """
        swing_lows = sorted([s for s in swings if s.type == 'LOW'],
                          key=lambda s: s.candle_index)
        
        if not swing_lows:
            return []
        
        zones = []
        recent_lows = swing_lows[-5:] if len(swing_lows) >= 5 else swing_lows
        
        for swing in recent_lows:
            swept, swept_at = self._check_sweep(candles, swing.price, swing, 'LOW')
            
            zone = LiquidityZone(
                type=LiquidityType.SELL_SIDE,
                price_level=swing.price,
                tolerance=self.equal_threshold,
                swept=swept,
                swept_at=swept_at,
                strength=swing.strength
            )
            zones.append(zone)
        
        return zones
    
    def detect_all_liquidity(self, swings: List[Swing], 
                            candles: List[Candle]) -> List[LiquidityZone]:
        """Detect all liquidity zones"""
        equal_highs = self.detect_equal_highs(swings, candles)
        equal_lows = self.detect_equal_lows(swings, candles)
        buy_side = self.detect_buy_side_liquidity(swings, candles)
        sell_side = self.detect_sell_side_liquidity(swings, candles)
        
        return equal_highs + equal_lows + buy_side + sell_side
    
    def detect_liquidity_sweep(self, candles: List[Candle], 
                               zones: List[LiquidityZone],
                               lookback: int = 5) -> LiquiditySweep:
        """
        Detect Liquidity Sweep (Stop Hunt)
        
        Mathematical Condition:
        - Bullish Sweep: high > level and close < level
        - Bearish Sweep: low < level and close > level
        
        This indicates smart money swept stops before reversing
        """
        if len(candles) < lookback or not zones:
            return LiquiditySweep(swept=False, zone=None, direction='NONE')
        
        recent_candles = candles[-lookback:]
        unswept_zones = [z for z in zones if not z.swept]
        
        for candle in recent_candles:
            for zone in unswept_zones:
                if zone.type in [LiquidityType.EQUAL_HIGHS, LiquidityType.BUY_SIDE]:
                    # Bullish sweep: price breaks above and closes below
                    if candle.high > zone.price_level and candle.close < zone.price_level:
                        return LiquiditySweep(
                            swept=True,
                            zone=zone,
                            direction='BULLISH',
                            timestamp=candle.timestamp
                        )
                else:
                    # Bearish sweep: price breaks below and closes above
                    if candle.low < zone.price_level and candle.close > zone.price_level:
                        return LiquiditySweep(
                            swept=True,
                            zone=zone,
                            direction='BEARISH',
                            timestamp=candle.timestamp
                        )
        
        return LiquiditySweep(swept=False, zone=None, direction='NONE')
    
    def _check_sweep(self, candles: List[Candle], price_level: float,
                    after_swing: Swing, direction: str) -> Tuple[bool, Optional[datetime]]:
        """Check if a liquidity zone has been swept"""
        for candle in candles[after_swing.candle_index + 1:]:
            if direction == 'HIGH':
                if candle.high > price_level and candle.close < price_level:
                    return True, candle.timestamp
            else:
                if candle.low < price_level and candle.close > price_level:
                    return True, candle.timestamp
        
        return False, None
    
    def _count_touches(self, candles: List[Candle], price_level: float, 
                       direction: str) -> int:
        """Count touches at a price level"""
        tolerance = price_level * (self.equal_threshold / 100)
        touches = 0
        
        for candle in candles:
            if direction == 'HIGH':
                if abs(candle.high - price_level) <= tolerance:
                    touches += 1
            else:
                if abs(candle.low - price_level) <= tolerance:
                    touches += 1
        
        return touches
    
    def _calculate_strength(self, touches: int) -> float:
        """Calculate liquidity strength based on touches"""
        # Normalize to 0-1 scale, max at 5 touches
        return min(touches / 5, 1.0)


def get_nearest_liquidity(price: float, zones: List[LiquidityZone],
                         zone_type: Optional[LiquidityType] = None) -> Optional[LiquidityZone]:
    """Get nearest liquidity zone to current price"""
    filtered = zones
    if zone_type:
        filtered = [z for z in zones if z.type == zone_type]
    
    if not filtered:
        return None
    
    # Sort by distance from price
    return min(filtered, key=lambda z: abs(z.price_level - price))
