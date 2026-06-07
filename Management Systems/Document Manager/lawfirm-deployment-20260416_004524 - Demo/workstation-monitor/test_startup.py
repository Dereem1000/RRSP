#!/usr/bin/env python
"""Test workstation monitor startup"""

import sys
import traceback

print("=" * 60)
print("WORKSTATION MONITOR STARTUP TEST")
print("=" * 60)

try:
    print("\n[1/4] Importing main module...")
    from main import Config, CONFIG_MANAGER, UPLOAD_STATE_FILE
    print("✅ main module imported successfully")
except Exception as e:
    print(f"❌ Error importing main: {e}")
    traceback.print_exc()
    sys.exit(1)

try:
    print("\n[2/4] Importing gui_app module...")
    from gui_app import WorkstationMonitorGUI, APIKeyEncryption
    print("✅ gui_app module imported successfully")
except Exception as e:
    print(f"❌ Error importing gui_app: {e}")
    traceback.print_exc()
    sys.exit(1)

try:
    print("\n[3/4] Testing Config initialization...")
    config = Config()
    print(f"✅ Config initialized successfully")
    print(f"   - API URL: {config.api_url}")
    print(f"   - API Key loaded: {bool(config.api_key)}")
    print(f"   - Workstation ID: {config.workstation_id}")
except Exception as e:
    print(f"❌ Error initializing Config: {e}")
    traceback.print_exc()
    sys.exit(1)

try:
    print("\n[4/4] Testing APIKeyEncryption...")
    test_key = "test-api-key-12345"
    encrypted = APIKeyEncryption.encrypt_key(test_key)
    print(f"✅ Encryption test passed")
    print(f"   - Original: {test_key}")
    print(f"   - Encrypted format: {encrypted[:30]}..." if encrypted else "   - Encryption returned None")
    
    if encrypted:
        decrypted = APIKeyEncryption.decrypt_key(encrypted)
        if decrypted == test_key:
            print(f"✅ Decryption verified - key matches original")
        else:
            print(f"❌ Decryption mismatch - expected '{test_key}', got '{decrypted}'")
            sys.exit(1)
except Exception as e:
    print(f"❌ Error testing encryption: {e}")
    traceback.print_exc()
    sys.exit(1)

print("\n" + "=" * 60)
print("✅ ALL STARTUP TESTS PASSED")
print("=" * 60)
print("\nWorkstation monitor is ready to start!")
