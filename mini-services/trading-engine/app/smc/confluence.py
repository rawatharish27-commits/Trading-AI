"""
SMC Engine - Confluence Engine Module
Mathematical implementation of Multi-Signal Confluence Scoring

Scoring System:
if liquidity_sweep: score += 30
if bos: score += 25
if orderblock_touch: score += 25
if fvg_present: score += 10
if volume_spike: score += 10

Trade Threshold:
if score >= 70: trade_candidate = True

Author: Trading AI Agent
"""

from dataclasses import dataclass
from typing import List, Optional, Tuple
from datetime import datetime

from .swing import Candle, Swing
from .structure import StructurePoint, StructureType, TrendDirection
from .liquidity import LiquidityZone, LiquidityDetector, LiquiditySweep
from .orderblock import OrderBlock, OrderBlockDetector, OrderBlockType
from .fvg import FairValueGap, FVGDetector, FVGType


@dataclass
class ConfluenceScore:
    """Confluence Score Breakdown"""
    liquidity_sweep: bool = False
    liquidity_score: int = 0
    bos: bool = False
    bos_score: int = 0
    orderblock_touch: bool = False
    ob_score: int = 0
    fvg_present: bool = False
    fvg_score: int = 0
    volume_spike: bool = False
    volume_score: int = 0
    total_score: int = 0


@dataclass
class TradeSetup:
    """Trade Setup from Confluence"""
    symbol: str
    timeframe: str
    timestamp: datetime
    direction: str  # 'LONG' or 'SHORT'
    confluence: ConfluenceScore
    htf_bias: str
    regime: str
    entry_price: float
    stop_loss: float
    take_profit: float
    risk_reward: float
    valid: bool = True


