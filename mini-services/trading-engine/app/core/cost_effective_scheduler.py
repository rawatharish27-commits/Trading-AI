"""
Cost-Effective Trading Scheduler with Full Analysis
Optimized for minimal API calls with comprehensive features

Features:
- Market Calendar Integration (NSE trading days, holidays)
- Full SMC Analysis (Daily + Hourly)
- Confluence Scoring
- Signal Generation
- Decision Agent Integration
- Database Auto-Update

Schedule:
- 10:00 AM IST: Daily Analysis (uses database data)
- 4:00 PM IST: Fetch closing data from Angel One

Author: Trading AI Agent
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Callable, Any
from datetime import datetime, time, timedelta, date
from enum import Enum
import asyncio
import json

from app.core.config import settings
from app.core.logger import logger
from app.core.market_calendar import get_market_calendar, NSEMarketCalendar


class JobType(Enum):
    """Types of scheduled jobs"""
    MORNING_ANALYSIS = "MORNING_ANALYSIS"  # 10:00 AM - Run analysis
    POST_MARKET_DATA = "POST_MARKET_DATA"  # 4:00 PM - Fetch closing data
    WEEKLY_CLEANUP = "WEEKLY_CLEANUP"      # Sunday - Database cleanup


@dataclass
class ScheduledJob:
    """Scheduled Job Definition"""
    name: str
    job_type: JobType
    schedule_time: time
    callback: Callable
    enabled: bool = True
    last_run: Optional[datetime] = None
    next_run: Optional[datetime] = None
    run_count: int = 0
    error_count: int = 0
    last_error: Optional[str] = None


class CostEffectiveScheduler:
    """
    Cost-Effective Trading Scheduler
    
    Schedule:
    - 10:00 AM IST: Daily Analysis (market open)
    - 4:00 PM IST: Fetch closing data (post market)
    - Sunday: Database cleanup
    
    NO live data updates - minimal API calls
    """
    
    def __init__(self):
        self.calendar = get_market_calendar()
        self.timezone = "Asia/Kolkata"
        
        # Jobs storage
        self.jobs: Dict[str, ScheduledJob] = {}
        
        # Internal state
        self._running = False
        self._scheduler_task: Optional[asyncio.Task] = None
        
        # Analysis results
        self._last_analysis: Optional[Dict] = None
        self._last_data_fetch: Optional[Dict] = None
    
    def is_trading_day(self, check_date: date = None) -> bool:
        """Check if given date is a trading day"""
        return self.calendar.is_trading_day(check_date)
    
    def get_market_status(self) -> Dict[str, Any]:
        """Get current market status"""
        return self.calendar.get_calendar_summary()
    
    def register_job(self,
                    name: str,
                    job_type: JobType,
                    schedule_time: time,
                    callback: Callable,
                    enabled: bool = True) -> ScheduledJob:
        """Register a scheduled job"""
        import pytz
        tz = pytz.timezone(self.timezone)
        
        job = ScheduledJob(
            name=name,
            job_type=job_type,
            schedule_time=schedule_time,
            callback=callback,
            enabled=enabled
        )
        
        self.jobs[name] = job
        self._update_next_run(job)
        
        logger.info(f"✅ Registered job: {name} at {schedule_time}")
        return job
    
    def _update_next_run(self, job: ScheduledJob):
        """Calculate next run time for a job"""
        import pytz
        tz = pytz.timezone(self.timezone)
        now = datetime.now(tz)
        
        # Find next occurrence
        today_run = tz.localize(datetime.combine(now.date(), job.schedule_time))
        
        # Check if job should run on non-trading days
        if job.job_type == JobType.WEEKLY_CLEANUP:
            # Weekly cleanup runs on Sundays
            if today_run > now and now.weekday() == 6:
                job.next_run = today_run
            else:
                # Find next Sunday
                days_until_sunday = (6 - now.weekday()) % 7
                if days_until_sunday == 0:
                    days_until_sunday = 7
                next_sunday = now + timedelta(days=days_until_sunday)
                job.next_run = tz.localize(datetime.combine(next_sunday.date(), job.schedule_time))
        else:
            # Trading day jobs
            if today_run > now and self.is_trading_day(now.date()):
                job.next_run = today_run
            else:
                # Find next trading day
                next_trading = self.calendar.get_next_trading_day(now.date())
                job.next_run = tz.localize(datetime.combine(next_trading, job.schedule_time))
    
    async def start(self):
        """Start the scheduler"""
        self._running = True
        self._scheduler_task = asyncio.create_task(self._scheduler_loop())
        logger.info("📅 Cost-Effective Scheduler started - Analysis at 10AM, Data fetch at 4PM")
    
    async def stop(self):
        """Stop the scheduler"""
        self._running = False
        if self._scheduler_task:
            self._scheduler_task.cancel()
        logger.info("📅 Cost-Effective Scheduler stopped")
    
    async def _scheduler_loop(self):
        """Main scheduler loop - Checks every 60 seconds"""
        import pytz
        tz = pytz.timezone(self.timezone)
        
        while self._running:
            try:
                now = datetime.now(tz)
                
                for job in self.jobs.values():
                    if not job.enabled:
                        continue
                    
                    if job.next_run and now >= job.next_run:
                        # Run the job
                        await self._run_job(job)
                        
                        # Update next run
                        self._update_next_run(job)
                
                # Sleep for 60 seconds
                await asyncio.sleep(60)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Scheduler loop error: {e}")
                await asyncio.sleep(30)
    
    async def _run_job(self, job: ScheduledJob):
        """Execute a scheduled job"""
        logger.info(f"▶️ Running job: {job.name}")
        
        try:
            # Run callback
            if asyncio.iscoroutinefunction(job.callback):
                result = await job.callback()
            else:
                result = job.callback()
            
            # Update job stats
            job.last_run = datetime.now()
            job.run_count += 1
            
            logger.info(f"✅ Job completed: {job.name}")
            
        except Exception as e:
            job.error_count += 1
            job.last_error = str(e)
            logger.error(f"❌ Job failed: {job.name} - {e}")
    
    def get_jobs(self) -> List[Dict]:
        """Get all jobs status"""
        return [
            {
                "name": job.name,
                "type": job.job_type.value,
                "schedule_time": job.schedule_time.isoformat(),
                "enabled": job.enabled,
                "last_run": job.last_run.isoformat() if job.last_run else None,
                "next_run": job.next_run.isoformat() if job.next_run else None,
                "run_count": job.run_count,
                "error_count": job.error_count
            }
            for job in self.jobs.values()
        ]


class CostEffectiveTasks:
    """
    Cost-Effective Trading Tasks
    
    Full analysis with minimal API usage:
    - Comprehensive SMC analysis
    - Confluence scoring
    - Signal generation
    - Decision agent validation
    """
    
    # Only 2 timeframes
    TIMEFRAMES = ['1d', '1h']
    
    # Historical data period
    HISTORICAL_YEARS = 2
    
    # Top symbols to analyze
    TOP_SYMBOLS = [
        'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
        'HINDUNILVR', 'SBIN', 'BHARTIARTL', 'ITC', 'KOTAKBANK',
        'LT', 'AXISBANK', 'ASIANPAINT', 'MARUTI', 'SUNPHARMA',
        'TITAN', 'BAJFINANCE', 'DMART', 'WIPRO', 'HCLTECH'
    ]
    
    def __init__(self, scheduler: CostEffectiveScheduler):
        self.scheduler = scheduler
        self._analysis_engine = None
        self._last_analysis_result = None
        self._last_data_fetch_result = None
    
    async def run_daily_analysis(self) -> Dict:
        """
        Run comprehensive daily analysis
        
        Runs at 10:00 AM IST on trading days:
        1. Check market calendar
        2. Load historical data from database
        3. Run full SMC analysis (Daily + Hourly)
        4. Generate signals with confluence scoring
        5. Run decision agent validation
        6. Store results in database
        
        NO API CALLS - Uses cached database data
        """
        logger.info("🔬 Running comprehensive daily analysis...")
        
        # Check if trading day
        if not self.scheduler.is_trading_day():
            logger.info("📅 Not a trading day - skipping analysis")
            return {"status": "skipped", "reason": "Not a trading day"}
        
        try:
            from app.core.comprehensive_analysis import get_analysis_engine
            
            engine = get_analysis_engine()
            
            # Run full analysis
            result = await engine.run_full_analysis(
                symbols=self.TOP_SYMBOLS,
                use_decision_agent=True
            )
            
            self._last_analysis_result = result
            
            # Store results in database
            await self._store_analysis_results(result)
            
            logger.info(f"✅ Analysis complete: {result['symbols_analyzed']} symbols, "
                       f"{result['signals_generated']} signals, {result['signals_approved']} approved")
            
            return result
            
        except Exception as e:
            logger.error(f"Daily analysis error: {e}")
            return {"status": "failed", "error": str(e)}
    
    async def fetch_closing_data(self) -> Dict:
        """
        Fetch closing data after market hours
        
        Runs at 4:00 PM IST on trading days:
        1. Connect to Angel One
        2. Fetch Daily candles (2 years)
        3. Fetch Hourly candles (60 days)
        4. Store in database
        
        This is the ONLY time we call external API
        """
        logger.info("📊 Fetching closing data after market hours...")
        
        # Check if trading day
        if not self.scheduler.is_trading_day():
            logger.info("📅 Not a trading day - skipping data fetch")
            return {"status": "skipped", "reason": "Not a trading day"}
        
        try:
            from app.data.angel_one_data import get_angel_one_fetcher
            from app.database import get_db_session, SymbolCRUD, CandleCRUD, Candle as DBCandle
            from app.core.cache import get_cache
            
            ao = get_angel_one_fetcher()
            
            if not ao.can_connect():
                logger.warning("Angel One not connected")
                return {"status": "failed", "reason": "Angel One not connected"}
            
            # Login if needed
            if not ao.is_connected:
                login_result = ao.login()
                if not login_result.get('status'):
                    return {"status": "failed", "reason": "Login failed"}
            
            total_stored = 0
            failed = 0
            
            for symbol in self.TOP_SYMBOLS:
                try:
                    # Fetch Daily data (2 years = 730 days)
                    daily_candles = ao.get_historical_data(
                        symbol=symbol,
                        interval='1d',
                        days=730
                    )
                    
                    # Fetch Hourly data (60 days)
                    hourly_candles = ao.get_historical_data(
                        symbol=symbol,
                        interval='1h',
                        days=60
                    )
                    
                    # Store in database
                    stored = 0
                    for candles, timeframe in [(daily_candles, '1d'), (hourly_candles, '1h')]:
                        if candles:
                            db = get_db_session()
                            try:
                                symbol_obj = SymbolCRUD.get_or_create(db, symbol)
                                
                                for candle in candles:
                                    existing = db.query(DBCandle).filter(
                                        DBCandle.symbol_id == symbol_obj.id,
                                        DBCandle.timeframe == timeframe,
                                        DBCandle.timestamp == candle.timestamp
                                    ).first()
                                    
                                    if not existing:
                                        db_candle = DBCandle(
                                            symbol_id=symbol_obj.id,
                                            timeframe=timeframe,
                                            timestamp=candle.timestamp,
                                            open=candle.open,
                                            high=candle.high,
                                            low=candle.low,
                                            close=candle.close,
                                            volume=candle.volume
                                        )
                                        db.add(db_candle)
                                        stored += 1
                                
                                db.commit()
                                
                                # Clear cache
                                get_cache().delete(f"candles:{symbol}:{timeframe}")
                                get_cache().delete(f"smc:{symbol}:{timeframe}")
                                
                            except Exception as e:
                                logger.error(f"Database error for {symbol}: {e}")
                                db.rollback()
                            finally:
                                db.close()
                    
                    total_stored += stored
                    
                    # Rate limiting
                    await asyncio.sleep(0.5)
                    
                except Exception as e:
                    logger.error(f"Error fetching {symbol}: {e}")
                    failed += 1
            
            self._last_data_fetch_result = {
                "status": "completed",
                "candles_stored": total_stored,
                "symbols_processed": len(self.TOP_SYMBOLS) - failed,
                "failed": failed,
                "timeframes": self.TIMEFRAMES,
                "timestamp": datetime.now().isoformat()
            }
            
            logger.info(f"✅ Data fetch complete: {total_stored} candles stored")
            
            return self._last_data_fetch_result
            
        except Exception as e:
            logger.error(f"Data fetch error: {e}")
            return {"status": "failed", "error": str(e)}
    
    async def _store_analysis_results(self, result: Dict):
        """Store analysis results in database"""
        try:
            from app.database import get_db_session, SystemLogCRUD
            
            db = get_db_session()
            
            # Log analysis
            SystemLogCRUD.log(
                db, 
                "INFO", 
                "ANALYSIS", 
                f"Daily analysis: {result['symbols_analyzed']} symbols, {result['signals_approved']} signals approved"
            )
            
            # Store signals
            for signal in result.get('signals', []):
                if signal.get('decision') == 'APPROVE':
                    SystemLogCRUD.log(
                        db,
                        "INFO",
                        "SIGNAL",
                        f"Signal: {signal['symbol']} {signal['direction']} (Score: {signal['confluence_score']}, R:R: {signal['levels']['risk_reward']})"
                    )
            
            db.commit()
            db.close()
            
        except Exception as e:
            logger.error(f"Error storing analysis results: {e}")
    
    async def weekly_cleanup(self) -> Dict:
        """
        Weekly database cleanup
        
        Runs on Sundays:
        - Remove old candles (beyond 2 years)
        - Vacuum database
        - Clear cache
        """
        logger.info("🧹 Running weekly cleanup...")
        
        try:
            from app.database import get_db_session, DBCandle
            from app.core.cache import get_cache
            from datetime import datetime, timedelta
            
            db = get_db_session()
            
            # Remove candles older than 2 years
            cutoff = datetime.now() - timedelta(days=730)
            
            deleted = db.query(DBCandle).filter(
                DBCandle.timeframe == '1d',
                DBCandle.timestamp < cutoff
            ).delete()
            
            db.commit()
            db.close()
            
            # Clear all cache
            get_cache().clear()
            
            logger.info(f"✅ Weekly cleanup complete: {deleted} old candles removed")
            
            return {
                "status": "completed",
                "old_candles_removed": deleted
            }
            
        except Exception as e:
            logger.error(f"Weekly cleanup error: {e}")
            return {"status": "failed", "error": str(e)}
    
    def register_all_tasks(self):
        """Register all scheduled tasks"""
        import pytz
        from datetime import time as dt_time
        
        # Morning Analysis - 10:00 AM IST
        self.scheduler.register_job(
            name="morning_analysis",
            job_type=JobType.MORNING_ANALYSIS,
            schedule_time=dt_time(10, 0),
            callback=self.run_daily_analysis
        )
        
        # Post-Market Data Fetch - 4:00 PM IST
        self.scheduler.register_job(
            name="post_market_data",
            job_type=JobType.POST_MARKET_DATA,
            schedule_time=dt_time(16, 0),
            callback=self.fetch_closing_data
        )
        
        # Weekly Cleanup - Sunday 6:00 AM IST
        self.scheduler.register_job(
            name="weekly_cleanup",
            job_type=JobType.WEEKLY_CLEANUP,
            schedule_time=dt_time(6, 0),
            callback=self.weekly_cleanup
        )
        
        logger.info("✅ All tasks registered: Analysis at 10AM, Data fetch at 4PM, Cleanup on Sunday")
    
    def get_status(self) -> Dict:
        """Get current status"""
        return {
            "last_analysis": self._last_analysis_result,
            "last_data_fetch": self._last_data_fetch_result,
            "market_calendar": self.scheduler.get_market_status(),
            "jobs": self.scheduler.get_jobs()
        }
    
    def get_analysis_results(self) -> Dict:
        """Get latest analysis results"""
        if self._last_analysis_result:
            return {
                "analysis_date": self._last_analysis_result.get("analysis_date"),
                "symbols_analyzed": self._last_analysis_result.get("symbols_analyzed"),
                "signals_generated": self._last_analysis_result.get("signals_generated"),
                "signals_approved": self._last_analysis_result.get("signals_approved"),
                "signals": self._last_analysis_result.get("signals", [])[:10],
                "execution_time_ms": self._last_analysis_result.get("execution_time_ms")
            }
        return {"status": "no_analysis_yet"}


# Singleton instance
_scheduler_instance: Optional[CostEffectiveScheduler] = None


def get_scheduler() -> Optional[CostEffectiveScheduler]:
    """Get scheduler singleton"""
    return _scheduler_instance


def init_scheduler() -> CostEffectiveScheduler:
    """Initialize cost-effective scheduler"""
    global _scheduler_instance
    _scheduler_instance = CostEffectiveScheduler()
    return _scheduler_instance
