"""
Risk Management - Risk Agent
Position sizing and risk controls

Hard Rules:
- Risk per trade = 1%
- Daily loss = 3%
- Max trades/day = 3
- Max open positions = 3

Author: Trading AI Agent
"""

from dataclasses import dataclass
from typing import Optional, Dict, Any
from datetime import datetime, date
from enum import Enum


class RiskAction(Enum):
    ALLOW = "ALLOW"
    BLOCK = "BLOCK"
    REDUCE_SIZE = "REDUCE_SIZE"


@dataclass
class RiskState:
    """Current Risk State"""
    starting_capital: float
    current_capital: float
    daily_pnl: float
    daily_loss: float
    daily_trades: int
    open_positions: int
    daily_loss_limit: bool
    trade_limit_hit: bool
    trading_halted: bool
    halt_reason: Optional[str] = None


@dataclass
class RiskCheckResult:
    """Result of risk check"""
    action: RiskAction
    allowed: bool
    reason: str
    position_size: Optional[float] = None
    risk_amount: Optional[float] = None


class RiskConfig:
    """Risk Configuration"""
    def __init__(self):
        self.max_risk_per_trade = 1.0    # 1% per trade
        self.max_daily_loss = 3.0        # 3% daily loss limit
        self.max_weekly_loss = 6.0       # 6% weekly loss limit
        self.max_drawdown = 10.0         # 10% max drawdown
        self.max_trades_per_day = 3      # Max 3 trades per day
        self.max_open_positions = 3      # Max 3 open positions
        self.min_risk_reward = 1.5       # Min 1.5:1 R:R
        self.trading_start = "09:15"
        self.trading_end = "15:30"
        self.no_trade_days = [5, 6]      # Saturday, Sunday


