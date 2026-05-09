"""
Trading AI Agent RAG - Database Models
PostgreSQL Models using SQLAlchemy

Author: Trading AI Agent
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey, Enum as SQLEnum
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
import enum

Base = declarative_base()


# ============================================
# ENUMS
# ============================================

class TradeDirection(enum.Enum):
    LONG = "LONG"
    SHORT = "SHORT"


class TradeStatus(enum.Enum):
    OPEN = "OPEN"
    CLOSED = "CLOSED"
    CANCELLED = "CANCELLED"


class TradeResult(enum.Enum):
    WIN = "WIN"
    LOSS = "LOSS"
    BREAKEVEN = "BREAKEVEN"


class MarketRegime(enum.Enum):
    TRENDING = "TRENDING"
    RANGING = "RANGING"
    VOLATILE = "VOLATILE"


# ============================================
# SYMBOL & MARKET DATA
# ============================================

class Symbol(Base):
    """Stock/Symbol Master"""
    __tablename__ = "symbols"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(20), unique=True, nullable=False, index=True)
    name = Column(String(100))
    exchange = Column(String(20), default="NSE")
    sector = Column(String(50))
    is_active = Column(Boolean, default=True)
    lot_size = Column(Integer, default=1)
    tick_size = Column(Float, default=0.05)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    candles = relationship("Candle", back_populates="symbol")
    trades = relationship("Trade", back_populates="symbol")


class Candle(Base):
    """OHLCV Candle Data"""
    __tablename__ = "candles"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol_id = Column(Integer, ForeignKey("symbols.id"), nullable=False, index=True)
    timeframe = Column(String(10), nullable=False, index=True)  # 1m, 5m, 15m, 1h, 1d
    timestamp = Column(DateTime, nullable=False, index=True)
    open = Column(Float, nullable=False)
    high = Column(Float, nullable=False)
    low = Column(Float, nullable=False)
    close = Column(Float, nullable=False)
    volume = Column(Float, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    symbol = relationship("Symbol", back_populates="candles")
    
    # Unique constraint
    __table_args__ = (
        # UniqueConstraint('symbol_id', 'timeframe', 'timestamp', name='uix_candle'),
        {"sqlite_autoincrement": True},
    )


# ============================================
# SMC ENGINE DATA
# ============================================

class Swing(Base):
    """Swing High/Low Points"""
    __tablename__ = "swings"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol_id = Column(Integer, ForeignKey("symbols.id"), nullable=False, index=True)
    timeframe = Column(String(10), nullable=False)
    timestamp = Column(DateTime, nullable=False, index=True)
    type = Column(String(10), nullable=False)  # HIGH, LOW
    price = Column(Float, nullable=False)
    strength = Column(Integer, default=3)
    confirmed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Structure(Base):
    """Market Structure (BOS, CHoCH, HH, HL, LH, LL)"""
    __tablename__ = "structures"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol_id = Column(Integer, ForeignKey("symbols.id"), nullable=False, index=True)
    timeframe = Column(String(10), nullable=False)
    timestamp = Column(DateTime, nullable=False, index=True)
    type = Column(String(10), nullable=False)  # BOS, CHOCH, HH, HL, LH, LL
    direction = Column(String(10), nullable=False)  # BULLISH, BEARISH
    price = Column(Float, nullable=False)
    broken_level = Column(Float)
    confirmed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class LiquidityZone(Base):
    """Liquidity Zones"""
    __tablename__ = "liquidity_zones"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol_id = Column(Integer, ForeignKey("symbols.id"), nullable=False, index=True)
    timeframe = Column(String(10), nullable=False)
    type = Column(String(20), nullable=False)  # EQUAL_HIGHS, EQUAL_LOWS, BUY_SIDE, SELL_SIDE
    price_level = Column(Float, nullable=False)
    tolerance = Column(Float, default=0.1)
    volume = Column(Float)
    swept = Column(Boolean, default=False)
    swept_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)


class OrderBlock(Base):
    """Order Blocks"""
    __tablename__ = "order_blocks"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol_id = Column(Integer, ForeignKey("symbols.id"), nullable=False, index=True)
    timeframe = Column(String(10), nullable=False)
    type = Column(String(10), nullable=False)  # BULLISH, BEARISH
    high_price = Column(Float, nullable=False)
    low_price = Column(Float, nullable=False)
    candle_index = Column(Integer)
    volume = Column(Float)
    impulse_size = Column(Float)
    strength = Column(Float, default=1.0)
    mitigated = Column(Boolean, default=False)
    mitigated_at = Column(DateTime)
    retested = Column(Boolean, default=False)
    retested_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)


class FVG(Base):
    """Fair Value Gaps"""
    __tablename__ = "fvgs"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol_id = Column(Integer, ForeignKey("symbols.id"), nullable=False, index=True)
    timeframe = Column(String(10), nullable=False)
    type = Column(String(10), nullable=False)  # BULLISH, BEARISH
    gap_top = Column(Float, nullable=False)
    gap_bottom = Column(Float, nullable=False)
    gap_size = Column(Float, nullable=False)
    candle_index = Column(Integer)
    filled = Column(Boolean, default=False)
    filled_at = Column(DateTime)
    fill_percentage = Column(Float, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


# ============================================
# TRADES & EXECUTION
# ============================================

class Trade(Base):
    """Executed Trades"""
    __tablename__ = "trades"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol_id = Column(Integer, ForeignKey("symbols.id"), nullable=False, index=True)
    setup_id = Column(Integer, ForeignKey("trade_setups.id"))
    
    # Trade Details
    direction = Column(SQLEnum(TradeDirection), nullable=False)
    status = Column(SQLEnum(TradeStatus), default=TradeStatus.OPEN)
    entry_price = Column(Float, nullable=False)
    exit_price = Column(Float)
    quantity = Column(Float, nullable=False)
    stop_loss = Column(Float, nullable=False)
    take_profit = Column(Float)
    
    # P&L
    pnl = Column(Float)
    pnl_percent = Column(Float)
    fees = Column(Float, default=0)
    
    # Risk
    risk_percent = Column(Float, default=1.0)
    risk_amount = Column(Float)
    
    # Execution
    broker_order_id = Column(String(50))
    executed_at = Column(DateTime, default=datetime.utcnow, index=True)
    closed_at = Column(DateTime)
    
    # Metadata
    tags = Column(Text)  # JSON array
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    symbol = relationship("Symbol", back_populates="trades")


class TradeSetup(Base):
    """Trade Setup Candidates"""
    __tablename__ = "trade_setups"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol_id = Column(Integer, ForeignKey("symbols.id"), nullable=False)
    timeframe = Column(String(10), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    direction = Column(String(10), nullable=False)
    
    # Confluence Scores
    liquidity_sweep = Column(Boolean, default=False)
    liquidity_score = Column(Integer, default=0)
    bos_score = Column(Integer, default=0)
    ob_score = Column(Integer, default=0)
    fvg_score = Column(Integer, default=0)
    volume_score = Column(Integer, default=0)
    total_score = Column(Integer, default=0)
    
    # Context
    htf_bias = Column(String(10))
    regime = Column(String(20))
    
    # Levels
    entry_price = Column(Float)
    stop_loss = Column(Float)
    take_profit = Column(Float)
    risk_reward = Column(Float)
    
    # Status
    status = Column(String(20), default="PENDING")  # PENDING, APPROVED, REJECTED, EXECUTED
    ai_decision = Column(String(20))
    ai_reasoning = Column(Text)
    
    created_at = Column(DateTime, default=datetime.utcnow)


# ============================================
# RISK MANAGEMENT
# ============================================

class RiskConfig(Base):
    """Risk Configuration"""
    __tablename__ = "risk_configs"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(50), unique=True, nullable=False)
    
    # Position Sizing
    max_risk_per_trade = Column(Float, default=1.0)
    max_daily_loss = Column(Float, default=3.0)
    max_weekly_loss = Column(Float, default=6.0)
    max_drawdown = Column(Float, default=10.0)
    
    # Trade Limits
    max_trades_per_day = Column(Integer, default=3)
    max_open_positions = Column(Integer, default=3)
    
    # Risk/Reward
    min_risk_reward = Column(Float, default=1.5)
    
    # Time
    trading_start_time = Column(String(10), default="09:15")
    trading_end_time = Column(String(10), default="15:30")
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class DailyRiskState(Base):
    """Daily Risk State Tracking"""
    __tablename__ = "daily_risk_states"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(DateTime, unique=True, nullable=False, index=True)
    
    # Capital
    starting_capital = Column(Float, nullable=False)
    current_capital = Column(Float, nullable=False)
    
    # Daily Metrics
    daily_pnl = Column(Float, default=0)
    daily_loss = Column(Float, default=0)
    daily_trades = Column(Integer, default=0)
    open_positions = Column(Integer, default=0)
    
    # Limits
    daily_loss_limit = Column(Boolean, default=False)
    trade_limit_hit = Column(Boolean, default=False)
    trading_halted = Column(Boolean, default=False)
    halt_reason = Column(String(100))
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ============================================
# AI AGENTS
# ============================================

class AgentDecision(Base):
    """Agent Decision Log"""
    __tablename__ = "agent_decisions"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    agent_type = Column(String(20), nullable=False, index=True)  # RESEARCH, DECISION, RISK, EXECUTION
    symbol = Column(String(20), index=True)
    setup_id = Column(Integer)
    
    # Input/Output
    input_json = Column(Text)  # JSON
    output_json = Column(Text)  # JSON
    decision = Column(String(20))
    
    # Context
    confidence = Column(Float)
    reasoning = Column(Text)
    processing_time_ms = Column(Integer)
    
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


# ============================================
# LEARNING SYSTEM
# ============================================

class LearningRecord(Base):
    """Trade Learning Records"""
    __tablename__ = "learning_records"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    trade_id = Column(Integer, ForeignKey("trades.id"))
    
    # Setup Characteristics
    setup_type = Column(String(30), nullable=False, index=True)
    trend_direction = Column(String(10))
    regime = Column(String(20))
    volatility = Column(String(10))
    volume_profile = Column(String(10))
    htf_alignment = Column(Boolean)
    
    # Time
    session = Column(String(20))
    day_of_week = Column(Integer)
    
    # Result
    result = Column(SQLEnum(TradeResult), nullable=False)
    pnl_percent = Column(Float)
    hold_time = Column(Integer)  # minutes
    
    # Score
    setup_score = Column(Float)
    confidence = Column(Float)
    
    created_at = Column(DateTime, default=datetime.utcnow)


class ProbabilityTable(Base):
    """Aggregated Probability Table"""
    __tablename__ = "probability_tables"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    setup_type = Column(String(30), nullable=False)
    regime = Column(String(20))
    trend_direction = Column(String(10))
    volume_profile = Column(String(10))
    
    # Statistics
    total_trades = Column(Integer, default=0)
    wins = Column(Integer, default=0)
    losses = Column(Integer, default=0)
    win_rate = Column(Float, default=0)
    avg_pnl = Column(Float, default=0)
    avg_hold_time = Column(Integer)
    
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ============================================
# BACKTESTING
# ============================================

class BacktestRun(Base):
    """Backtest Run Record"""
    __tablename__ = "backtest_runs"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100))
    symbol = Column(String(20), nullable=False)
    timeframe = Column(String(10), nullable=False)
    
    # Date Range
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)
    
    # Config
    config_json = Column(Text)  # JSON
    
    # Results
    total_trades = Column(Integer, default=0)
    winning_trades = Column(Integer, default=0)
    losing_trades = Column(Integer, default=0)
    win_rate = Column(Float, default=0)
    total_pnl = Column(Float, default=0)
    max_drawdown = Column(Float, default=0)
    expectancy = Column(Float, default=0)
    profit_factor = Column(Float, default=0)
    sharpe_ratio = Column(Float)
    
    status = Column(String(20), default="PENDING")
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)


# ============================================
# SYSTEM
# ============================================

class SystemLog(Base):
    """System Log"""
    __tablename__ = "system_logs"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    level = Column(String(10), nullable=False)  # INFO, WARNING, ERROR, CRITICAL
    category = Column(String(20), nullable=False)  # DATA, SMC, AGENT, EXECUTION, RISK, SYSTEM
    message = Column(Text, nullable=False)
    details = Column(Text)  # JSON
    symbol = Column(String(20), index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class MarketRegimeRecord(Base):
    """Market Regime History"""
    __tablename__ = "market_regimes"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(20), nullable=False, index=True)
    timeframe = Column(String(10), nullable=False)
    timestamp = Column(DateTime, nullable=False, index=True)
    
    regime = Column(String(20), nullable=False)
    trend_strength = Column(Float)
    volatility = Column(Float)
    atr = Column(Float)
    ema_spread = Column(Float)
    
    created_at = Column(DateTime, default=datetime.utcnow)
