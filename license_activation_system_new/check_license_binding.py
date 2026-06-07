#!/usr/bin/env python3
"""
Check License Browser Fingerprint Binding
"""

import sys
from flask import Flask
from models import db, LicenseActivation, CompanyRegistration

import os
app = Flask(__name__)
# Use absolute path to database
db_path = os.path.join(os.path.dirname(__file__), 'instance', 'license_system.db')
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)

def check_license_binding(serial_number):
    """Check if a license is bound to a browser fingerprint"""
    with app.app_context():
        license = LicenseActivation.query.filter_by(serial_number=serial_number).first()
        
        if not license:
            print(f'❌ License not found: {serial_number}')
            return False
        
        print(f'✅ License found: {serial_number}')
        print(f'   License Type: {license.license_type}')
        print(f'   Is Active: {license.is_active}')
        print(f'   Company ID: {license.company_id}')
        
        if license.company:
            print(f'   Company Name: {license.company.company_name}')
            print(f'   Company Email: {license.company.email}')
        
        if license.browser_fingerprint:
            print(f'   🔒 Browser Fingerprint: {license.browser_fingerprint}')
            print(f'   Status: BOUND to device/browser')
            print(f'   ⚠️  This license can only be used from the browser/device with this fingerprint')
            return True
        else:
            print(f'   🔓 Browser Fingerprint: NOT SET')
            print(f'   Status: NOT BOUND - can be used from any browser/device')
            print(f'   ⚠️  This license will be bound to the first browser/device that activates it')
            return False

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: python check_license_binding.py <serial_number>')
        sys.exit(1)
    
    serial_number = sys.argv[1]
    is_bound = check_license_binding(serial_number)
    sys.exit(0 if is_bound else 1)

