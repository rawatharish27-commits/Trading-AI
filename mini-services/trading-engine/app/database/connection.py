"""
Trading AI Agent RAG - Database Connection
Supports SQLite (development) and PostgreSQL (production)
"""

from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
import logging
import time

logger = logging.getLogger(__name__)

# ============================================
# GLOBAL VARIABLES
# ============================================

engine = None
SessionLocal = None
Base = declarative_base()
_db_initialized = False
_using_fallback = False

# ============================================
# DATABASE URL HANDLING
# ============================================

def get_database_url():
    """
    Get database URL with support for SQLite and PostgreSQL
    """
    database_url = os.environ.get('DATABASE_URL', '')
    
    # Default to SQLite if no URL set
    if not database_url:
        database_url = 'sqlite:///./trading.db'
        logger.info("No DATABASE_URL set, using default SQLite")
        return database_url
    
    # Handle file: URLs (convert to SQLite format)
    if database_url.startswith('file:'):
        # Convert file:/path to sqlite:///path
        path = database_url[5:]  # Remove 'file:'
        database_url = f'sqlite:///{path}'
        logger.info(f"Converted file: URL to SQLite: {path}")
        return database_url
    
    # SQLite URLs
    if database_url.startswith('sqlite'):
        logger.info("Using SQLite database")
        return database_url
    
    # Log URL pattern for PostgreSQL (hide credentials)
    if 'postgresql' in database_url:
        # Hide password in logs
        if '@' in database_url:
            parts = database_url.split('@')
            safe_url = parts[0].rsplit(':', 1)[0] + ':***@' + parts[1]
            logger.info(f"PostgreSQL URL: {safe_url}")
        else:
            logger.info(f"PostgreSQL URL pattern detected")
    
    # Already using Supabase pooler - no transformation needed
    if "pooler.supabase.com" in database_url:
        logger.info("✅ Already using Supabase pooler URL")
        # Add required parameters if not present
        if "?" not in database_url:
            database_url += "?pgbouncer=true&sslmode=require&connect_timeout=10"
        else:
            if "pgbouncer" not in database_url:
                database_url += "&pgbouncer=true"
            if "sslmode" not in database_url:
                database_url += "&sslmode=require"
        logger.info("Supabase pooler URL ready")
        return database_url
    
    # Handle Supabase direct URLs - transform to pooler
    if "supabase.co" in database_url:
        logger.info("Detected Supabase direct URL - transforming to pooler...")
        
        # Extract project reference
        import re
        match = re.search(r'db\.([a-z0-9]+)\.supabase\.co', database_url)
        
        if match:
            project_ref = match.group(1)
            logger.info(f"Supabase project: {project_ref}")
            
            # Extract password from URL
            password_match = re.search(r'postgres\.[a-z0-9]+:([^@]+)@', database_url)
            password = password_match.group(1) if password_match else ""
            
            # Build pooler URL
            pooler_url = f"postgresql://postgres.{project_ref}:{password}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"
            pooler_url += "?pgbouncer=true&sslmode=require&connect_timeout=10"
            
            logger.info(f"Transformed to Supabase pooler URL (port 6543)")
            return pooler_url
        
        # Fallback: just change port
        database_url = database_url.replace(":5432", ":6543")
        if "?" in database_url:
            if "pgbouncer" not in database_url:
                database_url += "&pgbouncer=true"
            if "sslmode" not in database_url:
                database_url += "&sslmode=require"
        else:
            database_url += "?pgbouncer=true&sslmode=require"
        
        logger.info("Applied port 6543 transformation")
        return database_url
    
    # Handle Neon PostgreSQL
    if "neon.tech" in database_url:
        if "sslmode" not in database_url:
            database_url += "?sslmode=require" if "?" not in database_url else "&sslmode=require"
        logger.info("Neon PostgreSQL URL configured")
    
    # Handle Railway/Render PostgreSQL
    if "railway.app" in database_url or "render.com" in database_url:
        logger.info("Railway/Render PostgreSQL URL detected")
    
    return database_url


