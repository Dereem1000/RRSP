#!/usr/bin/env python3
"""
Custom WSGI server for Restaurant Management System
This completely avoids the Flask development server warning
"""

import os
import sys
from werkzeug.serving import run_simple
from werkzeug.middleware.dispatcher import DispatcherMiddleware

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import the Flask app
from app import app

def create_app():
    """Create the WSGI application"""
    return app

if __name__ == '__main__':
    print("🚀 Starting Restaurant Management System (WSGI Server)...")
    print("📱 Access the system at: http://localhost:5000")
    print("🔑 License registration at: http://localhost:5000/register")
    print("💡 Press Ctrl+C to stop the server")
    print()
    
    # Suppress all warnings
    import warnings
    warnings.filterwarnings("ignore")
    
    # Use Werkzeug's run_simple instead of Flask's development server
    run_simple(
        hostname='0.0.0.0',
        port=5000,
        application=create_app(),
        use_reloader=False,
        use_debugger=False,
        threaded=True
    )
