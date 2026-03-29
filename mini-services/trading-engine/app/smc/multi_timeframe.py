"""
SMC Engine - Multi-Timeframe Analysis
Institutional Timeframe Hierarchy Implementation

Timeframe Structure:
- Daily → Market Bias
- 4 Hour → Structure  
- 1 Hour → Setup Zone
- 15 Min → Entry Zone
- 5 Min → Entry Trigger

Rule: Lower timeframe trade MUST align with HTF bias
      This removes 80% of bad trades

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


class TimeframeLevel(Enum):
    """Timeframe hierarchy levels"""
    DAILY = "1d"
    FOUR_HOUR = "4h"
    ONE_HOUR = "1h"
    FIFTEEN_MIN = "15m"
    FIVE_MIN = "5m"
    ONE_MIN = "1m"


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
    
    # Liquidity
    liquidity_zones: List[dict] = field(default_factory=list)
    
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
class MTFSignal:
    """Multi-Timeframe Aligned Signal"""
    symbol: str
    direction: str  # LONG, SHORT, NONE
    
    # Alignment
    htf_bias: str
    mtf_structure: str
    ltf_setup: str
    
    alignment_score: int  # 0-100
    
    # Levels
    entry_zone: Tuple[float, float]  # (low, high)
    stop_loss: float
    take_profit: float
    risk_reward: float
    
    # Confluence
    htf_aligned: bool
    mtf_aligned: bool
    ltf_confirmed: bool
    
    # Details
    reasons: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    
    analysis_time: datetime = None
    
    def __post_init__(self):
        if self.analysis_time is None:
            self.analysis_time = datetime.utcnow()


class MultiTimeframeEngine:
    """
    Multi-Timeframe Analysis Engine
    
    Institutional Timeframe Hierarchy:
    =================================
    
    HTF (Higher Timeframe) - Daily/4H:
    - Determines market BIAS
    - Identifies major structure
    - Finds key liquidity levels
    
    MTF (Middle Timeframe) - 1H:
    - Structure confirmation
    - Order Block identification
    - Setup zone definition
    
    LTF (Lower Timeframe) - 15M/5M:
    - Entry trigger
    - Precise stop loss
    - Intraday liquidity
    """
    
    # Timeframe hierarchy (higher to lower)
    TIMEFRAME_HIERARCHY = {
        TimeframeLevel.DAILY: 1,
        TimeframeLevel.FOUR_HOUR: 2,
        TimeframeLevel.ONE_HOUR: 3,
        TimeframeLevel.FIFTEEN_MIN: 4,
        TimeframeLevel.FIVE_MIN: 5,
        TimeframeLevel.ONE_MIN: 6
    }
    
    def __init__(self,
                 htf_timeframe: str = "1d",
                 mtf_timeframe: str = "1h",
                 ltf_timeframe: str = "5m",
                 min_alignment_score: int = 70):
        """
        Initialize MTF Engine
        
        Args:
            htf_timeframe: Higher timeframe for bias
            mtf_timeframe: Middle timeframe for structure
            ltf_timeframe: Lower timeframe for entry
            min_alignment_score: Minimum score to generate signal
        """
        self.htf_timeframe = htf_timeframe
        self.mtf_timeframe = mtf_timeframe
        self.ltf_timeframe = ltf_timeframe
        self.min_alignment_score = min_alignment_score
        
        # Detectors
        self.swing_detector = SwingDetector()
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
            timeframe: Timeframe string
            
        Returns:
            TimeframeAnalysis with all structure details
        """
        if len(candles) < 50:
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
        
        # Detect liquidity
        liquidity = self.liq_detector.detect_all_liquidity(swings, candles)
        
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
            liquidity_zones=[{
                'type': z.type.value,
                'price': z.price_level,
                'swept': z.swept
            } for z in liquidity[-5:]],
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
    
    def check_htf_alignment(self, htf_analysis: TimeframeAnalysis, direction: str) -> Tuple[bool, int, List[str]]:
        """
        Check if trade direction aligns with HTF bias
        
        Args:
            htf_analysis: Higher timeframe analysis
            direction: Proposed trade direction
            
        Returns:
            Tuple of (aligned, score, reasons)
        """
        score = 0
        reasons = []
        
        # Check trend alignment
        if direction == 'LONG':
            if htf_analysis.trend == 'BULLISH':
                score += 30
                reasons.append("HTF trend is BULLISH - aligned with LONG")
            elif htf_analysis.trend == 'BEARISH':
                reasons.append("HTF trend is BEARISH - NOT aligned with LONG")
                return False, 0, reasons
        else:  # SHORT
            if htf_analysis.trend == 'BEARISH':
                score += 30
                reasons.append("HTF trend is BEARISH - aligned with SHORT")
            elif htf_analysis.trend == 'BULLISH':
                reasons.append("HTF trend is BULLISH - NOT aligned with SHORT")
                return False, 0, reasons
        
        # Check regime suitability
        if htf_analysis.regime == 'TRENDING':
            score += 20
            reasons.append("HTF regime is TRENDING - good for directional trades")
        elif htf_analysis.regime == 'VOLATILE':
            reasons.append("WARNING: HTF regime is VOLATILE - higher risk")
        
        # Check trend strength
        if htf_analysis.trend_strength > 60:
            score += 15
            reasons.append(f"Strong HTF trend strength: {htf_analysis.trend_strength:.0f}%")
        
        return True, score, reasons
    
    def check_mtf_structure(self, mtf_analysis: TimeframeAnalysis, direction: str) -> Tuple[bool, int, List[str]]:
        """
        Check MTF structure for setup confirmation
        
        Args:
            mtf_analysis: Middle timeframe analysis
            direction: Trade direction
            
        Returns:
            Tuple of (valid, score, reasons)
        """
        score = 0
        reasons = []
        
        # Check for BOS in trade direction
        bos_in_direction = [
            b for b in mtf_analysis.bos_points 
            if (direction == 'LONG' and b['direction'] == 'BULLISH') or
               (direction == 'SHORT' and b['direction'] == 'BEARISH')
        ]
        
        if bos_in_direction:
            score += 25
            reasons.append(f"MTF BOS confirmed in {direction} direction")
        
        # Check for CHoCH (trend continuation)
        choch_in_direction = [
            c for c in mtf_analysis.choch_points
            if (direction == 'LONG' and c['direction'] == 'BULLISH') or
               (direction == 'SHORT' and c['direction'] == 'BEARISH')
        ]
        
        if choch_in_direction:
            score += 15
            reasons.append(f"MTF CHoCH indicates {direction} continuation")
        
        # Check order blocks
        valid_obs = [
            ob for ob in mtf_analysis.order_blocks
            if (direction == 'LONG' and ob['type'] == 'BULLISH' and not ob['mitigated']) or
               (direction == 'SHORT' and ob['type'] == 'BEARISH' and not ob['mitigated'])
        ]
        
        if valid_obs:
            score += 20
            reasons.append(f"Valid {direction} Order Block present on MTF")
        
        return score > 0, score, reasons
    
    def check_ltf_entry(self, ltf_analysis: TimeframeAnalysis, direction: str) -> Tuple[bool, int, List[str], Optional[dict]]:
        """
        Check LTF for entry trigger
        
        Args:
            ltf_analysis: Lower timeframe analysis
            direction: Trade direction
            
        Returns:
            Tuple of (valid, score, reasons, entry_details)
        """
        score = 0
        reasons = []
        entry_details = None
        
        # Check for liquidity sweep
        swept_zones = [z for z in ltf_analysis.liquidity_zones if z['swept']]
        
        if swept_zones:
            score += 30
            reasons.append("Liquidity sweep detected on LTF")
        
        # Check for order block retest
        retested_obs = [
            ob for ob in ltf_analysis.order_blocks
            if ob['retested'] and (
                (direction == 'LONG' and ob['type'] == 'BULLISH') or
                (direction == 'SHORT' and ob['type'] == 'BEARISH')
            )
        ]
        
        if retested_obs:
            score += 25
            reasons.append("Order Block retest confirmed on LTF")
            
            # Use OB as entry zone
            best_ob = retested_obs[0]
            entry_details = {
                'entry_zone': (best_ob['low'], best_ob['high']),
                'type': 'OB_RETEST'
            }
        
        # Check for FVG fill
        filling_fvgs = [
            f for f in ltf_analysis.fvgs
            if not f['filled'] and (
                (direction == 'LONG' and f['type'] == 'BULLISH') or
                (direction == 'SHORT' and f['type'] == 'BEARISH')
            )
        ]
        
        if filling_fvgs:
            score += 15
            reasons.append("FVG available for entry")
            
            if entry_details is None:
                best_fvg = filling_fvgs[0]
                entry_details = {
                    'entry_zone': (best_fvg['bottom'], best_fvg['top']),
                    'type': 'FVG_FILL'
                }
        
        # Require minimum score for valid entry
        valid = score >= 25
        
        return valid, score, reasons, entry_details
    
    def generate_mtf_signal(self,
                           htf_candles: List[Candle],
                           mtf_candles: List[Candle],
                           ltf_candles: List[Candle],
                           symbol: str) -> Optional[MTFSignal]:
        """
        Generate Multi-Timeframe Aligned Signal
        
        This is the MAIN method that combines all timeframe analysis.
        
        Process:
        1. Analyze HTF for bias
        2. Analyze MTF for structure
        3. Analyze LTF for entry
        4. Check alignment across all timeframes
        5. Generate signal if alignment score >= threshold
        
        Args:
            htf_candles: Higher timeframe candles
            mtf_candles: Middle timeframe candles
            ltf_candles: Lower timeframe candles
            symbol: Symbol being analyzed
            
        Returns:
            MTFSignal if valid setup found, None otherwise
        """
        # Analyze each timeframe
        htf = self.analyze_timeframe(htf_candles, self.htf_timeframe)
        mtf = self.analyze_timeframe(mtf_candles, self.mtf_timeframe)
        ltf = self.analyze_timeframe(ltf_candles, self.ltf_timeframe)
        
        # Skip if HTF is neutral or volatile
        if htf.trend == 'NEUTRAL':
            return None
        
        if htf.regime == 'VOLATILE':
            return MTFSignal(
                symbol=symbol,
                direction='NONE',
                htf_bias=htf.trend,
                mtf_structure=mtf.trend,
                ltf_setup=ltf.trend,
                alignment_score=0,
                entry_zone=(0, 0),
                stop_loss=0,
                take_profit=0,
                risk_reward=0,
                htf_aligned=False,
                mtf_aligned=False,
                ltf_confirmed=False,
                warnings=["HTF regime is VOLATILE - no trades recommended"]
            )
        
        # Determine direction from HTF
        direction = 'LONG' if htf.trend == 'BULLISH' else 'SHORT'
        
        # Check alignment at each level
        htf_aligned, htf_score, htf_reasons = self.check_htf_alignment(htf, direction)
        
        if not htf_aligned:
            return None
        
        mtf_aligned, mtf_score, mtf_reasons = self.check_mtf_structure(mtf, direction)
        
        ltf_valid, ltf_score, ltf_reasons, entry_details = self.check_ltf_entry(ltf, direction)
        
        # Calculate total alignment score
        total_score = htf_score + mtf_score + ltf_score
        
        if total_score < self.min_alignment_score:
            return None
        
        # Determine entry zone
        if entry_details:
            entry_zone = entry_details['entry_zone']
        else:
            # Use current price area
            current_price = ltf_candles[-1].close
            entry_zone = (current_price * 0.998, current_price * 1.002)
        
        # Calculate stop loss and take profit
        if direction == 'LONG':
            entry_price = entry_zone[1]  # Upper end of zone for long
            stop_loss = ltf.last_swing_low or entry_price * 0.98
            take_profit = entry_price + (entry_price - stop_loss) * 2  # 2:1 R:R
        else:
            entry_price = entry_zone[0]  # Lower end of zone for short
            stop_loss = ltf.last_swing_high or entry_price * 1.02
            take_profit = entry_price - (stop_loss - entry_price) * 2  # 2:1 R:R
        
        risk_reward = abs(take_profit - entry_price) / abs(entry_price - stop_loss) if abs(entry_price - stop_loss) > 0 else 0
        
        return MTFSignal(
            symbol=symbol,
            direction=direction,
            htf_bias=htf.trend,
            mtf_structure=mtf.trend,
            ltf_setup=ltf.trend,
            alignment_score=total_score,
            entry_zone=entry_zone,
            stop_loss=stop_loss,
            take_profit=take_profit,
            risk_reward=risk_reward,
            htf_aligned=htf_aligned,
            mtf_aligned=mtf_aligned,
            ltf_confirmed=ltf_valid,
            reasons=htf_reasons + mtf_reasons + ltf_reasons,
            warnings=[]
        )
    
    def get_timeframe_status(self,
                            htf_candles: List[Candle],
                            mtf_candles: List[Candle],
                            ltf_candles: List[Candle]) -> Dict:
        """
        Get status of all timeframes for dashboard display
        
        Returns a structured summary of each timeframe's analysis
        """
        htf = self.analyze_timeframe(htf_candles, self.htf_timeframe)
        mtf = self.analyze_timeframe(mtf_candles, self.mtf_timeframe)
        ltf = self.analyze_timeframe(ltf_candles, self.ltf_timeframe)
        
        return {
            'htf': {
                'timeframe': self.htf_timeframe,
                'trend': htf.trend,
                'regime': htf.regime,
                'strength': htf.trend_strength,
                'key_levels': {
                    'resistance': htf.resistance_levels[:3],
                    'support': htf.support_levels[:3]
                }
            },
            'mtf': {
                'timeframe': self.mtf_timeframe,
                'trend': mtf.trend,
                'regime': mtf.regime,
                'bos_count': len(mtf.bos_points),
                'ob_count': len([ob for ob in mtf.order_blocks if not ob['mitigated']])
            },
            'ltf': {
                'timeframe': self.ltf_timeframe,
                'trend': ltf.trend,
                'liquidity_zones': len([z for z in ltf.liquidity_zones if not z['swept']]),
                'active_fvgs': len([f for f in ltf.fvgs if not f['filled']])
            },
            'alignment': {
                'htf_mtf_aligned': htf.trend == mtf.trend,
                'mtf_ltf_aligned': mtf.trend == ltf.trend,
                'all_aligned': htf.trend == mtf.trend == ltf.trend
            }
        }
