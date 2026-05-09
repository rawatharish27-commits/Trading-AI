"""
Signal Tracking and Learning System
Track signals, outcomes, and learn from mistakes

Features:
- Signal generation with 3-5 day holding period
- Track outcomes after 5 days
- Learn from losing trades
- Strategy improvement
- Success rate tracking

Author: Trading AI Agent
"""

from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any
from datetime import datetime, date, timedelta
from enum import Enum
import json

from app.core.logger import logger


class SignalStatus(Enum):
    """Signal status"""
    PENDING = "PENDING"          # Just generated
    ACTIVE = "ACTIVE"            # Within holding period
    SUCCESS = "SUCCESS"          # Target hit
    STOPPED = "STOPPED"          # Stop loss hit
    EXPIRED = "EXPIRED"          # Holding period over
    CANCELLED = "CANCELLED"      # Cancelled before entry


class LearningCategory(Enum):
    """Categories for learning"""
    TIMING = "TIMING"            # Entry/exit timing issues
    STRUCTURE = "STRUCTURE"      # Market structure misread
    LIQUIDITY = "LIQUIDITY"      # Liquidity analysis error
    REGIME = "REGIME"            # Market regime mismatch
    CONFLUENCE = "CONFLUENCE"    # Low confluence score
    RISK = "RISK"               # Risk management issues
    NEWS = "NEWS"               # News/sentiment impact
    TECHNICAL = "TECHNICAL"      # Technical analysis error


@dataclass
class TradeSignal:
    """Trade signal with tracking"""
    # Basic info
    id: Optional[int] = None
    symbol: str = ""
    generated_at: datetime = None
    
    # Signal details
    direction: str = ""  # LONG, SHORT
    entry_price: float = 0.0
    stop_loss: float = 0.0
    take_profit: float = 0.0
    risk_reward: float = 0.0
    
    # Holding period (3-5 days)
    holding_days: int = 5
    expiry_date: date = None
    
    # Analysis details
    daily_bias: str = "NEUTRAL"
    hourly_trend: str = "NEUTRAL"
    confluence_score: int = 0
    confluence_breakdown: Dict = field(default_factory=dict)
    
    # Status tracking
    status: SignalStatus = SignalStatus.PENDING
    
    # Outcome tracking
    outcome_price: float = 0.0
    outcome_date: date = None
    outcome_days: int = 0
    pnl_percent: float = 0.0
    max_favorable: float = 0.0  # Max profit %
    max_adverse: float = 0.0    # Max loss %
    
    # Learning
    lessons_learned: List[str] = field(default_factory=list)
    improvement_suggestions: List[str] = field(default_factory=list)
    
    def __post_init__(self):
        if self.generated_at is None:
            self.generated_at = datetime.now()
        if self.expiry_date is None:
            self.expiry_date = (self.generated_at.date() + timedelta(days=self.holding_days))
    
    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "symbol": self.symbol,
            "generated_at": self.generated_at.isoformat() if self.generated_at else None,
            "direction": self.direction,
            "entry_price": self.entry_price,
            "stop_loss": self.stop_loss,
            "take_profit": self.take_profit,
            "risk_reward": self.risk_reward,
            "holding_days": self.holding_days,
            "expiry_date": self.expiry_date.isoformat() if self.expiry_date else None,
            "daily_bias": self.daily_bias,
            "hourly_trend": self.hourly_trend,
            "confluence_score": self.confluence_score,
            "confluence_breakdown": self.confluence_breakdown,
            "status": self.status.value,
            "outcome_price": self.outcome_price,
            "outcome_date": self.outcome_date.isoformat() if self.outcome_date else None,
            "outcome_days": self.outcome_days,
            "pnl_percent": round(self.pnl_percent, 2),
            "max_favorable": round(self.max_favorable, 2),
            "max_adverse": round(self.max_adverse, 2),
            "lessons_learned": self.lessons_learned,
            "improvement_suggestions": self.improvement_suggestions
        }


