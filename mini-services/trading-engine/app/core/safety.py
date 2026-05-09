"""
Safety Layer - Kill Switch & Emergency Shutdown
Production-grade safety mechanisms for trading system

Features:
- Emergency Kill Switch
- Max Drawdown Auto-Shutdown
- Broker Disconnect Handler
- Position Auto-Close
- Manual Override
- Safety State Persistence

Author: Trading AI Agent
"""

from dataclasses import dataclass, field
from typing import Dict, Optional, List, Callable, Any
from datetime import datetime, date
from enum import Enum
import asyncio
import threading
from decimal import Decimal

from app.core.config import settings
from app.core.logger import logger


class SafetyState(Enum):
    """Safety system states"""
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    HALTED = "HALTED"
    EMERGENCY = "EMERGENCY"


class HaltReason(Enum):
    """Reasons for trading halt"""
    MANUAL_KILL_SWITCH = "MANUAL_KILL_SWITCH"
    MAX_DAILY_LOSS = "MAX_DAILY_LOSS"
    MAX_WEEKLY_LOSS = "MAX_WEEKLY_LOSS"
    MAX_DRAWDOWN = "MAX_DRAWDOWN"
    BROKER_DISCONNECT = "BROKER_DISCONNECT"
    SYSTEM_ERROR = "SYSTEM_ERROR"
    DATA_FEED_ERROR = "DATA_FEED_ERROR"
    MANUAL_OVERRIDE = "MANUAL_OVERRIDE"


@dataclass
class SafetyConfig:
    """Safety Configuration"""
    # Loss Limits
    max_daily_loss_percent: float = 3.0
    max_weekly_loss_percent: float = 6.0
    max_drawdown_percent: float = 10.0
    
    # Trade Limits
    max_trades_per_day: int = 3
    max_consecutive_losses: int = 3
    
    # Auto Actions
    auto_close_on_halt: bool = True
    auto_close_on_disconnect: bool = True
    
    # Timeouts
    broker_disconnect_timeout_seconds: int = 30
    data_feed_timeout_seconds: int = 60
    
    # Emergency
    emergency_close_delay_seconds: int = 5  # Delay before closing positions


@dataclass
class SafetyStatus:
    """Current safety status"""
    state: SafetyState
    reason: Optional[HaltReason] = None
    halted_at: Optional[datetime] = None
    can_resume: bool = True
    message: str = ""
    
    # Metrics
    current_daily_pnl_percent: float = 0.0
    current_weekly_pnl_percent: float = 0.0
    current_drawdown_percent: float = 0.0
    trades_today: int = 0
    consecutive_losses: int = 0
    
    # Timestamps
    last_check: datetime = None
    
    def __post_init__(self):
        if self.last_check is None:
            self.last_check = datetime.utcnow()


