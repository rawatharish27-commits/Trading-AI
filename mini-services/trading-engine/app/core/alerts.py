"""
Alert System - Telegram Notifications
Real-time alerts for trading system

Features:
- Telegram Bot integration
- Multi-level alerts (INFO, WARNING, CRITICAL)
- Trade notifications
- System alerts
- Daily reports
- Rich message formatting

Author: Trading AI Agent
"""

from dataclasses import dataclass
from typing import Optional, Dict, Any, List, Callable
from datetime import datetime, timedelta
from enum import Enum
import asyncio
import httpx
import json

from app.core.config import settings
from app.core.logger import logger


class AlertLevel(Enum):
    """Alert severity levels"""
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"
    TRADE = "TRADE"
    SYSTEM = "SYSTEM"


@dataclass
class TelegramConfig:
    """Telegram Bot Configuration"""
    bot_token: str
    chat_id: str
    enabled: bool = True
    
    # Rate limiting
    max_alerts_per_minute: int = 10
    min_interval_seconds: int = 5


@dataclass
class Alert:
    """Alert Object"""
    level: AlertLevel
    title: str
    message: str
    data: Optional[Dict[str, Any]] = None
    timestamp: datetime = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.utcnow()


class TelegramAlerts:
    """
    Telegram Alert System
    
    Provides real-time notifications for:
    - Trade executions
    - System events
    - Risk alerts
    - Daily reports
    
    Setup:
    1. Create bot via @BotFather
    2. Get bot token
    3. Get chat ID (message @userinfobot)
    """
    
    # Emoji mapping
    EMOJI = {
        AlertLevel.INFO: "ℹ️",
        AlertLevel.WARNING: "⚠️",
        AlertLevel.CRITICAL: "🚨",
        AlertLevel.TRADE: "📈",
        AlertLevel.SYSTEM: "🔧"
    }
    
    # API URL
    TELEGRAM_API = "https://api.telegram.org/bot{token}/{method}"
    
    def __init__(self, config: TelegramConfig):
        """
        Initialize Telegram Alerts
        
        Args:
            config: Telegram configuration with bot token and chat ID
        """
        self.config = config
        self.enabled = config.enabled and bool(config.bot_token) and bool(config.chat_id)
        
        # Rate limiting
        self._last_sent: Dict[str, datetime] = {}
        self._alert_count = 0
        
        # History
        self._history: List[Alert] = []
        self._max_history = 100
        
        # Callbacks
        self._alert_callbacks: List[Callable] = []
    
    def is_configured(self) -> bool:
        """Check if Telegram is properly configured"""
        return self.enabled
    
    async def send_message(self, text: str, parse_mode: str = "HTML") -> bool:
        """
        Send message to Telegram
        
        Args:
            text: Message text (supports HTML formatting)
            parse_mode: HTML or Markdown
            
        Returns:
            True if sent successfully
        """
        if not self.enabled:
            logger.debug("Telegram alerts disabled or not configured")
            return False
        
        url = self.TELEGRAM_API.format(token=self.config.bot_token, method="sendMessage")
        
        payload = {
            "chat_id": self.config.chat_id,
            "text": text,
            "parse_mode": parse_mode
        }
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(url, json=payload)
                
                if response.status_code == 200:
                    self._alert_count += 1
                    return True
                else:
                    logger.error(f"Telegram API error: {response.status_code} - {response.text}")
                    return False
                    
        except Exception as e:
            logger.error(f"Telegram send error: {e}")
            return False
    
    async def send_alert(self, alert: Alert) -> bool:
        """
        Send formatted alert
        
        Args:
            alert: Alert object
            
        Returns:
            True if sent successfully
        """
        # Store in history
        self._history.append(alert)
        if len(self._history) > self._max_history:
            self._history = self._history[-self._max_history:]
        
        # Call callbacks
        for callback in self._alert_callbacks:
            try:
                callback(alert)
            except Exception as e:
                logger.error(f"Alert callback error: {e}")
        
        # Format message
        emoji = self.EMOJI.get(alert.level, "📢")
        
        message = f"""
{emoji} <b>{alert.title}</b>

{alert.message}

⏰ {alert.timestamp.strftime('%Y-%m-%d %H:%M:%S UTC')}
"""
        
        # Add data if present
        if alert.data:
            message += "\n<b>Details:</b>\n"
            for key, value in alert.data.items():
                if isinstance(value, (dict, list)):
                    value = json.dumps(value, indent=2)
                message += f"• {key}: {value}\n"
        
        return await self.send_message(message)
    
    async def send_trade_alert(self,
                               action: str,
                               symbol: str,
                               direction: str,
                               quantity: float,
                               price: float,
                               pnl: float = None,
                               additional: Dict = None) -> bool:
        """
        Send trade execution alert
        
        Args:
            action: OPENED, CLOSED, MODIFIED
            symbol: Stock symbol
            direction: LONG, SHORT
            quantity: Position size
            price: Entry/Exit price
            pnl: Profit/Loss (for closed trades)
            additional: Additional info
        """
        emoji = "🟢" if direction == "LONG" else "🔴"
        pnl_emoji = "💰" if pnl and pnl > 0 else "💸" if pnl else ""
        
        message = f"""
{emoji} <b>TRADE {action}</b>

<b>Symbol:</b> {symbol}
<b>Direction:</b> {direction}
<b>Quantity:</b> {quantity}
<b>Price:</b> ₹{price:.2f}
"""
        
        if pnl is not None:
            message += f"\n<b>P&L:</b> {pnl_emoji} ₹{pnl:.2f}"
        
        if additional:
            message += "\n"
            for key, value in additional.items():
                message += f"<b>{key}:</b> {value}\n"
        
        alert = Alert(
            level=AlertLevel.TRADE,
            title=f"Trade {action}",
            message=f"{direction} {quantity} {symbol} @ ₹{price:.2f}",
            data={"pnl": pnl, **(additional or {})}
        )
        
        return await self.send_message(message)
    
    async def send_system_alert(self,
                                title: str,
                                message: str,
                                level: AlertLevel = AlertLevel.SYSTEM,
                                data: Dict = None) -> bool:
        """
        Send system alert
        
        Args:
            title: Alert title
            message: Alert message
            level: Alert level
            data: Additional data
        """
        alert = Alert(
            level=level,
            title=title,
            message=message,
            data=data
        )
        
        return await self.send_alert(alert)
    
    async def send_risk_alert(self,
                              risk_type: str,
                              current_value: float,
                              limit_value: float,
                              action_taken: str = None) -> bool:
        """
        Send risk management alert
        
        Args:
            risk_type: DAILY_LOSS, WEEKLY_LOSS, DRAWDOWN, etc.
            current_value: Current value
            limit_value: Limit value
            action_taken: Action taken (if any)
        """
        alert = Alert(
            level=AlertLevel.WARNING,
            title=f"⚠️ RISK ALERT: {risk_type}",
            message=f"Current: {current_value:.2f}%\nLimit: {limit_value:.2f}%",
            data={"action": action_taken} if action_taken else None
        )
        
        return await self.send_alert(alert)
    
    async def send_daily_report(self,
                               stats: Dict[str, Any],
                               trades: List[Dict] = None) -> bool:
        """
        Send daily trading report
        
        Args:
            stats: Trading statistics
            trades: List of today's trades
        """
        # Calculate emoji for P&L
        pnl = stats.get('total_pnl', 0)
        pnl_emoji = "🟢" if pnl >= 0 else "🔴"
        win_rate = stats.get('win_rate', 0)
        wr_emoji = "✅" if win_rate >= 50 else "⚠️"
        
        message = f"""
📊 <b>DAILY TRADING REPORT</b>
📅 {datetime.utcnow().strftime('%Y-%m-%d')}

<b>━━━ SUMMARY ━━━</b>
{pnl_emoji} <b>P&L:</b> ₹{pnl:.2f}
{wr_emoji} <b>Win Rate:</b> {win_rate:.1f}%
📈 <b>Trades:</b> {stats.get('total_trades', 0)}
🎯 <b>Best Trade:</b> ₹{stats.get('best_trade', 0):.2f}
📉 <b>Worst Trade:</b> ₹{stats.get('worst_trade', 0):.2f}

<b>━━━ METRICS ━━━</b>
💰 <b>Starting Capital:</b> ₹{stats.get('starting_capital', 0):,.0f}
💵 <b>Current Capital:</b> ₹{stats.get('current_capital', 0):,.0f}
📉 <b>Max Drawdown:</b> {stats.get('max_drawdown', 0):.2f}%
⚡ <b>Expectancy:</b> ₹{stats.get('expectancy', 0):.2f}
"""
        
        # Add trades if provided
        if trades:
            message += "\n<b>━━━ TRADES ━━━</b>\n"
            for trade in trades[:5]:  # Show last 5 trades
                t_emoji = "🟢" if trade.get('pnl', 0) >= 0 else "🔴"
                message += f"{t_emoji} {trade.get('symbol', 'N/A')} {trade.get('direction', 'N/A')}: ₹{trade.get('pnl', 0):.2f}\n"
        
        return await self.send_message(message)
    
    async def send_startup_notification(self, version: str = "1.0.0"):
        """Send system startup notification"""
        message = f"""
🚀 <b>TRADING AI AGENT STARTED</b>

📅 <b>Time:</b> {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}
📌 <b>Version:</b> {version}
⚙️ <b>Mode:</b> {"PAPER TRADING" if settings.PAPER_TRADING else "LIVE TRADING"}
📊 <b>Risk Config:</b>
• Max Risk/Trade: {settings.MAX_RISK_PER_TRADE}%
• Max Daily Loss: {settings.MAX_DAILY_LOSS}%
• Max Trades/Day: {settings.MAX_TRADES_PER_DAY}

<i>System is ready for trading.</i>
"""
        return await self.send_message(message)
    
    async def send_shutdown_notification(self, reason: str = "Manual"):
        """Send system shutdown notification"""
        message = f"""
🛑 <b>TRADING AI AGENT STOPPED</b>

📅 <b>Time:</b> {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}
📝 <b>Reason:</b> {reason}

<i>Trading system has been shut down.</i>
"""
        return await self.send_message(message)
    
    async def send_kill_switch_alert(self,
                                     engaged: bool,
                                     user: str = "SYSTEM",
                                     reason: str = ""):
        """Send kill switch alert"""
        if engaged:
            message = f"""
🚨 <b>KILL SWITCH ENGAGED</b>

👤 <b>User:</b> {user}
⏰ <b>Time:</b> {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}
📝 <b>Reason:</b> {reason}

<b>⚠️ ALL TRADING STOPPED</b>
<i>All positions have been closed.</i>
"""
        else:
            message = f"""
✅ <b>KILL SWITCH DISENGAGED</b>

👤 <b>User:</b> {user}
⏰ <b>Time:</b> {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}

<i>Trading can now resume.</i>
"""
        return await self.send_message(message)
    
    def get_history(self, limit: int = 20) -> List[Alert]:
        """Get alert history"""
        return self._history[-limit:]
    
    def on_alert(self, callback: Callable):
        """Register alert callback"""
        self._alert_callbacks.append(callback)
    
    async def test_connection(self) -> Dict[str, Any]:
        """Test Telegram connection"""
        if not self.enabled:
            return {"status": False, "message": "Telegram not configured"}
        
        try:
            result = await self.send_message("🔧 Test message from Trading AI Agent")
            return {
                "status": result,
                "message": "Connection successful" if result else "Failed to send message"
            }
        except Exception as e:
            return {"status": False, "message": str(e)}


