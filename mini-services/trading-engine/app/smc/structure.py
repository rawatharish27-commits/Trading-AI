"""
SMC Engine - Market Structure Detection Module
Mathematical implementation of BOS, CHoCH, HH, HL, LH, LL

Structure Classification:
- HH (Higher High): new_high > previous_high
- HL (Higher Low): new_low > previous_low
- LH (Lower High): new_high < previous_high
- LL (Lower Low): new_low < previous_low

BOS (Break of Structure):
- Bullish: close > last_swing_high
- Bearish: close < last_swing_low

CHoCH (Change of Character):
- Trend reversal signal
- Uptrend → LL break
- Downtrend → HH break

Author: Trading AI Agent
"""

from dataclasses import dataclass
from typing import List, Optional, Tuple
from enum import Enum
from datetime import datetime
import numpy as np

from .swing import Swing, Candle


class StructureType(Enum):
    """Market Structure Types"""
    HH = "HH"  # Higher High
    HL = "HL"  # Higher Low
    LH = "LH"  # Lower High
    LL = "LL"  # Lower Low
    BOS = "BOS"  # Break of Structure
    CHOCH = "CHOCH"  # Change of Character


class TrendDirection(Enum):
    """Trend Direction"""
    BULLISH = "BULLISH"
    BEARISH = "BEARISH"
    NEUTRAL = "NEUTRAL"


@dataclass
class StructurePoint:
    """Market Structure Point"""
    timestamp: datetime
    type: StructureType
    direction: TrendDirection
    price: float
    swing_id: Optional[int] = None
    broken_level: Optional[float] = None
    confirmed: bool = False
    candle_index: int = 0


