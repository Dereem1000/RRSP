"""Unique serial numbers for company and license records."""

from __future__ import annotations

import json
import re
import uuid
from typing import Any, Optional

# Long, system-specific tokens embedded in every license serial (harder to guess from a glimpse).
MSP_FEATURE_LONG_CODES: dict[str, str] = {
    'pos': 'POINTOFSALE',
    'restaurant': 'RESTAURANT',
    'document': 'DOCUMENT',
    'ecommerce': 'ECOMMERCE',
    'auto': 'AUTOSYSTEM',
    'distribution': 'DISTRIBUTION',
    'crm': 'EVENTSPONSORCRM',
    'customer': 'EVENTSPONSORCRM',
}

# Legacy short codes — parsed for existing DB rows only; never generated for new serials.
LEGACY_SHORT_FEATURE_CODES = frozenset({'POS', 'REST', 'DOC', 'ECOM', 'AUTO', 'DIST', 'CRM', 'GEN'})

LICENSE_KEY_TO_CODE: dict[str, str] = {
    'pos_systems': 'POINTOFSALE',
    'restaurant_management': 'RESTAURANT',
    'document_management': 'DOCUMENT',
    'ecommerce_websites': 'ECOMMERCE',
    'auto_system': 'AUTOSYSTEM',
    'distribution_system': 'DISTRIBUTION',
    'customer_management': 'EVENTSPONSORCRM',
}

CODE_TO_LICENSE_KEY: dict[str, str] = {code: key for key, code in LICENSE_KEY_TO_CODE.items()}

# Portal / legacy feature tokens that may appear in features JSON instead of license keys.
MSP_FEATURE_TO_LICENSE_KEY: dict[str, str] = {
    'pos': 'pos_systems',
    'restaurant': 'restaurant_management',
    'document': 'document_management',
    'ecommerce': 'ecommerce_websites',
    'auto': 'auto_system',
    'distribution': 'distribution_system',
    'crm': 'customer_management',
    'customer': 'customer_management',
}

BUSINESS_LICENSE_FEATURE_KEYS = tuple(LICENSE_KEY_TO_CODE.keys())

# Back-compat alias used by GUI device-license labels.
MSP_FEATURE_CODES = MSP_FEATURE_LONG_CODES

MIN_CLIENT_REF_LEN = 16
MIN_UNIQUE_SUFFIX_LEN = 32

# Old GUI format: LIC-CB12B1C0 (12 chars total)
SHORT_LICENSE_PATTERN = re.compile(r'^LIC-[0-9A-F]{8}$', re.IGNORECASE)
SHORT_COMPANY_PATTERN = re.compile(r'^(COMP|MSP)-[0-9A-F]{8}(-[0-9]{8})?$', re.IGNORECASE)


def normalize_client_ref(msp_client_id: Optional[str]) -> str:
    """Full client reference (up to 32 hex chars) — never truncated to 8 characters."""
    raw = (msp_client_id or uuid.uuid4().hex).replace('-', '').upper()
    if len(raw) < MIN_CLIENT_REF_LEN:
        raw = (raw + uuid.uuid4().hex).upper()
    return raw[:32]


def feature_code_for_msp_feature(msp_feature: str) -> str:
    code = MSP_FEATURE_LONG_CODES.get(msp_feature.lower())
    if code:
        return code
    sanitized = re.sub(r'[^A-Z0-9]', '', msp_feature.upper())
    return sanitized[:24] if sanitized else 'GENERAL'


def parse_license_features(raw: Any) -> dict[str, bool]:
    if isinstance(raw, dict):
        return {str(k): bool(v) for k, v in raw.items()}
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return {str(k): bool(v) for k, v in parsed.items()}
        except json.JSONDecodeError:
            pass
    return {}


def resolve_license_feature_key(features_raw: Any, serial: Optional[str] = None) -> Optional[str]:
    """Resolve the single business license key from features JSON and/or serial."""
    features = parse_license_features(features_raw)
    for key in BUSINESS_LICENSE_FEATURE_KEYS:
        if features.get(key):
            return key
    for alias, key in MSP_FEATURE_TO_LICENSE_KEY.items():
        if features.get(alias):
            return key
    if serial:
        code = primary_system_code_from_serial(serial)
        return CODE_TO_LICENSE_KEY.get(code)
    return None


def primary_system_code(features_raw: Any) -> str:
    features = parse_license_features(features_raw)
    for key, code in LICENSE_KEY_TO_CODE.items():
        if features.get(key):
            return code
    for alias, key in MSP_FEATURE_TO_LICENSE_KEY.items():
        if features.get(alias):
            return LICENSE_KEY_TO_CODE.get(key, 'GENERAL')
    return 'GENERAL'


def _parse_cd_lic_serial(serial: str) -> Optional[dict[str, Any]]:
    if not serial.upper().startswith('CD-LIC-'):
        return None
    parts = serial.split('-')
    if len(parts) < 5:
        return None
    system_code = parts[2]
    unique = parts[-1]
    middle = parts[3:-1]
    client_ref = middle[0] if middle else ''
    device_seat = 1
    if len(middle) >= 2 and middle[1].upper().startswith('D') and middle[1][1:].isdigit():
        device_seat = int(middle[1][1:])
    return {
        'system_code': system_code,
        'client_ref': client_ref,
        'unique': unique,
        'device_seat': device_seat,
    }


def generate_company_serial(msp_client_id: Optional[str] = None) -> str:
    client_ref = normalize_client_ref(msp_client_id)
    unique = uuid.uuid4().hex.upper()
    return f'CD-COMP-{client_ref}-{unique}'


