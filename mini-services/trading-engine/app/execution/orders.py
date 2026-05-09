"""
Execution Engine - Order Management & Position Tracking
Broker integration and order execution

Author: Trading AI Agent
"""

from dataclasses import dataclass
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum
import asyncio


class OrderStatus(Enum):
    PENDING = "PENDING"
    PLACED = "PLACED"
    EXECUTED = "EXECUTED"
    CANCELLED = "CANCELLED"
    REJECTED = "REJECTED"


class OrderType(Enum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"
    SL = "SL"  # Stop Loss
    SL_M = "SL-M"  # Stop Loss Market


@dataclass
class Order:
    """Order Object"""
    order_id: str
    symbol: str
    order_type: OrderType
    side: str  # BUY, SELL
    quantity: float
    price: Optional[float]
    trigger_price: Optional[float]
    status: OrderStatus
    filled_quantity: float = 0
    avg_price: float = 0
    broker_order_id: Optional[str] = None
    created_at: datetime = None
    updated_at: datetime = None
    
    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.utcnow()


@dataclass
class Position:
    """Open Position"""
    symbol: str
    direction: str  # LONG, SHORT
    quantity: float
    entry_price: float
    current_price: float
    stop_loss: float
    take_profit: Optional[float]
    pnl: float
    pnl_percent: float
    opened_at: datetime


class OrderManager:
    """
    Order Management System
    
    Handles:
    - Order placement
    - Order tracking
    - Position management
    """
    
    def __init__(self, paper_trading: bool = True):
        self.paper_trading = paper_trading
        self.orders: Dict[str, Order] = {}
        self.positions: Dict[str, Position] = {}
        self._order_counter = 0
    
    def generate_order_id(self) -> str:
        """Generate unique order ID"""
        self._order_counter += 1
        return f"ORD_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{self._order_counter}"
    
    def place_order(self,
                   symbol: str,
                   side: str,
                   quantity: float,
                   order_type: OrderType = OrderType.MARKET,
                   price: Optional[float] = None,
                   trigger_price: Optional[float] = None) -> Order:
        """
        Place new order
        
        Args:
            symbol: Stock symbol
            side: BUY or SELL
            quantity: Order quantity
            order_type: MARKET, LIMIT, SL, SL-M
            price: Limit price (for LIMIT orders)
            trigger_price: Trigger price (for SL orders)
        
        Returns:
            Order object
        """
        order = Order(
            order_id=self.generate_order_id(),
            symbol=symbol,
            order_type=order_type,
            side=side,
            quantity=quantity,
            price=price,
            trigger_price=trigger_price,
            status=OrderStatus.PENDING
        )
        
        # In paper trading, immediately execute
        if self.paper_trading:
            order.status = OrderStatus.EXECUTED
            order.filled_quantity = quantity
            order.avg_price = price or trigger_price or 0
            order.updated_at = datetime.utcnow()
        
        self.orders[order.order_id] = order
        
        return order
    
    def cancel_order(self, order_id: str) -> bool:
        """Cancel pending order"""
        if order_id in self.orders:
            order = self.orders[order_id]
            if order.status == OrderStatus.PENDING:
                order.status = OrderStatus.CANCELLED
                order.updated_at = datetime.utcnow()
                return True
        return False
    
    def get_order(self, order_id: str) -> Optional[Order]:
        """Get order by ID"""
        return self.orders.get(order_id)
    
    def get_pending_orders(self) -> List[Order]:
        """Get all pending orders"""
        return [o for o in self.orders.values() if o.status == OrderStatus.PENDING]
    
    def update_position(self,
                       symbol: str,
                       direction: str,
                       quantity: float,
                       entry_price: float,
                       stop_loss: float,
                       take_profit: Optional[float] = None) -> Position:
        """Update or create position"""
        position = Position(
            symbol=symbol,
            direction=direction,
            quantity=quantity,
            entry_price=entry_price,
            current_price=entry_price,
            stop_loss=stop_loss,
            take_profit=take_profit,
            pnl=0,
            pnl_percent=0,
            opened_at=datetime.utcnow()
        )
        
        self.positions[symbol] = position
        return position
    
    def close_position(self, symbol: str, exit_price: float) -> Optional[Position]:
        """Close position and calculate P&L"""
        if symbol not in self.positions:
            return None
        
        position = self.positions[symbol]
        
        # Calculate P&L
        if position.direction == 'LONG':
            pnl = (exit_price - position.entry_price) * position.quantity
        else:
            pnl = (position.entry_price - exit_price) * position.quantity
        
        pnl_percent = (pnl / (position.entry_price * position.quantity)) * 100
        
        position.pnl = pnl
        position.pnl_percent = pnl_percent
        position.current_price = exit_price
        
        # Remove from active positions
        del self.positions[symbol]
        
        return position
    
    def get_open_positions(self) -> List[Position]:
        """Get all open positions"""
        return list(self.positions.values())
    
    def update_position_prices(self, prices: Dict[str, float]):
        """Update current prices for all positions"""
        for symbol, price in prices.items():
            if symbol in self.positions:
                position = self.positions[symbol]
                position.current_price = price
                
                if position.direction == 'LONG':
                    position.pnl = (price - position.entry_price) * position.quantity
                else:
                    position.pnl = (position.entry_price - price) * position.quantity
                
                position.pnl_percent = (position.pnl / (position.entry_price * position.quantity)) * 100


class PositionMonitor:
    """
    Position Monitor - Tracks open positions
    
    Checks:
    - Stop loss hit
    - Take profit hit
    - Structure change
    - Time-based exit
    """
    
    def __init__(self, order_manager: OrderManager):
        self.order_manager = order_manager
    
    def check_stop_loss(self, symbol: str, current_price: float) -> bool:
        """Check if stop loss is hit"""
        if symbol not in self.order_manager.positions:
            return False
        
        position = self.order_manager.positions[symbol]
        
        if position.direction == 'LONG':
            return current_price <= position.stop_loss
        else:
            return current_price >= position.stop_loss
    
    def check_take_profit(self, symbol: str, current_price: float) -> bool:
        """Check if take profit is hit"""
        if symbol not in self.order_manager.positions:
            return False
        
        position = self.order_manager.positions[symbol]
        
        if not position.take_profit:
            return False
        
        if position.direction == 'LONG':
            return current_price >= position.take_profit
        else:
            return current_price <= position.take_profit
    
    def should_exit_position(self, symbol: str, current_price: float) -> Dict[str, Any]:
        """Check if position should be exited"""
        result = {
            'exit': False,
            'reason': None
        }
        
        if self.check_stop_loss(symbol, current_price):
            result['exit'] = True
            result['reason'] = 'STOP_LOSS'
        elif self.check_take_profit(symbol, current_price):
            result['exit'] = True
            result['reason'] = 'TAKE_PROFIT'
        
        return result
    
    def trail_stop_loss(self, symbol: str, new_stop: float) -> bool:
        """Trail stop loss for profitable position"""
        if symbol not in self.order_manager.positions:
            return False
        
        position = self.order_manager.positions[symbol]
        
        # Only trail in profit direction
        if position.direction == 'LONG':
            if new_stop > position.stop_loss:
                position.stop_loss = new_stop
                return True
        else:
            if new_stop < position.stop_loss:
                position.stop_loss = new_stop
                return True
        
        return False
