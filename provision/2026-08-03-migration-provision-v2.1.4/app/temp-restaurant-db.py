import sqlite3, json

path = r'F:\Computer Dynamics System v2\Management Systems\Restaurant System\restaurant-deployment-20260422_094910\restaurant.db'
conn = sqlite3.connect(path)
cur = conn.cursor()

for table in ['setting', 'database_config', 'license_activation', 'company_registration']:
    try:
        cur.execute(f'SELECT * FROM "{table}"')
        rows = cur.fetchall()
        print(f'\n=== {table} ({len(rows)} rows) ===')
        for row in rows:
            print(row)
    except Exception as e:
        print(table, e)

conn.close()
