import sqlite3

db = sqlite3.connect(r'F:\Computer Dynamics System v2\data\computer_dynamics.live.db')
cur = db.cursor()

cur.execute("""
  SELECT created_at, description, ip_address, details
  FROM security_events
  WHERE description LIKE '%LIC-8EE4F64D%'
  ORDER BY created_at ASC LIMIT 5
""")
print('First occurrences:')
for row in cur.fetchall():
    print(row)

cur.execute("""
  SELECT COUNT(*) FROM security_events
  WHERE description LIKE '%LIC-8EE4F64D%'
""")
print('Total LIC-8EE4F64D failures:', cur.fetchone()[0])

# clients at portal
cur.execute("""
  SELECT id, name, company_name, email, address FROM clients
  WHERE id IS NOT NULL AND length(id) > 10
""")
print('\nPortal clients:')
for row in cur.fetchall():
    print(row)

db.close()
