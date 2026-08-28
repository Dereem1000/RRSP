#!/usr/bin/env python3
"""
Analyze serial formats in license_activation table and flag legacy short LIC-* entries.
"""
import sqlite3
import os
import re

DB = os.path.join(os.path.dirname(__file__), 'instance', 'license_system.db')
conn = sqlite3.connect(DB)
cur = conn.cursor()

cur.execute('SELECT id, serial_number, company_id, created_at FROM license_activation ORDER BY id')
rows = cur.fetchall()

short_pattern = re.compile(r'^LIC-[0-9A-Z]{8}(-[0-9]{8})?$', re.IGNORECASE)
legacy_msp_pattern = re.compile(r'^LIC-MSP-', re.IGNORECASE)

print(f'Total license rows: {len(rows)}')
print('\nLegacy/short matches:')
count = 0
for r in rows:
    sid, serial, cid, created = r
    if serial is None:
        continue
    if short_pattern.match(serial) or legacy_msp_pattern.match(serial):
        print((sid, serial, cid, created))
        count += 1

print('\nCount of legacy-style serials:', count)
conn.close()
