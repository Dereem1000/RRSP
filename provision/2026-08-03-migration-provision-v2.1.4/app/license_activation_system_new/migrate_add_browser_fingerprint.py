#!/usr/bin/env python3
"""
Database Migration Script: Add browser_fingerprint column to license_activation table
This script adds browser fingerprint binding support to prevent license reuse on different devices
"""

import sqlite3
import os
import sys
from pathlib import Path

def migrate_database(db_path):
    """Add browser_fingerprint column to license_activation table"""
    if not os.path.exists(db_path):
        print(f"❌ Database file not found: {db_path}")
        return False
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if column already exists
        cursor.execute("PRAGMA table_info(license_activation)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'browser_fingerprint' in columns:
            print(f"✅ Column 'browser_fingerprint' already exists in license_activation table")
            conn.close()
            return True
        
        # Add browser_fingerprint column
        print(f"🔧 Adding browser_fingerprint column to license_activation table...")
        cursor.execute("""
            ALTER TABLE license_activation 
            ADD COLUMN browser_fingerprint VARCHAR(255) NULL
        """)
        
        conn.commit()
        conn.close()
        
        print(f"✅ Successfully added browser_fingerprint column to license_activation table")
        return True
        
    except sqlite3.Error as e:
        print(f"❌ Database error: {e}")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False

if __name__ == '__main__':
    # Default database path
    script_dir = Path(__file__).parent
    default_db_path = script_dir / 'instance' / 'license_system.db'
    
    # Allow custom database path as argument
    if len(sys.argv) > 1:
        db_path = sys.argv[1]
    else:
        db_path = str(default_db_path)
    
    print(f"🔍 Migrating database: {db_path}")
    
    if migrate_database(db_path):
        print(f"✅ Migration completed successfully")
        sys.exit(0)
    else:
        print(f"❌ Migration failed")
        sys.exit(1)







