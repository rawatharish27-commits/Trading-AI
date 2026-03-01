"""
Core - Error Handling & Retry System
Production-grade error handling with retry logic

Features:
- Retry with exponential backoff
- Circuit breaker pattern
- Graceful degradation
- Error classification
- Recovery strategies

Author: Trading AI Agent
"""

from dataclasses import dataclass, field
from typing import Optional, Callable, Any, Dict, List, Type
from datetime import datetime, timedelta
from enum import Enum
import asyncio
import random
from functools import wraps

from app.core.logger import logger


class ErrorSeverity(Enum):
    """Error severity levels"""
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class ErrorCategory(Enum):
    """Error categories"""
    NETWORK = "NETWORK"
    DATABASE = "DATABASE"
    BROKER = "BROKER"
    DATA = "DATA"
    STRATEGY = "STRATEGY"
    SYSTEM = "SYSTEM"
    UNKNOWN = "UNKNOWN"


@dataclass
class ErrorContext:
    """Error context information"""
    error: Exception
    severity: ErrorSeverity
    category: ErrorCategory
    message: str
    timestamp: datetime = None
    retry_count: int = 0
    max_retries: int = 3
    recoverable: bool = True
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.utcnow()


class CircuitState(Enum):
    """Circuit breaker states"""
    CLOSED = "CLOSED"  # Normal operation
    OPEN = "OPEN"      # Failing, reject all calls
    HALF_OPEN = "HALF_OPEN"  # Testing if recovered


@dataclass
class CircuitBreaker:
    """
    Circuit Breaker Pattern Implementation
    
    Prevents cascading failures by:
    - Tracking failures
    - Opening circuit after threshold
    - Allowing recovery after timeout
    """
    name: str
    failure_threshold: int = 5
    success_threshold: int = 3
    timeout: timedelta = timedelta(seconds=60)
    
    # State
    state: CircuitState = CircuitState.CLOSED
    failure_count: int = 0
    success_count: int = 0
    last_failure_time: Optional[datetime] = None
    
    def can_execute(self) -> bool:
        """Check if execution is allowed"""
        if self.state == CircuitState.CLOSED:
            return True
        
        if self.state == CircuitState.OPEN:
            # Check if timeout has passed
            if self.last_failure_time:
                if datetime.utcnow() - self.last_failure_time > self.timeout:
                    self.state = CircuitState.HALF_OPEN
                    self.success_count = 0
                    return True
            return False
        
        # HALF_OPEN
        return True
    
    def record_success(self):
        """Record successful execution"""
        self.failure_count = 0
        
        if self.state == CircuitState.HALF_OPEN:
            self.success_count += 1
            if self.success_count >= self.success_threshold:
                self.state = CircuitState.CLOSED
                self.success_count = 0
                logger.info(f"✅ Circuit breaker '{self.name}' recovered")
    
    def record_failure(self):
        """Record failed execution"""
        self.failure_count += 1
        self.last_failure_time = datetime.utcnow()
        
        if self.state == CircuitState.HALF_OPEN:
            self.state = CircuitState.OPEN
            logger.warning(f"⚠️ Circuit breaker '{self.name}' reopened")
        
        elif self.failure_count >= self.failure_threshold:
            self.state = CircuitState.OPEN
            logger.error(f"🚨 Circuit breaker '{self.name}' opened due to failures")


class RetryConfig:
    """Retry configuration"""
    def __init__(self,
                 max_retries: int = 3,
                 base_delay: float = 1.0,
                 max_delay: float = 60.0,
                 exponential_base: float = 2.0,
                 jitter: bool = True,
                 retryable_exceptions: List[Type[Exception]] = None):
        """
        Initialize retry config
        
        Args:
            max_retries: Maximum retry attempts
            base_delay: Initial delay in seconds
            max_delay: Maximum delay in seconds
            exponential_base: Base for exponential backoff
            jitter: Add random jitter to delay
            retryable_exceptions: Exceptions that should trigger retry
        """
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.exponential_base = exponential_base
        self.jitter = jitter
        self.retryable_exceptions = retryable_exceptions or [Exception]


