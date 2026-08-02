import sqlite3

db = sqlite3.connect(r'F:\Computer Dynamics System v2\license_activation_system_new\instance\license_system.db')
cur = db.cursor()
cur.execute('SELECT id, company_name, serial_number, msp_client_id, email FROM company_registration')
print('Companies:')
for row in cur.fetchall():
    print(row)
    if '8ee4' in str(row).lower():
        print('  ^ MATCH')
db.close()
