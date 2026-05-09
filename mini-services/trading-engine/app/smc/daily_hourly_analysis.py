"""
SMC Engine - Daily/Hourly Analysis
Simplified Multi-Timeframe for Cost-Effective Operation

Timeframe Structure:
- Daily → Market Bias (Higher Timeframe)
- Hourly → Entry Setup (Lower Timeframe)

Rule: Hourly trade MUST align with Daily bias

Author: Trading AI Agent
"""

from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple
from datetime import datetime
from enum import Enum
import numpy as np

from app.smc import Candle, Swing, SwingDetector, StructureDetector
from app.smc import LiquidityDetector, OrderBlockDetector, FVGDetector
from app.smc import ConfluenceEngine, RegimeDetector, MarketRegime


@dataclass
class TimeframeAnalysis:
    """Analysis result for a single timeframe"""
    timeframe: str
    trend: str  # BULLISH, BEARISH, NEUTRAL
    regime: str
    trend_strength: float
    
    # Structure
    last_swing_high: Optional[float] = None
    last_swing_low: Optional[float] = None
    bos_points: List[dict] = field(default_factory=list)
    choch_points: List[dict] = field(default_factory=list)
    
    # Key Levels
    resistance_levels: List[float] = field(default_factory=list)
    support_levels: List[float] = field(default_factory=list)
    
    # Order Blocks
    order_blocks: List[dict] = field(default_factory=list)
    
    # FVGs
    fvgs: List[dict] = field(default_factory=list)
    
    # Metadata
    analysis_time: datetime = None
    candle_count: int = 0
    
    def __post_init__(self):
        if self.analysis_time is None:
            self.analysis_time = datetime.utcnow()


@dataclass
class DHSignal:
    """Daily/Hourly Aligned Signal"""
    symbol: str
    direction: str  # LONG, SHORT, NONE
    
    # Daily bias
    daily_bias: str
    daily_trend_strength: float
    
    # Hourly structure
    hourly_trend: str
    hourly_setup: str
    
    # Alignment
    alignment_score: int  # 0-100
    
    # Levels
    entry_zone: Tuple[float, float]
    stop_loss: float
    take_profit: float
    risk_reward: float
    
    # Confluence
    daily_aligned: bool
    hourly_confirmed: bool
    
    # Details
    reasons: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    
    analysis_time: datetime = None
    
    def __post_init__(self):
        if self.analysis_time is None:
            self.analysis_time = datetime.utcnow()


