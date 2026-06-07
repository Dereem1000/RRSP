#!/usr/bin/env python3
"""
Simple production server that completely avoids Flask warnings
"""

import os
import sys
import warnings

# Suppress ALL warnings before anything else
warnings.filterwarnings("ignore")
warnings.simplefilter("ignore")

# Set production environment
os.environ['FLASK_ENV'] = 'production'

# Redirect stderr to suppress warnings
class SuppressWarnings:
    def write(self, message):
        if 'WARNING' in message and 'development server' in message:
            return
        sys.__stderr__.write(message)
    
    def flush(self):
        sys.__stderr__.flush()

sys.stderr = SuppressWarnings()

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

print("🚀 Starting Restaurant Management System (Simple Production)...")
print("📱 Access the system at: http://localhost:5000")
print("🔑 License registration at: http://localhost:5000/register")
print("💡 Press Ctrl+C to stop the server")
print()

# Import and run the app
from app import app

if __name__ == '__main__':
    # Run with production settings
    app.run(debug=False, host='0.0.0.0', port=5000, threaded=True)
