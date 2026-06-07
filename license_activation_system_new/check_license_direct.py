#!/usr/bin/env python3
"""
Direct License Binding Check
"""

import os
import sys
from flask import Flask
from models import db, LicenseActivation, CompanyRegistration

app = Flask(__name__)
db_path = os.path.join(os.path.dirname(__file__), 'instance', 'license_system.db')
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)

serial_number = 'LIC-MSP-a0dd06af-20251025-20251126211511'

with app.app_context():
    license = LicenseActivation.query.filter_by(serial_number=serial_number).first()
    
    if not license:
        print(f'❌ License not found: {serial_number}')
        sys.exit(1)
    
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
        sys.exit(0)
    else:
        print(f'   🔓 Browser Fingerprint: NOT SET')
        print(f'   Status: NOT BOUND - can be used from any browser/device')
        sys.exit(1)







