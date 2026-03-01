"""
AI Agents - Learning Agent
Self-improving system that learns from trade results

Memory Database:
{
  "setup": "OB Retest",
  "trend": "bullish",
  "volatility": "high",
  "result": "win"
}

Probability Table:
Trending + OB = 74% win
Range + OB = 41%

Author: Trading AI Agent
"""

from dataclasses import dataclass
from typing import List, Dict, Any, Optional
from datetime import datetime
from enum import Enum
from collections import defaultdict
import numpy as np


class TradeResult(Enum):
    WIN = "WIN"
    LOSS = "LOSS"
    BREAKEVEN = "BREAKEVEN"


class TradingSession(Enum):
    PRE_MARKET = "PRE_MARKET"
    OPENING = "OPENING"
    MORNING = "MORNING"
    AFTERNOON = "AFTERNOON"
    CLOSING = "CLOSING"


@dataclass
class TradeMemory:
    """Memory record for a completed trade"""
    trade_id: int
    setup_type: str
    trend_direction: str
    regime: str
    volatility: str
    volume_profile: str
    htf_alignment: bool
    session: str
    day_of_week: int
    result: str
    pnl_percent: float
    hold_time: int  # minutes
    confluence_score: int
    timestamp: datetime


@dataclass
class ProbabilityStats:
    """Probability statistics for a setup type"""
    setup_type: str
    regime: str
    trend_direction: str
    total_trades: int
    wins: int
    losses: int
    win_rate: float
    avg_pnl: float
    avg_hold_time: float


# Setup type definitions
SETUP_TYPES = {
    'LIQUIDITY_SWEEP_OB': 'Liquidity Sweep + Order Block',
    'BOS_OB_RETEST': 'BOS + Order Block Retest',
    'BOS_FOLLOW': 'Break of Structure Follow',
    'FVG_FILL': 'Fair Value Gap Fill',
    'CONFLUENCE': 'General Confluence'
}


