import sqlite3

db = sqlite3.connect(r'F:\Computer Dynamics System v2\data\computer_dynamics.live.db')
cur = db.cursor()
cur.execute("""
  SELECT id, created_at, description, ip_address, details
  FROM security_events
  WHERE event_type = 'license_validate_failed'
    AND ip_address = '201.221.77.147'
    AND created_at >= '2026-08-02 16:00:00'
  ORDER BY created_at DESC
  LIMIT 15
""")
for row in cur.fetchall():
    print(row)
db.close()