def calculate_backoff(attempt: int, config: RetryConfig) -> float:
    """
    Calculate backoff delay with exponential backoff
    
    Formula: delay = min(base_delay * (exponential_base ^ attempt), max_delay)
    """
    delay = config.base_delay * (config.exponential_base ** attempt)
    delay = min(delay, config.max_delay)
    
    if config.jitter:
        # Add random jitter (0.5 to 1.5)
        delay = delay * (0.5 + random.random())
    
    return delay


def with_retry(config: RetryConfig = None,
               circuit_breaker: CircuitBreaker = None,
               on_retry: Callable = None,
               on_failure: Callable = None):
    """
    Decorator for automatic retry with exponential backoff
    
    Usage:
        @with_retry(RetryConfig(max_retries=3))
        async def my_function():
            ...
    """
    if config is None:
        config = RetryConfig()
    
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def async_wrapper(*args, **kwargs) -> Any:
            # Check circuit breaker
            if circuit_breaker and not circuit_breaker.can_execute():
                raise Exception(f"Circuit breaker '{circuit_breaker.name}' is open")
            
            last_error = None
            
            for attempt in range(config.max_retries + 1):
                try:
                    result = await func(*args, **kwargs)
                    
                    # Record success
                    if circuit_breaker:
                        circuit_breaker.record_success()
                    
                    return result
                    
                except Exception as e:
                    last_error = e
                    
                    # Check if retryable
                    if not any(isinstance(e, exc) for exc in config.retryable_exceptions):
                        raise
                    
                    # Last attempt failed
                    if attempt == config.max_retries:
                        if circuit_breaker:
                            circuit_breaker.record_failure()
                        
                        if on_failure:
                            on_failure(e, attempt)
                        
                        raise
                    
                    # Calculate delay
                    delay = calculate_backoff(attempt, config)
                    
                    logger.warning(
                        f"Retry {attempt + 1}/{config.max_retries} for {func.__name__} "
                        f"after {delay:.2f}s. Error: {e}"
                    )
                    
                    if on_retry:
                        on_retry(e, attempt, delay)
                    
                    # Wait before retry
                    await asyncio.sleep(delay)
            
            raise last_error
        
        @wraps(func)
        def sync_wrapper(*args, **kwargs) -> Any:
            # Check circuit breaker
            if circuit_breaker and not circuit_breaker.can_execute():
                raise Exception(f"Circuit breaker '{circuit_breaker.name}' is open")
            
            last_error = None
            
            for attempt in range(config.max_retries + 1):
                try:
                    result = func(*args, **kwargs)
                    
                    if circuit_breaker:
                        circuit_breaker.record_success()
                    
                    return result
                    
                except Exception as e:
                    last_error = e
                    
                    if not any(isinstance(e, exc) for exc in config.retryable_exceptions):
                        raise
                    
                    if attempt == config.max_retries:
                        if circuit_breaker:
                            circuit_breaker.record_failure()
                        
                        if on_failure:
                            on_failure(e, attempt)
                        
                        raise
                    
                    delay = calculate_backoff(attempt, config)
                    
                    import time
                    time.sleep(delay)
            
            raise last_error
        
        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper
    
    return decorator


