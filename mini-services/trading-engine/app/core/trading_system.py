"""
Complete Trading System with Learning
Signal Generation, Tracking, and Strategy Improvement

Features:
- Nifty 500 stocks from Yahoo Finance (FREE)
- 3-5 day holding signals
- Signal outcome tracking
- Learning from losses
- Watchlist generation (80%+ success stocks)
- Complete dashboard data

Author: Trading AI Agent
"""

from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any
from datetime import datetime, date, timedelta
import asyncio

from app.core.logger import logger
from app.core.market_calendar import get_market_calendar
from app.core.signal_learning import (
    SignalTracker, LearningEngine, PerformanceTracker,
    TradeSignal, StrategyLesson, StockPerformance,
    SignalStatus, LearningCategory,
    get_signal_tracker, get_learning_engine, get_performance_tracker
)
from app.data.nifty500_symbols import NIFTY_500_LIST, TOP_100_SYMBOLS


class TradingSystem:
    """
    Complete Trading System
    
    Workflow:
    1. Fetch data from Yahoo Finance (FREE)
    2. Analyze with SMC
    3. Generate signals (3-5 day holding)
    4. Track outcomes after 5 days
    5. Learn from losses
    6. Improve strategy
    7. Generate watchlist
    """
    
    # Signal parameters
    HOLDING_DAYS = 5
    MIN_CONFLUENCE = 70
    MIN_RISK_REWARD = 1.5
    
    def __init__(self):
        self.calendar = get_market_calendar()
        self.signal_tracker = get_signal_tracker()
        self.learning_engine = get_learning_engine()
        self.performance_tracker = get_performance_tracker()
        
        self._last_analysis_time = None
        self._last_data_fetch_time = None
    
    async def fetch_and_store_data(self, symbols: List[str] = None) -> Dict:
        """
        Fetch data from Yahoo Finance and store in database
        
        This runs ONCE daily after market close
        NO Angel One API - Only FREE Yahoo Finance
        """
        from app.data.free_data_fetcher import get_data_fetcher
        
        symbols = symbols or TOP_100_SYMBOLS[:50]  # Top 50 for efficiency
        
        logger.info(f"📊 Fetching data for {len(symbols)} symbols from Yahoo Finance...")
        
        fetcher = get_data_fetcher()
        
        # Fetch daily data (2 years)
        daily_data = await fetcher.fetch_batch_historical(
            symbols=symbols,
            interval='1d',
            days=730
        )
        
        # Fetch hourly data (60 days)
        hourly_data = await fetcher.fetch_batch_historical(
            symbols=symbols,
            interval='1h',
            days=60
        )
        
        # Store in database
        stored_count = await self._store_candles(daily_data, hourly_data)
        
        self._last_data_fetch_time = datetime.now()
        
        logger.info(f"✅ Data fetch complete: {stored_count} candles stored")
        
        return {
            "status": "completed",
            "symbols": len(symbols),
            "daily_symbols": len(daily_data),
            "hourly_symbols": len(hourly_data),
            "candles_stored": stored_count,
            "timestamp": self._last_data_fetch_time.isoformat()
        }
    
    async def _store_candles(self, daily_data: Dict, hourly_data: Dict) -> int:
        """Store candles in database"""
        from app.database import get_db_session, SymbolCRUD, CandleCRUD, Candle as DBCandle
        
        total_stored = 0
        
        # Store daily candles
        for symbol, candles in daily_data.items():
            try:
                db = get_db_session()
                symbol_obj = SymbolCRUD.get_or_create(db, symbol)
                
                for candle in candles:
                    existing = db.query(DBCandle).filter(
                        DBCandle.symbol_id == symbol_obj.id,
                        DBCandle.timeframe == '1d',
                        DBCandle.timestamp == candle.timestamp
                    ).first()
                    
                    if not existing:
                        db_candle = DBCandle(
                            symbol_id=symbol_obj.id,
                            timeframe='1d',
                            timestamp=candle.timestamp,
                            open=candle.open,
                            high=candle.high,
                            low=candle.low,
                            close=candle.close,
                            volume=candle.volume
                        )
                        db.add(db_candle)
                        total_stored += 1
                
                db.commit()
                db.close()
            except Exception as e:
                logger.error(f"Error storing daily candles for {symbol}: {e}")
        
        # Store hourly candles
        for symbol, candles in hourly_data.items():
            try:
                db = get_db_session()
                symbol_obj = SymbolCRUD.get_or_create(db, symbol)
                
                for candle in candles:
                    existing = db.query(DBCandle).filter(
                        DBCandle.symbol_id == symbol_obj.id,
                        DBCandle.timeframe == '1h',
                        DBCandle.timestamp == candle.timestamp
                    ).first()
                    
                    if not existing:
                        db_candle = DBCandle(
                            symbol_id=symbol_obj.id,
                            timeframe='1h',
                            timestamp=candle.timestamp,
                            open=candle.open,
                            high=candle.high,
                            low=candle.low,
                            close=candle.close,
                            volume=candle.volume
                        )
                        db.add(db_candle)
                        total_stored += 1
                
                db.commit()
                db.close()
            except Exception as e:
                logger.error(f"Error storing hourly candles for {symbol}: {e}")
        
        return total_stored
    
    async def run_analysis_and_generate_signals(self, symbols: List[str] = None) -> Dict:
        """
        Run SMC analysis and generate signals
        
        This runs ONCE daily at market open
        Uses DATABASE data (already fetched)
        """
        symbols = symbols or TOP_100_SYMBOLS[:30]  # Top 30 for analysis
        
        logger.info(f"🔬 Running analysis for {len(symbols)} symbols...")
        
        results = {
            "analysis_date": date.today().isoformat(),
            "is_trading_day": self.calendar.is_trading_day(),
            "symbols_analyzed": 0,
            "signals_generated": 0,
            "signals_approved": 0,
            "signals": [],
            "execution_time_ms": 0
        }
        
        start_time = datetime.now()
        
        for symbol in symbols:
            try:
                signal = await self._analyze_and_generate_signal(symbol)
                
                if signal:
                    results["symbols_analyzed"] += 1
                    results["signals_generated"] += 1
                    
                    if signal.confluence_score >= self.MIN_CONFLUENCE:
                        results["signals_approved"] += 1
                        results["signals"].append(signal.to_dict())
            
            except Exception as e:
                logger.error(f"Analysis error for {symbol}: {e}")
        
        execution_time = (datetime.now() - start_time).total_seconds() * 1000
        results["execution_time_ms"] = int(execution_time)
        
        self._last_analysis_time = datetime.now()
        
        logger.info(f"✅ Analysis complete: {results['signals_generated']} signals, {results['signals_approved']} approved")
        
        return results
    
    async def _analyze_and_generate_signal(self, symbol: str) -> Optional[TradeSignal]:
        """Analyze symbol and generate signal if conditions met"""
        from app.database import get_db_session, SymbolCRUD, CandleCRUD
        from app.smc import (
            Candle, SwingDetector, StructureDetector, LiquidityDetector,
            OrderBlockDetector, FVGDetector, RegimeDetector
        )
        
        db = get_db_session()
        symbol_obj = SymbolCRUD.get_or_create(db, symbol)
        
        # Get candles from database
        daily_db = CandleCRUD.get_latest(db, symbol_obj.id, '1d', 500)
        hourly_db = CandleCRUD.get_latest(db, symbol_obj.id, '1h', 200)
        
        db.close()
        
        if len(daily_db) < 50 or len(hourly_db) < 30:
            return None
        
        # Convert to Candle objects
        daily_candles = [
            Candle(
                timestamp=c.timestamp, open=c.open, high=c.high,
                low=c.low, close=c.close, volume=c.volume,
                symbol=symbol, timeframe='1d'
            ) for c in reversed(daily_db)
        ]
        
        hourly_candles = [
            Candle(
                timestamp=c.timestamp, open=c.open, high=c.high,
                low=c.low, close=c.close, volume=c.volume,
                symbol=symbol, timeframe='1h'
            ) for c in reversed(hourly_db)
        ]
        
        # Analyze Daily (Bias)
        daily_bias, daily_strength = self._analyze_daily_bias(daily_candles)
        
        if daily_bias == "NEUTRAL":
            return None
        
        # Analyze Hourly (Setup)
        hourly_trend, confluence = self._analyze_hourly_setup(hourly_candles, daily_bias)
        
        if confluence["total_score"] < self.MIN_CONFLUENCE:
            return None
        
        # Generate signal
        direction = "LONG" if daily_bias == "BULLISH" else "SHORT"
        current_price = hourly_candles[-1].close
        
        # Calculate levels
        entry, sl, tp, rr = self._calculate_levels(
            current_price, direction, hourly_candles, confluence
        )
        
        if rr < self.MIN_RISK_REWARD:
            return None
        
        # Create signal
        signal = self.signal_tracker.create_signal(
            symbol=symbol,
            direction=direction,
            entry_price=entry,
            stop_loss=sl,
            take_profit=tp,
            confluence_score=confluence["total_score"],
            daily_bias=daily_bias,
            hourly_trend=hourly_trend,
            confluence_breakdown=confluence,
            holding_days=self.HOLDING_DAYS
        )
        
        return signal
    
    def _analyze_daily_bias(self, candles: List) -> tuple:
        """Analyze daily timeframe for market bias"""
        from app.smc import SwingDetector, StructureDetector, RegimeDetector
        
        swing_detector = SwingDetector(strength=3)
        swings = swing_detector.detect_swings(candles)
        
        structure_detector = StructureDetector()
        structures = structure_detector.detect_basic_structure(swings)
        trend = structure_detector.get_trend_direction(structures)
        
        regime_detector = RegimeDetector()
        regime_data = regime_detector.detect_regime(candles)
        
        bias = trend.value if hasattr(trend, 'value') else str(trend)
        strength = regime_data.trend_strength
        
        return bias, strength
    
    def _analyze_hourly_setup(self, candles: List, daily_bias: str) -> tuple:
        """Analyze hourly timeframe for entry setup"""
        from app.smc import (
            SwingDetector, StructureDetector, LiquidityDetector,
            OrderBlockDetector, FVGDetector
        )
        
        # Detect swings
        swing_detector = SwingDetector(strength=3)
        swings = swing_detector.detect_swings(candles)
        
        # Structure
        structure_detector = StructureDetector()
        structures = structure_detector.detect_basic_structure(swings)
        trend = structure_detector.get_trend_direction(structures)
        hourly_trend = trend.value if hasattr(trend, 'value') else str(trend)
        
        # Confluence scoring
        confluence = {
            "liquidity_sweep": False,
            "bos": False,
            "ob_touch": False,
            "fvg_present": False,
            "volume_spike": False,
            "total_score": 0
        }
        
        # Check liquidity
        liq_detector = LiquidityDetector()
        liquidity_zones = liq_detector.detect_all_liquidity(swings, candles)
        sweep = liq_detector.detect_liquidity_sweep(candles, liquidity_zones)
        if sweep.swept:
            confluence["liquidity_sweep"] = True
            confluence["total_score"] += 30
        
        # Check BOS
        bos_points = structure_detector.detect_bos(candles, swings)
        if bos_points:
            confluence["bos"] = True
            confluence["total_score"] += 25
        
        # Check Order Blocks
        ob_detector = OrderBlockDetector()
        order_blocks = ob_detector.detect_all_order_blocks(candles)
        active_obs = [ob for ob in order_blocks if not ob.mitigated]
        if active_obs:
            confluence["ob_touch"] = True
            confluence["total_score"] += 25
        
        # Check FVG
        fvg_detector = FVGDetector()
        fvgs = fvg_detector.detect_all_fvgs(candles)
        active_fvgs = [f for f in fvgs if not f.filled]
        if active_fvgs:
            confluence["fvg_present"] = True
            confluence["total_score"] += 10
        
        # Volume spike (simplified)
        confluence["volume_spike"] = True
        confluence["total_score"] += 10
        
        return hourly_trend, confluence
    
    def _calculate_levels(self, current_price: float, direction: str,
                         candles: List, confluence: Dict) -> tuple:
        """Calculate entry, stop loss, take profit"""
        from app.smc import SwingDetector
        
        swing_detector = SwingDetector(strength=3)
        swings = swing_detector.detect_swings(candles)
        
        swing_highs = [s.price for s in swings if s.type == 'HIGH']
        swing_lows = [s.price for s in swings if s.type == 'LOW']
        
        if direction == "LONG":
            entry = swing_lows[-1] if swing_lows else current_price * 0.99
            sl = min(swing_lows[-3:]) if len(swing_lows) >= 3 else entry * 0.97
            tp = swing_highs[0] if swing_highs else entry * 1.06
        else:
            entry = swing_highs[-1] if swing_highs else current_price * 1.01
            sl = max(swing_highs[-3:]) if len(swing_highs) >= 3 else entry * 1.03
            tp = swing_lows[0] if swing_lows else entry * 0.94
        
        risk = abs(entry - sl)
        reward = abs(tp - entry)
        rr = reward / risk if risk > 0 else 0
        
        return entry, sl, tp, rr
    
    async def update_signal_outcomes(self) -> Dict:
        """
        Update outcomes for signals that are due
        
        Called daily to check 5-day holding signals
        """
        pending_signals = self.signal_tracker.get_pending_signals()
        
        logger.info(f"📊 Updating outcomes for {len(pending_signals)} pending signals...")
        
        updated = 0
        for signal in pending_signals:
            try:
                # Get current price from database (latest close)
                from app.database import get_db_session, SymbolCRUD, CandleCRUD
                
                db = get_db_session()
                symbol_obj = SymbolCRUD.get_or_create(db, signal.symbol)
                latest = CandleCRUD.get_latest(db, symbol_obj.id, '1d', 1)
                db.close()
                
                if latest:
                    current_price = latest[0].close
                    
                    # Finalize signal
                    finalized = self.signal_tracker.finalize_signal(signal.id, current_price)
                    
                    if finalized:
                        updated += 1
                        
                        # Learn from failure
                        if finalized.status == SignalStatus.STOPPED:
                            self.learning_engine.analyze_failed_signal(finalized)
            
            except Exception as e:
                logger.error(f"Error updating signal {signal.id}: {e}")
        
        # Update performance tracker
        self.performance_tracker.update_from_signals(
            self.signal_tracker.get_all_signals()
        )
        
        return {
            "status": "completed",
            "signals_updated": updated,
            "timestamp": datetime.now().isoformat()
        }
    
    def get_dashboard_data(self) -> Dict:
        """Get complete dashboard data"""
        # Signal statistics
        signal_stats = self.signal_tracker.get_statistics()
        
        # Learning improvements
        strategy_improvements = self.learning_engine.get_strategy_improvements()
        
        # Performance tracker
        performance_stats = self.performance_tracker.get_statistics()
        
        # Watchlist (80%+ success)
        watchlist = self.performance_tracker.get_watchlist()
        
        # Recent signals
        recent_signals = self.signal_tracker.get_all_signals()[:20]
        
        # Recent lessons
        recent_lessons = self.learning_engine.get_all_lessons()[:10]
        
        return {
            "signal_statistics": signal_stats,
            "strategy_improvements": strategy_improvements,
            "performance_statistics": performance_stats,
            "watchlist": [w.to_dict() for w in watchlist[:10]],
            "recent_signals": [s.to_dict() for s in recent_signals],
            "recent_lessons": [l.to_dict() for l in recent_lessons],
            "last_analysis": self._last_analysis_time.isoformat() if self._last_analysis_time else None,
            "last_data_fetch": self._last_data_fetch_time.isoformat() if self._last_data_fetch_time else None
        }
    
    def get_signal_history(self, status: str = None, limit: int = 50) -> List[Dict]:
        """Get signal history"""
        filter_status = SignalStatus(status) if status else None
        signals = self.signal_tracker.get_all_signals(filter_status)
        return [s.to_dict() for s in signals[:limit]]
    
    def get_pnl_statement(self) -> Dict:
        """Get P&L statement"""
        signals = self.signal_tracker.get_all_signals()
        completed = [s for s in signals if s.status in [SignalStatus.SUCCESS, SignalStatus.STOPPED]]
        
        if not completed:
            return {"total_trades": 0, "message": "No completed trades yet"}
        
        pnl_list = [s.pnl_percent for s in completed]
        
        return {
            "total_trades": len(completed),
            "winning_trades": len([s for s in completed if s.pnl_percent > 0]),
            "losing_trades": len([s for s in completed if s.pnl_percent <= 0]),
            "win_rate": round(len([s for s in completed if s.pnl_percent > 0]) / len(completed) * 100, 2),
            "total_pnl_percent": round(sum(pnl_list), 2),
            "avg_pnl_percent": round(sum(pnl_list) / len(pnl_list), 2),
            "best_trade_percent": round(max(pnl_list), 2),
            "worst_trade_percent": round(min(pnl_list), 2),
            "avg_holding_days": round(sum(s.outcome_days for s in completed) / len(completed), 1),
            "trades": [s.to_dict() for s in completed[:30]]
        }
    
    def get_learning_history(self) -> Dict:
        """Get learning history and improvements"""
        lessons = self.learning_engine.get_all_lessons()
        
        by_category = {}
        for lesson in lessons:
            cat = lesson.category.value
            if cat not in by_category:
                by_category[cat] = []
            by_category[cat].append(lesson.to_dict())
        
        return {
            "total_lessons": len(lessons),
            "by_category": by_category,
            "strategy_improvements": self.learning_engine.get_strategy_improvements(),
            "recent_lessons": [l.to_dict() for l in lessons[:20]]
        }
    
    def get_watchlist(self, min_success: float = 80.0) -> List[Dict]:
        """Get watchlist of high-success stocks"""
        watchlist = self.performance_tracker.get_watchlist(min_success)
        return [w.to_dict() for w in watchlist]


# Singleton
_system_instance: Optional[TradingSystem] = None


def get_trading_system() -> TradingSystem:
    """Get trading system singleton"""
    global _system_instance
    if _system_instance is None:
        _system_instance = TradingSystem()
    return _system_instance
