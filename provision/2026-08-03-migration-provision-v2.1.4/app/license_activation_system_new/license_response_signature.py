"""HMAC signatures for license validation responses (shared secret with AutoM.System)."""
import hashlib
import hmac
import json
import os
from datetime import datetime, timezone


def _canonical_payload(
    *,
    serial_number: str,
    expiration_date: str,
    license_type: str,
    timestamp: str,
) -> str:
    body = {
        "expiration_date": expiration_date or "",
        "license_type": license_type or "",
        "serial_number": serial_number or "",
        "timestamp": timestamp or "",
        "valid": True,
    }
    return json.dumps(body, sort_keys=True, separators=(",", ":"))


def sign_valid_license_response(
    *,
    serial_number: str,
    expiration_date: str,
    license_type: str,
    timestamp: str | None = None,
) -> tuple[str, str]:
    """Return (timestamp_iso, license_signature_hex)."""
    secret = os.environ.get("LICENSE_RESPONSE_SECRET", "").strip()
    if not secret:
        raise ValueError(
            "LICENSE_RESPONSE_SECRET is not set. AutoM requires signed validation responses."
        )

    ts = timestamp or datetime.now(timezone.utc).isoformat()
    message = _canonical_payload(
        serial_number=serial_number,
        expiration_date=expiration_date or "",
        license_type=license_type or "",
        timestamp=ts,
    )
    sig = hmac.new(secret.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).hexdigest()
    return ts, sig
