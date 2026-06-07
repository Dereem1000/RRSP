"""
Date and Time Formatting Utilities
Provides functions to format dates and times based on system settings
"""
from datetime import datetime, timezone
from typing import Optional
from flask import current_app
from database.models import SystemSettings, db


def get_timezone_setting() -> str:
    """Get the timezone setting from database, default to UTC"""
    try:
        setting = SystemSettings.query.filter_by(setting_key='timezone').first()
        if setting and setting.setting_value:
            return setting.setting_value
    except Exception:
        pass
    return 'UTC'


def get_date_format_setting() -> str:
    """Get the date format setting from database, default to YYYY-MM-DD"""
    try:
        setting = SystemSettings.query.filter_by(setting_key='date_format').first()
        if setting and setting.setting_value:
            return setting.setting_value
    except Exception:
        pass
    return 'YYYY-MM-DD'


def get_time_format_setting() -> str:
    """Get the time format setting from database, default to 24-hour"""
    try:
        setting = SystemSettings.query.filter_by(setting_key='time_format').first()
        if setting and setting.setting_value:
            return setting.setting_value
    except Exception:
        pass
    return '24h'


def format_datetime(dt: datetime, include_time: bool = True) -> str:
    """
    Format a datetime object according to system settings
    
    Args:
        dt: datetime object (should be UTC)
        include_time: whether to include time in the output
    
    Returns:
        Formatted datetime string
    """
    if dt is None:
        return ''
    
    # Ensure datetime is timezone-aware (assume UTC if naive)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    
    # Get settings
    tz_setting = get_timezone_setting()
    date_format = get_date_format_setting()
    time_format = get_time_format_setting()
    
    # Convert to display timezone
    try:
        # Try pytz first (more comprehensive)
        try:
            import pytz
            display_tz = pytz.timezone(tz_setting)
            dt_local = dt.astimezone(display_tz)
        except ImportError:
            # Fallback to zoneinfo (Python 3.9+)
            try:
                from zoneinfo import ZoneInfo
                display_tz = ZoneInfo(tz_setting)
                dt_local = dt.astimezone(display_tz)
            except (ImportError, Exception):
                # If both fail and UTC, just return as is
                if tz_setting == 'UTC':
                    dt_local = dt
                else:
                    # Fallback to UTC if timezone conversion fails
                    dt_local = dt
    except Exception:
        # Fallback to UTC if timezone conversion fails
        dt_local = dt
    
    # Format date
    if date_format == 'MM/DD/YYYY':
        date_str = dt_local.strftime('%m/%d/%Y')
    elif date_format == 'DD/MM/YYYY':
        date_str = dt_local.strftime('%d/%m/%Y')
    elif date_format == 'YYYY-MM-DD':
        date_str = dt_local.strftime('%Y-%m-%d')
    else:
        date_str = dt_local.strftime('%Y-%m-%d')  # Default
    
    if not include_time:
        return date_str
    
    # Format time
    if time_format == '12h':
        time_str = dt_local.strftime('%I:%M %p')
    else:  # 24h
        time_str = dt_local.strftime('%H:%M')
    
    return f"{date_str} {time_str}"


def format_date(dt: datetime) -> str:
    """Format only the date portion"""
    return format_datetime(dt, include_time=False)


def format_time(dt: datetime) -> str:
    """Format only the time portion"""
    if dt is None:
        return ''
    
    # Ensure datetime is timezone-aware
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    
    time_format = get_time_format_setting()
    tz_setting = get_timezone_setting()
    
    # Convert to display timezone
    try:
        # Try pytz first (more comprehensive)
        try:
            import pytz
            display_tz = pytz.timezone(tz_setting)
            dt_local = dt.astimezone(display_tz)
        except ImportError:
            # Fallback to zoneinfo (Python 3.9+)
            try:
                from zoneinfo import ZoneInfo
                display_tz = ZoneInfo(tz_setting)
                dt_local = dt.astimezone(display_tz)
            except (ImportError, Exception):
                # If both fail and UTC, just return as is
                if tz_setting == 'UTC':
                    dt_local = dt
                else:
                    # Fallback to UTC if timezone conversion fails
                    dt_local = dt
    except Exception:
        # Fallback to UTC if timezone conversion fails
        dt_local = dt
    
    if time_format == '12h':
        return dt_local.strftime('%I:%M %p')
    else:  # 24h
        return dt_local.strftime('%H:%M:%S')


def get_current_utc_time() -> datetime:
    """Get current time in UTC (timezone-aware)"""
    return datetime.now(timezone.utc)


def parse_datetime_string(dt_str: str) -> Optional[datetime]:
    """
    Parse a datetime string and return UTC datetime object
    
    Handles ISO format strings with or without timezone info
    """
    if not dt_str:
        return None
    
    try:
        # Try ISO format first
        dt = datetime.fromisoformat(dt_str.replace('Z', '+00:00'))
        # Ensure UTC
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)
        return dt
    except (ValueError, AttributeError):
        # Try common formats
        formats = [
            '%Y-%m-%d %H:%M:%S',
            '%Y-%m-%d %H:%M:%S.%f',
            '%Y-%m-%d',
            '%m/%d/%Y %H:%M:%S',
            '%m/%d/%Y',
            '%d/%m/%Y %H:%M:%S',
            '%d/%m/%Y',
        ]
        for fmt in formats:
            try:
                dt = datetime.strptime(dt_str, fmt)
                return dt.replace(tzinfo=timezone.utc)
            except ValueError:
                continue
        return None

