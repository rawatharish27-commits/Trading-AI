"""
Trading AI Agent RAG - Database CRUD Operations
"""

from typing import List, Optional
from datetime import datetime, date
from sqlalchemy.orm import Session
from sqlalchemy import desc, and_

from app.database.models import (
    Symbol, Candle, Swing, Structure, LiquidityZone, 
    OrderBlock, FVG, Trade, TradeSetup, RiskConfig,
    DailyRiskState, AgentDecision, LearningRecord,
    ProbabilityTable, BacktestRun, SystemLog, MarketRegimeRecord
)


class SymbolCRUD:
    """Symbol CRUD Operations"""
    
    @staticmethod
    def get_or_create(db: Session, symbol: str, name: str = None) -> Symbol:
        obj = db.query(Symbol).filter(Symbol.symbol == symbol).first()
        if not obj:
            obj = Symbol(symbol=symbol, name=name or symbol)
            db.add(obj)
            db.commit()
            db.refresh(obj)
        return obj
    
    @staticmethod
    def get_active(db: Session) -> List[Symbol]:
        return db.query(Symbol).filter(Symbol.is_active == True).all()


class CandleCRUD:
    """Candle CRUD Operations"""
    
    @staticmethod
    def get_latest(db: Session, symbol_id: int, timeframe: str, limit: int = 100) -> List[Candle]:
        return db.query(Candle).filter(
            and_(Candle.symbol_id == symbol_id, Candle.timeframe == timeframe)
        ).order_by(desc(Candle.timestamp)).limit(limit).all()
    
    @staticmethod
    def bulk_insert(db: Session, candles: List[dict]) -> int:
        objects = [Candle(**c) for c in candles]
        db.bulk_save_objects(objects)
        db.commit()
        return len(objects)
    
    @staticmethod
    def get_date_range(db: Session, symbol_id: int, timeframe: str,
                       start: datetime, end: datetime) -> List[Candle]:
        return db.query(Candle).filter(
            and_(
                Candle.symbol_id == symbol_id,
                Candle.timeframe == timeframe,
                Candle.timestamp >= start,
                Candle.timestamp <= end
            )
        ).order_by(Candle.timestamp).all()


class TradeCRUD:
    """Trade CRUD Operations"""
    
    @staticmethod
    def create(db: Session, trade_data: dict) -> Trade:
        trade = Trade(**trade_data)
        db.add(trade)
        db.commit()
        db.refresh(trade)
        return trade
    
    @staticmethod
    def get_open(db: Session) -> List[Trade]:
        return db.query(Trade).filter(Trade.status == 'OPEN').all()
    
    @staticmethod
    def close_trade(db: Session, trade_id: int, exit_price: float,
                   pnl: float, pnl_percent: float) -> Trade:
        trade = db.query(Trade).filter(Trade.id == trade_id).first()
        if trade:
            trade.status = 'CLOSED'
            trade.exit_price = exit_price
            trade.pnl = pnl
            trade.pnl_percent = pnl_percent
            trade.closed_at = datetime.utcnow()
            db.commit()
            db.refresh(trade)
        return trade
    
    @staticmethod
    def get_statistics(db: Session) -> dict:
        trades = db.query(Trade).filter(Trade.status == 'CLOSED').all()
        
        if not trades:
            return {
                'total_trades': 0,
                'winning_trades': 0,
                'losing_trades': 0,
                'win_rate': 0,
                'total_pnl': 0,
                'avg_win': 0,
                'avg_loss': 0
            }
        
        wins = [t for t in trades if t.pnl and t.pnl > 0]
        losses = [t for t in trades if t.pnl and t.pnl < 0]
        
        total_pnl = sum(t.pnl or 0 for t in trades)
        avg_win = sum(t.pnl or 0 for t in wins) / len(wins) if wins else 0
        avg_loss = sum(t.pnl or 0 for t in losses) / len(losses) if losses else 0
        
        return {
            'total_trades': len(trades),
            'winning_trades': len(wins),
            'losing_trades': len(losses),
            'win_rate': (len(wins) / len(trades) * 100) if trades else 0,
            'total_pnl': total_pnl,
            'avg_win': avg_win,
            'avg_loss': avg_loss
        }


class RiskStateCRUD:
    """Daily Risk State CRUD"""
    
    @staticmethod
    def get_or_create(db: Session, date_val: date, capital: float) -> DailyRiskState:
        state = db.query(DailyRiskState).filter(
            DailyRiskState.date == datetime.combine(date_val, datetime.min.time())
        ).first()
        
        if not state:
            state = DailyRiskState(
                date=datetime.combine(date_val, datetime.min.time()),
                starting_capital=capital,
                current_capital=capital
            )
            db.add(state)
            db.commit()
            db.refresh(state)
        
        return state
    
    @staticmethod
    def update(db: Session, state_id: int, updates: dict) -> DailyRiskState:
        state = db.query(DailyRiskState).filter(DailyRiskState.id == state_id).first()
        if state:
            for key, value in updates.items():
                setattr(state, key, value)
            db.commit()
            db.refresh(state)
        return state


class LearningCRUD:
    """Learning Record CRUD"""
    
    @staticmethod
    def create(db: Session, record_data: dict) -> LearningRecord:
        record = LearningRecord(**record_data)
        db.add(record)
        db.commit()
        db.refresh(record)
        return record
    
    @staticmethod
    def get_by_setup_type(db: Session, setup_type: str) -> List[LearningRecord]:
        return db.query(LearningRecord).filter(
            LearningRecord.setup_type == setup_type
        ).all()
    
    @staticmethod
    def get_all(db: Session) -> List[LearningRecord]:
        return db.query(LearningRecord).all()


class ProbabilityTableCRUD:
    """Probability Table CRUD"""
    
    @staticmethod
    def get(db: Session, setup_type: str, regime: str = None, 
            trend_direction: str = None) -> Optional[ProbabilityTable]:
        query = db.query(ProbabilityTable).filter(
            ProbabilityTable.setup_type == setup_type
        )
        if regime:
            query = query.filter(ProbabilityTable.regime == regime)
        if trend_direction:
            query = query.filter(ProbabilityTable.trend_direction == trend_direction)
        return query.first()
    
    @staticmethod
    def update_stats(db: Session, setup_type: str, regime: str,
                    trend_direction: str, won: bool, pnl: float) -> ProbabilityTable:
        table = ProbabilityTableCRUD.get(db, setup_type, regime, trend_direction)
        
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
            # Update running average
            table.avg_pnl = ((table.avg_pnl * (table.total_trades - 1)) + pnl) / table.total_trades
        
        db.commit()
        db.refresh(table)
        return table


class SystemLogCRUD:
    """System Log CRUD"""
    
    @staticmethod
    def log(db: Session, level: str, category: str, message: str,
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
    def get_recent(db: Session, limit: int = 100) -> List[SystemLog]:
        return db.query(SystemLog).order_by(desc(SystemLog.created_at)).limit(limit).all()


# Export all CRUD classes
__all__ = [
    'SymbolCRUD', 'CandleCRUD', 'TradeCRUD', 
    'RiskStateCRUD', 'LearningCRUD', 'ProbabilityTableCRUD',
    'SystemLogCRUD'
]