class StructureDetector:
    """
    Market Structure Detection using mathematical formulas
    
    Identifies:
    - Higher Highs (HH), Higher Lows (HL) - Bullish structure
    - Lower Highs (LH), Lower Lows (LL) - Bearish structure
    - Break of Structure (BOS)
    - Change of Character (CHoCH)
    """
    
    def __init__(self, min_break_percent: float = 0.1, confirm_candles: int = 2):
        """
        Initialize Structure Detector
        
        Args:
            min_break_percent: Minimum percentage break to qualify as BOS
            confirm_candles: Candles needed for confirmation
        """
        self.min_break_percent = min_break_percent
        self.confirm_candles = confirm_candles
    
    def detect_basic_structure(self, swings: List[Swing]) -> List[StructurePoint]:
        """
        Detect basic structure (HH, HL, LH, LL) from swings
        
        Mathematical formulas:
        - HH: new_high > previous_high
        - LL: new_low < previous_low
        - HL: new_low > previous_low (in uptrend)
        - LH: new_high < previous_high (in downtrend)
        """
        if len(swings) < 2:
            return []
        
        structures = []
        
        # Sort swings by timestamp
        sorted_swings = sorted(swings, key=lambda s: s.timestamp)
        
        last_high: Optional[Swing] = None
        last_low: Optional[Swing] = None
        
        for swing in sorted_swings:
            if swing.type == 'HIGH':
                if last_high is not None:
                    if swing.price > last_high.price:
                        # Higher High - Bullish
                        structures.append(StructurePoint(
                            timestamp=swing.timestamp,
                            type=StructureType.HH,
                            direction=TrendDirection.BULLISH,
                            price=swing.price,
                            swing_id=id(swing),
                            confirmed=swing.confirmed,
                            candle_index=swing.candle_index
                        ))
                    else:
                        # Lower High - Bearish
                        structures.append(StructurePoint(
                            timestamp=swing.timestamp,
                            type=StructureType.LH,
                            direction=TrendDirection.BEARISH,
                            price=swing.price,
                            swing_id=id(swing),
                            confirmed=swing.confirmed,
                            candle_index=swing.candle_index
                        ))
                last_high = swing
            
            else:  # LOW
                if last_low is not None:
                    if swing.price < last_low.price:
                        # Lower Low - Bearish
                        structures.append(StructurePoint(
                            timestamp=swing.timestamp,
                            type=StructureType.LL,
                            direction=TrendDirection.BEARISH,
                            price=swing.price,
                            swing_id=id(swing),
                            confirmed=swing.confirmed,
                            candle_index=swing.candle_index
                        ))
                    else:
                        # Higher Low - Bullish
                        structures.append(StructurePoint(
                            timestamp=swing.timestamp,
                            type=StructureType.HL,
                            direction=TrendDirection.BULLISH,
                            price=swing.price,
                            swing_id=id(swing),
                            confirmed=swing.confirmed,
                            candle_index=swing.candle_index
                        ))
                last_low = swing
        
        return structures
    
    def detect_bos(self, candles: List[Candle], swings: List[Swing]) -> List[StructurePoint]:
        """
        Detect Break of Structure (BOS)
        
        Mathematical condition:
        - Bullish BOS: close > last_swing_high
        - Bearish BOS: close < last_swing_low
        
        With confirmation:
        - Must close beyond the level with strong candle
        """
        if len(candles) < 5 or len(swings) < 2:
            return []
        
        bos_points = []
        
        # Get confirmed swing highs and lows
        swing_highs = sorted([s for s in swings if s.type == 'HIGH' and s.confirmed],
                            key=lambda s: s.candle_index)
        swing_lows = sorted([s for s in swings if s.type == 'LOW' and s.confirmed],
                           key=lambda s: s.candle_index)
        
        # Detect Bullish BOS (break above swing high)
        for swing_high in swing_highs:
            swing_idx = swing_high.candle_index
            
            # Look for break after the swing
            for i in range(swing_idx + 1, len(candles)):
                candle = candles[i]
                
                # Mathematical condition: close > swing_high.price
                break_percent = ((candle.close - swing_high.price) / swing_high.price) * 100
                
                if break_percent >= self.min_break_percent and candle.close > swing_high.price:
                    # Check confirmation (closes stay above)
                    confirmed = True
                    for j in range(i + 1, min(i + 1 + self.confirm_candles, len(candles))):
                        if candles[j].close < swing_high.price:
                            confirmed = False
                            break
                    
                    if confirmed:
                        bos_points.append(StructurePoint(
                            timestamp=candle.timestamp,
                            type=StructureType.BOS,
                            direction=TrendDirection.BULLISH,
                            price=candle.close,
                            broken_level=swing_high.price,
                            confirmed=True,
                            candle_index=i
                        ))
                        break  # Only one BOS per swing level
        
        # Detect Bearish BOS (break below swing low)
        for swing_low in swing_lows:
            swing_idx = swing_low.candle_index
            
            for i in range(swing_idx + 1, len(candles)):
                candle = candles[i]
                
                # Mathematical condition: close < swing_low.price
                break_percent = ((swing_low.price - candle.close) / swing_low.price) * 100
                
                if break_percent >= self.min_break_percent and candle.close < swing_low.price:
                    confirmed = True
                    for j in range(i + 1, min(i + 1 + self.confirm_candles, len(candles))):
                        if candles[j].close > swing_low.price:
                            confirmed = False
                            break
                    
                    if confirmed:
                        bos_points.append(StructurePoint(
                            timestamp=candle.timestamp,
                            type=StructureType.BOS,
                            direction=TrendDirection.BEARISH,
                            price=candle.close,
                            broken_level=swing_low.price,
                            confirmed=True,
                            candle_index=i
                        ))
                        break
        
        return bos_points
    
    def detect_choch(self, structures: List[StructurePoint]) -> List[StructurePoint]:
        """
        Detect Change of Character (CHoCH)
        
        Mathematical pattern:
        - Bullish CHoCH: After LL + LH, we get HH (downtrend to uptrend)
        - Bearish CHoCH: After HH + HL, we get LL (uptrend to downtrend)
        """
        if len(structures) < 3:
            return []
        
        choch_points = []
        
        # Sort by candle index
        sorted_structures = sorted(structures, key=lambda s: s.candle_index)
        
        for i in range(2, len(sorted_structures)):
            prev2 = sorted_structures[i - 2]
            prev1 = sorted_structures[i - 1]
            current = sorted_structures[i]
            
            # Bullish CHoCH: LL + LH + HH
            if (prev2.type == StructureType.LL and
                prev1.type == StructureType.LH and
                current.type == StructureType.HH):
                choch_points.append(StructurePoint(
                    timestamp=current.timestamp,
                    type=StructureType.CHOCH,
                    direction=TrendDirection.BULLISH,
                    price=current.price,
                    confirmed=current.confirmed,
                    candle_index=current.candle_index
                ))
            
            # Bearish CHoCH: HH + HL + LL
            elif (prev2.type == StructureType.HH and
                  prev1.type == StructureType.HL and
                  current.type == StructureType.LL):
                choch_points.append(StructurePoint(
                    timestamp=current.timestamp,
                    type=StructureType.CHOCH,
                    direction=TrendDirection.BEARISH,
                    price=current.price,
                    confirmed=current.confirmed,
                    candle_index=current.candle_index
                ))
        
        return choch_points
    
    def get_trend_direction(self, structures: List[StructurePoint]) -> TrendDirection:
        """
        Determine current market trend direction
        
        Analyzes recent structures to determine bias
        """
        if len(structures) < 2:
            return TrendDirection.NEUTRAL
        
        # Get recent structures
        recent = structures[-4:] if len(structures) >= 4 else structures
        
        bullish_count = sum(1 for s in recent if s.direction == TrendDirection.BULLISH)
        bearish_count = sum(1 for s in recent if s.direction == TrendDirection.BEARISH)
        
        if bullish_count > bearish_count:
            return TrendDirection.BULLISH
        elif bearish_count > bullish_count:
            return TrendDirection.BEARISH
        
        return TrendDirection.NEUTRAL


def analyze_structure(candles: List[Candle], swings: List[Swing]) -> dict:
    """
    Complete structure analysis
    
    Returns dict with:
    - basic_structures: HH, HL, LH, LL
    - bos_points: Break of Structure
    - choch_points: Change of Character
    - trend: Current trend direction
    """
    detector = StructureDetector()
    
    basic = detector.detect_basic_structure(swings)
    bos = detector.detect_bos(candles, swings)
    choch = detector.detect_choch(basic)
    trend = detector.get_trend_direction(basic)
    
    return {
        'structures': basic,
        'bos_points': bos,
        'choch_points': choch,
        'trend': trend.value,
        'all_structures': sorted(basic + bos + choch, key=lambda s: s.candle_index)
    }
