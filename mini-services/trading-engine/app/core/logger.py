"""
Trading AI Agent RAG - Logger Configuration
"""

import sys
from loguru import logger
from app.core.config import settings

# Remove default handler
logger.remove()

# Add custom handlers
logger.add(
    sys.stdout,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
    level="DEBUG" if settings.DEBUG else "INFO",
    colorize=True
)

# File logging
logger.add(
    "logs/trading_{time:YYYY-MM-DD}.log",
    rotation="00:00",
    retention="30 days",
    level="INFO",
    compression="gz"
)

# Error logging
logger.add(
    "logs/error_{time:YYYY-MM-DD}.log",
    rotation="00:00",
    retention="90 days",
    level="ERROR",
    compression="gz"
)

export = logger
