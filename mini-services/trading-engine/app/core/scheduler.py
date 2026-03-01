"""
Core - Scheduler for Market Hours
Automated task scheduling for trading system

Features:
- Market hours scheduling
- Daily tasks (pre-market, market open, market close)
- Predefined trading times
- Async task execution
- Job persistence

Author: Trading AI Agent
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Callable, Any
from datetime import datetime, time, timedelta
from enum import Enum
import asyncio
import pytz

from app.core.config import settings
from app.core.logger import logger


class JobType(Enum):
    """Types of scheduled jobs"""
    PRE_MARKET = "PRE_MARKET"
    MARKET_OPEN = "MARKET_OPEN"
    MARKET_CLOSE = "MARKET_CLOSE"
    POST_MARKET = "POST_MARKET"
    INTRADAY = "INTRADAY"
    HOURLY = "HOURLY"
    CUSTOM = "CUSTOM"


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


@dataclass
class MarketHours:
    """Market Hours Configuration"""
    pre_market_start: time = time(9, 0)   # 9:00 AM IST
    market_open: time = time(9, 15)       # 9:15 AM IST
    market_close: time = time(15, 30)     # 3:30 PM IST
    post_market_end: time = time(16, 0)   # 4:00 PM IST
    
    # Trading days (0=Monday, 6=Sunday)
    trading_days: List[int] = field(default_factory=lambda: [0, 1, 2, 3, 4])
    
    timezone: str = "Asia/Kolkata"


class TradingScheduler:
    """
    Trading Scheduler
    
    Manages automated tasks for trading system:
    - Pre-market scans
    - Market open actions
    - Intraday monitoring
    - Market close actions
    - Post-market analysis
    - Daily reports
    
    Schedule:
    08:45 - Pre-market scan
    09:15 - Market open actions
    15:15 - Market close preparation
    15:30 - Market close actions
    16:00 - Post-market analysis & daily report
    """
    
    def __init__(self, market_hours: MarketHours = None):
        """
        Initialize Scheduler
        
        Args:
            market_hours: Market hours configuration
        """
        self.market_hours = market_hours or MarketHours()
        self.timezone = pytz.timezone(self.market_hours.timezone)
        
        # Jobs storage
        self.jobs: Dict[str, ScheduledJob] = {}
        
        # Internal state
        self._running = False
        self._scheduler_task: Optional[asyncio.Task] = None
        
        # Callbacks for market events
        self._on_pre_market: List[Callable] = []
        self._on_market_open: List[Callable] = []
        self._on_market_close: List[Callable] = []
        self._on_post_market: List[Callable] = []
    
    def is_trading_day(self, date: datetime = None) -> bool:
        """Check if given date is a trading day"""
        if date is None:
            date = datetime.now(self.timezone)
        
        # Check if weekday is trading day
        return date.weekday() in self.market_hours.trading_days
    
    def is_market_open(self, current_time: datetime = None) -> bool:
        """Check if market is currently open"""
        if current_time is None:
            current_time = datetime.now(self.timezone)
        
        if not self.is_trading_day(current_time):
            return False
        
        current = current_time.time()
        return self.market_hours.market_open <= current <= self.market_hours.market_close
    
    def get_next_market_open(self) -> Optional[datetime]:
        """Get next market open datetime"""
        now = datetime.now(self.timezone)
        
        for i in range(7):  # Check next 7 days
            check_date = now + timedelta(days=i)
            
            if self.is_trading_day(check_date):
                if i == 0:  # Today
                    if now.time() < self.market_hours.market_open:
                        return self.timezone.localize(
                            datetime.combine(check_date.date(), self.market_hours.market_open)
                        )
                else:
                    return self.timezone.localize(
                        datetime.combine(check_date.date(), self.market_hours.market_open)
                    )
        
        return None
    
    def get_market_status(self) -> Dict[str, Any]:
        """Get current market status"""
        now = datetime.now(self.timezone)
        current_time = now.time()
        
        status = {
            "is_trading_day": self.is_trading_day(now),
            "is_market_open": False,
            "current_time": now.isoformat(),
            "phase": "CLOSED",
            "next_market_open": None,
            "time_to_open": None,
            "time_to_close": None
        }
        
        if self.is_trading_day(now):
            if current_time < self.market_hours.pre_market_start:
                status["phase"] = "PRE_MARKET_PENDING"
            elif current_time < self.market_hours.market_open:
                status["phase"] = "PRE_MARKET"
            elif current_time <= self.market_hours.market_close:
                status["phase"] = "MARKET_OPEN"
                status["is_market_open"] = True
            elif current_time <= self.market_hours.post_market_end:
                status["phase"] = "POST_MARKET"
            else:
                status["phase"] = "CLOSED"
        
        # Calculate time to open/close
        next_open = self.get_next_market_open()
        if next_open:
            status["next_market_open"] = next_open.isoformat()
            status["time_to_open"] = str(next_open - now)
        
        if status["is_market_open"]:
            close_time = self.timezone.localize(
                datetime.combine(now.date(), self.market_hours.market_close)
            )
            status["time_to_close"] = str(close_time - now)
        
        return status
    
    # ============================================
    # JOB REGISTRATION
    # ============================================
    
    def register_job(self,
                    name: str,
                    job_type: JobType,
                    schedule_time: time,
                    callback: Callable,
                    enabled: bool = True) -> ScheduledJob:
        """
        Register a scheduled job
        
        Args:
            name: Job name
            job_type: Type of job
            schedule_time: Time to run
            callback: Async callback function
            enabled: Whether job is enabled
            
        Returns:
            ScheduledJob object
        """
        job = ScheduledJob(
            name=name,
            job_type=job_type,
            schedule_time=schedule_time,
            callback=callback,
            enabled=enabled
        )
        
        self.jobs[name] = job
        self._update_next_run(job)
        
        logger.info(f"Registered job: {name} at {schedule_time}")
        return job
    
    def register_pre_market(self, callback: Callable, run_time: time = None):
        """Register pre-market task (default: 8:45 AM)"""
        run_time = run_time or time(8, 45)
        return self.register_job("pre_market", JobType.PRE_MARKET, run_time, callback)
    
    def register_market_open(self, callback: Callable, run_time: time = None):
        """Register market open task (default: 9:15 AM)"""
        run_time = run_time or time(9, 15)
        return self.register_job("market_open", JobType.MARKET_OPEN, run_time, callback)
    
    def register_market_close(self, callback: Callable, run_time: time = None):
        """Register market close task (default: 3:30 PM)"""
        run_time = run_time or time(15, 30)
        return self.register_job("market_close", JobType.MARKET_CLOSE, run_time, callback)
    
    def register_post_market(self, callback: Callable, run_time: time = None):
        """Register post-market task (default: 4:00 PM)"""
        run_time = run_time or time(16, 0)
        return self.register_job("post_market", JobType.POST_MARKET, run_time, callback)
    
    def register_intraday(self, callback: Callable, interval_minutes: int = 5):
        """Register intraday task (runs every X minutes during market hours)"""
        name = f"intraday_{interval_minutes}m"
        
        # For intraday, we use current time + interval
        return self.register_job(
            name,
            JobType.INTRADAY,
            time(0, interval_minutes),  # Placeholder
            callback
        )
    
    def register_hourly(self, callback: Callable):
        """Register hourly task"""
        return self.register_job("hourly", JobType.HOURLY, time(0), callback)
    
    def unregister_job(self, name: str) -> bool:
        """Unregister a job"""
        if name in self.jobs:
            del self.jobs[name]
            return True
        return False
    
    def enable_job(self, name: str):
        """Enable a job"""
        if name in self.jobs:
            self.jobs[name].enabled = True
    
    def disable_job(self, name: str):
        """Disable a job"""
        if name in self.jobs:
            self.jobs[name].enabled = False
    
    def _update_next_run(self, job: ScheduledJob):
        """Calculate next run time for a job"""
        now = datetime.now(self.timezone)
        
        if job.job_type == JobType.INTRADAY:
            # For intraday, next run is in X minutes
            interval = job.schedule_time.minute
            next_run = now + timedelta(minutes=interval)
            job.next_run = next_run.replace(second=0, microsecond=0)
        else:
            # For scheduled jobs, find next occurrence
            today_run = self.timezone.localize(
                datetime.combine(now.date(), job.schedule_time)
            )
            
            if today_run > now and self.is_trading_day(today_run):
                job.next_run = today_run
            else:
                # Find next trading day
                for i in range(1, 8):
                    check_date = now + timedelta(days=i)
                    if self.is_trading_day(check_date):
                        job.next_run = self.timezone.localize(
                            datetime.combine(check_date.date(), job.schedule_time)
                        )
                        break
    
    # ============================================
    # SCHEDULER CONTROL
    # ============================================
    
    async def start(self):
        """Start the scheduler"""
        self._running = True
        self._scheduler_task = asyncio.create_task(self._scheduler_loop())
        logger.info("📅 Trading Scheduler started")
    
    async def stop(self):
        """Stop the scheduler"""
        self._running = False
        if self._scheduler_task:
            self._scheduler_task.cancel()
        logger.info("📅 Trading Scheduler stopped")
    
    async def _scheduler_loop(self):
        """Main scheduler loop"""
        while self._running:
            try:
                now = datetime.now(self.timezone)
                
                for job in self.jobs.values():
                    if not job.enabled:
                        continue
                    
                    if job.next_run and now >= job.next_run:
                        # Run the job
                        await self._run_job(job)
                        
                        # Update next run
                        self._update_next_run(job)
                
                # Sleep for 10 seconds before next check (reduced CPU usage)
                await asyncio.sleep(10)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Scheduler loop error: {e}")
                await asyncio.sleep(5)
    
    async def _run_job(self, job: ScheduledJob):
        """Execute a scheduled job"""
        logger.info(f"▶️ Running job: {job.name}")
        
        try:
            # Run callback
            if asyncio.iscoroutinefunction(job.callback):
                await job.callback()
            else:
                job.callback()
            
            # Update job stats
            job.last_run = datetime.now(self.timezone)
            job.run_count += 1
            
            logger.info(f"✅ Job completed: {job.name}")
            
        except Exception as e:
            job.error_count += 1
            job.last_error = str(e)
            logger.error(f"❌ Job failed: {job.name} - {e}")
    
    # ============================================
    # EVENT HANDLERS
    # ============================================
    
    def on_pre_market(self, callback: Callable):
        """Register pre-market callback"""
        self._on_pre_market.append(callback)
    
    def on_market_open(self, callback: Callable):
        """Register market open callback"""
        self._on_market_open.append(callback)
    
    def on_market_close(self, callback: Callable):
        """Register market close callback"""
        self._on_market_close.append(callback)
    
    def on_post_market(self, callback: Callable):
        """Register post-market callback"""
        self._on_post_market.append(callback)
    
    # ============================================
    # JOB STATUS
    # ============================================
    
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
    
    def get_job(self, name: str) -> Optional[Dict]:
        """Get specific job status"""
        if name not in self.jobs:
            return None
        
        job = self.jobs[name]
        return {
            "name": job.name,
            "type": job.job_type.value,
            "schedule_time": job.schedule_time.isoformat(),
            "enabled": job.enabled,
            "last_run": job.last_run.isoformat() if job.last_run else None,
            "next_run": job.next_run.isoformat() if job.next_run else None,
            "run_count": job.run_count,
            "error_count": job.error_count,
            "last_error": job.last_error
        }


class TradingTasks:
    """
    Pre-defined Trading Tasks
    
    Ready-to-use tasks for common trading operations
    """
    
    def __init__(self, scheduler: TradingScheduler):
        """
        Initialize Trading Tasks
        
        Args:
            scheduler: TradingScheduler instance
        """
        self.scheduler = scheduler
    
    async def pre_market_scan(self):
        """
        Pre-market scan task
        
        Runs at 8:45 AM to:
        - Scan for overnight setups
        - Check global markets
        - Prepare watchlist
        """
        logger.info("🔍 Running pre-market scan...")
        
        # Task implementation
        # This would:
        # 1. Fetch yesterday's data
        # 2. Analyze overnight movements
        # 3. Generate watchlist for the day
        # 4. Check for gap-up/down opportunities
        
        return {
            "task": "pre_market_scan",
            "status": "completed",
            "watchlist": []
        }
    
    async def market_open_setup(self):
        """
        Market open setup task
        
        Runs at 9:15 AM to:
        - Connect to broker
        - Start live data feed
        - Enable trading
        """
        logger.info("📈 Market open - starting trading session...")
        
        # Task implementation
        # This would:
        # 1. Verify broker connection
        # 2. Start WebSocket data feed
        # 3. Enable trading
        # 4. Start monitoring
        
        return {
            "task": "market_open_setup",
            "status": "completed"
        }
    
    async def market_close_cleanup(self):
        """
        Market close cleanup task
        
        Runs at 3:30 PM to:
        - Close all intraday positions
        - Stop live data feed
        - Disable trading
        """
        logger.info("📉 Market close - cleaning up...")
        
        # Task implementation
        # This would:
        # 1. Close all open intraday positions
        # 2. Stop live data feed
        # 3. Disable trading
        # 4. Save session data
        
        return {
            "task": "market_close_cleanup",
            "status": "completed"
        }
    
    async def post_market_analysis(self):
        """
        Post-market analysis task
        
        Runs at 4:00 PM to:
        - Analyze today's trades
        - Update learning records
        - Generate daily report
        """
        logger.info("📊 Running post-market analysis...")
        
        # Task implementation
        # This would:
        # 1. Analyze all trades taken today
        # 2. Update learning system
        # 3. Calculate daily metrics
        # 4. Generate and send daily report
        
        return {
            "task": "post_market_analysis",
            "status": "completed"
        }
    
    async def intraday_monitoring(self):
        """
        Intraday monitoring task
        
        Runs every 5 minutes during market hours to:
        - Check open positions
        - Update stop losses
        - Check for new setups
        """
        logger.debug("🔄 Running intraday monitoring...")
        
        # Task implementation
        
        return {
            "task": "intraday_monitoring",
            "status": "completed"
        }
    
    def register_all_tasks(self):
        """Register all default trading tasks"""
        self.scheduler.register_pre_market(self.pre_market_scan)
        self.scheduler.register_market_open(self.market_open_setup)
        self.scheduler.register_market_close(self.market_close_cleanup)
        self.scheduler.register_post_market(self.post_market_analysis)
        self.scheduler.register_intraday(self.intraday_monitoring, 5)
        
        logger.info("All trading tasks registered")


# Singleton instances
_scheduler_instance: Optional[TradingScheduler] = None


def get_scheduler() -> Optional[TradingScheduler]:
    """Get scheduler singleton"""
    return _scheduler_instance


def init_scheduler(market_hours: MarketHours = None) -> TradingScheduler:
    """Initialize scheduler singleton"""
    global _scheduler_instance
    _scheduler_instance = TradingScheduler(market_hours)
    return _scheduler_instance
