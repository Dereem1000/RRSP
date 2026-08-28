#!/usr/bin/env python3
"""
Check current license status and expiration
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

def check_license_status(serial_number):
    """Check current license status"""
    app = create_app()
    
    with app.app_context():
        # Find the license by serial number
        license = LicenseActivation.query.filter_by(serial_number=serial_number).first()
        
        if not license:
            print(f"❌ License not found: {serial_number}")
            return False
        
        now = datetime.now(timezone.utc)
        
        print(f"📋 License Status Report")
        print(f"=" * 60)
        print(f"Serial Number: {serial_number}")
        print(f"License Type: {license.license_type}")
        print(f"is_active flag: {license.is_active}")
        print()
        print(f"Current Time (UTC): {now}")
        print(f"Expiration Date: {license.expiration_date}")
        
        if license.expiration_date:
            # Handle timezone
            if license.expiration_date.tzinfo is None:
                exp_date = license.expiration_date.replace(tzinfo=timezone.utc)
            else:
                exp_date = license.expiration_date
            
            time_diff = exp_date - now
            is_expired = exp_date < now
            
            print()
            print(f"Time Difference: {time_diff}")
            print(f"Status: {'❌ EXPIRED' if is_expired else '✅ VALID'}")
            
            if is_expired:
                print(f"   Expired {abs(time_diff)} ago")
            else:
                print(f"   Expires in {time_diff}")
                
        else:
            print()
            print(f"⚠️  No expiration date set")
            
        return True

if __name__ == '__main__':
    serial_number = "LIC-MSP-a0dd06af-20251025-RESTAURANT-20251025204956"
    
    print()
    success = check_license_status(serial_number)
    print()
    
    if not success:
        sys.exit(1)