@dataclass
class StrategyLesson:
    """Lesson learned from a trade"""
    id: Optional[int] = None
    signal_id: int = 0
    symbol: str = ""
    created_at: datetime = None
    
    # Lesson details
    category: LearningCategory = LearningCategory.TECHNICAL
    description: str = ""
    mistake: str = ""           # What went wrong
    correction: str = ""        # How to fix it
    
    # Application
    apply_to_symbols: List[str] = field(default_factory=list)
    apply_to_patterns: List[str] = field(default_factory=list)
    
    # Effectiveness
    times_applied: int = 0
    success_after: int = 0
    success_rate: float = 0.0
    
    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "signal_id": self.signal_id,
            "symbol": self.symbol,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "category": self.category.value,
            "description": self.description,
            "mistake": self.mistake,
            "correction": self.correction,
            "apply_to_symbols": self.apply_to_symbols,
            "apply_to_patterns": self.apply_to_patterns,
            "times_applied": self.times_applied,
            "success_after": self.success_after,
            "success_rate": round(self.success_rate, 2)
        }


@dataclass
class StockPerformance:
    """Stock performance tracking"""
    symbol: str = ""
    total_signals: int = 0
    successful_signals: int = 0
    failed_signals: int = 0
    success_rate: float = 0.0
    total_pnl: float = 0.0
    avg_pnl: float = 0.0
    best_trade: float = 0.0
    worst_trade: float = 0.0
    avg_holding_days: float = 0.0
    last_signal_date: date = None
    recommended: bool = False  # 80%+ success rate
    
    def to_dict(self) -> Dict:
        return {
            "symbol": self.symbol,
            "total_signals": self.total_signals,
            "successful_signals": self.successful_signals,
            "failed_signals": self.failed_signals,
            "success_rate": round(self.success_rate, 2),
            "total_pnl": round(self.total_pnl, 2),
            "avg_pnl": round(self.avg_pnl, 2),
            "best_trade": round(self.best_trade, 2),
            "worst_trade": round(self.worst_trade, 2),
            "avg_holding_days": round(self.avg_holding_days, 1),
            "last_signal_date": self.last_signal_date.isoformat() if self.last_signal_date else None,
            "recommended": self.recommended
        }


