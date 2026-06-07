#!/usr/bin/env python3
"""
Production server for Restaurant Management System
Completely bypasses Flask's development server warning
"""

import os
import sys
import warnings

# Suppress all warnings before importing anything
warnings.filterwarnings("ignore")
warnings.simplefilter("ignore")

# Set environment variables
os.environ['FLASK_ENV'] = 'production'

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# ---------------------------------------------------------------------------
# Load secrets from .env file before any app config is set
# ---------------------------------------------------------------------------
_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
if os.path.exists(_env_path):
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith('#') and '=' in _line:
                _k, _v = _line.split('=', 1)
                os.environ.setdefault(_k.strip(), _v.strip())

# Import Flask and create app
from flask import Flask
from flask_cors import CORS
from database.models import db
from database.init_db import init_database, generate_qr_codes
from license_registration import RestaurantLicenseRegistration
from license_middleware import LicenseMiddleware
from datetime import datetime, date, timedelta
import json

# Create Flask app
app = Flask(__name__)

# ---------------------------------------------------------------------------
# SECRET_KEY — must come from the environment / .env file, never hardcoded.
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
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///restaurant.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize database
db.init_app(app)

# Import all models after db initialization
from database.models import User, Category, MenuItem, Table, Order, OrderItem, Payment, Customer, WaiterAssignment, InventoryItem, PurchaseOrder, PurchaseOrderItem, SystemSettings, DatabaseConfig, CompanyRegistration, LicenseActivation

# Initialize extensions
CORS(app)

# Initialize license system
license_registration = RestaurantLicenseRegistration()
license_middleware = LicenseMiddleware()

# Import all routes
from app import *

if __name__ == '__main__':
    print("🚀 Starting Restaurant Management System (Production Server)...")
    print("📱 Access the system at: http://localhost:5000")
    print("🔑 License registration at: http://localhost:5000/register")
    print("💡 Press Ctrl+C to stop the server")
    print()
    
    # Initialize database
    with app.app_context():
        init_database(app)
        generate_qr_codes(app)
    
    # Clean up any conflicting environment variables
    if 'WERKZEUG_SERVER_FD' in os.environ:
        del os.environ['WERKZEUG_SERVER_FD']
    if 'WERKZEUG_RUN_MAIN' in os.environ:
        del os.environ['WERKZEUG_RUN_MAIN']
    
    # Use Werkzeug's run_simple (no warnings)
    from werkzeug.serving import run_simple
    run_simple(
        hostname='0.0.0.0',
        port=5000,
        application=app,
        use_reloader=False,
        use_debugger=False,
        threaded=True
    )
