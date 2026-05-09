"""
Core - Health Monitoring & Auto-Recovery
System health checks and automatic recovery

Features:
- Health status monitoring
- Service health checks
- Auto-recovery mechanisms
- Resource monitoring
- Alert generation on issues

Author: Trading AI Agent
"""

from dataclasses import dataclass, field
from typing import Dict, Optional, List, Callable, Any
from datetime import datetime, timedelta
from enum import Enum
import asyncio
import psutil
import platform

from app.core.logger import logger


class HealthStatus(Enum):
    """Health status levels"""
    HEALTHY = "HEALTHY"
    DEGRADED = "DEGRADED"
    UNHEALTHY = "UNHEALTHY"
    CRITICAL = "CRITICAL"


class ServiceType(Enum):
    """Types of services to monitor"""
    DATABASE = "DATABASE"
    REDIS = "REDIS"
    BROKER = "BROKER"
    DATA_FEED = "DATA_FEED"
    API = "API"
    SYSTEM = "SYSTEM"


@dataclass
class HealthCheck:
    """Health check result"""
    service: ServiceType
    status: HealthStatus
    message: str
    latency_ms: Optional[float] = None
    last_check: datetime = None
    details: Dict[str, Any] = field(default_factory=dict)
    
    def __post_init__(self):
        if self.last_check is None:
            self.last_check = datetime.utcnow()


@dataclass
class SystemResources:
    """System resource usage"""
    cpu_percent: float
    memory_percent: float
    memory_used_gb: float
    memory_total_gb: float
    disk_percent: float
    disk_used_gb: float
    disk_total_gb: float
    network_connections: int
    process_count: int
    uptime_seconds: float


