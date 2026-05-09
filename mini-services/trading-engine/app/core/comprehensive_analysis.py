"""
Comprehensive Daily Analysis Engine
Full SMC Analysis with all features

Features:
- Market Calendar Integration
- Full SMC Analysis (Swings, Structure, Liquidity, Order Blocks, FVG)
- Confluence Scoring
- Signal Generation
- Decision Agent Integration
- Risk Assessment
- Database Storage

Timeframes: Daily (Bias) + Hourly (Setup)

Author: Trading AI Agent
"""

from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any, Tuple
from datetime import datetime, date, timedelta
import asyncio
import json

from app.core.logger import logger
from app.core.market_calendar import get_market_calendar, NSEMarketCalendar


@dataclass
class TimeframeAnalysisResult:
    """Complete analysis result for a timeframe"""
    timeframe: str
    symbol: str
    
    # Trend & Regime
    trend: str  # BULLISH, BEARISH, NEUTRAL
    trend_strength: float  # 0-100
    regime: str  # TRENDING, RANGING, VOLATILE
    
    # Structure
    swings: List[Dict] = field(default_factory=list)
    swing_highs_count: int = 0
    swing_lows_count: int = 0
    last_swing_high: Optional[float] = None
    last_swing_low: Optional[float] = None
    
    # BOS & CHoCH
    bos_points: List[Dict] = field(default_factory=list)
    choch_points: List[Dict] = field(default_factory=list)
    
    # Liquidity
    liquidity_zones: List[Dict] = field(default_factory=list)
    buy_side_liquidity: List[float] = field(default_factory=list)
    sell_side_liquidity: List[float] = field(default_factory=list)
    liquidity_swept: bool = False
    
    # Order Blocks
    order_blocks: List[Dict] = field(default_factory=list)
    active_bullish_obs: int = 0
    active_bearish_obs: int = 0
    
    # FVGs
    fvgs: List[Dict] = field(default_factory=list)
    active_bullish_fvgs: int = 0
    active_bearish_fvgs: int = 0
    
    # Key Levels
    resistance_levels: List[float] = field(default_factory=list)
    support_levels: List[float] = field(default_factory=list)
    
    # Metadata
    candle_count: int = 0
    analysis_time: str = ""
    
    def to_dict(self) -> Dict:
        return {
            "timeframe": self.timeframe,
            "symbol": self.symbol,
            "trend": self.trend,
            "trend_strength": self.trend_strength,
            "regime": self.regime,
            "swings": {"total": len(self.swings), "highs": self.swing_highs_count, "lows": self.swing_lows_count},
            "structure": {"bos": len(self.bos_points), "choch": len(self.choch_points)},
            "liquidity": {"zones": len(self.liquidity_zones), "swept": self.liquidity_swept},
            "order_blocks": {"total": len(self.order_blocks), "active_bullish": self.active_bullish_obs, "active_bearish": self.active_bearish_obs},
            "fvgs": {"total": len(self.fvgs), "active_bullish": self.active_bullish_fvgs, "active_bearish": self.active_bearish_fvgs},
            "key_levels": {"resistance": self.resistance_levels[:5], "support": self.support_levels[:5]},
            "candle_count": self.candle_count,
            "analysis_time": self.analysis_time
        }


@dataclass
class SignalResult:
    """Generated trading signal"""
    symbol: str
    direction: str  # LONG, SHORT, NONE
    confluence_score: int  # 0-100
    
    # Confluence Breakdown
    liquidity_sweep: bool = False
    bos_present: bool = False
    ob_touch: bool = False
    fvg_present: bool = False
    volume_spike: bool = False
    
    # Trade Levels
    entry_price: float = 0.0
    stop_loss: float = 0.0
    take_profit: float = 0.0
    risk_reward: float = 0.0
    
    # Decision
    decision: str = "REJECT"  # APPROVE, REJECT
    decision_confidence: float = 0.0
    decision_reasoning: str = ""
    risk_factors: List[str] = field(default_factory=list)
    
    # Metadata
    daily_bias: str = "NEUTRAL"
    hourly_trend: str = "NEUTRAL"
    alignment: bool = False
    signal_time: str = ""
    
    def to_dict(self) -> Dict:
        return {
            "symbol": self.symbol,
            "direction": self.direction,
            "confluence_score": self.confluence_score,
            "confluence_breakdown": {
                "liquidity_sweep": self.liquidity_sweep,
                "bos_present": self.bos_present,
                "ob_touch": self.ob_touch,
                "fvg_present": self.fvg_present,
                "volume_spike": self.volume_spike
            },
            "levels": {
                "entry": self.entry_price,
                "stop_loss": self.stop_loss,
                "take_profit": self.take_profit,
                "risk_reward": self.risk_reward
            },
            "decision": {
                "status": self.decision,
                "confidence": self.decision_confidence,
                "reasoning": self.decision_reasoning,
                "risk_factors": self.risk_factors
            },
            "alignment": {
                "daily_bias": self.daily_bias,
                "hourly_trend": self.hourly_trend,
                "aligned": self.alignment
            },
            "signal_time": self.signal_time
        }


