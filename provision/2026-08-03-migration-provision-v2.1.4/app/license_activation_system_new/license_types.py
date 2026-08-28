"""Canonical license type names and duration rules for GUI, API, and sync."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

LICENSE_TYPE_OPTIONS = (
    'Day Pass',
    'Trial 7 Days',
    'Extended 30 Days',
    'One Time License',
    'No Time Limit',
)

DURATION_BY_LICENSE_TYPE: dict[str, int] = {
    'Day Pass': 1,
    'Trial 7 Days': 7,
    'Extended 30 Days': 30,
    'One Time License': 365,
    'No Time Limit': 9999,
}

# Days-field sentinel when type is "No Time Limit" (stored expiration_date is NULL).
NO_TIME_LIMIT_DURATION = 9999

# Legacy MSP tier values that were incorrectly saved in license_type.
LEGACY_MSP_LICENSE_TYPES = frozenset({'basic', 'premium', 'enterprise', 'standard', 'per-job'})

LEGACY_LICENSE_TYPE_TO_GUI: dict[str, str] = {
    'basic': 'Extended 30 Days',
    'standard': 'Extended 30 Days',
    'premium': 'One Time License',
    'enterprise': 'No Time Limit',
    'per-job': 'Day Pass',
}

DEFAULT_LICENSE_TYPE = 'Extended 30 Days'

# Used by API when expiration_date is missing from the database.
API_DURATION_BY_LICENSE_TYPE: dict[str, Optional[int]] = {
    'Day Pass': 1,
    'Trial 7 Days': 7,
    'Extended 30 Days': 30,
    'One Time License': 365,
    'No Time Limit': None,
}


def normalize_license_type(value: Optional[str], default: str = DEFAULT_LICENSE_TYPE) -> str:
    if not value or not str(value).strip():
        return default
    text = str(value).strip()
    if text in LICENSE_TYPE_OPTIONS:
        return text
    legacy = text.lower()
    if legacy in LEGACY_LICENSE_TYPE_TO_GUI:
        return LEGACY_LICENSE_TYPE_TO_GUI[legacy]
    return text


def validate_license_type(value: Optional[str]) -> str:
    license_type = normalize_license_type(value)
    if license_type not in LICENSE_TYPE_OPTIONS:
        options = ', '.join(LICENSE_TYPE_OPTIONS)
        raise ValueError(f'Invalid license type {value!r}. Choose one of: {options}')
    return license_type


def duration_for_license_type(license_type: str) -> int:
    normalized = normalize_license_type(license_type)
    return DURATION_BY_LICENSE_TYPE.get(normalized, DURATION_BY_LICENSE_TYPE[DEFAULT_LICENSE_TYPE])


def parse_duration_days(raw: object, license_type: Optional[str] = None) -> int:
    normalized_type = normalize_license_type(license_type) if license_type else None
    if normalized_type == 'No Time Limit':
        return NO_TIME_LIMIT_DURATION

    if raw is None or raw == '':
        return duration_for_license_type(normalized_type or DEFAULT_LICENSE_TYPE)

    text = str(raw).strip()
    if not text.isdigit():
        raise ValueError(f'Duration must be a whole number of days, not {raw!r}')

    days = int(text)
    if days < 1:
        raise ValueError('Duration must be at least 1 day')
    if days == NO_TIME_LIMIT_DURATION and normalized_type != 'No Time Limit':
        raise ValueError('Use license type "No Time Limit" instead of entering 9999 days')
    if days > 36500:
        raise ValueError('Duration cannot exceed 36500 days — use license type "No Time Limit" instead')
    return days


def is_no_time_limit(license_type: str, duration_days: int = 0) -> bool:
    return normalize_license_type(license_type) == 'No Time Limit'


def expiration_from_activation(
    activation_time: datetime,
    license_type: str,
    duration_days: int,
) -> Optional[datetime]:
    if is_no_time_limit(license_type, duration_days):
        return None
    return activation_time + timedelta(days=duration_days)


def resolve_duration_for_update(license_type: str, duration: int) -> tuple[int, bool]:
    """Return (duration_days, is_no_expiry) for MSP portal push / sync."""
    normalized = validate_license_type(license_type)
    if normalized == 'No Time Limit':
        return NO_TIME_LIMIT_DURATION, True
    if duration == NO_TIME_LIMIT_DURATION:
        raise ValueError('Days cannot be 9999 unless license type is "No Time Limit"')
    if duration < 1:
        raise ValueError('Duration must be at least 1 day')
    if duration > 36500:
        raise ValueError('Duration cannot exceed 36500 days — use license type "No Time Limit" instead')
    return duration, False
