import sqlite3, os, json
_db = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance', 'license_system.db')
print('DB:', _db)
conn = sqlite3.connect(_db)
cur = conn.cursor()

print('\nCompanies:')
try:
    cur.execute('SELECT id, company_name, serial_number, msp_client_id, email FROM company_registration')
    rows = cur.fetchall()
    for r in rows:
        print(' ', r)
except Exception as e:
    print('  Error reading companies:', e)

print('\nLicenses:')
try:
    cur.execute('SELECT id, serial_number, company_id, license_type, is_active, expiration_date, browser_fingerprint FROM license_activation')
    rows = cur.fetchall()
    for r in rows:
        print(' ', r)
except Exception as e:
    print('  Error reading licenses:', e)

print('\nSystem configuration entries:')
try:
    cur.execute('SELECT config_key, config_value FROM system_configuration')
    rows = cur.fetchall()
    for r in rows:
        val = r[1]
        try:
            # pretty print JSON configs
            j = json.loads(val)
            val = json.dumps(j)
        except Exception:
            pass
        print(' ', r[0], '=', val)
except Exception as e:
    print('  Error reading system_configuration:', e)

conn.close()
