#!/usr/bin/env python3
"""
Extend a specific license by 5 minutes
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

def extend_license_by_5min(serial_number):
    """Extend license expiration by 5 minutes"""
    app = create_app()
    
    with app.app_context():
        # Find the license by serial number
        license = LicenseActivation.query.filter_by(serial_number=serial_number).first()
        
        if not license:
            print(f"❌ License not found: {serial_number}")
            return False
        
        print(f"✅ Found license: {serial_number}")
        print(f"   Current expiration: {license.expiration_date}")
        print(f"   License type: {license.license_type}")
        print(f"   Is active: {license.is_active}")
        
        # Always extend from current time, not from existing expiration
        # This ensures we add 5 minutes from NOW, not from a past date
        now = datetime.now(timezone.utc)
        
        # Check if current expiration is in the past
        if license.expiration_date:
            if license.expiration_date.tzinfo is None:
                current_exp = license.expiration_date.replace(tzinfo=timezone.utc)
            else:
                current_exp = license.expiration_date
            
            if current_exp < now:
                print(f"   ⚠️  License was already expired (expired {now - current_exp} ago)")
                print(f"   📅 Setting expiration to 5 minutes from NOW instead")
                new_expiration = now + timedelta(minutes=5)
            else:
                print(f"   📅 Extending from current expiration time")
                new_expiration = current_exp + timedelta(minutes=5)
        else:
            print("   ⚠️  No expiration date set, setting to 5 minutes from now")
            new_expiration = now + timedelta(minutes=5)
        license.expiration_date = new_expiration
        
        # Ensure license is active
        if not license.is_active:
            license.is_active = True
            print(f"   ⚠️  License was inactive, activating it now...")
        
        # Commit changes
        db.session.commit()
        
        print(f"✅ License extended by 5 minutes")
        print(f"   New expiration: {new_expiration}")
        print(f"   Extension time: +5 minutes")
        
        return True

if __name__ == '__main__':
    serial_number = "LIC-MSP-a0dd06af-20251025-RESTAURANT-20251025204956"
    
    print(f"🔍 Extending license: {serial_number}")
    print(f"   Extension: +5 minutes")
    print()
    
    success = extend_license_by_5min(serial_number)
    
    if success:
        print()
        print("✅ License extension completed successfully!")
    else:
        print()
        print("❌ Failed to extend license")
        sys.exit(1)