class ComprehensiveAnalysisEngine:
    """
    Comprehensive Daily Analysis Engine
    
    Full SMC analysis on historical data with:
    1. Daily timeframe for market bias
    2. Hourly timeframe for entry setup
    3. Confluence scoring
    4. Signal generation
    5. Decision agent validation
    """
    
    # Top symbols for analysis
    DEFAULT_SYMBOLS = [
        'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
        'HINDUNILVR', 'SBIN', 'BHARTIARTL', 'ITC', 'KOTAKBANK',
        'LT', 'AXISBANK', 'ASIANPAINT', 'MARUTI', 'SUNPHARMA',
        'TITAN', 'BAJFINANCE', 'DMART', 'WIPRO', 'HCLTECH'
    ]
    
    # Minimum requirements
    MIN_CONFLUENCE_SCORE = 70
    MIN_RISK_REWARD = 1.5
    MIN_TREND_STRENGTH = 50
    
    def __init__(self):
        self.calendar = get_market_calendar()
        self._analysis_results: Dict[str, Dict] = {}
        self._signals: List[SignalResult] = []
    
    async def run_full_analysis(self, 
                                symbols: List[str] = None,
                                use_decision_agent: bool = True) -> Dict[str, Any]:
        """
        Run complete analysis for all symbols
        
        Steps:
        1. Check market calendar (is trading day?)
        2. Fetch data from database
        3. Analyze Daily (bias)
        4. Analyze Hourly (setup)
        5. Generate signals with confluence
        6. Run decision agent validation
        7. Store results in database
        
        Args:
            symbols: List of symbols to analyze
            use_decision_agent: Whether to use LLM decision agent
            
        Returns:
            Complete analysis results
        """
        start_time = datetime.now()
        
        symbols = symbols or self.DEFAULT_SYMBOLS
        
        logger.info(f"🔬 Starting comprehensive analysis for {len(symbols)} symbols...")
        
        # Check market calendar
        calendar_summary = self.calendar.get_calendar_summary()
        logger.info(f"📅 Market Calendar: Trading Day = {calendar_summary['is_trading_day']}")
        
        results = {
            "analysis_date": date.today().isoformat(),
            "market_calendar": calendar_summary,
            "symbols_analyzed": 0,
            "signals_generated": 0,
            "signals_approved": 0,
            "analysis_results": {},
            "signals": [],
            "execution_time_ms": 0
        }
        
        for symbol in symbols:
            try:
                # Run analysis for symbol
                daily_analysis, hourly_analysis = await self._analyze_symbol(symbol)
                
                if daily_analysis:
                    results["analysis_results"][symbol] = {
                        "daily": daily_analysis.to_dict(),
                        "hourly": hourly_analysis.to_dict() if hourly_analysis else None
                    }
                    results["symbols_analyzed"] += 1
                    
                    # Generate signal
                    signal = await self._generate_signal(symbol, daily_analysis, hourly_analysis)
                    
                    if signal and signal.direction != "NONE":
                        # Run decision agent if enabled
                        if use_decision_agent:
                            signal = await self._run_decision_agent(signal, daily_analysis, hourly_analysis)
                        
                        results["signals"].append(signal.to_dict())
                        results["signals_generated"] += 1
                        
                        if signal.decision == "APPROVE":
                            results["signals_approved"] += 1
                        
                        self._signals.append(signal)
                    
                    self._analysis_results[symbol] = {
                        "daily": daily_analysis,
                        "hourly": hourly_analysis,
                        "signal": signal
                    }
                
            except Exception as e:
                logger.error(f"Analysis error for {symbol}: {e}")
        
        execution_time = (datetime.now() - start_time).total_seconds() * 1000
        results["execution_time_ms"] = int(execution_time)
        
        logger.info(f"✅ Analysis complete: {results['symbols_analyzed']} symbols, "
                   f"{results['signals_generated']} signals, {results['signals_approved']} approved")
        
        return results
    
    async def _analyze_symbol(self, symbol: str) -> Tuple[Optional[TimeframeAnalysisResult], Optional[TimeframeAnalysisResult]]:
        """
        Analyze symbol on Daily and Hourly timeframes
        
        Returns:
            Tuple of (daily_analysis, hourly_analysis)
        """
        try:
            from app.database import get_db_session, SymbolCRUD, CandleCRUD
            from app.smc import (
                Candle, SwingDetector, StructureDetector, LiquidityDetector,
                OrderBlockDetector, FVGDetector, RegimeDetector
            )
            
            db = get_db_session()
            symbol_obj = SymbolCRUD.get_or_create(db, symbol)
            
            # Get Daily candles (500 = ~2 years)
            daily_db = CandleCRUD.get_latest(db, symbol_obj.id, '1d', 500)
            
            # Get Hourly candles (200 = ~2 weeks)
            hourly_db = CandleCRUD.get_latest(db, symbol_obj.id, '1h', 200)
            
            db.close()
            
            if len(daily_db) < 50:
                logger.warning(f"Insufficient daily data for {symbol}: {len(daily_db)} candles")
                return None, None
            
            # Convert to Candle objects
            daily_candles = self._convert_candles(daily_db, symbol, '1d')
            hourly_candles = self._convert_candles(hourly_db, symbol, '1h') if hourly_db else []
            
            # Analyze Daily
            daily_analysis = self._analyze_timeframe(daily_candles, symbol, '1d')
            
            # Analyze Hourly
            hourly_analysis = self._analyze_timeframe(hourly_candles, symbol, '1h') if hourly_candles else None
            
            return daily_analysis, hourly_analysis
            
        except Exception as e:
            logger.error(f"Symbol analysis error for {symbol}: {e}")
            return None, None
    
    def _convert_candles(self, db_candles, symbol: str, timeframe: str) -> List[Candle]:
        """Convert database candles to SMC Candle objects"""
        from app.smc import Candle
        
        return [
            Candle(
                timestamp=c.timestamp,
                open=c.open,
                high=c.high,
                low=c.low,
                close=c.close,
                volume=c.volume,
                symbol=symbol,
                timeframe=timeframe
            ) for c in reversed(db_candles)
        ]
    
    def _analyze_timeframe(self, candles: List, symbol: str, timeframe: str) -> TimeframeAnalysisResult:
        """
        Full SMC analysis on a timeframe
        
        Includes:
        - Swing Detection
        - Structure Analysis (BOS, CHoCH)
        - Liquidity Detection
        - Order Block Detection
        - FVG Detection
        - Regime Detection
        """
        from app.smc import (
            SwingDetector, StructureDetector, LiquidityDetector,
            OrderBlockDetector, FVGDetector, RegimeDetector
        )
        
        result = TimeframeAnalysisResult(
            timeframe=timeframe,
            symbol=symbol,
            analysis_time=datetime.now().isoformat(),
            candle_count=len(candles)
        )
        
        # 1. Swing Detection
        swing_detector = SwingDetector(strength=3)
        swings = swing_detector.detect_swings(candles)
        
        result.swings = [{"type": s.type, "price": s.price, "timestamp": s.timestamp.isoformat()} for s in swings]
        result.swing_highs_count = len([s for s in swings if s.type == 'HIGH'])
        result.swing_lows_count = len([s for s in swings if s.type == 'LOW'])
        
        swing_highs = [s for s in swings if s.type == 'HIGH']
        swing_lows = [s for s in swings if s.type == 'LOW']
        result.last_swing_high = swing_highs[-1].price if swing_highs else None
        result.last_swing_low = swing_lows[-1].price if swing_lows else None
        
        # 2. Structure Detection
        structure_detector = StructureDetector()
        structures = structure_detector.detect_basic_structure(swings)
        bos_points = structure_detector.detect_bos(candles, swings)
        choch_points = structure_detector.detect_choch(candles, swings)
        trend = structure_detector.get_trend_direction(structures)
        
        result.bos_points = [{"direction": b.direction.value if hasattr(b.direction, 'value') else str(b.direction), 
                              "price": b.price} for b in bos_points[-5:]]
        result.choch_points = [{"direction": c.direction.value if hasattr(c.direction, 'value') else str(c.direction),
                                 "price": c.price} for c in choch_points[-5:]]
        result.trend = trend.value if hasattr(trend, 'value') else str(trend)
        
        # 3. Liquidity Detection
        liq_detector = LiquidityDetector()
        liquidity_zones = liq_detector.detect_all_liquidity(swings, candles)
        
        result.liquidity_zones = [{"type": z.type.value, "price": z.price_level, "swept": z.swept} for z in liquidity_zones[-10:]]
        result.buy_side_liquidity = [z.price_level for z in liquidity_zones if z.type.value == 'BUY_SIDE'][-5:]
        result.sell_side_liquidity = [z.price_level for z in liquidity_zones if z.type.value == 'SELL_SIDE'][-5:]
        
        # Check for liquidity sweep
        sweep = liq_detector.detect_liquidity_sweep(candles, liquidity_zones)
        result.liquidity_swept = sweep.swept
        
        # 4. Order Block Detection
        ob_detector = OrderBlockDetector()
        order_blocks = ob_detector.detect_all_order_blocks(candles)
        
        result.order_blocks = [{
            "type": ob.type.value,
            "high": ob.high_price,
            "low": ob.low_price,
            "mitigated": ob.mitigated,
            "retested": ob.retested,
            "strength": ob.strength
        } for ob in order_blocks[-10:]]
        
        result.active_bullish_obs = len([ob for ob in order_blocks if ob.type.value == 'BULLISH' and not ob.mitigated])
        result.active_bearish_obs = len([ob for ob in order_blocks if ob.type.value == 'BEARISH' and not ob.mitigated])
        
        # 5. FVG Detection
        fvg_detector = FVGDetector()
        fvgs = fvg_detector.detect_all_fvgs(candles)
        
        result.fvgs = [{
            "type": f.type.value,
            "top": f.gap_top,
            "bottom": f.gap_bottom,
            "filled": f.filled
        } for f in fvgs[-10:]]
        
        result.active_bullish_fvgs = len([f for f in fvgs if f.type.value == 'BULLISH' and not f.filled])
        result.active_bearish_fvgs = len([f for f in fvgs if f.type.value == 'BEARISH' and not f.filled])
        
        # 6. Regime Detection
        regime_detector = RegimeDetector()
        regime_data = regime_detector.detect_regime(candles)
        
        result.regime = regime_data.regime.value
        result.trend_strength = regime_data.trend_strength
        
        # 7. Key Levels
        result.resistance_levels = sorted([s.price for s in swing_highs[-5:]], reverse=True)
        result.support_levels = sorted([s.price for s in swing_lows[-5:]])
        
        return result
    
    async def _generate_signal(self, 
                               symbol: str,
                               daily: TimeframeAnalysisResult,
                               hourly: Optional[TimeframeAnalysisResult]) -> Optional[SignalResult]:
        """
        Generate trading signal based on confluence
        
        Scoring:
        - Liquidity Sweep: 30 points
        - BOS Present: 25 points
        - Order Block Touch: 25 points
        - FVG Present: 10 points
        - Volume Spike: 10 points
        """
        if not hourly or daily.trend == 'NEUTRAL':
            return SignalResult(symbol=symbol, direction="NONE", signal_time=datetime.now().isoformat())
        
        signal = SignalResult(
            symbol=symbol,
            direction="LONG" if daily.trend == "BULLISH" else "SHORT",
            daily_bias=daily.trend,
            hourly_trend=hourly.trend,
            alignment=(daily.trend == hourly.trend),
            signal_time=datetime.now().isoformat()
        )
        
        # Check alignment
        if not signal.alignment:
            signal.direction = "NONE"
            signal.decision_reasoning = "Daily and Hourly trends not aligned"
            return signal
        
        # Calculate confluence score
        confluence_score = 0
        
        # 1. Liquidity Sweep (30 points)
        if hourly.liquidity_swept:
            signal.liquidity_sweep = True
            confluence_score += 30
        
        # 2. BOS Present (25 points)
        if len(hourly.bos_points) > 0:
            signal.bos_present = True
            confluence_score += 25
        
        # 3. Order Block Touch (25 points)
        active_obs = hourly.active_bullish_obs if signal.direction == "LONG" else hourly.active_bearish_obs
        if active_obs > 0:
            signal.ob_touch = True
            confluence_score += 25
        
        # 4. FVG Present (10 points)
        active_fvgs = hourly.active_bullish_fvgs if signal.direction == "LONG" else hourly.active_bearish_fvgs
        if active_fvgs > 0:
            signal.fvg_present = True
            confluence_score += 10
        
        # 5. Volume Spike (10 points) - simplified
        signal.volume_spike = True  # Placeholder
        confluence_score += 10
        
        signal.confluence_score = confluence_score
        
        # Calculate trade levels
        current_price = hourly.last_swing_high or hourly.last_swing_low or 0
        
        if signal.direction == "LONG":
            signal.entry_price = hourly.support_levels[0] if hourly.support_levels else current_price * 0.99
            signal.stop_loss = hourly.last_swing_low or signal.entry_price * 0.97
            signal.take_profit = hourly.resistance_levels[0] if hourly.resistance_levels else signal.entry_price * 1.04
        else:
            signal.entry_price = hourly.resistance_levels[0] if hourly.resistance_levels else current_price * 1.01
            signal.stop_loss = hourly.last_swing_high or signal.entry_price * 1.03
            signal.take_profit = hourly.support_levels[0] if hourly.support_levels else signal.entry_price * 0.96
        
        # Calculate R:R
        risk = abs(signal.entry_price - signal.stop_loss)
        reward = abs(signal.take_profit - signal.entry_price)
        signal.risk_reward = round(reward / risk, 2) if risk > 0 else 0
        
        # Quick decision based on rules
        if (confluence_score >= self.MIN_CONFLUENCE_SCORE and 
            signal.risk_reward >= self.MIN_RISK_REWARD and
            daily.trend_strength >= self.MIN_TREND_STRENGTH):
            signal.decision = "APPROVE"
            signal.decision_confidence = min(confluence_score, 95)
            signal.decision_reasoning = f"Strong confluence ({confluence_score}) with R:R {signal.risk_reward}"
        else:
            signal.decision = "REJECT"
            reasons = []
            if confluence_score < self.MIN_CONFLUENCE_SCORE:
                reasons.append(f"Low confluence ({confluence_score})")
            if signal.risk_reward < self.MIN_RISK_REWARD:
                reasons.append(f"Poor R:R ({signal.risk_reward})")
            if daily.trend_strength < self.MIN_TREND_STRENGTH:
                reasons.append(f"Weak trend ({daily.trend_strength}%)")
            signal.risk_factors = reasons
            signal.decision_reasoning = ", ".join(reasons)
        
        return signal
    
    async def _run_decision_agent(self,
                                   signal: SignalResult,
                                   daily: TimeframeAnalysisResult,
                                   hourly: TimeframeAnalysisResult) -> SignalResult:
        """Run decision agent for additional validation"""
        try:
            from app.agents.decision_agent import DecisionAgent, DecisionInput
            
            agent = DecisionAgent()
            
            setup = {
                "direction": signal.direction,
                "confluence_score": signal.confluence_score,
                "risk_reward": signal.risk_reward,
                "liquidity_sweep": signal.liquidity_sweep,
                "bos": signal.bos_present,
                "orderblock_touch": signal.ob_touch,
                "fvg": signal.fvg_present,
                "volume_spike": signal.volume_spike
            }
            
            context = {
                "symbol": signal.symbol,
                "htf_bias": signal.daily_bias,
                "regime": daily.regime,
                "recent_bos": len(daily.bos_points) > 0,
                "liquidity_swept": daily.liquidity_swept
            }
            
            decision_input = DecisionInput(setup=setup, market_context=context)
            decision_output = await agent.make_decision(decision_input)
            
            signal.decision = decision_output.decision
            signal.decision_confidence = decision_output.confidence
            signal.decision_reasoning = decision_output.reasoning
            signal.risk_factors = decision_output.risk_factors
            
            return signal
            
        except Exception as e:
            logger.error(f"Decision agent error: {e}")
            # Keep original decision
            return signal
    
    def get_signals(self, approved_only: bool = False) -> List[SignalResult]:
        """Get generated signals"""
        if approved_only:
            return [s for s in self._signals if s.decision == "APPROVE"]
        return self._signals
    
    def get_best_signal(self) -> Optional[SignalResult]:
        """Get highest confidence approved signal"""
        approved = self.get_signals(approved_only=True)
        if not approved:
            return None
        return max(approved, key=lambda s: s.confluence_score)
    
    def get_analysis_summary(self) -> Dict:
        """Get analysis summary"""
        return {
            "symbols_analyzed": len(self._analysis_results),
            "signals_generated": len(self._signals),
            "signals_approved": len(self.get_signals(approved_only=True)),
            "best_signal": self.get_best_signal().to_dict() if self.get_best_signal() else None,
            "bullish_bias_count": len([r for r in self._analysis_results.values() 
                                      if r.get('daily') and r['daily'].trend == 'BULLISH']),
            "bearish_bias_count": len([r for r in self._analysis_results.values() 
                                      if r.get('daily') and r['daily'].trend == 'BEARISH']),
        }


# Singleton
_engine_instance: Optional[ComprehensiveAnalysisEngine] = None


def get_analysis_engine() -> ComprehensiveAnalysisEngine:
    """Get analysis engine singleton"""
    global _engine_instance
    if _engine_instance is None:
        _engine_instance = ComprehensiveAnalysisEngine()
    return _engine_instance
