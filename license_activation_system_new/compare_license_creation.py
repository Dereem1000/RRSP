#!/usr/bin/env python3
"""
Compare how GUI vs manual script stores licenses.
Fetch the last 2 licenses (one from GUI, one from manual) and show all fields.
"""
import sqlite3
import os

DB = os.path.join(os.path.dirname(__file__), 'instance', 'license_system.db')
conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row  # Return rows as dicts
cur = conn.cursor()

# Get the last 2 license_activation rows
cur.execute('SELECT * FROM license_activation ORDER BY id DESC LIMIT 2')
rows = cur.fetchall()

print("=" * 100)
print("COMPARISON: GUI vs Manual Script License Creation")
print("=" * 100)

# Reverse to show oldest first (GUI sim), then newest (manual)
rows = list(reversed(rows))

for idx, row in enumerate(rows):
    method = "GUI Simulation" if idx == 0 else "Manual Script"
    print(f"\n[{method}] License ID {row['id']}:")
    print("-" * 100)
    
    # Print all columns
    for col in row.keys():
        val = row[col]
        if isinstance(val, str) and len(str(val)) > 60:
            val = str(val)[:60] + "..."
        print(f"  {col:30s} : {val}")

# Compare key differences
print("\n" + "=" * 100)
print("KEY DIFFERENCES:")
print("=" * 100)

if len(rows) == 2:
    gui_row = rows[0]
    manual_row = rows[1]
    
    fields_to_check = [
        'serial_number',
        'company_id',
        'license_type',
        'service_level',
        'activation_date',
        'expiration_date',
        'is_active',
        'max_users',
        'features',
        'browser_fingerprint',
        'last_online_check',
        'online_validation_key'
    ]
    
    differences = []
    for field in fields_to_check:
        gui_val = gui_row[field]
        manual_val = manual_row[field]
        if gui_val != manual_val:
            differences.append((field, gui_val, manual_val))
    
    if differences:
        print("\nFields that differ:")
        for field, gui_val, manual_val in differences:
            print(f"\n  {field}:")
            print(f"    GUI:    {gui_val}")
            print(f"    Manual: {manual_val}")
    else:
        print("\nNo differences in key fields!")

conn.close()
