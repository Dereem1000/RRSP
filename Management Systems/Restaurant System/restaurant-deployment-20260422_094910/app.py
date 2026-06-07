from flask import Flask, render_template, request, jsonify, redirect, url_for, session, flash, send_file
from functools import wraps
import time
from flask_cors import CORS
from license_registration import RestaurantLicenseRegistration
from license_middleware import LicenseMiddleware
from database.init_db import init_database, generate_qr_codes
from datetime import datetime, date, timedelta
import os
import sys
import json
import zipfile
import tempfile
import shutil

# ---------------------------------------------------------------------------
# Load secrets from .env file if present (before any app config is set)
# ---------------------------------------------------------------------------
_env_path = os.path.join(os.path.dirname(__file__), '.env')
if os.path.exists(_env_path):
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith('#') and '=' in _line:
                _k, _v = _line.split('=', 1)
                os.environ.setdefault(_k.strip(), _v.strip())

app = Flask(__name__)

# ---------------------------------------------------------------------------
# SECRET_KEY — must come from the environment / .env file, never hardcoded.
# The application refuses to start if the key is missing, too short, or set
# to a well-known placeholder value.
# ---------------------------------------------------------------------------
_KNOWN_WEAK_KEYS = {
    'your-secret-key-here', 'secret', 'changeme', 'default_secret_key_change_this',
    'dev', 'development', 'test', 'password', '',
}
_secret_key = os.environ.get('SECRET_KEY', '')
if not _secret_key or _secret_key.lower() in _KNOWN_WEAK_KEYS or len(_secret_key) < 32:
    print("=" * 70)
    print("FATAL: SECRET_KEY is missing, too short, or set to a known weak value.")
    print("Generate one with:  python -c \"import secrets; print(secrets.token_hex(32))\"")
    print("Then add it to the .env file as:  SECRET_KEY=<generated_value>")
    print("=" * 70)
    sys.exit(1)

app.config['SECRET_KEY'] = _secret_key
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{os.path.join(os.path.dirname(__file__), "restaurant.db")}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Suppress Flask development server warning
import warnings
warnings.filterwarnings("ignore", message=".*development server.*")
warnings.filterwarnings("ignore", message=".*WARNING.*")

# Import db from models and initialize it with the app
from database.models import db
db.init_app(app)

# Import all models after db initialization
from database.models import User, Category, MenuItem, Table, Order, OrderItem, Payment, Customer, WaiterAssignment, InventoryItem, PurchaseOrder, PurchaseOrderItem, InventoryReceiving, InventoryWaste, InventoryCount, SystemSettings, DatabaseConfig, CompanyRegistration, LicenseActivation, RefundRequest

# Initialize extensions
CORS(app)

# Dev mode and hot reload state
DEV_MODE = os.environ.get('FLASK_ENV') == 'development' or os.environ.get('DEV_MODE') == '1' or app.debug
HOT_RELOAD_ENABLED = False  # Will be controlled via API

# Import reload trigger module (for hot reload functionality)
try:
    import reload_trigger
except ImportError:
    reload_trigger = None

# Simple in-memory cache for API responses
api_cache = {}
CACHE_DURATION = 300  # 5 minutes

# License validation cache to reduce overhead
license_cache = {}
LICENSE_CACHE_DURATION = 60  # 1 minute

# Context processor to make dev_mode available in all templates
@app.context_processor
def inject_dev_mode():
    """Inject dev_mode into all templates"""
    # Load hot reload status from DB if in dev mode
    hot_reload = HOT_RELOAD_ENABLED
    if DEV_MODE:
        try:
            from database.models import SystemSettings
            setting = SystemSettings.query.filter_by(setting_key='hot_reload_enabled').first()
            if setting:
                hot_reload = setting.setting_value.lower() == 'true'
        except:
            pass
    return dict(dev_mode=DEV_MODE, hot_reload_enabled=hot_reload)

# Database connection optimization
db_adapter_instance = None

def get_optimized_db_adapter():
    """Get optimized database adapter instance with connection reuse"""
    global db_adapter_instance
    if db_adapter_instance is None:
        from database.database_adapter import DatabaseAdapter
        db_adapter_instance = DatabaseAdapter()
    return db_adapter_instance