class SignalTracker:
    """
    Signal Tracking System
    
    Tracks signals from generation to outcome:
    - Generate signals with 3-5 day holding
    - Track outcomes after holding period
    - Calculate success/failure
    - Update stock performance
    """
    
    def __init__(self):
        self._signals: Dict[int, TradeSignal] = {}
        self._next_id = 1
    
    def create_signal(self,
                     symbol: str,
                     direction: str,
                     entry_price: float,
                     stop_loss: float,
                     take_profit: float,
                     confluence_score: int,
                     daily_bias: str,
                     hourly_trend: str,
                     confluence_breakdown: Dict = None,
                     holding_days: int = 5) -> TradeSignal:
        """Create new signal"""
        signal = TradeSignal(
            id=self._next_id,
            symbol=symbol,
            direction=direction,
            entry_price=entry_price,
            stop_loss=stop_loss,
            take_profit=take_profit,
            risk_reward=abs(take_profit - entry_price) / abs(entry_price - stop_loss) if abs(entry_price - stop_loss) > 0 else 0,
            holding_days=holding_days,
            confluence_score=confluence_score,
            daily_bias=daily_bias,
            hourly_trend=hourly_trend,
            confluence_breakdown=confluence_breakdown or {},
            status=SignalStatus.ACTIVE
        )
        
        self._signals[self._next_id] = signal
        self._next_id += 1
        
        logger.info(f"📊 Signal #{signal.id}: {symbol} {direction} @ {entry_price}")
        return signal
    
    def update_signal_outcome(self,
                             signal_id: int,
                             current_price: float,
                             max_favorable: float = None,
                             max_adverse: float = None) -> TradeSignal:
        """Update signal outcome based on current price"""
        if signal_id not in self._signals:
            return None
        
        signal = self._signals[signal_id]
        
        # Calculate P&L
        if signal.direction == "LONG":
            pnl_percent = ((current_price - signal.entry_price) / signal.entry_price) * 100
        else:
            pnl_percent = ((signal.entry_price - current_price) / signal.entry_price) * 100
        
        signal.outcome_price = current_price
        signal.pnl_percent = pnl_percent
        
        if max_favorable:
            signal.max_favorable = max_favorable
        if max_adverse:
            signal.max_adverse = max_adverse
        
        # Check if hit target or stop
        if signal.direction == "LONG":
            if current_price >= signal.take_profit:
                signal.status = SignalStatus.SUCCESS
            elif current_price <= signal.stop_loss:
                signal.status = SignalStatus.STOPPED
        else:
            if current_price <= signal.take_profit:
                signal.status = SignalStatus.SUCCESS
            elif current_price >= signal.stop_loss:
                signal.status = SignalStatus.STOPPED
        
        return signal
    
    def finalize_signal(self, signal_id: int, final_price: float) -> TradeSignal:
        """Finalize signal after holding period"""
        if signal_id not in self._signals:
            return None
        
        signal = self._signals[signal_id]
        signal.outcome_price = final_price
        signal.outcome_date = date.today()
        signal.outcome_days = (date.today() - signal.generated_at.date()).days
        
        # Calculate final P&L
        if signal.direction == "LONG":
            signal.pnl_percent = ((final_price - signal.entry_price) / signal.entry_price) * 100
        else:
            signal.pnl_percent = ((signal.entry_price - final_price) / signal.entry_price) * 100
        
        # Update status if not already set
        if signal.status == SignalStatus.ACTIVE:
            if signal.pnl_percent > 0:
                signal.status = SignalStatus.SUCCESS
            else:
                signal.status = SignalStatus.STOPPED
        
        logger.info(f"📉 Signal #{signal.id} finalized: {signal.status.value} ({signal.pnl_percent:.2f}%)")
        return signal
    
    def get_active_signals(self) -> List[TradeSignal]:
        """Get all active signals"""
        return [s for s in self._signals.values() if s.status == SignalStatus.ACTIVE]
    
    def get_pending_signals(self) -> List[TradeSignal]:
        """Get signals pending outcome check"""
        today = date.today()
        pending = []
        for signal in self._signals.values():
            if signal.status == SignalStatus.ACTIVE and signal.expiry_date <= today:
                pending.append(signal)
        return pending
    
    def get_signal(self, signal_id: int) -> Optional[TradeSignal]:
        """Get signal by ID"""
        return self._signals.get(signal_id)
    
    def get_all_signals(self, status: SignalStatus = None) -> List[TradeSignal]:
        """Get all signals, optionally filtered by status"""
        signals = list(self._signals.values())
        if status:
            signals = [s for s in signals if s.status == status]
        return sorted(signals, key=lambda s: s.generated_at, reverse=True)
    
    def get_statistics(self) -> Dict:
        """Get signal statistics"""
        signals = list(self._signals.values())
        
        total = len(signals)
        if total == 0:
            return {"total": 0}
        
        successful = len([s for s in signals if s.status == SignalStatus.SUCCESS])
        stopped = len([s for s in signals if s.status == SignalStatus.STOPPED])
        active = len([s for s in signals if s.status == SignalStatus.ACTIVE])
        
        pnl_list = [s.pnl_percent for s in signals if s.status in [SignalStatus.SUCCESS, SignalStatus.STOPPED]]
        total_pnl = sum(pnl_list) if pnl_list else 0
        
        return {
            "total_signals": total,
            "active_signals": active,
            "successful_signals": successful,
            "stopped_signals": stopped,
            "success_rate": round((successful / (successful + stopped)) * 100, 2) if (successful + stopped) > 0 else 0,
            "total_pnl_percent": round(total_pnl, 2),
            "avg_pnl_percent": round(total_pnl / len(pnl_list), 2) if pnl_list else 0,
            "best_trade": round(max(pnl_list), 2) if pnl_list else 0,
            "worst_trade": round(min(pnl_list), 2) if pnl_list else 0
        }