def is_sqlite_db(url: str) -> bool:
    """Check if the database URL is SQLite"""
    return url.startswith('sqlite')


# ============================================
# INITIALIZATION
# ============================================

def init_db():
    """Initialize database with retry logic for PostgreSQL, direct for SQLite"""
    global _db_initialized, _using_fallback, engine, SessionLocal
    
    if _db_initialized:
        return True
    
    try:
        database_url = get_database_url()
    except Exception as e:
        logger.error(f"Database config error: {e}")
        # Fallback to SQLite
        database_url = 'sqlite:///./trading.db'
        _using_fallback = True
        logger.info("Falling back to SQLite database")
    
    # SQLite - simple connection
    if is_sqlite_db(database_url):
        try:
            logger.info("Connecting to SQLite database...")
            
            # SQLite-specific connect args
            engine = create_engine(
                database_url,
                connect_args={"check_same_thread": False},
                echo=False
            )
            
            # Test connection
            with engine.connect() as conn:
                result = conn.execute(text("SELECT 1"))
                logger.info(f"SQLite connection test passed: {result.fetchone()}")
            
            # Create session factory
            SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
            
            # Create tables
            Base.metadata.create_all(bind=engine)
            
            _db_initialized = True
            logger.info("✅ SQLite database initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"SQLite connection failed: {e}")
            return False
    
    # PostgreSQL - with retry logic
    max_retries = 5
    retry_delay = 2
    
    for attempt in range(max_retries):
        try:
            logger.info(f"PostgreSQL connection attempt {attempt + 1}/{max_retries}")
            
            # Create engine
            engine = create_engine(
                database_url,
                pool_pre_ping=True,
                pool_recycle=300,
                pool_size=3,
                max_overflow=5,
                echo=False,
                connect_args={
                    "connect_timeout": 15,
                    "application_name": "trading-ai-agent",
                }
            )
            
            # Test connection
            with engine.connect() as conn:
                result = conn.execute(text("SELECT 1"))
                logger.info(f"Connection test passed: {result.fetchone()}")
            
            # Create session factory
            SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
            
            # Create tables
            Base.metadata.create_all(bind=engine)
            
            _db_initialized = True
            logger.info("✅ PostgreSQL database initialized successfully")
            return True
            
        except Exception as e:
            error_type = type(e).__name__
            error_msg = str(e)[:200]
            logger.error(f"❌ Connection attempt {attempt + 1} failed: {error_type}")
            logger.error(f"   Details: {error_msg}")
            
            if attempt < max_retries - 1:
                logger.info(f"Retrying in {retry_delay}s...")
                time.sleep(retry_delay)
                retry_delay *= 2
            else:
                logger.error("❌ All PostgreSQL connection attempts failed")
                logger.info("Attempting SQLite fallback...")
                
                # Try SQLite fallback
                try:
                    fallback_url = 'sqlite:///./trading.db'
                    engine = create_engine(
                        fallback_url,
                        connect_args={"check_same_thread": False},
                        echo=False
                    )
                    with engine.connect() as conn:
                        conn.execute(text("SELECT 1"))
                    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
                    Base.metadata.create_all(bind=engine)
                    _db_initialized = True
                    _using_fallback = True
                    logger.info("✅ SQLite fallback database initialized")
                    return True
                except Exception as fallback_error:
                    logger.error(f"SQLite fallback also failed: {fallback_error}")
                    return False
    
    return False


def get_db():
    """Get database session"""
    global SessionLocal
    
    if SessionLocal is None:
        if not init_db():
            # Return None if DB not available
            yield None
            return
    
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_db_session():
    """Get database session (non-generator version for convenience)"""
    global SessionLocal
    
    if SessionLocal is None:
        if not init_db():
            return None
    
    return SessionLocal()


def is_db_ready() -> bool:
    """Check if database is ready"""
    return _db_initialized and engine is not None


def is_using_fallback() -> bool:
    """Check if using SQLite fallback"""
    return _using_fallback
