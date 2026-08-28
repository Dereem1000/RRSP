#!/usr/bin/env python3
"""
Check license data directly from database to see what types are stored
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from models import db, LicenseActivation
from license_api_server import app

def check_license(serial_number):
    """Check license data types directly"""
    with app.app_context():
        license = LicenseActivation.query.filter_by(serial_number=serial_number).first()
        
        if not license:
            print(f"❌ License not found: {serial_number}")
            return
        
        print(f"✅ License found: {serial_number}")
        print(f"\n📋 License Data Types:")
        print(f"   ID: {license.id} (type: {type(license.id)})")
        print(f"   serial_number: {license.serial_number} (type: {type(license.serial_number)})")
        print(f"   license_type: {license.license_type} (type: {type(license.license_type)})")
        print(f"   expiration_date: {license.expiration_date} (type: {type(license.expiration_date)})")
        print(f"   activation_date: {license.activation_date} (type: {type(license.activation_date)})")
        print(f"   last_online_check: {license.last_online_check} (type: {type(license.last_online_check)})")
        print(f"   max_users: {license.max_users} (type: {type(license.max_users)})")
        print(f"   is_active: {license.is_active} (type: {type(license.is_active)})")
        print(f"   features: {license.features} (type: {type(license.features)})")
        
        # Try to identify problematic fields
        print(f"\n🔍 Checking for problematic types:")
        if isinstance(license.license_type, dict):
            print(f"   ⚠️ license_type is a DICT! This will cause comparison errors.")
        if isinstance(license.expiration_date, dict):
            print(f"   ⚠️ expiration_date is a DICT! This will cause comparison errors.")
        if isinstance(license.activation_date, dict):
            print(f"   ⚠️ activation_date is a DICT! This will cause comparison errors.")
        if isinstance(license.max_users, dict):
            print(f"   ⚠️ max_users is a DICT! This will cause comparison errors.")
        if isinstance(license.last_online_check, dict):
            print(f"   ⚠️ last_online_check is a DICT! This will cause comparison errors.")

if __name__ == '__main__':
    serial_number = "LIC-MSP-a0dd06af-20251025-POS-20251107013327"
    check_license(serial_number)





