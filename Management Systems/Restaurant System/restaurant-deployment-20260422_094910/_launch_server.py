#!/usr/bin/env python3
"""
Production launcher — called by run_production.bat.
Loads .env, then starts the app with Waitress.
"""
import os
import sys
import warnings
warnings.filterwarnings("ignore")

HERE = os.path.dirname(os.path.abspath(__file__))

# Load .env
env_path = os.path.join(HERE, '.env')
with open(env_path) as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            os.environ.setdefault(k.strip(), v.strip())

os.environ['FLASK_ENV'] = 'production'
sys.path.insert(0, HERE)

try:
    from app import app
except Exception as e:
    print(f"\n[FATAL] Failed to import app: {e}")
    import traceback; traceback.print_exc()
    sys.exit(1)

try:
    from waitress import serve
except ImportError:
    print("\n[FATAL] waitress is not installed. Run: pip install waitress")
    sys.exit(1)

host = os.environ.get('HOST', '0.0.0.0')
port = int(os.environ.get('PORT', '5000'))

print(f"Server running at http://{host}:{port}")
print("Press Ctrl+C to stop.")
serve(app, host=host, port=port, threads=4)
