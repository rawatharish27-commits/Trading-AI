"""
Database Migration Runner
Run Alembic migrations programmatically
"""

import os
import sys
import logging

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from alembic.config import Config
from alembic import command
from alembic.script import ScriptDirectory
from alembic.runtime.migration import MigrationContext
from sqlalchemy import create_engine, text

logger = logging.getLogger(__name__)


def run_migrations():
    """Run database migrations"""
    try:
        # Get database URL from environment
        database_url = os.environ.get('DATABASE_URL')
        
        if not database_url:
            logger.error("DATABASE_URL not set")
            return False
        
        # Add SSL mode for Supabase/cloud providers
        if "sslmode" not in database_url:
            database_url += "&sslmode=require" if "?" in database_url else "?sslmode=require"
        
        logger.info("🔄 Running database migrations...")
        
        # Create Alembic config
        alembic_cfg = Config()
        alembic_cfg.set_main_option('script_location', 'alembic')
        alembic_cfg.set_main_option('sqlalchemy.url', database_url)
        
        # Check current migration status
        engine = create_engine(database_url)
        
        with engine.connect() as connection:
            # Check if alembic_version table exists and has a version
            try:
                result = connection.execute(text("SELECT version_num FROM alembic_version"))
                current_version = result.scalar()
                logger.info(f"📊 Current database version: {current_version}")
            except Exception:
                # alembic_version table doesn't exist - fresh database
                current_version = None
                logger.info("📊 Fresh database - no migrations applied yet")
        
        # Get the head revision
        script = ScriptDirectory.from_config(alembic_cfg)
        head_revision = script.get_current_head()
        
        if current_version == head_revision:
            logger.info("✅ Database already at latest version, skipping migrations")
            return True
        
        # Run migrations
        command.upgrade(alembic_cfg, 'head')
        
        logger.info("✅ Database migrations completed successfully")
        return True
        
    except Exception as e:
        error_msg = str(e)
        # Check if it's a "table already exists" error - this is fine
        if "already exists" in error_msg.lower() or "DuplicateTable" in error_msg:
            logger.info("ℹ️ Tables already exist, stamping database version...")
            try:
                # Stamp the database as being at the head version
                command.stamp(alembic_cfg, 'head')
                logger.info("✅ Database version stamped successfully")
                return True
            except Exception as stamp_error:
                logger.warning(f"⚠️ Could not stamp version: {stamp_error}")
                return True  # Continue anyway
        
        logger.error(f"❌ Migration error: {type(e).__name__}: {error_msg[:200]}")
        return False


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    success = run_migrations()
    sys.exit(0 if success else 1)
