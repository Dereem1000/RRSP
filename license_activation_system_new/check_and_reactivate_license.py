#!/usr/bin/env python3
"""
Check license status and reactivate if needed
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

def check_and_reactivate_license(serial_number):
    """Check license status and reactivate if needed"""
    app = create_app()
    
    with app.app_context():
        # Find the license by serial number
        license = LicenseActivation.query.filter_by(serial_number=serial_number).first()
        
        if not license:
            print(f"❌ License not found: {serial_number}")
            return False
        
        print(f"✅ Found license: {serial_number}")
        print(f"   License type: {license.license_type}")
        print(f"   Current is_active flag: {license.is_active}")
        print(f"   Expiration date: {license.expiration_date}")
        
        # Check if expired
        now = datetime.now(timezone.utc)
        if license.expiration_date:
            if license.expiration_date.tzinfo is None:
                exp_date = license.expiration_date.replace(tzinfo=timezone.utc)
            else:
                exp_date = license.expiration_date
            
            is_expired = exp_date < now
            print(f"   Current time: {now}")
            print(f"   Is expired: {is_expired}")
            
            # If not expired but inactive, reactivate it
            if not is_expired and not license.is_active:
                print(f"   ⚠️  License is not expired but marked as inactive. Reactivating...")
                license.is_active = True
                db.session.commit()
                print(f"   ✅ License reactivated!")
            # If expired but has time left (shouldn't happen, but just in case)
            elif is_expired:
                print(f"   ⚠️  License is expired. Extending expiration...")
                # Set expiration to 5 minutes from now
                license.expiration_date = now + timedelta(minutes=5)
                license.is_active = True
                db.session.commit()
                print(f"   ✅ License extended and reactivated!")
                print(f"   New expiration: {license.expiration_date}")
            elif license.is_active:
                print(f"   ✅ License is active and not expired")
        else:
            # No expiration date - set one and activate
            print(f"   ⚠️  No expiration date set. Setting expiration to 5 minutes from now...")
            license.expiration_date = now + timedelta(minutes=5)
            license.is_active = True
            db.session.commit()
            print(f"   ✅ License expiration set and activated!")
            print(f"   New expiration: {license.expiration_date}")
        
        # Final status
        print()
        print(f"📊 Final Status:")
        print(f"   is_active: {license.is_active}")
        print(f"   expiration_date: {license.expiration_date}")
        
        return True

if __name__ == '__main__':
    serial_number = "LIC-MSP-a0dd06af-20251025-RESTAURANT-20251025204956"
    
    print(f"🔍 Checking and reactivating license: {serial_number}")
    print()
    
    success = check_and_reactivate_license(serial_number)
    
    if success:
        print()
        print("✅ License check and reactivation completed!")
    else:
        print()
        print("❌ Failed to check/reactivate license")
        sys.exit(1)

