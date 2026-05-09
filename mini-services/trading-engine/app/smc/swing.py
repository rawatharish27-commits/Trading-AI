"""
SMC Engine - Swing Detection Module
Mathematical implementation of Swing High/Low detection

Formula:
- Swing High: data.high[i] == max(data.high[i-n:i+n])
- Swing Low: data.low[i] == min(data.low[i-n:i+n])

Author: Trading AI Agent
"""

from dataclasses import dataclass
from typing import List, Optional, Tuple
import numpy as np
from datetime import datetime


@dataclass
class Candle:
    """OHLCV Candle Data"""
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
    symbol: str = ""
    timeframe: str = "5m"


@dataclass
class Swing:
    """Swing Point"""
    timestamp: datetime
    price: float
    type: str  # 'HIGH' or 'LOW'
    strength: int
    confirmed: bool
    candle_index: int


class SwingDetector:
    """
    Swing Detection using mathematical formulas
    
    A swing point is formed when:
    - Swing High: candle's high is maximum among n candles on each side
    - Swing Low: candle's low is minimum among n candles on each side
    """
    
    def __init__(self, strength: int = 3, confirm_candles: int = 2):
        """
        Initialize Swing Detector
        
        Args:
            strength: Number of candles on each side (n)
            confirm_candles: Candles needed to confirm swing
        """
        self.strength = strength
        self.confirm_candles = confirm_candles
    
    def is_swing_high(self, highs: np.ndarray, index: int) -> bool:
        """
        Detect Swing High using mathematical formula
        
        Formula: data.high[i] == max(data.high[i-n:i+n])
        
        Args:
            highs: Array of high prices
            index: Current candle index
            
        Returns:
            True if swing high detected
        """
        n = self.strength
        
        # Check bounds
        if index < n or index >= len(highs) - n:
            return False
        
        current_high = highs[index]
        
        # Check if current high is maximum in window [i-n, i+n]
        window = highs[index - n : index + n + 1]
        
        # Must be strictly greater than all other highs in window
        for i, h in enumerate(window):
            if i != n and h >= current_high:  # i == n is the center (current)
                return False
        
        return True
    
    def is_swing_low(self, lows: np.ndarray, index: int) -> bool:
        """
        Detect Swing Low using mathematical formula
        
        Formula: data.low[i] == min(data.low[i-n:i+n])
        
        Args:
            lows: Array of low prices
            index: Current candle index
            
        Returns:
            True if swing low detected
        """
        n = self.strength
        
        if index < n or index >= len(lows) - n:
            return False
        
        current_low = lows[index]
        
        # Check if current low is minimum in window
        window = lows[index - n : index + n + 1]
        
        for i, l in enumerate(window):
            if i != n and l <= current_low:
                return False
        
        return True
    
    def is_swing_confirmed(self, candles: List[Candle], swing_index: int, 
                          swing_type: str) -> bool:
        """
        Check if swing is confirmed by subsequent price action
        
        - Swing High confirmed when price closes below swing candle's low
        - Swing Low confirmed when price closes above swing candle's high
        """
        if swing_index >= len(candles) - 1:
            return False
        
        swing_candle = candles[swing_index]
        confirm_count = 0
        
        for i in range(swing_index + 1, len(candles)):
            if swing_type == 'HIGH':
                # Confirmed when close < swing candle's low
                if candles[i].close < swing_candle.low:
                    confirm_count += 1
            else:  # LOW
                # Confirmed when close > swing candle's high
                if candles[i].close > swing_candle.high:
                    confirm_count += 1
            
            if confirm_count >= self.confirm_candles:
                return True
        
        return False
    
    def detect_swings(self, candles: List[Candle]) -> List[Swing]:
        """
        Detect all swing points in candle data
        
        Args:
            candles: List of OHLCV candles
            
        Returns:
            List of detected swings
        """
        if len(candles) < 2 * self.strength + 1:
            return []
        
        swings = []
        
        # Convert to numpy arrays for efficient computation
        highs = np.array([c.high for c in candles])
        lows = np.array([c.low for c in candles])
        
        # Detect swings
        for i in range(self.strength, len(candles) - self.strength):
            # Check for Swing High
            if self.is_swing_high(highs, i):
                confirmed = self.is_swing_confirmed(candles, i, 'HIGH')
                swings.append(Swing(
                    timestamp=candles[i].timestamp,
                    price=candles[i].high,
                    type='HIGH',
                    strength=self.strength,
                    confirmed=confirmed,
                    candle_index=i
                ))
            
            # Check for Swing Low
            if self.is_swing_low(lows, i):
                confirmed = self.is_swing_confirmed(candles, i, 'LOW')
                swings.append(Swing(
                    timestamp=candles[i].timestamp,
                    price=candles[i].low,
                    type='LOW',
                    strength=self.strength,
                    confirmed=confirmed,
                    candle_index=i
                ))
        
        return swings
    
    def get_recent_swing(self, swings: List[Swing], swing_type: str,
                         confirmed_only: bool = True) -> Optional[Swing]:
        """Get the most recent swing of specified type"""
        filtered = [s for s in swings if s.type == swing_type]
        if confirmed_only:
            filtered = [s for s in filtered if s.confirmed]
        
        if not filtered:
            return None
        
        return filtered[-1]
    
    def get_swings_in_range(self, swings: List[Swing], 
                           from_price: float, to_price: float) -> List[Swing]:
        """Get swings within a price range"""
        min_price = min(from_price, to_price)
        max_price = max(from_price, to_price)
        
        return [s for s in swings if min_price <= s.price <= max_price]


def detect_swing_points(candles: List[Candle], strength: int = 3) -> Tuple[List[Swing], List[Swing]]:
    """
    Convenience function to detect swing highs and lows
    
    Returns:
        Tuple of (swing_highs, swing_lows)
    """
    detector = SwingDetector(strength=strength)
    swings = detector.detect_swings(candles)
    
    swing_highs = [s for s in swings if s.type == 'HIGH']
    swing_lows = [s for s in swings if s.type == 'LOW']
    
    return swing_highs, swing_lows