def generate_license_serial(
    *,
    msp_feature: Optional[str] = None,
    feature_code: Optional[str] = None,
    msp_client_id: Optional[str] = None,
    features_raw: Any = None,
    device_seat: Optional[int] = None,
) -> str:
    code = feature_code
    if not code and msp_feature:
        code = feature_code_for_msp_feature(msp_feature)
    if not code:
        code = primary_system_code(features_raw)
    client_ref = normalize_client_ref(msp_client_id)
    unique = uuid.uuid4().hex.upper()
    seat_part = f'-D{int(device_seat)}' if device_seat and int(device_seat) > 1 else ''
    return f'CD-LIC-{code}-{client_ref}{seat_part}-{unique}'


def is_legacy_short_license_serial(serial: str) -> bool:
    if not serial:
        return True
    if SHORT_LICENSE_PATTERN.match(serial):
        return True
    if serial.upper().startswith('LIC-MSP-'):
        return True
    if serial.upper().startswith('CD-LIC-'):
        parsed = _parse_cd_lic_serial(serial)
        if not parsed:
            return True
        if parsed['system_code'] in LEGACY_SHORT_FEATURE_CODES:
            return True
        if len(parsed['system_code']) < 10:
            return True
        if len(parsed['client_ref']) < MIN_CLIENT_REF_LEN:
            return True
        if len(parsed['unique']) < MIN_UNIQUE_SUFFIX_LEN:
            return True
        return False
    return not serial.upper().startswith('CD-LIC-')


def is_legacy_short_company_serial(serial: str) -> bool:
    if not serial:
        return True
    if SHORT_COMPANY_PATTERN.match(serial):
        return True
    if serial.upper().startswith('CD-COMP-'):
        parts = serial.split('-')
        if len(parts) != 4:
            return True
        return len(parts[2]) < MIN_CLIENT_REF_LEN or len(parts[3]) < MIN_UNIQUE_SUFFIX_LEN
    return not serial.upper().startswith('CD-COMP-')


def primary_system_code_from_serial(serial: str) -> str:
    parsed = _parse_cd_lic_serial(serial)
    if parsed:
        token = parsed['system_code'].upper()
        for long_code in LICENSE_KEY_TO_CODE.values():
            if token == long_code:
                return long_code
        if token in LEGACY_SHORT_FEATURE_CODES:
            return token
    upper = serial.upper()
    for token, code in [
        ('POINTOFSALE', 'POINTOFSALE'),
        ('RESTAURANT', 'RESTAURANT'),
        ('DOCUMENT', 'DOCUMENT'),
        ('ECOMMERCE', 'ECOMMERCE'),
        ('AUTOSYSTEM', 'AUTOSYSTEM'),
        ('DISTRIBUTION', 'DISTRIBUTION'),
        ('EVENTSPONSORCRM', 'EVENTSPONSORCRM'),
        ('POS', 'POINTOFSALE'),
        ('REST', 'RESTAURANT'),
        ('DOC', 'DOCUMENT'),
        ('ECOM', 'ECOMMERCE'),
        ('AUTO', 'AUTOSYSTEM'),
        ('DIST', 'DISTRIBUTION'),
        ('CRM', 'EVENTSPONSORCRM'),
        ('CUSTOMER', 'EVENTSPONSORCRM'),
    ]:
        if token in upper:
            return code
    return 'GENERAL'


def count_licenses_for_feature(license_rows, license_feature_key: str) -> int:
    total = 0
    for row in license_rows:
        features = parse_license_features(getattr(row, 'features', row))
        if features.get(license_feature_key):
            total += 1
    return total


def next_device_seat(license_rows, license_feature_key: str) -> int:
    return count_licenses_for_feature(license_rows, license_feature_key) + 1


def binding_status_label(license_row) -> str:
    fp = getattr(license_row, 'browser_fingerprint', None)
    if fp:
        if str(fp).startswith('mac:'):
            return f'MAC/device bound ({str(fp)[:20]}…)'
        return f'Browser/device bound ({str(fp)[:12]}…)'
    if getattr(license_row, 'is_active', False):
        return 'Active — machine/install bound on first use (no browser fingerprint stored)'
    return 'Unassigned — binds to first device on activation'


def ensure_unique_license_serial(
    db_session,
    license_model,
    *,
    msp_feature: Optional[str] = None,
    feature_code: Optional[str] = None,
    msp_client_id: Optional[str] = None,
    features_raw: Any = None,
    device_seat: Optional[int] = None,
    exclude_id: Optional[int] = None,
) -> str:
    for _ in range(8):
        serial = generate_license_serial(
            msp_feature=msp_feature,
            feature_code=feature_code,
            msp_client_id=msp_client_id,
            features_raw=features_raw,
            device_seat=device_seat,
        )
        if is_legacy_short_license_serial(serial):
            continue
        query = license_model.query.filter_by(serial_number=serial)
        if exclude_id is not None:
            query = query.filter(license_model.id != exclude_id)
        if not query.first():
            return serial
    raise RuntimeError('Could not generate a unique license serial')


def ensure_unique_company_serial(db_session, company_model, msp_client_id: Optional[str] = None) -> str:
    for _ in range(8):
        serial = generate_company_serial(msp_client_id)
        if is_legacy_short_company_serial(serial):
            continue
        if not company_model.query.filter_by(serial_number=serial).first():
            return serial
    raise RuntimeError('Could not generate a unique company serial')