class ConsoleAlerts:
    """
    Console Alert System - Fallback when Telegram not configured
    
    Prints alerts to console with formatting
    """
    
    EMOJI = {
        AlertLevel.INFO: "ℹ️",
        AlertLevel.WARNING: "⚠️",
        AlertLevel.CRITICAL: "🚨",
        AlertLevel.TRADE: "📈",
        AlertLevel.SYSTEM: "🔧"
    }
    
    def __init__(self):
        self._history: List[Alert] = []
        self._max_history = 100
    
    async def send_alert(self, alert: Alert) -> bool:
        """Print alert to console"""
        emoji = self.EMOJI.get(alert.level, "📢")
        
        print(f"\n{emoji} {alert.title}")
        print(f"   {alert.message}")
        print(f"   ⏰ {alert.timestamp.strftime('%Y-%m-%d %H:%M:%S')}")
        
        if alert.data:
            print(f"   📊 {json.dumps(alert.data, indent=2)}")
        
        self._history.append(alert)
        if len(self._history) > self._max_history:
            self._history = self._history[-self._max_history:]
        
        return True
    
    async def send_trade_alert(self, **kwargs) -> bool:
        """Send trade alert"""
        alert = Alert(
            level=AlertLevel.TRADE,
            title=f"Trade {kwargs.get('action', 'UNKNOWN')}",
            message=f"{kwargs.get('direction', 'N/A')} {kwargs.get('quantity', 0)} {kwargs.get('symbol', 'N/A')} @ ₹{kwargs.get('price', 0):.2f}"
        )
        return await self.send_alert(alert)
    
    async def send_system_alert(self, title: str, message: str, level: AlertLevel = AlertLevel.SYSTEM, data: Dict = None) -> bool:
        """Send system alert"""
        alert = Alert(level=level, title=title, message=message, data=data)
        return await self.send_alert(alert)
    
    def get_history(self, limit: int = 20) -> List[Alert]:
        """Get alert history"""
        return self._history[-limit:]


