"""
Backtest Engine - Simulator
Candle-by-candle simulation for strategy validation

Mathematical Formulas:
1. Win Rate = Wins / Total Trades
2. Expectancy = (Win% × Avg Win) - (Loss% × Avg Loss)
3. Max Drawdown = max(peak - trough) / peak
4. Profit Factor = Gross Profit / Gross Loss
5. Sharpe Ratio = (Avg Return - Risk Free Rate) / Std Dev of Returns

Author: Trading AI Agent
"""

from dataclasses import dataclass
from typing import List, Dict, Optional, Tuple
from datetime import datetime
import numpy as np

from app.smc import Candle, SwingDetector, StructureDetector, LiquidityDetector
from app.smc import OrderBlockDetector, FVGDetector, ConfluenceEngine, RegimeDetector


@dataclass
class BacktestTrade:
    """Backtest Trade Result"""
    entry_time: datetime
    exit_time: datetime
    direction: str  # LONG, SHORT
    entry_price: float
    exit_price: float
    stop_loss: float
    take_profit: float
    pnl: float
    pnl_percent: float
    result: str  # WIN, LOSS, BREAKEVEN
    hold_candles: int
    setup_type: str
    confluence_score: int


@dataclass
class BacktestResult:
    """Complete Backtest Results"""
    # Trade Stats
    total_trades: int
    winning_trades: int
    losing_trades: int
    breakeven_trades: int
    
    # Metrics
    win_rate: float
    expectancy: float
    profit_factor: float
    max_drawdown: float
    max_drawdown_percent: float
    sharpe_ratio: float
    
    # P&L
    total_pnl: float
    gross_profit: float
    gross_loss: float
    avg_win: float
    avg_loss: float
    avg_hold_time: float
    
    # Trades
    trades: List[BacktestTrade]
    
    # Capital
    starting_capital: float
    ending_capital: float
    peak_capital: float


