"""
SMC Engine - Order Block Detection Module
Mathematical implementation of Institutional Order Blocks

Mathematical Formulas:

1. Bullish Order Block:
   - Last bearish candle before strong bullish move
   - Impulse detection: impulse = close[i+1] - open[i+1]
   - if impulse > avg_candle * 2: order_block = True

2. Order Block Zone:
   - OB High = candle.high
   - OB Low = candle.low

3. Retest Detection:
   - if price returns inside OB zone: valid_entry = True

4. OB Strength:
   - Based on impulse magnitude relative to average candle

Author: Trading AI Agent
"""

from dataclasses import dataclass
from typing import List, Optional, Tuple
from enum import Enum
from datetime import datetime
import numpy as np

from .swing import Candle


class OrderBlockType(Enum):
    """Order Block Types"""
    BULLISH = "BULLISH"
    BEARISH = "BEARISH"


@dataclass
class OrderBlock:
    """Order Block Zone"""
    type: OrderBlockType
    high_price: float
    low_price: float
    candle_index: int
    volume: float
    impulse_size: float
    strength: float = 1.0
    mitigated: bool = False
    mitigated_at: Optional[datetime] = None
    retested: bool = False
    retested_at: Optional[datetime] = None
    timestamp: Optional[datetime] = None


class OrderBlockDetector:
    """
    Order Block Detection using mathematical formulas
    
    An Order Block is the last opposing candle before a strong directional move.
    It represents institutional entry zones.
    """
    
    def __init__(self, min_impulse_mult: float = 2.0, volume_mult: float = 1.2):
        """
        Initialize Order Block Detector
        
        Args:
            min_impulse_mult: Minimum impulse multiple of average candle
            volume_mult: Volume multiplier for confirmation
        """
        self.min_impulse_mult = min_impulse_mult
        self.volume_mult = volume_mult
    
    def calculate_average_candle_size(self, candles: List[Candle]) -> float:
        """Calculate average candle size for reference"""
        sizes = [c.high - c.low for c in candles]
        return np.mean(sizes) if sizes else 0
    
    def calculate_average_volume(self, candles: List[Candle]) -> float:
        """Calculate average volume"""
        volumes = [c.volume for c in candles]
        return np.mean(volumes) if volumes else 0
    
    def detect_bullish_order_blocks(self, candles: List[Candle]) -> List[OrderBlock]:
        """
        Detect Bullish Order Blocks
        
        Mathematical Formula:
        1. Find bearish candle (close < open)
        2. Next candle shows strong bullish impulse
        3. Impulse = close[i+1] - open[i+1]
        4. if impulse > avg_candle * min_impulse_mult:
              Order Block detected
        
        The OB zone is the bearish candle's range
        """
        if len(candles) < 5:
            return []
        
        order_blocks = []
        avg_size = self.calculate_average_candle_size(candles[:-1])
        avg_volume = self.calculate_average_volume(candles[:-1])
        
        if avg_size == 0:
            return []
        
        for i in range(len(candles) - 1):
            candle = candles[i]
            next_candle = candles[i + 1]
            
            # Check if current candle is bearish
            is_bearish = candle.close < candle.open
            
            # Calculate bullish impulse of next candle
            impulse = next_candle.close - next_candle.open
            
            # Mathematical condition: impulse > avg_candle * min_impulse_mult
            is_strong_impulse = impulse > avg_size * self.min_impulse_mult
            
            # Volume confirmation
            volume_spike = next_candle.volume > avg_volume * self.volume_mult
            
            if is_bearish and is_strong_impulse:
                # Calculate OB strength based on impulse magnitude
                strength = min((impulse / avg_size) / 2, 3.0)
                
                ob = OrderBlock(
                    type=OrderBlockType.BULLISH,
                    high_price=candle.high,
                    low_price=candle.low,
                    candle_index=i,
                    volume=candle.volume,
                    impulse_size=impulse,
                    strength=strength,
                    timestamp=candle.timestamp
                )
                
                # Check mitigation and retest
                self._update_ob_status(candles, ob, i)
                order_blocks.append(ob)
        
        return order_blocks
    
    def detect_bearish_order_blocks(self, candles: List[Candle]) -> List[OrderBlock]:
        """
        Detect Bearish Order Blocks
        
        Mathematical Formula:
        1. Find bullish candle (close > open)
        2. Next candle shows strong bearish impulse
        3. Impulse = open[i+1] - close[i+1] (negative move)
        4. if impulse > avg_candle * min_impulse_mult:
              Order Block detected
        """
        if len(candles) < 5:
            return []
        
        order_blocks = []
        avg_size = self.calculate_average_candle_size(candles[:-1])
        avg_volume = self.calculate_average_volume(candles[:-1])
        
        if avg_size == 0:
            return []
        
        for i in range(len(candles) - 1):
            candle = candles[i]
            next_candle = candles[i + 1]
            
            # Check if current candle is bullish
            is_bullish = candle.close > candle.open
            
            # Calculate bearish impulse of next candle
            impulse = next_candle.open - next_candle.close
            
            # Mathematical condition for strong impulse
            is_strong_impulse = impulse > avg_size * self.min_impulse_mult
            
            if is_bullish and is_strong_impulse:
                strength = min((impulse / avg_size) / 2, 3.0)
                
                ob = OrderBlock(
                    type=OrderBlockType.BEARISH,
                    high_price=candle.high,
                    low_price=candle.low,
                    candle_index=i,
                    volume=candle.volume,
                    impulse_size=impulse,
                    strength=strength,
                    timestamp=candle.timestamp
                )
                
                self._update_ob_status(candles, ob, i)
                order_blocks.append(ob)
        
        return order_blocks
    
    def detect_all_order_blocks(self, candles: List[Candle]) -> List[OrderBlock]:
        """Detect all order blocks"""
        bullish = self.detect_bullish_order_blocks(candles)
        bearish = self.detect_bearish_order_blocks(candles)
        
        # Combine and sort by candle index
        all_obs = bullish + bearish
        return sorted(all_obs, key=lambda ob: ob.candle_index)
    
    def _update_ob_status(self, candles: List[Candle], ob: OrderBlock, ob_index: int):
        """
        Update Order Block mitigation and retest status
        
        Mathematical conditions:
        
        For Bullish OB:
        - Mitigated: price trades through OB zone (low <= OB.low)
        - Retested: price touches OB zone and bounces (low <= OB.high and close > OB.high)
        
        For Bearish OB:
        - Mitigated: price trades through OB zone (high >= OB.high)
        - Retested: price touches OB zone and bounces (high >= OB.low and close < OB.low)
        """
        for i in range(ob_index + 1, len(candles)):
            candle = candles[i]
            
            if ob.type == OrderBlockType.BULLISH:
                # Check for mitigation (price trades through)
                if candle.low <= ob.low_price and not ob.mitigated:
                    ob.mitigated = True
                    ob.mitigated_at = candle.timestamp
                
                # Check for retest (touch and bounce)
                if (candle.low <= ob.high_price and 
                    candle.low >= ob.low_price and
                    candle.close > ob.high_price and
                    not ob.retested):
                    ob.retested = True
                    ob.retested_at = candle.timestamp
            
            else:  # BEARISH
                if candle.high >= ob.high_price and not ob.mitigated:
                    ob.mitigated = True
                    ob.mitigated_at = candle.timestamp
                
                if (candle.high >= ob.low_price and
                    candle.high <= ob.high_price and
                    candle.close < ob.low_price and
                    not ob.retested):
                    ob.retested = True
                    ob.retested_at = candle.timestamp
    
    def is_price_in_ob_zone(self, price: float, ob: OrderBlock) -> bool:
        """Check if price is within order block zone"""
        return ob.low_price <= price <= ob.high_price
    
    def get_nearest_order_block(self, price: float, order_blocks: List[OrderBlock],
                               ob_type: Optional[OrderBlockType] = None,
                               include_mitigated: bool = False) -> Optional[OrderBlock]:
        """Get nearest active order block to price"""
        filtered = order_blocks
        
        if ob_type:
            filtered = [ob for ob in filtered if ob.type == ob_type]
        
        if not include_mitigated:
            filtered = [ob for ob in filtered if not ob.mitigated]
        
        if not filtered:
            return None
        
        # Calculate distance from price to OB zone
        def distance(ob: OrderBlock) -> float:
            if self.is_price_in_ob_zone(price, ob):
                return 0
            ob_mid = (ob.high_price + ob.low_price) / 2
            return abs(price - ob_mid)
        
        return min(filtered, key=distance)
    
    def get_retested_order_blocks(self, order_blocks: List[OrderBlock]) -> List[OrderBlock]:
        """Get order blocks that have been retested (high probability)"""
        return [ob for ob in order_blocks if ob.retested and not ob.mitigated]


def find_order_block_for_entry(candles: List[Candle], direction: str) -> Optional[OrderBlock]:
    """
    Find the most relevant order block for potential entry
    
    Args:
        candles: List of candles
        direction: 'LONG' or 'SHORT'
    
    Returns:
        Best order block for entry or None
    """
    detector = OrderBlockDetector()
    all_obs = detector.detect_all_order_blocks(candles)
    
    current_price = candles[-1].close
    
    if direction == 'LONG':
        # Find bullish OB below current price
        target_type = OrderBlockType.BULLISH
        relevant_obs = [ob for ob in all_obs if 
                       ob.type == target_type and 
                       ob.high_price < current_price and
                       not ob.mitigated]
    else:
        target_type = OrderBlockType.BEARISH
        relevant_obs = [ob for ob in all_obs if 
                       ob.type == target_type and 
                       ob.low_price > current_price and
                       not ob.mitigated]
    
    if not relevant_obs:
        return None
    
    # Return most recent OB
    return max(relevant_obs, key=lambda ob: ob.candle_index)