class AlertManager:
    """
    Unified Alert Manager
    
    Manages multiple alert channels:
    - Telegram (primary)
    - Console (fallback)
    - Custom callbacks
    """
    
    def __init__(self,
                 telegram_config: TelegramConfig = None,
                 use_console: bool = True):
        """
        Initialize Alert Manager
        
        Args:
            telegram_config: Telegram configuration (optional)
            use_console: Use console alerts as fallback
        """
        self.telegram = TelegramAlerts(telegram_config) if telegram_config else None
        self.console = ConsoleAlerts() if use_console else None
        
        self._callbacks: List[Callable] = []
    
    async def send_alert(self, alert: Alert) -> bool:
        """Send alert through all channels"""
        results = []
        
        if self.telegram:
            results.append(await self.telegram.send_alert(alert))
        
        if self.console:
            results.append(await self.console.send_alert(alert))
        
        # Call callbacks
        for callback in self._callbacks:
            try:
                callback(alert)
            except Exception as e:
                logger.error(f"Alert callback error: {e}")
        
        return any(results)
    
    async def trade_alert(self, **kwargs) -> bool:
        """Send trade alert"""
        results = []
        
        if self.telegram:
            results.append(await self.telegram.send_trade_alert(**kwargs))
        
        if self.console:
            results.append(await self.console.send_trade_alert(**kwargs))
        
        return any(results)
    
    async def system_alert(self, title: str, message: str, level: AlertLevel = AlertLevel.SYSTEM, data: Dict = None) -> bool:
        """Send system alert"""
        alert = Alert(level=level, title=title, message=message, data=data)
        return await self.send_alert(alert)
    
    def on_alert(self, callback: Callable):
        """Register alert callback"""
        self._callbacks.append(callback)


# Singleton instance
_alert_manager: Optional[AlertManager] = None


def get_alerts() -> Optional[AlertManager]:
    """Get alert manager singleton"""
    return _alert_manager


def init_alerts(telegram_token: str = None,
               telegram_chat_id: str = None,
               use_console: bool = True) -> AlertManager:
    """Initialize alert manager singleton"""
    global _alert_manager
    
    telegram_config = None
    if telegram_token and telegram_chat_id:
        telegram_config = TelegramConfig(
            bot_token=telegram_token,
            chat_id=telegram_chat_id
        )
    
    _alert_manager = AlertManager(telegram_config=telegram_config, use_console=use_console)
    return _alert_manager
