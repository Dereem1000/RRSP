#!/usr/bin/env python3
"""
Inspect license directly from database to see what the API server sees
"""

import sys
import os
from datetime import datetime, timezone
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from models import db, LicenseActivation

def create_app():
    """Create Flask app for database context"""
    app = Flask(__name__)
    instance_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance')
    os.makedirs(instance_dir, exist_ok=True)
    db_path = os.path.join(instance_dir, 'license_system.db')
    app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    db.init_app(app)
    return app

def inspect_license(serial_number):
    """Inspect license from database"""
    app = create_app()
    
    with app.app_context():
        license = LicenseActivation.query.filter_by(serial_number=serial_number).first()
        
        if not license:
            print(f"❌ License not found: {serial_number}")
            return
        
        now = datetime.now(timezone.utc)
        
        print(f"📋 License Database Record")
        print(f"=" * 60)
        print(f"ID: {license.id}")
        print(f"Serial Number: {license.serial_number}")
        print(f"License Type: {license.license_type}")
        print(f"Company ID: {license.company_id}")
        print(f"Is Active: {license.is_active}")
        print(f"Max Users: {license.max_users}")
        print()
        print(f"Dates:")
        print(f"  Activation Date: {license.activation_date}")
        print(f"  Expiration Date: {license.expiration_date}")
        print(f"  Created At: {license.created_at}")
        print(f"  Updated At: {license.updated_at}")
        print(f"  Last Online Check: {license.last_online_check}")
        print()
        
        # Check expiration
        if license.expiration_date:
            if license.expiration_date.tzinfo is None:
                exp_date = license.expiration_date.replace(tzinfo=timezone.utc)
            else:
                exp_date = license.expiration_date
            
            is_expired = exp_date < now
            print(f"Expiration Check:")
            print(f"  Current Time (UTC): {now}")
            print(f"  Expiration Date: {exp_date}")
            print(f"  Is Expired: {is_expired}")
            if is_expired:
                print(f"  Expired: {now - exp_date} ago")
            else:
                print(f"  Time Until Expiration: {exp_date - now}")
        
        print()
        print(f"Features: {license.features}")
        print()
        
        # What the validator would check
        print(f"🔍 Validator Check (what API server sees):")
        print(f"  1. License exists: ✅")
        print(f"  2. is_active check: {'✅ PASS' if license.is_active else '❌ FAIL (deactivated)'}")
        
        if license.expiration_date:
            if exp_date < now:
                print(f"  3. Expiration check: ❌ FAIL (expired {now - exp_date} ago)")
                print(f"     → Validator would return: {{'valid': False, 'error': 'License has expired'}}")
            else:
                print(f"  3. Expiration check: ✅ PASS (expires in {exp_date - now})")
                print(f"     → Validator would return: {{'valid': True}}")
        else:
            print(f"  3. Expiration check: ⚠️  No expiration date set")

if __name__ == '__main__':
    serial_number = "LIC-MSP-a0dd06af-20251025-RESTAURANT-20251025204956"
    print()
    inspect_license(serial_number)
    print()














