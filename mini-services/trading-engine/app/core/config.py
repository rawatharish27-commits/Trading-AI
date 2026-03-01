"""
Trading AI Agent RAG - Core Configuration
Production Grade Settings with DeepSeek Support

Deployment Ready:
- Neon PostgreSQL
- Upstash Redis
- DeepSeek LLM (FREE alternative to OpenAI)
- Render / Railway deployment
"""

from pydantic_settings import BaseSettings
from typing import Optional
from functools import lru_cache
import os


class Settings(BaseSettings):
    """Application Settings"""
    
    # ============================================
    # SERVER
    # ============================================
    APP_NAME: str = "Trading AI Agent"
    APP_VERSION: str = "2.0.0"
    DEBUG: bool = True
    HOST: str = "0.0.0.0"
    PORT: int = 3030
    
    # ============================================
    # DATABASE
    # ============================================
    # Primary: Neon PostgreSQL (Production)
    # Fallback: SQLite (Development)
    DATABASE_URL: str = "sqlite:///./trading.db"
    
    # ============================================
    # REDIS CACHE
    # ============================================
    # Primary: Upstash Redis (Production)
    # Fallback: Memory cache (Development)
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_ENABLED: bool = False
    
    # ============================================
    # AI / LLM CONFIGURATION
    # ============================================
    # DeepSeek is FREE and OpenAI SDK compatible!
    # Sign up: https://platform.deepseek.com/
    # Free tier: 5 million tokens/month
    
    OPENAI_API_KEY: Optional[str] = None
    
    # DeepSeek API endpoint (OpenAI compatible)
    # Set this to use DeepSeek instead of OpenAI
    OPENAI_BASE_URL: str = "https://api.deepseek.com/v1"
    
    # Model selection
    # DeepSeek: "deepseek-chat" or "deepseek-coder"
    # OpenAI: "gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"
    LLM_MODEL: str = "deepseek-chat"
    
    LLM_TEMPERATURE: float = 0.3
    LLM_MAX_TOKENS: int = 500
    
    @property
    def llm_config(self) -> dict:
        """Get LLM configuration for API calls"""
        return {
            "api_key": self.OPENAI_API_KEY,
            "base_url": self.OPENAI_BASE_URL,
            "model": self.LLM_MODEL,
            "temperature": self.LLM_TEMPERATURE,
            "max_tokens": self.LLM_MAX_TOKENS
        }
    
    # ============================================
    # BROKER CONFIGURATION (Angel One)
    # ============================================
    ANGEL_ONE_API_KEY: Optional[str] = None
    ANGEL_ONE_API_SECRET: Optional[str] = None
    ANGEL_ONE_CLIENT_CODE: Optional[str] = None
    ANGEL_ONE_PASSWORD: Optional[str] = None
    ANGEL_ONE_TOTP_SECRET: Optional[str] = None
    
    # ============================================
    # TELEGRAM ALERTS
    # ============================================
    TELEGRAM_BOT_TOKEN: Optional[str] = None
    TELEGRAM_CHAT_ID: Optional[str] = None
    
    # ============================================
    # RISK MANAGEMENT
    # ============================================
    MAX_RISK_PER_TRADE: float = 1.0  # 1%
    MAX_DAILY_LOSS: float = 3.0      # 3%
    MAX_WEEKLY_LOSS: float = 6.0     # 6%
    MAX_DRAWDOWN: float = 10.0       # 10%
    MAX_TRADES_PER_DAY: int = 3
    MAX_OPEN_POSITIONS: int = 3
    MIN_RISK_REWARD: float = 1.5
    
    # ============================================
    # SMC ENGINE
    # ============================================
    SWING_STRENGTH: int = 3
    EQUAL_LEVEL_THRESHOLD: float = 0.1  # 0.1%
    FVG_MIN_SIZE: float = 0.1           # 0.1%
    OB_MIN_IMPULSE: float = 0.5         # 0.5%
    
    # ============================================
    # MARKET HOURS (IST)
    # ============================================
    MARKET_START: str = "09:15"
    MARKET_END: str = "15:30"
    
    # ============================================
    # TRADING MODE
    # ============================================
    PAPER_TRADING: bool = True
    
    # ============================================
    # DEPLOYMENT
    # ============================================
    RENDER: bool = False  # Set to true when deploying to Render
    RAILWAY: bool = False  # Set to true when deploying to Railway
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()


# ============================================
# DEEPSEEK CONFIGURATION HELPER
# ============================================

def get_deepseek_config():
    """
    Get DeepSeek configuration
    
    DeepSeek is 100% FREE with 5M tokens/month!
    
    Setup:
    1. Go to https://platform.deepseek.com/
    2. Sign up with email
    3. Create API key
    4. Add to .env:
       OPENAI_API_KEY=sk-xxx
       OPENAI_BASE_URL=https://api.deepseek.com/v1
       LLM_MODEL=deepseek-chat
    """
    return {
        "api_key": settings.OPENAI_API_KEY,
        "base_url": "https://api.deepseek.com/v1",
        "model": "deepseek-chat"
    }


# ============================================
# NEON DATABASE HELPER
# ============================================

def get_neon_db_url():
    """
    Get Neon PostgreSQL connection URL
    
    Setup:
    1. Go to https://neon.tech/
    2. Sign up with GitHub
    3. Create project
    4. Copy connection string to DATABASE_URL
    
    Example:
    postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/trading_ai?sslmode=require
    """
    return settings.DATABASE_URL
