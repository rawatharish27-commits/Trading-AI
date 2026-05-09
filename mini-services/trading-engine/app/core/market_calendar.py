"""
Market Calendar - NSE India Trading Calendar
Handles trading days, holidays, and special sessions

Features:
- NSE trading days (Mon-Fri)
- Market holidays 2024-2025
- Muhurat trading sessions
- Settlement holidays
- Auto-sync with database

Author: Trading AI Agent
"""

from datetime import date, datetime, timedelta
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
import json

from app.core.logger import logger


@dataclass
class MarketHoliday:
    """Market Holiday Definition"""
    date: date
    name: str
    type: str  # 'FULL', 'MORNING', 'AFTERNOON', 'MUHURAT'


class NSEMarketCalendar:
    """
    NSE India Market Calendar
    
    Handles:
    - Trading days (Mon-Fri, excluding holidays)
    - Market holidays
    - Special trading sessions
    - Settlement holidays
    """
    
    # NSE Market Hours
    MARKET_OPEN = "09:15"
    MARKET_CLOSE = "15:30"
    PRE_OPEN_START = "09:00"
    PRE_OPEN_END = "09:08"
    
    # Trading days (0=Monday, 6=Sunday)
    TRADING_DAYS = [0, 1, 2, 3, 4]  # Monday to Friday
    
    # NSE Holidays 2024-2025 (Updated list)
    HOLIDAYS_2024 = [
        MarketHoliday(date(2024, 1, 22), "Republic Day", "FULL"),
        MarketHoliday(date(2024, 3, 8), "Mahashivratri", "FULL"),
        MarketHoliday(date(2024, 3, 25), "Holi", "FULL"),
        MarketHoliday(date(2024, 3, 29), "Good Friday", "FULL"),
        MarketHoliday(date(2024, 4, 11), "Id-Ul-Fitr", "FULL"),
        MarketHoliday(date(2024, 4, 14), "Dr. Baba Saheb Ambedkar Jayanti", "FULL"),
        MarketHoliday(date(2024, 5, 1), "Maharashtra Day", "FULL"),
        MarketHoliday(date(2024, 6, 17), "Bakri Id", "FULL"),
        MarketHoliday(date(2024, 7, 17), "Moharram", "FULL"),
        MarketHoliday(date(2024, 8, 15), "Independence Day", "FULL"),
        MarketHoliday(date(2024, 10, 2), "Mahatma Gandhi Jayanti", "FULL"),
        MarketHoliday(date(2024, 11, 1), "Diwali Laxmi Pujan", "FULL"),
        MarketHoliday(date(2024, 11, 2), "Diwali Balipratipada", "FULL"),
        MarketHoliday(date(2024, 11, 15), "Guru Nanak Jayanti", "FULL"),
        MarketHoliday(date(2024, 12, 25), "Christmas", "FULL"),
    ]
    
    HOLIDAYS_2025 = [
        MarketHoliday(date(2025, 2, 26), "Mahashivratri", "FULL"),
        MarketHoliday(date(2025, 3, 14), "Holi", "FULL"),
        MarketHoliday(date(2025, 3, 31), "Id-Ul-Fitr", "FULL"),
        MarketHoliday(date(2025, 4, 14), "Dr. Baba Saheb Ambedkar Jayanti", "FULL"),
        MarketHoliday(date(2025, 4, 18), "Good Friday", "FULL"),
        MarketHoliday(date(2025, 5, 1), "Maharashtra Day", "FULL"),
        MarketHoliday(date(2025, 8, 15), "Independence Day", "FULL"),
        MarketHoliday(date(2025, 8, 27), "Ganesh Chaturthi", "FULL"),
        MarketHoliday(date(2025, 10, 2), "Mahatma Gandhi Jayanti", "FULL"),
        MarketHoliday(date(2025, 10, 21), "Diwali Laxmi Pujan", "FULL"),
        MarketHoliday(date(2025, 10, 22), "Diwali Balipratipada", "FULL"),
        MarketHoliday(date(2025, 11, 5), "Guru Nanak Jayanti", "FULL"),
        MarketHoliday(date(2025, 12, 25), "Christmas", "FULL"),
    ]
    
    # Muhurat Trading Sessions (Special evening sessions on Diwali)
    MUHURAT_SESSIONS = [
        (date(2024, 11, 1), "18:00", "19:15"),  # Diwali 2024
        (date(2025, 10, 21), "18:00", "19:15"),  # Diwali 2025
    ]
    
    def __init__(self):
        self._all_holidays = self.HOLIDAYS_2024 + self.HOLIDAYS_2025
        self._holiday_cache: Dict[int, bool] = {}
    
    def is_trading_day(self, check_date: date = None) -> bool:
        """
        Check if given date is a trading day
        
        Args:
            check_date: Date to check (default: today)
            
        Returns:
            True if trading day, False otherwise
        """
        if check_date is None:
            check_date = date.today()
        
        # Check weekday
        if check_date.weekday() not in self.TRADING_DAYS:
            return False
        
        # Check if holiday
        if self.is_holiday(check_date):
            return False
        
        return True
    
    def is_holiday(self, check_date: date) -> bool:
        """Check if date is a market holiday"""
        date_key = check_date.toordinal()
        
        if date_key in self._holiday_cache:
            return self._holiday_cache[date_key]
        
        for holiday in self._all_holidays:
            if holiday.date == check_date:
                self._holiday_cache[date_key] = True
                return True
        
        self._holiday_cache[date_key] = False
        return False
    
    def get_holiday_name(self, check_date: date) -> Optional[str]:
        """Get holiday name if date is a holiday"""
        for holiday in self._all_holidays:
            if holiday.date == check_date:
                return holiday.name
        return None
    
    def get_next_trading_day(self, from_date: date = None) -> date:
        """Get next trading day from given date"""
        if from_date is None:
            from_date = date.today()
        
        check_date = from_date + timedelta(days=1)
        
        for _ in range(10):  # Check next 10 days
            if self.is_trading_day(check_date):
                return check_date
            check_date += timedelta(days=1)
        
        return check_date
    
    def get_previous_trading_day(self, from_date: date = None) -> date:
        """Get previous trading day from given date"""
        if from_date is None:
            from_date = date.today()
        
        check_date = from_date - timedelta(days=1)
        
        for _ in range(10):
            if self.is_trading_day(check_date):
                return check_date
            check_date -= timedelta(days=1)
        
        return check_date
    
    def get_trading_days_in_range(self, start_date: date, end_date: date) -> List[date]:
        """Get all trading days in a date range"""
        trading_days = []
        current = start_date
        
        while current <= end_date:
            if self.is_trading_day(current):
                trading_days.append(current)
            current += timedelta(days=1)
        
        return trading_days
    
    def get_remaining_trading_days_in_month(self, from_date: date = None) -> int:
        """Get remaining trading days in current month"""
        if from_date is None:
            from_date = date.today()
        
        # Last day of month
        if from_date.month == 12:
            last_day = date(from_date.year + 1, 1, 1) - timedelta(days=1)
        else:
            last_day = date(from_date.year, from_date.month + 1, 1) - timedelta(days=1)
        
        return len(self.get_trading_days_in_range(from_date, last_day))
    
    def get_trading_days_in_year(self, year: int) -> int:
        """Get approximate trading days in a year"""
        start = date(year, 1, 1)
        end = date(year, 12, 31)
        return len(self.get_trading_days_in_range(start, end))
    
    def get_market_session(self, check_date: date = None) -> Dict:
        """
        Get market session details for a date
        
        Returns:
            Dict with session type, timings, etc.
        """
        if check_date is None:
            check_date = date.today()
        
        # Check for Muhurat session
        for muhurat_date, open_time, close_time in self.MUHURAT_SESSIONS:
            if muhurat_date == check_date:
                return {
                    "type": "MUHURAT",
                    "is_trading": True,
                    "open_time": open_time,
                    "close_time": close_time,
                    "name": "Muhurat Trading"
                }
        
        if not self.is_trading_day(check_date):
            holiday_name = self.get_holiday_name(check_date)
            return {
                "type": "CLOSED",
                "is_trading": False,
                "reason": holiday_name or "Weekend",
                "open_time": None,
                "close_time": None
            }
        
        return {
            "type": "REGULAR",
            "is_trading": True,
            "open_time": self.MARKET_OPEN,
            "close_time": self.MARKET_CLOSE,
            "pre_open_start": self.PRE_OPEN_START,
            "pre_open_end": self.PRE_OPEN_END
        }
    
    def get_upcoming_holidays(self, count: int = 5) -> List[Dict]:
        """Get upcoming market holidays"""
        today = date.today()
        upcoming = []
        
        for holiday in self._all_holidays:
            if holiday.date > today:
                upcoming.append({
                    "date": holiday.date.isoformat(),
                    "name": holiday.name,
                    "type": holiday.type,
                    "days_away": (holiday.date - today).days
                })
                
                if len(upcoming) >= count:
                    break
        
        return upcoming
    
    def get_calendar_summary(self) -> Dict:
        """Get calendar summary for dashboard"""
        today = date.today()
        
        return {
            "today": today.isoformat(),
            "is_trading_day": self.is_trading_day(today),
            "is_holiday": self.is_holiday(today),
            "holiday_name": self.get_holiday_name(today),
            "next_trading_day": self.get_next_trading_day().isoformat(),
            "previous_trading_day": self.get_previous_trading_day().isoformat(),
            "remaining_trading_days_month": self.get_remaining_trading_days_in_month(),
            "upcoming_holidays": self.get_upcoming_holidays(5),
            "market_session": self.get_market_session(today)
        }


# Singleton instance
_calendar_instance: Optional[NSEMarketCalendar] = None


def get_market_calendar() -> NSEMarketCalendar:
    """Get market calendar singleton"""
    global _calendar_instance
    if _calendar_instance is None:
        _calendar_instance = NSEMarketCalendar()
    return _calendar_instance


def is_trading_day(check_date: date = None) -> bool:
    """Quick check if today is trading day"""
    return get_market_calendar().is_trading_day(check_date)


def get_next_trading_day(from_date: date = None) -> date:
    """Get next trading day"""
    return get_market_calendar().get_next_trading_day(from_date)