def cache_response(seconds=300):
    """Decorator to cache API responses"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            cache_key = f"{f.__name__}_{str(args)}_{str(kwargs)}"
            now = time.time()
            
            # Check if we have cached data
            if cache_key in api_cache:
                cached_data, timestamp = api_cache[cache_key]
                if now - timestamp < seconds:
                    print(f"📦 Cache hit for {f.__name__}")
                    return cached_data
                else:
                    # Cache expired
                    del api_cache[cache_key]
            
            # Cache miss or expired, get fresh data
            print(f"🔄 Cache miss for {f.__name__}, fetching fresh data...")
            result = f(*args, **kwargs)
            
            # Cache the result
            api_cache[cache_key] = (result, now)
            
            return result
        return decorated_function
    return decorator

def clear_menu_cache():
    """Clear all menu-related cache entries"""
    global api_cache
    keys_to_remove = []
    # Check all cache keys to find menu-related entries
    # Cache keys are in format: function_name_(args)_{kwargs}
    all_keys = list(api_cache.keys())
    print(f"🔍 Checking {len(all_keys)} cache entries for menu-related keys...")
    
    for key in all_keys:
        key_lower = key.lower()
        if 'get_menu' in key_lower or 'get_full_menu' in key_lower:
            keys_to_remove.append(key)
    
    for key in keys_to_remove:
        del api_cache[key]
        print(f"🗑️ Cleared menu cache: {key}")
    
    if keys_to_remove:
        print(f"✅ Cleared {len(keys_to_remove)} menu cache entry/entries")
    else:
        if len(all_keys) > 0:
            print(f"ℹ️ No menu cache entries found. Current cache keys: {', '.join(all_keys[:5])}{'...' if len(all_keys) > 5 else ''}")
        else:
            print(f"ℹ️ Cache is empty (no entries to clear)")

def get_cached_license_validation():
    """Get cached license validation result to reduce overhead"""
    now = time.time()
    cache_key = 'license_validation'
    
    if cache_key in license_cache:
        cached_result, timestamp = license_cache[cache_key]
        
        # Check if cached result is still within cache duration
        if now - timestamp < LICENSE_CACHE_DURATION:
            # IMPORTANT: Even if cached, check if license expiration date has passed
            # This ensures expired licenses are detected immediately, not after cache expires
            if cached_result.get('valid') and cached_result.get('expiration_date'):
                try:
                    from datetime import datetime, timezone
                    expiration_str = cached_result.get('expiration_date')
                    if expiration_str:
                        # Parse expiration date
                        if isinstance(expiration_str, str):
                            if 'T' in expiration_str or 'Z' in expiration_str:
                                expiration_date = datetime.fromisoformat(expiration_str.replace('Z', '+00:00'))
                            else:
                                # Try other formats
                                expiration_date = datetime.strptime(expiration_str, '%Y-%m-%d %H:%M:%S')
                                expiration_date = expiration_date.replace(tzinfo=timezone.utc)
                        else:
                            expiration_date = expiration_str
                        
                        # Ensure timezone aware
                        if expiration_date.tzinfo is None:
                            expiration_date = expiration_date.replace(tzinfo=timezone.utc)
                        
                        # Check if expired
                        current_time = datetime.now(timezone.utc)
                        if expiration_date < current_time:
                            # License has expired - invalidate cache and return invalid
                            print(f"⚠️ Cached license expired: {expiration_date} < {current_time}")
                            del license_cache[cache_key]
                            return {'valid': False, 'error': 'License has expired'}
                except Exception as e:
                    print(f"⚠️ Error checking cached license expiration: {e}")
                    # On error, clear cache and revalidate to be safe
                    del license_cache[cache_key]
            
            # If still valid and not expired, check if expiration_date exists
            if cached_result.get('valid') and not cached_result.get('expiration_date'):
                # Cache has old data without expiration_date - clear it and revalidate
                print("⚠️ Cached result missing expiration_date, clearing cache")
                del license_cache[cache_key]
                # Fall through to revalidate below
            else:
                # If still valid and not expired, return cached result
                return cached_result
        else:
            # Cache expired
            del license_cache[cache_key]
    
    # Validate license and cache result
    try:
        from license_registration import RestaurantLicenseRegistration
        lr = RestaurantLicenseRegistration()
        lr.init_app(app)
        
        # Get license serial from database config
        from database_manager import db_manager
        config = db_manager.get_database_configuration()
        license_serial = config.get('config', {}).get('licenseSerial')
        
        if license_serial:
            result = lr.validate_serial_number(license_serial)
            
            # Double-check expiration even on fresh validation
            if result.get('valid') and result.get('expiration_date'):
                try:
                    from datetime import datetime, timezone
                    expiration_str = result.get('expiration_date')
                    if expiration_str:
                        if isinstance(expiration_str, str):
                            if 'T' in expiration_str or 'Z' in expiration_str:
                                expiration_date = datetime.fromisoformat(expiration_str.replace('Z', '+00:00'))
                            else:
                                expiration_date = datetime.strptime(expiration_str, '%Y-%m-%d %H:%M:%S')
                                expiration_date = expiration_date.replace(tzinfo=timezone.utc)
                        else:
                            expiration_date = expiration_str
                        
                        if expiration_date.tzinfo is None:
                            expiration_date = expiration_date.replace(tzinfo=timezone.utc)
                        
                        current_time = datetime.now(timezone.utc)
                        if expiration_date < current_time:
                            print(f"⚠️ License expired during validation: {expiration_date} < {current_time}")
                            result = {'valid': False, 'error': 'License has expired'}
                except Exception as e:
                    print(f"⚠️ Error checking license expiration: {e}")
            
            # Ensure expiration_date is in the cached result
            if result.get('valid') and not result.get('expiration_date'):
                # If expiration_date is missing, calculate it based on license_type
                license_type = result.get('license_type', 'Unknown')
                from datetime import datetime, timezone, timedelta
                now_dt = datetime.now(timezone.utc)
                
                license_durations = {
                    'Day Pass': 1,
                    'Trial 7 Days': 7,
                    'Extended 30 Days': 30,
                    'One Time License': 365,
                    'No Time Limit': None
                }
                
                duration_days = license_durations.get(license_type, 365)
                
                if duration_days is None:
                    expiration_date = (now_dt + timedelta(days=36500)).isoformat()
                else:
                    expiration_date = (now_dt + timedelta(days=duration_days)).isoformat()
                
                result['expiration_date'] = expiration_date
                print(f"⚠️ Added missing expiration_date to cached result: {expiration_date}")
            
            license_cache[cache_key] = (result, now)
            print(f"✅ License validation cached for {LICENSE_CACHE_DURATION} seconds")
            return result
        else:
            result = {'valid': False, 'error': 'No license serial found'}
            license_cache[cache_key] = (result, now)
            return result
    except Exception as e:
        result = {'valid': False, 'error': f'License validation error: {str(e)}'}
        license_cache[cache_key] = (result, now)
        return result

# Initialize license registration system
license_registration = RestaurantLicenseRegistration()
license_registration.init_app(app)

# Initialize license middleware
license_middleware = LicenseMiddleware()
license_middleware.init_app(app)

# Import license security
from license_creation_middleware import require_activation_system, require_admin_privileges, log_license_operations
from license_security import license_security

# Initialize database manager
from database_manager import DatabaseManager
db_manager = DatabaseManager()
db_manager.init_app(app)

# ============================================================================
# Error Handling and Request Validation
# ============================================================================

# Track suspicious requests to reduce log noise
suspicious_ips = {}
SUSPICIOUS_REQUEST_THROTTLE = 60  # seconds between logging suspicious requests per IP

def is_malformed_request(request):
    """Detect obviously malformed requests from bots/scanners"""
    try:
        # Check for binary data in request path/headers (common in attacks)
        path = request.path or ''
        if any(ord(c) < 32 and c not in '\t\n\r' for c in path[:100]):
            return True
        
        # Check for suspicious patterns in user agent
        user_agent = request.headers.get('User-Agent', '')
        suspicious_patterns = [
            'sqlmap', 'nikto', 'nmap', 'masscan', 'scanner',
            'bot', 'crawler', 'spider', 'scraper'
        ]
        if any(pattern in user_agent.lower() for pattern in suspicious_patterns):
            return False  # Don't block legitimate bots, just log quietly
        
        # Check for common exploit patterns in path
        exploit_patterns = [
            '/wp-admin', '/phpmyadmin', '/.env', '/config.php',
            '/admin.php', '/shell.php', '/cmd=', '/exec='
        ]
        if any(pattern in path.lower() for pattern in exploit_patterns):
            return True
            
        return False
    except:
        return False

@app.before_request
def validate_request():
    """Validate requests before processing to filter out malformed requests"""
    try:
        # Skip validation for known good endpoints
        if request.path.startswith('/static/') or request.path.startswith('/api/'):
            return None
        
        # Check for malformed requests
        if is_malformed_request(request):
            client_ip = request.remote_addr
            
            # Throttle logging of suspicious requests per IP
            now = time.time()
            if client_ip in suspicious_ips:
                last_logged = suspicious_ips[client_ip]
                if now - last_logged < SUSPICIOUS_REQUEST_THROTTLE:
                    # Silently reject without logging
                    return '', 400
            
            # Log once per minute per IP
            suspicious_ips[client_ip] = now
            
            # Clean up old entries periodically
            if len(suspicious_ips) > 1000:
                cutoff = now - 3600  # 1 hour
                suspicious_ips.clear()
            
            return '', 400
    except Exception as e:
        # Don't block requests if validation fails
        pass
    
    return None

@app.errorhandler(400)
def bad_request(error):
    """Handle 400 Bad Request errors gracefully"""
    # For API requests, return JSON
    if request.path.startswith('/api/'):
        return jsonify({
            'success': False,
            'error': 'Bad request',
            'message': 'Invalid request format'
        }), 400
    
    # For web requests, redirect to home or show error page
    return redirect(url_for('index'))

@app.errorhandler(404)
def not_found(error):
    """Handle 404 Not Found errors gracefully"""
    # For API requests, return JSON
    if request.path.startswith('/api/'):
        return jsonify({
            'success': False,
            'error': 'Not found',
            'message': 'The requested resource was not found'
        }), 404
    
    # For web requests, redirect to home
    return redirect(url_for('index'))

@app.errorhandler(500)
def internal_error(error):
    """Handle 500 Internal Server errors gracefully"""
    # Log the error for debugging
    import traceback
    print(f"❌ Internal Server Error: {str(error)}")
    print(traceback.format_exc())
    
    # For API requests, return JSON
    if request.path.startswith('/api/'):
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': 'An unexpected error occurred'
        }), 500
    
    # For web requests, show error page or redirect
    flash('An unexpected error occurred. Please try again.', 'error')
    return redirect(url_for('index'))

@app.errorhandler(Exception)
def handle_exception(e):
    """Handle all unhandled exceptions"""
    import traceback
    print(f"❌ Unhandled Exception: {str(e)}")
    print(traceback.format_exc())
    
    # For API requests, return JSON
    if request.path.startswith('/api/'):
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': 'An unexpected error occurred'
        }), 500
    
    # For web requests, show error page
    flash('An unexpected error occurred. Please try again.', 'error')
    return redirect(url_for('index'))

# Simple assistance tracking (in production, use database)
assistance_requests = []

# Spam prevention: track last request time per table
assistance_cooldowns = {}  # table_id -> last_request_time
ASSISTANCE_COOLDOWN_SECONDS = 30  # Minimum 30 seconds between requests per table

def cleanup_old_assistance_requests():
    """Clean up assistance requests older than 24 hours to prevent memory issues"""
    global assistance_requests, assistance_cooldowns
    
    from datetime import datetime, timedelta, timezone
    cutoff_time = datetime.now(timezone.utc) - timedelta(hours=24)
    
    # Remove old requests
    original_count = len(assistance_requests)
    assistance_requests = [
        req for req in assistance_requests 
        if req.get('timestamp') and datetime.fromisoformat(req['timestamp'].replace('Z', '+00:00')) > cutoff_time
    ]
    
    # Clean up old cooldowns
    cutoff_cooldown = datetime.now(timezone.utc) - timedelta(hours=1)
    assistance_cooldowns = {
        table_id: timestamp 
        for table_id, timestamp in assistance_cooldowns.items() 
        if timestamp > cutoff_cooldown
    }
    
    if len(assistance_requests) < original_count:
        print(f"🧹 Cleaned up {original_count - len(assistance_requests)} old assistance requests")
    
    return len(assistance_requests)

def auto_update_order_status(order_id):
    """
    Automatically update order status based on item statuses.
    Called whenever an order item status changes.
    """
    try:
        order = Order.query.get(order_id)
        if not order:
            print(f"❌ Order {order_id} not found for auto-status update")
            return False
        
        # Get all items for this order
        order_items = OrderItem.query.filter_by(order_id=order_id).all()
        if not order_items:
            print(f"⚠️ No items found for order {order_id}")
            return False
        
        # Count items by status
        status_counts = {}
        for item in order_items:
            status = item.status
            status_counts[status] = status_counts.get(status, 0) + 1
        
        print(f"🔍 Order {order_id} status breakdown: {status_counts}")
        
        # Determine new order status based on item statuses
        new_status = None
        
        # Count items by status for better decision making
        ready_count = sum(1 for item in order_items if item.status == 'ready')
        preparing_count = sum(1 for item in order_items if item.status == 'preparing')
        pending_count = sum(1 for item in order_items if item.status == 'pending')
        served_count = sum(1 for item in order_items if item.status == 'served')
        total_items = len(order_items)
        
        print(f"📊 Order {order_id} status breakdown: Ready={ready_count}, Preparing={preparing_count}, Pending={pending_count}, Served={served_count}, Total={total_items}")
        
        if all(item.status == 'served' for item in order_items):
            # All items have been served
            new_status = 'served'
            print(f"🍽️ Order {order_id}: All items served, setting status to 'served'")
        elif ready_count > 0:
            # Any items are ready - order is ready to serve
            new_status = 'ready'
            print(f"✅ Order {order_id}: {ready_count}/{total_items} items ready, setting status to 'ready'")
        elif any(item.status == 'preparing' for item in order_items):
            # At least one item is being prepared
            new_status = 'preparing'
            print(f"👨‍🍳 Order {order_id}: Some items preparing, setting status to 'preparing'")
        elif all(item.status == 'pending' for item in order_items):
            # All items are pending
            new_status = 'pending'
            print(f"⏳ Order {order_id}: All items pending, setting status to 'pending'")
        elif pending_count > 0:
            # Some items are pending (and none are ready/preparing)
            new_status = 'pending'
            print(f"⏳ Order {order_id}: {pending_count}/{total_items} items pending, setting status to 'pending'")
        
        # Update order status if it changed
        if new_status and new_status != order.status:
            old_status = order.status
            order.status = new_status
            order.updated_at = datetime.utcnow()
            db.session.commit()
            
            print(f"🔄 Order {order_id} status updated: {old_status} → {new_status}")
            
            # Log the change for debugging
            print(f"📊 Order {order_id} final status: {new_status}")
            print(f"📋 Item statuses: {[f'{item.id}:{item.status}' for item in order_items]}")
            
            return True
        else:
            print(f"ℹ️ Order {order_id} status unchanged: {order.status}")
            return False
            
    except Exception as e:
        print(f"❌ Error auto-updating order {order_id} status: {str(e)}")
        db.session.rollback()
        return False

def auto_update_all_orders():
    """
    Automatically update status of all active orders based on their item statuses.
    Useful for maintenance or system startup.
    """
    try:
        # Get all active orders (not served or cancelled)
        active_orders = Order.query.filter(
            Order.status.in_(['pending', 'preparing', 'ready'])
        ).all()
        
        print(f"🔄 Auto-updating {len(active_orders)} active orders...")
        
        updated_count = 0
        for order in active_orders:
            if auto_update_order_status(order.id):
                updated_count += 1
        
        print(f"✅ Auto-update complete: {updated_count}/{len(active_orders)} orders updated")
        return updated_count
        
    except Exception as e:
        print(f"❌ Error auto-updating all orders: {str(e)}")
        return 0

# Initialize database on startup
with app.app_context():
    # Use modular database initialization
    from database.database_init import initialize_restaurant_database
    from database.migrations import migrate_database
    
    # Check if database needs initialization
    db_path = os.path.join(os.path.dirname(__file__), 'restaurant.db')
    if not os.path.exists(db_path):
        # Initialize new database
        print("🔧 Initializing new database...")
        init_result = initialize_restaurant_database(db_path)
        if init_result['success']:
            print(f"✅ Database initialized: {init_result['message']}")
        else:
            print(f"❌ Database initialization failed: {init_result['error']}")
    else:
        # Run migrations for existing database
        print("🔄 Checking for database migrations...")
        migrate_result = migrate_database(db_path)
        if migrate_result['success']:
            if migrate_result.get('applied_migrations'):
                print(f"✅ Applied {len(migrate_result['applied_migrations'])} migrations")
            else:
                print("✅ Database is up to date")
        else:
            print(f"❌ Database migration failed: {migrate_result['error']}")
    
    # Ensure payment table has correct schema (nullable order_id + all manual-payment columns)
    try:
        import sqlite3 as _sqlite3
        _conn = _sqlite3.connect(db_path)
        _cur = _conn.cursor()
        _cur.execute("PRAGMA table_info(payment)")
        _col_info = _cur.fetchall()
        _cols = [c[1] for c in _col_info]

        # Add any missing columns first
        _payment_columns = [
            ("notes",         "ALTER TABLE payment ADD COLUMN notes TEXT"),
            ("customer_name", "ALTER TABLE payment ADD COLUMN customer_name VARCHAR(100)"),
            ("is_manual",     "ALTER TABLE payment ADD COLUMN is_manual BOOLEAN DEFAULT 0"),
            ("processed_by",  "ALTER TABLE payment ADD COLUMN processed_by VARCHAR(150)"),
        ]
        for _col_name, _alter_sql in _payment_columns:
            if _col_name not in _cols:
                _cur.execute(_alter_sql)
                _conn.commit()
                print(f"✅ Added payment.{_col_name} column")

        # Fix order_id NOT NULL constraint if needed (required for manual/cash payments)
        _cur.execute("PRAGMA table_info(payment)")
        _order_id_col = next((c for c in _cur.fetchall() if c[1] == 'order_id'), None)
        if _order_id_col and _order_id_col[3] == 1:  # notnull=1 means constraint exists
            print("🔧 Fixing payment.order_id NOT NULL constraint...")
            _cur.execute("SELECT * FROM payment")
            _rows = _cur.fetchall()
            _cur.execute("PRAGMA table_info(payment)")
            _all_cols = [c[1] for c in _cur.fetchall()]
            _cur.execute("DROP TABLE IF EXISTS _payment_backup")
            _cur.execute("CREATE TABLE _payment_backup AS SELECT * FROM payment")
            _cur.execute("DROP TABLE payment")
            _cur.execute(
                "CREATE TABLE payment ("
                "id INTEGER PRIMARY KEY AUTOINCREMENT,"
                "order_id INTEGER,"
                "amount FLOAT NOT NULL,"
                "payment_method VARCHAR(20) NOT NULL,"
                "transaction_id VARCHAR(100),"
                "status VARCHAR(20) DEFAULT 'completed',"
                "notes TEXT,"
                "customer_name VARCHAR(100),"
                "is_manual BOOLEAN DEFAULT 0,"
                "processed_by VARCHAR(150),"
                "created_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
                "card_last_four VARCHAR(4),"
                "FOREIGN KEY (order_id) REFERENCES \"order\" (id))"
            )
            for _row in _rows:
                _rd = dict(zip(_all_cols, _row))
                _cur.execute(
                    "INSERT INTO payment (id,order_id,amount,payment_method,transaction_id,"
                    "status,notes,customer_name,is_manual,processed_by,created_at,card_last_four)"
                    " VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                    (_rd.get('id'), _rd.get('order_id'), _rd.get('amount'),
                     _rd.get('payment_method'), _rd.get('transaction_id'), _rd.get('status'),
                     _rd.get('notes'), _rd.get('customer_name'), _rd.get('is_manual', 0),
                     _rd.get('processed_by'), _rd.get('created_at'), _rd.get('card_last_four'))
                )
            _conn.commit()
            _cur.execute("DROP TABLE IF EXISTS _payment_backup")
            _conn.commit()
            print("✅ Fixed payment.order_id constraint (now nullable)")

        _conn.close()
    except Exception as _e:
        print(f"⚠️ Could not migrate payment table: {_e}")
    
    # Initialize database using existing init_db for compatibility
    # Only initialize if database is completely empty (no tables exist)
    with app.app_context():
        try:
            from database.models import User
            user_count = User.query.count()
            if user_count == 0:
                print("📊 Database is empty, initializing with basic structure...")
                init_database(app)
            else:
                print("📊 Database already has data, skipping initialization")
        except Exception as e:
            # If we can't query users, the database might not be initialized
            print(f"📊 Database not initialized, creating schema...")
            init_database(app)

    # Ensure default menu categories exist
    with app.app_context():
        try:
            from database.models import Category
            default_categories = ['Mains', 'Sides', 'Drinks', 'Desserts']
            for cat_name in default_categories:
                exists = Category.query.filter_by(name=cat_name).first()
                if not exists:
                    db.session.add(Category(name=cat_name))
                    print(f"✅ Created default category: {cat_name}")
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            print(f"⚠️ Could not create default categories: {e}")

# Startup tasks that run after server is stable
def run_startup_tasks():
    """Run tasks that might trigger file changes after server is stable"""
    with app.app_context():
        try:
            print("📱 Generating QR codes...")
            generate_qr_codes(app)
            
            print("🧹 Cleaning up old assistance requests...")
            cleanup_old_assistance_requests()
            
            print("🚀 Starting automatic order status sync...")
            auto_update_all_orders()
            
            print("✅ Startup tasks completed successfully")
        except Exception as e:
            print(f"❌ Error in startup tasks: {str(e)}")

@app.route('/startup-tasks')
def trigger_startup_tasks():
    """Manually trigger startup tasks after server is stable"""
    run_startup_tasks()
    return jsonify({'success': True, 'message': 'Startup tasks completed'})

@app.route('/')
def index():
    """Home page with license registration status"""
    try:
        # Check if restaurant is registered using database adapter (works for both local and remote)
        db_adapter = get_optimized_db_adapter()
        companies_result = db_adapter.get_company_registrations()
        
        is_registered = False
        show_success_message = False
        registration_info = None
        
        # First, try to validate the license regardless of local company registration
        # This ensures that if the license is valid, we don't show the registration notice
        try:
            # Find the admin user for license validation
            admin_user = User.query.filter_by(role='admin').first()
            if admin_user:
                # Try to validate license using external API (same as middleware)
                license_result = license_registration.validate_restaurant_access(admin_user.id)
                
                if license_result.get('valid'):
                    # Additional check: Verify expiration date even if API says valid
                    expiration_date = license_result.get('expiration_date')
                    if expiration_date:
                        try:
                            from datetime import datetime, timezone
                            if isinstance(expiration_date, str):
                                if 'T' in expiration_date or 'Z' in expiration_date:
                                    exp_date = datetime.fromisoformat(expiration_date.replace('Z', '+00:00'))
                                else:
                                    exp_date = datetime.strptime(expiration_date, '%Y-%m-%d %H:%M:%S')
                                    exp_date = exp_date.replace(tzinfo=timezone.utc)
                            else:
                                exp_date = expiration_date
                                if exp_date.tzinfo is None:
                                    exp_date = exp_date.replace(tzinfo=timezone.utc)
                            
                            current_time = datetime.now(timezone.utc)
                            if exp_date < current_time:
                                # License expired - treat as invalid
                                print(f"⚠️ License expired on index: {exp_date} < {current_time}")
                                license_result['valid'] = False
                                license_result['error'] = 'License has expired'
                        except Exception as e:
                            print(f"⚠️ Error checking expiration on index: {e}")
                    
                    if license_result.get('valid'):
                        # License is valid - system is registered
                        is_registered = True
                        
                        # Check if we have local company data for display
                        if companies_result.get('success') and companies_result.get('data'):
                            companies = companies_result['data']
                            company = companies[0] if companies else None
                            
                            if company:
                                # Use local company data for display
                                registration_info = company
                                # Convert registration_date string to datetime object if it exists
                                if registration_info.get('registration_date'):
                                    try:
                                        from datetime import datetime
                                        if isinstance(registration_info['registration_date'], str):
                                            registration_info['registration_date'] = datetime.fromisoformat(registration_info['registration_date'].replace('Z', '+00:00'))
                                    except Exception as e:
                                        print(f"Warning: Could not parse registration_date: {e}")
                                        registration_info['registration_date'] = None
                                # Check if we should show success message (only once after registration)
                                if not company.get('registration_success_shown', False):
                                    show_success_message = True
                            else:
                                # No local company data, but license is valid
                                # Create a basic registration info from license data
                                registration_info = {
                                    'company_name': license_result.get('company_name', 'Restaurant'),
                                    'contact_person': license_result.get('contact_person', 'Administrator'),
                                    'email': 'admin@restaurant.com',  # Default email
                                    'registration_date': None
                                }
                        else:
                            # No local company data, but license is valid
                            # Create a basic registration info from license data
                            registration_info = {
                                'company_name': license_result.get('company_name', 'Restaurant'),
                                'contact_person': license_result.get('contact_person', 'Administrator'),
                                'email': 'admin@restaurant.com',  # Default email
                                'registration_date': None
                            }
                    else:
                        # License validation failed (expired or invalid) - show registration notice
                        print(f"License validation failed on index: {license_result.get('error', 'Unknown error')}")
                        is_registered = False
                else:
                    # License validation failed - show registration notice
                    print(f"License validation failed on index: {license_result.get('error', 'Unknown error')}")
                    is_registered = False
            else:
                print("No admin user found for license validation")
                is_registered = False
        except Exception as e:
            print(f"License validation error on index: {e}")
            # If validation fails, assume not registered to show registration prompt
            is_registered = False
        
        return render_template('index.html', 
                             is_registered=is_registered,
                             show_success_message=show_success_message,
                             registration_info=registration_info)
    except Exception as e:
        print(f"Error in index route: {e}")
        # If there's an error, assume not registered to show registration prompt
        return render_template('index.html', 
                             is_registered=False,
                             show_success_message=False,
                             registration_info=None)

@app.route('/login', methods=['GET', 'POST'])
def login():
    # Check database connection status for GET requests
    if request.method == 'GET':
        from database.database_adapter import DatabaseAdapter
        from database_manager import db_manager
        
        db_adapter = DatabaseAdapter()
        database_status = {
            'is_remote_mode': db_adapter.is_remote_mode(),
            'connection_available': True,
            'error_message': None
        }
        
        # Test database connection
        if database_status['is_remote_mode']:
            # Test remote connection
            users_result = db_adapter.get_all_users()
            if not users_result['success']:
                database_status['connection_available'] = False
                database_status['error_message'] = users_result.get('error', 'Remote database connection failed')
        else:
            # Test local connection
            try:
                from database.models import User, db
                with app.app_context():
                    User.query.first()  # Simple test query
            except Exception as e:
                database_status['connection_available'] = False
                database_status['error_message'] = f'Local database error: {str(e)}'
        
        return render_template('login.html', database_status=database_status)
    
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        
        # Use DatabaseAdapter for user authentication to support remote mode
        from database.database_adapter import DatabaseAdapter
        db_adapter = DatabaseAdapter()
        
        # Get user data through adapter
        users_result = db_adapter.get_all_users()
        if not users_result['success']:
            # Check if it's a remote database connection issue
            from database_manager import db_manager
            if db_adapter.is_remote_mode():
                flash('Remote database connection failed. Please switch to local database or check your connection.', 'error')
            else:
                flash('Database connection error. Please try again.', 'error')
            return render_template('login.html')
        
        # Find user in the results
        user_data = None
        for u in users_result['data']:
            if u['username'] == username:
                user_data = u
                break
        
        if not user_data:
            flash('Invalid username or password.', 'error')
            return render_template('login.html')
        
        # Check password using the password hash from the user data
        from werkzeug.security import check_password_hash
        if not check_password_hash(user_data.get('password_hash', ''), password):
            flash('Invalid username or password.', 'error')
            return render_template('login.html')
        
        # Password is correct, set session data
        session['user_id'] = user_data['id']
        session['username'] = user_data['username']
        session['name'] = user_data.get('name', user_data['username'])
        session['role'] = user_data['role']
        
        # Set license information in session
        try:
            license_result = license_registration.validate_restaurant_access(user_data['id'])
            if license_result.get('valid'):
                # Calculate detailed time remaining
                def calculate_time_remaining(expiration_date):
                    """Calculate detailed time remaining until expiration"""
                    if not expiration_date:
                        # Return unknown status instead of defaulting to 365 days
                        return {'days': None, 'hours': 0, 'minutes': 0, 'total_seconds': 0, 'formatted': 'Unknown', 'is_unknown': True}
                    
                    try:
                        from datetime import datetime, timezone
                        # Parse the external API date format
                        if isinstance(expiration_date, str):
                            try:
                                exp_date = datetime.strptime(expiration_date, '%a, %d %b %Y %H:%M:%S %Z')
                                if exp_date.tzinfo is None:
                                    exp_date = exp_date.replace(tzinfo=timezone.utc)
                            except:
                                try:
                                    exp_date = datetime.fromisoformat(expiration_date.replace('Z', '+00:00'))
                                except:
                                    try:
                                        exp_date = datetime.strptime(expiration_date, '%Y-%m-%d %H:%M:%S.%f')
                                    except:
                                        exp_date = datetime.strptime(expiration_date, '%Y-%m-%d %H:%M:%S')
                                    exp_date = exp_date.replace(tzinfo=timezone.utc)
                        else:
                            exp_date = expiration_date
                            if exp_date.tzinfo is None:
                                exp_date = exp_date.replace(tzinfo=timezone.utc)
                        
                        now = datetime.now(timezone.utc)
                        delta = exp_date - now
                        total_seconds = int(delta.total_seconds())
                        
                        # Calculate days, hours, and minutes
                        days = delta.days
                        hours = delta.seconds // 3600
                        minutes = (delta.seconds % 3600) // 60
                        
                        # Format the display string
                        if days > 0:
                            formatted = f'{days} day{"s" if days != 1 else ""}'
                        elif days == 0 and hours > 0:
                            formatted = f'{hours} hour{"s" if hours != 1 else ""}'
                            if minutes > 0:
                                formatted += f' {minutes} minute{"s" if minutes != 1 else ""}'
                        elif days == 0 and hours == 0 and minutes > 0:
                            formatted = f'{minutes} minute{"s" if minutes != 1 else ""}'
                        else:
                            # Expired - calculate how long ago
                            total_seconds = abs(total_seconds)
                            hours_ago = total_seconds // 3600
                            minutes_ago = (total_seconds % 3600) // 60
                            if hours_ago > 0:
                                formatted = f'{hours_ago} hour{"s" if hours_ago != 1 else ""} ago'
                            else:
                                formatted = f'{minutes_ago} minute{"s" if minutes_ago != 1 else ""} ago'
                        
                        return {
                            'days': days,
                            'hours': hours,
                            'minutes': minutes,
                            'total_seconds': total_seconds,
                            'formatted': formatted
                        }
                    except Exception as e:
                        print(f"Warning: Could not parse expiration date: {e}")
                        # Return unknown status when parsing fails
                        return {'days': None, 'hours': 0, 'minutes': 0, 'total_seconds': 0, 'formatted': 'Unknown', 'is_unknown': True}
                
                expiration_date = license_result.get('expiration_date')
                print(f"📅 [LOGIN] Got expiration_date from license_result: {expiration_date} (type: {type(expiration_date)})")
                print(f"📋 [LOGIN] Full license_result: {license_result}")
                
                # If expiration_date is still None, calculate it based on license_type
                if not expiration_date or expiration_date in [None, '', 'None', 'null']:
                    license_type = license_result.get('license_type', 'Day Pass')
                    from datetime import datetime, timezone, timedelta
                    now = datetime.now(timezone.utc)
                    
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
                    
                    print(f"⚠️ [LOGIN] expiration_date was None, calculated: {expiration_date} for license_type: {license_type}")
                
                time_info = calculate_time_remaining(expiration_date)
                days_val = time_info.get('days')
                print(f"⏰ [LOGIN] Calculated time_info: {time_info}")
                print(f"📊 [LOGIN] days_val: {days_val}, time_remaining: {time_info.get('formatted', '')}")
                
                session['license_info'] = {
                    'status': 'active',
                    'type': license_result.get('license_type', 'Day Pass'),
                    'max_users': license_result.get('max_users', 10),
                    'expiration_date': expiration_date,
                    'days_remaining': days_val if days_val is not None else None,
                    'time_remaining': time_info.get('formatted', ''),
                    'time_info': time_info,
                    'offline_mode': license_result.get('offline_mode', False),
                    'grace_period': license_result.get('grace_period'),
                    'grace_remaining_hours': license_result.get('grace_remaining_hours'),
                }
                print(f"✅ [LOGIN] License info set in session for {user.username}")
                print(f"🔍 [LOGIN] Session license_info contents: expiration_date={session['license_info'].get('expiration_date')}, days_remaining={session['license_info'].get('days_remaining')}, time_remaining={session['license_info'].get('time_remaining')}")
            else:
                # Clear license info when validation fails
                session.pop('license_info', None)
                session['license_error'] = license_result.get('error', 'License validation failed')
                print(f"❌ License validation failed for {user.username}: {license_result.get('error')}")
        except Exception as e:
            print(f"Warning: Could not set license info: {e}")
            session['license_info'] = {
                'status': 'unknown',
                'type': 'Unknown',
                'max_users': 0,
                'expiration_date': None,
                'days_remaining': 0
            }
        
        # Check if user has remote database configuration and needs setup
        try:
            import json
            
            # Use DatabaseAdapter to get system settings
            settings_result = db_adapter.get_system_settings('database_config')
            if settings_result['success']:
                db_config = json.loads(settings_result['data']['value'])
                is_remote = db_config.get('is_remote', False)
                intended_mode = db_config.get('intended_mode', 'local')
                setup_completed = db_config.get('setup_completed', False)
                
                # Only redirect to database management if:
                # 1. User is admin
                # 2. Intended mode is remote (user chose remote in license registration)
                # 3. Setup is not completed yet
                if (intended_mode == 'remote' and not setup_completed) and user_data['role'] == 'admin':
                    print(f"🔄 Redirecting admin user to database management (intended_mode: {intended_mode}, setup_completed: {setup_completed})")
                    return redirect(url_for('admin_database', auto_setup='remote'))
        except Exception as e:
            print(f"Warning: Could not check database configuration: {e}")
        
        if user_data['role'] == 'chef':
            return redirect(url_for('kitchen'))
        elif user_data['role'] == 'cashier':
            return redirect(url_for('cashier'))
        elif user_data['role'] == 'waiter':
            return redirect(url_for('waiter'))
        elif user_data['role'] == 'admin':
            return redirect(url_for('admin'))
        else:
            flash('Invalid username or password')
    
    return render_template('login.html')

@app.route('/logout')
def logout():
    """Logout user and clear session"""
    # Clear all session data
    session.clear()
    
    # Clear any cached license data
    global license_cache
    # Clear license cache to force fresh validation with expiration_date
    license_cache.clear()
    print("🔄 License cache cleared - will get fresh validation on next request")
    
    # Clear any cached API data
    global api_cache
    api_cache.clear()
    
    flash('You have been logged out successfully.', 'success')
    return redirect(url_for('login'))

@app.route('/api/force_logout')
def force_logout():
    """Force logout and clear all data - used after reset"""
    try:
        # Clear all session data
        session.clear()
        
        # Clear all caches
        global license_cache, api_cache
        # Clear license cache to force fresh validation with expiration_date
        license_cache.clear()
        print("🔄 License cache cleared - will get fresh validation on next request")
        api_cache.clear()
        
        # Clear any temporary files
        temp_files = [
            'flask_session',
            'session',
            '.session'
        ]
        
        for temp_file in temp_files:
            temp_path = os.path.join(os.path.dirname(__file__), temp_file)
            if os.path.exists(temp_path):
                if os.path.isfile(temp_path):
                    os.remove(temp_path)
                else:
                    import shutil
                    shutil.rmtree(temp_path)
        
        return jsonify({
            'success': True,
            'message': 'All data cleared successfully. Please refresh the page.'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/kitchen')
@license_middleware.require_license_for_staff
def kitchen():
    if 'user_id' not in session or session['role'] != 'chef':
        return redirect(url_for('login'))
    return render_template('kitchen.html')

@app.route('/kitchen/fullscreen')
@license_middleware.require_license_for_staff
def kitchen_fullscreen():
    if 'user_id' not in session or session['role'] != 'chef':
        return redirect(url_for('login'))
    return render_template('kitchen_fullscreen.html')

@app.route('/cashier')
@license_middleware.require_license_for_staff
def cashier():
    # Allow cashiers or admins who have switched to cashier mode
    if 'user_id' not in session:
        return redirect(url_for('login'))
    if session.get('role') != 'cashier' and not (session.get('original_role') == 'admin' and session.get('switched_to_cashier')):
        return redirect(url_for('login'))
    return render_template('cashier.html')

@app.route('/manual_cash_register')
@license_middleware.require_license_for_staff
def manual_cash_register():
    # Allow cashiers or admins who have switched to cashier mode
    if 'user_id' not in session:
        return redirect(url_for('login'))
    if session.get('role') != 'cashier' and not (session.get('original_role') == 'admin' and session.get('switched_to_cashier')):
        return redirect(url_for('login'))
    return render_template('manual_cash_register.html')

@app.route('/table_management')
@license_middleware.require_license_for_staff
def table_management():
    # Allow cashiers or admins who have switched to cashier mode
    if 'user_id' not in session:
        return redirect(url_for('login'))
    if session.get('role') != 'cashier' and not (session.get('original_role') == 'admin' and session.get('switched_to_cashier')):
        return redirect(url_for('login'))
    return render_template('table_management.html')

@app.route('/cash_register_fullscreen')
@license_middleware.require_license_for_staff
def cash_register_fullscreen():
    # Allow cashiers or admins who have switched to cashier mode
    if 'user_id' not in session:
        return redirect(url_for('login'))
    if session.get('role') != 'cashier' and not (session.get('original_role') == 'admin' and session.get('switched_to_cashier')):
        return redirect(url_for('login'))
    current_user = {
        'id': session.get('user_id'),
        'name': session.get('name', session.get('username', 'Unknown')),
        'username': session.get('username', 'unknown'),
        'role': session.get('role', 'cashier')
    }
    return render_template('cash_register_fullscreen.html', current_user=current_user)

@app.route('/waiter')
@license_middleware.require_license_for_staff
def waiter():
    if 'user_id' not in session or session['role'] != 'waiter':
        return redirect(url_for('login'))
    return render_template('waiter.html')

@app.route('/waiter/mobile')
@license_middleware.require_license_for_staff
def waiter_mobile():
    if 'user_id' not in session or session['role'] != 'waiter':
        return redirect(url_for('login'))
    return render_template('waiter_mobile.html')

@app.route('/admin')
@license_middleware.require_license
def admin():
    if 'user_id' not in session or session['role'] != 'admin':
        return redirect(url_for('login'))
    return render_template('admin.html')

@app.route('/test_tables')
@license_middleware.require_license_for_staff
def test_tables():
    return render_template('admin_tables.html')

@app.route('/admin/tables')
@license_middleware.require_license_for_staff
def admin_tables():
    if 'user_id' not in session or session['role'] != 'admin':
        return redirect(url_for('login'))
    return render_template('admin_tables.html')

@app.route('/admin/refund_requests')
@license_middleware.require_license
def admin_refund_requests():
    """Admin page to manage refund requests"""
    if session.get('role') not in ['admin', 'manager']:
        flash('Access denied. Admin or Manager role required.', 'danger')
        return redirect(url_for('index'))
    return render_template('admin_refund_requests.html')

@app.route('/admin/menu')
@license_middleware.require_license_for_staff
def admin_menu():
    if 'user_id' not in session or session['role'] != 'admin':
        return redirect(url_for('login'))
    return render_template('admin_menu.html')

@app.route('/admin/staff')
@license_middleware.require_license_for_staff
def admin_staff():
    if 'user_id' not in session or session['role'] != 'admin':
        return redirect(url_for('login'))
    return render_template('admin_staff.html')

@app.route('/admin/inventory')
@license_middleware.require_license_for_staff
def admin_inventory():
    if 'user_id' not in session or session['role'] != 'admin':
        return redirect(url_for('login'))
    return render_template('admin_inventory.html')

@app.route('/admin/waiter-assignments')
@license_middleware.require_license_for_staff
def admin_waiter_assignments():
    if 'user_id' not in session or session['role'] != 'admin':
        return redirect(url_for('login'))
    return render_template('admin_waiter_assignments.html')

@app.route('/admin/settings')
@license_middleware.require_license
def admin_settings():
    if 'user_id' not in session or session['role'] != 'admin':
        return redirect(url_for('login'))
    
    # Load hot reload setting from database on page load
    global HOT_RELOAD_ENABLED
    if DEV_MODE:
        try:
            from database.models import SystemSettings
            setting = SystemSettings.query.filter_by(setting_key='hot_reload_enabled').first()
            if setting:
                HOT_RELOAD_ENABLED = setting.setting_value.lower() == 'true'
        except Exception as e:
            print(f"Error loading hot reload setting: {e}")
    
    return render_template('admin_settings.html')

@app.route('/admin/reports')
@license_middleware.require_license
def admin_reports():
    if 'user_id' not in session or session['role'] != 'admin':
        return redirect(url_for('login'))
    return render_template('admin_reports.html')

@app.route('/customer_menu/<int:table_id>')
def customer_menu(table_id):
    table = Table.query.get_or_404(table_id)
    return render_template('customer_menu.html', table=table)

@app.route('/table/<int:table_number>')
def table_menu(table_number):
    """Route for QR code access - finds table by number and serves customer menu"""
    table = Table.query.filter_by(number=table_number).first_or_404()
    return render_template('customer_menu.html', table=table)

@app.route('/api/request_assistance', methods=['POST'])
@license_middleware.require_license_for_api
def request_assistance():
    """Handle customer assistance requests with spam prevention"""
    data = request.get_json()
    
    try:
        table_id = data.get('table_id')
        table_number = data.get('table_number')
        message = data.get('message', 'Customer needs assistance')
        timestamp = data.get('timestamp')
        
        # Check for spam/rate limiting
        current_time = datetime.utcnow()
        if table_id in assistance_cooldowns:
            time_since_last = (current_time - assistance_cooldowns[table_id]).total_seconds()
            if time_since_last < ASSISTANCE_COOLDOWN_SECONDS:
                remaining_time = int(ASSISTANCE_COOLDOWN_SECONDS - time_since_last)
                return jsonify({
                    'success': False,
                    'message': f'Please wait {remaining_time} seconds before requesting assistance again',
                    'cooldown_remaining': remaining_time
                }), 429  # Too Many Requests
        
        # Update cooldown for this table
        assistance_cooldowns[table_id] = current_time
        
        # Store the assistance request
        assistance_request = {
            'table_id': table_id,
            'table_number': table_number,
            'message': message,
            'timestamp': timestamp,
            'is_assigned': False,
            'waiter_assigned': None
        }
        
        # Check if there's an assigned waiter
        assignment = WaiterAssignment.query.filter_by(table_id=table_id, is_active=True).first()
        if assignment:
            assistance_request['is_assigned'] = True
            assistance_request['waiter_assigned'] = assignment.waiter.username
            print(f"📱 ASSISTANCE REQUEST - Table {table_number}: {message} at {timestamp} (Assigned to: {assignment.waiter.username})")
        else:
            print(f"📢 ASSISTANCE REQUEST - Table {table_number}: {message} at {timestamp} (No assigned waiter)")
        
        assistance_requests.append(assistance_request)
        
        return jsonify({
            'success': True,
            'message': 'Assistance request received',
            'table_number': table_number,
            'table_id': table_id,
            'timestamp': timestamp,
            'waiter_assigned': assistance_request['waiter_assigned'],
            'is_assigned': assistance_request['is_assigned']
        })
        
    except Exception as e:
        print(f"Error handling assistance request: {e}")
        return jsonify({
            'success': False,
            'message': 'Failed to process assistance request'
        }), 500

@app.route('/api/get_assistance_requests')
@license_middleware.require_license_for_api
def get_assistance_requests():
    """Get assistance requests for the current waiter (assigned tables only)"""
    waiter_id = session.get('user_id')
    if not waiter_id:
        print("❌ No waiter_id in session")
        return jsonify({'requests': []})
    
    # Get requests for tables assigned to this waiter
    assigned_table_ids = [assignment.table_id for assignment in 
                         WaiterAssignment.query.filter_by(waiter_id=waiter_id, is_active=True).all()]
    
    print(f"🔍 Waiter ID: {waiter_id}")
    print(f"🔍 Assigned table IDs: {assigned_table_ids}")
    print(f"🔍 All assistance requests: {assistance_requests}")
    
    # Filter requests for assigned tables (last 1 hour)
    from datetime import datetime, timedelta, timezone
    one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
    
    recent_requests = []
    for req in assistance_requests:
        if req.get('table_id') in assigned_table_ids:
            try:
                # Handle different timestamp formats
                timestamp_str = req.get('timestamp', '')
                if timestamp_str:
                    # Remove 'Z' and replace with '+00:00' for UTC
                    if timestamp_str.endswith('Z'):
                        timestamp_str = timestamp_str[:-1] + '+00:00'
                    # Parse the timestamp
                    request_time = datetime.fromisoformat(timestamp_str)
                    if request_time > one_hour_ago:
                        recent_requests.append(req)
                else:
                    # If no timestamp, include the request (assume it's recent)
                    recent_requests.append(req)
            except (ValueError, TypeError) as e:
                print(f"⚠️ Error parsing timestamp '{timestamp_str}': {e}")
                # Include the request anyway if timestamp parsing fails
                recent_requests.append(req)
    
    print(f"🔍 Filtered recent requests: {recent_requests}")
    
    return jsonify({'requests': recent_requests})

@app.route('/api/mark_assistance_handled', methods=['POST'])
@license_middleware.require_license_for_api
def mark_assistance_handled():
    """Mark assistance requests as handled"""
    try:
        data = request.json
        table_id = data.get('table_id')
        
        if not table_id:
            return jsonify({'success': False, 'message': 'Table ID required'})
        
        # Remove the assistance request from the list
        global assistance_requests
        original_count = len(assistance_requests)
        assistance_requests = [req for req in assistance_requests if req.get('table_id') != table_id]
        removed_count = original_count - len(assistance_requests)
        
        print(f"🗑️ Marked {removed_count} assistance request(s) as handled for table {table_id}")
        
        return jsonify({
            'success': True, 
            'message': f'Marked {removed_count} assistance request(s) as handled',
            'removed_count': removed_count
        })
        
    except Exception as e:
        print(f"Error marking assistance as handled: {e}")
        return jsonify({'success': False, 'message': 'Failed to mark assistance as handled'}), 500

@app.route('/api/mark_all_assistance_handled', methods=['POST'])
@license_middleware.require_license_for_api
def mark_all_assistance_handled():
    """Mark all assistance requests as handled"""
    try:
        global assistance_requests
        original_count = len(assistance_requests)
        assistance_requests.clear()
        
        print(f"🗑️ Marked all {original_count} assistance requests as handled")
        
        return jsonify({
            'success': True, 
            'message': f'Marked all {original_count} assistance requests as handled',
            'removed_count': original_count
        })
        
    except Exception as e:
        print(f"Error marking all assistance as handled: {e}")
        return jsonify({'success': False, 'message': 'Failed to mark all assistance as handled'}), 500

@app.route('/api/get_unassigned_assistance_requests')
@license_middleware.require_license_for_api
def get_unassigned_assistance_requests():
    """Get assistance requests from tables with no assigned waiter"""
    waiter_id = session.get('user_id')
    if not waiter_id:
        print("❌ No waiter_id in session")
        return jsonify({'requests': []})
    
    # Get all unassigned assistance requests (last 2 hours)
    from datetime import datetime, timedelta, timezone
    two_hours_ago = datetime.now(timezone.utc) - timedelta(hours=2)
    
    unassigned_requests = []
    for req in assistance_requests:
        if not req.get('is_assigned', False):  # Only unassigned requests
            try:
                timestamp_str = req.get('timestamp', '')
                if timestamp_str:
                    if timestamp_str.endswith('Z'):
                        timestamp_str = timestamp_str[:-1] + '+00:00'
                    request_time = datetime.fromisoformat(timestamp_str)
                    if request_time > two_hours_ago:
                        unassigned_requests.append(req)
                else:
                    unassigned_requests.append(req)
            except (ValueError, TypeError) as e:
                print(f"⚠️ Error parsing timestamp for unassigned request: {e}")
                unassigned_requests.append(req)
    
    # Sort by timestamp (oldest first - prioritize older requests)
    unassigned_requests.sort(key=lambda x: x.get('timestamp', ''))
    
    return jsonify({'requests': unassigned_requests})

@app.route('/api/claim_table_from_assistance', methods=['POST'])
@license_middleware.require_license_for_api
def claim_table_from_assistance():
    """Claim a table when responding to an assistance request"""
    data = request.get_json()
    waiter_id = session.get('user_id')
    
    if not waiter_id:
        return jsonify({'success': False, 'message': 'Not authenticated'})
    
    table_id = data.get('table_id')
    if not table_id:
        return jsonify({'success': False, 'message': 'Table ID is required'})
    
    try:
        from database.database_adapter import DatabaseAdapter
        db_adapter = DatabaseAdapter()
        
        result = db_adapter.claim_table(table_id, waiter_id)
        if not result['success']:
            return jsonify({'success': False, 'message': result['error']})
        
        # Update the assistance request to show it's now assigned
        for req in assistance_requests:
            if req.get('table_id') == table_id:
                req['is_assigned'] = True
                waiter = User.query.get(waiter_id)
                req['waiter_assigned'] = waiter.username if waiter else 'Unknown'
                break
        
        db.session.commit()
        
        # Get table number for response
        table = Table.query.get(table_id)
        table_number = table.number if table else 'Unknown'
        
        return jsonify({
            'success': True,
            'message': f'Table {table_number} claimed successfully',
            'table_id': table_id,
            'table_number': table_number
        })
        
    except Exception as e:
        db.session.rollback()
        print(f"Error claiming table: {e}")
        return jsonify({'success': False, 'message': 'Failed to claim table'}), 500

@app.route('/api/clear_assistance_requests', methods=['POST'])
@license_middleware.require_license_for_api
def clear_assistance_requests():
    """Clear assistance requests for current waiter"""
    global assistance_requests
    waiter_id = session.get('user_id')
    if not waiter_id:
        return jsonify({'success': False})
    
    assigned_table_ids = [assignment.table_id for assignment in 
                         WaiterAssignment.query.filter_by(waiter_id=waiter_id, is_active=True).all()]
    
    # Remove requests for assigned tables
    assistance_requests = [req for req in assistance_requests 
                          if req.get('table_id') not in assigned_table_ids]
    
    return jsonify({'success': True})

@app.route('/api/cleanup_assistance_requests', methods=['POST'])
@license_middleware.require_license_for_api
def cleanup_assistance_requests():
    """Clean up old assistance requests (admin/background task)"""
    try:
        remaining_count = cleanup_old_assistance_requests()
        return jsonify({
            'success': True,
            'message': 'Cleanup completed successfully',
            'remaining_requests': remaining_count
        })
    except Exception as e:
        print(f"Error during cleanup: {e}")
        return jsonify({
            'success': False,
            'message': 'Cleanup failed'
        }), 500

# API Endpoints

@app.route('/api/get_orders')
@license_middleware.require_license_for_api
def get_orders():
    """Get all orders - using direct queries for performance, ensuring compatibility with Order model"""
    try:
        orders = Order.query.all()
        orders_data = []
        
        for order in orders:
            # Get table_id from table relationship (Order uses table_number, but we need table.id)
            table_id = order.table.id if order.table else None
            
            # Check if order has been paid (using the payments relationship from Payment model)
            try:
                has_payment = len(order.payments) > 0 if hasattr(order, 'payments') and order.payments else False
            except Exception as e:
                # Fallback: query payments directly if relationship fails
                try:
                    from database.models import Payment
                    payment_count = Payment.query.filter_by(order_id=order.id).count()
                    has_payment = payment_count > 0
                except:
                    has_payment = False
            
            # Check if there's a pending refund request for any payment on this order
            has_pending_refund = False
            refund_request_id = None
            if has_payment:
                try:
                    from database.models import Payment, RefundRequest
                    # Get payments for this order
                    payments = Payment.query.filter_by(order_id=order.id).all()
                    for payment in payments:
                        # Check if there's a pending refund request
                        pending_request = RefundRequest.query.filter_by(
                            payment_id=payment.id,
                            status='pending'
                        ).first()
                        if pending_request:
                            has_pending_refund = True
                            refund_request_id = pending_request.id
                            break
                except:
                    pass
            
            order_data = {
                'id': order.id,
                'table_id': table_id,  # Get from table relationship
                'table_number': order.table_number,  # Order model uses table_number
                'customer_name': order.customer_name,
                'customer_phone': order.customer_phone,
                'waiter_id': order.waiter_id,
                'status': order.status,
                'total_amount': order.total_amount or 0.0,
                'created_at': order.created_at.isoformat() if order.created_at else None,
                'updated_at': order.updated_at.isoformat() if order.updated_at else None,
                'notes': order.notes,
                'has_payment': has_payment,  # Flag to indicate if order has been paid
                'has_pending_refund': has_pending_refund,
                'refund_request_id': refund_request_id,
                'items': []
            }
            
            for item in order.items:
                item_data = {
                    'id': item.id,
                    'menu_item_id': item.menu_item_id,
                    'name': item.menu_item.name if item.menu_item else 'Unknown Item',
                    'quantity': item.quantity,
                    'price': item.price,  # OrderItem model uses 'price', not 'unit_price'
                    'unit_price': item.price,  # Keep for backward compatibility
                    'status': item.status,
                    'special_instructions': item.special_instructions,  # OrderItem uses 'special_instructions'
                    'chef_notes': item.special_instructions,  # Keep for backward compatibility
                    'created_at': item.created_at.isoformat() if item.created_at else None
                }
                order_data['items'].append(item_data)
            
            orders_data.append(order_data)
        
        return jsonify({'orders': orders_data})
    except Exception as e:
        print(f"❌ Error in get_orders: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'orders': [], 'error': str(e)}), 500

@app.route('/api/create_order', methods=['POST'])
@license_middleware.require_license_for_api
def create_order():
    try:
        data = request.json
        print(f"📋 Creating order with data: {data}")
        
        # Validate required fields
        if not data.get('table_id') or not data.get('customer_name') or not data.get('items'):
            print("❌ Missing required fields")
            return jsonify({'success': False, 'message': 'Missing required fields'})
        
        # Get table to find table_number
        table = Table.query.get(data['table_id'])
        if not table:
            print(f"❌ Table not found: {data['table_id']}")
            return jsonify({'success': False, 'message': 'Table not found'})
        
        # Get waiter from session
        waiter_id = session.get('user_id')
        
        # Auto-assign waiter to table if not already assigned (for manual order entry)
        if waiter_id:
            existing_assignment = WaiterAssignment.query.filter_by(
                table_id=table.id, 
                waiter_id=waiter_id, 
                is_active=True
            ).first()
            
            if not existing_assignment:
                # Check if table is assigned to another waiter
                other_assignment = WaiterAssignment.query.filter_by(
                    table_id=table.id, 
                    is_active=True
                ).first()
                
                if not other_assignment:
                    # Create assignment - waiter is now assigned to this table
                    assignment = WaiterAssignment(
                        table_id=table.id,
                        waiter_id=waiter_id,
                        is_active=True
                    )
                    db.session.add(assignment)
                    print(f"✅ Auto-assigned waiter {waiter_id} to table {table.id} (Table {table.number})")
                else:
                    print(f"ℹ️ Table {table.id} already assigned to another waiter, skipping auto-assignment")
            else:
                print(f"ℹ️ Waiter {waiter_id} already assigned to table {table.id}")
        
        # Create new order - Order model uses table_number not table_id
        order = Order(
            table_number=table.number,  # Use table.number, not table_id
            waiter_id=waiter_id,
            customer_name=data['customer_name'],
            customer_phone=data.get('customer_phone', ''),
            status='pending',
            notes=data.get('notes', '')
        )
        
        print(f"📝 Created order object: {order}")
        db.session.add(order)
        db.session.commit()
        print(f"✅ Order committed to database with ID: {order.id}")
        
        total_amount = 0
        
        # Add order items - OrderItem uses 'price' not 'unit_price', and 'special_instructions' not 'notes'
        for item_data in data['items']:
            print(f"🍽️ Processing item: {item_data}")
            menu_item = MenuItem.query.get(item_data['menu_item_id'])
            if menu_item:
                order_item = OrderItem(
                    order_id=order.id,
                    menu_item_id=item_data['menu_item_id'],
                    quantity=item_data['quantity'],
                    price=menu_item.price,  # Changed from unit_price to price
                    special_instructions=item_data.get('notes', '')  # Changed from notes to special_instructions
                )
                print(f"📦 Created order item: {order_item}")
                db.session.add(order_item)
                total_amount += menu_item.price * item_data['quantity']
            else:
                print(f"⚠️ Menu item not found: {item_data['menu_item_id']}")
        
        # Update order total
        order.total_amount = total_amount
        db.session.commit()
        print(f"💰 Order total updated: ${total_amount}")
        
        return jsonify({'success': True, 'order_id': order.id})
        
    except Exception as e:
        print(f"❌ Error creating order: {str(e)}")
        import traceback
        traceback.print_exc()
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Error creating order: {str(e)}'})

@app.route('/api/update_order_status', methods=['POST'])
@license_middleware.require_license_for_api
def update_order_status():
    data = request.json
    order = Order.query.get(data['order_id'])
    
    if order:
        order.status = data['status']
        db.session.commit()
        return jsonify({'success': True})
    
    return jsonify({'success': False, 'message': 'Order not found'})

@app.route('/api/update_order_item_status', methods=['POST'])
@license_middleware.require_license_for_api
def update_order_item_status():
    """Update order item status - OrderItem uses special_instructions, not chef_notes"""
    data = request.json
    order_item = OrderItem.query.get(data['item_id'])
    
    if order_item:
        old_status = order_item.status
        order_item.status = data['status']
        # OrderItem model uses 'special_instructions', not 'chef_notes'
        if 'chef_notes' in data:
            order_item.special_instructions = data.get('chef_notes', '')
        elif 'special_instructions' in data:
            order_item.special_instructions = data.get('special_instructions', '')
        
        # Commit the item status change first
        db.session.commit()
        
        print(f"🍽️ Kitchen updated item {order_item.id} status: {old_status} → {data['status']}")
        
        # Automatically update the order status based on all item statuses
        if auto_update_order_status(order_item.order_id):
            print(f"✅ Order {order_item.order_id} status automatically updated")
        else:
            print(f"ℹ️ Order {order_item.order_id} status unchanged")
        
        return jsonify({'success': True, 'order_updated': True})
    
    return jsonify({'success': False, 'message': 'Order item not found'})

@app.route('/api/update_multiple_items_status', methods=['POST'])
@license_middleware.require_license_for_api
def update_multiple_items_status():
    """Update status of multiple order items at once"""
    data = request.json
    item_updates = data.get('items', [])
    
    if not item_updates:
        return jsonify({'success': False, 'message': 'No items provided'})
    
    updated_orders = set()  # Track which orders need status updates
    
    try:
        for item_update in item_updates:
            item_id = item_update.get('item_id')
            new_status = item_update.get('status')
            chef_notes = item_update.get('chef_notes', '')
            
            if not item_id or not new_status:
                continue
                
            order_item = OrderItem.query.get(item_id)
            if order_item:
                old_status = order_item.status
                order_item.status = new_status
                order_item.chef_notes = chef_notes
                
                # Track this order for status update
                updated_orders.add(order_item.order_id)
                
                print(f"🍽️ Kitchen updated item {item_id} status: {old_status} → {new_status}")
        
        # Commit all changes
        db.session.commit()
        
        # Update order statuses for all affected orders
        orders_updated = 0
        for order_id in updated_orders:
            if auto_update_order_status(order_id):
                orders_updated += 1
        
        print(f"✅ Updated {len(item_updates)} items, {orders_updated} orders statuses changed")
        
        return jsonify({
            'success': True, 
            'items_updated': len(item_updates),
            'orders_updated': orders_updated
        })
        
    except Exception as e:
        print(f"❌ Error updating multiple items: {str(e)}")
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Error updating items: {str(e)}'}), 500

@app.route('/api/auto_update_order_status/<int:order_id>', methods=['POST'])
@license_middleware.require_license_for_staff
def trigger_auto_update_order_status(order_id):
    """Manually trigger auto-update of order status (for testing/debugging)"""
    try:
        if auto_update_order_status(order_id):
            return jsonify({
                'success': True, 
                'message': f'Order {order_id} status automatically updated',
                'order_id': order_id
            })
        else:
            return jsonify({
                'success': True, 
                'message': f'Order {order_id} status unchanged',
                'order_id': order_id
            })
    except Exception as e:
        return jsonify({
            'success': False, 
            'message': f'Error updating order {order_id}: {str(e)}'
        }), 500

@app.route('/api/auto_update_all_orders', methods=['POST'])
@license_middleware.require_license_for_staff
def trigger_auto_update_all_orders():
    """Manually trigger auto-update of all active orders (for maintenance)"""
    try:
        updated_count = auto_update_all_orders()
        return jsonify({
            'success': True,
            'message': f'Auto-updated {updated_count} orders',
            'orders_updated': updated_count
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Error updating all orders: {str(e)}'
        }), 500

@app.route('/api/orders/<int:order_id>/status', methods=['PUT'])
@license_middleware.require_license_for_staff
def update_order_status_by_id(order_id):
    """Update order status (e.g., mark as served)"""
    try:
        data = request.json
        new_status = data.get('status')
        
        if not new_status:
            return jsonify({'success': False, 'message': 'Status is required'}), 400
        
        # Validate status
        valid_statuses = ['pending', 'confirmed', 'preparing', 'ready', 'served', 'cancelled']
        if new_status not in valid_statuses:
            return jsonify({'success': False, 'message': f'Invalid status. Must be one of: {valid_statuses}'}), 400
        
        order = Order.query.get(order_id)
        if not order:
            return jsonify({'success': False, 'message': 'Order not found'}), 404
        
        old_status = order.status
        order.status = new_status
        order.updated_at = datetime.utcnow()
        
        # If marking as served, only mark ready items as served (progressive service)
        if new_status == 'served':
            order_items = OrderItem.query.filter_by(order_id=order_id).all()
            ready_items = [item for item in order_items if item.status == 'ready']
            other_items = [item for item in order_items if item.status != 'ready']
            
            # Mark ready items as served
            for item in ready_items:
                item.status = 'served'
                print(f"🍽️ Marking ready item {item.id} as served for order {order_id}")
            
            # Log other items that are not ready
            if other_items:
                other_statuses = [f"Item {item.id}: {item.status}" for item in other_items]
                print(f"⚠️ Order {order_id} has items not ready: {', '.join(other_statuses)}")
                print(f"ℹ️ These items will remain in their current status for progressive service")
            
            # Check if we should revert order status if not all items are ready
            if other_items:
                print(f"🔄 Order {order_id} has {len(other_items)} items not ready, keeping order status as 'ready' for progressive service")
                order.status = 'ready'  # Keep order as ready if some items aren't ready
                new_status = 'ready'  # Update the response to reflect actual status
        
        db.session.commit()
        
        print(f"✅ Order {order_id} status updated: {old_status} → {new_status}")
        
        return jsonify({
            'success': True,
            'message': f'Order {order_id} status updated to {new_status}',
            'order_id': order_id,
            'old_status': old_status,
            'new_status': new_status,
            'items_served': len([item for item in order_items if item.status == 'served']),
            'items_remaining': len([item for item in order_items if item.status != 'served'])
        })
        
    except Exception as e:
        print(f"❌ Error updating order {order_id} status: {str(e)}")
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Error updating order status: {str(e)}'
        }), 500

@app.route('/api/get_menu')
@license_middleware.require_license_for_api
def get_menu():
    categories = Category.query.filter_by(is_active=True).all()
    menu_data = []
    
    for category in categories:
        category_data = {
            'id': category.id,
            'name': category.name,
            'description': category.description,
            'items': []
        }
        
        for item in category.menu_items:
            if item.is_available:
                item_data = {
                    'id': item.id,
                    'name': item.name,
                    'description': item.description,
                    'price': item.price,
                    'preparation_time': item.preparation_time,
                    'image_url': item.image_url
                }
                category_data['items'].append(item_data)
        
        menu_data.append(category_data)
    
    return jsonify({'menu': menu_data})

# Menu Management API Endpoints
@app.route('/api/get_full_menu')
@license_middleware.require_license_for_api
@cache_response(seconds=300)  # Cache for 5 minutes
def get_full_menu():
    """Get complete menu including inactive items for management using DatabaseAdapter"""
    try:
        from database.database_adapter import DatabaseAdapter
        db_adapter = DatabaseAdapter()
        
        # Get categories
        categories_result = db_adapter.get_all_categories()
        categories = categories_result.get('categories', []) if categories_result.get('success') else []
        
        # Get menu items
        menu_items_result = db_adapter.get_all_menu_items()
        menu_items = menu_items_result.get('menu_items', []) if menu_items_result.get('success') else []
        
        # Group menu items by category
        menu_data = []
        for category in categories:
            category_items = [item for item in menu_items if item.get('category_id') == category.get('id')]
            menu_data.append({
                'id': category.get('id'),
                'name': category.get('name'),
                'description': category.get('description'),
                'is_active': category.get('is_active', True),
                'created_at': category.get('created_at', ''),
                'items': category_items
            })
        
        response = jsonify({
            'success': True,
            'menu': menu_data
        })
        
        # Add headers to prevent client-side caching
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        
        return response
        
    except Exception as e:
        print(f"Error getting full menu: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'menu': []
        })

@app.route('/api/save_category', methods=['POST'])
@license_middleware.require_license_for_api
def save_category():
    data = request.get_json()
    
    try:
        if data.get('id'):  # Update existing category
            category = Category.query.get(data['id'])
            if not category:
                return jsonify({'success': False, 'message': 'Category not found'})
        else:  # Create new category
            category = Category()
        
        category.name = data['name']
        category.description = data.get('description', '')
        category.is_active = data.get('is_active', True)
        
        if not data.get('id'):  # Only add to session if new
            db.session.add(category)
        
        db.session.commit()
        
        # Clear menu cache to ensure immediate visibility
        clear_menu_cache()
        
        return jsonify({
            'success': True,
            'message': 'Category saved successfully',
            'category': {
                'id': category.id,
                'name': category.name,
                'description': category.description,
                'is_active': category.is_active
            }
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/save_menu_item', methods=['POST'])
@license_middleware.require_license_for_api
def save_menu_item():
    data = request.get_json()
    
    try:
        if data.get('id'):  # Update existing item
            menu_item = MenuItem.query.get(data['id'])
            if not menu_item:
                return jsonify({'success': False, 'message': 'Menu item not found'})
        else:  # Create new item
            menu_item = MenuItem()
        
        menu_item.name = data['name']
        menu_item.description = data.get('description', '')
        menu_item.price = float(data['price'])
        menu_item.category_id = int(data['category_id'])
        menu_item.preparation_time = data.get('preparation_time', 0)
        menu_item.is_available = data.get('is_available', True)
        menu_item.image_url = data.get('image_url', '')
        
        if not data.get('id'):  # Only add to session if new
            db.session.add(menu_item)
        
        # Commit to ensure data is persisted
        db.session.commit()
        
        # Clear menu cache to ensure immediate visibility of new/updated items
        print(f"🔄 Menu item saved: {menu_item.name} (ID: {menu_item.id}) - Clearing cache...")
        clear_menu_cache()
        
        return jsonify({
            'success': True,
            'message': 'Menu item saved successfully',
            'item': {
                'id': menu_item.id,
                'name': menu_item.name,
                'description': menu_item.description,
                'price': menu_item.price,
                'category_id': menu_item.category_id,
                'preparation_time': menu_item.preparation_time,
                'is_available': menu_item.is_available,
                'image_url': menu_item.image_url
            }
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/delete_category', methods=['POST'])
@license_middleware.require_license_for_api
def delete_category():
    data = request.get_json()
    category_id = data.get('id')
    
    if not category_id:
        return jsonify({'success': False, 'message': 'Category ID is required'})
    
    try:
        category = Category.query.get(category_id)
        if not category:
            return jsonify({'success': False, 'message': 'Category not found'})
        
        # Check if category has menu items
        if category.menu_items:
            return jsonify({'success': False, 'message': 'Cannot delete category with menu items. Please move or delete items first.'})
        
        db.session.delete(category)
        db.session.commit()
        
        # Clear menu cache to ensure immediate visibility of changes
        clear_menu_cache()
        
        return jsonify({'success': True, 'message': 'Category deleted successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/delete_menu_item', methods=['POST'])
@license_middleware.require_license_for_api
def delete_menu_item():
    data = request.get_json()
    item_id = data.get('id')
    
    if not item_id:
        return jsonify({'success': False, 'message': 'Menu item ID is required'})
    
    try:
        menu_item = MenuItem.query.get(item_id)
        if not menu_item:
            return jsonify({'success': False, 'message': 'Menu item not found'})
        
        item_name = menu_item.name
        item_category_id = menu_item.category_id
        
        db.session.delete(menu_item)
        db.session.commit()
        
        # Clear menu cache to ensure immediate visibility of changes
        print(f"🗑️ Menu item deleted: {item_name} (ID: {item_id}, Category: {item_category_id}) - Clearing cache...")
        clear_menu_cache()
        
        return jsonify({'success': True, 'message': 'Menu item deleted successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)})


# ── Meal Combo / Bundle API ───────────────────────────────────────────────────

@app.route('/api/get_meal_combos')
@license_middleware.require_license_for_api
def get_meal_combos():
    """Return all meal combos (active only for cashier; all for admin)."""
    try:
        from database.models import MealCombo
        active_only = request.args.get('active_only', 'false').lower() == 'true'
        q = MealCombo.query
        if active_only:
            q = q.filter_by(is_active=True)
        combos = q.order_by(MealCombo.name).all()
        return jsonify({'success': True, 'combos': [c.to_dict() for c in combos]})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e), 'combos': []})


@app.route('/api/save_meal_combo', methods=['POST'])
@license_middleware.require_license_for_api
def save_meal_combo():
    """Create or update a meal combo."""
    data = request.get_json()
    try:
        from database.models import MealCombo, MealComboItem
        if data.get('id'):
            combo = MealCombo.query.get(data['id'])
            if not combo:
                return jsonify({'success': False, 'message': 'Combo not found'})
            # Remove old items; we'll replace them
            for item in list(combo.items):
                db.session.delete(item)
            db.session.flush()
        else:
            combo = MealCombo()
            db.session.add(combo)

        combo.name = data.get('name', '').strip()
        combo.description = data.get('description', '').strip()
        combo.combo_price = float(data.get('combo_price', 0))
        combo.image_url = data.get('image_url', '').strip()
        combo.is_active = data.get('is_active', True)

        if not combo.name:
            return jsonify({'success': False, 'message': 'Combo name is required'})
        if combo.combo_price <= 0:
            return jsonify({'success': False, 'message': 'Combo price must be greater than 0'})

        for line in data.get('items', []):
            ci = MealComboItem(
                menu_item_id=int(line['menu_item_id']),
                quantity=int(line.get('quantity', 1)),
                role_label=line.get('role_label', '').strip()
            )
            combo.items.append(ci)

        db.session.commit()
        return jsonify({'success': True, 'message': 'Meal combo saved', 'combo': combo.to_dict()})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)})


@app.route('/api/delete_meal_combo', methods=['POST'])
@license_middleware.require_license_for_api
def delete_meal_combo():
    """Delete a meal combo."""
    data = request.get_json()
    combo_id = data.get('id')
    if not combo_id:
        return jsonify({'success': False, 'message': 'Combo ID required'})
    try:
        from database.models import MealCombo
        combo = MealCombo.query.get(combo_id)
        if not combo:
            return jsonify({'success': False, 'message': 'Combo not found'})
        db.session.delete(combo)
        db.session.commit()
        return jsonify({'success': True, 'message': 'Meal combo deleted'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)})


# ─────────────────────────────────────────────────────────────────────────────

@app.route('/api/verify_password', methods=['POST'])
@license_middleware.require_license_for_api
def verify_password():
    """Verify admin/manager password for sensitive operations.
    Allows any logged-in user (including cashiers) to verify an admin/manager password"""
    data = request.json
    password = data.get('password')
    
    if not password:
        return jsonify({'success': False, 'message': 'Password required'})
    
    try:
        user_id = session.get('user_id')
        if not user_id:
            return jsonify({'success': False, 'message': 'User not logged in'}), 401
        
        # Instead of checking the logged-in user's role, verify the password against
        # any admin or manager account in the system
        # This allows cashiers to enter an admin/manager password for refund operations
        admin_manager_users = User.query.filter(
            User.role.in_(['admin', 'manager']),
            User.is_active == True
        ).all()
        
        # Check if the provided password matches any admin/manager account
        for user in admin_manager_users:
            if user.check_password(password):
                # Store which admin's password was verified in session
                # This will be used when approving to track both the cashier and the admin
                session['verified_admin_id'] = user.id
                session['verified_admin_username'] = user.username
                session['verified_admin_name'] = user.name
                return jsonify({
                    'success': True,
                    'admin_name': user.name,
                    'admin_username': user.username
                })
        
        # If no admin/manager password matched, return error
        return jsonify({'success': False, 'message': 'Invalid password. Admin/Manager access required.'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/verify_password_legacy', methods=['POST'])
def verify_password_legacy():
    """Verify user password for license serial access (legacy endpoint)"""
    try:
        data = request.get_json()
        password = data.get('password')
        
        if not password:
            return jsonify({
                'success': False,
                'error': 'Password required'
            })
        
        # Get current user from session
        user_id = session.get('user_id')
        if not user_id:
            return jsonify({
                'success': False,
                'error': 'Not logged in'
            })
        
        # Get user from database using DatabaseAdapter (works for both local and remote)
        from database.database_adapter import DatabaseAdapter
        db_adapter = DatabaseAdapter()
        
        # Get all users and find the one with matching ID
        users_result = db_adapter.get_all_users()
        if not users_result.get('success'):
            return jsonify({
                'success': False,
                'error': 'Failed to retrieve user data'
            })
        
        # Find user by ID
        user_data = None
        for user in users_result.get('data', []):
            if user.get('id') == user_id:
                user_data = user
                break
        
        if not user_data:
            return jsonify({
                'success': False,
                'error': 'User not found'
            })
        
        # Verify password using the password hash from the user data
        from werkzeug.security import check_password_hash
        if check_password_hash(user_data.get('password_hash', ''), password):
            return jsonify({
                'success': True,
                'message': 'Password verified'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Invalid password'
            })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/api/admin/switch_to_cashier', methods=['POST'])
@license_middleware.require_license_for_api
def switch_to_cashier():
    """Allow admin to switch to cash register mode"""
    try:
        if 'user_id' not in session or session.get('role') != 'admin':
            return jsonify({
                'success': False,
                'message': 'Admin access required'
            }), 403
        
        # Store original admin role and switch to cashier mode
        session['original_role'] = 'admin'
        session['switched_to_cashier'] = True
        session['role'] = 'cashier'  # Temporarily set role to cashier for UI purposes
        
        return jsonify({
            'success': True,
            'message': 'Switched to cash register mode'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/admin/switch_back', methods=['POST'])
@license_middleware.require_license_for_api
def switch_back_to_admin():
    """Allow admin to switch back from cash register mode"""
    try:
        if 'user_id' not in session:
            return jsonify({
                'success': False,
                'message': 'Not logged in'
            }), 401
        
        # Check if user was originally an admin who switched
        if session.get('original_role') == 'admin' and session.get('switched_to_cashier'):
            # Restore original admin role
            session['role'] = 'admin'
            session.pop('switched_to_cashier', None)
            session.pop('original_role', None)
            
            return jsonify({
                'success': True,
                'message': 'Switched back to admin mode'
            })
        else:
            return jsonify({
                'success': False,
                'message': 'No admin switch active'
            }), 400
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500

@app.route('/api/get_license_serial')
def get_license_serial():
    """Get current license serial for display purposes (no auth required)"""
    try:
        from database.models import LicenseActivation
        
        # Get the active license
        active_license = LicenseActivation.query.filter_by(is_active=True).first()
        
        if active_license:
            return jsonify({
                'success': True,
                'serial_number': active_license.serial_number,
                'license_type': active_license.license_type,
                'company_name': active_license.company.company_name if active_license.company else 'Unknown',
                'activation_date': active_license.activation_date.isoformat(),
                'expiration_date': active_license.expiration_date.isoformat(),
                'max_users': active_license.max_users
            })
        else:
            return jsonify({
                'success': False,
                'error': 'No active license found'
            })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/api/database/health')
def database_health():
    """Get database health information"""
    try:
        from database.db_utils import get_database_info, DatabaseUtils
        
        db_path = os.path.join(os.path.dirname(__file__), 'restaurant.db')
        utils = DatabaseUtils(db_path)
        
        # Get basic info
        info = get_database_info(db_path)
        if not info['success']:
            return jsonify(info)
        
        # Get health check
        health = utils.get_database_health()
        if not health['success']:
            return jsonify(health)
        
        return jsonify({
            'success': True,
            'database_info': info,
            'health_status': health
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Health check failed: {str(e)}'
        })

@app.route('/api/database/backup', methods=['POST'])
def create_database_backup():
    """Create a database backup"""
    try:
        from database.db_utils import backup_database
        
        db_path = os.path.join(os.path.dirname(__file__), 'restaurant.db')
        result = backup_database(db_path)
        
        return jsonify(result)
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Backup failed: {str(e)}'
        })

@app.route('/api/database/optimize', methods=['POST'])
def optimize_database():
    """Optimize database performance"""
    try:
        from database.db_utils import optimize_database
        
        db_path = os.path.join(os.path.dirname(__file__), 'restaurant.db')
        result = optimize_database(db_path)
        
        return jsonify(result)
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Optimization failed: {str(e)}'
        })

@app.route('/api/database/migrations/status')
def migration_status():
    """Get migration status"""
    try:
        from database.migrations import get_migration_status
        
        db_path = os.path.join(os.path.dirname(__file__), 'restaurant.db')
        result = get_migration_status(db_path)
        
        return jsonify(result)
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to get migration status: {str(e)}'
        })

@app.route('/api/database/migrations/run', methods=['POST'])
def run_migrations():
    """Run database migrations"""
    try:
        from database.migrations import migrate_database
        
        db_path = os.path.join(os.path.dirname(__file__), 'restaurant.db')
        result = migrate_database(db_path)
        
        return jsonify(result)
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Migration failed: {str(e)}'
        })

@app.route('/api/reset_system_data', methods=['POST'])
def reset_system_data():
    """Reset all system data - requires admin password verification"""
    try:
        import subprocess
        import os
        from datetime import datetime
        
        data = request.get_json()
        password = data.get('password', '')
        
        if not password:
            return jsonify({
                'success': False,
                'error': 'Admin password required for reset operation'
            })
        
        # Database path - use the main modular database
        db_path = os.path.join(os.path.dirname(__file__), 'restaurant.db')
        
        # Verify admin password using direct SQLite connection
        try:
            import sqlite3
            from werkzeug.security import check_password_hash
            
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            
            # Get admin user
            cursor.execute("SELECT password_hash FROM user WHERE role = 'admin' LIMIT 1")
            result = cursor.fetchone()
            
            if not result:
                conn.close()
                return jsonify({
                    'success': False,
                    'error': 'No admin user found - cannot verify password'
                })
            
            # Verify password
            password_hash = result[0]
            if not check_password_hash(password_hash, password):
                conn.close()
                return jsonify({
                    'success': False,
                    'error': 'Invalid admin password'
                })
            
            conn.close()
        except Exception as e:
            return jsonify({
                'success': False,
                'error': f'Password verification failed: {str(e)}'
            })
        
        # Use the enhanced reset system
        try:
            from enhanced_reset_system import EnhancedResetSystem
            
            # Determine reset type based on current configuration
            from database_manager import db_manager
            config = db_manager.get_database_configuration()
            is_remote = config.get('config', {}).get('is_remote', False)
            reset_type = 'remote' if is_remote else 'local'
            
            print(f"🔄 Using {reset_type} reset mode")
            
            # Initialize and run reset system
            reset_system = EnhancedResetSystem()
            result = reset_system.reset_system(reset_type, password)
            
            if result['success']:
                print("✅ Enhanced reset completed successfully")
                return jsonify({
                    'success': True,
                    'message': f'{reset_type.title()} system reset successfully. All data has been cleared.',
                    'backup_created': bool(result.get('backup_path')),
                    'backup_path': result.get('backup_path'),
                    'requires_restart': result.get('requires_restart', True),
                    'reset_type': reset_type
                })
            else:
                print(f"❌ Enhanced reset failed: {result['error']}")
                return jsonify({
                    'success': False,
                    'error': f'Reset failed: {result["error"]}'
                })
        except Exception as e:
            print(f"❌ Error running reset script: {e}")
            return jsonify({
                'success': False,
                'error': f'Failed to run reset script: {str(e)}'
            })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Reset failed: {str(e)}'
        })

@app.route('/api/get_base_url')
def get_base_url():
    """Get the appropriate base URL for QR codes based on request context"""
    # Get the host from the request
    host = request.host
    scheme = request.scheme
    
    # Check if it's a local IP address
    host_ip = host.split(':')[0]  # Remove port if present
    
    is_local = (
        host_ip == 'localhost' or 
        host_ip == '127.0.0.1' or 
        host_ip.startswith('192.168.') or 
        host_ip.startswith('10.') or 
        host_ip.startswith('172.16.') or 
        host_ip.startswith('172.17.') or 
        host_ip.startswith('172.18.') or 
        host_ip.startswith('172.19.') or 
        host_ip.startswith('172.2') or 
        host_ip.startswith('172.30.') or 
        host_ip.startswith('172.31.')
    )
    
    base_url = f"{scheme}://{host}"
    
    # Check if there's a configured public URL in settings
    public_url_setting = SystemSettings.query.filter_by(setting_key='public_url').first()
    
    if public_url_setting and public_url_setting.setting_value and not is_local:
        # Use configured public URL for internet connections
        base_url = public_url_setting.setting_value.rstrip('/')
    
    return jsonify({
        'base_url': base_url,
        'host': host,
        'is_local': is_local,
        'connection_type': 'local' if is_local else 'internet',
        'has_public_url': bool(public_url_setting and public_url_setting.setting_value)
    })

@app.route('/api/get_tables')
@license_middleware.require_license_for_api
@cache_response(seconds=300)  # Cache for 5 minutes
def get_tables():
    """Get all tables using optimized DatabaseAdapter"""
    # Use optimized database adapter
    db_adapter = get_optimized_db_adapter()
    
    result = db_adapter.get_all_tables()
    if result.get('success'):
        tables = result.get('tables', [])
        tables_data = []
        for table in tables:
            table_data = {
                'id': table.get('id'),
                'number': table.get('number'),
                'capacity': table.get('capacity'),
                'is_occupied': table.get('is_occupied', False),
                'location': table.get('location')
            }
            tables_data.append(table_data)
        
        return jsonify({'tables': tables_data})
    else:
        return jsonify({
            'tables': [],
            'error': result.get('error', 'Failed to retrieve tables')
        }), 500

@app.route('/api/save_table', methods=['POST'])
@license_middleware.require_license_for_api
def save_table():
    data = request.json
    
    try:
        if 'id' in data and data['id']:
            # Update existing table
            table = Table.query.get(data['id'])
            if table:
                table.number = data['number']
                table.capacity = data['capacity']
                table.location = data.get('location')
        else:
            # Create new table
            table = Table(
                number=data['number'],
                capacity=data['capacity'],
                location=data.get('location'),
                is_occupied=False
            )
            db.session.add(table)
        
        db.session.commit()
        return jsonify({'success': True, 'table_id': table.id})
    
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/delete_table', methods=['POST'])
@license_middleware.require_license_for_api
def delete_table():
    data = request.json
    table_id = data.get('id')
    
    try:
        table = Table.query.get(table_id)
        if table:
            db.session.delete(table)
            db.session.commit()
            return jsonify({'success': True})
        else:
            return jsonify({'success': False, 'message': 'Table not found'})
    
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/create_payment', methods=['POST'])
@license_middleware.require_license_for_api
def create_payment():
    data = request.json
    
    payment = Payment(
        order_id=data['order_id'],
        amount=data['amount'],
        payment_method=data['payment_method'],
        transaction_id=data.get('transaction_id', ''),
        notes=data.get('notes', ''),
        status='completed'
    )
    
    db.session.add(payment)
    
    # Update order status
    order = Order.query.get(data['order_id'])
    if order:
        order.status = 'served'
    
    db.session.commit()
    
    return jsonify({'success': True, 'payment_id': payment.id})

@app.route('/api/create_manual_payment', methods=['POST'])
@license_middleware.require_license_for_api
def create_manual_payment():
    """Create a manual payment without an associated order"""
    data = request.json
    
    # Identify the logged-in cashier
    cashier_name = session.get('name', session.get('username', 'Unknown'))
    cashier_username = session.get('username', 'unknown')
    processed_by = f"{cashier_name} ({cashier_username})"
    
    # Create a manual payment record
    payment = Payment(
        order_id=None,  # No order associated
        amount=data['amount'],
        payment_method=data['payment_method'],
        transaction_id=data.get('transaction_id', ''),
        status='completed',
        notes=data.get('notes', ''),
        customer_name=data.get('customer_name', ''),
        is_manual=True,
        processed_by=processed_by
    )
    
    db.session.add(payment)
    db.session.commit()
    
    return jsonify({'success': True, 'payment_id': payment.id})

@app.route('/api/get_manual_transactions')
@license_middleware.require_license_for_api
def get_manual_transactions():
    """Get manual transactions for today"""
    today = date.today()
    
    # Get manual payments for today
    manual_payments = Payment.query.filter(
        Payment.is_manual == True,
        db.func.date(Payment.created_at) == today
    ).order_by(Payment.created_at.desc()).all()
    
    return jsonify({
        'transactions': [{
            'id': p.id,
            'amount': p.amount,
            'payment_method': p.payment_method,
            'customer_name': p.customer_name,
            'notes': p.notes,
            'created_at': p.created_at.isoformat(),
            'is_manual': p.is_manual
        } for p in manual_payments]
    })

@app.route('/api/get_payment_by_order/<int:order_id>')
@license_middleware.require_license_for_api
def get_payment_by_order(order_id):
    """Get payment information for a specific order"""
    try:
        payment = Payment.query.filter_by(order_id=order_id).first()
        if payment:
            return jsonify({
                'success': True,
                'payment': {
                    'id': payment.id,
                    'order_id': payment.order_id,
                    'amount': payment.amount,
                    'payment_method': payment.payment_method,
                    'transaction_id': payment.transaction_id,
                    'status': payment.status,
                    'notes': payment.notes,
                    'created_at': payment.created_at.isoformat() if payment.created_at else None
                }
            })
        else:
            return jsonify({'success': False, 'message': 'Payment not found'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/get_user_role')
@license_middleware.require_license_for_api
def get_user_role():
    """Get current user role"""
    try:
        role = session.get('role', 'cashier')
        return jsonify({'role': role})
    except Exception as e:
        return jsonify({'role': 'cashier'})

@app.route('/api/get_setting')
@license_middleware.require_license_for_api
def get_setting():
    """Get a single system setting"""
    setting_key = request.args.get('key')
    if not setting_key:
        return jsonify({'success': False, 'message': 'Setting key required'}), 400
    
    try:
        from database.models import SystemSettings
        setting = SystemSettings.query.filter_by(setting_key=setting_key).first()
        if setting:
            return jsonify({'success': True, 'value': setting.setting_value})
        else:
            return jsonify({'success': True, 'value': None})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/refund_payment', methods=['POST'])
@license_middleware.require_license_for_api
def refund_payment():
    """Request or process a refund for a payment"""
    data = request.json
    payment_id = data.get('payment_id')
    order_id = data.get('order_id')
    amount = data.get('amount')
    reason = data.get('reason', '')
    
    if not payment_id:
        return jsonify({'success': False, 'message': 'Payment ID required'})
    
    try:
        # Check refund permissions
        from database.models import SystemSettings
        user_role = session.get('role', 'cashier')
        user_id = session.get('user_id')
        
        # Get the payment
        payment = Payment.query.get(payment_id)
        if not payment:
            return jsonify({'success': False, 'message': 'Payment not found'})
        
        # Admin/Manager can always refund directly
        if user_role in ['admin', 'manager']:
            # Process refund immediately
            refund = Payment(
                order_id=order_id,
                amount=-abs(amount),  # Negative amount for refund
                payment_method=payment.payment_method,
                transaction_id=f"REFUND-{payment.transaction_id}" if payment.transaction_id else f"REFUND-{payment.id}",
                status='completed',
                notes=f"Refund for payment #{payment_id}"
            )
            
            db.session.add(refund)
            
            # Update original payment status to refunded
            payment.status = 'refunded'
            
            # Update order status back to ready if it was served
            if order_id:
                order = Order.query.get(order_id)
                if order and order.status == 'served':
                    order.status = 'ready'
            
            db.session.commit()
            
            return jsonify({'success': True, 'refund_id': refund.id, 'processed': True})
        
        # Cashiers need to check settings
        refund_setting = SystemSettings.query.filter_by(setting_key='refund_permission').first()
        refund_permission = refund_setting.setting_value if refund_setting else 'request_approval'
        
        if refund_permission == 'dont_allow':
            return jsonify({'success': False, 'message': 'Refunds are not allowed for cashiers'}), 403
        elif refund_permission == 'request_approval':
            # Create refund request instead of processing
            # Check if there's already a pending request
            existing_request = RefundRequest.query.filter_by(
                payment_id=payment_id,
                status='pending'
            ).first()
            
            if existing_request:
                return jsonify({
                    'success': False,
                    'message': 'A refund request for this payment is already pending approval',
                    'request_id': existing_request.id
                }), 400
            
            refund_request = RefundRequest(
                payment_id=payment_id,
                order_id=order_id,
                amount=amount,
                requested_by=user_id,
                reason=reason,
                status='pending'
            )
            
            db.session.add(refund_request)
            db.session.commit()
            
            return jsonify({
                'success': True,
                'request_id': refund_request.id,
                'message': 'Refund request submitted and pending approval',
                'processed': False
            })
        elif refund_permission == 'allow':
            # Process refund immediately for cashiers
            refund = Payment(
                order_id=order_id,
                amount=-abs(amount),  # Negative amount for refund
                payment_method=payment.payment_method,
                transaction_id=f"REFUND-{payment.transaction_id}" if payment.transaction_id else f"REFUND-{payment.id}",
                status='completed',
                notes=f"Refund for payment #{payment_id}"
            )
            
            db.session.add(refund)
            
            # Update original payment status to refunded
            payment.status = 'refunded'
            
            # Update order status back to ready if it was served
            if order_id:
                order = Order.query.get(order_id)
                if order and order.status == 'served':
                    order.status = 'ready'
            
            db.session.commit()
            
            return jsonify({'success': True, 'refund_id': refund.id, 'processed': True})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/get_refund_requests')
@license_middleware.require_license_for_api
def get_refund_requests():
    """Get all refund requests (pending, approved, rejected)"""
    try:
        status_filter = request.args.get('status', 'all')  # all, pending, approved, rejected, processed
        
        # Eager load relationships to avoid N+1 queries and ensure data is available
        from sqlalchemy.orm import joinedload
        if status_filter == 'all':
            requests = RefundRequest.query.options(
                joinedload(RefundRequest.approver),
                joinedload(RefundRequest.requester),
                joinedload(RefundRequest.payment),
                joinedload(RefundRequest.order)
            ).order_by(RefundRequest.created_at.desc()).all()
        else:
            requests = RefundRequest.query.options(
                joinedload(RefundRequest.approver),
                joinedload(RefundRequest.requester),
                joinedload(RefundRequest.payment),
                joinedload(RefundRequest.order)
            ).filter_by(status=status_filter).order_by(RefundRequest.created_at.desc()).all()
        
        requests_data = []
        for req in requests:
            request_data = req.to_dict()
            
            # Add payment details
            if req.payment:
                request_data['payment'] = {
                    'id': req.payment.id,
                    'payment_method': req.payment.payment_method,
                    'transaction_id': req.payment.transaction_id,
                    'created_at': req.payment.created_at.isoformat() if req.payment.created_at else None
                }
            
            # Add order details
            if req.order:
                request_data['order'] = {
                    'id': req.order.id,
                    'table_number': req.order.table_number,
                    'total_amount': req.order.total_amount
                }
            
            # Add requester details
            if req.requester:
                request_data['requester'] = {
                    'id': req.requester.id,
                    'name': req.requester.name,
                    'username': req.requester.username,
                    'role': req.requester.role
                }
            
            # Add approver details if exists
            if req.approver:
                request_data['approver'] = {
                    'id': req.approver.id,
                    'name': req.approver.name,
                    'username': req.approver.username,
                    'role': req.approver.role
                }
            
            # Extract verified admin info from reason or rejection_reason field if present
            # Format: "[Approved/Rejected by: Cashier Name (cashier_username) - Verified with Admin: Admin Name (admin_username)]"
            import re
            verified_admin_match = None
            # Check reason field first (for approved requests)
            if req.reason:
                verified_admin_match = re.search(r'Verified with Admin:\s*(.+?)\]', req.reason)
            # Check rejection_reason field (for rejected requests)
            if not verified_admin_match and req.rejection_reason:
                verified_admin_match = re.search(r'Verified with Admin:\s*(.+?)\]', req.rejection_reason)
            
            if verified_admin_match:
                verified_admin_str = verified_admin_match.group(1).strip()
                # Parse "Admin Name (admin_username)"
                admin_match = re.match(r'(.+?)\s*\((.+?)\)', verified_admin_str)
                if admin_match:
                    request_data['verified_admin'] = {
                        'name': admin_match.group(1).strip(),
                        'username': admin_match.group(2).strip()
                    }
            
            requests_data.append(request_data)
        
        return jsonify({'success': True, 'requests': requests_data})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/approve_refund_request', methods=['POST'])
@license_middleware.require_license_for_api
def approve_refund_request():
    """Approve and process a refund request
    Note: Cashiers can approve refunds after verifying admin/manager password to view the request"""
    data = request.json
    request_id = data.get('request_id')
    
    if not request_id:
        return jsonify({'success': False, 'message': 'Request ID required'})
    
    # Allow any logged-in user to approve (they've already verified admin/manager password to view)
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'message': 'User not logged in'}), 401
    
    try:
        refund_request = RefundRequest.query.get(request_id)
        
        if not refund_request:
            return jsonify({'success': False, 'message': 'Refund request not found'})
        
        if refund_request.status != 'pending':
            return jsonify({'success': False, 'message': f'Refund request is already {refund_request.status}'})
        
        # Get the payment
        payment = Payment.query.get(refund_request.payment_id)
        if not payment:
            return jsonify({'success': False, 'message': 'Payment not found'})
        
        # Process the refund
        refund = Payment(
            order_id=refund_request.order_id,
            amount=-abs(refund_request.amount),  # Negative amount for refund
            payment_method=payment.payment_method,
            transaction_id=f"REFUND-{payment.transaction_id}" if payment.transaction_id else f"REFUND-{payment.id}",
            status='completed',
            notes=f"Refund for payment #{payment.id} (Approved request #{request_id})"
        )
        
        db.session.add(refund)
        
        # Update original payment status to refunded
        payment.status = 'refunded'
        
        # Update refund request
        refund_request.status = 'processed'  # Set status to processed
        # Store the cashier who approved (logged-in user)
        refund_request.approved_by = user_id
        refund_request.approved_at = datetime.utcnow()
        refund_request.processed_at = datetime.utcnow()
        
        # Get the current user info
        current_user = User.query.get(user_id)
        if not current_user:
            current_user = User.query.first()  # Fallback
        
        cashier_info = f"{current_user.name if current_user else 'Unknown'} ({current_user.username if current_user else 'unknown'})"
        
        # Determine admin info: if session has verified_admin, use that; otherwise, if current user is admin/manager, use them
        verified_admin_id = session.get('verified_admin_id')
        if verified_admin_id:
            # Cashier used admin password - use the verified admin from session
            verified_admin_username = session.get('verified_admin_username', 'Unknown')
            verified_admin_name = session.get('verified_admin_name', 'Unknown')
            admin_info = f"{verified_admin_name} ({verified_admin_username})"
        elif current_user and current_user.role in ['admin', 'manager']:
            # Admin/Manager approved directly - use their own info
            admin_info = f"{current_user.name} ({current_user.username})"
        else:
            # Fallback
            admin_info = "Unknown (Unknown)"
        
        # Update notes to include both cashier and admin info
        existing_notes = refund_request.reason or ''
        refund_request.reason = f"{existing_notes}\n[Approved by: {cashier_info} - Verified with Admin: {admin_info}]".strip()
        
        # Clear verified admin from session after approval (for security)
        session.pop('verified_admin_id', None)
        session.pop('verified_admin_username', None)
        session.pop('verified_admin_name', None)
        
        # Update order status back to ready if it was served
        if refund_request.order_id:
            order = Order.query.get(refund_request.order_id)
            if order and order.status == 'served':
                order.status = 'ready'
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Refund request approved and processed',
            'refund_id': refund.id
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/reject_refund_request', methods=['POST'])
@license_middleware.require_license_for_api
def reject_refund_request():
    """Reject a refund request
    Note: Cashiers can reject refunds after verifying admin/manager password to view the request"""
    data = request.json
    request_id = data.get('request_id')
    rejection_reason = data.get('rejection_reason', '')
    
    if not request_id:
        return jsonify({'success': False, 'message': 'Request ID required'})
    
    # Allow any logged-in user to reject (they've already verified admin/manager password to view)
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'success': False, 'message': 'User not logged in'}), 401
    
    try:
        refund_request = RefundRequest.query.get(request_id)
        
        if not refund_request:
            return jsonify({'success': False, 'message': 'Refund request not found'})
        
        if refund_request.status != 'pending':
            return jsonify({'success': False, 'message': f'Refund request is already {refund_request.status}'})
        
        # Update refund request
        refund_request.status = 'rejected'
        refund_request.approved_by = user_id  # Store the cashier who rejected
        refund_request.approved_at = datetime.utcnow()
        refund_request.rejection_reason = rejection_reason
        
        # Get the current user info
        current_user = User.query.get(user_id)
        if not current_user:
            current_user = User.query.first()  # Fallback
        
        cashier_info = f"{current_user.name if current_user else 'Unknown'} ({current_user.username if current_user else 'unknown'})"
        
        # Determine admin info: if session has verified_admin, use that; otherwise, if current user is admin/manager, use them
        verified_admin_id = session.get('verified_admin_id')
        if verified_admin_id:
            # Cashier used admin password - use the verified admin from session
            verified_admin_username = session.get('verified_admin_username', 'Unknown')
            verified_admin_name = session.get('verified_admin_name', 'Unknown')
            admin_info = f"{verified_admin_name} ({verified_admin_username})"
        elif current_user and current_user.role in ['admin', 'manager']:
            # Admin/Manager rejected directly - use their own info
            admin_info = f"{current_user.name} ({current_user.username})"
        else:
            # Fallback
            admin_info = "Unknown (Unknown)"
        
        # Append verified admin info to rejection reason
        refund_request.rejection_reason = f"{rejection_reason}\n[Rejected by: {cashier_info} - Verified with Admin: {admin_info}]"
        
        # Clear verified admin from session after rejection (for security)
        session.pop('verified_admin_id', None)
        session.pop('verified_admin_username', None)
        session.pop('verified_admin_name', None)
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Refund request rejected'
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/assign_waiter', methods=['POST'])
@license_middleware.require_license_for_api
def assign_waiter():
    """Assign a waiter to a table using DatabaseAdapter"""
    data = request.json
    
    from database.database_adapter import DatabaseAdapter
    db_adapter = DatabaseAdapter()
    
    result = db_adapter.assign_waiter(data['table_id'], data['waiter_id'])
    if result['success']:
        return jsonify({'success': True})
    else:
        return jsonify({'success': False, 'error': result['error']}), 500

# Waiter Assignment Management API Endpoints

@app.route('/api/get_waiter_assignments')
@license_middleware.require_license_for_api
def get_waiter_assignments():
    """Get all waiter assignments using DatabaseAdapter"""
    from database.database_adapter import DatabaseAdapter
    db_adapter = DatabaseAdapter()
    
    result = db_adapter.get_waiter_assignments()
    if result['success']:
        return jsonify({
            'assignments': result['data']
        })
    else:
        return jsonify({
            'assignments': [],
            'error': result['error']
        }), 500

@app.route('/api/get_my_assigned_tables')
@license_middleware.require_license_for_api
def get_my_assigned_tables():
    """Get tables assigned to current waiter using DatabaseAdapter"""
    waiter_id = session.get('user_id')
    
    if not waiter_id:
        print("⚠️ No waiter_id in session for get_my_assigned_tables")
        return jsonify({'tables': []})
    
    try:
        from database.database_adapter import DatabaseAdapter
        db_adapter = DatabaseAdapter()
        
        result = db_adapter.get_my_assigned_tables(waiter_id)
        
        if result.get('success'):
            tables = result.get('data', [])
            # Ensure tables have table_number field for compatibility
            for table in tables:
                if 'table_number' not in table and 'number' in table:
                    table['table_number'] = table['number']
            
            print(f"✅ Found {len(tables)} tables for waiter {waiter_id}")
            return jsonify({
                'tables': tables,
                'debug': f'waiter_id: {waiter_id}, found: {len(tables)} tables'
            })
        else:
            error_msg = result.get('error', 'Unknown error')
            print(f"❌ Error getting assigned tables: {error_msg}")
            return jsonify({
                'tables': [],
                'error': error_msg
            }), 500
    except Exception as e:
        print(f"❌ Exception in get_my_assigned_tables: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'tables': [],
            'error': str(e)
        }), 500

@app.route('/api/get_waiters')
@license_middleware.require_license_for_api
@cache_response(seconds=300)  # Cache for 5 minutes
def get_waiters():
    """Get all waiters using DatabaseAdapter"""
    from database.database_adapter import DatabaseAdapter
    db_adapter = DatabaseAdapter()
    
    result = db_adapter.get_waiters()
    if result['success']:
        return jsonify({
            'waiters': result['data']
        })
    else:
        return jsonify({
            'waiters': [],
            'error': result['error']
        }), 500

@app.route('/api/get_staff')
@license_middleware.require_license_for_api
def get_staff():
    """Get all staff using DatabaseAdapter"""
    from database.database_adapter import DatabaseAdapter
    db_adapter = DatabaseAdapter()
    
    result = db_adapter.get_all_users()
    if result['success']:
        staff = result.get('data', [])
        return jsonify({
            'staff': [{
                'id': s['id'],
                'username': s['username'],
                'name': s.get('name', s['username'].title()),
                'role': s['role'],
                'is_active': s.get('is_active', True),
                'created_at': s.get('created_at', '')
            } for s in staff]
        })
    else:
        return jsonify({
            'staff': [],
            'error': result.get('error', 'Failed to retrieve staff data')
        }), 500

@app.route('/api/save_staff', methods=['POST'])
@license_middleware.require_license_for_api
def save_staff():
    """Save staff member using DatabaseAdapter"""
    data = request.json
    
    from database.database_adapter import DatabaseAdapter
    db_adapter = DatabaseAdapter()
    db = None  # Will be set if in local mode
    
    try:
        # Validate required fields
        if not data.get('username'):
            return jsonify({'success': False, 'message': 'Username is required'}), 400
        if not data.get('name'):
            return jsonify({'success': False, 'message': 'Name is required'}), 400
        if not data.get('role'):
            return jsonify({'success': False, 'message': 'Role is required'}), 400
        
        if db_adapter.is_remote_mode():
            # Check if remote config is actually valid
            remote_config = db_adapter.get_remote_config()
            if not remote_config:
                return jsonify({
                    'success': False,
                    'message': 'System is configured for remote mode but remote configuration is missing. Please check your database settings.',
                    'is_remote_mode': True,
                    'suggestion': 'Go to Settings > Database Configuration to check your remote database settings, or switch back to local mode.'
                }), 400
            
            # Try to create via remote API
            user_data = {
                'username': data.get('username'),
                'name': data.get('name'),
                'role': data.get('role'),
                'email': data.get('email'),
                'phone': data.get('phone'),
                'password': data.get('password'),
                'is_active': data.get('status', 'active') == 'active'
            }
            if 'id' in data and data['id']:
                # Update via remote API
                result = db_adapter.make_remote_api_call(f'/api/users/{data["id"]}', 'PUT', user_data)
            else:
                # Create via remote API
                result = db_adapter.make_remote_api_call('/api/users', 'POST', user_data)
            
            if result.get('success'):
                return jsonify({
                    'success': True,
                    'message': 'Staff member saved successfully',
                    'staff': result.get('user', result.get('data'))
                })
            else:
                error_msg = result.get('error', 'Failed to save staff member')
                # Provide more helpful error message
                if 'not supported' in error_msg.lower() or 'not available' in error_msg.lower():
                    return jsonify({
                        'success': False,
                        'message': f'Staff creation is not supported by the remote database server. Error: {error_msg}',
                        'is_remote_mode': True,
                        'suggestion': 'Please contact your system administrator, or switch to local database mode in Settings > Database Configuration.'
                    }), 400
                else:
                    return jsonify({
                        'success': False,
                        'message': f'Remote database error: {error_msg}',
                        'is_remote_mode': True,
                        'suggestion': 'Please check your remote database connection settings.'
                    }), 400
        else:
            # Use local database
            from database.models import User
            from werkzeug.security import generate_password_hash
            from database.models import db as db_instance
            db = db_instance
            
            if 'id' in data and data['id']:
                # Update existing user
                user = User.query.get(data['id'])
                if not user:
                    return jsonify({'success': False, 'message': 'User not found'}), 404
                
                # Check if username is being changed and if it's already taken
                if user.username != data.get('username'):
                    existing_user = User.query.filter_by(username=data.get('username')).first()
                    if existing_user:
                        return jsonify({'success': False, 'message': 'Username already exists'}), 400
                
                user.username = data.get('username')
                user.name = data.get('name')
                user.role = data.get('role')
                user.email = data.get('email') or None
                user.phone = data.get('phone') or None
                user.is_active = data.get('status', 'active') == 'active'
                
                # Update password if provided
                if data.get('password'):
                    user.set_password(data.get('password'))
                
                db.session.commit()
                
                return jsonify({
                    'success': True,
                    'message': 'Staff member updated successfully',
                    'staff': user.to_dict()
                })
            else:
                # Create new user
                # Check if username already exists
                existing_user = User.query.filter_by(username=data.get('username')).first()
                if existing_user:
                    return jsonify({'success': False, 'message': 'Username already exists'}), 400
                
                if not data.get('password'):
                    return jsonify({'success': False, 'message': 'Password is required for new staff members'}), 400
                
                user = User(
                    username=data.get('username'),
                    name=data.get('name'),
                    role=data.get('role'),
                    email=data.get('email') or None,
                    phone=data.get('phone') or None,
                    is_active=data.get('status', 'active') == 'active'
                )
                user.set_password(data.get('password'))
                
                db.session.add(user)
                db.session.commit()
                
                return jsonify({
                    'success': True,
                    'message': 'Staff member created successfully',
                    'staff': user.to_dict()
                })
    
    except Exception as e:
        # Rollback only if we're in local mode and db is available
        if db is not None:
            try:
                db.session.rollback()
            except:
                pass
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/delete_staff', methods=['POST'])
@license_middleware.require_license_for_api
def delete_staff():
    """Delete staff member - not supported in remote database mode"""
    return jsonify({
        'success': False, 
        'message': 'Staff deletion not supported in remote database mode. Please contact administrator.'
    }), 400

@app.route('/api/remove_waiter_assignment', methods=['POST'])
@license_middleware.require_license_for_api
def remove_waiter_assignment():
    """Remove waiter assignment using DatabaseAdapter"""
    data = request.get_json()
    table_id = data.get('table_id')
    
    from database.database_adapter import DatabaseAdapter
    db_adapter = DatabaseAdapter()
    
    result = db_adapter.remove_waiter_assignment(table_id)
    if result['success']:
        return jsonify({'success': True})
    else:
        return jsonify({'success': False, 'message': result['error']}), 500

# System Settings API Endpoints

@app.route('/api/get_settings')
@license_middleware.require_license_for_api
def get_settings():
    """Get system settings using DatabaseAdapter"""
    from database.database_adapter import DatabaseAdapter
    db_adapter = DatabaseAdapter()
    
    # System settings are always stored locally, even in remote mode
    # This prevents circular dependency issues with database configuration
    try:
        from database.models import SystemSettings
        settings = SystemSettings.query.all()
        return jsonify({
            'settings': [{
                'key': s.setting_key,
                'value': s.setting_value,
                'description': s.description
            } for s in settings]
        })
    except Exception as e:
        return jsonify({
            'settings': [],
            'error': str(e)
        }), 500

@app.route('/api/update_setting', methods=['POST'])
@license_middleware.require_license_for_api
def update_setting():
    """Update system setting - always uses local database"""
    data = request.get_json()
    setting_key = data.get('key')
    setting_value = data.get('value')
    
    try:
        from database.models import SystemSettings
        setting = SystemSettings.query.filter_by(setting_key=setting_key).first()
        if setting:
            setting.setting_value = setting_value
            setting.updated_at = datetime.utcnow()
        else:
            setting = SystemSettings(
                setting_key=setting_key,
                setting_value=setting_value,
                description=data.get('description', '')
            )
            db.session.add(setting)
        
        db.session.commit()
        return jsonify({'success': True})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)})

# Dev Mode Hot Reload API Endpoints
@app.route('/api/dev/hot_reload_status')
def hot_reload_status():
    """Get hot reload status - dev only"""
    if not DEV_MODE:
        return jsonify({'success': False, 'message': 'Dev mode not enabled'}), 403
    
    return jsonify({
        'success': True,
        'dev_mode': DEV_MODE,
        'hot_reload_enabled': HOT_RELOAD_ENABLED
    })

@app.route('/api/dev/toggle_hot_reload', methods=['POST'])
def toggle_hot_reload():
    """Toggle hot reload - dev only"""
    global HOT_RELOAD_ENABLED
    
    if not DEV_MODE:
        return jsonify({'success': False, 'message': 'Dev mode not enabled'}), 403
    
    if 'user_id' not in session or session.get('role') != 'admin':
        return jsonify({'success': False, 'message': 'Admin access required'}), 403
    
    data = request.get_json() or {}
    enabled = data.get('enabled', not HOT_RELOAD_ENABLED)
    
    HOT_RELOAD_ENABLED = enabled
    
    # Save authoritative to system settings for persistence
    try:
        from database.models import SystemSettings
        setting = SystemSettings.query.filter_by(setting_key='hot_reload_enabled').first()
        if setting:
            setting.setting_value = str(enabled).lower()
            setting.updated_at = datetime.utcnow()
        else:
            setting = SystemSettings(
                setting_key='hot_reload_enabled',
                setting_value=str(enabled).lower(),
                description='Hot reload enabled status (dev mode only)'
            )
            db.session.add(setting)
        db.session.commit()
    except Exception as e:
        print(f"Error saving hot reload setting: {e}")
    
    return jsonify({
        'success': True,
        'hot_reload_enabled': HOT_RELOAD_ENABLED,
        'message': f'Hot reload {"enabled" if HOT_RELOAD_ENABLED else "disabled"}'
    })

@app.route('/api/dev/trigger_reload', methods=['POST'])
def trigger_reload():
    """Manually trigger a reload - dev only"""
    if not DEV_MODE:
        return jsonify({'success': False, 'message': 'Dev mode not enabled'}), 403
    
    if 'user_id' not in session or session.get('role') != 'admin':
        return jsonify({'success': False, 'message': 'Admin access required'}), 403
    
    # Trigger reload by modifying the reload_trigger module
    if HOT_RELOAD_ENABLED and reload_trigger is not None:
        try:
            # Update the reload_trigger.py file to trigger Flask's reloader
            trigger_file = os.path.join(os.path.dirname(__file__), 'reload_trigger.py')
            new_timestamp = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
            
            # Read current file content
            with open(trigger_file, 'r') as f:
                content = f.read()
            
            # Update the timestamp
            import re
            updated_content = re.sub(
                r'RELOAD_TIMESTAMP = "[^"]*"',
                f'RELOAD_TIMESTAMP = "{new_timestamp}"',
                content
            )
            
            # Write back to file (this will trigger Flask's reloader if use_reloader=True)
            with open(trigger_file, 'w') as f:
                f.write(updated_content)
            
            return jsonify({
                'success': True,
                'message': 'Reload trigger sent. Server will reload automatically if hot reload is enabled.'
            })
        except Exception as e:
            return jsonify({
                'success': False,
                'message': f'Error triggering reload: {str(e)}'
            }), 500
    else:
        message = 'Hot reload is disabled. Enable it first in settings.'
        if reload_trigger is None:
            message += ' (Reload trigger module not found)'
        return jsonify({
            'success': False,
            'message': message
        }), 400

# Table Claiming API Endpoints

@app.route('/api/get_unassigned_tables_with_orders')
@license_middleware.require_license_for_api
def get_unassigned_tables_with_orders():
    """Get unassigned tables with orders using DatabaseAdapter"""
    waiter_id = session.get('user_id')
    
    if not waiter_id:
        print("❌ No waiter_id in session for unassigned tables")
        return jsonify({'tables': []})
    
    from database.database_adapter import DatabaseAdapter
    db_adapter = DatabaseAdapter()
    
    try:
        # Get all tables
        tables_result = db_adapter.get_all_tables()
        if not tables_result.get('success'):
            return jsonify({'tables': [], 'error': tables_result.get('error')})
        
        # Get all orders
        orders_result = db_adapter.get_all_orders()
        if not orders_result.get('success'):
            return jsonify({'tables': [], 'error': orders_result.get('error')})
        
        # Get waiter assignments
        assignments_result = db_adapter.get_waiter_assignments()
        if not assignments_result.get('success'):
            return jsonify({'tables': [], 'error': assignments_result.get('error')})
        
        tables = tables_result.get('tables', [])
        orders = orders_result.get('orders', [])
        assignments = assignments_result.get('data', [])
        
        # Create lookup for active assignments
        active_assignments = {a['table_id']: a for a in assignments if a.get('is_active', True)}
        
        # Filter orders by active status
        active_orders = [o for o in orders if o.get('status') in ['pending', 'confirmed', 'preparing', 'ready']]
        
        # Get tables with active orders
        tables_with_orders = {}
        for order in active_orders:
            # Get table_id - may need to look up by table_number if table_id not present
            table_id = order.get('table_id')
            if not table_id and order.get('table_number'):
                # Fallback: find table by table_number
                matching_table = next((t for t in tables if t.get('number') == order.get('table_number')), None)
                if matching_table:
                    table_id = matching_table.get('id')
                    order['table_id'] = table_id  # Add table_id for consistency
            if table_id:
                if table_id not in tables_with_orders:
                    tables_with_orders[table_id] = []
                tables_with_orders[table_id].append(order)
        
        result = []
        for table in tables:
            table_id = table.get('id')
            if table_id in tables_with_orders and table_id not in active_assignments:
                # Table has orders but no active assignment
                table_orders = tables_with_orders[table_id]
                table_number = table.get('number')
                table_data = {
                    'id': table_id,
                    'number': table_number,
                    'table_number': table_number,  # Add for compatibility
                    'capacity': table.get('capacity'),
                    'location': table.get('location'),
                    'is_occupied': table.get('is_occupied', False),
                    'order_count': len(table_orders),
                    'total_amount': sum(float(o.get('total_amount', 0)) for o in table_orders),
                    'customer_names': [o.get('customer_name') for o in table_orders if o.get('customer_name')]
                }
                result.append(table_data)
        
        return jsonify({
            'tables': result,
            'debug': {
                'total_tables': len(tables),
                'total_orders': len(orders),
                'active_orders': len(active_orders),
                'total_assignments': len(active_assignments),
                'waiter_id': waiter_id
            }
        })
        
    except Exception as e:
        return jsonify({'tables': [], 'error': str(e)})

@app.route('/api/debug_table_claiming')
@license_middleware.require_license_for_api
def debug_table_claiming():
    """Comprehensive debug endpoint for table claiming system"""
    waiter_id = session.get('user_id')
    
    from database.database_adapter import DatabaseAdapter
    db_adapter = DatabaseAdapter()
    
    try:
        # Get all data
        tables_result = db_adapter.get_all_tables()
        orders_result = db_adapter.get_all_orders()
        assignments_result = db_adapter.get_waiter_assignments()
        
        # Get settings - use the same method as /api/get_settings
        settings_dict = {}
        try:
            from database.models import SystemSettings
            with app.app_context():
                settings = SystemSettings.query.all()
                for setting in settings:
                    settings_dict[setting.setting_key] = setting.setting_value
        except Exception as e:
            print(f"Warning: Could not load settings: {e}")
            # Fallback: try database adapter method if it exists
            try:
                settings_result = db_adapter.get_system_settings('allow_table_claiming')
                if settings_result.get('success') and settings_result.get('data'):
                    settings_dict['allow_table_claiming'] = settings_result.get('data', {}).get('value')
            except:
                pass
        
        tables = tables_result.get('tables', []) if tables_result.get('success') else []
        orders = orders_result.get('orders', []) if orders_result.get('success') else []
        assignments = assignments_result.get('data', []) if assignments_result.get('success') else []
        
        # Active assignments lookup
        active_assignments = {a['table_id']: a for a in assignments if a.get('is_active', True)}
        
        # Active orders
        active_orders = [o for o in orders if o.get('status') in ['pending', 'confirmed', 'preparing', 'ready']]
        
        # Build table details
        table_details = []
        tables_with_orders = {}
        
        # Group orders by table
        for order in active_orders:
            table_id = order.get('table_id')
            if not table_id and order.get('table_number'):
                matching_table = next((t for t in tables if t.get('number') == order.get('table_number')), None)
                if matching_table:
                    table_id = matching_table.get('id')
            
            if table_id:
                if table_id not in tables_with_orders:
                    tables_with_orders[table_id] = []
                tables_with_orders[table_id].append(order)
        
        # Process each table
        for table in tables:
            table_id = table.get('id')
            table_orders = tables_with_orders.get(table_id, [])
            assignment = active_assignments.get(table_id)
            
            table_details.append({
                'id': table_id,
                'number': table.get('number'),
                'location': table.get('location'),
                'capacity': table.get('capacity'),
                'has_orders': len(table_orders) > 0,
                'order_count': len(table_orders),
                'active_order_statuses': [o.get('status') for o in table_orders],
                'is_assigned': assignment is not None,
                'assigned_to_waiter_id': assignment.get('waiter_id') if assignment else None,
                'can_be_claimed': len(table_orders) > 0 and assignment is None,
                'total_amount': sum(float(o.get('total_amount', 0)) for o in table_orders)
            })
        
        # Count available tables
        available_count = len([t for t in table_details if t['can_be_claimed']])
        
        return jsonify({
            'success': True,
            'settings': {
                'allow_table_claiming': settings_dict.get('allow_table_claiming', 'false'),
                'enabled': settings_dict.get('allow_table_claiming') == 'true'
            },
            'summary': {
                'total_tables': len(tables),
                'total_orders': len(orders),
                'active_orders': len(active_orders),
                'total_assignments': len(active_assignments),
                'available_to_claim': available_count,
                'waiter_id': waiter_id
            },
            'tables': table_details,
            'assignments': [{
                'table_id': a.get('table_id'),
                'waiter_id': a.get('waiter_id'),
                'is_active': a.get('is_active', True)
            } for a in active_assignments.values()]
        })
    except Exception as e:
        import traceback
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        })

@app.route('/api/debug_assignments')
@license_middleware.require_license_for_api
def debug_assignments():
    """Debug endpoint to see all assignments using DatabaseAdapter"""
    from database.database_adapter import DatabaseAdapter
    db_adapter = DatabaseAdapter()
    
    result = db_adapter.get_waiter_assignments()
    if result.get('success'):
        assignments = result.get('data', [])
        return jsonify({
            'all_assignments': [{
                'id': a.get('id'),
                'table_id': a.get('table_id'),
                'waiter_id': a.get('waiter_id'),
                'is_active': a.get('is_active'),
                'assigned_at': a.get('assigned_at')
            } for a in assignments]
        })
    else:
        return jsonify({
            'all_assignments': [],
            'error': result.get('error')
        })

@app.route('/api/debug_orders')
@license_middleware.require_license_for_api
def debug_orders():
    """Debug endpoint to see all orders using DatabaseAdapter"""
    from database.database_adapter import DatabaseAdapter
    db_adapter = DatabaseAdapter()
    
    result = db_adapter.get_all_orders()
    if result.get('success'):
        orders = result.get('orders', [])
        return jsonify({
            'all_orders': [{
                'id': o.get('id'),
                'table_id': o.get('table_id'),
                'customer_name': o.get('customer_name'),
                'status': o.get('status'),
                'total_amount': float(o.get('total_amount', 0)),
                'created_at': o.get('created_at')
            } for o in orders]
        })
    else:
        return jsonify({
            'all_orders': [],
            'error': result.get('error')
        })

@app.route('/api/debug_database')
@license_middleware.require_license_for_api
def debug_database():
    """Debug endpoint to check database state using DatabaseAdapter"""
    from database.database_adapter import DatabaseAdapter
    db_adapter = DatabaseAdapter()
    
    try:
        # Get all data using DatabaseAdapter
        tables_result = db_adapter.get_all_tables()
        orders_result = db_adapter.get_all_orders()
        users_result = db_adapter.get_all_users()
        assignments_result = db_adapter.get_waiter_assignments()
        
        tables = tables_result.get('tables', []) if tables_result.get('success') else []
        orders = orders_result.get('orders', []) if orders_result.get('success') else []
        users = users_result.get('users', []) if users_result.get('success') else []
        assignments = assignments_result.get('data', []) if assignments_result.get('success') else []
        
        # Count active orders
        active_orders = len([o for o in orders if o.get('status') in ['pending', 'confirmed', 'ready']])
        active_assignments = len([a for a in assignments if a.get('is_active', True)])
        
        # Get sample data
        sample_tables = tables[:3]
        sample_orders = orders[:3]
        
        return jsonify({
            'success': True,
            'counts': {
                'tables': len(tables),
                'orders': len(orders),
                'active_orders': active_orders,
                'assignments': active_assignments,
                'users': len(users)
            },
            'sample_tables': [{'id': t.get('id'), 'number': t.get('number'), 'capacity': t.get('capacity')} for t in sample_tables],
            'sample_orders': [{'id': o.get('id'), 'table_id': o.get('table_id'), 'status': o.get('status'), 'customer_name': o.get('customer_name')} for o in sample_orders]
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

# Database Configuration API Endpoints
@app.route('/api/get_database_config')
@license_middleware.require_license_for_api
def get_database_config():
    """Get current database configuration"""
    try:
        config = DatabaseConfig.query.filter_by(is_active=True).first()
        if config:
            return jsonify({
                'success': True,
                'config': {
                    'id': config.id,
                    'config_name': config.config_name,
                    'db_type': config.db_type,
                    'host': config.host,
                    'port': config.port,
                    'username': config.username,
                    'database_name': config.database_name,
                    'is_active': config.is_active
                }
            })
        else:
            return jsonify({
                'success': True,
                'config': {
                    'db_type': 'local',
                    'is_active': True
                }
            })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/api/save_database_config', methods=['POST'])
@license_middleware.require_license_for_api
def save_database_config():
    """Save database configuration"""
    try:
        data = request.get_json()
        
        # Deactivate all existing configurations
        DatabaseConfig.query.update({'is_active': False})
        
        if data['db_type'] == 'local':
            # For local database, just mark as active
            config = DatabaseConfig(
                config_name=data.get('config_name', 'Local SQLite'),
                db_type='local',
                is_active=True
            )
        else:
            # For remote database, save connection details
            config = DatabaseConfig(
                config_name=data.get('config_name', 'Remote Database'),
                db_type='remote',
                host=data.get('host'),
                port=data.get('port', 3306),
                username=data.get('username'),
                password=data.get('password'),  # In production, encrypt this
                database_name=data.get('database_name'),
                is_active=True
            )
        
        db.session.add(config)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Database configuration saved successfully'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/api/test_database_connection', methods=['POST'])
@license_middleware.require_license_for_api
def test_database_connection():
    """Test database connection"""
    try:
        data = request.get_json()
        db_type = data.get('db_type', 'local')
        
        if db_type == 'local':
            # Test local SQLite connection
            try:
                # Simple query to test connection
                User.query.first()
                return jsonify({
                    'success': True,
                    'message': 'Local database connection successful'
                })
            except Exception as e:
                return jsonify({
                    'success': False,
                    'error': f'Local database connection failed: {str(e)}'
                })
        else:
            # For remote database, we would test the connection here
            # This is a placeholder - in production, implement actual connection testing
            return jsonify({
                'success': True,
                'message': 'Remote database connection test (placeholder)'
            })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

# Company Registration API Endpoints
@app.route('/api/register_company', methods=['POST'])
@license_middleware.require_license_for_api
def register_company():
    """Register a new company"""
    try:
        data = request.get_json()
        
        # Generate serial number if not provided
        if not data.get('serial_number'):
            import uuid
            data['serial_number'] = f"REST-{uuid.uuid4().hex[:8].upper()}"
        
        # Check if company already exists
        existing_company = CompanyRegistration.query.filter_by(
            email=data['email']
        ).first()
        
        if existing_company:
            return jsonify({
                'success': False,
                'error': 'Company with this email already exists'
            })
        
        # Create new company registration
        company = CompanyRegistration(
            company_name=data['company_name'],
            contact_person=data['contact_person'],
            email=data['email'],
            phone=data.get('phone'),
            address=data.get('address'),
            business_type=data.get('business_type', 'restaurant'),
            serial_number=data['serial_number']
        )
        
        db.session.add(company)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'serial_number': company.serial_number,
            'message': 'Company registration successful'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/api/company_registration', methods=['GET'])
@license_middleware.require_license_for_api
def get_company_registrations():
    """Get all company registrations"""
    try:
        companies = CompanyRegistration.query.all()
        return jsonify({
            'success': True,
            'data': [{
                'id': company.id,
                'company_name': company.company_name,
                'contact_person': company.contact_person,
                'email': company.email,
                'phone': company.phone,
                'address': company.address,
                'business_type': company.business_type,
                'serial_number': company.serial_number,
                'msp_client_id': company.msp_client_id,
                'registration_date': company.registration_date.isoformat() if company.registration_date else None,
                'registration_success_shown': company.registration_success_shown
            } for company in companies]
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/api/activate_license', methods=['POST'])
@license_middleware.require_license_for_api
def activate_license():
    """Activate a license using serial number"""
    try:
        data = request.get_json()
        serial_number = data.get('serial_number')
        server_url = data.get('server_url', '')
        
        if not serial_number:
            return jsonify({
                'success': False,
                'error': 'Serial number is required'
            })
        
        # Check if license already exists
        existing_license = LicenseActivation.query.filter_by(serial_number=serial_number).first()
        
        if existing_license:
            # Update existing license
            existing_license.is_active = True
            existing_license.last_online_check = datetime.utcnow()
            if server_url:
                existing_license.validation_server_url = server_url
            db.session.commit()
            
            return jsonify({
                'success': True,
                'message': 'License activated successfully',
                'license': {
                    'serial_number': existing_license.serial_number,
                    'license_type': existing_license.license_type,
                    'expiration_date': existing_license.expiration_date.isoformat(),
                    'max_users': existing_license.max_users
                }
            })
        else:
            # Create new license entry (for demo purposes)
            # In a real system, this would validate against your license server
            new_license = LicenseActivation(
                serial_number=serial_number,
                company_id=1,  # Default company ID
                license_type='premium',
                activation_date=datetime.utcnow(),
                expiration_date=datetime.utcnow() + timedelta(days=365),
                is_active=True,
                max_users=25,
                features='{"inventory_management": true, "advanced_reporting": true, "api_access": true}',
                validation_server_url=server_url
            )
            
            db.session.add(new_license)
            db.session.commit()
            
            return jsonify({
                'success': True,
                'message': 'License activated successfully',
                'license': {
                    'serial_number': new_license.serial_number,
                    'license_type': new_license.license_type,
                    'expiration_date': new_license.expiration_date.isoformat(),
                    'max_users': new_license.max_users
                }
            })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/api/get_license_status')
@license_middleware.require_license_for_api
def get_license_status():
    """Get current license status from external MSP API"""
    try:
        user_id = session.get('user_id')
        if not user_id:
            return jsonify({
                'success': False,
                'error': 'User not authenticated'
            })
        
        # Use the external license validation system that includes company information
        license_result = license_registration.validate_restaurant_access(user_id)
        
        if not license_result.get('valid'):
            return jsonify({
                'success': False,
                'error': license_result.get('error', 'License validation failed')
            })
        
        # Get license details from external API result only
        company_name = license_result.get('company_name', 'Unknown')
        contact_person = license_result.get('contact_person', 'Unknown')
        registration_date = license_result.get('registration_date')
        
        # Check if license is expired based on external API data
        is_expired = False
        expiration_date = license_result.get('expiration_date')
        if expiration_date:
            try:
                from datetime import datetime
                # Parse the external API date format
                if isinstance(expiration_date, str):
                    # Handle different date formats from external API
                    try:
                        exp_date = datetime.strptime(expiration_date, '%a, %d %b %Y %H:%M:%S %Z')
                    except:
                        exp_date = datetime.fromisoformat(expiration_date.replace('Z', '+00:00'))
                else:
                    exp_date = expiration_date
                
                is_expired = exp_date < datetime.utcnow()
            except Exception as e:
                print(f"Warning: Could not parse expiration date: {e}")
                is_expired = False
        
        return jsonify({
            'success': True,
            'license': {
                'serial_number': license_result.get('serial_number', 'Unknown'),
                'license_type': license_result.get('license_type', 'Unknown'),
                'activation_date': license_result.get('activation_date'),
                'expiration_date': license_result.get('expiration_date'),
                'is_active': license_result.get('valid', False),
                'is_expired': is_expired,
                'max_users': license_result.get('max_users', 0),
                'features': license_result.get('features', {}),
                'company_name': company_name,
                'contact_person': contact_person,
                'registration_date': registration_date
            }
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

# =============================
# Backup/Restore API Endpoints
# =============================

def _is_excluded_path(path: str) -> bool:
    """Return True if path should be excluded from full system backups."""
    exclude_dirs = {'__pycache__', '.git', 'venv', 'env', 'node_modules', '.mypy_cache', '.pytest_cache', '.cache'}
    exclude_files_suffixes = {'.pyc', '.pyo', '.log'}
    exclude_names = set()

    parts = set(os.path.normpath(path).split(os.sep))
    if parts & exclude_dirs:
        return True
    base = os.path.basename(path)
    if base in exclude_names:
        return True
    if any(base.endswith(suf) for suf in exclude_files_suffixes):
        return True
    return False

def _safe_add_to_zip(zipf: zipfile.ZipFile, root_dir: str, rel_path: str):
    """Add a file to the zip if not excluded."""
    abs_path = os.path.join(root_dir, rel_path)
    if _is_excluded_path(rel_path):
        return
    if os.path.isfile(abs_path):
        zipf.write(abs_path, rel_path)

@app.route('/api/backup_database', methods=['GET', 'POST'])
@license_middleware.require_license_for_api
def backup_database_only():
    """Create a timestamped copy of the SQLite database."""
    try:
        working_dir = os.path.dirname(__file__)
        db_path = os.path.join(working_dir, 'restaurant.db')

        if not os.path.exists(db_path):
            return jsonify({'success': False, 'error': 'Database file not found'}), 404

        from datetime import timezone
        timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        backup_name = f"restaurant_db_backup_{timestamp}.sqlite"
        
        # Save to backups directory
        backups_dir = os.path.join(working_dir, 'backups')
        os.makedirs(backups_dir, exist_ok=True)
        backups_path = os.path.join(backups_dir, backup_name)
        
        # Copy database to backups directory
        shutil.copy2(db_path, backups_path)
        backup_size = os.path.getsize(backups_path)
        
        # Check if download is requested (for backward compatibility)
        download = request.args.get('download', 'false').lower() == 'true'
        if download:
            # Return file for download
            return send_file(backups_path, as_attachment=True, download_name=backup_name)
        
        # Return JSON response
        return jsonify({
            'success': True,
            'message': 'Database backup created successfully',
            'backup_name': backup_name,
            'backup_path': backups_path,
            'backup_size': backup_size,
            'backup_size_mb': round(backup_size / (1024 * 1024), 2)
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/backup_full_system', methods=['GET', 'POST'])
@license_middleware.require_license_for_api
def backup_full_system():
    """Create a full system backup (code + database + configs) as a zip."""
    try:
        working_dir = os.path.dirname(__file__)

        from datetime import timezone
        timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        zip_name = f"restaurant_full_backup_{timestamp}.zip"
        
        # Save to backups directory
        backups_dir = os.path.join(working_dir, 'backups')
        os.makedirs(backups_dir, exist_ok=True)
        backups_path = os.path.join(backups_dir, zip_name)

        with zipfile.ZipFile(backups_path, 'w', compression=zipfile.ZIP_DEFLATED) as zipf:
            # Add manifest
            manifest = {
                'created_at': datetime.now(timezone.utc).isoformat(),
                'app': 'Restaurant Management System',
                'version': 'unknown',
                'includes': ['working directory (filtered)'],
            }
            manifest_bytes = json.dumps(manifest, indent=2).encode('utf-8')
            zipf.writestr('BACKUP_MANIFEST.json', manifest_bytes)

            # Walk working directory and include files with exclusions
            for root, dirs, files in os.walk(working_dir):
                # Filter excluded directories in-place to prevent descending
                dirs[:] = [d for d in dirs if not _is_excluded_path(os.path.join(os.path.relpath(os.path.join(root, d), working_dir)))]

                for file in files:
                    rel_path = os.path.relpath(os.path.join(root, file), working_dir)
                    # Exclude existing backup zips to avoid recursion
                    if file.lower().endswith('.zip') and ('backup' in file.lower()):
                        continue
                    _safe_add_to_zip(zipf, working_dir, rel_path)

        backup_size = os.path.getsize(backups_path)
        
        # Check if download is requested (for backward compatibility)
        download = request.args.get('download', 'false').lower() == 'true'
        if download:
            # Return file for download
            return send_file(backups_path, as_attachment=True, download_name=zip_name)
        
        # Return JSON response
        return jsonify({
            'success': True,
            'message': 'Full system backup created successfully',
            'backup_name': zip_name,
            'backup_path': backups_path,
            'backup_size': backup_size,
            'backup_size_mb': round(backup_size / (1024 * 1024), 2)
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/list_backups', methods=['GET'])
@license_middleware.require_license_for_api
def list_backups():
    """List all available backups with details"""
    try:
        working_dir = os.path.dirname(__file__)
        backups_dir = os.path.join(working_dir, 'backups')
        
        if not os.path.exists(backups_dir):
            return jsonify({
                'success': True,
                'backups': [],
                'message': 'Backups directory does not exist yet'
            })
        
        backups = []
        
        # Scan for database backups (.sqlite, .db files)
        for filename in os.listdir(backups_dir):
            file_path = os.path.join(backups_dir, filename)
            if os.path.isfile(file_path):
                # Check if it's a database backup
                if filename.endswith('.sqlite') or (filename.endswith('.db') and 'backup' in filename.lower()):
                    file_stat = os.stat(file_path)
                    file_size = file_stat.st_size
                    modified_time = datetime.fromtimestamp(file_stat.st_mtime)
                    
                    # Try to extract timestamp from filename
                    timestamp_match = None
                    if '_' in filename:
                        parts = filename.split('_')
                        for i, part in enumerate(parts):
                            if len(part) == 8 and part.isdigit():  # Date part (YYYYMMDD)
                                if i + 1 < len(parts) and len(parts[i + 1]) == 6 and parts[i + 1].isdigit():  # Time part (HHMMSS)
                                    timestamp_match = f"{part}_{parts[i + 1]}"
                                    break
                    
                    backups.append({
                        'filename': filename,
                        'path': file_path,
                        'size': file_size,
                        'size_mb': round(file_size / (1024 * 1024), 2),
                        'size_kb': round(file_size / 1024, 2),
                        'modified': modified_time.isoformat(),
                        'modified_display': modified_time.strftime('%Y-%m-%d %H:%M:%S'),
                        'type': 'database',
                        'timestamp': timestamp_match
                    })
                # Check if it's a full system backup (zip file)
                elif filename.endswith('.zip') and 'backup' in filename.lower():
                    file_stat = os.stat(file_path)
                    file_size = file_stat.st_size
                    modified_time = datetime.fromtimestamp(file_stat.st_mtime)
                    
                    # Try to extract timestamp from filename
                    timestamp_match = None
                    if '_' in filename:
                        parts = filename.split('_')
                        for i, part in enumerate(parts):
                            if len(part) == 8 and part.isdigit():  # Date part (YYYYMMDD)
                                if i + 1 < len(parts) and len(parts[i + 1]) == 6 and parts[i + 1].isdigit():  # Time part (HHMMSS)
                                    timestamp_match = f"{part}_{parts[i + 1]}"
                                    break
                    
                    backups.append({
                        'filename': filename,
                        'path': file_path,
                        'size': file_size,
                        'size_mb': round(file_size / (1024 * 1024), 2),
                        'size_kb': round(file_size / 1024, 2),
                        'modified': modified_time.isoformat(),
                        'modified_display': modified_time.strftime('%Y-%m-%d %H:%M:%S'),
                        'type': 'full_system',
                        'timestamp': timestamp_match
                    })
        
        # Sort by modified time (newest first)
        backups.sort(key=lambda x: x['modified'], reverse=True)
        
        return jsonify({
            'success': True,
            'backups': backups,
            'total_count': len(backups),
            'total_size_mb': round(sum(b['size'] for b in backups) / (1024 * 1024), 2)
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/verify_backup', methods=['POST'])
@license_middleware.require_license_for_api
def verify_backup():
    """Verify a backup file integrity"""
    try:
        data = request.get_json()
        backup_path = data.get('backup_path')
        
        if not backup_path or not os.path.exists(backup_path):
            return jsonify({'success': False, 'error': 'Backup file not found'}), 404
        
        # Import verification functions from backup script
        import sys
        backup_script_path = os.path.join(os.path.dirname(__file__), 'scripts', 'backup_and_verify.py')
        if not os.path.exists(backup_script_path):
            return jsonify({'success': False, 'error': 'Backup verification script not found'}), 500
        
        # Read the backup script and extract verification functions
        from scripts.backup_and_verify import verify_sqlite, verify_full_backup
        
        if backup_path.endswith('.sqlite') or backup_path.endswith('.db'):
            # Database backup verification
            is_valid, message = verify_sqlite(backup_path)
            return jsonify({
                'success': True,
                'is_valid': is_valid,
                'message': message,
                'backup_type': 'database'
            })
        elif backup_path.endswith('.zip'):
            # Full system backup verification
            is_valid, message = verify_full_backup(backup_path)
            return jsonify({
                'success': True,
                'is_valid': is_valid,
                'message': message,
                'backup_type': 'full_system'
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Unknown backup file type'
            }), 400
            
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/download_backup', methods=['GET'])
@license_middleware.require_license_for_api
def download_backup():
    """Download a backup file"""
    try:
        backup_path = request.args.get('path')
        
        if not backup_path:
            return jsonify({'success': False, 'error': 'Backup path not provided'}), 400
        
        # Security check: ensure the path is within the backups directory
        working_dir = os.path.dirname(__file__)
        backups_dir = os.path.join(working_dir, 'backups')
        
        # Normalize paths to prevent directory traversal
        backup_path = os.path.normpath(backup_path)
        backups_dir = os.path.normpath(backups_dir)
        
        if not backup_path.startswith(backups_dir):
            return jsonify({'success': False, 'error': 'Invalid backup path'}), 403
        
        if not os.path.exists(backup_path):
            return jsonify({'success': False, 'error': 'Backup file not found'}), 404
        
        # Get filename from path
        filename = os.path.basename(backup_path)
        
        return send_file(backup_path, as_attachment=True, download_name=filename)
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/check_license_status')
@license_middleware.require_license_for_api
def check_license_status():
    """Check license status (same as get_license_status for compatibility)"""
    return get_license_status()

@app.route('/api/notify_order_ready', methods=['POST'])
@license_middleware.require_license_for_api
def notify_order_ready():
    data = request.get_json()
    order_id = data.get('order_id')
    
    if not order_id:
        return jsonify({'success': False, 'message': 'Order ID is required'})
    
    # Get the order
    order = Order.query.get(order_id)
    if not order:
        return jsonify({'success': False, 'message': 'Order not found'})
    
    # Check if there's an assigned waiter for this table
    assignment = WaiterAssignment.query.filter_by(
        table_id=order.table_id,
        is_active=True
    ).first()
    
    if assignment:
        # Notify specific waiter
        waiter = User.query.get(assignment.waiter_id)
        notification_message = f"Table {order.table.number} - Order #{order.id} is ready for service!"
        notification_target = f"waiter: {waiter.name}"
    else:
        # Notify all staff (no specific waiter assigned)
        notification_message = f"Table {order.table.number} - Order #{order.id} is ready! No waiter assigned - please assign someone."
        notification_target = "all staff"
    
    # Mark order as notified
    order.notification_sent = True
    order.notified_at = datetime.utcnow()
    db.session.commit()
    
    # In a real application, you would send push notifications, emails, or websocket messages
    # For now, we'll return the notification details
    return jsonify({
        'success': True,
        'message': 'Notification sent successfully',
        'notification': {
            'order_id': order.id,
            'table_number': order.table.number,
            'message': notification_message,
            'target': notification_target,
            'has_assigned_waiter': assignment is not None
        }
    })

@app.route('/api/claim_table', methods=['POST'])
@license_middleware.require_license_for_api
def claim_table():
    """Claim a table using DatabaseAdapter"""
    data = request.get_json()
    table_id = data.get('table_id')
    waiter_id = session.get('user_id')  # Get current waiter from session
    
    if not waiter_id:
        return jsonify({'success': False, 'message': 'Not logged in'})
    
    from database.database_adapter import DatabaseAdapter
    db_adapter = DatabaseAdapter()
    
    result = db_adapter.claim_table(table_id, waiter_id)
    if result['success']:
        return jsonify({'success': True})
    else:
        return jsonify({'success': False, 'message': result['error']}), 500

# New Inventory Management API Endpoints

@app.route('/api/get_inventory')
@license_middleware.require_license_for_api
def get_inventory():
    """Get inventory items using DatabaseAdapter"""
    from database.database_adapter import DatabaseAdapter
    db_adapter = DatabaseAdapter()
    
    result = db_adapter.get_all_inventory_items()
    if result.get('success'):
        inventory_data = result.get('data', [])
        return jsonify({'inventory': inventory_data})
    else:
        return jsonify({
            'inventory': [],
            'error': result.get('error', 'Failed to retrieve inventory')
        }), 500

@app.route('/api/save_inventory_item', methods=['POST'])
@license_middleware.require_license_for_api
def save_inventory_item():
    """Save inventory item using DatabaseAdapter"""
    data = request.json
    from database.database_adapter import DatabaseAdapter
    db_adapter = DatabaseAdapter()
    
    try:
        if 'id' in data and data['id']:
            # Update existing item
            result = db_adapter.update_inventory_item(data['id'], data)
            if result.get('success'):
                return jsonify({'success': True, 'item_id': data['id']})
            else:
                return jsonify({'success': False, 'message': result.get('error', 'Update failed')})
        else:
            # Create new item
            result = db_adapter.create_inventory_item(data)
            if result.get('success'):
                return jsonify({'success': True, 'item_id': result.get('data', {}).get('id')})
            else:
                return jsonify({'success': False, 'message': result.get('error', 'Creation failed')})
    
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/delete_inventory_item', methods=['POST'])
@license_middleware.require_license_for_api
def delete_inventory_item():
    """Delete inventory item using DatabaseAdapter"""
    data = request.json
    item_id = data.get('id')
    
    if not item_id:
        return jsonify({'success': False, 'message': 'Item ID is required'})
    
    from database.database_adapter import DatabaseAdapter
    db_adapter = DatabaseAdapter()
    
    result = db_adapter.delete_inventory_item(item_id)
    if result.get('success'):
        return jsonify({'success': True})
    else:
        return jsonify({'success': False, 'message': result.get('error', 'Delete failed')})

@app.route('/api/inventory/receive', methods=['POST'])
@license_middleware.require_license_for_api
def inventory_receive():
    data = request.get_json()
    from database.database_adapter import DatabaseAdapter
    db_adapter = DatabaseAdapter()
    result = db_adapter.receive_inventory(
        item_id=int(data.get('item_id')),
        quantity=float(data.get('quantity', 0)),
        unit_cost=float(data.get('unit_cost', 0)),
        supplier=data.get('supplier'),
        notes=data.get('notes', '')
    )
    if result.get('success'):
        return jsonify({'success': True})
    else:
        return jsonify({'success': False, 'message': result.get('error', 'Receive failed')}), 400

@app.route('/api/inventory/waste', methods=['POST'])
@license_middleware.require_license_for_api
def inventory_waste():
    data = request.get_json()
    from database.database_adapter import DatabaseAdapter
    db_adapter = DatabaseAdapter()
    try:
        if not data or data.get('item_id') is None:
            return jsonify({'success': False, 'message': 'item_id is required'}), 400
        if data.get('quantity') in (None, ''):
            return jsonify({'success': False, 'message': 'quantity is required'}), 400
        quantity = float(data.get('quantity'))
        if quantity <= 0:
            return jsonify({'success': False, 'message': 'quantity must be greater than 0'}), 400
        item_id = int(data.get('item_id'))
        reason = data.get('reason', 'waste')
        notes = data.get('notes', '')
        user_id = session.get('user_id') or data.get('recorded_by')

        result = db_adapter.record_inventory_waste(
            item_id=item_id,
            quantity=quantity,
            reason=reason,
            user_id=user_id,
            notes=notes
        )
    except Exception as e:
        return jsonify({'success': False, 'message': f'Invalid payload: {str(e)}'}), 400
    if result.get('success'):
        return jsonify({'success': True})
    else:
        return jsonify({'success': False, 'message': result.get('error', 'Waste failed')}), 400

@app.route('/api/inventory/count', methods=['POST'])
@license_middleware.require_license_for_api
def inventory_count():
    data = request.get_json()
    from database.database_adapter import DatabaseAdapter
    db_adapter = DatabaseAdapter()
    result = db_adapter.record_inventory_count(
        item_id=int(data.get('item_id')),
        counted_quantity=float(data.get('counted_quantity')),
        user_id=session.get('user_id'),
        notes=data.get('notes', '')
    )
    if result.get('success'):
        return jsonify({'success': True})
    else:
        return jsonify({'success': False, 'message': result.get('error', 'Count failed')}), 400

@app.route('/api/inventory/receivings')
@license_middleware.require_license_for_api
def list_receivings():
    from database.database_adapter import DatabaseAdapter
    db_adapter = DatabaseAdapter()
    result = db_adapter.list_receivings()
    if not result.get('success'):
        # Be graceful: return empty list so UI renders
        return jsonify({'success': True, 'receivings': [], 'warning': result.get('error', 'List failed')}), 200
    receivings = result.get('receivings') or result.get('data') or []
    return jsonify({'success': True, 'receivings': receivings})

@app.route('/api/inventory/wastes')
@license_middleware.require_license_for_api
def list_wastes():
    from database.database_adapter import DatabaseAdapter
    db_adapter = DatabaseAdapter()
    result = db_adapter.list_wastes()
    if not result.get('success'):
        return jsonify({'success': True, 'wastes': [], 'warning': result.get('error', 'List failed')}), 200
    wastes = result.get('wastes') or result.get('data') or []
    return jsonify({'success': True, 'wastes': wastes})

@app.route('/api/inventory/counts')
@license_middleware.require_license_for_api
def list_counts():
    from database.database_adapter import DatabaseAdapter
    db_adapter = DatabaseAdapter()
    result = db_adapter.list_counts()
    if not result.get('success'):
        return jsonify({'success': True, 'counts': [], 'warning': result.get('error', 'List failed')}), 200
    counts = result.get('counts') or result.get('data') or []
    return jsonify({'success': True, 'counts': counts})

@app.route('/api/create_purchase_order', methods=['POST'])
@license_middleware.require_license_for_api
def create_purchase_order():
    data = request.json
    
    try:
        # Create purchase order
        po = PurchaseOrder(
            supplier=data['supplier'],
            expected_delivery=datetime.strptime(data['expected_delivery'], '%Y-%m-%d').date(),
            notes=data.get('notes', ''),
            status='pending',
            total_amount=0
        )
        
        db.session.add(po)
        db.session.flush()  # Get the ID
        
        total_amount = 0
        
        # Add purchase order items
        for item_data in data['items']:
            po_item = PurchaseOrderItem(
                purchase_order_id=po.id,
                item_name=item_data['name'],
                quantity=item_data['quantity'],
                cost=item_data['cost']
            )
            db.session.add(po_item)
            total_amount += item_data['quantity'] * item_data['cost']
        
        # Update total amount
        po.total_amount = total_amount
        db.session.commit()
        
        return jsonify({'success': True, 'purchase_order_id': po.id})
    
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/get_stats')
@license_middleware.require_license_for_api
@cache_response(seconds=300)  # Cache for 5 minutes
def get_stats():
    """Get dashboard statistics using optimized DatabaseAdapter"""
    try:
        # Use optimized database adapter
        db_adapter = get_optimized_db_adapter()
        
        # Get orders data
        orders_result = db_adapter.get_all_orders()
        orders = orders_result.get('orders', []) if orders_result.get('success') else []
        
        # Get tables data
        tables_result = db_adapter.get_all_tables()
        tables = tables_result.get('tables', []) if tables_result.get('success') else []
        
        # Get users data
        users_result = db_adapter.get_all_users()
        users = users_result.get('users', []) if users_result.get('success') else []
        
        # Calculate statistics
        total_orders = len(orders)
        active_tables = len([t for t in tables if t.get('is_occupied', False)])
        staff_count = len([u for u in users if u.get('is_active', True)])
        
        # Calculate today's revenue
        today = date.today()
        today_revenue = 0
        today_orders = 0
        
        for order in orders:
            order_date = None
            if order.get('created_at'):
                try:
                    # Handle different date formats
                    if isinstance(order['created_at'], str):
                        if 'T' in order['created_at']:
                            order_date = datetime.fromisoformat(order['created_at'].replace('Z', '+00:00')).date()
                        else:
                            order_date = datetime.strptime(order['created_at'], '%Y-%m-%d').date()
                    else:
                        order_date = order['created_at'].date()
                except:
                    continue
            
            if order_date == today:
                today_orders += 1
                today_revenue += float(order.get('total_amount', 0))

        # Also include manual payments (cash register) in today's revenue
        try:
            manual_payments = Payment.query.filter(
                Payment.is_manual == True,
                Payment.status == 'completed',
                db.func.date(Payment.created_at) == today
            ).all()
            for mp in manual_payments:
                today_revenue += float(mp.amount or 0)
                today_orders += 1
        except Exception:
            pass
        
        return jsonify({
            'success': True,
            'total_orders': total_orders,
            'active_tables': active_tables,
            'staff_count': staff_count,
            'today_revenue': today_revenue,
            'today_orders': today_orders,
            'total_tables': len(tables)
        })
        
    except Exception as e:
        print(f"Error getting stats: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'total_orders': 0,
            'active_tables': 0,
            'staff_count': 0,
            'today_revenue': 0,
            'today_orders': 0,
            'total_tables': 0
        })

@app.route('/api/get_recent_orders')
@license_middleware.require_license_for_api
@cache_response(seconds=30)  # Cache for 30 seconds
def get_recent_orders():
    """Get recent orders for dashboard using optimized DatabaseAdapter"""
    try:
        # Use optimized database adapter
        db_adapter = get_optimized_db_adapter()
        
        # Get orders data
        orders_result = db_adapter.get_all_orders()
        orders = orders_result.get('orders', []) if orders_result.get('success') else []
        
        # Get tables data for table numbers
        tables_result = db_adapter.get_all_tables()
        tables = tables_result.get('tables', []) if tables_result.get('success') else []
        
        # Create table lookup
        table_lookup = {t['id']: t['number'] for t in tables}
        
        # Sort orders by creation date (most recent first) and limit to 10
        recent_orders = []
        for order in sorted(orders, key=lambda x: x.get('created_at', ''), reverse=True)[:10]:
            order_data = {
                'id': order.get('id'),
                'table_number': table_lookup.get(order.get('table_id'), 'Unknown'),
                'item_count': len(order.get('items', [])),
                'total': float(order.get('total_amount', 0)),
                'status': order.get('status', 'pending'),
                'created_at': order.get('created_at', '')
            }
            recent_orders.append(order_data)
        
        return jsonify({
            'success': True,
            'orders': recent_orders
        })
        
    except Exception as e:
        print(f"Error getting recent orders: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'orders': []
        })

# License Registration Routes

@app.route('/license_registration')
def license_registration_page():
    """Display license registration page"""
    return render_template('license_registration.html')

@app.route('/license_error')
@license_middleware.require_license_for_staff
def license_error_page():
    """Display license error page"""
    return render_template('license_error.html')

@app.route('/api/clear_license_error', methods=['POST'])
def clear_license_error():
    """Clear license error from session"""
    session.pop('license_error', None)
    return jsonify({'success': True})

@app.route('/api/validate_license', methods=['POST'])
def validate_license():
    """Validate license serial number"""
    try:
        data = request.get_json()
        serial_number = data.get('serial_number')
        
        if not serial_number:
            return jsonify({
                'success': False,
                'error': 'Serial number is required'
            })
        
        # Validate license
        result = license_registration.validate_serial_number(serial_number)
        
        if result.get('valid'):
            return jsonify({
                'success': True,
                'license_info': {
                    'type': result.get('license_type'),
                    'max_users': result.get('max_users'),
                    'expiration_date': result.get('expiration_date'),
                    'features': result.get('features', {})
                }
            })
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'License validation failed')
            })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Validation error: {str(e)}'
        })

@app.route('/api/authenticate_msp', methods=['POST'])
def authenticate_msp():
    """Authenticate with MSP system"""
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')
        serial_number = data.get('serial_number')
        
        if not email or not password or not serial_number:
            return jsonify({
                'success': False,
                'error': 'Username, password, and serial number are required'
            })
        
        # Authenticate with MSP system
        print(f"🔐 Starting authentication for username: {email}")
        result = license_registration.authenticate_msp_client(email, password)
        print(f"📊 Authentication result: {result}")
        
        if not result:
            return jsonify({
                'success': False,
                'error': 'Authentication service unavailable'
            })
        
        if result.get('success'):
            # Client authenticated successfully - now validate the license directly
            client_data = result.get('client_data')
            if not client_data:
                return jsonify({
                    'success': False,
                    'error': 'Client data not found in authentication response'
                })
            
            print(f"🔍 Validating license: {serial_number}")
            license_result = license_registration.validate_serial_number(serial_number)
            
            if license_result.get('valid'):
                print(f"✅ License validation successful")
                return jsonify({
                    'success': True,
                    'client_data': client_data,
                    'token': result.get('token'),
                    'license_info': license_result
                })
            else:
                print(f"❌ License validation failed: {license_result.get('error')}")
                return jsonify({
                    'success': False,
                    'error': f"License validation failed: {license_result.get('error', 'Unknown error')}"
                })
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'MSP authentication failed')
            })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Authentication error: {str(e)}'
        })

@app.route('/restart')
def restart_page():
    """Show restart instructions page"""
    return render_template('restart_instructions.html')

@app.route('/api/restart', methods=['POST'])
def restart_system():
    """API endpoint to restart the system"""
    try:
        # In a production environment, you would implement actual restart logic here
        # For now, we'll just return a success message
        return jsonify({
            'success': True,
            'message': 'System restart initiated. Please close and restart the Restaurant Management System manually.',
            'instructions': [
                '1. Close the current Restaurant Management System window',
                '2. Stop the server (Ctrl+C in the terminal)',
                '3. Restart the server using: python app.py',
                '4. Open the Restaurant Management System in your browser'
            ]
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Restart error: {str(e)}'
        })

@app.route('/api/register_restaurant', methods=['POST'])
def register_restaurant():
    """Complete restaurant registration"""
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['serial_number', 'email', 'password', 'restaurant_name', 
                          'contact_person', 'admin_username', 'admin_name', 'admin_password']
        
        for field in required_fields:
            if not data.get(field):
                return jsonify({
                    'success': False,
                    'error': f'{field.replace("_", " ").title()} is required'
                })
        
        # Complete registration
        result = license_registration.register_restaurant_with_license(data)
        
        if result.get('success'):
            response_data = {
                'success': True,
                'message': result.get('message'),
                'restaurant_name': data.get('restaurant_name'),
                'admin_username': result.get('admin_username'),
                'license_info': result.get('license_info')
            }
            
            # Add restart fields if present
            if result.get('requires_restart'):
                response_data['requires_restart'] = result.get('requires_restart')
            if result.get('restart_message'):
                response_data['restart_message'] = result.get('restart_message')
            
            return jsonify(response_data)
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Registration failed')
            })
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Registration error: {str(e)}'
        })

@app.route('/api/check_restaurant_license')
@license_middleware.require_license_for_api
def check_restaurant_license():
    """Check restaurant license status for current user"""
    try:
        user_id = session.get('user_id')
        if not user_id:
            return jsonify({
                'valid': False,
                'error': 'Not logged in'
            })
        
        result = license_registration.validate_restaurant_access(user_id)
        return jsonify(result)
        
    except Exception as e:
        return jsonify({
            'valid': False,
            'error': f'License check error: {str(e)}'
        })

@app.route('/api/refresh_license_status')
def refresh_license_status():
    """Refresh license status and update session"""
    try:
        user_id = session.get('user_id')
        if not user_id:
            return jsonify({
                'success': False,
                'error': 'Not logged in'
            })
        
        # Clear existing license info first
        session.pop('license_info', None)
        session.pop('license_error', None)
        
        # Validate license
        license_result = license_registration.validate_restaurant_access(user_id)
        
        if license_result.get('valid'):
            # Update session with fresh license info
            from datetime import datetime
            # Calculate detailed time remaining
            def calculate_time_remaining(expiration_date):
                """Calculate detailed time remaining until expiration"""
                # Check for None, empty string, or other falsy values
                if not expiration_date or expiration_date in [None, '', 'None', 'null', 'NULL']:
                    # Return unknown status instead of defaulting to 365 days
                    print(f"⚠️ No expiration date provided to calculate_time_remaining: {expiration_date}")
                    return {'days': None, 'hours': 0, 'minutes': 0, 'total_seconds': 0, 'formatted': 'Unknown', 'is_unknown': True}
                
                try:
                    from datetime import datetime, timezone
                    # Parse the external API date format
                    if isinstance(expiration_date, str):
                        try:
                            exp_date = datetime.strptime(expiration_date, '%a, %d %b %Y %H:%M:%S %Z')
                            if exp_date.tzinfo is None:
                                exp_date = exp_date.replace(tzinfo=timezone.utc)
                        except:
                            try:
                                exp_date = datetime.fromisoformat(expiration_date.replace('Z', '+00:00'))
                            except:
                                try:
                                    exp_date = datetime.strptime(expiration_date, '%Y-%m-%d %H:%M:%S.%f')
                                except:
                                    exp_date = datetime.strptime(expiration_date, '%Y-%m-%d %H:%M:%S')
                                exp_date = exp_date.replace(tzinfo=timezone.utc)
                    else:
                        exp_date = expiration_date
                        if exp_date.tzinfo is None:
                            exp_date = exp_date.replace(tzinfo=timezone.utc)
                    
                    now = datetime.now(timezone.utc)
                    delta = exp_date - now
                    total_seconds = int(delta.total_seconds())
                    
                    # Calculate days, hours, and minutes
                    days = delta.days
                    hours = delta.seconds // 3600
                    minutes = (delta.seconds % 3600) // 60
                    
                    # Format the display string
                    if days > 0:
                        formatted = f'{days} day{"s" if days != 1 else ""}'
                    elif days == 0 and hours > 0:
                        formatted = f'{hours} hour{"s" if hours != 1 else ""}'
                        if minutes > 0:
                            formatted += f' {minutes} minute{"s" if minutes != 1 else ""}'
                    elif days == 0 and hours == 0 and minutes > 0:
                        formatted = f'{minutes} minute{"s" if minutes != 1 else ""}'
                    else:
                        # Expired - calculate how long ago
                        total_seconds = abs(total_seconds)
                        hours_ago = total_seconds // 3600
                        minutes_ago = (total_seconds % 3600) // 60
                        if hours_ago > 0:
                            formatted = f'{hours_ago} hour{"s" if hours_ago != 1 else ""} ago'
                        else:
                            formatted = f'{minutes_ago} minute{"s" if minutes_ago != 1 else ""} ago'
                    
                    return {
                        'days': days,
                        'hours': hours,
                        'minutes': minutes,
                        'total_seconds': total_seconds,
                        'formatted': formatted
                    }
                except Exception as e:
                    print(f"Warning: Could not parse expiration date: {e}")
                    # Return unknown status when parsing fails
                    return {'days': None, 'hours': 0, 'minutes': 0, 'total_seconds': 0, 'formatted': 'Unknown', 'is_unknown': True}
            
            expiration_date = license_result.get('expiration_date')
            print(f"📅 [REFRESH] Got expiration_date from license_result: {expiration_date} (type: {type(expiration_date)})")
            print(f"📋 [REFRESH] Full license_result: {license_result}")
            
            # If expiration_date is still None, calculate it based on license_type
            if not expiration_date or expiration_date in [None, '', 'None', 'null']:
                license_type = license_result.get('license_type', 'Day Pass')
                from datetime import datetime, timezone, timedelta
                now = datetime.now(timezone.utc)
                
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
                
                print(f"⚠️ [REFRESH] expiration_date was None, calculated: {expiration_date} for license_type: {license_type}")
            
            time_info = calculate_time_remaining(expiration_date)
            days_val = time_info.get('days')
            print(f"⏰ [REFRESH] Calculated time_info: {time_info}")
            print(f"📊 [REFRESH] days_val: {days_val}, time_remaining: {time_info.get('formatted', '')}")
            
            session['license_info'] = {
                'status': 'active',
                'type': license_result.get('license_type', 'Day Pass'),
                'max_users': license_result.get('max_users', 10),
                'expiration_date': expiration_date,
                'days_remaining': days_val if days_val is not None else None,
                'time_remaining': time_info.get('formatted', ''),
                'time_info': time_info,
                'offline_mode': license_result.get('offline_mode', False),
                'grace_period': license_result.get('grace_period'),
                'grace_remaining_hours': license_result.get('grace_remaining_hours'),
            }
            print(f"✅ [REFRESH] License info set in session")
            print(f"🔍 [REFRESH] Session license_info contents: expiration_date={session['license_info'].get('expiration_date')}, days_remaining={session['license_info'].get('days_remaining')}, time_remaining={session['license_info'].get('time_remaining')}")
            
            print(f"DEBUG: Set session license_info: {session['license_info']}")
            
            return jsonify({
                'success': True,
                'license_info': session['license_info']
            })
        else:
            # Clear license info when validation fails
            session.pop('license_info', None)
            session['license_error'] = license_result.get('error', 'License validation failed')
            
            return jsonify({
                'success': False,
                'error': license_result.get('error', 'License validation failed')
            })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'License refresh error: {str(e)}'
        })

# Database Server Management API Endpoints

@app.route('/api/get_database_server_config')
@license_middleware.require_license_for_api
def get_database_server_config():
    """Get current database server configuration"""
    try:
        result = db_manager.get_database_configuration()
        return jsonify(result)
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/api/save_database_server_config', methods=['POST'])
@license_middleware.require_license_for_api
def save_database_server_config():
    """Save database server configuration"""
    try:
        data = request.get_json()
        result = db_manager.save_database_configuration(data)
        return jsonify(result)
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/api/test_database_server_connection', methods=['POST'])
@license_middleware.require_license_for_api
def test_database_server_connection():
    """Test database server connection"""
    try:
        data = request.get_json()
        result = db_manager.test_database_connection(data)
        return jsonify(result)
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/api/switch_to_remote_database', methods=['POST'])
def switch_to_remote_database():
    """Switch to remote database configuration"""
    try:
        data = request.get_json()
        print(f"🔍 API received data: {data}")
        print(f"🔍 Force switch in data: {data.get('force_switch', 'NOT FOUND')}")
        result = db_manager.switch_to_remote_database(data)
        print(f"🔍 API returning result: {result}")
        return jsonify(result)
    except Exception as e:
        print(f"🔍 API error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/api/switch_to_local_database', methods=['POST'])
def switch_to_local_database():
    """Switch to local database configuration"""
    try:
        print("🔄 API: Starting switch to local database...")
        result = db_manager.switch_to_local_database()
        print(f"🔄 API: Switch result: {result}")
        return jsonify(result)
    except Exception as e:
        print(f"❌ API: Switch error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        })

@app.route('/api/download_database_server_package')
@license_middleware.require_license_for_api
def download_database_server_package():
    """Download database server executable"""
    try:
        result = db_manager.create_database_server_package()
        if result['success']:
            return send_file(result['package_path'], as_attachment=True, download_name='DatabaseServerGUI.exe')
        else:
            return jsonify(result), 500
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/admin/database')
@license_middleware.require_license
def admin_database():
    """Database management page"""
    if 'user_id' not in session or session['role'] != 'admin':
        return redirect(url_for('login'))
    
    # Check for auto_setup parameter
    auto_setup = request.args.get('auto_setup', '')
    if auto_setup == 'remote':
        print("🔄 Auto-setup: Remote database mode selected")
        return render_template('admin_database.html', auto_setup='remote')
    
    return render_template('admin_database.html')

@app.route('/test-database')
def test_database():
    """Test database page"""
    return app.send_static_file('test_database_page.html')

# ==================== Reports API Endpoints ====================

@app.route('/api/reports/sales')
@license_middleware.require_license_for_api
def reports_sales():
    """Generate sales report including both order-based and manual POS transactions"""
    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        if not start_date or not end_date:
            return jsonify({'success': False, 'error': 'Start date and end date are required'}), 400
        
        start_dt = datetime.strptime(start_date, '%Y-%m-%d').date()
        end_dt = datetime.strptime(end_date, '%Y-%m-%d').date()
        
        # Get all orders in date range
        orders = Order.query.filter(
            db.func.date(Order.created_at) >= start_dt,
            db.func.date(Order.created_at) <= end_dt
        ).all()
        
        # Get all payments (both order-based and manual POS) in date range
        payments = Payment.query.filter(
            db.func.date(Payment.created_at) >= start_dt,
            db.func.date(Payment.created_at) <= end_dt,
            Payment.status == 'completed'
        ).all()
        
        # Calculate totals
        total_revenue = sum(p.amount for p in payments)
        total_orders = len(orders)
        total_tax = sum(o.tax_amount or 0 for o in orders)
        total_tips = sum(o.tip_amount or 0 for o in orders)
        avg_order_value = total_revenue / total_orders if total_orders > 0 else 0
        
        # Group by payment method
        payment_methods = {}
        for payment in payments:
            method = payment.payment_method
            if method not in payment_methods:
                payment_methods[method] = 0
            payment_methods[method] += payment.amount
        
        # Daily sales breakdown
        daily_sales = {}
        for payment in payments:
            day = payment.created_at.date().isoformat()
            if day not in daily_sales:
                daily_sales[day] = {
                    'date': day,
                    'orders': 0,
                    'revenue': 0,
                    'tax': 0,
                    'tips': 0,
                    'net_revenue': 0
                }
            daily_sales[day]['revenue'] += payment.amount
            
            # Find associated order for tax/tips
            if payment.order_id:
                order = Order.query.get(payment.order_id)
                if order:
                    daily_sales[day]['tax'] += order.tax_amount or 0
                    daily_sales[day]['tips'] += order.tip_amount or 0
        
        # Count orders per day
        for order in orders:
            day = order.created_at.date().isoformat()
            if day not in daily_sales:
                daily_sales[day] = {
                    'date': day,
                    'orders': 0,
                    'revenue': 0,
                    'tax': 0,
                    'tips': 0,
                    'net_revenue': 0
                }
            daily_sales[day]['orders'] += 1
            daily_sales[day]['tax'] += order.tax_amount or 0
            daily_sales[day]['tips'] += order.tip_amount or 0
        
        # Calculate net revenue for each day
        for day_data in daily_sales.values():
            day_data['net_revenue'] = day_data['revenue'] - day_data['tax']
        
        return jsonify({
            'success': True,
            'total_revenue': total_revenue,
            'total_orders': total_orders,
            'avg_order_value': avg_order_value,
            'total_tax': total_tax,
            'total_tips': total_tips,
            'payment_methods': payment_methods,
            'daily_sales': sorted(daily_sales.values(), key=lambda x: x['date'])
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/reports/orders')
@license_middleware.require_license_for_api
def reports_orders():
    """Generate order report"""
    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        if not start_date or not end_date:
            return jsonify({'success': False, 'error': 'Start date and end date are required'}), 400
        
        start_dt = datetime.strptime(start_date, '%Y-%m-%d').date()
        end_dt = datetime.strptime(end_date, '%Y-%m-%d').date()
        
        # Get orders in date range
        orders = Order.query.filter(
            db.func.date(Order.created_at) >= start_dt,
            db.func.date(Order.created_at) <= end_dt
        ).all()
        
        total_orders = len(orders)
        completed_orders = len([o for o in orders if o.status == 'served' or o.status == 'completed'])
        cancelled_orders = len([o for o in orders if o.status == 'cancelled'])
        
        # Calculate average order time
        total_time = 0
        count = 0
        for order in orders:
            if order.completed_at and order.created_at:
                delta = order.completed_at - order.created_at
                total_time += delta.total_seconds() / 60  # Convert to minutes
                count += 1
        avg_order_time = int(total_time / count) if count > 0 else 0
        
        # Get order details with waiter info
        orders_data = []
        for order in orders:
            waiter = User.query.get(order.waiter_id) if order.waiter_id else None
            item_count = len(order.items)
            
            orders_data.append({
                'id': order.id,
                'created_at': order.created_at.isoformat(),
                'table_number': order.table_number,
                'waiter_name': waiter.name if waiter else None,
                'item_count': item_count,
                'total_amount': order.total_amount,
                'status': order.status
            })
        
        return jsonify({
            'success': True,
            'total_orders': total_orders,
            'completed_orders': completed_orders,
            'cancelled_orders': cancelled_orders,
            'avg_order_time': avg_order_time,
            'orders': orders_data
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/reports/menu')
@license_middleware.require_license_for_api
def reports_menu():
    """Generate menu item performance report"""
    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        if not start_date or not end_date:
            return jsonify({'success': False, 'error': 'Start date and end date are required'}), 400
        
        start_dt = datetime.strptime(start_date, '%Y-%m-%d').date()
        end_dt = datetime.strptime(end_date, '%Y-%m-%d').date()
        
        # Get orders in date range
        orders = Order.query.filter(
            db.func.date(Order.created_at) >= start_dt,
            db.func.date(Order.created_at) <= end_dt
        ).all()
        
        # Track menu item performance
        item_stats = {}
        
        for order in orders:
            for item in order.items:
                menu_item = MenuItem.query.get(item.menu_item_id)
                if menu_item:
                    item_id = menu_item.id
                    if item_id not in item_stats:
                        item_stats[item_id] = {
                            'name': menu_item.name,
                            'category': menu_item.category.name if menu_item.category else 'Uncategorized',
                            'quantity_sold': 0,
                            'revenue': 0,
                            'total_price': 0
                        }
                    item_stats[item_id]['quantity_sold'] += item.quantity
                    item_stats[item_id]['revenue'] += item.price * item.quantity
                    item_stats[item_id]['total_price'] += item.price * item.quantity
        
        # Format data
        items_data = []
        for item_id, stats in item_stats.items():
            avg_price = stats['total_price'] / stats['quantity_sold'] if stats['quantity_sold'] > 0 else 0
            items_data.append({
                'name': stats['name'],
                'category': stats['category'],
                'quantity_sold': stats['quantity_sold'],
                'revenue': stats['revenue'],
                'avg_price': avg_price
            })
        
        # Sort by revenue descending
        items_data.sort(key=lambda x: x['revenue'], reverse=True)
        
        return jsonify({
            'success': True,
            'items': items_data
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/reports/inventory')
@license_middleware.require_license_for_api
def reports_inventory():
    """Generate inventory report"""
    try:
        # Get all inventory items
        items = InventoryItem.query.all()
        
        low_stock_count = 0
        total_value = 0
        items_data = []
        
        # Get total waste
        total_waste_items = InventoryWaste.query.count()
        
        for item in items:
            is_low_stock = item.current_stock <= item.min_stock
            if is_low_stock:
                low_stock_count += 1
            
            item_value = item.current_stock * item.cost
            total_value += item_value
            
            items_data.append({
                'name': item.name,
                'category': item.category,
                'current_stock': item.current_stock,
                'min_stock': item.min_stock,
                'unit': item.unit,
                'value': item_value
            })
        
        return jsonify({
            'success': True,
            'low_stock_count': low_stock_count,
            'total_value': total_value,
            'total_waste_items': total_waste_items,
            'items': items_data
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/reports/staff')
@license_middleware.require_license_for_api
def reports_staff():
    """Generate staff performance report"""
    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        if not start_date or not end_date:
            return jsonify({'success': False, 'error': 'Start date and end date are required'}), 400
        
        start_dt = datetime.strptime(start_date, '%Y-%m-%d').date()
        end_dt = datetime.strptime(end_date, '%Y-%m-%d').date()
        
        # Get all staff members
        staff = User.query.filter(User.role.in_(['waiter', 'chef', 'cashier'])).all()
        
        staff_performance = []
        
        for user in staff:
            # Get orders handled by this staff member
            orders = Order.query.filter(
                Order.waiter_id == user.id,
                db.func.date(Order.created_at) >= start_dt,
                db.func.date(Order.created_at) <= end_dt
            ).all()
            
            orders_handled = len(orders)
            total_sales = sum(o.total_amount for o in orders)
            avg_order_value = total_sales / orders_handled if orders_handled > 0 else 0
            
            # Calculate performance score (simplified)
            performance = min(100, (orders_handled * 10) + (total_sales / 10))
            
            staff_performance.append({
                'name': user.name,
                'role': user.role,
                'orders_handled': orders_handled,
                'total_sales': total_sales,
                'avg_order_value': avg_order_value,
                'performance': int(performance)
            })
        
        # Sort by total sales descending
        staff_performance.sort(key=lambda x: x['total_sales'], reverse=True)
        
        return jsonify({
            'success': True,
            'staff': staff_performance
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/reports/financial')
@license_middleware.require_license_for_api
def reports_financial():
    """Generate comprehensive financial report including both order payments and manual POS transactions"""
    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        if not start_date or not end_date:
            return jsonify({'success': False, 'error': 'Start date and end date are required'}), 400
        
        start_dt = datetime.strptime(start_date, '%Y-%m-%d').date()
        end_dt = datetime.strptime(end_date, '%Y-%m-%d').date()
        
        # Get all completed payments (both order-based and manual POS)
        payments = Payment.query.filter(
            db.func.date(Payment.created_at) >= start_dt,
            db.func.date(Payment.created_at) <= end_dt,
            Payment.status == 'completed'
        ).all()
        
        # Get refunds
        refunds = RefundRequest.query.filter(
            db.func.date(RefundRequest.created_at) >= start_dt,
            db.func.date(RefundRequest.created_at) <= end_dt,
            RefundRequest.status.in_(['approved', 'processed'])
        ).all()
        
        total_revenue = sum(p.amount for p in payments)
        total_payments = len(payments)
        total_refunds = sum(r.amount for r in refunds)
        net_revenue = total_revenue - total_refunds
        
        # Format payment data
        payments_data = []
        for payment in payments:
            payments_data.append({
                'id': payment.id,
                'created_at': payment.created_at.isoformat(),
                'payment_method': payment.payment_method,
                'amount': payment.amount,
                'order_id': payment.order_id,
                'is_manual': payment.is_manual,
                'customer_name': payment.customer_name if payment.is_manual else None,
                'status': payment.status
            })
        
        # Sort by date descending
        payments_data.sort(key=lambda x: x['created_at'], reverse=True)
        
        return jsonify({
            'success': True,
            'total_revenue': total_revenue,
            'total_payments': total_payments,
            'total_refunds': total_refunds,
            'net_revenue': net_revenue,
            'payments': payments_data
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# Cache management endpoint
@app.route('/api/clear_cache', methods=['POST'])
@license_middleware.require_license_for_api
def clear_cache():
    """Clear API cache"""
    global api_cache
    api_cache.clear()
    return jsonify({'success': True, 'message': 'Cache cleared successfully'})


if __name__ == '__main__':
    # Suppress Flask development server warning
    import warnings
    import os
    import sys
    
    # More aggressive warning suppression
    warnings.filterwarnings("ignore")
    warnings.simplefilter("ignore")
    
    # Set environment variables
    os.environ['FLASK_ENV'] = 'production'
    os.environ['WERKZEUG_RUN_MAIN'] = 'true'
    
    # Redirect stderr to suppress warnings
    class SuppressWarnings:
        def write(self, message):
            if 'WARNING' in message and 'development server' in message:
                return
            sys.__stderr__.write(message)
        
        def flush(self):
            sys.__stderr__.flush()
    
    sys.stderr = SuppressWarnings()
    
    print("🚀 Starting Restaurant Management System...")
    print("📱 Access the system at: http://localhost:5000")
    print("🔑 License registration at: http://localhost:5000/register")
    print("💡 Press Ctrl+C to stop the server")
    print()
    
    # Run with development settings - auto-reload enabled
    print("🚀 Starting in development mode with auto-reload")
    print("💡 Visit http://localhost:5000/startup-tasks after server starts to run database tasks")
    print("📱 Access the system at: http://localhost:5000")
    print()
    
    # Clear problematic environment variables
    import os
    os.environ.pop('WERKZEUG_SERVER_FD', None)
    os.environ.pop('WERKZEUG_RUN_MAIN', None)
    
    # Run with development mode - enable reloader if hot reload is enabled
    # Load hot reload setting from database before starting
    use_reloader_setting = False
    if DEV_MODE:
        try:
            # Ensure database tables exist before querying
            with app.app_context():
                db.create_all()
                from database.models import SystemSettings
                setting = SystemSettings.query.filter_by(setting_key='hot_reload_enabled').first()
                if setting:
                    use_reloader_setting = setting.setting_value.lower() == 'true'
                    # Update global variable (no 'global' needed at module level)
                    HOT_RELOAD_ENABLED = use_reloader_setting
        except Exception as e:
            print(f"⚠️  Error loading hot reload setting: {e}")
            print("   Hot reload will default to disabled")
    
    if use_reloader_setting:
        print("🔥 Hot reload ENABLED - server will auto-reload on code changes")
    elif DEV_MODE:
        print("ℹ️  Hot reload disabled - enable it in Settings > Dev Mode > Hot Reload")
    else:
        print("ℹ️  Production mode - hot reload not available")
    
    # Run with development mode - use_reloader based on HOT_RELOAD_ENABLED setting
    app.run(debug=True, host='0.0.0.0', port=5000, threaded=True, use_reloader=use_reloader_setting)
