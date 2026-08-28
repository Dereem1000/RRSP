import sqlite3
import os
from datetime import datetime, timedelta

db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance', 'license_system.db')
conn = sqlite3.connect(db_path)
cur = conn.cursor()
serial = 'LIC-MSP-1c556303-20260608-AUTO-20260608191101'
cur.execute('SELECT id FROM license_activation WHERE serial_number=?', (serial,))
if cur.fetchone():
    print('ALREADY_EXISTS')
    conn.close()
    raise SystemExit(0)

# Find an existing company id to attach; prefer id=1
cur.execute('SELECT id FROM company_registration ORDER BY id LIMIT 1')
row = cur.fetchone()
if row:
    company_id = row[0]
else:
    # Create a dummy company
    created_at = datetime.utcnow().isoformat()
    cur.execute('INSERT INTO company_registration (company_name, contact_person, email, phone, address, business_type, serial_number, msp_client_id, registration_date, is_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                ('AUTO-M Client', 'AutoM Admin', 'admin@example.com', '', '', 'auto', 'AUTO-COMP-001', 'MSP-CLIENT-001', created_at, 1, created_at))
    company_id = cur.lastrowid

now = datetime.utcnow()
activation_date = now.isoformat()
expiration_date = (now + timedelta(days=365*3)).isoformat()
features = '{"auto_system": true, "api_access": true, "inventory_management": false}'

cur.execute('INSERT INTO license_activation (serial_number, company_id, license_type, activation_date, expiration_date, is_active, max_users, features, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (serial, company_id, 'No Time Limit', activation_date, expiration_date, 1, 1, features, activation_date, activation_date))
conn.commit()
print('CREATED')
conn.close()