class DailyHourlyEngine:
    """
    Daily/Hourly Analysis Engine
    
    Simplified for cost-effective operation:
    - Daily: Market bias and key levels
    - Hourly: Entry setups and execution
    
    NO intraday timeframes (5m, 15m)
    """
    
    def __init__(self, min_alignment_score: int = 60):
        """
        Initialize DH Engine
        
        Args:
            min_alignment_score: Minimum score to generate signal
        """
        self.min_alignment_score = min_alignment_score
        
        # Detectors
        self.swing_detector = SwingDetector(strength=3)
        self.structure_detector = StructureDetector()
        self.liq_detector = LiquidityDetector()
        self.ob_detector = OrderBlockDetector()
        self.fvg_detector = FVGDetector()
        self.regime_detector = RegimeDetector()
        self.confluence_engine = ConfluenceEngine()
    
    def analyze_timeframe(self, candles: List[Candle], timeframe: str) -> TimeframeAnalysis:
        """
        Analyze a single timeframe
        
        Args:
            candles: OHLCV candles for this timeframe
            timeframe: '1d' or '1h'
            
        Returns:
            TimeframeAnalysis with all structure details
        """
        if len(candles) < 30:
            return TimeframeAnalysis(
                timeframe=timeframe,
                trend='NEUTRAL',
                regime='UNKNOWN',
                trend_strength=0,
                candle_count=len(candles)
            )
        
        # Detect swings
        swings = self.swing_detector.detect_swings(candles)
        
        # Detect structure
        structures = self.structure_detector.detect_basic_structure(swings)
        bos_points = self.structure_detector.detect_bos(candles, swings)
        choch_points = self.structure_detector.detect_choch(candles, swings)
        trend = self.structure_detector.get_trend_direction(structures)
        
        # Detect regime
        regime_data = self.regime_detector.detect_regime(candles)
        
        # Detect order blocks
        order_blocks = self.ob_detector.detect_all_order_blocks(candles)
        
        # Detect FVGs
        fvgs = self.fvg_detector.detect_all_fvgs(candles)
        
        # Get last swing points
        swing_highs = [s for s in swings if s.type == 'HIGH']
        swing_lows = [s for s in swings if s.type == 'LOW']
        
        last_swing_high = swing_highs[-1].price if swing_highs else None
        last_swing_low = swing_lows[-1].price if swing_lows else None
        
        # Support/Resistance from swings
        resistance_levels = sorted([s.price for s in swing_highs[-5:]], reverse=True) if swing_highs else []
        support_levels = sorted([s.price for s in swing_lows[-5:]]) if swing_lows else []
        
        return TimeframeAnalysis(
            timeframe=timeframe,
            trend=trend.value,
            regime=regime_data.regime.value,
            trend_strength=regime_data.trend_strength,
            last_swing_high=last_swing_high,
            last_swing_low=last_swing_low,
            bos_points=[{
                'direction': b.direction.value if hasattr(b.direction, 'value') else b.direction,
                'price': b.price,
                'timestamp': b.timestamp.isoformat() if hasattr(b.timestamp, 'isoformat') else str(b.timestamp)
            } for b in bos_points[-3:]],
            choch_points=[{
                'direction': c.direction.value if hasattr(c.direction, 'value') else c.direction,
                'price': c.price
            } for c in choch_points[-3:]],
            resistance_levels=resistance_levels,
            support_levels=support_levels,
            order_blocks=[{
                'type': ob.type.value,
                'high': ob.high_price,
                'low': ob.low_price,
                'mitigated': ob.mitigated,
                'retested': ob.retested
            } for ob in order_blocks[-5:]],
            fvgs=[{
                'type': f.type.value,
                'top': f.gap_top,
                'bottom': f.gap_bottom,
                'filled': f.filled
            } for f in fvgs[-5:]],
            candle_count=len(candles)
        )
    
    def check_daily_alignment(self, daily: TimeframeAnalysis, direction: str) -> Tuple[bool, int, List[str]]:
        """
        Check if trade direction aligns with Daily bias
        
        Args:
            daily: Daily timeframe analysis
            direction: Proposed trade direction
            
        Returns:
            Tuple of (aligned, score, reasons)
        """
        score = 0
        reasons = []
        
        # Check trend alignment
        if direction == 'LONG':
            if daily.trend == 'BULLISH':
                score += 40
                reasons.append("Daily trend is BULLISH - aligned with LONG")
            elif daily.trend == 'BEARISH':
                reasons.append("Daily trend is BEARISH - NOT aligned with LONG")
                return False, 0, reasons
        else:  # SHORT
            if daily.trend == 'BEARISH':
                score += 40
                reasons.append("Daily trend is BEARISH - aligned with SHORT")
            elif daily.trend == 'BULLISH':
                reasons.append("Daily trend is BULLISH - NOT aligned with SHORT")
                return False, 0, reasons
        
        # Check regime suitability
        if daily.regime == 'TRENDING':
            score += 20
            reasons.append("Daily regime is TRENDING - good for directional trades")
        
        # Check trend strength
        if daily.trend_strength > 60:
            score += 15
            reasons.append(f"Strong Daily trend strength: {daily.trend_strength:.0f}%")
        
        return True, score, reasons
    
    def check_hourly_setup(self, hourly: TimeframeAnalysis, direction: str) -> Tuple[bool, int, List[str], Optional[dict]]:
        """
        Check Hourly for entry setup
        
        Args:
            hourly: Hourly timeframe analysis
            direction: Trade direction
            
        Returns:
            Tuple of (valid, score, reasons, entry_details)
        """
        score = 0
        reasons = []
        entry_details = None
        
        # Check for order blocks
        valid_obs = [
            ob for ob in hourly.order_blocks
            if (direction == 'LONG' and ob['type'] == 'BULLISH' and not ob['mitigated']) or
               (direction == 'SHORT' and ob['type'] == 'BEARISH' and not ob['mitigated'])
        ]
        
        if valid_obs:
            score += 30
            reasons.append(f"Valid {direction} Order Block on Hourly")
            
            best_ob = valid_obs[0]
            entry_details = {
                'entry_zone': (best_ob['low'], best_ob['high']),
                'type': 'OB_RETEST'
            }
        
        # Check for FVG fill
        filling_fvgs = [
            f for f in hourly.fvgs
            if not f['filled'] and (
                (direction == 'LONG' and f['type'] == 'BULLISH') or
                (direction == 'SHORT' and f['type'] == 'BEARISH')
            )
        ]
        
        if filling_fvgs:
            score += 20
            reasons.append("FVG available for entry")
            
            if entry_details is None:
                best_fvg = filling_fvgs[0]
                entry_details = {
                    'entry_zone': (best_fvg['bottom'], best_fvg['top']),
                    'type': 'FVG_FILL'
                }
        
        # Check trend alignment
        if hourly.trend == direction.replace('LONG', 'BULLISH').replace('SHORT', 'BEARISH'):
            score += 20
            reasons.append(f"Hourly trend aligned with {direction}")
        
        valid = score >= 30
        
        return valid, score, reasons, entry_details
    
    def generate_signal(self,
                       daily_candles: List[Candle],
                       hourly_candles: List[Candle],
                       symbol: str) -> Optional[DHSignal]:
        """
        Generate Daily/Hourly Aligned Signal
        
        Process:
        1. Analyze Daily for bias
        2. Analyze Hourly for setup
        3. Check alignment
        4. Generate signal if score >= threshold
        
        Args:
            daily_candles: Daily timeframe candles
            hourly_candles: Hourly timeframe candles
            symbol: Symbol being analyzed
            
        Returns:
            DHSignal if valid setup found, None otherwise
        """
        # Analyze timeframes
        daily = self.analyze_timeframe(daily_candles, '1d')
        hourly = self.analyze_timeframe(hourly_candles, '1h')
        
        # Skip if Daily is neutral
        if daily.trend == 'NEUTRAL':
            return None
        
        # Determine direction from Daily
        direction = 'LONG' if daily.trend == 'BULLISH' else 'SHORT'
        
        # Check alignment
        daily_aligned, daily_score, daily_reasons = self.check_daily_alignment(daily, direction)
        
        if not daily_aligned:
            return None
        
        hourly_valid, hourly_score, hourly_reasons, entry_details = self.check_hourly_setup(hourly, direction)
        
        # Calculate total alignment score
        total_score = daily_score + hourly_score
        
        if total_score < self.min_alignment_score:
            return None
        
        # Determine entry zone
        if entry_details:
            entry_zone = entry_details['entry_zone']
        else:
            current_price = hourly_candles[-1].close if hourly_candles else 0
            entry_zone = (current_price * 0.998, current_price * 1.002)
        
        # Calculate stop loss and take profit
        if direction == 'LONG':
            entry_price = entry_zone[1]
            stop_loss = hourly.last_swing_low or entry_price * 0.97
            take_profit = entry_price + (entry_price - stop_loss) * 2  # 2:1 R:R
        else:
            entry_price = entry_zone[0]
            stop_loss = hourly.last_swing_high or entry_price * 1.03
            take_profit = entry_price - (stop_loss - entry_price) * 2
        
        risk_reward = abs(take_profit - entry_price) / abs(entry_price - stop_loss) if abs(entry_price - stop_loss) > 0 else 0
        
        return DHSignal(
            symbol=symbol,
            direction=direction,
            daily_bias=daily.trend,
            daily_trend_strength=daily.trend_strength,
            hourly_trend=hourly.trend,
            hourly_setup=entry_details['type'] if entry_details else 'MARKET',
            alignment_score=total_score,
            entry_zone=entry_zone,
            stop_loss=stop_loss,
            take_profit=take_profit,
            risk_reward=risk_reward,
            daily_aligned=daily_aligned,
            hourly_confirmed=hourly_valid,
            reasons=daily_reasons + hourly_reasons,
            warnings=[]
        )
    
    def get_status(self,
                  daily_candles: List[Candle],
                  hourly_candles: List[Candle]) -> Dict:
        """
        Get status for dashboard display
        """
        daily = self.analyze_timeframe(daily_candles, '1d')
        hourly = self.analyze_timeframe(hourly_candles, '1h')
        
        return {
            'daily': {
                'timeframe': '1d',
                'trend': daily.trend,
                'regime': daily.regime,
                'strength': daily.trend_strength,
                'key_levels': {
                    'resistance': daily.resistance_levels[:3],
                    'support': daily.support_levels[:3]
                }
            },
            'hourly': {
                'timeframe': '1h',
                'trend': hourly.trend,
                'regime': hourly.regime,
                'active_obs': len([ob for ob in hourly.order_blocks if not ob['mitigated']]),
                'active_fvgs': len([f for f in hourly.fvgs if not f['filled']])
            },
            'alignment': {
                'aligned': daily.trend == hourly.trend or daily.trend == 'NEUTRAL',
                'bias': daily.trend
            }
        }
