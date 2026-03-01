"""
Trading AI Agent RAG - FastAPI Main Application
Production Grade Trading Intelligence System

Complete Features:
- SMC Engine with Mathematical Formulas
- Multi-Timeframe Analysis
- Broker Integration (Angel One)
- Live WebSocket Data Feed
- Safety Layer (Kill Switch)
- Alert System (Telegram)
- Health Monitoring
- News Sentiment Analysis
- Backtest Engine
- AI Agents (Decision, Risk, Learning)

Author: Trading AI Agent
"""

from fastapi import FastAPI, HTTPException, Query, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, date
import uvicorn
import sys
import os
import asyncio

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.core.logger import logger
from app.database import init_db, get_db_session, SymbolCRUD, CandleCRUD, TradeCRUD, RiskStateCRUD, SystemLogCRUD, is_db_ready, is_using_fallback
from app.core.cache import cache, get_cache
from app.smc import (
    SwingDetector, Candle, StructureDetector, LiquidityDetector,
    OrderBlockDetector, FVGDetector, ConfluenceEngine, RegimeDetector,
    analyze_structure
)


# ============================================
# PYDANTIC MODELS
# ============================================

class CandleData(BaseModel):
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float = 0


class CandleBulkRequest(BaseModel):
    symbol: str
    timeframe: str
    candles: List[CandleData]


class TradeRequest(BaseModel):
    symbol: str
    direction: str  # LONG, SHORT
    entry_price: float
    quantity: float
    stop_loss: float
    take_profit: Optional[float] = None
    risk_percent: float = 1.0
    setup_id: Optional[int] = None
    notes: Optional[str] = None


class CloseTradeRequest(BaseModel):
    trade_id: int
    exit_price: float


class SMCAnalysisRequest(BaseModel):
    symbol: str
    timeframe: str = "5m"
    htf_bias: Optional[str] = "NEUTRAL"


class AgentDecisionRequest(BaseModel):
    setup: Dict[str, Any]
    market_context: Dict[str, Any]


class BrokerConfigRequest(BaseModel):
    api_key: str
    api_secret: str
    client_code: str
    password: str
    totp_secret: str


class TelegramConfigRequest(BaseModel):
    bot_token: str
    chat_id: str


class KillSwitchRequest(BaseModel):
    user: str = "API"
    reason: str = ""
    close_positions: bool = True


# ============================================
# FASTAPI APP
# ============================================

