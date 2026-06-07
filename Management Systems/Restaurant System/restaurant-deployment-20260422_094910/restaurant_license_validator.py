"""
Restaurant License Validator
Simple HTTP-based license validation that connects to Computer Dynamics API
"""

import requests
import json
import os
import hashlib
import hmac as _hmac
import uuid
import struct
import time as _time
from datetime import datetime, timezone, timedelta

# Grace periods per license type (in days) used when the server is offline
_OFFLINE_GRACE_PERIODS = {
    'Day Pass': 1,             # 1 day
    'Trial 7 Days': 3,         # 3 days
    'Extended 30 Days': 7,     # 7 days
    'One Time License': 30,    # 30 days
    'No Time Limit': 30,       # 30 days
}

# Path to the local validation cache file (next to this module)
_CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'license_cache.json')

# Module-level HMAC key — set by init_app() from the Flask SECRET_KEY.
# Falls back to a machine-derived key if the app key is never provided.
_hmac_key: bytes = b''


def _get_machine_fingerprint() -> str:
    """
    Return a stable string that identifies this specific installation.
    Combines machine UUID and the working directory path so the cache
    cannot simply be copied to another machine or directory.
    """
    try:
        node = uuid.getnode()
        # uuid.getnode() returns a random value if no real MAC is found;
        # detect that case (multicast bit set) and fall back gracefully.
        if node & (1 << 40):
            node = 0
        node_bytes = struct.pack('>Q', node)
        path_bytes = os.path.dirname(os.path.abspath(__file__)).encode()
        return hashlib.sha256(node_bytes + path_bytes).hexdigest()
    except Exception:
        return hashlib.sha256(
            os.path.dirname(os.path.abspath(__file__)).encode()
        ).hexdigest()


def _effective_hmac_key() -> bytes:
    """Return the HMAC key to use, falling back to a machine-derived key."""
    if _hmac_key:
        return _hmac_key
    # Derive from machine fingerprint so it is at least installation-specific
    return hashlib.sha256(
        b'license_cache_fallback_' + _get_machine_fingerprint().encode()
    ).digest()


def _compute_mac(payload: str) -> str:
    """Compute HMAC-SHA256 over *payload* using the effective key."""
    return _hmac.new(_effective_hmac_key(), payload.encode(), hashlib.sha256).hexdigest()


def _load_cache():
    """Load the cached license validation result from disk."""
    try:
        if os.path.exists(_CACHE_FILE):
            with open(_CACHE_FILE, 'r') as f:
                return json.load(f)
    except Exception as e:
        print(f"⚠️ Could not read license cache: {e}")
    return None


def _save_cache(serial_number, result):
    """Persist a successful validation result to disk."""
    try:
        cache = {
            'serial_number': serial_number,
            'license_type': result.get('license_type'),
            'expiration_date': result.get('expiration_date'),
            'max_users': result.get('max_users'),
            'features': result.get('features', {}),
            'company_name': result.get('company_name'),
            'contact_person': result.get('contact_person'),
            'registration_date': result.get('registration_date'),
            'machine_fingerprint': _get_machine_fingerprint(),
            'last_validated': datetime.now(timezone.utc).isoformat(),
        }
        # HMAC over the sorted JSON payload — cannot be forged without the key
        payload = json.dumps(cache, sort_keys=True)
        cache['mac'] = _compute_mac(payload)
        with open(_CACHE_FILE, 'w') as f:
            json.dump(cache, f, indent=2)
        print(f"💾 License cache saved (last_validated={cache['last_validated']})")
    except Exception as e:
        print(f"⚠️ Could not save license cache: {e}")


def _verify_cache_mac(cache: dict) -> bool:
    """
    Return True only if the cache MAC is valid AND the machine fingerprint
    matches the current machine.  Fails if either field is missing or wrong.
    """
    stored_mac = cache.get('mac')
    if not stored_mac:
        print("❌ Cache has no MAC — file may have been created by an older version or tampered with")
        return False

    # Reconstruct the payload that was signed (everything except 'mac')
    payload_dict = {k: v for k, v in cache.items() if k != 'mac'}
    payload = json.dumps(payload_dict, sort_keys=True)
    expected_mac = _compute_mac(payload)

    # Constant-time comparison — prevents timing-based MAC oracle attacks
    if not _hmac.compare_digest(stored_mac, expected_mac):
        print("❌ Cache MAC mismatch — file has been tampered with")
        return False

    # Verify the cache was created on this machine / installation
    stored_fp = cache.get('machine_fingerprint', '')
    if not _hmac.compare_digest(stored_fp, _get_machine_fingerprint()):
        print("❌ Cache machine fingerprint mismatch — cache belongs to a different installation")
        return False

    return True


