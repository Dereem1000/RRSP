#!/usr/bin/env python3
"""
Add a specific license serial to the license_activation database.
Usage: python add_license_serial.py <SERIAL>
"""
import os
import sys
import json
from datetime import datetime, timezone, timedelta
import admin_license_manager as alm
from models import db, CompanyRegistration, LicenseActivation

if len(sys.argv) < 2:
    print("Usage: python add_license_serial.py <SERIAL>")
    sys.exit(1)

serial = sys.argv[1].strip()
print(f"Adding license serial: {serial}")

app = alm.create_app()
with app.app_context():
    # Check if serial already exists
    existing = LicenseActivation.query.filter_by(serial_number=serial).first()
    if existing:
        print(f"License already exists: ID {existing.id}")
        sys.exit(0)

    # Create a test company if needed
    company = CompanyRegistration.query.first()
    if not company:
        company = CompanyRegistration(
            company_name='Default Test Company',
            contact_person='Admin',
            email='admin@example.local',
            phone='000-000-0000',
            business_type='test',
            serial_number='CD-COMP-DEFAULT-' + os.urandom(16).hex()[:16].upper(),
            is_verified=True
        )
        db.session.add(company)
        db.session.flush()
        print(f"Created company ID {company.id}")

    # Create license
    now = datetime.now(timezone.utc)
    exp = now + timedelta(days=365)

    license_row = LicenseActivation(
        serial_number=serial,
        company_id=company.id,
        license_type='One Time License',
        activation_date=now,
        expiration_date=exp,
        is_active=True,
        max_users=5,
        features=json.dumps({'admin': True})
    )

    db.session.add(license_row)
    db.session.commit()

    print(f"License added successfully!")
    print(f"  Serial: {serial}")
    print(f"  License ID: {license_row.id}")
    print(f"  Company ID: {company.id}")
    print(f"  Expires: {exp.isoformat()}")
