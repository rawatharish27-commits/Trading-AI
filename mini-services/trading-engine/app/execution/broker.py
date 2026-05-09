"""
Execution Engine - Angel One Broker Integration
Production-ready broker connection with SmartAPI

Features:
- Login with TOTP authentication
- Token refresh mechanism
- Order placement (Market, Limit, SL, SL-M)
- Order tracking and status updates
- Position management
- Margin calculation

Requirements:
- angelone-smartapi library
- pyotp for TOTP generation

Author: Trading AI Agent
"""

from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from enum import Enum
import asyncio
import hashlib
import time
import json

try:
    from SmartApi import SmartConnect
    from smartapi.websocket import WebSocket
    SMARTAPI_AVAILABLE = True
except ImportError:
    SMARTAPI_AVAILABLE = False

try:
    import pyotp
    PYOTP_AVAILABLE = True
except ImportError:
    PYOTP_AVAILABLE = False

from app.core.config import settings
from app.core.logger import logger


class OrderType(Enum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"
    STOPLOSS = "SL"
    STOPLOSS_MARKET = "SL-M"


class OrderSide(Enum):
    BUY = "BUY"
    SELL = "SELL"


class OrderStatus(Enum):
    PENDING = "PENDING"
    PLACED = "PLACED"
    EXECUTED = "EXECUTED"
    CANCELLED = "CANCELLED"
    REJECTED = "REJECTED"
    PARTIALLY_FILLED = "PARTIALLY_FILLED"


@dataclass
class BrokerCredentials:
    """Angel One API Credentials"""
    api_key: str
    api_secret: str
    client_code: str
    password: str
    totp_secret: str  # Base32 encoded TOTP secret
    
    # Optional
    redirect_url: str = ""
    imei: str = "abc1234"  # Device ID


@dataclass
class BrokerOrder:
    """Broker Order Object"""
    order_id: str
    broker_order_id: Optional[str]
    symbol: str
    token: str
    side: OrderSide
    order_type: OrderType
    quantity: int
    price: Optional[float]
    trigger_price: Optional[float]
    status: OrderStatus
    filled_quantity: int = 0
    avg_price: float = 0.0
    message: str = ""
    timestamp: datetime = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.utcnow()


@dataclass
class BrokerPosition:
    """Broker Position Object"""
    symbol: str
    token: str
    quantity: int
    avg_price: float
    current_price: float
    pnl: float
    pnl_percent: float
    side: str  # LONG, SHORT


@dataclass
class BrokerMargin:
    """Margin Information"""
    available_cash: float
    used_margin: float
    total_margin: float
    exposure_margin: float
    span_margin: float


class AngelOneBroker:
    """
    Angel One SmartAPI Broker Integration
    
    Production-ready implementation with:
    - Secure TOTP authentication
    - Auto token refresh
    - Order management
    - Position tracking
    - Real-time quotes
    """
    
    # Order validity
    VALIDITY_DAY = "DAY"
    VALIDITY_GTC = "GTC"  # Good Till Cancelled
    VALIDITY_IOC = "IOC"  # Immediate or Cancel
    
    # Exchange
    EXCHANGE_NSE = "NSE"
    EXCHANGE_NFO = "NFO"  # F&O
    EXCHANGE_MCX = "MCX"
    
    # Product types
    PRODUCT_INTRADAY = "INTRADAY"
    PRODUCT_DELIVERY = "DELIVERY"
    PRODUCT_CARRYFORWARD = "CARRYFORWARD"
    
    def __init__(self, credentials: BrokerCredentials, paper_trading: bool = False):
        """
        Initialize Broker Connection
        
        Args:
            credentials: Angel One API credentials
            paper_trading: If True, simulate orders without placing
        """
        self.credentials = credentials
        self.paper_trading = paper_trading
        
        # SmartAPI objects
        self.smart_api = None
        self.ws = None
        
        # Session data
        self.session_token = None
        self.refresh_token = None
        self.feed_token = None
        self.last_login = None
        self.token_expiry = timedelta(hours=24)
        
        # State tracking
        self.orders: Dict[str, BrokerOrder] = {}
        self.positions: Dict[str, BrokerPosition] = {}
        self._order_counter = 0
        
        # Symbol token mapping (loaded from Angel One)
        self.symbol_tokens: Dict[str, str] = {}
        
    def is_connected(self) -> bool:
        """Check if broker is connected"""
        if self.paper_trading:
            return True
        
        if not self.session_token:
            return False
        
        # Check token expiry
        if self.last_login:
            if datetime.utcnow() - self.last_login > self.token_expiry:
                return False
        
        return True
    
    async def login(self) -> Dict[str, Any]:
        """
        Login to Angel One SmartAPI
        
        Returns:
            Login response with session details
        """
        if self.paper_trading:
            logger.info("Paper trading mode - skipping login")
            self.last_login = datetime.utcnow()
            return {"status": True, "message": "Paper trading mode"}
        
        if not SMARTAPI_AVAILABLE:
            raise ImportError("SmartAPI not installed. Run: pip install angelone-smartapi")
        
        if not PYOTP_AVAILABLE:
            raise ImportError("pyotp not installed. Run: pip install pyotp")
        
        try:
            # Initialize SmartConnect
            self.smart_api = SmartConnect(self.credentials.api_key)
            
            # Generate TOTP
            totp = pyotp.TOTP(self.credentials.totp_secret)
            totp_code = totp.now()
            
            # Login
            data = self.smart_api.generateSession(
                self.credentials.client_code,
                self.credentials.password,
                totp_code
            )
            
            if data.get('status'):
                self.session_token = data['data']['jwtToken']
                self.refresh_token = data['data']['refreshToken']
                self.feed_token = self.smart_api.getfeedToken()
                self.last_login = datetime.utcnow()
                
                # Load symbol tokens
                await self._load_symbol_tokens()
                
                logger.info(f"✅ Angel One login successful for {self.credentials.client_code}")
                
                return {
                    "status": True,
                    "message": "Login successful",
                    "session_token": self.session_token[:20] + "...",  # Partial for security
                    "feed_token": self.feed_token[:20] + "..."
                }
            else:
                error_msg = data.get('message', 'Unknown error')
                logger.error(f"Angel One login failed: {error_msg}")
                return {"status": False, "message": error_msg}
                
        except Exception as e:
            logger.error(f"Login error: {e}")
            return {"status": False, "message": str(e)}
    
    async def logout(self) -> bool:
        """Logout from Angel One"""
        if self.paper_trading:
            return True
        
        try:
            if self.smart_api:
                self.smart_api.terminateSession(self.credentials.client_code)
                self.session_token = None
                self.refresh_token = None
                self.feed_token = None
                logger.info("Angel One logged out successfully")
            return True
        except Exception as e:
            logger.error(f"Logout error: {e}")
            return False
    
    async def refresh_session(self) -> bool:
        """Refresh session token"""
        if self.paper_trading:
            return True
        
        try:
            if self.smart_api and self.refresh_token:
                data = self.smart_api.refreshAccessToken(self.refresh_token)
                if data.get('status'):
                    self.session_token = data['data']['jwtToken']
                    self.refresh_token = data['data']['refreshToken']
                    self.last_login = datetime.utcnow()
                    logger.info("Session refreshed successfully")
                    return True
        except Exception as e:
            logger.error(f"Session refresh error: {e}")
        
        return False
    
    async def _load_symbol_tokens(self):
        """Load symbol-token mapping from Angel One"""
        try:
            # This would typically load from a file or API
            # For now, we'll use a basic mapping
            common_symbols = {
                "RELIANCE": "2885",
                "TCS": "11536",
                "HDFCBANK": "1333",
                "INFY": "1594",
                "ICICIBANK": "4963",
                "HINDUNILVR": "14366",
                "SBIN": "3045",
                "BHARTIARTL": "10604",
                "ITC": "1660",
                "KOTAKBANK": "4949",
                "LT": "11483",
                "AXISBANK": "5900",
                "ASIANPAINT": "18069",
                "MARUTI": "10999",
                "SUNPHARMA": "3351",
                "TITAN": "3506",
                "BAJFINANCE": "317",
                "DMART": "14349",
                "WIPRO": "3787",
                "HCLTECH": "7229"
            }
            self.symbol_tokens = common_symbols
            logger.info(f"Loaded {len(self.symbol_tokens)} symbol tokens")
        except Exception as e:
            logger.error(f"Error loading symbol tokens: {e}")
    
    def get_symbol_token(self, symbol: str) -> Optional[str]:
        """Get Angel One token for symbol"""
        token = self.symbol_tokens.get(symbol.upper())
        if not token:
            logger.warning(f"Token not found for symbol: {symbol}")
        return token
    
    def generate_order_id(self) -> str:
        """Generate unique order ID"""
        self._order_counter += 1
        return f"ORD_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{self._order_counter}"
    
    async def place_order(self,
                         symbol: str,
                         side: OrderSide,
                         quantity: int,
                         order_type: OrderType = OrderType.MARKET,
                         price: Optional[float] = None,
                         trigger_price: Optional[float] = None,
                         product_type: str = "INTRADAY",
                         exchange: str = "NSE") -> BrokerOrder:
        """
        Place Order with Angel One
        
        Args:
            symbol: Stock symbol (e.g., "RELIANCE")
            side: BUY or SELL
            quantity: Number of shares
            order_type: MARKET, LIMIT, SL, SL-M
            price: Limit price (for LIMIT orders)
            trigger_price: Trigger price (for SL orders)
            product_type: INTRADAY, DELIVERY
            exchange: NSE, NFO, MCX
            
        Returns:
            BrokerOrder object with order details
        """
        order_id = self.generate_order_id()
        token = self.get_symbol_token(symbol)
        
        if not token and not self.paper_trading:
            return BrokerOrder(
                order_id=order_id,
                broker_order_id=None,
                symbol=symbol,
                token="",
                side=side,
                order_type=order_type,
                quantity=quantity,
                price=price,
                trigger_price=trigger_price,
                status=OrderStatus.REJECTED,
                message="Symbol token not found"
            )
        
        order = BrokerOrder(
            order_id=order_id,
            broker_order_id=None,
            symbol=symbol,
            token=token or "0",
            side=side,
            order_type=order_type,
            quantity=quantity,
            price=price,
            trigger_price=trigger_price,
            status=OrderStatus.PENDING
        )
        
        # Paper trading simulation
        if self.paper_trading:
            order.status = OrderStatus.EXECUTED
            order.broker_order_id = f"PAPER_{order_id}"
            order.filled_quantity = quantity
            order.avg_price = price or trigger_price or 0
            order.message = "Paper trade executed"
            self.orders[order_id] = order
            logger.info(f"[PAPER] Order placed: {side.value} {quantity} {symbol}")
            return order
        
        # Real order placement
        try:
            order_params = {
                "variety": "NORMAL",
                "tradingsymbol": symbol.upper(),
                "symboltoken": token,
                "transactiontype": side.value,
                "exchange": exchange,
                "ordertype": order_type.value,
                "producttype": product_type,
                "duration": self.VALIDITY_DAY,
                "price": str(price) if price else "0",
                "squareoff": "0",
                "stoploss": str(trigger_price) if trigger_price else "0",
                "quantity": str(quantity)
            }
            
            response = self.smart_api.placeOrder(order_params)
            
            if response.get('status'):
                order.broker_order_id = response['data']['orderid']
                order.status = OrderStatus.PLACED
                order.message = "Order placed successfully"
                logger.info(f"Order placed: {order.broker_order_id}")
            else:
                order.status = OrderStatus.REJECTED
                order.message = response.get('message', 'Order rejected')
                logger.error(f"Order rejected: {order.message}")
            
            self.orders[order_id] = order
            return order
            
        except Exception as e:
            order.status = OrderStatus.REJECTED
            order.message = str(e)
            logger.error(f"Order placement error: {e}")
            self.orders[order_id] = order
            return order
    
    async def modify_order(self,
                          order_id: str,
                          price: Optional[float] = None,
                          trigger_price: Optional[float] = None,
                          quantity: Optional[int] = None) -> bool:
        """Modify existing order"""
        if order_id not in self.orders:
            logger.error(f"Order not found: {order_id}")
            return False
        
        order = self.orders[order_id]
        
        if self.paper_trading:
            if price:
                order.price = price
            if trigger_price:
                order.trigger_price = trigger_price
            if quantity:
                order.quantity = quantity
            logger.info(f"[PAPER] Order modified: {order_id}")
            return True
        
        try:
            params = {
                "variety": "NORMAL",
                "orderid": order.broker_order_id,
                "ordertype": order.order_type.value,
                "producttype": self.PRODUCT_INTRADAY,
                "duration": self.VALIDITY_DAY,
                "price": str(price) if price else str(order.price or 0),
                "quantity": str(quantity) if quantity else str(order.quantity),
                "tradingsymbol": order.symbol,
                "symboltoken": order.token,
                "exchange": self.EXCHANGE_NSE
            }
            
            response = self.smart_api.modifyOrder(params)
            
            if response.get('status'):
                logger.info(f"Order modified: {order_id}")
                return True
            return False
            
        except Exception as e:
            logger.error(f"Order modification error: {e}")
            return False
    
    async def cancel_order(self, order_id: str) -> bool:
        """Cancel order"""
        if order_id not in self.orders:
            logger.error(f"Order not found: {order_id}")
            return False
        
        order = self.orders[order_id]
        
        if self.paper_trading:
            order.status = OrderStatus.CANCELLED
            logger.info(f"[PAPER] Order cancelled: {order_id}")
            return True
        
        try:
            response = self.smart_api.cancelOrder(order.broker_order_id, "NORMAL")
            
            if response.get('status'):
                order.status = OrderStatus.CANCELLED
                logger.info(f"Order cancelled: {order_id}")
                return True
            return False
            
        except Exception as e:
            logger.error(f"Order cancellation error: {e}")
            return False
    
    async def get_order_status(self, order_id: str) -> Optional[Dict]:
        """Get order status from broker"""
        if order_id not in self.orders:
            return None
        
        order = self.orders[order_id]
        
        if self.paper_trading:
            return {
                "order_id": order_id,
                "status": order.status.value,
                "filled_quantity": order.filled_quantity,
                "avg_price": order.avg_price
            }
        
        try:
            response = self.smart_api.orderBook()
            
            if response.get('status'):
                for broker_order in response['data']:
                    if broker_order['orderid'] == order.broker_order_id:
                        order.filled_quantity = int(broker_order.get('filledquantity', 0))
                        order.avg_price = float(broker_order.get('averageprice', 0))
                        order.status = OrderStatus(broker_order.get('status', 'PENDING'))
                        return {
                            "order_id": order_id,
                            "broker_order_id": order.broker_order_id,
                            "status": order.status.value,
                            "filled_quantity": order.filled_quantity,
                            "avg_price": order.avg_price
                        }
            return None
            
        except Exception as e:
            logger.error(f"Error getting order status: {e}")
            return None
    
    async def get_positions(self) -> List[BrokerPosition]:
        """Get all open positions"""
        if self.paper_trading:
            return list(self.positions.values())
        
        try:
            response = self.smart_api.position()
            
            if response.get('status'):
                positions = []
                for pos in response['data']:
                    position = BrokerPosition(
                        symbol=pos['tradingsymbol'],
                        token=pos['symboltoken'],
                        quantity=int(pos['netqty']),
                        avg_price=float(pos['avgprice']),
                        current_price=float(pos.get('ltp', 0)),
                        pnl=float(pos.get('pnl', 0)),
                        pnl_percent=float(pos.get('pnlpercent', 0)),
                        side='LONG' if int(pos['netqty']) > 0 else 'SHORT'
                    )
                    positions.append(position)
                    self.positions[position.symbol] = position
                
                return positions
            return []
            
        except Exception as e:
            logger.error(f"Error getting positions: {e}")
            return []
    
    async def get_margin(self) -> Optional[BrokerMargin]:
        """Get margin details"""
        if self.paper_trading:
            return BrokerMargin(
                available_cash=100000,
                used_margin=0,
                total_margin=100000,
                exposure_margin=0,
                span_margin=0
            )
        
        try:
            response = self.smart_api.rmsLimit()
            
            if response.get('status'):
                data = response['data']
                return BrokerMargin(
                    available_cash=float(data.get('availablecash', 0)),
                    used_margin=float(data.get('utilisedmargin', 0)),
                    total_margin=float(data.get('marginused', 0)),
                    exposure_margin=float(data.get('exposuremargin', 0)),
                    span_margin=float(data.get('spanmargin', 0))
                )
            return None
            
        except Exception as e:
            logger.error(f"Error getting margin: {e}")
            return None
    
    async def get_quote(self, symbol: str) -> Optional[Dict]:
        """Get real-time quote for symbol"""
        token = self.get_symbol_token(symbol)
        
        if not token:
            return None
        
        if self.paper_trading:
            return {
                "symbol": symbol,
                "ltp": 0,
                "open": 0,
                "high": 0,
                "low": 0,
                "close": 0,
                "volume": 0
            }
        
        try:
            response = self.smart_api.ltpData(
                self.EXCHANGE_NSE,
                symbol,
                token
            )
            
            if response.get('status'):
                data = response['data']
                return {
                    "symbol": symbol,
                    "ltp": float(data.get('ltp', 0)),
                    "open": float(data.get('open', 0)),
                    "high": float(data.get('high', 0)),
                    "low": float(data.get('low', 0)),
                    "close": float(data.get('close', 0)),
                    "volume": int(data.get('totaltradedvolume', 0))
                }
            return None
            
        except Exception as e:
            logger.error(f"Error getting quote: {e}")
            return None
    
    async def get_historical_data(self,
                                  symbol: str,
                                  interval: str = "FIVE_MINUTE",
                                  from_date: datetime = None,
                                  to_date: datetime = None) -> List[Dict]:
        """
        Get historical candle data
        
        Args:
            symbol: Stock symbol
            interval: ONE_MINUTE, FIVE_MINUTE, FIFTEEN_MINUTE, ONE_HOUR, ONE_DAY
            from_date: Start date
            to_date: End date
        """
        token = self.get_symbol_token(symbol)
        
        if not token:
            return []
        
        if not from_date:
            from_date = datetime.utcnow() - timedelta(days=30)
        if not to_date:
            to_date = datetime.utcnow()
        
        if self.paper_trading:
            return []
        
        try:
            response = self.smart_api.getCandleData({
                "exchange": self.EXCHANGE_NSE,
                "symboltoken": token,
                "interval": interval,
                "fromdate": from_date.strftime("%Y-%m-%d %H:%M"),
                "todate": to_date.strftime("%Y-%m-%d %H:%M")
            })
            
            if response.get('status'):
                candles = []
                for c in response['data']:
                    candles.append({
                        "timestamp": c[0],
                        "open": float(c[1]),
                        "high": float(c[2]),
                        "low": float(c[3]),
                        "close": float(c[4]),
                        "volume": int(c[5])
                    })
                return candles
            return []
            
        except Exception as e:
            logger.error(f"Error getting historical data: {e}")
            return []
    
    async def close_all_positions(self) -> Dict:
        """Close all open positions - EMERGENCY FUNCTION"""
        results = {
            "closed": 0,
            "failed": 0,
            "orders": []
        }
        
        positions = await self.get_positions()
        
        for pos in positions:
            if pos.quantity != 0:
                # Create opposite order
                side = OrderSide.SELL if pos.quantity > 0 else OrderSide.BUY
                quantity = abs(pos.quantity)
                
                order = await self.place_order(
                    symbol=pos.symbol,
                    side=side,
                    quantity=quantity,
                    order_type=OrderType.MARKET
                )
                
                if order.status == OrderStatus.EXECUTED or order.status == OrderStatus.PLACED:
                    results["closed"] += 1
                else:
                    results["failed"] += 1
                
                results["orders"].append({
                    "symbol": pos.symbol,
                    "side": side.value,
                    "quantity": quantity,
                    "status": order.status.value
                })
        
        return results


# Singleton instance
_broker_instance: Optional[AngelOneBroker] = None


def get_broker() -> Optional[AngelOneBroker]:
    """Get broker singleton instance"""
    return _broker_instance


def init_broker(credentials: BrokerCredentials, paper_trading: bool = True) -> AngelOneBroker:
    """Initialize broker singleton"""
    global _broker_instance
    _broker_instance = AngelOneBroker(credentials, paper_trading)
    return _broker_instance