class LearningEngine:
    """
    Learning Engine for Strategy Improvement
    
    Learns from losing trades:
    - Analyze what went wrong
    - Generate lessons
    - Apply corrections to future signals
    - Track improvement over time
    """
    
    def __init__(self):
        self._lessons: Dict[int, StrategyLesson] = {}
        self._next_id = 1
        self._lessons_by_category: Dict[LearningCategory, List[StrategyLesson]] = {}
    
    def analyze_failed_signal(self, signal: TradeSignal, market_data: Dict = None) -> List[StrategyLesson]:
        """
        Analyze failed signal and generate lessons
        
        Args:
            signal: Failed trade signal
            market_data: Additional market context
            
        Returns:
            List of lessons learned
        """
        lessons = []
        
        if signal.status not in [SignalStatus.STOPPED]:
            return lessons
        
        # Analyze confluence
        if signal.confluence_score < 70:
            lesson = self._create_lesson(
                signal=signal,
                category=LearningCategory.CONFLUENCE,
                mistake=f"Low confluence score ({signal.confluence_score})",
                correction="Require minimum 70 confluence score for signal generation"
            )
            lessons.append(lesson)
        
        # Analyze structure
        if signal.daily_bias != signal.hourly_trend:
            lesson = self._create_lesson(
                signal=signal,
                category=LearningCategory.STRUCTURE,
                mistake="Daily and Hourly trend misalignment",
                correction="Only take signals when Daily and Hourly trends are aligned"
            )
            lessons.append(lesson)
        
        # Analyze R:R
        if signal.risk_reward < 1.5:
            lesson = self._create_lesson(
                signal=signal,
                category=LearningCategory.RISK,
                mistake=f"Poor risk/reward ratio ({signal.risk_reward:.2f})",
                correction="Only take signals with R:R >= 1.5"
            )
            lessons.append(lesson)
        
        # Analyze entry timing
        if signal.outcome_days <= 1:
            lesson = self._create_lesson(
                signal=signal,
                category=LearningCategory.TIMING,
                mistake="Signal failed within 1 day - poor entry timing",
                correction="Wait for better entry confirmation before signal"
            )
            lessons.append(lesson)
        
        # Analyze max adverse excursion
        if signal.max_adverse > 5:
            lesson = self._create_lesson(
                signal=signal,
                category=LearningCategory.RISK,
                mistake=f"Large drawdown ({signal.max_adverse:.2f}%) before stop",
                correction="Tighten stop loss or improve entry timing"
            )
            lessons.append(lesson)
        
        # Store lessons
        for lesson in lessons:
            self._lessons[self._next_id] = lesson
            self._next_id += 1
            
            # Category index
            if lesson.category not in self._lessons_by_category:
                self._lessons_by_category[lesson.category] = []
            self._lessons_by_category[lesson.category].append(lesson)
        
        logger.info(f"📚 Generated {len(lessons)} lessons from signal #{signal.id}")
        return lessons
    
    def _create_lesson(self,
                       signal: TradeSignal,
                       category: LearningCategory,
                       mistake: str,
                       correction: str) -> StrategyLesson:
        """Create a new lesson"""
        return StrategyLesson(
            id=self._next_id,
            signal_id=signal.id,
            symbol=signal.symbol,
            created_at=datetime.now(),
            category=category,
            description=f"{signal.symbol}: {mistake}",
            mistake=mistake,
            correction=correction,
            apply_to_symbols=[signal.symbol],
            apply_to_patterns=[signal.daily_bias, signal.hourly_trend]
        )
    
    def get_all_lessons(self, category: LearningCategory = None) -> List[StrategyLesson]:
        """Get all lessons, optionally filtered by category"""
        if category:
            return self._lessons_by_category.get(category, [])
        return list(self._lessons.values())
    
    def get_lessons_for_symbol(self, symbol: str) -> List[StrategyLesson]:
        """Get lessons applicable to a symbol"""
        return [l for l in self._lessons.values() if symbol in l.apply_to_symbols]
    
    def get_corrections(self) -> Dict[str, List[str]]:
        """Get all corrections by category"""
        corrections = {}
        for lesson in self._lessons.values():
            cat = lesson.category.value
            if cat not in corrections:
                corrections[cat] = []
            if lesson.correction not in corrections[cat]:
                corrections[cat].append(lesson.correction)
        return corrections
    
    def get_strategy_improvements(self) -> Dict:
        """Get strategy improvement summary"""
        total_lessons = len(self._lessons)
        
        by_category = {}
        for cat in LearningCategory:
            by_category[cat.value] = len(self._lessons_by_category.get(cat, []))
        
        # Most common mistakes
        mistakes = {}
        for lesson in self._lessons.values():
            key = lesson.mistake[:50]  # Truncate
            mistakes[key] = mistakes.get(key, 0) + 1
        
        top_mistakes = sorted(mistakes.items(), key=lambda x: x[1], reverse=True)[:5]
        
        return {
            "total_lessons": total_lessons,
            "by_category": by_category,
            "top_mistakes": [{"mistake": m[0], "count": m[1]} for m in top_mistakes],
            "corrections": self.get_corrections()
        }


