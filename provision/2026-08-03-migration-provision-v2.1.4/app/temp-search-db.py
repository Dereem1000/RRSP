import sqlite3, os, glob

needle = '8EE4F64D'
roots = [
    r'F:\Computer Dynamics System v2',
    r'E:\AutoM.System',
    r'E:\Mini 2026',
    r'E:\CRM',
]

for root in roots:
    if not os.path.exists(root):
        continue
    for path in glob.glob(os.path.join(root, '**', '*.db'), recursive=True):
        try:
            conn = sqlite3.connect(path)
            cur = conn.cursor()
            cur.execute('SELECT name FROM sqlite_master WHERE type="table"')
            tables = [r[0] for r in cur.fetchall()]
            for t in tables:
                try:
                    cur.execute(f'SELECT * FROM "{t}" LIMIT 500')
                    for row in cur.fetchall():
                        if needle.lower() in str(row).lower():
                            print('FOUND in', path, 'table', t, row)
                except Exception:
                    pass
            conn.close()
        except Exception:
            pass

print('done')
