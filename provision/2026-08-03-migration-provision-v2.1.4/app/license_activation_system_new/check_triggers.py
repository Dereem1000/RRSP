import sqlite3

conn = sqlite3.connect('instance/license_system.db')
cur = conn.cursor()

# Check for any triggers
cur.execute("SELECT name, sql FROM sqlite_master WHERE type='trigger' ORDER BY name")
triggers = cur.fetchall()

if triggers:
    print('Triggers found:')
    for name, sql in triggers:
        print(f'\nTrigger: {name}')
        print(f'SQL:\n{sql}')
        print('-' * 60)
else:
    print('No triggers found')

conn.close()