class HealthMonitor:
    """
    Health Monitoring System
    
    Monitors:
    - Database connectivity
    - Redis connectivity
    - Broker connection
    - Data feed status
    - System resources
    - API responsiveness
    
    Actions:
    - Health checks on schedule
    - Auto-recovery on failures
    - Alert generation
    - Metrics collection
    """
    
    def __init__(self,
                 check_interval: int = 30,
                 auto_recover: bool = True,
                 alert_callback: Callable = None):
        """
        Initialize Health Monitor
        
        Args:
            check_interval: Seconds between health checks
            auto_recover: Enable auto-recovery
            alert_callback: Callback for health alerts
        """
        self.check_interval = check_interval
        self.auto_recover = auto_recover
        self.alert_callback = alert_callback
        
        # Health status storage
        self._health_status: Dict[ServiceType, HealthCheck] = {}
        
        # Recovery handlers
        self._recovery_handlers: Dict[ServiceType, Callable] = {}
        
        # Check handlers
        self._check_handlers: Dict[ServiceType, Callable] = {}
        
        # Monitoring state
        self._running = False
        self._monitor_task: Optional[asyncio.Task] = None
        self._start_time = datetime.utcnow()
        
        # Failure tracking
        self._failure_counts: Dict[ServiceType, int] = {}
        self._recovery_attempts: Dict[ServiceType, int] = {}
    
    # ============================================
    # CORE HEALTH CHECKS
    # ============================================
    
    async def check_database(self) -> HealthCheck:
        """Check database health"""
        try:
            start = datetime.utcnow()
            
            # Import database session
            from app.database import SessionLocal
            from sqlalchemy import text
            
            db = SessionLocal()
            try:
                # Execute simple query (SQLAlchemy 2.0 requires text())
                db.execute(text("SELECT 1"))
                latency = (datetime.utcnow() - start).total_seconds() * 1000
                
                return HealthCheck(
                    service=ServiceType.DATABASE,
                    status=HealthStatus.HEALTHY,
                    message="Database connection OK",
                    latency_ms=latency
                )
            finally:
                db.close()
                
        except Exception as e:
            return HealthCheck(
                service=ServiceType.DATABASE,
                status=HealthStatus.UNHEALTHY,
                message=f"Database error: {str(e)}",
                details={"error": str(e)}
            )
    
    async def check_redis(self) -> HealthCheck:
        """Check Redis health"""
        try:
            start = datetime.utcnow()
            
            from app.core.cache import cache
            
            # Try to set and get a value
            test_key = "health_check_test"
            test_value = str(datetime.utcnow())
            
            cache.set(test_key, test_value, ttl=10)
            result = cache.get(test_key)
            
            latency = (datetime.utcnow() - start).total_seconds() * 1000
            
            if result == test_value:
                return HealthCheck(
                    service=ServiceType.REDIS,
                    status=HealthStatus.HEALTHY,
                    message="Redis connection OK",
                    latency_ms=latency
                )
            else:
                return HealthCheck(
                    service=ServiceType.REDIS,
                    status=HealthStatus.DEGRADED,
                    message="Redis read/write mismatch",
                    latency_ms=latency
                )
                
        except Exception as e:
            return HealthCheck(
                service=ServiceType.REDIS,
                status=HealthStatus.UNHEALTHY,
                message=f"Redis error: {str(e)}",
                details={"error": str(e)}
            )
    
    async def check_broker(self) -> HealthCheck:
        """Check broker connection health"""
        try:
            from app.execution.broker import get_broker
            
            broker = get_broker()
            
            if broker is None:
                return HealthCheck(
                    service=ServiceType.BROKER,
                    status=HealthStatus.DEGRADED,
                    message="Broker not configured (paper trading mode)"
                )
            
            if broker.is_connected():
                return HealthCheck(
                    service=ServiceType.BROKER,
                    status=HealthStatus.HEALTHY,
                    message="Broker connected"
                )
            else:
                return HealthCheck(
                    service=ServiceType.BROKER,
                    status=HealthStatus.UNHEALTHY,
                    message="Broker disconnected"
                )
                
        except Exception as e:
            return HealthCheck(
                service=ServiceType.BROKER,
                status=HealthStatus.UNHEALTHY,
                message=f"Broker check error: {str(e)}",
                details={"error": str(e)}
            )
    
    async def check_data_feed(self) -> HealthCheck:
        """Check data feed health"""
        try:
            from app.data.live_feed import get_feed
            
            feed = get_feed()
            
            if feed is None:
                return HealthCheck(
                    service=ServiceType.DATA_FEED,
                    status=HealthStatus.DEGRADED,
                    message="Data feed not initialized"
                )
            
            if feed.is_connected:
                # Check last tick time
                if feed.latest_ticks:
                    latest_time = max(t.timestamp for t in feed.latest_ticks.values())
                    age = (datetime.utcnow() - latest_time).total_seconds()
                    
                    if age < 60:
                        return HealthCheck(
                            service=ServiceType.DATA_FEED,
                            status=HealthStatus.HEALTHY,
                            message=f"Data feed active (last tick {age:.1f}s ago)"
                        )
                    else:
                        return HealthCheck(
                            service=ServiceType.DATA_FEED,
                            status=HealthStatus.DEGRADED,
                            message=f"Data feed stale (last tick {age:.1f}s ago)"
                        )
                else:
                    return HealthCheck(
                        service=ServiceType.DATA_FEED,
                        status=HealthStatus.HEALTHY,
                        message="Data feed connected (no ticks yet)"
                    )
            else:
                return HealthCheck(
                    service=ServiceType.DATA_FEED,
                    status=HealthStatus.UNHEALTHY,
                    message="Data feed disconnected"
                )
                
        except Exception as e:
            return HealthCheck(
                service=ServiceType.DATA_FEED,
                status=HealthStatus.UNHEALTHY,
                message=f"Data feed check error: {str(e)}",
                details={"error": str(e)}
            )
    
    async def check_system_resources(self) -> HealthCheck:
        """Check system resource health"""
        try:
            resources = self.get_system_resources()
            
            status = HealthStatus.HEALTHY
            issues = []
            
            # Check CPU - only warn, don't mark as critical on free tier
            # Free tier often runs at 100% CPU due to limited resources
            if resources.cpu_percent > 95:
                issues.append(f"High CPU: {resources.cpu_percent:.1f}% (normal on free tier)")
            elif resources.cpu_percent > 80:
                issues.append(f"Elevated CPU: {resources.cpu_percent:.1f}%")
            
            # Check Memory
            if resources.memory_percent > 90:
                issues.append(f"High Memory: {resources.memory_percent:.1f}%")
            elif resources.memory_percent > 85:
                issues.append(f"Elevated Memory: {resources.memory_percent:.1f}%")
            
            # Check Disk
            if resources.disk_percent > 95:
                status = HealthStatus.DEGRADED  # Only degrade on disk, not critical
                issues.append(f"Low Disk: {resources.disk_percent:.1f}% used")
            elif resources.disk_percent > 90:
                issues.append(f"Disk space warning: {resources.disk_percent:.1f}% used")
            
            message = "System resources OK" if not issues else "; ".join(issues)
            
            return HealthCheck(
                service=ServiceType.SYSTEM,
                status=status,
                message=message,
                details={
                    "cpu_percent": resources.cpu_percent,
                    "memory_percent": resources.memory_percent,
                    "memory_used_gb": resources.memory_used_gb,
                    "disk_percent": resources.disk_percent,
                    "uptime_seconds": resources.uptime_seconds
                }
            )
            
        except Exception as e:
            return HealthCheck(
                service=ServiceType.SYSTEM,
                status=HealthStatus.UNHEALTHY,
                message=f"System check error: {str(e)}",
                details={"error": str(e)}
            )
    
    def get_system_resources(self) -> SystemResources:
        """Get current system resource usage"""
        # CPU
        cpu_percent = psutil.cpu_percent(interval=1)
        
        # Memory
        memory = psutil.virtual_memory()
        
        # Disk
        disk = psutil.disk_usage('/')
        
        # Network
        connections = len(psutil.net_connections())
        
        # Processes
        process_count = len(psutil.pids())
        
        # Uptime
        uptime = (datetime.utcnow() - self._start_time).total_seconds()
        
        return SystemResources(
            cpu_percent=cpu_percent,
            memory_percent=memory.percent,
            memory_used_gb=memory.used / (1024**3),
            memory_total_gb=memory.total / (1024**3),
            disk_percent=disk.percent,
            disk_used_gb=disk.used / (1024**3),
            disk_total_gb=disk.total / (1024**3),
            network_connections=connections,
            process_count=process_count,
            uptime_seconds=uptime
        )
    
    # ============================================
    # MONITORING CONTROL
    # ============================================
    
    async def start(self):
        """Start health monitoring"""
        self._running = True
        self._monitor_task = asyncio.create_task(self._monitor_loop())
        logger.info("🏥 Health monitoring started")
    
    async def stop(self):
        """Stop health monitoring"""
        self._running = False
        if self._monitor_task:
            self._monitor_task.cancel()
        logger.info("🏥 Health monitoring stopped")
    
    async def _monitor_loop(self):
        """Main monitoring loop"""
        while self._running:
            try:
                # Run all health checks
                await self.run_all_checks()
                
                # Wait for next interval
                await asyncio.sleep(self.check_interval)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Health monitor error: {e}")
                await asyncio.sleep(10)
    
    async def run_all_checks(self) -> Dict[ServiceType, HealthCheck]:
        """Run all health checks"""
        results = {}
        
        # Database
        results[ServiceType.DATABASE] = await self.check_database()
        
        # Redis
        results[ServiceType.REDIS] = await self.check_redis()
        
        # Broker
        results[ServiceType.BROKER] = await self.check_broker()
        
        # Data Feed
        results[ServiceType.DATA_FEED] = await self.check_data_feed()
        
        # System
        results[ServiceType.SYSTEM] = await self.check_system_resources()
        
        # Store results
        for service, check in results.items():
            self._health_status[service] = check
            
            # Check for failures and trigger recovery
            if check.status in [HealthStatus.UNHEALTHY, HealthStatus.CRITICAL]:
                await self._handle_failure(service, check)
            else:
                # Reset failure count on success
                self._failure_counts[service] = 0
        
        return results
    
    async def _handle_failure(self, service: ServiceType, check: HealthCheck):
        """Handle service failure"""
        # Increment failure count
        self._failure_counts[service] = self._failure_counts.get(service, 0) + 1
        
        logger.warning(
            f"⚠️ {service.value} health check failed: {check.message} "
            f"(failures: {self._failure_counts[service]})"
        )
        
        # Send alert
        if self.alert_callback:
            self.alert_callback({
                "level": "CRITICAL" if check.status == HealthStatus.CRITICAL else "WARNING",
                "service": service.value,
                "message": check.message,
                "timestamp": check.last_check.isoformat()
            })
        
        # Attempt auto-recovery
        if self.auto_recover and service in self._recovery_handlers:
            self._recovery_attempts[service] = self._recovery_attempts.get(service, 0) + 1
            
            if self._recovery_attempts[service] <= 3:  # Max 3 recovery attempts
                logger.info(f"🔄 Attempting recovery for {service.value}...")
                
                try:
                    await self._recovery_handlers[service]()
                    logger.info(f"✅ Recovery successful for {service.value}")
                except Exception as e:
                    logger.error(f"❌ Recovery failed for {service.value}: {e}")
    
    # ============================================
    # RECOVERY REGISTRATION
    # ============================================
    
    def register_recovery(self, service: ServiceType, handler: Callable):
        """Register recovery handler for a service"""
        self._recovery_handlers[service] = handler
    
    def register_check(self, service: ServiceType, handler: Callable):
        """Register custom health check for a service"""
        self._check_handlers[service] = handler
    
    # ============================================
    # STATUS RETRIEVAL
    # ============================================
    
    def get_health_status(self) -> Dict[str, Any]:
        """Get overall health status"""
        if not self._health_status:
            return {
                "status": HealthStatus.HEALTHY.value,
                "message": "No checks performed yet",
                "services": {}
            }
        
        # Determine overall status
        worst_status = HealthStatus.HEALTHY
        for check in self._health_status.values():
            if check.status.value > worst_status.value:
                worst_status = check.status
        
        return {
            "status": worst_status.value,
            "timestamp": datetime.utcnow().isoformat(),
            "uptime_seconds": (datetime.utcnow() - self._start_time).total_seconds(),
            "services": {
                service.value: {
                    "status": check.status.value,
                    "message": check.message,
                    "latency_ms": check.latency_ms,
                    "last_check": check.last_check.isoformat(),
                    "details": check.details
                }
                for service, check in self._health_status.items()
            }
        }
    
    def get_service_health(self, service: ServiceType) -> Optional[HealthCheck]:
        """Get health for specific service"""
        return self._health_status.get(service)
    
    def is_healthy(self) -> bool:
        """Check if overall system is healthy"""
        if not self._health_status:
            return True
        
        for check in self._health_status.values():
            if check.status in [HealthStatus.UNHEALTHY, HealthStatus.CRITICAL]:
                return False
        
        return True


# Singleton instance
_health_monitor: Optional[HealthMonitor] = None


def get_health_monitor() -> Optional[HealthMonitor]:
    """Get health monitor singleton"""
    return _health_monitor


def init_health_monitor(check_interval: int = 30,
                       auto_recover: bool = True,
                       alert_callback: Callable = None) -> HealthMonitor:
    """Initialize health monitor singleton"""
    global _health_monitor
    _health_monitor = HealthMonitor(
        check_interval=check_interval,
        auto_recover=auto_recover,
        alert_callback=alert_callback
    )
    return _health_monitor