class PerformanceTracker:
    """
    Performance Tracker for Stocks
    
    Tracks:
    - Per-symbol success rate
    - Recommended stocks (80%+ success)
    - Watchlist generation
    """
    
    def __init__(self):
        self._stock_performance: Dict[str, StockPerformance] = {}
        self._min_success_for_watchlist = 80.0
        self._min_signals_for_recommendation = 3
    
    def update_from_signals(self, signals: List[TradeSignal]):
        """Update performance from signal list"""
        # Group by symbol
        by_symbol: Dict[str, List[TradeSignal]] = {}
        for signal in signals:
            if signal.symbol not in by_symbol:
                by_symbol[signal.symbol] = []
            by_symbol[signal.symbol].append(signal)
        
        # Calculate performance per symbol
        for symbol, sig_list in by_symbol.items():
            completed = [s for s in sig_list if s.status in [SignalStatus.SUCCESS, SignalStatus.STOPPED]]
            
            if not completed:
                continue
            
            successful = len([s for s in completed if s.status == SignalStatus.SUCCESS])
            failed = len([s for s in completed if s.status == SignalStatus.STOPPED])
            total = len(completed)
            
            pnl_list = [s.pnl_percent for s in completed]
            
            perf = StockPerformance(
                symbol=symbol,
                total_signals=total,
                successful_signals=successful,
                failed_signals=failed,
                success_rate=(successful / total * 100) if total > 0 else 0,
                total_pnl=sum(pnl_list),
                avg_pnl=sum(pnl_list) / len(pnl_list) if pnl_list else 0,
                best_trade=max(pnl_list) if pnl_list else 0,
                worst_trade=min(pnl_list) if pnl_list else 0,
                avg_holding_days=sum(s.outcome_days for s in completed) / len(completed) if completed else 0,
                last_signal_date=max(s.generated_at.date() for s in sig_list),
                recommended=False
            )
            
            # Check if recommended (80%+ success, at least 3 signals)
            if perf.success_rate >= self._min_success_for_watchlist and total >= self._min_signals_for_recommendation:
                perf.recommended = True
            
            self._stock_performance[symbol] = perf
    
    def get_watchlist(self, min_success: float = None) -> List[StockPerformance]:
        """Get recommended stocks watchlist"""
        min_success = min_success or self._min_success_for_watchlist
        
        recommended = [
            perf for perf in self._stock_performance.values()
            if perf.recommended and perf.success_rate >= min_success
        ]
        
        return sorted(recommended, key=lambda p: p.success_rate, reverse=True)
    
    def get_all_performance(self) -> List[StockPerformance]:
        """Get performance for all tracked stocks"""
        return sorted(self._stock_performance.values(), key=lambda p: p.success_rate, reverse=True)
    
    def get_symbol_performance(self, symbol: str) -> Optional[StockPerformance]:
        """Get performance for a specific symbol"""
        return self._stock_performance.get(symbol)
    
    def get_statistics(self) -> Dict:
        """Get overall performance statistics"""
        all_perf = list(self._stock_performance.values())
        
        if not all_perf:
            return {"total_stocks": 0}
        
        recommended = [p for p in all_perf if p.recommended]
        
        return {
            "total_stocks_tracked": len(all_perf),
            "recommended_stocks": len(recommended),
            "avg_success_rate": round(sum(p.success_rate for p in all_perf) / len(all_perf), 2),
            "total_pnl": round(sum(p.total_pnl for p in all_perf), 2),
            "best_performer": max(all_perf, key=lambda p: p.success_rate).symbol if all_perf else None,
            "worst_performer": min(all_perf, key=lambda p: p.success_rate).symbol if all_perf else None
        }


# Singleton instances
_signal_tracker: Optional[SignalTracker] = None
_learning_engine: Optional[LearningEngine] = None
_performance_tracker: Optional[PerformanceTracker] = None


def get_signal_tracker() -> SignalTracker:
    """Get signal tracker singleton"""
    global _signal_tracker
    if _signal_tracker is None:
        _signal_tracker = SignalTracker()
    return _signal_tracker


def get_learning_engine() -> LearningEngine:
    """Get learning engine singleton"""
    global _learning_engine
    if _learning_engine is None:
        _learning_engine = LearningEngine()
    return _learning_engine


def get_performance_tracker() -> PerformanceTracker:
    """Get performance tracker singleton"""
    global _performance_tracker
    if _performance_tracker is None:
        _performance_tracker = PerformanceTracker()
    return _performance_tracker
