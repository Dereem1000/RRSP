"""
Database migration script to add new fields to Payment table for manual cash register functionality.
Run this script to update existing database schema.
"""

import sqlite3
import os
from datetime import datetime

def fix_order_id_constraint(cursor):
    """Fix order_id column to allow NULL values (required for manual payments)"""
    try:
        # Check current order_id constraint
        cursor.execute("PRAGMA table_info(payment)")
        columns = cursor.fetchall()
        
        order_id_col = None
        for col in columns:
            if col[1] == 'order_id':
                order_id_col = col
                break
        
        if not order_id_col:
            print("⚠️ Could not find order_id column")
            return False
        
        # col[3] is the notnull flag (1 = NOT NULL, 0 = allows NULL)
        is_not_null = order_id_col[3] == 1
        
        if is_not_null:
            print("🔧 Fixing order_id constraint to allow NULL values...")
            
            # Get the original CREATE TABLE statement to preserve constraints
            cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='payment'")
            original_sql = cursor.fetchone()
            
            # Get all data first
            cursor.execute("SELECT * FROM payment")
            all_data = cursor.fetchall()
            
            # Get column names
            column_names = [col[1] for col in columns]
            
            # Get primary key info
            cursor.execute("PRAGMA table_info(payment)")
            pk_info = cursor.fetchall()
            primary_key_col = None
            for col in pk_info:
                if col[5] == 1:  # col[5] is pk flag
                    primary_key_col = col[1]
                    break
            
            # Build new table schema with nullable order_id
            column_defs = []
            for col in columns:
                col_name = col[1]
                col_type = col[2]
                not_null = col[3]
                
                # Make order_id nullable
                if col_name == 'order_id':
                    column_defs.append(f"{col_name} INTEGER")
                else:
                    # Keep other constraints as they were
                    null_part = "NOT NULL" if not_null else ""
                    col_def = f"{col_name} {col_type}"
                    if null_part:
                        col_def += f" {null_part}"
                    if primary_key_col and col_name == primary_key_col:
                        col_def += " PRIMARY KEY"
                    column_defs.append(col_def)
            
            # Add foreign key constraint for order_id if it exists in original SQL
            foreign_key_part = ""
            if original_sql and original_sql[0]:
                sql_str = original_sql[0].upper()
                if 'FOREIGN KEY' in sql_str or 'REFERENCES' in sql_str:
                    # Extract foreign key constraint from original SQL
                    # This is a simplified approach - we know order_id should reference order.id
                    foreign_key_part = ", FOREIGN KEY(order_id) REFERENCES \"order\"(id)"
            
            # Create backup table
            cursor.execute("CREATE TABLE payment_backup AS SELECT * FROM payment")
            print("✅ Created backup table")
            
            # Drop original table
            cursor.execute("DROP TABLE payment")
            print("✅ Dropped original table")
            
            # Recreate table with nullable order_id and preserved constraints
            create_sql = f"""CREATE TABLE payment (
                {', '.join(column_defs)}{foreign_key_part}
            )"""
            cursor.execute(create_sql)
            print("✅ Recreated table with nullable order_id")
            
            # Copy data back
            if all_data:
                placeholders = ','.join(['?'] * len(column_names))
                insert_sql = f"INSERT INTO payment ({','.join(column_names)}) VALUES ({placeholders})"
                cursor.executemany(insert_sql, all_data)
                print(f"✅ Restored {len(all_data)} records from backup")
            
            # Drop backup table
            cursor.execute("DROP TABLE payment_backup")
            print("✅ Cleaned up backup table")
            
            return True
        else:
            print("✅ order_id already allows NULL values")
            return False
            
    except Exception as e:
        print(f"⚠️ Warning: Could not fix order_id constraint: {e}")
        import traceback
        traceback.print_exc()
        return False

def migrate_payment_table():
    """Add new fields to Payment table for manual payments"""
    
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
        
        print("🔍 Checking current payment table structure...")
        
        # First, fix order_id constraint to allow NULL
        fix_order_id_constraint(cursor)
        
        # Check current table structure - SQLite is case-insensitive but use lowercase for consistency
        cursor.execute("PRAGMA table_info(payment)")
        columns = cursor.fetchall()
        column_names = [col[1] for col in columns]
        
        print(f"Current columns: {column_names}")
        
        # Fields to add - matching the Payment model exactly
        new_fields = [
            ('notes', 'TEXT'),
            ('customer_name', 'VARCHAR(100)'),
            ('is_manual', 'BOOLEAN DEFAULT 0')
        ]
        
        # Add new fields if they don't exist
        for field_name, field_type in new_fields:
            if field_name not in column_names:
                print(f"➕ Adding field: {field_name} ({field_type})")
                cursor.execute(f"ALTER TABLE payment ADD COLUMN {field_name} {field_type}")
            else:
                print(f"✅ Field already exists: {field_name}")
        
        # Update existing records to have is_manual = False (after adding the column)
        # Check if is_manual was just added or already existed
        cursor.execute("PRAGMA table_info(payment)")
        updated_columns = cursor.fetchall()
        updated_column_names = [col[1] for col in updated_columns]
        
        if 'is_manual' in updated_column_names:
            try:
                cursor.execute("UPDATE payment SET is_manual = 0 WHERE is_manual IS NULL")
                print("✅ Updated existing records to set is_manual = 0")
            except Exception as e:
                print(f"⚠️ Warning: Could not update is_manual: {e}")
        
        # Commit changes
        conn.commit()
        
        print("✅ Payment table migration completed successfully!")
        
        # Verify the new structure
        cursor.execute("PRAGMA table_info(payment)")
        columns = cursor.fetchall()
        print("\n📋 Updated Payment table structure:")
        for col in columns:
            not_null = "NOT NULL" if col[3] else "NULL"
            print(f"  - {col[1]} ({col[2]}) {not_null}")
        
        conn.close()
        return True
        
    except Exception as e:
        print(f"❌ Error during migration: {e}")
        if 'conn' in locals():
            conn.close()
        return False

def rollback_migration():
    """Rollback the migration by removing the new fields"""
    
    db_path = os.path.join(os.path.dirname(__file__), '..', 'restaurant.db')
    
    if not os.path.exists(db_path):
        print(f"❌ Database file not found at {db_path}")
        return False
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        print("🔄 Rolling back Payment table migration...")
        
        # Note: SQLite doesn't support DROP COLUMN in older versions
        # This is a simplified rollback that just clears the data
        cursor.execute("UPDATE payment SET notes = NULL, customer_name = NULL, is_manual = 0")
        
        conn.commit()
        conn.close()
        
        print("✅ Rollback completed (data cleared from new fields)")
        return True
        
    except Exception as e:
        print(f"❌ Error during rollback: {e}")
        if 'conn' in locals():
            conn.close()
        return False

if __name__ == "__main__":
    print("🚀 Payment Table Migration Tool")
    print("=" * 40)
    
    while True:
        print("\nOptions:")
        print("1. Run migration")
        print("2. Rollback migration")
        print("3. Exit")
        
        choice = input("\nEnter your choice (1-3): ").strip()
        
        if choice == "1":
            print("\n🔄 Starting migration...")
            if migrate_payment_table():
                print("\n🎉 Migration completed successfully!")
            else:
                print("\n💥 Migration failed!")
                
        elif choice == "2":
            print("\n🔄 Starting rollback...")
            if rollback_migration():
                print("\n✅ Rollback completed!")
            else:
                print("\n💥 Rollback failed!")
                
        elif choice == "3":
            print("👋 Goodbye!")
            break
            
        else:
            print("❌ Invalid choice. Please enter 1, 2, or 3.")