app = FastAPI(
    title="Trading AI Agent RAG",
    description="Production Grade Trading Intelligence System with SMC Engine, Multi-TF Analysis, and AI Agents",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS Middleware - Allow all origins for production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# ============================================
# STARTUP & SHUTDOWN
# ============================================

@app.on_event("startup")
async def startup_event():
    """Initialize on startup with graceful error handling"""
    logger.info("🚀 Starting Trading AI Agent v2.0...")
    
    # Run database migrations first
    try:
        from run_migrations import run_migrations
        logger.info("🔄 Running database migrations...")
        migration_success = run_migrations()
        if migration_success:
            logger.info("✅ Database migrations completed")
        else:
            logger.warning("⚠️ Database migrations returned False, continuing...")
    except Exception as e:
        logger.warning(f"⚠️ Migration check: {type(e).__name__}: {str(e)[:100]}")
        logger.info("ℹ️ Continuing with database initialization...")
    
    # Initialize database with graceful error handling
    try:
        db_success = init_db()
        if db_success:
            logger.info("✅ Connected to PostgreSQL database successfully")
        else:
            logger.warning("⚠️ Database initialization returned False")
    except Exception as e:
        logger.error(f"❌ Database initialization error: {type(e).__name__}: {str(e)[:200]}")
        logger.warning("⚠️ Starting without database - some features will be unavailable")
    
    # Connect to Redis (optional)
    try:
        cache.connect()
        logger.info("✅ Cache connected")
    except Exception as e:
        logger.warning(f"⚠️ Cache connection failed: {e}")
    
    # Initialize Health Monitor
    try:
        from app.core.health import init_health_monitor
        health_monitor = init_health_monitor(check_interval=60, auto_recover=False)  # 60s interval, no auto-recover on free tier
        asyncio.create_task(health_monitor.start())
        logger.info("✅ Health monitor initialized")
    except Exception as e:
        logger.warning(f"⚠️ Health monitor failed: {e}")
    
    # Initialize Safety Layer
    try:
        from app.core.safety import init_safety
        init_safety()
        logger.info("✅ Safety layer initialized")
    except Exception as e:
        logger.warning(f"⚠️ Safety layer failed: {e}")
    
    # Initialize Scheduler
    try:
        from app.core.scheduler import init_scheduler
        scheduler = init_scheduler()
        asyncio.create_task(scheduler.start())
        logger.info("✅ Scheduler initialized")
    except Exception as e:
        logger.warning(f"⚠️ Scheduler failed: {e}")
    
    # Initialize Alert System
    try:
        from app.core.alerts import init_alerts
        init_alerts(
            telegram_token=getattr(settings, 'TELEGRAM_BOT_TOKEN', None),
            telegram_chat_id=getattr(settings, 'TELEGRAM_CHAT_ID', None),
            use_console=True
        )
        logger.info("✅ Alert system initialized")
    except Exception as e:
        logger.warning(f"⚠️ Alert system failed: {e}")
    
    logger.info("✅ Trading AI Agent started successfully")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    # Stop health monitor
    from app.core.health import get_health_monitor
    health_monitor = get_health_monitor()
    if health_monitor:
        await health_monitor.stop()
    
    # Stop scheduler
    from app.core.scheduler import get_scheduler
    scheduler = get_scheduler()
    if scheduler:
        await scheduler.stop()
    
    # Disconnect cache
    cache.disconnect()
    
    logger.info("🛑 Trading AI Agent stopped")


# ============================================
# HEALTH CHECK
# ============================================

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "Trading AI Agent RAG",
        "version": "2.0.0",
        "status": "running",
        "features": [
            "SMC Engine",
            "Multi-Timeframe Analysis",
            "Broker Integration",
            "Live Data Feed",
            "Safety Layer",
            "Alert System",
            "Health Monitoring",
            "News Sentiment"
        ],
        "timestamp": datetime.utcnow().isoformat()
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    from app.core.health import get_health_monitor
    
    # Check database connection
    db_status = "connected" if is_db_ready() else "disconnected"
    
    health_monitor = get_health_monitor()
    if health_monitor:
        status = health_monitor.get_health_status()
        status["database"] = db_status
        return status
    
    return {
        "status": "healthy" if is_db_ready() else "degraded",
        "database": db_status,
        "cache": "redis" if cache.enabled else "memory",
        "timestamp": datetime.utcnow().isoformat()
    }


# ============================================
# MARKET DATA API
# ============================================

@app.get("/api/market/candles")
async def get_candles(
    symbol: str = Query(...),
    timeframe: str = Query("5m"),
    limit: int = Query(100, le=500)
):
    """Get candles for symbol"""
    db = get_db_session()
    try:
        symbol_obj = SymbolCRUD.get_or_create(db, symbol)
        
        cached = get_cache().get_cached_candles(symbol, timeframe)
        if cached:
            return {"success": True, "data": cached, "source": "cache"}
        
        candles = CandleCRUD.get_latest(db, symbol_obj.id, timeframe, limit)
        
        result = [{
            "timestamp": c.timestamp.isoformat(),
            "open": c.open,
            "high": c.high,
            "low": c.low,
            "close": c.close,
            "volume": c.volume
        } for c in reversed(candles)]
        
        get_cache().cache_candles(symbol, timeframe, result)
        
        return {"success": True, "data": result, "source": "database"}
    
    except Exception as e:
        logger.error(f"Error getting candles: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.post("/api/market/candles")
async def add_candles(request: CandleBulkRequest):
    """Add candles to database"""
    db = get_db_session()
    try:
        symbol_obj = SymbolCRUD.get_or_create(db, request.symbol)
        
        candle_data = [{
            "symbol_id": symbol_obj.id,
            "timeframe": request.timeframe,
            "timestamp": c.timestamp,
            "open": c.open,
            "high": c.high,
            "low": c.low,
            "close": c.close,
            "volume": c.volume
        } for c in request.candles]
        
        count = CandleCRUD.bulk_insert(db, candle_data)
        
        SystemLogCRUD.log(db, "INFO", "DATA", f"Added {count} candles for {request.symbol}")
        
        return {"success": True, "inserted": count}
    
    except Exception as e:
        logger.error(f"Error adding candles: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


# ============================================
# SMC ANALYSIS API
# ============================================

@app.get("/api/smc/analyze")
async def analyze_market(
    symbol: str = Query(...),
    timeframe: str = Query("5m"),
    htf_bias: str = Query("NEUTRAL")
):
    """Run complete SMC analysis"""
    if not is_db_ready():
        return {"success": True, "data": {
            "symbol": symbol,
            "timeframe": timeframe,
            "analysis_time": datetime.utcnow().isoformat(),
            "trend": "NEUTRAL",
            "regime": {"type": "RANGING", "trend_strength": 50, "volatility": 1.0, "atr": 10},
            "swings": {"total": 0, "highs": 0, "lows": 0},
            "structures": {"total": 0, "bos": 0, "choch": 0},
            "liquidity_zones": [],
            "order_blocks": [],
            "fvgs": [],
            "trade_setup": None,
            "message": "Database not connected - showing placeholder data"
        }}
    
    db = get_db_session()
    try:
        cached = get_cache().get_cached_smc(symbol, timeframe)
        if cached:
            return {"success": True, "data": cached, "source": "cache"}
        
        symbol_obj = SymbolCRUD.get_or_create(db, symbol)
        db_candles = CandleCRUD.get_latest(db, symbol_obj.id, timeframe, 200)
        
        if len(db_candles) < 50:
            # Return placeholder data when not enough candles
            return {
                "success": True, 
                "data": {
                    "symbol": symbol,
                    "timeframe": timeframe,
                    "analysis_time": datetime.utcnow().isoformat(),
                    "trend": "NEUTRAL",
                    "regime": {"type": "RANGING", "trend_strength": 50, "volatility": 1.0, "atr": 10},
                    "swings": {"total": 0, "highs": 0, "lows": 0},
                    "structures": {"total": 0, "bos": 0, "choch": 0},
                    "liquidity_zones": [],
                    "order_blocks": [],
                    "fvgs": [],
                    "trade_setup": None,
                    "message": f"Need at least 50 candles for analysis. Current: {len(db_candles)}"
                }
            }
        
        candles = [
            Candle(
                timestamp=c.timestamp,
                open=c.open,
                high=c.high,
                low=c.low,
                close=c.close,
                volume=c.volume,
                symbol=symbol,
                timeframe=timeframe
            ) for c in reversed(db_candles)
        ]
        
        # Run SMC Analysis
        swing_detector = SwingDetector(strength=3)
        swings = swing_detector.detect_swings(candles)
        
        structure_result = analyze_structure(candles, swings)
        
        liq_detector = LiquidityDetector()
        liquidity_zones = liq_detector.detect_all_liquidity(swings, candles)
        
        ob_detector = OrderBlockDetector()
        order_blocks = ob_detector.detect_all_order_blocks(candles)
        
        fvg_detector = FVGDetector()
        fvgs = fvg_detector.detect_all_fvgs(candles)
        
        regime_detector = RegimeDetector()
        regime_data = regime_detector.detect_regime(candles)
        
        confluence_engine = ConfluenceEngine()
        trade_setup = confluence_engine.generate_trade_setup(
            symbol=symbol,
            timeframe=timeframe,
            candles=candles,
            structures=structure_result['all_structures'],
            liquidity_zones=liquidity_zones,
            order_blocks=order_blocks,
            fvgs=fvgs,
            regime=regime_data.regime.value,
            htf_bias=htf_bias
        )
        
        result = {
            "symbol": symbol,
            "timeframe": timeframe,
            "analysis_time": datetime.utcnow().isoformat(),
            "trend": structure_result['trend'],
            "regime": {
                "type": regime_data.regime.value,
                "trend_strength": regime_data.trend_strength,
                "volatility": regime_data.volatility,
                "atr": regime_data.atr
            },
            "swings": {
                "total": len(swings),
                "highs": len([s for s in swings if s.type == 'HIGH']),
                "lows": len([s for s in swings if s.type == 'LOW'])
            },
            "structures": {
                "total": len(structure_result['all_structures']),
                "bos": len(structure_result['bos_points']),
                "choch": len(structure_result['choch_points'])
            },
            "liquidity_zones": [{
                "type": z.type.value,
                "price_level": z.price_level,
                "swept": z.swept,
                "touches": z.touches
            } for z in liquidity_zones[-10:]],
            "order_blocks": [{
                "type": ob.type.value,
                "high": ob.high_price,
                "low": ob.low_price,
                "mitigated": ob.mitigated,
                "retested": ob.retested,
                "strength": ob.strength
            } for ob in order_blocks[-5:]],
            "fvgs": [{
                "type": f.type.value,
                "gap_top": f.gap_top,
                "gap_bottom": f.gap_bottom,
                "filled": f.filled,
                "fill_percentage": f.fill_percentage
            } for f in fvgs[-5:]],
            "trade_setup": {
                "direction": trade_setup.direction,
                "confluence_score": trade_setup.confluence.total_score,
                "entry": trade_setup.entry_price,
                "stop_loss": trade_setup.stop_loss,
                "take_profit": trade_setup.take_profit,
                "risk_reward": trade_setup.risk_reward,
                "breakdown": confluence_engine.get_confluence_breakdown(trade_setup.confluence)
            } if trade_setup else None
        }
        
        get_cache().cache_smc_analysis(symbol, timeframe, result)
        
        return {"success": True, "data": result}
    
    except Exception as e:
        logger.error(f"SMC analysis error: {e}")
        return {
            "success": True, 
            "data": {
                "symbol": symbol,
                "timeframe": timeframe,
                "analysis_time": datetime.utcnow().isoformat(),
                "trend": "NEUTRAL",
                "regime": {"type": "RANGING", "trend_strength": 50, "volatility": 1.0, "atr": 10},
                "swings": {"total": 0, "highs": 0, "lows": 0},
                "structures": {"total": 0, "bos": 0, "choch": 0},
                "liquidity_zones": [],
                "order_blocks": [],
                "fvgs": [],
                "trade_setup": None,
                "message": f"Analysis error: {str(e)[:100]}"
            }
        }
    finally:
        if db:
            db.close()


# ============================================
# MULTI-TIMEFRAME API
# ============================================

@app.get("/api/smc/mtf/{symbol}")
async def analyze_mtf(symbol: str):
    """Multi-Timeframe Analysis"""
    if not is_db_ready():
        return {"success": True, "data": None, "message": "Database not connected"}
    
    db = get_db_session()
    try:
        from app.smc.multi_timeframe import MultiTimeframeEngine
        
        symbol_obj = SymbolCRUD.get_or_create(db, symbol)
        
        # Get candles for different timeframes
        htf_candles = [Candle(
            timestamp=c.timestamp, open=c.open, high=c.high, low=c.low,
            close=c.close, volume=c.volume, symbol=symbol, timeframe="1d"
        ) for c in reversed(CandleCRUD.get_latest(db, symbol_obj.id, "1d", 100))]
        
        mtf_candles = [Candle(
            timestamp=c.timestamp, open=c.open, high=c.high, low=c.low,
            close=c.close, volume=c.volume, symbol=symbol, timeframe="1h"
        ) for c in reversed(CandleCRUD.get_latest(db, symbol_obj.id, "1h", 100))]
        
        ltf_candles = [Candle(
            timestamp=c.timestamp, open=c.open, high=c.high, low=c.low,
            close=c.close, volume=c.volume, symbol=symbol, timeframe="5m"
        ) for c in reversed(CandleCRUD.get_latest(db, symbol_obj.id, "5m", 100))]
        
        if len(htf_candles) < 30 or len(mtf_candles) < 30 or len(ltf_candles) < 30:
            return {"success": True, "data": None, "message": "Insufficient data for MTF analysis"}
        
        engine = MultiTimeframeEngine()
        signal = engine.generate_mtf_signal(htf_candles, mtf_candles, ltf_candles, symbol)
        
        if signal:
            return {
                "success": True,
                "data": {
                    "symbol": signal.symbol,
                    "direction": signal.direction,
                    "alignment_score": signal.alignment_score,
                    "htf_bias": signal.htf_bias,
                    "mtf_structure": signal.mtf_structure,
                    "ltf_setup": signal.ltf_setup,
                    "entry_zone": signal.entry_zone,
                    "stop_loss": signal.stop_loss,
                    "take_profit": signal.take_profit,
                    "risk_reward": signal.risk_reward,
                    "reasons": signal.reasons,
                    "warnings": signal.warnings
                }
            }
        
        return {"success": True, "data": None, "message": "No valid MTF signal found"}
    
    except Exception as e:
        logger.error(f"MTF analysis error: {e}")
        return {"success": True, "data": None, "message": f"MTF analysis error: {str(e)[:100]}"}
    finally:
        if db:
            db.close()


# ============================================
# TRADES API
# ============================================

from app.database import Trade

@app.get("/api/trades")
async def get_trades(status: Optional[str] = None, limit: int = 50):
    """Get trades"""
    if not is_db_ready():
        return {"success": True, "data": []}
    
    db = get_db_session()
    try:
        if status:
            trades = db.query(Trade).filter(Trade.status == status).order_by(
                Trade.executed_at.desc()
            ).limit(limit).all()
        else:
            trades = db.query(Trade).order_by(Trade.executed_at.desc()).limit(limit).all()
        
        return {
            "success": True,
            "data": [{
                "id": t.id,
                "symbol": t.symbol.symbol if t.symbol else "UNKNOWN",
                "direction": t.direction.value if hasattr(t.direction, 'value') else t.direction,
                "status": t.status.value if hasattr(t.status, 'value') else t.status,
                "entry_price": t.entry_price,
                "exit_price": t.exit_price,
                "quantity": t.quantity,
                "stop_loss": t.stop_loss,
                "pnl": t.pnl,
                "pnl_percent": t.pnl_percent,
                "executed_at": t.executed_at.isoformat() if t.executed_at else None
            } for t in trades]
        }
    except Exception as e:
        logger.error(f"Trades fetch error: {e}")
        return {"success": True, "data": []}
    finally:
        if db:
            db.close()


@app.post("/api/trades")
async def create_trade(request: TradeRequest):
    """Create new trade"""
    db = get_db_session()
    try:
        symbol_obj = SymbolCRUD.get_or_create(db, request.symbol)
        
        trade_data = {
            "symbol_id": symbol_obj.id,
            "direction": request.direction,
            "entry_price": request.entry_price,
            "quantity": request.quantity,
            "stop_loss": request.stop_loss,
            "take_profit": request.take_profit,
            "risk_percent": request.risk_percent,
            "setup_id": request.setup_id,
            "notes": request.notes
        }
        
        trade = TradeCRUD.create(db, trade_data)
        
        SystemLogCRUD.log(db, "INFO", "EXECUTION", f"New {request.direction} trade opened for {request.symbol}")
        
        return {"success": True, "data": {"trade_id": trade.id}}
    
    except Exception as e:
        logger.error(f"Trade creation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@app.put("/api/trades/close")
async def close_trade(request: CloseTradeRequest):
    """Close trade"""
    db = get_db_session()
    try:
        trade = db.query(Trade).filter(Trade.id == request.trade_id).first()
        if not trade:
            raise HTTPException(status_code=404, detail="Trade not found")
        
        if trade.direction == 'LONG' or trade.direction.value == 'LONG':
            pnl = (request.exit_price - trade.entry_price) * trade.quantity
        else:
            pnl = (trade.entry_price - request.exit_price) * trade.quantity
        
        pnl_percent = (pnl / (trade.entry_price * trade.quantity)) * 100
        
        closed_trade = TradeCRUD.close_trade(db, request.trade_id, request.exit_price, pnl, pnl_percent)
        
        return {"success": True, "data": {"trade_id": closed_trade.id, "pnl": pnl, "pnl_percent": pnl_percent}}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Trade close error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


# ============================================
# DASHBOARD API
# ============================================

@app.get("/api/dashboard/stats")
async def get_dashboard_stats():
    """Get dashboard statistics"""
    if not is_db_ready():
        return {
            "success": True,
            "data": {
                "total_trades": 0,
                "winning_trades": 0,
                "losing_trades": 0,
                "win_rate": 0,
                "total_pnl": 0,
                "open_positions": 0,
                "today_trades": 0,
                "today_pnl": 0,
                "risk_state": {
                    "starting_capital": 100000,
                    "current_capital": 100000,
                    "daily_pnl": 0,
                    "daily_trades": 0,
                    "trading_halted": False
                }
            }
        }
    
    db = get_db_session()
    try:
        stats = TradeCRUD.get_statistics(db)
        open_trades = TradeCRUD.get_open(db)
        
        today = date.today()
        today_trades = db.query(Trade).filter(
            Trade.executed_at >= datetime.combine(today, datetime.min.time())
        ).count()
        
        today_pnl = sum(t.pnl or 0 for t in db.query(Trade).filter(
            Trade.executed_at >= datetime.combine(today, datetime.min.time()),
            Trade.status == 'CLOSED'
        ).all())
        
        risk_state = RiskStateCRUD.get_or_create(db, today, 100000)
        
        return {
            "success": True,
            "data": {
                **stats,
                "open_positions": len(open_trades),
                "today_trades": today_trades,
                "today_pnl": today_pnl,
                "risk_state": {
                    "starting_capital": risk_state.starting_capital,
                    "current_capital": risk_state.current_capital,
                    "daily_pnl": risk_state.daily_pnl,
                    "daily_trades": risk_state.daily_trades,
                    "trading_halted": risk_state.trading_halted
                }
            }
        }
    except Exception as e:
        logger.error(f"Dashboard stats error: {e}")
        return {
            "success": True,
            "data": {
                "total_trades": 0,
                "winning_trades": 0,
                "losing_trades": 0,
                "win_rate": 0,
                "total_pnl": 0,
                "open_positions": 0,
                "today_trades": 0,
                "today_pnl": 0,
                "risk_state": {
                    "starting_capital": 100000,
                    "current_capital": 100000,
                    "daily_pnl": 0,
                    "daily_trades": 0,
                    "trading_halted": False
                }
            }
        }
    finally:
        if db:
            db.close()


# ============================================
# RISK API
# ============================================

@app.get("/api/risk/state")
async def get_risk_state():
    """Get current risk state"""
    if not is_db_ready():
        return {
            "success": True,
            "data": {
                "date": date.today().isoformat(),
                "starting_capital": 100000,
                "current_capital": 100000,
                "daily_pnl": 0,
                "daily_loss": 0,
                "daily_trades": 0,
                "open_positions": 0,
                "daily_loss_limit": 0.05,
                "trade_limit_hit": False,
                "trading_halted": False,
                "halt_reason": None,
                "config": {
                    "max_risk_per_trade": 1.0,
                    "max_daily_loss": 3.0,
                    "max_trades_per_day": 3,
                    "max_open_positions": 3
                }
            }
        }
    
    db = get_db_session()
    try:
        today = date.today()
        state = RiskStateCRUD.get_or_create(db, today, 100000)
        
        return {
            "success": True,
            "data": {
                "date": state.date.isoformat(),
                "starting_capital": state.starting_capital,
                "current_capital": state.current_capital,
                "daily_pnl": state.daily_pnl,
                "daily_loss": state.daily_loss,
                "daily_trades": state.daily_trades,
                "open_positions": state.open_positions,
                "daily_loss_limit": state.daily_loss_limit,
                "trade_limit_hit": state.trade_limit_hit,
                "trading_halted": state.trading_halted,
                "halt_reason": state.halt_reason,
                "config": {
                    "max_risk_per_trade": settings.MAX_RISK_PER_TRADE,
                    "max_daily_loss": settings.MAX_DAILY_LOSS,
                    "max_trades_per_day": settings.MAX_TRADES_PER_DAY,
                    "max_open_positions": settings.MAX_OPEN_POSITIONS
                }
            }
        }
    except Exception as e:
        logger.error(f"Risk state error: {e}")
        return {
            "success": True,
            "data": {
                "date": date.today().isoformat(),
                "starting_capital": 100000,
                "current_capital": 100000,
                "daily_pnl": 0,
                "daily_loss": 0,
                "daily_trades": 0,
                "open_positions": 0,
                "daily_loss_limit": 0.05,
                "trade_limit_hit": False,
                "trading_halted": False,
                "halt_reason": None,
                "config": {
                    "max_risk_per_trade": 1.0,
                    "max_daily_loss": 3.0,
                    "max_trades_per_day": 3,
                    "max_open_positions": 3
                }
            }
        }
    finally:
        if db:
            db.close()


# ============================================
# SAFETY / KILL SWITCH API
# ============================================

@app.get("/api/safety/status")
async def get_safety_status():
    """Get safety system status"""
    from app.core.safety import get_safety
    
    safety = get_safety()
    if safety:
        status = safety.get_status()
        return {
            "success": True,
            "data": {
                "state": status.state.value,
                "reason": status.reason.value if status.reason else None,
                "halted_at": status.halted_at.isoformat() if status.halted_at else None,
                "message": status.message,
                "can_trade": safety.can_trade(),
                "kill_switch_engaged": safety.is_kill_switch_engaged(),
                "metrics": {
                    "daily_pnl_percent": status.current_daily_pnl_percent,
                    "weekly_pnl_percent": status.current_weekly_pnl_percent,
                    "drawdown_percent": status.current_drawdown_percent,
                    "trades_today": status.trades_today,
                    "consecutive_losses": status.consecutive_losses
                }
            }
        }
    
    return {"success": False, "error": "Safety system not initialized"}


@app.post("/api/safety/kill-switch")
async def engage_kill_switch(request: KillSwitchRequest):
    """Engage kill switch - EMERGENCY STOP"""
    from app.core.safety import get_safety
    
    safety = get_safety()
    if safety:
        result = safety.engage_kill_switch(
            user=request.user,
            close_positions=request.close_positions,
            reason=request.reason
        )
        return {"success": True, "data": result}
    
    return {"success": False, "error": "Safety system not initialized"}


@app.delete("/api/safety/kill-switch")
async def disengage_kill_switch(user: str = Query(default="API")):
    """Disengage kill switch"""
    from app.core.safety import get_safety
    
    safety = get_safety()
    if safety:
        result = safety.disengage_kill_switch(user=user)
        return {"success": True, "data": result}
    
    return {"success": False, "error": "Safety system not initialized"}


# ============================================
# SCHEDULER API
# ============================================

@app.get("/api/scheduler/status")
async def get_scheduler_status():
    """Get scheduler status"""
    from app.core.scheduler import get_scheduler
    
    scheduler = get_scheduler()
    if scheduler:
        return {
            "success": True,
            "data": {
                "market_status": scheduler.get_market_status(),
                "jobs": scheduler.get_jobs()
            }
        }
    
    return {"success": False, "error": "Scheduler not initialized"}


# ============================================
# NEWS SENTIMENT API
# ============================================

@app.get("/api/sentiment/{symbol}")
async def get_symbol_sentiment(symbol: str):
    """Get sentiment analysis for symbol"""
    try:
        from app.agents.news_sentiment import init_sentiment_agent
        
        agent = init_sentiment_agent()
        result = await agent.check_symbol_sentiment(symbol)
        
        return {"success": True, "data": result}
    
    except Exception as e:
        logger.error(f"Sentiment analysis error: {e}")
        return {"success": False, "error": str(e)}


@app.get("/api/sentiment/market")
async def get_market_sentiment():
    """Get overall market sentiment"""
    try:
        from app.agents.news_sentiment import init_sentiment_agent
        
        agent = init_sentiment_agent()
        result = await agent.get_market_mood()
        
        return {"success": True, "data": result}
    
    except Exception as e:
        logger.error(f"Market sentiment error: {e}")
        return {"success": False, "error": str(e)}


# ============================================
# BACKTEST API
# ============================================

@app.post("/api/backtest/run")
async def run_backtest(
    symbol: str = Query(...),
    timeframe: str = Query("5m"),
    initial_capital: float = Query(100000),
    risk_per_trade: float = Query(1.0)
):
    """Run backtest for symbol"""
    db = get_db_session()
    try:
        from app.backtest.simulator import BacktestSimulator
        
        symbol_obj = SymbolCRUD.get_or_create(db, symbol)
        db_candles = CandleCRUD.get_latest(db, symbol_obj.id, timeframe, 500)
        
        if len(db_candles) < 100:
            return {"success": False, "error": "Need at least 100 candles for backtest"}
        
        candles = [Candle(
            timestamp=c.timestamp,
            open=c.open,
            high=c.high,
            low=c.low,
            close=c.close,
            volume=c.volume,
            symbol=symbol,
            timeframe=timeframe
        ) for c in reversed(db_candles)]
        
        simulator = BacktestSimulator(
            initial_capital=initial_capital,
            risk_per_trade=risk_per_trade
        )
        
        result = simulator.run_backtest(candles, symbol, timeframe)
        
        return {
            "success": True,
            "data": {
                "symbol": symbol,
                "timeframe": timeframe,
                "total_trades": result.total_trades,
                "winning_trades": result.winning_trades,
                "losing_trades": result.losing_trades,
                "win_rate": result.win_rate,
                "expectancy": result.expectancy,
                "profit_factor": result.profit_factor,
                "max_drawdown": result.max_drawdown,
                "max_drawdown_percent": result.max_drawdown_percent,
                "sharpe_ratio": result.sharpe_ratio,
                "total_pnl": result.total_pnl,
                "starting_capital": result.starting_capital,
                "ending_capital": result.ending_capital
            }
        }
    
    except Exception as e:
        logger.error(f"Backtest error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


# ============================================
# MAIN
# ============================================

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )
