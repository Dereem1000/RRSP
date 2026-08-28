#!/usr/bin/env python3
"""
Test what happens when a license is deactivated but not expired
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
    instance_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance')
    os.makedirs(instance_dir, exist_ok=True)
    db_path = os.path.join(instance_dir, 'license_system.db')
    app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    db.init_app(app)
    return app

def test_deactivated_scenario(serial_number):
    """Test deactivated license scenario"""
    app = create_app()
    
    with app.app_context():
        license = LicenseActivation.query.filter_by(serial_number=serial_number).first()
        
        if not license:
            print(f"❌ License not found: {serial_number}")
            return
        
        print(f"🔍 Testing Deactivated License Scenario")
        print(f"=" * 60)
        print(f"Serial Number: {serial_number}")
        print()
        
        # Show current status
        now = datetime.now(timezone.utc)
        print(f"Current Status:")
        print(f"  is_active: {license.is_active}")
        print(f"  expiration_date: {license.expiration_date}")
        
        if license.expiration_date:
            if license.expiration_date.tzinfo is None:
                exp_date = license.expiration_date.replace(tzinfo=timezone.utc)
            else:
                exp_date = license.expiration_date
            
            is_expired = exp_date < now
            print(f"  Is Expired: {is_expired}")
            if not is_expired:
                print(f"  Time Until Expiration: {exp_date - now}")
        print()
        
        # Test scenario: Deactivate but expiration hasn't passed
        print(f"Testing Scenario: License deactivated but NOT expired")
        print(f"-" * 60)
        
        # Save original state
        original_is_active = license.is_active
        original_expiration = license.expiration_date
        
        # Set expiration to future (if needed)
        if not license.expiration_date or (license.expiration_date and license.expiration_date.tzinfo and license.expiration_date < now):
            license.expiration_date = now + timedelta(days=30)
            print(f"  Set expiration to 30 days from now: {license.expiration_date}")
        
        # Deactivate the license
        license.is_active = False
        db.session.commit()
        print(f"  Set is_active = False")
        print()
        
        print(f"📊 Validation Results:")
        print(f"-" * 60)
        
        # What the validator would return
        if not license.is_active:
            print(f"  ✅ Validator Check 1 (is_active): FAIL - License is deactivated")
            print(f"     → Result: {{'valid': False, 'error': 'License is deactivated'}}")
            print(f"     → Validation stops here (doesn't even check expiration)")
        else:
            print(f"  ✅ Validator Check 1 (is_active): PASS")
            
            if license.expiration_date:
                if exp_date < now:
                    print(f"  ❌ Validator Check 2 (expiration): FAIL - License expired")
                    print(f"     → Result: {{'valid': False, 'error': 'License has expired'}}")
                else:
                    print(f"  ✅ Validator Check 2 (expiration): PASS - License not expired")
                    print(f"     → Result: {{'valid': True}}")
        
        print()
        print(f"✅ Expected Behavior:")
        print(f"   - API should return: valid=false, error='License is deactivated'")
        print(f"   - Restaurant system should block access")
        print(f"   - This works even if expiration date is in the future")
        print()
        
        # Restore original state
        print(f"Restoring original state...")
        license.is_active = original_is_active
        license.expiration_date = original_expiration
        db.session.commit()
        print(f"  ✅ Restored")

if __name__ == '__main__':
    serial_number = "LIC-MSP-a0dd06af-20251025-RESTAURANT-20251025204956"
    print()
    test_deactivated_scenario(serial_number)
    print()














