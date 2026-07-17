#!/usr/bin/env python3
"""
Insert a test company and license activation row for a given serial into the local license_system.db.
Usage: python add_test_license.py
"""
import sqlite3
import os
from datetime import datetime, timezone, timedelta

DB = os.path.join(os.path.dirname(__file__), 'instance', 'license_system.db')
SERIAL = 'LIC-MSP-1c556303-20260608-AUTO-20260608191101'
BROWSER_FP = 'test-fp'

now = datetime.now(timezone.utc)
exp = now + timedelta(days=365)

def iso(dt):
    return dt.isoformat()

conn = sqlite3.connect(DB)
cur = conn.cursor()

# Ensure tables exist
cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='company_registration' LIMIT 1")
if not cur.fetchone():
    print('ERROR: company_registration table not found in DB:', DB)
    conn.close()
    raise SystemExit(1)

# Check if license already exists
cur.execute('SELECT id, serial_number FROM license_activation WHERE serial_number = ?', (SERIAL,))
if cur.fetchone():
    print('License already exists in DB:', SERIAL)
    conn.close()
    raise SystemExit(0)

# Create company
company_name = 'Test Company for LIC-MSP'
contact_person = 'Automated Test'
email = 'test@example.local'
phone = ''
address = 'Inserted by test script'
business_type = 'test'
registration_date = iso(now)
created_at = iso(now)

cur.execute(
    '''INSERT INTO company_registration (company_name, contact_person, email, phone, address, business_type, serial_number, msp_client_id, registration_date, is_verified, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
    (company_name, contact_person, email, phone, address, business_type, SERIAL, None, registration_date, 1, created_at)
)
company_id = cur.lastrowid
print('Inserted company id', company_id)

# Insert license_activation
license_type = 'One Time License'
service_level = 'test'
activation_date = iso(now)
expiration_date = iso(exp)
is_active = 1
max_users = 5
features = '{}'
created_at = iso(now)
updated_at = iso(now)

cur.execute(
    '''INSERT INTO license_activation (serial_number, company_id, license_type, service_level, activation_date, expiration_date, is_active, max_users, features, created_at, updated_at, browser_fingerprint)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
    (SERIAL, company_id, license_type, service_level, activation_date, expiration_date, is_active, max_users, features, created_at, updated_at, BROWSER_FP)
)
license_id = cur.lastrowid
print('Inserted license id', license_id)

conn.commit()
conn.close()
print('Done. Inserted test license and company into', DB)