class BacktestSimulator:
    """
    Candle-by-Candle Backtest Simulator
    
    Mathematical Implementation:
    - Processes candles sequentially (no future data leak)
    - Simulates realistic trade execution
    - Calculates all performance metrics
    """
    
    def __init__(self,
                 initial_capital: float = 100000,
                 risk_per_trade: float = 1.0,
                 min_confluence_score: int = 70,
                 sl_buffer: float = 0.1):
        """
        Initialize Backtest Simulator
        
        Args:
            initial_capital: Starting capital
            risk_per_trade: Risk percentage per trade
            min_confluence_score: Minimum confluence to take trade
            sl_buffer: Stop loss buffer percentage
        """
        self.initial_capital = initial_capital
        self.risk_per_trade = risk_per_trade
        self.min_confluence_score = min_confluence_score
        self.sl_buffer = sl_buffer
        
        # Detectors
        self.swing_detector = SwingDetector()
        self.structure_detector = StructureDetector()
        self.liq_detector = LiquidityDetector()
        self.ob_detector = OrderBlockDetector()
        self.fvg_detector = FVGDetector()
        self.confluence_engine = ConfluenceEngine(min_total_score=min_confluence_score)
        self.regime_detector = RegimeDetector()
    
    def run_backtest(self,
                    candles: List[Candle],
                    symbol: str = "BACKTEST",
                    timeframe: str = "5m") -> BacktestResult:
        """
        Run complete backtest
        
        Process:
        1. Iterate through candles sequentially
        2. For each candle, analyze past data only
        3. Generate setup if conditions met
        4. Simulate trade execution
        5. Track results
        """
        if len(candles) < 100:
            raise ValueError("Need at least 100 candles for backtest")
        
        trades: List[BacktestTrade] = []
        capital = self.initial_capital
        capital_curve = [capital]
        peak = capital
        
        # Minimum lookback for analysis
        lookback = 50
        
        for i in range(lookback, len(candles) - 1):
            # Only use past data (no future leak)
            analysis_candles = candles[:i+1]
            
            # Run SMC analysis on past data
            setup = self._analyze_and_generate_setup(
                analysis_candles, symbol, timeframe
            )
            
            if setup is None:
                capital_curve.append(capital)
                continue
            
            # Simulate trade
            trade = self._simulate_trade(
                candles, i, setup, capital
            )
            
            if trade:
                trades.append(trade)
                capital += trade.pnl
                capital_curve.append(capital)
                
                if capital > peak:
                    peak = capital
        
        # Calculate metrics
        return self._calculate_results(trades, capital, capital_curve, peak)
    
    def _analyze_and_generate_setup(self,
                                   candles: List[Candle],
                                   symbol: str,
                                   timeframe: str) -> Optional[any]:
        """Analyze candles and generate setup"""
        # Detect swings
        swings = self.swing_detector.detect_swings(candles)
        if not swings:
            return None
        
        # Detect structures
        structures = self.structure_detector.detect_basic_structure(swings)
        bos_points = self.structure_detector.detect_bos(candles, swings)
        all_structures = structures + bos_points
        
        # Detect liquidity
        liquidity = self.liq_detector.detect_all_liquidity(swings, candles)
        
        # Detect order blocks
        order_blocks = self.ob_detector.detect_all_order_blocks(candles)
        
        # Detect FVGs
        fvgs = self.fvg_detector.detect_all_fvgs(candles)
        
        # Detect regime
        regime_data = self.regime_detector.detect_regime(candles)
        
        # Determine HTF bias from structure
        trend = self.structure_detector.get_trend_direction(structures)
        htf_bias = trend.value
        
        # Generate setup
        setup = self.confluence_engine.generate_trade_setup(
            symbol=symbol,
            timeframe=timeframe,
            candles=candles,
            structures=all_structures,
            liquidity_zones=liquidity,
            order_blocks=order_blocks,
            fvgs=fvgs,
            regime=regime_data.regime.value,
            htf_bias=htf_bias
        )
        
        return setup
    
    def _simulate_trade(self,
                       candles: List[Candle],
                       entry_index: int,
                       setup: any,
                       capital: float) -> Optional[BacktestTrade]:
        """Simulate trade execution"""
        # Entry on next candle open
        entry_candle = candles[entry_index + 1]
        entry_price = entry_candle.open
        
        # Calculate position size based on risk
        risk_amount = capital * (self.risk_per_trade / 100)
        sl_distance = abs(entry_price - setup.stop_loss)
        
        if sl_distance == 0:
            return None
        
        position_size = risk_amount / sl_distance
        
        # Track trade
        direction = setup.direction
        stop_loss = setup.stop_loss
        take_profit = setup.take_profit
        
        # Simulate exit
        exit_price = None
        exit_time = None
        result = None
        hold_candles = 0
        
        for j in range(entry_index + 2, len(candles)):
            hold_candles += 1
            candle = candles[j]
            
            if direction == 'LONG':
                # Check stop loss
                if candle.low <= stop_loss:
                    exit_price = stop_loss
                    exit_time = candle.timestamp
                    result = 'LOSS'
                    break
                # Check take profit
                if candle.high >= take_profit:
                    exit_price = take_profit
                    exit_time = candle.timestamp
                    result = 'WIN'
                    break
            else:  # SHORT
                if candle.high >= stop_loss:
                    exit_price = stop_loss
                    exit_time = candle.timestamp
                    result = 'LOSS'
                    break
                if candle.low <= take_profit:
                    exit_price = take_profit
                    exit_time = candle.timestamp
                    result = 'WIN'
                    break
        
        if exit_price is None:
            # Force close at end
            exit_price = candles[-1].close
            exit_time = candles[-1].timestamp
            result = 'BREAKEVEN'
        
        # Calculate P&L
        if direction == 'LONG':
            pnl = (exit_price - entry_price) * position_size
        else:
            pnl = (entry_price - exit_price) * position_size
        
        pnl_percent = (pnl / capital) * 100
        
        # Classify setup type
        setup_type = self._classify_setup(setup)
        
        return BacktestTrade(
            entry_time=entry_candle.timestamp,
            exit_time=exit_time,
            direction=direction,
            entry_price=entry_price,
            exit_price=exit_price,
            stop_loss=stop_loss,
            take_profit=take_profit,
            pnl=pnl,
            pnl_percent=pnl_percent,
            result=result,
            hold_candles=hold_candles,
            setup_type=setup_type,
            confluence_score=setup.confluence.total_score
        )
    
    def _classify_setup(self, setup) -> str:
        """Classify setup type"""
        if setup.confluence.liquidity_sweep:
            return "LIQUIDITY_SWEEP"
        elif setup.confluence.bos:
            return "BOS_FOLLOW"
        elif setup.confluence.orderblock_touch:
            return "OB_RETEST"
        else:
            return "CONFLUENCE"
    
    def _calculate_results(self,
                          trades: List[BacktestTrade],
                          final_capital: float,
                          capital_curve: List[float],
                          peak: float) -> BacktestResult:
        """Calculate all backtest metrics"""
        if not trades:
            return BacktestResult(
                total_trades=0, winning_trades=0, losing_trades=0, breakeven_trades=0,
                win_rate=0, expectancy=0, profit_factor=0,
                max_drawdown=0, max_drawdown_percent=0, sharpe_ratio=0,
                total_pnl=0, gross_profit=0, gross_loss=0,
                avg_win=0, avg_loss=0, avg_hold_time=0,
                trades=[], starting_capital=self.initial_capital,
                ending_capital=final_capital, peak_capital=peak
            )
        
        # Count wins/losses
        wins = [t for t in trades if t.result == 'WIN']
        losses = [t for t in trades if t.result == 'LOSS']
        breakevens = [t for t in trades if t.result == 'BREAKEVEN']
        
        # Win Rate
        win_rate = (len(wins) / len(trades)) * 100 if trades else 0
        
        # P&L
        total_pnl = sum(t.pnl for t in trades)
        gross_profit = sum(t.pnl for t in wins)
        gross_loss = abs(sum(t.pnl for t in losses))
        
        # Average win/loss
        avg_win = gross_profit / len(wins) if wins else 0
        avg_loss = gross_loss / len(losses) if losses else 0
        
        # Expectancy
        # Formula: (Win% × Avg Win) - (Loss% × Avg Loss)
        win_prob = len(wins) / len(trades) if trades else 0
        loss_prob = len(losses) / len(trades) if trades else 0
        expectancy = (win_prob * avg_win) - (loss_prob * avg_loss)
        
        # Profit Factor
        # Formula: Gross Profit / Gross Loss
        profit_factor = gross_profit / gross_loss if gross_loss > 0 else float('inf')
        
        # Max Drawdown
        # Formula: max(peak - trough) / peak
        capital_array = np.array(capital_curve)
        running_max = np.maximum.accumulate(capital_array)
        drawdowns = (running_max - capital_array) / running_max
        max_drawdown = np.max(drawdowns) * 100
        max_drawdown_amount = peak - min(capital_curve)
        
        # Sharpe Ratio
        # Formula: (Avg Return - Risk Free Rate) / Std Dev of Returns
        returns = np.diff(capital_array) / capital_array[:-1]
        if len(returns) > 1 and np.std(returns) > 0:
            sharpe_ratio = (np.mean(returns) / np.std(returns)) * np.sqrt(252)
        else:
            sharpe_ratio = 0
        
        # Average hold time
        avg_hold = np.mean([t.hold_candles for t in trades])
        
        return BacktestResult(
            total_trades=len(trades),
            winning_trades=len(wins),
            losing_trades=len(losses),
            breakeven_trades=len(breakevens),
            win_rate=win_rate,
            expectancy=expectancy,
            profit_factor=profit_factor,
            max_drawdown=max_drawdown_amount,
            max_drawdown_percent=max_drawdown,
            sharpe_ratio=sharpe_ratio,
            total_pnl=total_pnl,
            gross_profit=gross_profit,
            gross_loss=gross_loss,
            avg_win=avg_win,
            avg_loss=avg_loss,
            avg_hold_time=avg_hold,
            trades=trades,
            starting_capital=self.initial_capital,
            ending_capital=final_capital,
            peak_capital=peak
        )
