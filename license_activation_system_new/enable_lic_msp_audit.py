#!/usr/bin/env python3
"""
Create an audit table and triggers to record any INSERT/UPDATE that creates a LIC-MSP-* serial.
Also populate audit rows for existing LIC-MSP-* entries.
"""
import sqlite3
import os

DB = os.path.join(os.path.dirname(__file__), 'instance', 'license_system.db')
if not os.path.exists(DB):
    raise SystemExit(f"Database not found: {DB}")

sqls = [
    # Audit table
    '''CREATE TABLE IF NOT EXISTS license_insert_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        serial_number TEXT,
        event TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        source TEXT,
        sql_text TEXT
    );''',

    # Trigger after insert
    '''CREATE TRIGGER IF NOT EXISTS trg_audit_license_activation_insert
    AFTER INSERT ON license_activation
    WHEN NEW.serial_number LIKE 'LIC-MSP-%'
    BEGIN
        INSERT INTO license_insert_audit (serial_number, event, created_at, source, sql_text)
        VALUES (NEW.serial_number, 'insert', datetime('now'), NULL, NULL);
    END;''',

    # Trigger after update if serial changed to LIC-MSP format
    '''CREATE TRIGGER IF NOT EXISTS trg_audit_license_activation_update
    AFTER UPDATE ON license_activation
    WHEN NEW.serial_number LIKE 'LIC-MSP-%' AND (OLD.serial_number IS NULL OR OLD.serial_number != NEW.serial_number)
    BEGIN
        INSERT INTO license_insert_audit (serial_number, event, created_at, source, sql_text)
        VALUES (NEW.serial_number, 'update', datetime('now'), NULL, NULL);
    END;''',
]

conn = sqlite3.connect(DB)
cur = conn.cursor()

for s in sqls:
    cur.execute(s)

# Log existing LIC-MSP rows that are not yet in audit table
cur.execute("SELECT serial_number FROM license_activation WHERE serial_number LIKE 'LIC-MSP-%'")
existing = [r[0] for r in cur.fetchall()]

new_count = 0
for sn in existing:
    cur.execute('SELECT 1 FROM license_insert_audit WHERE serial_number = ? LIMIT 1', (sn,))
    if not cur.fetchone():
        cur.execute("INSERT INTO license_insert_audit (serial_number, event, created_at, source) VALUES (?, 'existing', datetime('now'), 'backfill')", (sn,))
        new_count += 1

conn.commit()

# Print summary
cur.execute('SELECT COUNT(*) FROM license_insert_audit')
total = cur.fetchone()[0]
print(f'Created triggers and audit table in {DB}')
print(f'Existing LIC-MSP rows found: {len(existing)}; backfilled new audit rows: {new_count}')
print(f'Total audit rows: {total}')

# Optionally print recent audit rows
cur.execute("SELECT id, serial_number, event, created_at, source FROM license_insert_audit ORDER BY id DESC LIMIT 20")
rows = cur.fetchall()
if rows:
    print('\nRecent audit rows:')
    for r in rows:
        print(r)

conn.close()
