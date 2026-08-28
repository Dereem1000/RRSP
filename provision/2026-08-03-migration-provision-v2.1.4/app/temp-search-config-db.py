import sqlite3, json, glob, os

paths = [
    r'F:\Computer Dynamics System v2\Management Systems\Restaurant System\restaurant-deployment-20260422_094910\restaurant.db',
    r'F:\Computer Dynamics System v2\Management Systems\Document Manager\lawfirm-deployment-20260416_004524 - Demo\server\data\lawfirm.db',
    r'E:\CRM\deploy\2026-07-08-v1.6.41\app\crm.sqlite',
    r'E:\CRM\crm.sqlite',
]

# also find crm sqlite
for p in glob.glob(r'E:\CRM\**\*.sqlite', recursive=True):
    paths.append(p)

needle = '8EE4F64D'

for path in paths:
    if not os.path.exists(path):
        continue
    print('\n===', path, '===')
    conn = sqlite3.connect(path)
    cur = conn.cursor()
    cur.execute('SELECT name FROM sqlite_master WHERE type="table"')
    tables = [r[0] for r in cur.fetchall()]
    print('tables:', tables[:20])
    for t in tables:
        try:
            cur.execute(f'SELECT * FROM "{t}"')
            for row in cur.fetchall():
                s = str(row)
                if 'license' in s.lower() or 'serial' in s.lower() or needle.lower() in s.lower():
                    print(f'  {t}:', row)
        except Exception as e:
            pass
    conn.close()