class LearningAgent:
    """
    Learning Agent - Self-improving system
    
    Mathematical Formulas:
    1. Win Rate = Wins / Total Trades
    2. Setup Probability = Wins_of_Setup / Total_Occurrences
    3. Filter Threshold = 0.6 (60% minimum win rate)
    
    Learns from every trade and improves filtering.
    """
    
    def __init__(self, min_trades_for_stats: int = 10):
        """
        Initialize Learning Agent
        
        Args:
            min_trades_for_stats: Minimum trades before using statistics
        """
        self.min_trades_for_stats = min_trades_for_stats
        self.memory: List[TradeMemory] = []
        self.probability_table: Dict[str, ProbabilityStats] = {}
    
    def record_trade(self,
                    trade_id: int,
                    setup_type: str,
                    trend_direction: str,
                    regime: str,
                    volatility: str,
                    volume_profile: str,
                    htf_alignment: bool,
                    result: str,
                    pnl_percent: float,
                    hold_time: int,
                    confluence_score: int) -> TradeMemory:
        """
        Record trade in memory
        
        Args:
            trade_id: Trade identifier
            setup_type: Type of setup
            trend_direction: BULLISH, BEARISH, NEUTRAL
            regime: TRENDING, RANGING, VOLATILE
            volatility: HIGH, NORMAL, LOW
            volume_profile: HIGH, NORMAL, LOW
            htf_alignment: True if aligned with HTF
            result: WIN, LOSS, BREAKEVEN
            pnl_percent: P&L percentage
            hold_time: Hold time in minutes
            confluence_score: Setup confluence score
        """
        now = datetime.utcnow()
        
        # Determine session
        session = self._determine_session(now)
        
        memory = TradeMemory(
            trade_id=trade_id,
            setup_type=setup_type,
            trend_direction=trend_direction,
            regime=regime,
            volatility=volatility,
            volume_profile=volume_profile,
            htf_alignment=htf_alignment,
            session=session,
            day_of_week=now.weekday(),
            result=result,
            pnl_percent=pnl_percent,
            hold_time=hold_time,
            confluence_score=confluence_score,
            timestamp=now
        )
        
        self.memory.append(memory)
        
        # Update probability table
        self._update_probability_table(memory)
        
        return memory
    
    def _determine_session(self, timestamp: datetime) -> str:
        """Determine trading session from time"""
        hour = timestamp.hour
        minute = timestamp.minute
        time_val = hour * 60 + minute
        
        if time_val < 9 * 60 + 15:
            return TradingSession.PRE_MARKET.value
        elif time_val < 10 * 60:
            return TradingSession.OPENING.value
        elif time_val < 12 * 60:
            return TradingSession.MORNING.value
        elif time_val < 14 * 60 + 30:
            return TradingSession.AFTERNOON.value
        else:
            return TradingSession.CLOSING.value
    
    def _update_probability_table(self, memory: TradeMemory):
        """Update probability statistics"""
        key = f"{memory.setup_type}_{memory.regime}_{memory.trend_direction}"
        
        if key in self.probability_table:
            stats = self.probability_table[key]
            stats.total_trades += 1
            if memory.result == TradeResult.WIN.value:
                stats.wins += 1
            elif memory.result == TradeResult.LOSS.value:
                stats.losses += 1
            
            # Update averages
            stats.win_rate = (stats.wins / stats.total_trades) * 100
            stats.avg_pnl = self._running_avg(stats.avg_pnl, memory.pnl_percent, stats.total_trades)
            stats.avg_hold_time = self._running_avg(stats.avg_hold_time, memory.hold_time, stats.total_trades)
        else:
            self.probability_table[key] = ProbabilityStats(
                setup_type=memory.setup_type,
                regime=memory.regime,
                trend_direction=memory.trend_direction,
                total_trades=1,
                wins=1 if memory.result == TradeResult.WIN.value else 0,
                losses=1 if memory.result == TradeResult.LOSS.value else 0,
                win_rate=100 if memory.result == TradeResult.WIN.value else 0,
                avg_pnl=memory.pnl_percent,
                avg_hold_time=memory.hold_time
            )
    
    def _running_avg(self, current_avg: float, new_value: float, count: int) -> float:
        """Calculate running average"""
        return ((current_avg * (count - 1)) + new_value) / count
    
    def get_setup_probability(self,
                             setup_type: str,
                             regime: str,
                             trend_direction: str) -> Optional[ProbabilityStats]:
        """
        Get probability for specific setup conditions
        
        Returns:
            ProbabilityStats or None if insufficient data
        """
        # Try exact match
        key = f"{setup_type}_{regime}_{trend_direction}"
        if key in self.probability_table:
            stats = self.probability_table[key]
            if stats.total_trades >= self.min_trades_for_stats:
                return stats
        
        # Try without trend direction
        for k, stats in self.probability_table.items():
            if setup_type in k and regime in k:
                if stats.total_trades >= self.min_trades_for_stats:
                    return stats
        
        # Try setup type only
        for k, stats in self.probability_table.items():
            if setup_type in k:
                if stats.total_trades >= self.min_trades_for_stats:
                    return stats
        
        return None
    
    def should_filter_setup(self,
                           setup_type: str,
                           regime: str,
                           trend_direction: str,
                           min_win_rate: float = 55.0) -> bool:
        """
        Check if setup should be filtered based on historical performance
        
        Returns:
            True if setup should be FILTERED (rejected)
        """
        stats = self.get_setup_probability(setup_type, regime, trend_direction)
        
        if stats is None:
            return False  # Don't filter if no data
        
        return stats.win_rate < min_win_rate
    
    def get_best_setup_for_conditions(self,
                                      regime: str,
                                      trend_direction: str) -> Optional[str]:
        """
        Get best performing setup type for current conditions
        """
        matching = []
        
        for key, stats in self.probability_table.items():
            if regime in key and trend_direction in key:
                if stats.total_trades >= self.min_trades_for_stats:
                    matching.append(stats)
        
        if not matching:
            return None
        
        # Sort by win rate
        matching.sort(key=lambda x: x.win_rate, reverse=True)
        
        return matching[0].setup_type
    
    def get_session_stats(self) -> Dict[str, Dict[str, float]]:
        """Get performance by trading session"""
        session_data = defaultdict(lambda: {'wins': 0, 'total': 0, 'pnl': []})
        
        for memory in self.memory:
            session_data[memory.session]['total'] += 1
            if memory.result == TradeResult.WIN.value:
                session_data[memory.session]['wins'] += 1
            session_data[memory.session]['pnl'].append(memory.pnl_percent)
        
        result = {}
        for session, data in session_data.items():
            result[session] = {
                'win_rate': (data['wins'] / data['total'] * 100) if data['total'] > 0 else 0,
                'avg_pnl': np.mean(data['pnl']) if data['pnl'] else 0,
                'total_trades': data['total']
            }
        
        return result
    
    def generate_learning_report(self) -> str:
        """Generate learning analysis report"""
        report = "# Learning Agent Report\n\n"
        report += f"Total Trades Analyzed: {len(self.memory)}\n\n"
        
        if not self.memory:
            return report + "No trades recorded yet.\n"
        
        # Top performing setups
        sorted_stats = sorted(
            [s for s in self.probability_table.values() if s.total_trades >= self.min_trades_for_stats],
            key=lambda x: x.win_rate,
            reverse=True
        )
        
        report += "## Top Performing Setups\n\n"
        for i, stats in enumerate(sorted_stats[:5]):
            report += f"### {i+1}. {stats.setup_type}\n"
            report += f"- Win Rate: {stats.win_rate:.1f}%\n"
            report += f"- Trades: {stats.total_trades}\n"
            report += f"- Avg PnL: {stats.avg_pnl:.2f}%\n"
            report += f"- Regime: {stats.regime}\n\n"
        
        # Avoid setups
        avoid = [s for s in sorted_stats if s.win_rate < 40]
        if avoid:
            report += "## Avoid Setups\n\n"
            for stats in avoid:
                report += f"- **{stats.setup_type}** ({stats.regime}): {stats.win_rate:.1f}% win rate\n"
        
        # Session analysis
        report += "\n## Session Performance\n\n"
        session_stats = self.get_session_stats()
        for session, stats in session_stats.items():
            report += f"- {session}: {stats['win_rate']:.1f}% win rate, {stats['total_trades']} trades\n"
        
        return report
    
    def get_recommendations(self, regime: str, trend_direction: str) -> Dict[str, Any]:
        """Get trading recommendations based on learning"""
        best_setup = self.get_best_setup_for_conditions(regime, trend_direction)
        
        # Get setups to avoid
        avoid_setups = []
        for key, stats in self.probability_table.items():
            if stats.total_trades >= self.min_trades_for_stats and stats.win_rate < 40:
                if regime in key:
                    avoid_setups.append(stats.setup_type)
        
        return {
            'best_setup': best_setup,
            'avoid_setups': avoid_setups,
            'confidence': min(len(self.memory) / 50, 1.0)  # More trades = more confidence
        }
