"""
Trading System Scheduler
Cost-effective scheduling with Yahoo Finance (FREE)

Schedule:
- 10:00 AM: Run analysis and generate signals
- 4:00 PM: Fetch data from Yahoo Finance
- Daily: Update signal outcomes

NO Angel One API - Only FREE data sources

Author: Trading AI Agent
"""

from dataclasses import dataclass
from typing import Dict, List, Optional, Callable
from datetime import datetime, time, timedelta, date
from enum import Enum
import asyncio

from app.core.logger import logger
from app.core.market_calendar import get_market_calendar


class JobType(Enum):
    """Scheduled job types"""
    MORNING_ANALYSIS = "MORNING_ANALYSIS"
    DATA_FETCH = "DATA_FETCH"
    OUTCOME_UPDATE = "OUTCOME_UPDATE"


@dataclass
class ScheduledJob:
    """Scheduled job"""
    name: str
    job_type: JobType
    schedule_time: time
    callback: Callable
    enabled: bool = True
    last_run: Optional[datetime] = None
    next_run: Optional[datetime] = None
    run_count: int = 0


class TradingScheduler:
    """Trading System Scheduler"""
    
    def __init__(self):
        self.calendar = get_market_calendar()
        self.jobs: Dict[str, ScheduledJob] = {}
        self._running = False
        self._scheduler_task = None
    
    def register_job(self, name: str, job_type: JobType,
                    schedule_time: time, callback: Callable) -> ScheduledJob:
        """Register a scheduled job"""
        job = ScheduledJob(
            name=name,
            job_type=job_type,
            schedule_time=schedule_time,
            callback=callback
        )
        self.jobs[name] = job
        self._update_next_run(job)
        logger.info(f"✅ Registered job: {name} at {schedule_time}")
        return job
    
    def _update_next_run(self, job: ScheduledJob):
        """Calculate next run time"""
        import pytz
        tz = pytz.timezone("Asia/Kolkata")
        now = datetime.now(tz)
        
        today_run = tz.localize(datetime.combine(now.date(), job.schedule_time))
        
        if today_run > now and self.calendar.is_trading_day(now.date()):
            job.next_run = today_run
        else:
            next_trading = self.calendar.get_next_trading_day(now.date())
            job.next_run = tz.localize(datetime.combine(next_trading, job.schedule_time))
    
    async def start(self):
        """Start scheduler"""
        self._running = True
        self._scheduler_task = asyncio.create_task(self._scheduler_loop())
        logger.info("📅 Trading Scheduler started")
    
    async def stop(self):
        """Stop scheduler"""
        self._running = False
        if self._scheduler_task:
            self._scheduler_task.cancel()
        logger.info("📅 Trading Scheduler stopped")
    
    async def _scheduler_loop(self):
        """Main scheduler loop"""
        import pytz
        tz = pytz.timezone("Asia/Kolkata")
        
        while self._running:
            try:
                now = datetime.now(tz)
                
                for job in self.jobs.values():
                    if not job.enabled:
                        continue
                    
                    if job.next_run and now >= job.next_run:
                        await self._run_job(job)
                        self._update_next_run(job)
                
                await asyncio.sleep(60)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Scheduler error: {e}")
                await asyncio.sleep(30)
    
    async def _run_job(self, job: ScheduledJob):
        """Execute a job"""
        logger.info(f"▶️ Running: {job.name}")
        
        try:
            if asyncio.iscoroutinefunction(job.callback):
                await job.callback()
            else:
                job.callback()
            
            job.last_run = datetime.now()
            job.run_count += 1
            logger.info(f"✅ Completed: {job.name}")
            
        except Exception as e:
            logger.error(f"❌ Failed: {job.name} - {e}")
    
    def get_status(self) -> Dict:
        """Get scheduler status"""
        return {
            "running": self._running,
            "jobs": [
                {
                    "name": j.name,
                    "type": j.job_type.value,
                    "schedule": j.schedule_time.isoformat(),
                    "last_run": j.last_run.isoformat() if j.last_run else None,
                    "next_run": j.next_run.isoformat() if j.next_run else None,
                    "run_count": j.run_count
                }
                for j in self.jobs.values()
            ]
        }


class TradingTasks:
    """Trading system tasks"""
    
    # Symbols to analyze
    SYMBOLS = [
        'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
        'HINDUNILVR', 'SBIN', 'BHARTIARTL', 'ITC', 'KOTAKBANK',
        'LT', 'AXISBANK', 'ASIANPAINT', 'MARUTI', 'SUNPHARMA',
        'TITAN', 'BAJFINANCE', 'DMART', 'WIPRO', 'HCLTECH',
        'ULTRACEMCO', 'NTPC', 'POWERGRID', 'TATAMOTORS', 'TATASTEEL',
        'ONGC', 'JSWSTEEL', 'M&M', 'ADANIENT', 'ADANIPORTS',
        'BAJAJFINSV', 'BPCL', 'BRITANNIA', 'CIPLA', 'COALINDIA',
        'DIVISLAB', 'DRREDDY', 'EICHERMOT', 'GRASIM', 'HEROMOTOCO',
        'HINDALCO', 'INDUSINDBK', 'NESTLEIND', 'SBILIFE', 'TECHM',
        'UPL', 'ZEEL', 'ABBOTINDIA', 'ADANIGREEN'
    ]
    
    def __init__(self, scheduler: TradingScheduler):
        self.scheduler = scheduler
        self._trading_system = None
    
    async def run_morning_analysis(self) -> Dict:
        """Run analysis and generate signals (10:00 AM)"""
        from app.core.trading_system import get_trading_system
        
        system = get_trading_system()
        result = await system.run_analysis_and_generate_signals(self.SYMBOLS)
        
        return result
    
    async def fetch_daily_data(self) -> Dict:
        """Fetch data from Yahoo Finance (4:00 PM)"""
        from app.core.trading_system import get_trading_system
        
        system = get_trading_system()
        result = await system.fetch_and_store_data(self.SYMBOLS)
        
        return result
    
    async def update_outcomes(self) -> Dict:
        """Update signal outcomes (daily check)"""
        from app.core.trading_system import get_trading_system
        
        system = get_trading_system()
        result = await system.update_signal_outcomes()
        
        return result
    
    def register_all_tasks(self):
        """Register all scheduled tasks"""
        from datetime import time as dt_time
        
        # Morning Analysis - 10:00 AM IST
        self.scheduler.register_job(
            name="morning_analysis",
            job_type=JobType.MORNING_ANALYSIS,
            schedule_time=dt_time(10, 0),
            callback=self.run_morning_analysis
        )
        
        # Data Fetch - 4:00 PM IST
        self.scheduler.register_job(
            name="data_fetch",
            job_type=JobType.DATA_FETCH,
            schedule_time=dt_time(16, 0),
            callback=self.fetch_daily_data
        )
        
        # Outcome Update - 5:00 PM IST
        self.scheduler.register_job(
            name="outcome_update",
            job_type=JobType.OUTCOME_UPDATE,
            schedule_time=dt_time(17, 0),
            callback=self.update_outcomes
        )
        
        logger.info("✅ All tasks registered: Analysis at 10AM, Data at 4PM, Outcomes at 5PM")


# Singleton
_scheduler_instance: Optional[TradingScheduler] = None


def get_scheduler() -> Optional[TradingScheduler]:
    """Get scheduler singleton"""
    return _scheduler_instance


def init_scheduler() -> TradingScheduler:
    """Initialize scheduler"""
    global _scheduler_instance
    _scheduler_instance = TradingScheduler()
    return _scheduler_instance