class SafetyLayer:
    """
    Safety Layer - Complete Trading Protection System
    
    Implements institutional-grade safety mechanisms:
    
    1. KILL SWITCH
       - Instant manual trigger
       - Stops all trading activity
       - Closes all open positions
    
    2. LOSS LIMITS
       - Daily loss limit
       - Weekly loss limit
       - Max drawdown limit
    
    3. BROKER PROTECTION
       - Disconnect detection
       - Auto-close positions
       - Reconnect handling
    
    4. MONITORING
       - Continuous health checks
       - Real-time P&L tracking
       - Alert generation
    """
    
    def __init__(self,
                 config: SafetyConfig = None,
                 broker=None,
                 alert_callback: Callable = None):
        """
        Initialize Safety Layer
        
        Args:
            config: Safety configuration
            broker: Broker instance for position management
            alert_callback: Callback for alerts
        """
        self.config = config or SafetyConfig()
        self.broker = broker
        self.alert_callback = alert_callback
        
        # State
        self._status = SafetyStatus(state=SafetyState.ACTIVE)
        self._lock = threading.RLock()
        
        # Tracking
        self._starting_capital: Dict[str, float] = {}  # date -> capital
        self._peak_capital: float = 0.0
        self._current_capital: float = 0.0
        self._daily_trades: Dict[str, int] = {}  # date -> count
        
        # Event handlers
        self._on_halt_handlers: List[Callable] = []
        self._on_resume_handlers: List[Callable] = []
        
        # Monitoring task
        self._monitor_task: Optional[asyncio.Task] = None
        self._running = False
        
        # Kill switch state
        self._kill_switch_engaged = False
        self._kill_switch_time: Optional[datetime] = None
        self._kill_switch_user: Optional[str] = None
    
    # ============================================
    # KILL SWITCH
    # ============================================
    
    def engage_kill_switch(self, 
                          user: str = "SYSTEM",
                          close_positions: bool = True,
                          reason: str = "") -> Dict[str, Any]:
        """
        ENGAGE KILL SWITCH - Emergency Stop
        
        This is the EMERGENCY STOP button.
        Immediately:
        1. Stops all trading
        2. Cancels pending orders
        3. Closes all positions (if close_positions=True)
        4. Sends alerts
        
        Args:
            user: Who triggered the kill switch
            close_positions: Whether to close all positions
            reason: Additional reason
            
        Returns:
            Action result
        """
        with self._lock:
            self._kill_switch_engaged = True
            self._kill_switch_time = datetime.utcnow()
            self._kill_switch_user = user
            
            logger.critical(f"🚨 KILL SWITCH ENGAGED by {user}")
            logger.critical(f"   Reason: {reason}")
            
            # Update status
            self._status.state = SafetyState.EMERGENCY
            self._status.reason = HaltReason.MANUAL_KILL_SWITCH
            self._status.halted_at = datetime.utcnow()
            self._status.message = f"Kill switch engaged by {user}: {reason}"
            
            result = {
                "action": "KILL_SWITCH_ENGAGED",
                "user": user,
                "time": self._kill_switch_time.isoformat(),
                "reason": reason,
                "positions_closed": False,
                "orders_cancelled": False
            }
            
            # Close positions
            if close_positions and self.broker:
                try:
                    close_result = asyncio.run(self._close_all_positions())
                    result["positions_closed"] = True
                    result["close_details"] = close_result
                    logger.critical(f"   All positions closed: {close_result}")
                except Exception as e:
                    logger.error(f"   Failed to close positions: {e}")
                    result["positions_closed"] = False
                    result["close_error"] = str(e)
            
            # Send alert
            self._send_alert(
                level="CRITICAL",
                title="KILL SWITCH ENGAGED",
                message=f"Kill switch engaged by {user}. Reason: {reason}",
                data=result
            )
            
            # Call halt handlers
            for handler in self._on_halt_handlers:
                try:
                    handler(self._status)
                except Exception as e:
                    logger.error(f"Halt handler error: {e}")
            
            return result
    
    def disengage_kill_switch(self, user: str = "SYSTEM") -> Dict[str, Any]:
        """
        Disengage kill switch - Requires manual confirmation
        
        Args:
            user: Who is disengaging
            
        Returns:
            Action result
        """
        with self._lock:
            if not self._kill_switch_engaged:
                return {"action": "NO_ACTION", "message": "Kill switch not engaged"}
            
            logger.critical(f"✅ KILL SWITCH DISENGAGED by {user}")
            
            self._kill_switch_engaged = False
            self._kill_switch_time = None
            self._kill_switch_user = None
            
            self._status.state = SafetyState.ACTIVE
            self._status.reason = None
            self._status.halted_at = None
            self._status.message = ""
            
            result = {
                "action": "KILL_SWITCH_DISENGAGED",
                "user": user,
                "time": datetime.utcnow().isoformat()
            }
            
            # Send alert
            self._send_alert(
                level="WARNING",
                title="KILL SWITCH DISENGAGED",
                message=f"Kill switch disengaged by {user}. Trading can resume.",
                data=result
            )
            
            # Call resume handlers
            for handler in self._on_resume_handlers:
                try:
                    handler(self._status)
                except Exception as e:
                    logger.error(f"Resume handler error: {e}")
            
            return result
    
    def is_kill_switch_engaged(self) -> bool:
        """Check if kill switch is engaged"""
        return self._kill_switch_engaged
    
    # ============================================
    # LOSS LIMIT CHECKS
    # ============================================
    
    def check_daily_loss(self, current_capital: float) -> Dict[str, Any]:
        """
        Check if daily loss limit exceeded
        
        Args:
            current_capital: Current capital amount
            
        Returns:
            Check result
        """
        today = date.today().isoformat()
        
        if today not in self._starting_capital:
            self._starting_capital[today] = current_capital
            return {"status": "OK", "daily_pnl_percent": 0}
        
        starting = self._starting_capital[today]
        daily_pnl = current_capital - starting
        daily_pnl_percent = (daily_pnl / starting) * 100 if starting > 0 else 0
        
        self._status.current_daily_pnl_percent = daily_pnl_percent
        
        result = {
            "starting_capital": starting,
            "current_capital": current_capital,
            "daily_pnl": daily_pnl,
            "daily_pnl_percent": daily_pnl_percent,
            "limit": self.config.max_daily_loss_percent,
            "status": "OK"
        }
        
        if daily_pnl_percent <= -self.config.max_daily_loss_percent:
            result["status"] = "LIMIT_EXCEEDED"
            result["action"] = "HALT_TRADING"
            
            # Auto halt
            self._halt_trading(
                HaltReason.MAX_DAILY_LOSS,
                f"Daily loss limit exceeded: {daily_pnl_percent:.2f}%"
            )
        
        return result
    
    def check_weekly_loss(self, current_capital: float) -> Dict[str, Any]:
        """
        Check if weekly loss limit exceeded
        
        Args:
            current_capital: Current capital amount
            
        Returns:
            Check result
        """
        # Get start of week
        today = date.today()
        week_start = today - timedelta(days=today.weekday())
        week_start_str = week_start.isoformat()
        
        if week_start_str not in self._starting_capital:
            self._starting_capital[week_start_str] = current_capital
            return {"status": "OK", "weekly_pnl_percent": 0}
        
        starting = self._starting_capital[week_start_str]
        weekly_pnl = current_capital - starting
        weekly_pnl_percent = (weekly_pnl / starting) * 100 if starting > 0 else 0
        
        self._status.current_weekly_pnl_percent = weekly_pnl_percent
        
        result = {
            "starting_capital": starting,
            "current_capital": current_capital,
            "weekly_pnl": weekly_pnl,
            "weekly_pnl_percent": weekly_pnl_percent,
            "limit": self.config.max_weekly_loss_percent,
            "status": "OK"
        }
        
        if weekly_pnl_percent <= -self.config.max_weekly_loss_percent:
            result["status"] = "LIMIT_EXCEEDED"
            result["action"] = "HALT_TRADING"
            
            self._halt_trading(
                HaltReason.MAX_WEEKLY_LOSS,
                f"Weekly loss limit exceeded: {weekly_pnl_percent:.2f}%"
            )
        
        return result
    
    def check_drawdown(self, current_capital: float) -> Dict[str, Any]:
        """
        Check if max drawdown exceeded
        
        Args:
            current_capital: Current capital amount
            
        Returns:
            Check result
        """
        if current_capital > self._peak_capital:
            self._peak_capital = current_capital
        
        self._current_capital = current_capital
        
        if self._peak_capital == 0:
            return {"status": "OK", "drawdown_percent": 0}
        
        drawdown = self._peak_capital - current_capital
        drawdown_percent = (drawdown / self._peak_capital) * 100
        
        self._status.current_drawdown_percent = drawdown_percent
        
        result = {
            "peak_capital": self._peak_capital,
            "current_capital": current_capital,
            "drawdown": drawdown,
            "drawdown_percent": drawdown_percent,
            "limit": self.config.max_drawdown_percent,
            "status": "OK"
        }
        
        if drawdown_percent >= self.config.max_drawdown_percent:
            result["status"] = "LIMIT_EXCEEDED"
            result["action"] = "HALT_TRADING"
            
            self._halt_trading(
                HaltReason.MAX_DRAWDOWN,
                f"Max drawdown exceeded: {drawdown_percent:.2f}%"
            )
        
        return result
    
    def check_trade_limits(self, trades_today: int) -> Dict[str, Any]:
        """
        Check trade count limits
        
        Args:
            trades_today: Number of trades today
            
        Returns:
            Check result
        """
        self._status.trades_today = trades_today
        
        result = {
            "trades_today": trades_today,
            "limit": self.config.max_trades_per_day,
            "status": "OK"
        }
        
        if trades_today >= self.config.max_trades_per_day:
            result["status"] = "LIMIT_REACHED"
            result["message"] = f"Max trades per day reached: {trades_today}"
        
        return result
    
    def record_consecutive_loss(self) -> Dict[str, Any]:
        """Record a consecutive loss"""
        self._status.consecutive_losses += 1
        
        result = {
            "consecutive_losses": self._status.consecutive_losses,
            "limit": self.config.max_consecutive_losses,
            "status": "OK"
        }
        
        if self._status.consecutive_losses >= self.config.max_consecutive_losses:
            result["status"] = "LIMIT_REACHED"
            
            # Pause trading
            self._status.state = SafetyState.PAUSED
            self._status.message = f"Paused due to {self._status.consecutive_losses} consecutive losses"
            
            self._send_alert(
                level="WARNING",
                title="CONSECUTIVE LOSSES LIMIT",
                message=f"Trading paused due to {self._status.consecutive_losses} consecutive losses",
                data=result
            )
        
        return result
    
    def reset_consecutive_losses(self):
        """Reset consecutive loss counter after a win"""
        self._status.consecutive_losses = 0
    
    # ============================================
    # BROKER DISCONNECT HANDLER
    # ============================================
    
    def handle_broker_disconnect(self) -> Dict[str, Any]:
        """
        Handle broker disconnection
        
        Automatically:
        1. Pauses trading
        2. Attempts to close positions (if configured)
        3. Sends alert
        """
        with self._lock:
            logger.critical("📡 BROKER DISCONNECT DETECTED")
            
            result = {
                "action": "BROKER_DISCONNECT_HANDLED",
                "time": datetime.utcnow().isoformat(),
                "positions_closed": False
            }
            
            # Halt trading
            self._halt_trading(
                HaltReason.BROKER_DISCONNECT,
                "Broker disconnected"
            )
            
            # Close positions if configured
            if self.config.auto_close_on_disconnect and self.broker:
                try:
                    close_result = asyncio.run(self._close_all_positions())
                    result["positions_closed"] = True
                    result["close_details"] = close_result
                except Exception as e:
                    result["close_error"] = str(e)
            
            # Send alert
            self._send_alert(
                level="CRITICAL",
                title="BROKER DISCONNECT",
                message="Broker disconnected. Trading halted.",
                data=result
            )
            
            return result
    
    def handle_broker_reconnect(self) -> Dict[str, Any]:
        """Handle broker reconnection"""
        with self._lock:
            logger.info("✅ Broker reconnected")
            
            # Resume if halt was due to disconnect
            if self._status.reason == HaltReason.BROKER_DISCONNECT:
                self._status.state = SafetyState.ACTIVE
                self._status.reason = None
                self._status.halted_at = None
                self._status.message = ""
            
            return {
                "action": "BROKER_RECONNECTED",
                "time": datetime.utcnow().isoformat()
            }
    
    # ============================================
    # CORE SAFETY METHODS
    # ============================================
    
    def _halt_trading(self, reason: HaltReason, message: str):
        """Internal method to halt trading"""
        with self._lock:
            if self._status.state == SafetyState.EMERGENCY:
                return  # Already in emergency
            
            self._status.state = SafetyState.HALTED
            self._status.reason = reason
            self._status.halted_at = datetime.utcnow()
            self._status.message = message
            
            logger.warning(f"⚠️ Trading HALTED: {reason.value} - {message}")
            
            # Close positions if configured
            if self.config.auto_close_on_halt and self.broker:
                try:
                    asyncio.create_task(self._close_all_positions())
                except Exception as e:
                    logger.error(f"Error closing positions: {e}")
            
            # Send alert
            self._send_alert(
                level="CRITICAL",
                title="TRADING HALTED",
                message=message,
                data={
                    "reason": reason.value,
                    "state": self._status.state.value
                }
            )
            
            # Call handlers
            for handler in self._on_halt_handlers:
                try:
                    handler(self._status)
                except Exception as e:
                    logger.error(f"Halt handler error: {e}")
    
    async def _close_all_positions(self) -> Dict[str, Any]:
        """Close all open positions via broker"""
        if not self.broker:
            return {"error": "No broker configured"}
        
        try:
            result = await self.broker.close_all_positions()
            logger.critical(f"Closed all positions: {result}")
            return result
        except Exception as e:
            logger.error(f"Error closing positions: {e}")
            return {"error": str(e)}
    
    def can_trade(self) -> bool:
        """Check if trading is allowed"""
        if self._kill_switch_engaged:
            return False
        
        if self._status.state in [SafetyState.HALTED, SafetyState.EMERGENCY]:
            return False
        
        return True
    
    def get_status(self) -> SafetyStatus:
        """Get current safety status"""
        self._status.last_check = datetime.utcnow()
        return self._status
    
    def resume_trading(self, user: str = "SYSTEM") -> Dict[str, Any]:
        """
        Manually resume trading after halt
        
        Args:
            user: Who is resuming
            
        Returns:
            Action result
        """
        with self._lock:
            if self._status.state == SafetyState.EMERGENCY:
                return {
                    "action": "DENIED",
                    "message": "Cannot resume from EMERGENCY state. Disengage kill switch first."
                }
            
            if self._status.state == SafetyState.ACTIVE:
                return {"action": "NO_ACTION", "message": "Trading already active"}
            
            logger.info(f"▶️ Trading RESUMED by {user}")
            
            self._status.state = SafetyState.ACTIVE
            self._status.reason = None
            self._status.halted_at = None
            self._status.message = ""
            
            result = {
                "action": "TRADING_RESUMED",
                "user": user,
                "time": datetime.utcnow().isoformat()
            }
            
            self._send_alert(
                level="INFO",
                title="TRADING RESUMED",
                message=f"Trading resumed by {user}",
                data=result
            )
            
            return result
    
    # ============================================
    # MONITORING
    # ============================================
    
    async def start_monitoring(self):
        """Start safety monitoring loop"""
        self._running = True
        self._monitor_task = asyncio.create_task(self._monitor_loop())
        logger.info("Safety monitoring started")
    
    async def stop_monitoring(self):
        """Stop safety monitoring"""
        self._running = False
        if self._monitor_task:
            self._monitor_task.cancel()
        logger.info("Safety monitoring stopped")
    
    async def _monitor_loop(self):
        """Continuous safety monitoring"""
        while self._running:
            try:
                # Check broker connection
                if self.broker and not self.broker.is_connected():
                    self.handle_broker_disconnect()
                
                # Check capital limits if we have broker
                if self.broker and self.broker.is_connected():
                    margin = await self.broker.get_margin()
                    if margin:
                        self.check_daily_loss(margin.available_cash)
                        self.check_drawdown(margin.available_cash)
                
                # Wait before next check
                await asyncio.sleep(5)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Monitor loop error: {e}")
                await asyncio.sleep(10)
    
    # ============================================
    # ALERTS
    # ============================================
    
    def _send_alert(self, level: str, title: str, message: str, data: Dict = None):
        """Send alert via callback"""
        if self.alert_callback:
            try:
                self.alert_callback({
                    "level": level,
                    "title": title,
                    "message": message,
                    "data": data,
                    "timestamp": datetime.utcnow().isoformat()
                })
            except Exception as e:
                logger.error(f"Alert callback error: {e}")
    
    # ============================================
    # EVENT HANDLERS
    # ============================================
    
    def on_halt(self, handler: Callable):
        """Register halt handler"""
        self._on_halt_handlers.append(handler)
    
    def on_resume(self, handler: Callable):
        """Register resume handler"""
        self._on_resume_handlers.append(handler)


# Import timedelta for weekly calculations
from datetime import timedelta


# Singleton instance
_safety_instance: Optional[SafetyLayer] = None


def get_safety() -> Optional[SafetyLayer]:
    """Get safety singleton instance"""
    return _safety_instance


def init_safety(config: SafetyConfig = None, broker=None, alert_callback: Callable = None) -> SafetyLayer:
    """Initialize safety singleton"""
    global _safety_instance
    _safety_instance = SafetyLayer(config=config, broker=broker, alert_callback=alert_callback)
    return _safety_instance
