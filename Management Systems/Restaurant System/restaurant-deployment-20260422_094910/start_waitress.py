#!/usr/bin/env python3
"""
Windows Production startup script for Restaurant Management System
Uses Waitress WSGI server for production deployment on Windows
"""

import os
import sys
from pathlib import Path

def start_waitress_server():
    """Start the Restaurant Management System using Waitress (Windows-compatible)"""
    
    # Get the directory where this script is located
    script_dir = Path(__file__).parent
    os.chdir(script_dir)
    
    print("🚀 Starting Restaurant Management System with Waitress...")
    print("📱 Access the system at: http://localhost:5000")
    print("🔑 License registration at: http://localhost:5000/register")
    print("💡 Press Ctrl+C to stop the server")
    print()
    
    try:
        from waitress import serve
        # Import and run the app
        sys.path.insert(0, str(script_dir))
        from app import app
        
        print("✅ Waitress found, starting production server...")
        print("🔧 Server configuration:")
        print("   - Host: 0.0.0.0")
        print("   - Port: 5000")
        print("   - Threads: 4")
        print("   - Connection limit: 1000")
        print()
        
        # Start Waitress server
        serve(
            app,
            host='0.0.0.0',
            port=5000,
            threads=4,
            connection_limit=1000,
            cleanup_interval=30,
            channel_timeout=120,
            log_socket_errors=True
        )
        
    except ImportError:
        print("❌ Waitress not found!")
        print("💡 To install Waitress: pip install waitress")
        print("🔄 Falling back to Flask development server...")
        print()
        
        # Fallback to Flask
        import warnings
        warnings.filterwarnings("ignore", message=".*development server.*")
        
        # Import and run the app
        sys.path.insert(0, str(script_dir))
        from app import app
        app.run(debug=False, host='0.0.0.0', port=5000, threaded=True)

if __name__ == '__main__':
    start_waitress_server()