def _try_offline_fallback(serial_number):
    """
    Return a valid result from cache if the license server is unreachable
    and the cached entry is still within its grace period.
    """
    cache = _load_cache()
    if not cache:
        print("❌ No license cache available for offline fallback")
        return {'valid': False, 'error': 'License server unreachable and no offline cache found'}

    # --- Integrity and machine-binding check ---
    if not _verify_cache_mac(cache):
        return {'valid': False, 'error': 'License cache is corrupt or tampered'}

    # Serial number must match
    if cache.get('serial_number') != serial_number:
        print("❌ Cached serial number does not match current license")
        return {'valid': False, 'error': 'License server unreachable and cached license does not match'}

    # Check if the license itself has expired
    expiration_date = cache.get('expiration_date')
    if expiration_date:
        try:
            exp_date = datetime.fromisoformat(expiration_date.replace('Z', '+00:00'))
            if exp_date.tzinfo is None:
                exp_date = exp_date.replace(tzinfo=timezone.utc)
            if exp_date < datetime.now(timezone.utc):
                print("❌ Cached license has expired")
                return {'valid': False, 'error': 'License has expired'}
        except Exception as e:
            print(f"⚠️ Could not parse cached expiration date: {e}")

    # Check grace period based on license type
    license_type = cache.get('license_type', 'Unknown')
    grace_days = _OFFLINE_GRACE_PERIODS.get(license_type, 1)
    grace_delta = timedelta(days=grace_days)

    last_validated_str = cache.get('last_validated')
    if not last_validated_str:
        print("❌ Cache has no last_validated timestamp")
        return {'valid': False, 'error': 'License server unreachable and cache timestamp missing'}

    try:
        last_validated = datetime.fromisoformat(last_validated_str.replace('Z', '+00:00'))
        if last_validated.tzinfo is None:
            last_validated = last_validated.replace(tzinfo=timezone.utc)

        now = datetime.now(timezone.utc)

        # --- Clock-rollback guard ---
        # If system clock is *before* last_validated, the clock has been wound back.
        if now < last_validated:
            print("❌ System clock is earlier than the last validated timestamp — possible clock manipulation")
            return {'valid': False, 'error': 'System clock tampering detected. License validation failed.'}

        elapsed = now - last_validated
        if elapsed > grace_delta:
            grace_str = f"{int(grace_days)} day{'s' if grace_days != 1 else ''}"
            print(f"❌ Offline grace period expired ({grace_str} for {license_type})")
            return {
                'valid': False,
                'error': f'License server unreachable. Offline grace period ({grace_str}) has expired.'
            }
    except Exception as e:
        print(f"⚠️ Could not parse cache timestamp: {e}")
        return {'valid': False, 'error': 'License server unreachable and cache timestamp invalid'}

    grace_str = f"{int(grace_days)} day{'s' if grace_days != 1 else ''}"
    remaining = grace_delta - elapsed
    remaining_hours = int(remaining.total_seconds() // 3600)
    print(f"✅ Offline fallback: using cached license (grace {grace_str}, ~{remaining_hours}h remaining)")

    return {
        'valid': True,
        'license_type': license_type,
        'expiration_date': expiration_date,
        'max_users': cache.get('max_users'),
        'features': cache.get('features', {}),
        'company_name': cache.get('company_name'),
        'contact_person': cache.get('contact_person'),
        'registration_date': cache.get('registration_date'),
        'validation_method': 'offline_cache',
        'offline_mode': True,
        'grace_period': grace_str,
        'grace_remaining_hours': remaining_hours,
    }


class RestaurantLicenseValidator:
    """Simple license validator that only makes HTTP requests to Computer Dynamics API"""
    
    def __init__(self):
        # Computer Dynamics License API Server
        # Use the correct external API URL
        self.validation_server_url = "https://www.computerdynamicstt.com/api/license/validate"
        
    def validate_license_online(self, serial_number, system_info=None):
        """Validate license against Computer Dynamics API server.
        Falls back to a locally cached result (with grace period) when the
        server cannot be reached.
        """
        server_unreachable = False
        try:
            print(f"🔍 Validating license: {serial_number}")
            print(f"🌐 Server URL: {self.validation_server_url}")
            
            # Prepare request data
            request_data = {
                'serial_number': serial_number,
                'system_info': system_info or {'system_type': 'restaurant_management'}
            }
            
            # Make request directly to Flask License API (avoid circular calls)
            response = requests.post(
                self.validation_server_url,
                json=request_data,
                timeout=5,  # Short timeout to avoid hanging
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code == 200:
                result = response.json()
                print(f"📊 Validation result: {result}")
                
                if result.get('valid') or result.get('success'):
                    print("✅ Online validation successful")
                    # Ensure expiration_date is always present
                    expiration_date = result.get('expiration_date')
                    
                    # If expiration_date is missing, calculate based on license_type
                    if not expiration_date:
                        license_type = result.get('license_type', 'Unknown')
                        now = datetime.now(timezone.utc)
                        
                        # Default durations based on license type
                        license_durations = {
                            'Day Pass': 1,
                            'Trial 7 Days': 7,
                            'Extended 30 Days': 30,
                            'One Time License': 365,
                            'No Time Limit': None
                        }
                        
                        duration_days = license_durations.get(license_type, 365)
                        
                        if duration_days is None:
                            expiration_date = (now + timedelta(days=36500)).isoformat()
                        else:
                            expiration_date = (now + timedelta(days=duration_days)).isoformat()
                        
                        print(f"⚠️ Expiration date missing from API, calculated based on '{license_type}': {expiration_date}")
                    
                    validated_result = {
                        'valid': True,
                        'license_type': result.get('license_type'),
                        'expiration_date': expiration_date,
                        'max_users': result.get('max_users'),
                        'features': result.get('features', {}),
                        'company_name': result.get('company_name'),
                        'contact_person': result.get('contact_person'),
                        'registration_date': result.get('registration_date'),
                        'validation_method': 'online'
                    }
                    # Persist successful result for offline use
                    _save_cache(serial_number, validated_result)
                    return validated_result
                else:
                    print(f"❌ Online validation failed: {result.get('error', 'Unknown error')}")
                    return {
                        'valid': False,
                        'error': result.get('error', 'License validation failed')
                    }
            else:
                # Surface the API's own error message when available
                try:
                    api_body = response.json()
                    api_msg = api_body.get('message') or api_body.get('error') or ''
                except Exception:
                    api_msg = ''
                if api_msg:
                    error_msg = api_msg
                else:
                    error_msg = f"API request failed with status {response.status_code}"
                print(f"❌ {error_msg} (HTTP {response.status_code})")
                return {'valid': False, 'error': error_msg}
                
        except requests.exceptions.Timeout:
            print("⏰ Online validation timeout - license server not responding, trying offline cache")
            server_unreachable = True
        except requests.exceptions.ConnectionError:
            print("🔌 Cannot connect to license server, trying offline cache")
            server_unreachable = True
        except Exception as e:
            error_msg = f"Online validation error: {str(e)}"
            print(f"❌ {error_msg}")
            return {'valid': False, 'error': error_msg}

        if server_unreachable:
            return _try_offline_fallback(serial_number)

    def init_app(self, app):
        """Initialize with Flask app — pull SECRET_KEY to use as HMAC key for the cache."""
        global _hmac_key
        secret = app.config.get('SECRET_KEY', '')
        if secret:
            # Derive a dedicated sub-key so the cache key is independent of Flask session signing
            _hmac_key = hashlib.sha256(
                b'license_cache_v1:' + secret.encode() if isinstance(secret, str) else b'license_cache_v1:' + secret
            ).digest()
            print("🔑 License cache HMAC key initialised from app SECRET_KEY")