class ErrorHandler:
    """
    Centralized Error Handler
    
    Features:
    - Error classification
    - Severity assessment
    - Recovery strategies
    - Error logging
    - Alert generation
    """
    
    # Error classification rules
    ERROR_RULES = {
        # Network errors
        ConnectionError: (ErrorSeverity.HIGH, ErrorCategory.NETWORK, True),
        TimeoutError: (ErrorSeverity.MEDIUM, ErrorCategory.NETWORK, True),
        
        # Database errors
        Exception: (ErrorSeverity.HIGH, ErrorCategory.DATABASE, True),  # SQLAlchemy errors
        
        # Broker errors
        ValueError: (ErrorSeverity.MEDIUM, ErrorCategory.BROKER, False),
        
        # Data errors
        KeyError: (ErrorSeverity.MEDIUM, ErrorCategory.DATA, False),
        IndexError: (ErrorSeverity.MEDIUM, ErrorCategory.DATA, False),
    }
    
    def __init__(self):
        self._error_history: List[ErrorContext] = []
        self._max_history = 100
        
        # Circuit breakers for different services
        self._circuit_breakers: Dict[str, CircuitBreaker] = {}
        
        # Recovery strategies
        self._recovery_strategies: Dict[ErrorCategory, Callable] = {}
    
    def classify_error(self, error: Exception) -> ErrorContext:
        """
        Classify an error
        
        Args:
            error: The exception
            
        Returns:
            ErrorContext with classification
        """
        error_type = type(error)
        
        # Find matching rule
        for exc_type, (severity, category, recoverable) in self.ERROR_RULES.items():
            if isinstance(error, exc_type):
                return ErrorContext(
                    error=error,
                    severity=severity,
                    category=category,
                    message=str(error),
                    recoverable=recoverable
                )
        
        # Default classification
        return ErrorContext(
            error=error,
            severity=ErrorSeverity.MEDIUM,
            category=ErrorCategory.UNKNOWN,
            message=str(error),
            recoverable=False
        )
    
    def handle_error(self,
                    error: Exception,
                    context: Dict = None,
                    retry_func: Callable = None) -> Any:
        """
        Handle an error with recovery strategy
        
        Args:
            error: The exception
            context: Additional context
            retry_func: Function to retry
            
        Returns:
            Result of recovery or None
        """
        # Classify error
        error_ctx = self.classify_error(error)
        
        # Store in history
        self._error_history.append(error_ctx)
        if len(self._error_history) > self._max_history:
            self._error_history = self._error_history[-self._max_history:]
        
        # Log error
        self._log_error(error_ctx, context)
        
        # Attempt recovery
        if error_ctx.recoverable and retry_func:
            try:
                return retry_func()
            except Exception as e:
                logger.error(f"Recovery failed: {e}")
        
        # Apply recovery strategy
        if error_ctx.category in self._recovery_strategies:
            try:
                return self._recovery_strategies[error_ctx.category](error_ctx, context)
            except Exception as e:
                logger.error(f"Recovery strategy failed: {e}")
        
        return None
    
    def _log_error(self, error_ctx: ErrorContext, context: Dict = None):
        """Log error based on severity"""
        log_msg = f"[{error_ctx.category.value}] {error_ctx.message}"
        
        if context:
            log_msg += f" | Context: {context}"
        
        if error_ctx.severity == ErrorSeverity.CRITICAL:
            logger.critical(log_msg)
        elif error_ctx.severity == ErrorSeverity.HIGH:
            logger.error(log_msg)
        elif error_ctx.severity == ErrorSeverity.MEDIUM:
            logger.warning(log_msg)
        else:
            logger.info(log_msg)
    
    def get_circuit_breaker(self, name: str,
                           failure_threshold: int = 5,
                           timeout: int = 60) -> CircuitBreaker:
        """Get or create circuit breaker"""
        if name not in self._circuit_breakers:
            self._circuit_breakers[name] = CircuitBreaker(
                name=name,
                failure_threshold=failure_threshold,
                timeout=timedelta(seconds=timeout)
            )
        return self._circuit_breakers[name]
    
    def register_recovery_strategy(self, category: ErrorCategory, strategy: Callable):
        """Register recovery strategy for error category"""
        self._recovery_strategies[category] = strategy
    
    def get_error_history(self, limit: int = 20) -> List[Dict]:
        """Get error history"""
        return [
            {
                "error": str(e.error),
                "severity": e.severity.value,
                "category": e.category.value,
                "message": e.message,
                "timestamp": e.timestamp.isoformat(),
                "recoverable": e.recoverable
            }
            for e in self._error_history[-limit:]
        ]
    
    def get_circuit_breaker_status(self) -> Dict[str, Dict]:
        """Get status of all circuit breakers"""
        return {
            name: {
                "state": cb.state.value,
                "failure_count": cb.failure_count,
                "success_count": cb.success_count,
                "last_failure": cb.last_failure_time.isoformat() if cb.last_failure_time else None
            }
            for name, cb in self._circuit_breakers.items()
        }


# Singleton instance
_error_handler: Optional[ErrorHandler] = None


def get_error_handler() -> ErrorHandler:
    """Get error handler singleton"""
    global _error_handler
    if _error_handler is None:
        _error_handler = ErrorHandler()
    return _error_handler


# Convenience functions
def handle_network_error(error: Exception, context: Dict = None):
    """Handle network-related errors"""
    return get_error_handler().handle_error(
        error,
        context,
        ErrorCategory.NETWORK
    )


def handle_broker_error(error: Exception, context: Dict = None):
    """Handle broker-related errors"""
    return get_error_handler().handle_error(
        error,
        context,
        ErrorCategory.BROKER
    )
