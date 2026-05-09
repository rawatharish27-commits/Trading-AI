"""
Trading AI Agent RAG - Database
PostgreSQL with Supabase Pooler Support
"""

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime
import os
import logging
import time

logger = logging.getLogger(__name__)

# ============================================
# BASE MODEL
# ============================================

Base = declarative_base()


# ============================================
# SIMPLE MODELS
# ============================================

from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey

class Symbol(Base):
    __tablename__ = "symbols"
    id = Column(Integer, primary_key=True)
    symbol = Column(String(20), unique=True, nullable=False, index=True)
    name = Column(String(100))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Candle(Base):
    __tablename__ = "candles"
    id = Column(Integer, primary_key=True)
    symbol_id = Column(Integer, ForeignKey("symbols.id"), index=True)
    timeframe = Column(String(10), index=True)
    timestamp = Column(DateTime, index=True)
    open = Column(Float)
    high = Column(Float)
    low = Column(Float)
    close = Column(Float)
    volume = Column(Float, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class Trade(Base):
    __tablename__ = "trades"
    id = Column(Integer, primary_key=True)
    symbol_id = Column(Integer, ForeignKey("symbols.id"), index=True)
    direction = Column(String(10))
    status = Column(String(10), default="OPEN")
    entry_price = Column(Float)
    exit_price = Column(Float)
    quantity = Column(Float)
    stop_loss = Column(Float)
    take_profit = Column(Float)
    pnl = Column(Float)
    pnl_percent = Column(Float)
    executed_at = Column(DateTime, default=datetime.utcnow, index=True)
    closed_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)


class DailyRiskState(Base):
    __tablename__ = "daily_risk_states"
    id = Column(Integer, primary_key=True)
    date = Column(DateTime, unique=True, nullable=False, index=True)
    starting_capital = Column(Float)
    current_capital = Column(Float)
    daily_pnl = Column(Float, default=0)
    daily_loss = Column(Float, default=0)
    daily_trades = Column(Integer, default=0)
    open_positions = Column(Integer, default=0)
    trading_halted = Column(Boolean, default=False)
    halt_reason = Column(String(100))
    daily_loss_limit = Column(Float, default=0.05)  # 5% max daily loss
    trade_limit_hit = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class LearningRecord(Base):
    __tablename__ = "learning_records"
    id = Column(Integer, primary_key=True)
    setup_type = Column(String(30), index=True)
    trend_direction = Column(String(10))
    regime = Column(String(20))
    result = Column(String(10))
    pnl_percent = Column(Float)
    hold_time = Column(Integer)
    setup_score = Column(Float)
    confidence = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)


class ProbabilityTable(Base):
    __tablename__ = "probability_tables"
    id = Column(Integer, primary_key=True)
    setup_type = Column(String(30))
    regime = Column(String(20))
    trend_direction = Column(String(10))
    total_trades = Column(Integer, default=0)
    wins = Column(Integer, default=0)
    losses = Column(Integer, default=0)
    win_rate = Column(Float, default=0)
    avg_pnl = Column(Float, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow)


