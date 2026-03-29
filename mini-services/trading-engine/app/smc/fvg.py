"""
SMC Engine - Fair Value Gap (FVG) Detection Module
Mathematical implementation of Price Imbalances

Mathematical Formulas:

1. Bullish FVG (3 candle model):
   if candle1.high < candle3.low:
       fvg = True
       gap_top = candle3.low
       gap_bottom = candle1.high

2. Bearish FVG:
   if candle1.low > candle3.high:
       fvg = True
       gap_top = candle1.low
       gap_bottom = candle3.high

3. FVG Fill Calculation:
   fill_percentage = (price_movement / gap_size) * 100

Author: Trading AI Agent
"""

from dataclasses import dataclass
from typing import List, Optional
from enum import Enum
from datetime import datetime
import numpy as np

from .swing import Candle


class FVGType(Enum):
    """Fair Value Gap Types"""
    BULLISH = "BULLISH"
    BEARISH = "BEARISH"


@dataclass
class FairValueGap:
    """Fair Value Gap"""
    type: FVGType
    gap_top: float
    gap_bottom: float
    gap_size: float
    candle_index: int  # Index of middle candle (impulse)
    filled: bool = False
    filled_at: Optional[datetime] = None
    fill_percentage: float = 0.0
    timestamp: Optional[datetime] = None


