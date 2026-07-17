#!/usr/bin/env python3
"""
Simulate creating a license using the GUI's logic (programmatic) and verify DB/audit entries.
"""
import os
import json
from datetime import datetime, timezone, timedelta

# Import app helpers from admin GUI
import admin_license_manager as alm
from models import db, CompanyRegistration, LicenseActivation

# Unique company details to avoid collisions
now = datetime.now(timezone.utc)
company_name = f'Test GUI Company {now.strftime("%Y%m%d%H%M%S")}'
contact_person = 'GUI Test'
email = f'gui-test-{now.strftime("%Y%m%d%H%M%S")}@example.local'
phone = '000-000-0000'
license_type = 'premium'
duration = 90
max_users = 10

app = alm.create_app()
with app.app_context():
    # Generate serials using the same functions
    from license_serial import ensure_unique_company_serial, ensure_unique_license_serial

    company_serial = ensure_unique_company_serial(db.session, CompanyRegistration)
    license_serial = ensure_unique_license_serial(db.session, LicenseActivation, msp_feature='restaurant')

    # Create company
    company = CompanyRegistration(
        company_name=company_name,
        contact_person=contact_person,
        email=email,
        phone=phone,
        business_type='restaurant',
        serial_number=company_serial,
        is_verified=True
    )
    db.session.add(company)
    db.session.flush()

    activation_date = datetime.now(timezone.utc)
    expiration_date = activation_date + timedelta(days=duration)

    features = {
        'inventory_management': True,
        'advanced_reporting': True,
        'api_access': True,
        'multi_location': False
    }

    license_row = LicenseActivation(
        serial_number=license_serial,
        company_id=company.id,
        license_type=license_type,
        activation_date=activation_date,
        expiration_date=expiration_date,
        is_active=True,
        max_users=max_users,
        features=json.dumps(features)
    )

    db.session.add(license_row)
    db.session.commit()

    print('Created license serial:', license_serial)

    # Verify entry in license_activation
    found = LicenseActivation.query.filter_by(serial_number=license_serial).first()
    if found:
        print('License activation row ID:', found.id, 'company_id:', found.company_id)
    else:
        print('License activation row not found!')

    # Check audit table for LIC-MSP entries -- our created serial is CD-LIC-*, so audit not expected
    conn = db.session.connection().connection
    cur = conn.cursor()
    cur.execute("SELECT id, serial_number, event, created_at, source FROM license_insert_audit WHERE serial_number = ?", (license_serial,))
    rows = cur.fetchall()
    print('Audit rows for created serial:', rows)

    # Also list recent audit rows to show any new LIC-MSP inserts
    cur.execute("SELECT id, serial_number, event, created_at, source FROM license_insert_audit ORDER BY id DESC LIMIT 10")
    recent = cur.fetchall()
    print('\nRecent audit rows (latest 10):')
    for r in recent:
        print(r)
