#!/usr/bin/env python3
"""
Migration script to create refund_request table
"""
import sqlite3
import os
from datetime import datetime

def migrate_refund_request_table():
    """Create refund_request table if it doesn't exist"""
    # Get database path
    script_dir = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.join(script_dir, '..', 'restaurant.db')
    
    if not os.path.exists(db_path):
        print(f"❌ Database not found at {db_path}")
        return False
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        print("🔍 Checking refund_request table...")
        
        # Check if table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='refund_request'")
        table_exists = cursor.fetchone()
        
        if table_exists:
            print("✅ refund_request table already exists")
            
            # Check if all columns exist
            cursor.execute("PRAGMA table_info(refund_request)")
            columns = [col[1] for col in cursor.fetchall()]
            
            required_columns = [
                'id', 'payment_id', 'order_id', 'amount', 'requested_by', 
                'reason', 'status', 'approved_by', 'approved_at', 
                'rejection_reason', 'created_at', 'processed_at'
            ]
            
            missing_columns = [col for col in required_columns if col not in columns]
            
            if missing_columns:
                print(f"⚠️ Missing columns: {missing_columns}")
                print("🔄 Attempting to add missing columns...")
                
                # Add missing columns
                for col in missing_columns:
                    if col == 'id':
                        continue
                    elif col == 'created_at':
                        cursor.execute("ALTER TABLE refund_request ADD COLUMN created_at DATETIME")
                    elif col == 'processed_at':
                        cursor.execute("ALTER TABLE refund_request ADD COLUMN processed_at DATETIME")
                    elif col == 'approved_at':
                        cursor.execute("ALTER TABLE refund_request ADD COLUMN approved_at DATETIME")
                    elif col == 'reason':
                        cursor.execute("ALTER TABLE refund_request ADD COLUMN reason TEXT")
                    elif col == 'rejection_reason':
                        cursor.execute("ALTER TABLE refund_request ADD COLUMN rejection_reason TEXT")
                    elif col == 'status':
                        cursor.execute("ALTER TABLE refund_request ADD COLUMN status VARCHAR(20) DEFAULT 'pending'")
                    elif col == 'approved_by':
                        cursor.execute("ALTER TABLE refund_request ADD COLUMN approved_by INTEGER")
                    elif col == 'amount':
                        cursor.execute("ALTER TABLE refund_request ADD COLUMN amount REAL NOT NULL")
                    elif col == 'requested_by':
                        cursor.execute("ALTER TABLE refund_request ADD COLUMN requested_by INTEGER NOT NULL")
                    elif col == 'order_id':
                        cursor.execute("ALTER TABLE refund_request ADD COLUMN order_id INTEGER")
                    elif col == 'payment_id':
                        cursor.execute("ALTER TABLE refund_request ADD COLUMN payment_id INTEGER NOT NULL")
                
                conn.commit()
                print("✅ Missing columns added")
            else:
                print("✅ All required columns exist")
            
            conn.close()
            return True
        else:
            print("➕ Creating refund_request table...")
            
            # Create the table
            cursor.execute("""
                CREATE TABLE refund_request (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    payment_id INTEGER NOT NULL,
                    order_id INTEGER,
                    amount REAL NOT NULL,
                    requested_by INTEGER NOT NULL,
                    reason TEXT,
                    status VARCHAR(20) DEFAULT 'pending',
                    approved_by INTEGER,
                    approved_at DATETIME,
                    rejection_reason TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    processed_at DATETIME,
                    FOREIGN KEY (payment_id) REFERENCES payment(id),
                    FOREIGN KEY (order_id) REFERENCES "order"(id),
                    FOREIGN KEY (requested_by) REFERENCES user(id),
                    FOREIGN KEY (approved_by) REFERENCES user(id)
                )
            """)
            
            # Create indexes
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_refund_request_payment ON refund_request(payment_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_refund_request_order ON refund_request(order_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_refund_request_status ON refund_request(status)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_refund_request_requested_by ON refund_request(requested_by)")
            
            conn.commit()
            conn.close()
            
            print("✅ refund_request table created successfully")
            return True
            
    except Exception as e:
        print(f"❌ Error migrating refund_request table: {e}")
        import traceback
        traceback.print_exc()
        if 'conn' in locals():
            conn.close()
        return False

if __name__ == '__main__':
    print("🚀 Starting refund_request table migration...")
    success = migrate_refund_request_table()
    if success:
        print("✅ Migration completed successfully")
    else:
        print("❌ Migration failed")
        exit(1)