class FVGDetector:
    """
    Fair Value Gap Detection using mathematical formulas
    
    FVG represents market imbalance where price moved too quickly.
    Price tends to return to fill these gaps.
    """
    
    def __init__(self, min_gap_percent: float = 0.1):
        """
        Initialize FVG Detector
        
        Args:
            min_gap_percent: Minimum gap size as percentage of price
        """
        self.min_gap_percent = min_gap_percent
    
    def detect_bullish_fvg(self, candles: List[Candle]) -> List[FairValueGap]:
        """
        Detect Bullish FVG
        
        Mathematical Formula (3 candle model):
        Candle1 High < Candle3 Low
        
        This creates an upward gap that price may revisit
        
        Gap Zone:
        - gap_top = candle3.low
        - gap_bottom = candle1.high
        """
        if len(candles) < 3:
            return []
        
        fvgs = []
        
        for i in range(1, len(candles) - 1):
            candle1 = candles[i - 1]
            candle2 = candles[i]      # Impulse candle
            candle3 = candles[i + 1]
            
            # Mathematical condition: candle1.high < candle3.low
            if candle1.high < candle3.low:
                gap_top = candle3.low
                gap_bottom = candle1.high
                gap_size = gap_top - gap_bottom
                
                # Calculate gap percentage
                avg_price = (gap_top + gap_bottom) / 2
                gap_percent = (gap_size / avg_price) * 100
                
                # Check minimum gap size
                if gap_percent >= self.min_gap_percent:
                    # Check fill status
                    filled, fill_pct, filled_at = self._check_fill(
                        candles, i + 1, gap_top, gap_bottom, 'BULLISH'
                    )
                    
                    fvg = FairValueGap(
                        type=FVGType.BULLISH,
                        gap_top=gap_top,
                        gap_bottom=gap_bottom,
                        gap_size=gap_size,
                        candle_index=i,
                        filled=filled,
                        filled_at=filled_at,
                        fill_percentage=fill_pct,
                        timestamp=candle2.timestamp
                    )
                    fvgs.append(fvg)
        
        return fvgs
    
    def detect_bearish_fvg(self, candles: List[Candle]) -> List[FairValueGap]:
        """
        Detect Bearish FVG
        
        Mathematical Formula (3 candle model):
        Candle1 Low > Candle3 High
        
        Gap Zone:
        - gap_top = candle1.low
        - gap_bottom = candle3.high
        """
        if len(candles) < 3:
            return []
        
        fvgs = []
        
        for i in range(1, len(candles) - 1):
            candle1 = candles[i - 1]
            candle2 = candles[i]
            candle3 = candles[i + 1]
            
            # Mathematical condition: candle1.low > candle3.high
            if candle1.low > candle3.high:
                gap_top = candle1.low
                gap_bottom = candle3.high
                gap_size = gap_top - gap_bottom
                
                avg_price = (gap_top + gap_bottom) / 2
                gap_percent = (gap_size / avg_price) * 100
                
                if gap_percent >= self.min_gap_percent:
                    filled, fill_pct, filled_at = self._check_fill(
                        candles, i + 1, gap_top, gap_bottom, 'BEARISH'
                    )
                    
                    fvg = FairValueGap(
                        type=FVGType.BEARISH,
                        gap_top=gap_top,
                        gap_bottom=gap_bottom,
                        gap_size=gap_size,
                        candle_index=i,
                        filled=filled,
                        filled_at=filled_at,
                        fill_percentage=fill_pct,
                        timestamp=candle2.timestamp
                    )
                    fvgs.append(fvg)
        
        return fvgs
    
    def detect_all_fvgs(self, candles: List[Candle]) -> List[FairValueGap]:
        """Detect all Fair Value Gaps"""
        bullish = self.detect_bullish_fvg(candles)
        bearish = self.detect_bearish_fvg(candles)
        
        return sorted(bullish + bearish, key=lambda f: f.candle_index)
    
    def _check_fill(self, candles: List[Candle], start_index: int,
                   gap_top: float, gap_bottom: float, 
                   fvg_type: str) -> tuple:
        """
        Check if FVG has been filled
        
        Mathematical Calculation:
        - For Bullish FVG: filled from top (price drops into gap)
        - For Bearish FVG: filled from bottom (price rises into gap)
        
        fill_percentage = (fill_amount / gap_size) * 100
        """
        gap_size = gap_top - gap_bottom
        max_fill = 0.0
        filled_at = None
        
        for i in range(start_index + 1, len(candles)):
            candle = candles[i]
            
            if fvg_type == 'BULLISH':
                # Filled from above (price drops)
                if candle.low <= gap_top:
                    fill_amount = min(gap_top - candle.low, gap_size)
                    fill_pct = (fill_amount / gap_size) * 100
                    
                    if fill_pct > max_fill:
                        max_fill = fill_pct
                        if fill_pct >= 50:
                            filled_at = candle.timestamp
            else:
                # Bearish FVG - filled from below
                if candle.high >= gap_bottom:
                    fill_amount = min(candle.high - gap_bottom, gap_size)
                    fill_pct = (fill_amount / gap_size) * 100
                    
                    if fill_pct > max_fill:
                        max_fill = fill_pct
                        if fill_pct >= 50:
                            filled_at = candle.timestamp
        
        is_filled = max_fill >= 50
        return is_filled, max_fill, filled_at
    
    def get_unfilled_fvgs(self, fvgs: List[FairValueGap]) -> List[FairValueGap]:
        """Get all unfilled FVGs"""
        return [f for f in fvgs if not f.filled]
    
    def get_fvg_at_price(self, price: float, fvgs: List[FairValueGap]) -> Optional[FairValueGap]:
        """Get FVG that contains a price level"""
        for fvg in fvgs:
            if fvg.gap_bottom <= price <= fvg.gap_top:
                return fvg
        return None
    
    def get_nearest_fvg(self, price: float, fvgs: List[FairValueGap],
                       fvg_type: Optional[FVGType] = None) -> Optional[FairValueGap]:
        """Get nearest FVG to current price"""
        filtered = fvgs
        if fvg_type:
            filtered = [f for f in filtered if f.type == fvg_type]
        
        if not filtered:
            return None
        
        def distance(fvg: FairValueGap) -> float:
            mid = (fvg.gap_top + fvg.gap_bottom) / 2
            return abs(price - mid)
        
        return min(filtered, key=distance)
