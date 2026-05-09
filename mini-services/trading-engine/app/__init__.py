"""
Trading AI Agent RAG - App Package Init
"""

__version__ = "1.0.0"
__author__ = "Trading AI Agent"

# Core imports
from app.core.config import settings
from app.core.logger import logger

# Database
from app.database import (
    init_db, get_db, is_db_ready, is_using_fallback,
    SymbolCRUD, CandleCRUD, TradeCRUD,
    RiskStateCRUD, LearningCRUD,
    ProbabilityTableCRUD, SystemLogCRUD
)

# SMC Engine
from app.smc import (
    SwingDetector, StructureDetector, LiquidityDetector,
    OrderBlockDetector, FVGDetector, ConfluenceEngine, RegimeDetector
)

# Agents
from app.agents import (
    RiskAgent, ResearchAgent, DecisionAgent, LearningAgent
)

# Strategy & Backtest
from app.strategy import SetupBuilder
from app.backtest import BacktestSimulator

# Execution
from app.execution import OrderManager
