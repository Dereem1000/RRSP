#!/usr/bin/env python3
"""
Computer Dynamics License API Server
This server provides license validation endpoints for Computer Dynamics products
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import sys
from datetime import datetime, timezone


def _load_local_env() -> None:
    """Load key=value pairs from .env next to this file (no extra dependency)."""
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if not os.path.isfile(env_path):
        return
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


_load_local_env()

# Windows consoles often use cp1252 — avoid crashes on status emoji in logs
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

import json
import logging
from werkzeug.serving import WSGIRequestHandler
from functools import wraps
from collections import defaultdict
from time import time
import hmac

# Configure logging to filter out TLS handshake errors
class TLSHandshakeFilter(logging.Filter):
    """Filter to suppress TLS handshake attempt logs"""
    def filter(self, record):
        # Filter out logs containing TLS handshake indicators
        msg = str(record.getMessage())
        # Only filter if it's specifically a "Bad request version" error (TLS handshake indicator)
        if 'Bad request version' in msg:
            return False  # Don't log TLS handshake attempts
        # Also filter binary data lines that start with escape sequences (TLS handshake data)
        if msg.startswith('"\\x16\\x03') or ('code 400' in msg and any(c in msg for c in ['\\x16', '\\x03', 'À'])):
            return False  # Don't log TLS handshake data
        return True  # Log everything else

# Add the current directory to the path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Import the license validator
from license_validator import LicenseValidator
from license_response_signature import sign_valid_license_response
from models import db, LicenseActivation, CompanyRegistration, SystemConfiguration
from license_serial import parse_license_features

SYSTEM_TYPE_TO_FEATURE_KEY = {
    'crm': 'customer_management',
    'customer_management': 'customer_management',
    'pos': 'pos_systems',
    'pos_system': 'pos_systems',
    'restaurant': 'restaurant_management',
    'restaurant_management': 'restaurant_management',
    'document': 'document_management',
    'document_management': 'document_management',
    'ecommerce': 'ecommerce_websites',
    'ecommerce_websites': 'ecommerce_websites',
    'auto': 'auto_system',
    'auto_system': 'auto_system',
    'distribution': 'distribution_system',
    'distribution_system': 'distribution_system',
}


def license_matches_requested_system(license_row, system_info: dict) -> tuple[bool, str | None]:
    """Return (ok, error_message). Skips check when client omits system_type."""
    if not system_info or not isinstance(system_info, dict):
        return True, None

    raw_type = (
        system_info.get('system_type')
        or system_info.get('system_key')
        or system_info.get('product')
        or ''
    )
    system_type = str(raw_type).strip().lower()
    if not system_type:
        return True, None

    required_key = SYSTEM_TYPE_TO_FEATURE_KEY.get(system_type)
    if not required_key:
        return True, None

    features = parse_license_features(license_row.features if license_row else {})
    if features.get(required_key):
        return True, None

    product = str(system_info.get('product') or system_type).upper()
    return False, f'License is not enabled for {product}'

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('LICENSE_SECRET_KEY', 'your-secret-key-here')
_license_dir = os.path.dirname(os.path.abspath(__file__))
_default_db = os.path.join(_license_dir, 'instance', 'license_system.db')
_license_db = os.environ.get('LICENSE_DB_PATH', _default_db)
if not os.path.isabs(_license_db):
    _license_db = os.path.normpath(os.path.join(_license_dir, '..', _license_db.lstrip('./')))
_license_db_uri = 'sqlite:///' + _license_db.replace('\\', '/')
app.config['SQLALCHEMY_DATABASE_URI'] = _license_db_uri
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Security Configuration
CORS_ORIGINS_ENV = os.environ.get('CORS_ORIGINS', '')
# If CORS_ORIGINS is set, use it; otherwise allow all (for Cloudflare/proxy setups)
ALLOWED_ORIGINS = CORS_ORIGINS_ENV.split(',') if CORS_ORIGINS_ENV else None
RATE_LIMIT_REQUESTS = int(os.environ.get('RATE_LIMIT_REQUESTS', '100'))  # requests per window
RATE_LIMIT_WINDOW = int(os.environ.get('RATE_LIMIT_WINDOW', '60'))  # seconds
BEHIND_CLOUDFLARE = os.environ.get('BEHIND_CLOUDFLARE', 'true').lower() == 'true'

# Initialize database
db.init_app(app)

# Load API key from database (uses existing MSP API token) or environment variable
def get_api_key():
    """Get API key from environment variable, database, or generate a new one"""
    # First, try environment variable
    env_key = os.environ.get('LICENSE_API_KEY')
    if env_key:
        return env_key
    
    # Then, try to load from database (MSP API token)
    try:
        with app.app_context():
            token_config = SystemConfiguration.query.filter_by(config_key='msp_api_token').first()
            if token_config and token_config.config_value:
                print(f'✅ Using existing MSP API token from database')
                return token_config.config_value
    except Exception as e:
        print(f'⚠️  Could not load API key from database: {e}')
    
    # Fallback: generate random key (will show warning)
    return os.urandom(32).hex()

# Get the API key (will be set after app context is available)
API_KEY = None  # Will be initialized in __main__

# Initialize CORS - allow all origins if behind Cloudflare (Cloudflare handles CORS)
# Or restrict to specific origins if CORS_ORIGINS is set
if ALLOWED_ORIGINS:
    CORS(app, origins=ALLOWED_ORIGINS, supports_credentials=True)
else:
    # Allow all origins when behind Cloudflare/proxy (Cloudflare handles security)
    CORS(app, supports_credentials=True)

# Rate limiting storage (in-memory, use Redis in production)
rate_limit_store = defaultdict(list)

# Security headers middleware
@app.after_request
def set_security_headers(response):
    """Add security headers to all responses"""
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    # Don't expose server version
    response.headers['Server'] = 'Computer Dynamics License API'
    return response

def rate_limit(max_requests=RATE_LIMIT_REQUESTS, window=RATE_LIMIT_WINDOW):
    """Rate limiting decorator"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Get client IP - prioritize Cloudflare headers if behind Cloudflare
            if BEHIND_CLOUDFLARE:
                # Cloudflare provides real client IP in these headers
                client_ip = (
                    request.headers.get('CF-Connecting-IP') or  # Cloudflare's real IP header
                    request.headers.get('X-Forwarded-For', '').split(',')[0].strip() or
                    request.headers.get('X-Real-IP') or
                    request.remote_addr
                )
            else:
                # Standard X-Forwarded-For for other proxies
                client_ip = request.environ.get('HTTP_X_FORWARDED_FOR', request.remote_addr)
                if client_ip:
                    client_ip = client_ip.split(',')[0].strip()
                else:
                    client_ip = request.remote_addr
            
            # Clean old entries
            current_time = time()
            rate_limit_store[client_ip] = [
                req_time for req_time in rate_limit_store[client_ip]
                if current_time - req_time < window
            ]
            
            # Check rate limit
            if len(rate_limit_store[client_ip]) >= max_requests:
                return jsonify({
                    'success': False,
                    'error': 'Rate limit exceeded',
                    'message': f'Too many requests. Maximum {max_requests} requests per {window} seconds.',
                    'retry_after': window
                }), 429
            
            # Record this request
            rate_limit_store[client_ip].append(current_time)
            
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def require_api_key(f):
    """Decorator to require API key for sensitive endpoints
    Supports multiple authentication methods:
    - Bearer token (Authorization: Bearer <token>) - matches MSP API style
    - X-API-Key header
    - api_key query parameter
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Try Bearer token first (matches MSP API authentication style)
        auth_header = request.headers.get('Authorization', '')
        api_key = None
        
        if auth_header.startswith('Bearer '):
            api_key = auth_header[7:]  # Remove 'Bearer ' prefix
        else:
            # Fall back to X-API-Key header or query parameter
            api_key = request.headers.get('X-API-Key') or request.args.get('api_key')
        
        if not api_key:
            return jsonify({
                'success': False,
                'error': 'API key required',
                'message': 'This endpoint requires an API key. Provide it via Authorization: Bearer <token> header, X-API-Key header, or api_key query parameter.'
            }), 401
        
        # Get the expected key - always check database first to get latest token
        # This ensures new tokens are used immediately without server restart
        expected_key = os.environ.get('LICENSE_API_KEY')
        if not expected_key:
            # Always check database for latest token (allows token updates without restart)
            try:
                with app.app_context():
                    token_config = SystemConfiguration.query.filter_by(config_key='msp_api_token').first()
                    if token_config and token_config.config_value:
                        expected_key = token_config.config_value
            except Exception:
                # Fallback to cached API_KEY if database query fails
                expected_key = API_KEY
        
        if not expected_key:
            return jsonify({
                'success': False,
                'error': 'Server configuration error',
                'message': 'API key not configured on server.'
            }), 500
        
        if not hmac.compare_digest(api_key, expected_key):
            return jsonify({
                'success': False,
                'error': 'Invalid API key',
                'message': 'The provided API key is invalid.'
            }), 403
        
        return f(*args, **kwargs)
    return decorated_function

def validate_input(data, required_fields=None, max_length=None):
    """Validate input data"""
    if required_fields:
        for field in required_fields:
            if field not in data or not data[field]:
                return False, f'Missing required field: {field}'
    
    if max_length:
        # max_length is a dictionary mapping field names to their max lengths
        if isinstance(max_length, dict):
            for key, value in data.items():
                if key in max_length:
                    max_len = max_length[key]
                    if isinstance(value, str) and len(value) > max_len:
                        return False, f'Field {key} exceeds maximum length of {max_len}'
        else:
            # If max_length is a single integer, apply it to all string fields
            for key, value in data.items():
                if isinstance(value, str) and len(value) > max_length:
                    return False, f'Field {key} exceeds maximum length of {max_length}'
    
    return True, None

# Custom request handler to filter out TLS handshake attempts
class FilteredWSGIRequestHandler(WSGIRequestHandler):
    """Custom request handler that filters out TLS handshake attempts"""
    
    def log_request(self, code='-', size='-'):
        # Filter out TLS handshake attempts
        # TLS handshakes result in 400 errors with "Bad request version" message
        # We'll check the request line to see if it looks like a TLS handshake
        try:
            # Check if the request line contains non-printable characters (TLS handshake indicator)
            if hasattr(self, 'requestline') and self.requestline:
                # TLS handshakes start with \x16\x03, which won't be valid HTTP
                # If requestline is not a valid HTTP request, it's likely a TLS handshake
                if code == 400 and not self.requestline.startswith(('GET ', 'POST ', 'PUT ', 'DELETE ', 'PATCH ', 'HEAD ', 'OPTIONS ')):
                    return  # Silently ignore TLS handshake attempts
        except (AttributeError, Exception):
            # If we can't check, fall back to basic filtering
            pass
        
        # Log normal requests
        super().log_request(code, size)
    
    def log_error(self, *args):
        # Suppress errors for TLS handshake attempts
        # The error message typically contains "Bad request version"
        if len(args) > 0:
            error_msg = str(args[0])
            if 'Bad request version' in error_msg:
                return  # Silently ignore TLS handshake errors
        super().log_error(*args)

# Initialize license validator with app context
license_validator = LicenseValidator(app)

@app.route('/api/license/validate', methods=['POST'])
@rate_limit(max_requests=200, window=60)  # 200 requests per minute (higher limit for production use)
def validate_license():
    """Validate a license serial number"""
    try:
        print('🔍 License validation request received')
        print(f'📋 Request body: {request.get_json()}')
        
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': 'No JSON data provided',
                'message': 'Please provide license validation data in JSON format'
            }), 400
        
        # Debug: Log the raw request data
        print(f'📋 Raw request JSON data: {json.dumps(data, indent=2)}')
        
        # Input validation
        is_valid, error_msg = validate_input(
            data, 
            required_fields=['serial_number'],
            max_length={'serial_number': 255}
        )
        if not is_valid:
            return jsonify({
                'success': False,
                'error': 'Validation error',
                'message': error_msg
            }), 400
        
        # Support both 'serial_number' and 'serialNumber' (camelCase for frontend compatibility)
        serial_number = data.get('serial_number') or data.get('serialNumber')
        system_info = data.get('system_info', {})
        # Check both top-level and system_info for browser_fingerprint
        browser_fingerprint = data.get('browser_fingerprint') or system_info.get('browser_fingerprint')
        
        # Debug: Log what we extracted
        print(f'🔍 Extracted values:')
        print(f'   serial_number: {serial_number}')
        print(f'   browser_fingerprint (top-level): {data.get("browser_fingerprint")}')
        print(f'   browser_fingerprint (system_info): {system_info.get("browser_fingerprint")}')
        print(f'   browser_fingerprint (final): {browser_fingerprint}')
        print(f'   system_info keys: {list(system_info.keys()) if system_info else "None"}')
        print(f'   data keys: {list(data.keys())}')
        
        # Sanitize serial number (basic check)
        if not serial_number or not isinstance(serial_number, str) or len(serial_number.strip()) == 0:
            return jsonify({
                'success': False,
                'error': 'Serial number is required',
                'message': 'Please provide a valid license serial number'
            }), 400
        
        serial_number = serial_number.strip()
        
        print(f'🔍 Validating license: {serial_number}')
        print(f'🔐 Browser fingerprint received: {browser_fingerprint if browser_fingerprint else "None/Not provided"}')
        print(f'📋 Full request data: serial_number={serial_number}, browser_fingerprint={browser_fingerprint}, system_info={system_info}')
        
        # CRITICAL: Check browser fingerprint binding BEFORE validation
        # This must happen first to prevent bound licenses from being validated on wrong devices
        fingerprint_check_passed = True
        fingerprint_error = None
        with app.app_context():
            license = LicenseActivation.query.filter_by(serial_number=serial_number).first()
            if license:
                print(f'🔍 License found in database, checking binding...')
                print(f'   License browser_fingerprint: {license.browser_fingerprint if license.browser_fingerprint else "NOT SET"}')
                
                if license.browser_fingerprint:
                    # License is already bound to a specific browser fingerprint
                    print(f'🔒 License is BOUND to fingerprint: {license.browser_fingerprint}')
                    if browser_fingerprint:
                        if license.browser_fingerprint != browser_fingerprint:
                            print(f'❌ Browser fingerprint mismatch!')
                            print(f'   Expected (bound): {license.browser_fingerprint}')
                            print(f'   Received: {browser_fingerprint}')
                            fingerprint_check_passed = False
                            fingerprint_error = 'License is bound to a different device/browser'
                        else:
                            print(f'✅ Browser fingerprint matches: {browser_fingerprint[:16]}...')
                    else:
                        # License is bound but no fingerprint provided - reject
                        print(f'❌ License is bound but no browser fingerprint provided in request!')
                        print(f'   Bound fingerprint: {license.browser_fingerprint}')
                        fingerprint_check_passed = False
                        fingerprint_error = 'License is bound but no browser fingerprint provided'
                elif browser_fingerprint:
                    # First time activation - bind the browser fingerprint
                    license.browser_fingerprint = browser_fingerprint
                    db.session.commit()
                    print(f'✅ Browser fingerprint bound to license: {browser_fingerprint[:16]}...')
                else:
                    print(f'⚠️  License not bound and no fingerprint provided - will allow validation')
            else:
                print(f'⚠️  License not found in database: {serial_number}')
        
        # If fingerprint check failed, reject immediately BEFORE validation
        if not fingerprint_check_passed:
            print(f'🚫 REJECTING validation due to fingerprint mismatch')
            return jsonify({
                'success': False,
                'valid': False,
                'error': fingerprint_error or 'License is bound to a different device/browser',
                'message': 'This license is already registered to a different browser/device. Please use the original device or contact support for assistance.',
                'timestamp': datetime.now(timezone.utc).isoformat()
            }), 403
        
        # Validate the license directly from database (avoid circular calls)
        try:
            print(f'🔍 About to call validate_license_offline for: {serial_number}')
            validation_result = license_validator.validate_license_offline(serial_number)
            print('📊 Validation result:', validation_result)
        except TypeError as e:
            import traceback
            error_trace = traceback.format_exc()
            if 'not supported between instances' in str(e):
                print(f'❌ Type comparison error: {e}', flush=True)
                print(f'❌ Full traceback:\n{error_trace}', flush=True)
                print(f'   This usually means a field (expiration_date, activation_date, license_type, etc.) is stored as a dict instead of the expected type', flush=True)
                print(f'   Please check the license in the database for serial: {serial_number}', flush=True)
            raise
        except Exception as e:
            import traceback
            error_trace = traceback.format_exc()
            print(f'❌ Unexpected error in validate_license_offline: {e}', flush=True)
            print(f'❌ Full traceback:\n{error_trace}', flush=True)
            raise
        
        if validation_result.get('valid'):
            with app.app_context():
                license_row = LicenseActivation.query.filter_by(serial_number=serial_number).first()
                if license_row:
                    system_ok, system_err = license_matches_requested_system(license_row, system_info)
                    if not system_ok:
                        print(f'🚫 REJECTING validation: {system_err}')
                        return jsonify({
                            'success': False,
                            'valid': False,
                            'error': system_err,
                            'message': system_err,
                            'timestamp': datetime.now(timezone.utc).isoformat(),
                        }), 403
                    from license_serial import parse_license_features, resolve_license_feature_key
                    from msp_integration import MSPClientIntegration

                    feature_key = resolve_license_feature_key(
                        license_row.features,
                        license_row.serial_number,
                    )
                    if feature_key and not parse_license_features(license_row.features).get(feature_key):
                        msp = MSPClientIntegration()
                        license_row.features = json.dumps(
                            msp._build_license_features_for_key(feature_key)
                        )
                        db.session.commit()
                        print(
                            f'✅ Repaired missing features for license: {serial_number} -> {feature_key}'
                        )

            # Convert expiration_date to ISO format string if it exists
            expiration_date = validation_result.get('expiration_date')
            expiration_date_str = None
            
            if expiration_date:
                if hasattr(expiration_date, 'isoformat'):
                    # It's a datetime object
                    expiration_date_str = expiration_date.isoformat()
                elif isinstance(expiration_date, str):
                    # Already a string, try to ensure it's in ISO format
                    expiration_date_str = expiration_date
                else:
                    # Convert to string
                    expiration_date_str = str(expiration_date)
            
            # If expiration_date is still None and we have a license_type, calculate it
            if not expiration_date_str:
                license_type = validation_result.get('license_type', 'Unknown')
                
                # Ensure license_type is a string, not a dict
                if isinstance(license_type, dict):
                    license_type = license_type.get('type', 'One Time License') if isinstance(license_type, dict) else 'One Time License'
                elif not isinstance(license_type, str):
                    license_type = str(license_type) if license_type else 'One Time License'
                
                from datetime import timedelta
                
                # Default durations based on license type
                from license_types import API_DURATION_BY_LICENSE_TYPE, normalize_license_type

                license_type = normalize_license_type(license_type, 'One Time License')
                duration_days = API_DURATION_BY_LICENSE_TYPE.get(license_type, 365)
                
                # Ensure duration_days is a number
                if duration_days is not None and not isinstance(duration_days, (int, float)):
                    print(f"⚠️ duration_days is not numeric: {type(duration_days)} = {duration_days}, using default 365")
                    duration_days = 365
                
                now = datetime.now(timezone.utc)
                
                if duration_days is None:
                    # No Time Limit - set expiration far in the future
                    calculated_expiration = now + timedelta(days=36500)  # 100 years
                else:
                    calculated_expiration = now + timedelta(days=int(duration_days))
                
                expiration_date_str = calculated_expiration.isoformat()
                print(f"⚠️ Expiration date not in database, calculated based on license type '{license_type}': {expiration_date_str}")
            else:
                print(f"✅ Using expiration date from database: {expiration_date_str}")
            
            license_type_val = validation_result.get('license_type')
            if isinstance(license_type_val, dict):
                license_type_str = str(license_type_val.get('type', '') or '')
            else:
                license_type_str = str(license_type_val or '')

            try:
                timestamp_str, license_sig = sign_valid_license_response(
                    serial_number=serial_number,
                    expiration_date=expiration_date_str or '',
                    license_type=license_type_str,
                )
            except ValueError as sign_err:
                print(f'❌ License response signing failed: {sign_err}')
                return jsonify({
                    'success': False,
                    'valid': False,
                    'error': 'License server signing not configured',
                    'message': str(sign_err),
                    'timestamp': datetime.now(timezone.utc).isoformat(),
                }), 500

            # License is valid (signed for AutoM.System verification)
            return jsonify({
                'success': True,
                'valid': True,
                'serial_number': serial_number,
                'license_type': license_type_val,
                'expiration_date': expiration_date_str,
                'max_users': validation_result.get('max_users'),
                'features': validation_result.get('features', {}),
                'validation_method': validation_result.get('validation_method', 'offline'),
                'message': 'License validated successfully',
                'timestamp': timestamp_str,
                'license_signature': license_sig,
            })
        else:
            # License is invalid
            return jsonify({
                'success': False,
                'valid': False,
                'error': validation_result.get('error', 'License validation failed'),
                'message': 'License validation failed',
                'timestamp': datetime.now(timezone.utc).isoformat()
            }), 403
            
    except Exception as e:
        import traceback
        import sys
        error_trace = traceback.format_exc()
        error_type = type(e).__name__
        error_message = str(e)
        
        # Always print to console (stderr to ensure it shows up)
        print(f'❌ License validation error: {error_type}: {error_message}', file=sys.stderr)
        print(f'❌ Full traceback:\n{error_trace}', file=sys.stderr)
        print(f'❌ License validation error: {error_type}: {error_message}')
        print(f'❌ Full traceback:\n{error_trace}')
        
        # Return error with details for debugging
        return jsonify({
            'success': False,
            'valid': False,
            'error': 'Internal server error',
            'message': 'An error occurred while validating the license',
            'details': error_message,  # Always include error message
            'error_type': error_type,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }), 500

@app.route('/api/license/status', methods=['GET'])
@rate_limit(max_requests=30, window=60)  # 30 requests per minute for status
def license_status():
    """Get license system status"""
    try:
        return jsonify({
            'success': True,
            'status': 'operational',
            'message': 'Computer Dynamics License Validation API is operational',
            'endpoints': [
                'POST /api/license/validate - Validate license serial number',
                'GET /api/license/status - Get API status'
            ],
            'version': '1.0.0',
            'timestamp': datetime.now(timezone.utc).isoformat()
        })
    except Exception as e:
        print(f'❌ License status error: {e}')
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': 'An error occurred while checking license system status'
        }), 500

@app.route('/api/license/info', methods=['GET'])
@rate_limit(max_requests=30, window=60)  # 30 requests per minute for info
def license_info():
    """Get license system information"""
    try:
        return jsonify({
            'success': True,
            'system_info': {
                'name': 'Computer Dynamics License Validation System',
                'version': '1.0.0',
                'description': 'License validation API for Computer Dynamics products',
                'supported_systems': [
                    'restaurant_management',
                    'pos_system',
                    'inventory_management',
                    'customer_management',
                    'crm',
                ],
                'validation_methods': [
                    'online',
                    'offline'
                ],
                'features': [
                    'Real-time license validation',
                    'Offline validation fallback',
                    'License expiration checking',
                    'Feature-based access control',
                    'User limit enforcement'
                ]
            },
            'timestamp': datetime.now(timezone.utc).isoformat()
        })
    except Exception as e:
        print(f'❌ License info error: {e}')
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': 'An error occurred while retrieving license system information'
        }), 500

@app.route('/api/license/account-licenses', methods=['POST'])
@require_api_key
@rate_limit(max_requests=30, window=60)
def account_licenses():
    """
    Return active licenses for a company account email (server-to-server only).
    Used by product installers after CD account login — never call from browsers directly.
    """
    try:
        data = request.get_json() or {}
        email = str(data.get('email') or '').strip().lower()
        if not email or '@' not in email:
            return jsonify({
                'success': False,
                'error': 'email is required',
                'message': 'Provide the account email from authenticated CD login',
            }), 400

        system_info = data.get('system_info') or {}
        if not isinstance(system_info, dict):
            system_info = {}
        if data.get('system_type') and not system_info.get('system_type'):
            system_info['system_type'] = data.get('system_type')
        if data.get('product') and not system_info.get('product'):
            system_info['product'] = data.get('product')

        with app.app_context():
            companies = CompanyRegistration.query.filter(
                CompanyRegistration.email.ilike(email)
            ).all()
            if not companies:
                return jsonify({
                    'success': True,
                    'licenses': [],
                    'count': 0,
                    'message': 'No company registration found for this email',
                })

            company_ids = [c.id for c in companies]
            rows = LicenseActivation.query.filter(
                LicenseActivation.company_id.in_(company_ids)
            ).all()

            now = datetime.now(timezone.utc)
            licenses_data = []
            for license_row in rows:
                if not license_row.is_active:
                    continue
                exp = license_row.expiration_date
                if exp is not None:
                    if getattr(exp, 'tzinfo', None) is None:
                        exp = exp.replace(tzinfo=timezone.utc)
                    if exp < now:
                        continue
                system_ok, _system_err = license_matches_requested_system(license_row, system_info)
                if not system_ok:
                    continue
                features = parse_license_features(license_row.features)
                licenses_data.append({
                    'serial_number': license_row.serial_number,
                    'license_type': license_row.license_type,
                    'is_active': bool(license_row.is_active),
                    'max_users': license_row.max_users,
                    'features': features,
                    'activation_date': license_row.activation_date.isoformat() if license_row.activation_date else None,
                    'expiration_date': license_row.expiration_date.isoformat() if license_row.expiration_date else None,
                    'company_name': license_row.company.company_name if license_row.company else None,
                    'company_email': license_row.company.email if license_row.company else email,
                })

            # Prefer longest remaining term
            licenses_data.sort(
                key=lambda item: item.get('expiration_date') or '',
                reverse=True,
            )

            return jsonify({
                'success': True,
                'licenses': licenses_data,
                'count': len(licenses_data),
                'timestamp': datetime.now(timezone.utc).isoformat(),
            })
    except Exception as e:
        print(f'❌ Account licenses error: {e}')
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': 'An error occurred while retrieving account licenses',
            'details': str(e) if app.debug else None,
        }), 500


@app.route('/api/license/licenses', methods=['GET'])
@require_api_key
@rate_limit(max_requests=10, window=60)  # 10 requests per minute, requires API key
def list_licenses():
    """List all licenses in the system (requires API key)"""
    try:
        with app.app_context():
            licenses = LicenseActivation.query.all()
            license_list = []
            
            for license in licenses:
                license_list.append({
                    'id': license.id,
                    'serial_number': license.serial_number,
                    'company_id': license.company_id,
                    'license_type': license.license_type,
                    'is_active': license.is_active,
                    'expiration_date': license.expiration_date.isoformat() if license.expiration_date else None,
                    'max_users': license.max_users,
                    'features': json.loads(license.features) if license.features else {},
                    'created_at': license.created_at.isoformat() if license.created_at else None,
                    'last_online_check': license.last_online_check.isoformat() if license.last_online_check else None
                })
            
            return jsonify({
                'success': True,
                'licenses': license_list,
                'count': len(license_list),
                'timestamp': datetime.now(timezone.utc).isoformat()
            })
    except Exception as e:
        print(f'❌ List licenses error: {e}')
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': 'An error occurred while retrieving licenses'
        }), 500

@app.route('/api/license/clients/<int:client_id>/licenses', methods=['GET'])
@require_api_key
@rate_limit(max_requests=20, window=60)  # 20 requests per minute, requires API key
def get_client_licenses(client_id):
    """Get licenses for a specific client"""
    try:
        print(f'Getting licenses for client ID: {client_id}')
        
        # For now, return all licenses since we don't have client mapping
        # In a real system, you would query by client email or other identifier
        with app.app_context():
            licenses = LicenseActivation.query.all()
            
            if not licenses:
                return jsonify({
                    'success': True,
                    'licenses': [],
                    'message': f'No licenses found in system'
                })
            
            licenses_data = []
            for license in licenses:
                licenses_data.append({
                    'id': license.id,
                    'serial_number': license.serial_number,
                    'license_type': license.license_type,
                    'service_level': license.service_level,
                    'is_active': license.is_active,
                    'max_users': license.max_users,
                    'features': json.loads(license.features) if license.features else {},
                    'activation_date': license.activation_date.isoformat() if license.activation_date else None,
                    'expiration_date': license.expiration_date.isoformat() if license.expiration_date else None,
                    'company_name': license.company.company_name if license.company else None
                })
            
            print(f'Found {len(licenses_data)} licenses in system')
            return jsonify({
                'success': True,
                'licenses': licenses_data,
                'count': len(licenses_data)
            })
        
    except Exception as e:
        print(f'❌ Error getting client licenses: {e}')
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': 'An error occurred while fetching client licenses',
            'details': str(e) if app.debug else None
        }), 500

@app.route('/health', methods=['GET'])
@rate_limit(max_requests=100, window=60)  # Health checks can be more frequent
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'service': 'Computer Dynamics License API'
    })

@app.errorhandler(404)
def not_found(error):
    return jsonify({
        'success': False,
        'error': 'Not found',
        'message': 'The requested endpoint was not found'
    }), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({
        'success': False,
        'error': 'Internal server error',
        'message': 'An unexpected error occurred'
    }), 500

if __name__ == '__main__':
    # Create database tables
    with app.app_context():
        db.create_all()
        print('Database tables created')
        
        # Initialize API key from database or environment
        # Note: Token is loaded dynamically on each request, so updates take effect immediately
        # API_KEY is already a module-level variable, so we can assign directly
        API_KEY = get_api_key()
        if not os.environ.get('LICENSE_API_KEY'):
            token_config = SystemConfiguration.query.filter_by(config_key='msp_api_token').first()
            if token_config and token_config.config_value:
                print(f'✅ Using MSP API token from database as license server API key')
                print(f'   Token will be reloaded automatically when updated in settings (no restart needed)')
            else:
                print(f'⚠️  WARNING: No MSP API token found in database. Using generated key.')
                print(f'   Set LICENSE_API_KEY environment variable or configure MSP API token in settings.')
    
    # Configure logging to filter TLS handshake attempts
    werkzeug_logger = logging.getLogger('werkzeug')
    werkzeug_logger.addFilter(TLSHandshakeFilter())
    
    # Start the server
    port = int(os.environ.get('LICENSE_API_PORT', os.environ.get('PORT', 5001)))
    debug = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
    
    print(f'Starting Computer Dynamics License API Server on port {port}')
    print(f'License validation endpoint: http://localhost:{port}/api/license/validate')
    print(f'Status endpoint: http://localhost:{port}/api/license/status')
    print(f'Info endpoint: http://localhost:{port}/api/license/info')
    print(f'Licenses endpoint: http://localhost:{port}/api/license/licenses (requires API key)')
    print(f'Health check: http://localhost:{port}/health')
    print(f'\n🔒 Security Features Enabled:')
    print(f'   - Rate limiting: {RATE_LIMIT_REQUESTS} requests per {RATE_LIMIT_WINDOW} seconds')
    print(f'   - API key protection on sensitive endpoints')
    if ALLOWED_ORIGINS:
        print(f'   - CORS restricted to: {", ".join(ALLOWED_ORIGINS)}')
    else:
        print(f'   - CORS: All origins allowed (Cloudflare/proxy mode)')
    print(f'   - Security headers enabled')
    if BEHIND_CLOUDFLARE:
        print(f'   - Cloudflare integration: Using CF-Connecting-IP for rate limiting')
    # Check API key source
    with app.app_context():
        if os.environ.get('LICENSE_API_KEY'):
            print(f'   - API key configured from environment variable')
        elif API_KEY and SystemConfiguration.query.filter_by(config_key='msp_api_token').first():
            print(f'   - API key loaded from database (using existing MSP API token)')
        else:
            print(f'   ⚠️  WARNING: Using generated API key. Configure MSP API token in settings or set LICENSE_API_KEY environment variable!')
    print(f'\n✅ Main endpoints remain open (no API key required):')
    print(f'   - /api/license/validate (for existing clients)')
    print(f'   - /api/license/status')
    print(f'   - /api/license/info')
    print(f'\n🔐 Protected endpoints (require API key):')
    print(f'   - /api/license/licenses')
    print(f'   - /api/license/clients/<id>/licenses')
    print(f'   Authentication methods supported:')
    print(f'     • Authorization: Bearer <token> (matches MSP API style)')
    print(f'     • X-API-Key: <key> header')
    print(f'     • ?api_key=<key> query parameter')
    print(f'\nNote: TLS/HTTPS handshake attempts will be silently ignored (this is normal for HTTP servers)')
    
    # Use custom request handler to filter TLS handshake attempts
    app.run(host='0.0.0.0', port=port, debug=debug, request_handler=FilteredWSGIRequestHandler)
