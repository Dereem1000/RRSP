#!/usr/bin/env python3
"""
_validate_env.py — Pre-flight .env validation called by run_production.bat.
Exits 0 if .env is valid, 1 if not.
"""
import os, sys

env = {}
try:
    with open('.env') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                env[k.strip()] = v.strip()
except FileNotFoundError:
    print("[FATAL] .env file not found.")
    sys.exit(1)

key = env.get('SECRET_KEY', '')
bad = {
    '', 'CHANGE-THIS-TO-A-SECURE-RANDOM-HEX-STRING',
    'your-secret-key-here', 'changeme', 'secret'
}
if not key or key in bad or len(key) < 32:
    print("[FATAL] SECRET_KEY in .env is missing or still set to the placeholder.")
    print("        Run: python setup_secrets.py")
    sys.exit(1)

print("[OK] SECRET_KEY looks valid")
sys.exit(0)