class ConfluenceEngine:
    """
    Confluence Engine combining all SMC signals
    
    Mathematical Scoring:
    - Liquidity Sweep: 30 points
    - Break of Structure: 25 points
    - Order Block Touch: 25 points
    - Fair Value Gap: 10 points
    - Volume Spike: 10 points
    
    Minimum threshold: 70 points for valid trade
    """
    
    def __init__(self, 
                 liquidity_score: int = 30,
                 bos_score: int = 25,
                 ob_score: int = 25,
                 fvg_score: int = 10,
                 volume_score: int = 10,
                 min_total_score: int = 70):
        """
        Initialize Confluence Engine
        
        Args:
            liquidity_score: Points for liquidity sweep
            bos_score: Points for break of structure
            ob_score: Points for order block touch
            fvg_score: Points for FVG confluence
            volume_score: Points for volume spike
            min_total_score: Minimum score for valid trade
        """
        self.liquidity_score = liquidity_score
        self.bos_score = bos_score
        self.ob_score = ob_score
        self.fvg_score = fvg_score
        self.volume_score = volume_score
        self.min_total_score = min_total_score
        
        # Detectors
        self.liq_detector = LiquidityDetector()
        self.ob_detector = OrderBlockDetector()
        self.fvg_detector = FVGDetector()
    
    def calculate_confluence(self,
                            candles: List[Candle],
                            current_price: float,
                            direction: str,
                            structures: List[StructurePoint],
                            liquidity_zones: List[LiquidityZone],
                            order_blocks: List[OrderBlock],
                            fvgs: List[FairValueGap]) -> ConfluenceScore:
        """
        Calculate Confluence Score
        
        Mathematical Formula:
        total_score = liquidity_score + bos_score + ob_score + fvg_score + volume_score
        
        Each condition is checked independently
        """
        score = ConfluenceScore()
        
        # 1. Check Liquidity Sweep
        sweep = self.liq_detector.detect_liquidity_sweep(candles, liquidity_zones)
        if sweep.swept and sweep.direction == direction:
            score.liquidity_sweep = True
            score.liquidity_score = self.liquidity_score
        
        # 2. Check Break of Structure
        recent_bos = self._find_recent_bos(structures, direction)
        if recent_bos:
            score.bos = True
            score.bos_score = self.bos_score
        
        # 3. Check Order Block Touch
        ob_touch = self._check_ob_touch(current_price, direction, order_blocks)
        if ob_touch:
            score.orderblock_touch = True
            score.ob_score = self.ob_score
        
        # 4. Check FVG Presence
        fvg_present = self._check_fvg_presence(current_price, direction, fvgs)
        if fvg_present:
            score.fvg_present = True
            score.fvg_score = self.fvg_score
        
        # 5. Check Volume Spike
        volume_spike = self._check_volume_spike(candles)
        if volume_spike:
            score.volume_spike = True
            score.volume_score = self.volume_score
        
        # Calculate Total
        score.total_score = (
            score.liquidity_score +
            score.bos_score +
            score.ob_score +
            score.fvg_score +
            score.volume_score
        )
        
        return score
    
    def _find_recent_bos(self, structures: List[StructurePoint], 
                        direction: str) -> Optional[StructurePoint]:
        """Find recent BOS aligned with direction"""
        recent = [s for s in structures if s.type == StructureType.BOS][-5:]
        
        for s in reversed(recent):
            if direction == 'LONG' and s.direction == TrendDirection.BULLISH:
                return s
            if direction == 'SHORT' and s.direction == TrendDirection.BEARISH:
                return s
        
        return None
    
    def _check_ob_touch(self, price: float, direction: str,
                       order_blocks: List[OrderBlock]) -> Optional[OrderBlock]:
        """Check if price is touching relevant order block"""
        target_type = OrderBlockType.BULLISH if direction == 'LONG' else OrderBlockType.BEARISH
        
        for ob in order_blocks:
            if ob.mitigated:
                continue
            if ob.type != target_type:
                continue
            if ob.low_price <= price <= ob.high_price:
                return ob
        
        return None
    
    def _check_fvg_presence(self, price: float, direction: str,
                           fvgs: List[FairValueGap]) -> Optional[FairValueGap]:
        """Check if price is in relevant FVG zone"""
        target_type = FVGType.BULLISH if direction == 'LONG' else FVGType.BEARISH
        
        for fvg in fvgs:
            if fvg.filled:
                continue
            if fvg.type != target_type:
                continue
            if fvg.gap_bottom <= price <= fvg.gap_top:
                return fvg
        
        return None
    
    def _check_volume_spike(self, candles: List[Candle]) -> bool:
        """Check for volume spike in recent candles"""
        if len(candles) < 20:
            return False
        
        recent = candles[-5:]
        historical = candles[-25:-5]
        
        avg_volume = sum(c.volume for c in historical) / len(historical)
        
        for candle in recent:
            if candle.volume > avg_volume * 1.5:
                return True
        
        return False
    
    def generate_trade_setup(self,
                            symbol: str,
                            timeframe: str,
                            candles: List[Candle],
                            structures: List[StructurePoint],
                            liquidity_zones: List[LiquidityZone],
                            order_blocks: List[OrderBlock],
                            fvgs: List[FairValueGap],
                            regime: str,
                            htf_bias: str) -> Optional[TradeSetup]:
        """
        Generate Trade Setup from Confluence Analysis
        """
        if not candles:
            return None
        
        current_candle = candles[-1]
        current_price = current_candle.close
        
        # Determine direction from HTF bias
        if htf_bias == 'BULLISH':
            direction = 'LONG'
        elif htf_bias == 'BEARISH':
            direction = 'SHORT'
        else:
            return None
        
        # Calculate confluence
        confluence = self.calculate_confluence(
            candles, current_price, direction,
            structures, liquidity_zones, order_blocks, fvgs
        )
        
        # Check minimum score
        if confluence.total_score < self.min_total_score:
            return None
        
        # Calculate trade levels
        entry, sl, tp, rr = self._calculate_trade_levels(
            current_price, direction,
            structures, order_blocks, liquidity_zones
        )
        
        return TradeSetup(
            symbol=symbol,
            timeframe=timeframe,
            timestamp=datetime.now(),
            direction=direction,
            confluence=confluence,
            htf_bias=htf_bias,
            regime=regime,
            entry_price=entry,
            stop_loss=sl,
            take_profit=tp,
            risk_reward=rr,
            valid=confluence.total_score >= self.min_total_score
        )
    
    def _calculate_trade_levels(self,
                               current_price: float,
                               direction: str,
                               structures: List[StructurePoint],
                               order_blocks: List[OrderBlock],
                               liquidity_zones: List[LiquidityZone]) -> Tuple[float, float, float, float]:
        """Calculate entry, stop loss, and take profit levels"""
        
        # Default values
        entry = current_price
        sl = current_price * 0.98 if direction == 'LONG' else current_price * 1.02
        tp = current_price * 1.04 if direction == 'LONG' else current_price * 0.96
        
        if direction == 'LONG':
            # Find nearest sell-side liquidity for TP
            sell_side = [z for z in liquidity_zones 
                        if z.type.value == 'SELL_SIDE' and z.price_level < current_price]
            if sell_side:
                tp = max(sell_side, key=lambda z: z.price_level).price_level
            
            # Find order block for entry refinement
            bullish_obs = [ob for ob in order_blocks 
                          if ob.type == OrderBlockType.BULLISH and not ob.mitigated]
            if bullish_obs:
                nearest_ob = min(bullish_obs, 
                               key=lambda ob: abs(ob.high_price - current_price))
                entry = nearest_ob.high_price
                sl = nearest_ob.low_price * 0.999  # Slight buffer
        
        else:  # SHORT
            buy_side = [z for z in liquidity_zones 
                       if z.type.value == 'BUY_SIDE' and z.price_level > current_price]
            if buy_side:
                tp = min(buy_side, key=lambda z: z.price_level).price_level
            
            bearish_obs = [ob for ob in order_blocks 
                          if ob.type == OrderBlockType.BEARISH and not ob.mitigated]
            if bearish_obs:
                nearest_ob = min(bearish_obs,
                               key=lambda ob: abs(ob.low_price - current_price))
                entry = nearest_ob.low_price
                sl = nearest_ob.high_price * 1.001
        
        # Calculate risk/reward
        risk = abs(entry - sl)
        reward = abs(tp - entry)
        rr = reward / risk if risk > 0 else 0
        
        return entry, sl, tp, rr
    
    def get_confluence_breakdown(self, confluence: ConfluenceScore) -> List[str]:
        """Get human-readable confluence breakdown"""
        breakdown = []
        
        if confluence.liquidity_sweep:
            breakdown.append(f"✓ Liquidity Sweep (+{confluence.liquidity_score})")
        if confluence.bos:
            breakdown.append(f"✓ Break of Structure (+{confluence.bos_score})")
        if confluence.orderblock_touch:
            breakdown.append(f"✓ Order Block Touch (+{confluence.ob_score})")
        if confluence.fvg_present:
            breakdown.append(f"✓ Fair Value Gap (+{confluence.fvg_score})")
        if confluence.volume_spike:
            breakdown.append(f"✓ Volume Spike (+{confluence.volume_score})")
        
        return breakdown
