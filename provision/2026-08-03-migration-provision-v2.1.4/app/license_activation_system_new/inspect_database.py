#!/usr/bin/env python3
"""
Inspect the license database to see what licenses are available
"""

import sqlite3
import os

def inspect_database(db_path):
    """Inspect the database to see what's in it"""
    if not os.path.exists(db_path):
        print(f"❌ Database file not found: {db_path}")
        return
    
    print(f"🔍 Inspecting database: {db_path}")
    print("=" * 60)
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Get all table names
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        print(f"📋 Tables in database: {[table[0] for table in tables]}")
        
        # Check if license_activation table exists
        if ('license_activation',) in tables:
            print("\n🔍 License Activation Table:")
            print("-" * 40)
            
            # Get table schema
            cursor.execute("PRAGMA table_info(license_activation);")
            columns = cursor.fetchall()
            print("Columns:")
            for col in columns:
                print(f"  - {col[1]} ({col[2]})")
            
            # Get all licenses
            cursor.execute("SELECT * FROM license_activation;")
            licenses = cursor.fetchall()
            print(f"\n📊 Found {len(licenses)} licenses:")
            
            for i, license in enumerate(licenses):
                print(f"\nLicense {i+1}:")
                for j, col in enumerate(columns):
                    if j < len(license):
                        print(f"  {col[1]}: {license[j]}")
        
        else:
            print("❌ No license_activation table found")
            
            # Check for other license-related tables
            license_tables = [table for table in tables if 'license' in table[0].lower()]
            if license_tables:
                print(f"🔍 Found license-related tables: {[t[0] for t in license_tables]}")
                
                for table_name in license_tables:
                    print(f"\n📋 Table: {table_name}")
                    cursor.execute(f"SELECT COUNT(*) FROM {table_name};")
                    count = cursor.fetchone()[0]
                    print(f"  Records: {count}")
                    
                    if count > 0:
                        cursor.execute(f"SELECT * FROM {table_name} LIMIT 3;")
                        sample = cursor.fetchall()
                        print(f"  Sample data: {sample}")
        
        conn.close()
        
    except Exception as e:
        print(f"❌ Error inspecting database: {e}")

if __name__ == "__main__":
    # Check different possible database locations
    possible_dbs = [
        "../instance/license_activation.db",
        "../instance/license_system.db", 
        "database.sqlite",
        "../database.sqlite"
    ]
    
    for db_path in possible_dbs:
        if os.path.exists(db_path):
            inspect_database(db_path)
            print("\n" + "="*80 + "\n")