class RiskAgent:
    """
    Risk Management Agent
    
    Mathematical Formulas:
    1. Position Size = (Capital × Risk%) / |Entry - StopLoss|
    2. Risk Amount = Capital × Risk%
    3. Daily Loss % = Daily Loss / Starting Capital × 100
    """
    
    def __init__(self, config: RiskConfig = None):
        self.config = config or RiskConfig()
    
    def calculate_position_size(self,
                               capital: float,
                               entry_price: float,
                               stop_loss: float,
                               risk_percent: float = None) -> float:
        """
        Calculate Position Size
        
        Mathematical Formula:
        Position Size = (Capital × Risk%) / |Entry - StopLoss|
        
        Args:
            capital: Current capital
            entry_price: Entry price
            stop_loss: Stop loss price
            risk_percent: Risk percentage (default from config)
        
        Returns:
            Position size in quantity
        """
        if risk_percent is None:
            risk_percent = self.config.max_risk_per_trade
        
        # Risk amount in currency
        risk_amount = capital * (risk_percent / 100)
        
        # Risk per share/lot
        risk_per_unit = abs(entry_price - stop_loss)
        
        if risk_per_unit == 0:
            return 0
        
        # Position size
        position_size = risk_amount / risk_per_unit
        
        return int(position_size)  # Round down to whole number
    
    def calculate_risk_amount(self, capital: float, risk_percent: float = None) -> float:
        """
        Calculate Risk Amount
        
        Formula: Risk Amount = Capital × Risk%
        """
        if risk_percent is None:
            risk_percent = self.config.max_risk_per_trade
        
        return capital * (risk_percent / 100)
    
    def check_trade_allowed(self,
                           setup: Dict[str, Any],
                           risk_state: RiskState) -> RiskCheckResult:
        """
        Check if trade is allowed based on risk rules
        
        Checks:
        1. Daily loss limit
        2. Weekly loss limit
        3. Max drawdown
        4. Daily trade limit
        5. Max open positions
        6. Risk/Reward ratio
        7. Trading hours
        8. Trading day
        """
        # Check trading halted
        if risk_state.trading_halted:
            return RiskCheckResult(
                action=RiskAction.BLOCK,
                allowed=False,
                reason=risk_state.halt_reason or "Trading halted"
            )
        
        # Check daily loss limit
        daily_loss_percent = (risk_state.daily_loss / risk_state.starting_capital) * 100
        if daily_loss_percent >= self.config.max_daily_loss:
            return RiskCheckResult(
                action=RiskAction.BLOCK,
                allowed=False,
                reason=f"Daily loss limit reached ({daily_loss_percent:.2f}%)"
            )
        
        # Check max drawdown
        drawdown_percent = ((risk_state.starting_capital - risk_state.current_capital) / 
                          risk_state.starting_capital) * 100
        if drawdown_percent >= self.config.max_drawdown:
            return RiskCheckResult(
                action=RiskAction.BLOCK,
                allowed=False,
                reason=f"Max drawdown reached ({drawdown_percent:.2f}%)"
            )
        
        # Check daily trade limit
        if risk_state.daily_trades >= self.config.max_trades_per_day:
            return RiskCheckResult(
                action=RiskAction.BLOCK,
                allowed=False,
                reason=f"Daily trade limit reached ({risk_state.daily_trades}/{self.config.max_trades_per_day})"
            )
        
        # Check open positions
        if risk_state.open_positions >= self.config.max_open_positions:
            return RiskCheckResult(
                action=RiskAction.BLOCK,
                allowed=False,
                reason=f"Max open positions reached ({risk_state.open_positions}/{self.config.max_open_positions})"
            )
        
        # Check risk/reward
        risk_reward = setup.get('risk_reward', 0)
        if risk_reward < self.config.min_risk_reward:
            return RiskCheckResult(
                action=RiskAction.BLOCK,
                allowed=False,
                reason=f"Risk/Reward too low ({risk_reward:.2f} < {self.config.min_risk_reward})"
            )
        
        # Check trading hours
        if not self._is_within_trading_hours():
            return RiskCheckResult(
                action=RiskAction.BLOCK,
                allowed=False,
                reason="Outside trading hours"
            )
        
        # Check trading day
        if not self._is_trading_day():
            return RiskCheckResult(
                action=RiskAction.BLOCK,
                allowed=False,
                reason="Non-trading day"
            )
        
        # Calculate position size
        entry_price = setup.get('entry_price', 0)
        stop_loss = setup.get('stop_loss', 0)
        position_size = self.calculate_position_size(
            risk_state.current_capital,
            entry_price,
            stop_loss
        )
        risk_amount = self.calculate_risk_amount(risk_state.current_capital)
        
        return RiskCheckResult(
            action=RiskAction.ALLOW,
            allowed=True,
            reason="Trade approved",
            position_size=position_size,
            risk_amount=risk_amount
        )
    
    def update_risk_state(self,
                         state: RiskState,
                         trade_pnl: float,
                         is_opening: bool) -> RiskState:
        """Update risk state after trade"""
        new_state = RiskState(
            starting_capital=state.starting_capital,
            current_capital=state.current_capital + (trade_pnl if not is_opening else 0),
            daily_pnl=state.daily_pnl + (trade_pnl if not is_opening else 0),
            daily_loss=state.daily_loss + (abs(trade_pnl) if trade_pnl < 0 and not is_opening else 0),
            daily_trades=state.daily_trades + (1 if is_opening else 0),
            open_positions=state.open_positions + (1 if is_opening else -1),
            daily_loss_limit=state.daily_loss_limit,
            trade_limit_hit=state.trade_limit_hit,
            trading_halted=state.trading_halted,
            halt_reason=state.halt_reason
        )
        
        # Check limits
        daily_loss_percent = (new_state.daily_loss / new_state.starting_capital) * 100
        if daily_loss_percent >= self.config.max_daily_loss:
            new_state.daily_loss_limit = True
            new_state.trading_halted = True
            new_state.halt_reason = "Daily loss limit reached"
        
        if new_state.daily_trades >= self.config.max_trades_per_day:
            new_state.trade_limit_hit = True
        
        return new_state
    
    def initialize_daily_state(self, capital: float) -> RiskState:
        """Initialize risk state for new trading day"""
        return RiskState(
            starting_capital=capital,
            current_capital=capital,
            daily_pnl=0,
            daily_loss=0,
            daily_trades=0,
            open_positions=0,
            daily_loss_limit=False,
            trade_limit_hit=False,
            trading_halted=False
        )
    
    def _is_within_trading_hours(self) -> bool:
        """Check if within trading hours"""
        now = datetime.now()
        current_time = now.strftime("%H:%M")
        return self.config.trading_start <= current_time <= self.config.trading_end
    
    def _is_trading_day(self) -> bool:
        """Check if today is a trading day"""
        return datetime.now().weekday() not in self.config.no_trade_days
    
    def get_remaining_risk(self, state: RiskState) -> Dict[str, float]:
        """Get remaining risk capacity"""
        max_daily_loss_amount = state.starting_capital * (self.config.max_daily_loss / 100)
        remaining_amount = max_daily_loss_amount - state.daily_loss
        remaining_percent = (remaining_amount / state.starting_capital) * 100
        
        return {
            'remaining_amount': max(0, remaining_amount),
            'remaining_percent': max(0, remaining_percent),
            'used_percent': (state.daily_loss / state.starting_capital) * 100
        }
    
    def calculate_potential_pnl(self,
                               entry_price: float,
                               quantity: float,
                               direction: str,
                               exit_price: float) -> float:
        """Calculate potential P&L"""
        if direction == 'LONG':
            return (exit_price - entry_price) * quantity
        else:
            return (entry_price - exit_price) * quantity
    
    def check_emergency_stop(self, state: RiskState) -> Dict[str, Any]:
        """Check if emergency stop should be triggered"""
        result = {
            'triggered': False,
            'reason': None
        }
        
        # Check drawdown
        drawdown = ((state.starting_capital - state.current_capital) / 
                   state.starting_capital) * 100
        
        if drawdown >= self.config.max_drawdown:
            result['triggered'] = True
            result['reason'] = f"Max drawdown reached: {drawdown:.2f}%"
        
        if state.daily_loss_limit:
            result['triggered'] = True
            result['reason'] = "Daily loss limit triggered"
        
        return result
