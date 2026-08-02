import sqlite3

db = sqlite3.connect(r'F:\Computer Dynamics System v2\data\computer_dynamics.live.db')
cur = db.cursor()

cur.execute('PRAGMA table_info(security_events)')
print('security_events columns:', [r[1] for r in cur.fetchall()])

cur.execute("""
  SELECT * FROM security_events
  WHERE description LIKE '%LIC-8EE4F64D%'
  ORDER BY created_at DESC LIMIT 2
""")
cols = [d[0] for d in cur.description]
for row in cur.fetchall():
    print(dict(zip(cols, row)))

cur.execute("""
  SELECT event_type, description, ip_address, created_at, details
  FROM security_events
  WHERE ip_address = '201.221.77.147' AND created_at >= '2026-08-01'
  ORDER BY created_at DESC LIMIT 25
""")
print('\nRecent from 201.221.77.147:')
for row in cur.fetchall():
    print(row)

db.close()
