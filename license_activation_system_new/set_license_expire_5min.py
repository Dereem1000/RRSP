#!/usr/bin/env python3
"""
Set license to expire in exactly 5 minutes from now
"""

import sys
import os
from datetime import datetime, timezone, timedelta
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from models import db, LicenseActivation

def create_app():
    """Create Flask app for database context"""
    app = Flask(__name__)
    # Use relative path to instance directory
    instance_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance')
    os.makedirs(instance_dir, exist_ok=True)
    db_path = os.path.join(instance_dir, 'license_system.db')
    app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    db.init_app(app)
    return app

def set_license_expire_5min(serial_number):
    """Set license to expire in exactly 5 minutes from now"""
    app = create_app()
    
    with app.app_context():
        # Find the license by serial number
        license = LicenseActivation.query.filter_by(serial_number=serial_number).first()
        
        if not license:
            print(f"❌ License not found: {serial_number}")
            return False
        
        now = datetime.now(timezone.utc)
        new_expiration = now + timedelta(minutes=5)
        
        print(f"✅ Found license: {serial_number}")
        print(f"   License type: {license.license_type}")
        print(f"   Current is_active: {license.is_active}")
        print(f"   Current expiration: {license.expiration_date}")
        print()
        print(f"   Current time (UTC): {now}")
        print(f"   Setting expiration to: {new_expiration}")
        print(f"   License will expire in: 5 minutes")
        
        # Set expiration to 5 minutes from now
        license.expiration_date = new_expiration
        
        # Ensure license is active
        if not license.is_active:
            license.is_active = True
            print(f"   ⚠️  License was inactive, activating it now...")
        
        # Commit changes
        db.session.commit()
        
        print()
        print(f"✅ License expiration set to 5 minutes from now")
        print(f"   New expiration: {new_expiration}")
        
        return True

if __name__ == '__main__':
    serial_number = "LIC-MSP-a0dd06af-20251025-RESTAURANT-20251025204956"
    
    print(f"🔍 Setting license to expire in 5 minutes: {serial_number}")
    print()
    
    success = set_license_expire_5min(serial_number)
    
    if success:
        print()
        print("✅ License expiration updated successfully!")
    else:
        print()
        print("❌ Failed to update license expiration")
        sys.exit(1)














