#!/usr/bin/env python3
"""
Create a test license for the Computer Dynamics License System
"""

import sys
import os
from datetime import datetime, timedelta
import json

# Add the current directory to the path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from models import db, LicenseActivation
from license_api_server import app

def create_test_license():
    """Create a test license for restaurant management system"""
    
    with app.app_context():
        # Check if test license already exists
        existing_license = LicenseActivation.query.filter_by(serial_number='REST-TEST-001').first()
        
        if existing_license:
            print(f"✅ Test license already exists: {existing_license.serial_number}")
            print(f"   Company ID: {existing_license.company_id}")
            print(f"   License Type: {existing_license.license_type}")
            print(f"   Active: {existing_license.is_active}")
            print(f"   Expires: {existing_license.expiration_date}")
            return existing_license
        
        # Create new test license
        test_license = LicenseActivation(
            serial_number='REST-TEST-001',
            company_id='RESTAURANT-DEMO-001',
            license_type='restaurant_management',
            is_active=True,
            activation_date=datetime.now(),  # Required field
            expiration_date=datetime.now() + timedelta(days=365),  # 1 year from now
            max_users=10,
            features=json.dumps({
                'menu_management': True,
                'order_management': True,
                'table_management': True,
                'payment_processing': True,
                'inventory_management': True,
                'customer_management': True,
                'reporting': True,
                'multi_location': False,
                'advanced_analytics': False,
                'api_access': True
            }),
            created_at=datetime.now(),
            last_online_check=None
        )
        
        db.session.add(test_license)
        db.session.commit()
        
        print(f"✅ Test license created successfully!")
        print(f"   Serial Number: {test_license.serial_number}")
        print(f"   Company ID: {test_license.company_id}")
        print(f"   License Type: {test_license.license_type}")
        print(f"   Active: {test_license.is_active}")
        print(f"   Max Users: {test_license.max_users}")
        print(f"   Expires: {test_license.expiration_date}")
        print(f"   Features: {json.loads(test_license.features)}")
        
        return test_license

def list_all_licenses():
    """List all licenses in the system"""
    
    with app.app_context():
        licenses = LicenseActivation.query.all()
        
        print(f"\n📋 All Licenses in System ({len(licenses)} total):")
        print("=" * 60)
        
        for license in licenses:
            print(f"Serial: {license.serial_number}")
            print(f"Company: {license.company_id}")
            print(f"Type: {license.license_type}")
            print(f"Active: {license.is_active}")
            print(f"Users: {license.max_users}")
            print(f"Expires: {license.expiration_date}")
            print(f"Features: {json.loads(license.features) if license.features else {}}")
            print("-" * 40)

if __name__ == '__main__':
    print("🚀 Creating test license for Computer Dynamics License System")
    print("=" * 60)
    
    # Create database tables if they don't exist
    with app.app_context():
        db.create_all()
        print("✅ Database tables created/verified")
    
    # Create test license
    test_license = create_test_license()
    
    # List all licenses
    list_all_licenses()
    
    print("\n🎉 Test license setup complete!")
    print("You can now test the license validation system with serial number: REST-TEST-001")
