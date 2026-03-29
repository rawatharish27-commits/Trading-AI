"""
Strategy Engine - Setup Builder
Combines all SMC signals into trade setups

Mathematical Logic:
- Combine signals from SMC engine
- Score-based filtering
- Multi-timeframe alignment check
- Regime-based strategy selection

Author: Trading AI Agent
"""

from dataclasses import dataclass
from typing import List, Optional, Dict, Any
from datetime import datetime
import numpy as np

from app.smc import (
    Candle, Swing, StructurePoint, LiquidityZone, OrderBlock,
    FairValueGap, ConfluenceEngine, ConfluenceScore, TradeSetup,
    RegimeDetector, MarketRegime
)


@dataclass
class MultiTFAnalysis:
    """Multi-Timeframe Analysis Result"""
    htf_bias: str  # Higher Timeframe Bias
    mtf_structure: str  # Mid Timeframe Structure
    ltf_entry: str  # Lower Timeframe Entry Signal
    alignment: bool  # All timeframes aligned


class SetupBuilder:
    """
    Setup Builder - Combines all signals into trade setups
    
    Mathematical Logic:
    1. Get HTF (Daily/4H) trend direction
    2. Get MTF (1H) structure (BOS/CHoCH)
    3. Get LTF (5M) entry signal
    4. Check alignment
    5. Calculate confluence score
    """
    
    def __init__(self, min_confluence_score: int = 70):
        self.confluence_engine = ConfluenceEngine(min_total_score=min_confluence_score)
        self.regime_detector = RegimeDetector()
    
    def build_setup(self,
                   symbol: str,
                   timeframe: str,
                   candles: List[Candle],
                   swings: List[Swing],
                   structures: List[StructurePoint],
                   liquidity_zones: List[LiquidityZone],
                   order_blocks: List[OrderBlock],
                   fvgs: List[FairValueGap],
                   htf_bias: str = "NEUTRAL") -> Optional[TradeSetup]:
        """
        Build trade setup from SMC analysis
        
        Steps:
        1. Determine market regime
        2. Get trend direction
        3. Calculate confluence
        4. Generate setup if score >= threshold
        """
        # Detect regime
        regime_data = self.regime_detector.detect_regime(candles)
        
        # Skip if volatile
        if regime_data.regime == MarketRegime.VOLATILE:
            return None
        
        # Generate setup
        setup = self.confluence_engine.generate_trade_setup(
            symbol=symbol,
            timeframe=timeframe,
            candles=candles,
            structures=structures,
            liquidity_zones=liquidity_zones,
            order_blocks=order_blocks,
            fvgs=fvgs,
            regime=regime_data.regime.value,
            htf_bias=htf_bias
        )
        
        return setup
    
    def check_multi_timeframe_alignment(self,
                                        htf_candles: List[Candle],
                                        mtf_candles: List[Candle],
                                        ltf_candles: List[Candle]) -> MultiTFAnalysis:
        """
        Check Multi-Timeframe Alignment
        
        Mathematical Logic:
        - HTF Bias: EMA50 > EMA200 = BULLISH, else BEARISH
        - MTF Structure: Check for BOS in trend direction
        - LTF Entry: Check for liquidity sweep + OB touch
        """
        from app.smc.regime import RegimeDetector
        
        # HTF Bias
        htf_regime = RegimeDetector().detect_regime(htf_candles)
        htf_bias = htf_regime.trend_direction.value
        
        # MTF Structure
        from app.smc.swing import SwingDetector
        from app.smc.structure import StructureDetector
        
        mtf_swings = SwingDetector().detect_swings(mtf_candles)
        mtf_structures = StructureDetector().detect_basic_structure(mtf_swings)
        mtf_trend = StructureDetector().get_trend_direction(mtf_structures)
        
        # LTF Entry Signal
        ltf_regime = RegimeDetector().detect_regime(ltf_candles)
        ltf_detector = SwingDetector()
        ltf_swings = ltf_detector.detect_swings(ltf_candles)
        
        from app.smc.liquidity import LiquidityDetector
        ltf_liq = LiquidityDetector().detect_all_liquidity(ltf_swings, ltf_candles)
        ltf_sweep = LiquidityDetector().detect_liquidity_sweep(ltf_candles, ltf_liq)
        
        ltf_entry = "SIGNAL" if ltf_sweep.swept else "NO_SIGNAL"
        
        # Check alignment
        alignment = (
            htf_bias == mtf_trend.value and
            (ltf_entry == "SIGNAL" or htf_bias != "NEUTRAL")
        )
        
        return MultiTFAnalysis(
            htf_bias=htf_bias,
            mtf_structure=mtf_trend.value,
            ltf_entry=ltf_entry,
            alignment=alignment
        )
    
    def get_strategy_for_regime(self, regime: MarketRegime) -> str:
        """
        Get recommended strategy based on market regime
        
        Rules:
        - TRENDING: Follow BOS, trade pullbacks
        - RANGING: Trade liquidity sweeps at extremes
        - VOLATILE: Avoid trading
        """
        if regime == MarketRegime.TRENDING:
            return "BOS_FOLLOW"
        elif regime == MarketRegime.RANGING:
            return "LIQUIDITY_SWEEP"
        else:
            return "AVOID"
    
    def filter_setup_by_probability(self,
                                   setup: TradeSetup,
                                   probability_table: Dict[str, float]) -> bool:
        """
        Filter setup based on historical probability
        
        Mathematical Logic:
        if setup_probability >= min_probability:
            return True
        """
        setup_type = self._classify_setup_type(setup)
        
        win_rate = probability_table.get(setup_type, 50)
        
        # Minimum 55% win rate required
        return win_rate >= 55
    
    def _classify_setup_type(self, setup: TradeSetup) -> str:
        """Classify setup type for probability lookup"""
        if setup.confluence.liquidity_sweep and setup.confluence.orderblock_touch:
            return "LIQUIDITY_SWEEP_OB"
        elif setup.confluence.bos and setup.confluence.orderblock_touch:
            return "BOS_OB_RETEST"
        elif setup.confluence.bos:
            return "BOS_FOLLOW"
        elif setup.confluence.fvg_present:
            return "FVG_FILL"
        else:
            return "CONFLUENCE"