class SystemLog(Base):
    __tablename__ = "system_logs"
    id = Column(Integer, primary_key=True)
    level = Column(String(10))
    category = Column(String(20))
    message = Column(Text)
    details = Column(Text)
    symbol = Column(String(20), index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


# ============================================
# CONNECTION
# ============================================

engine = None
SessionLocal = None
_db_initialized = False
_using_fallback = False


def init_db():
    """Initialize Database (PostgreSQL or SQLite) with retry logic"""
    global engine, SessionLocal, _db_initialized, _using_fallback
    
    if _db_initialized:
        return True
    
    database_url = os.environ.get('DATABASE_URL', '')
    
    # Handle file: URLs (convert to SQLite format for local dev)
    if database_url.startswith('file:'):
        path = database_url[5:]  # Remove 'file:'
        database_url = f'sqlite:///{path}'
        logger.info(f"Converted file: URL to SQLite")
        os.environ['DATABASE_URL'] = database_url
        _using_fallback = True
    
    # Default to SQLite if no URL
    if not database_url:
        database_url = 'sqlite:///./trading.db'
        logger.info("No DATABASE_URL, using SQLite")
        _using_fallback = True
        os.environ['DATABASE_URL'] = database_url
    
    # Check if using SQLite
    is_sqlite = database_url.startswith('sqlite')
    
    # Add SSL mode for PostgreSQL cloud providers
    if not is_sqlite and "sslmode" not in database_url:
        database_url += "&sslmode=require" if "?" in database_url else "?sslmode=require"
    
    max_retries = 5
    retry_delay = 2
    
    for attempt in range(max_retries):
        try:
            db_type = "SQLite" if is_sqlite else "PostgreSQL"
            logger.info(f"{db_type} connection attempt {attempt + 1}/{max_retries}")
            
            # Configure engine based on database type
            if is_sqlite:
                engine = create_engine(
                    database_url,
                    pool_pre_ping=True,
                    connect_args={"check_same_thread": False}
                )
            else:
                engine = create_engine(
                    database_url,
                    pool_pre_ping=True,
                    pool_recycle=300,
                    pool_size=3,
                    max_overflow=5,
                    connect_args={
                        "connect_timeout": 30,
                        "application_name": "trading-ai-agent",
                    }
                )
            
            # Test connection
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            
            # Create session factory
            SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
            
            # Create tables
            Base.metadata.create_all(bind=engine)
            
            _db_initialized = True
            logger.info(f"✅ {db_type} initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"❌ Connection attempt {attempt + 1} failed: {type(e).__name__}")
            logger.error(f"   Details: {str(e)[:200]}")
            
            if is_sqlite:
                # SQLite shouldn't need retries
                logger.error("❌ SQLite initialization failed")
                return False
            
            if attempt < max_retries - 1:
                logger.info(f"   Retrying in {retry_delay}s...")
                time.sleep(retry_delay)
                retry_delay = min(retry_delay * 2, 10)
            else:
                logger.error("❌ All PostgreSQL connection attempts failed")
                # Fallback to SQLite
                logger.info("🔄 Falling back to SQLite database...")
                try:
                    fallback_url = 'sqlite:///./trading.db'
                    engine = create_engine(
                        fallback_url,
                        pool_pre_ping=True,
                        connect_args={"check_same_thread": False}
                    )
                    with engine.connect() as conn:
                        conn.execute(text("SELECT 1"))
                    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
                    Base.metadata.create_all(bind=engine)
                    _db_initialized = True
                    _using_fallback = True
                    logger.info("✅ SQLite fallback database initialized successfully")
                    return True
                except Exception as fallback_error:
                    logger.error(f"❌ SQLite fallback also failed: {fallback_error}")
                    return False
    
    return False


def get_db():
    """Get database session"""
    global SessionLocal
    
    if SessionLocal is None:
        if not init_db():
            yield None
            return
    
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_db_session():
    """Get database session directly (not as generator)"""
    global SessionLocal
    
    if SessionLocal is None:
        if not init_db():
            return None
    
    return SessionLocal()


def is_db_ready() -> bool:
    """Check if database is ready"""
    return _db_initialized and engine is not None


def is_using_fallback() -> bool:
    """Check if using SQLite fallback instead of PostgreSQL"""
    return _using_fallback


# ============================================
# CRUD OPERATIONS
# ============================================

class SymbolCRUD:
    @staticmethod
    def get_or_create(db, symbol: str, name: str = None):
        obj = db.query(Symbol).filter(Symbol.symbol == symbol).first()
        if not obj:
            obj = Symbol(symbol=symbol, name=name or symbol)
            db.add(obj)
            db.commit()
            db.refresh(obj)
        return obj
    
    @staticmethod
    def get_all(db):
        return db.query(Symbol).filter(Symbol.is_active == True).all()


class CandleCRUD:
    @staticmethod
    def get_latest(db, symbol_id: int, timeframe: str, limit: int = 100):
        return db.query(Candle).filter(
            Candle.symbol_id == symbol_id,
            Candle.timeframe == timeframe
        ).order_by(Candle.timestamp.desc()).limit(limit).all()
    
    @staticmethod
    def bulk_insert(db, candles_data: list):
        """Bulk insert candles"""
        candles = [Candle(**data) for data in candles_data]
        db.add_all(candles)
        db.commit()
        return len(candles)


class TradeCRUD:
    @staticmethod
    def get_open(db):
        return db.query(Trade).filter(Trade.status == "OPEN").all()
    
    @staticmethod
    def create(db, trade_data: dict):
        """Create a new trade"""
        trade = Trade(**trade_data)
        db.add(trade)
        db.commit()
        db.refresh(trade)
        return trade
    
    @staticmethod
    def close_trade(db, trade_id: int, exit_price: float, pnl: float, pnl_percent: float):
        """Close a trade"""
        trade = db.query(Trade).filter(Trade.id == trade_id).first()
        if trade:
            trade.status = "CLOSED"
            trade.exit_price = exit_price
            trade.pnl = pnl
            trade.pnl_percent = pnl_percent
            trade.closed_at = datetime.utcnow()
            db.commit()
            db.refresh(trade)
        return trade
    
    @staticmethod
    def get_statistics(db):
        trades = db.query(Trade).filter(Trade.status == "CLOSED").all()
        
        if not trades:
            return {
                'total_trades': 0,
                'winning_trades': 0,
                'losing_trades': 0,
                'win_rate': 0,
                'total_pnl': 0,
            }
        
        wins = [t for t in trades if t.pnl and t.pnl > 0]
        
        return {
            'total_trades': len(trades),
            'winning_trades': len(wins),
            'losing_trades': len(trades) - len(wins),
            'win_rate': (len(wins) / len(trades) * 100) if trades else 0,
            'total_pnl': sum(t.pnl or 0 for t in trades),
        }


class RiskStateCRUD:
    @staticmethod
    def get_or_create(db, date_val, capital: float):
        from datetime import datetime
        date_dt = datetime.combine(date_val, datetime.min.time())
        
        state = db.query(DailyRiskState).filter(
            DailyRiskState.date == date_dt
        ).first()
        
        if not state:
            state = DailyRiskState(
                date=date_dt,
                starting_capital=capital,
                current_capital=capital
            )
            db.add(state)
            db.commit()
            db.refresh(state)
        
        return state


class LearningCRUD:
    @staticmethod
    def create(db, record_data: dict):
        record = LearningRecord(**record_data)
        db.add(record)
        db.commit()
        db.refresh(record)
        return record
    
    @staticmethod
    def get_all(db):
        return db.query(LearningRecord).all()


class ProbabilityTableCRUD:
    @staticmethod
    def update_stats(db, setup_type: str, regime: str,
                    trend_direction: str, won: bool, pnl: float):
        table = db.query(ProbabilityTable).filter(
            ProbabilityTable.setup_type == setup_type,
            ProbabilityTable.regime == regime,
            ProbabilityTable.trend_direction == trend_direction
        ).first()
        
        if not table:
            table = ProbabilityTable(
                setup_type=setup_type,
                regime=regime,
                trend_direction=trend_direction,
                total_trades=1,
                wins=1 if won else 0,
                losses=0 if won else 1,
                win_rate=100 if won else 0,
                avg_pnl=pnl
            )
            db.add(table)
        else:
            table.total_trades += 1
            if won:
                table.wins += 1
            else:
                table.losses += 1
            table.win_rate = (table.wins / table.total_trades) * 100
            table.avg_pnl = ((table.avg_pnl * (table.total_trades - 1)) + pnl) / table.total_trades
        
        db.commit()
        db.refresh(table)
        return table


class SystemLogCRUD:
    @staticmethod
    def log(db, level: str, category: str, message: str,
           details: dict = None, symbol: str = None):
        log = SystemLog(
            level=level,
            category=category,
            message=message,
            details=str(details) if details else None,
            symbol=symbol
        )
        db.add(log)
        db.commit()
    
    @staticmethod
    def get_recent(db, limit: int = 100):
        return db.query(SystemLog).order_by(
            SystemLog.created_at.desc()
        ).limit(limit).all()


# ============================================
# EXPORTS
# ============================================

__all__ = [
    # Base & Models
    'Base', 'Symbol', 'Candle', 'Trade', 
    'DailyRiskState', 'LearningRecord', 
    'ProbabilityTable', 'SystemLog',
    
    # Connection
    'engine', 'SessionLocal', 'get_db', 'get_db_session', 'init_db',
    'is_db_ready', 'is_using_fallback',
    
    # CRUD
    'SymbolCRUD', 'CandleCRUD', 'TradeCRUD',
    'RiskStateCRUD', 'LearningCRUD', 
    'ProbabilityTableCRUD', 'SystemLogCRUD'
]
