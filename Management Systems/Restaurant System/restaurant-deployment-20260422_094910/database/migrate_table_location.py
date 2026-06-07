"""
Database migration script to add location field to Table model.
Run this script to update existing database schema.
"""

import sqlite3
import os
from datetime import datetime

def migrate_table_location():
    """Add location field to Table table"""
    
    # Database file path
    db_path = os.path.join(os.path.dirname(__file__), '..', 'restaurant.db')
    
    if not os.path.exists(db_path):
        print(f"❌ Database file not found at {db_path}")
        print("Please run the application first to create the database.")
        return False
    
    try:
        # Connect to database
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        print("🔍 Checking current Table structure...")
        
        # First, find the actual table name (SQLAlchemy may use different naming)
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%table%' OR name LIKE '%Table%')")
        tables = cursor.fetchall()
        
        if not tables:
            print("❌ Table not found in database!")
            conn.close()
            return False
        
        # Use the first matching table (usually lowercase 'table')
        table_name = tables[0][0]
        print(f"Found table: {table_name}")
        
        # Check current table structure - escape table name with quotes
        cursor.execute(f'PRAGMA table_info("{table_name}")')
        columns = cursor.fetchall()
        column_names = [col[1] for col in columns]
        
        print(f"Current columns: {column_names}")
        
        # Check if location column already exists
        if 'location' not in column_names:
            print("➕ Adding field: location (VARCHAR(100))")
            cursor.execute(f'ALTER TABLE "{table_name}" ADD COLUMN location VARCHAR(100)')
            print("✅ Location field added successfully!")
        else:
            print("✅ Field already exists: location")
        
        # Commit changes
        conn.commit()
        
        print("✅ Table migration completed successfully!")
        
        # Verify the new structure
        cursor.execute(f'PRAGMA table_info("{table_name}")')
        columns = cursor.fetchall()
        print("\n📋 Updated Table structure:")
        for col in columns:
            print(f"  - {col[1]} ({col[2]})")
        
        conn.close()
        return True
        
    except Exception as e:
        print(f"❌ Error during migration: {e}")
        if 'conn' in locals():
            conn.rollback()
            conn.close()
        return False

if __name__ == "__main__":
    print("🚀 Table Location Migration Tool")
    print("=" * 40)
    print("\n🔄 Starting migration...")
    
    if migrate_table_location():
        print("\n🎉 Migration completed successfully!")
        print("You can now use the 'location' field when creating or editing tables.")
    else:
        print("\n💥 Migration failed!")
        print("Please check the error messages above.")

