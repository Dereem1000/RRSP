import sqlite3, os, sys
serial = 'LIC-MSP-1c556303-20260608-AUTO-20260608191101'
_db = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance', 'license_system.db')
if not os.path.exists(_db):
    print('DB_NOT_FOUND', _db)
    sys.exit(1)
conn = sqlite3.connect(_db)
cur = conn.cursor()
cur.execute('SELECT id, serial_number, company_id, is_active, expiration_date, browser_fingerprint FROM license_activation WHERE serial_number=?', (serial,))
row = cur.fetchone()
if row:
    print('FOUND', row)
else:
    print('NOT_FOUND')
conn.close()
