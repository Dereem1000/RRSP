"""
Database Initialization Module for Restaurant Management System
Handles database creation, migration, and schema management
"""

import os
import sqlite3
from datetime import datetime
from pathlib import Path

class RestaurantDatabaseInitializer:
    """Handles restaurant database initialization and management"""
    
    def __init__(self, db_path):
        self.db_path = db_path
        self.migrations_dir = os.path.join(os.path.dirname(db_path), 'migrations')
        os.makedirs(self.migrations_dir, exist_ok=True)
    
    def initialize_database(self):
        """Initialize the restaurant database with complete schema"""
        try:
            # Create database file
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Enable foreign key constraints
            cursor.execute("PRAGMA foreign_keys = ON")
            
            # Create all tables
            self._create_users_table(cursor)
            self._create_categories_table(cursor)
            self._create_menu_items_table(cursor)
            self._create_tables_table(cursor)
            self._create_orders_table(cursor)
            self._create_order_items_table(cursor)
            self._create_payments_table(cursor)
            self._create_company_registration_table(cursor)
            self._create_license_activation_table(cursor)
            self._create_database_config_table(cursor)
            self._create_inventory_table(cursor)
            self._create_suppliers_table(cursor)
            self._create_employees_table(cursor)
            self._create_shifts_table(cursor)
            self._create_reports_table(cursor)
            self._create_settings_table(cursor)
            
            # Create indexes for better performance
            self._create_indexes(cursor)
            
            # Insert default data
            self._insert_default_data(cursor)
            
            # Record migration
            self._record_migration(cursor, 'initial_schema')
            
            conn.commit()
            conn.close()
            
            return {
                'success': True,
                'message': f'Restaurant database initialized successfully at {self.db_path}',
                'tables_created': 17,
                'migration_recorded': True
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f'Database initialization failed: {str(e)}'
            }
    
    def _create_users_table(self, cursor):
        """Create users table"""
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username VARCHAR(80) UNIQUE NOT NULL,
                password_hash VARCHAR(120) NOT NULL,
                role VARCHAR(20) NOT NULL,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(120),
                phone VARCHAR(20),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT 1,
                last_login DATETIME,
                password_reset_token VARCHAR(100),
                password_reset_expires DATETIME
            )
        ''')
    
    def _create_categories_table(self, cursor):
        """Create categories table"""
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS category (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(50) NOT NULL,
                description TEXT,
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                sort_order INTEGER DEFAULT 0
            )
        ''')
    
    def _create_menu_items_table(self, cursor):
        """Create menu items table"""
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS menu_item (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                price FLOAT NOT NULL,
                category_id INTEGER NOT NULL,
                is_available BOOLEAN DEFAULT 1,
                preparation_time INTEGER,
                image_url VARCHAR(200),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                cost_price FLOAT DEFAULT 0,
                allergens TEXT,
                calories INTEGER,
                FOREIGN KEY (category_id) REFERENCES category (id)
            )
        ''')
    
    def _create_tables_table(self, cursor):
        """Create tables table"""
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS "table" (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                number INTEGER UNIQUE NOT NULL,
                capacity INTEGER NOT NULL,
                is_occupied BOOLEAN DEFAULT 0,
                qr_code_path VARCHAR(200),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                location VARCHAR(100),
                status VARCHAR(20) DEFAULT 'available'
            )
        ''')
    
    def _create_orders_table(self, cursor):
        """Create orders table"""
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS "order" (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                table_number INTEGER NOT NULL,
                waiter_id INTEGER,
                status VARCHAR(20) DEFAULT 'pending',
                total_amount FLOAT DEFAULT 0,
                tax_amount FLOAT DEFAULT 0,
                tip_amount FLOAT DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at DATETIME,
                notes TEXT,
                customer_name VARCHAR(100),
                customer_phone VARCHAR(20),
                FOREIGN KEY (waiter_id) REFERENCES user (id)
            )
        ''')
    
    def _create_order_items_table(self, cursor):
        """Create order items table"""
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS order_item (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL,
                menu_item_id INTEGER NOT NULL,
                quantity INTEGER NOT NULL,
                price FLOAT NOT NULL,
                status VARCHAR(20) DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                special_instructions TEXT,
                FOREIGN KEY (order_id) REFERENCES "order" (id),
                FOREIGN KEY (menu_item_id) REFERENCES menu_item (id)
            )
        ''')
    
    def _create_payments_table(self, cursor):
        """Create payments table"""
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS payment (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL,
                amount FLOAT NOT NULL,
                payment_method VARCHAR(20) NOT NULL,
                status VARCHAR(20) DEFAULT 'completed',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                transaction_id VARCHAR(100),
                card_last_four VARCHAR(4),
                FOREIGN KEY (order_id) REFERENCES "order" (id)
            )
        ''')
    
    def _create_company_registration_table(self, cursor):
        """Create company registration table"""
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS company_registration (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_name VARCHAR(200) NOT NULL,
                contact_person VARCHAR(100) NOT NULL,
                email VARCHAR(120) NOT NULL,
                phone VARCHAR(20),
                address TEXT,
                business_type VARCHAR(50),
                serial_number VARCHAR(50) UNIQUE NOT NULL,
                msp_client_id VARCHAR(50) UNIQUE,
                registration_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_verified BOOLEAN DEFAULT 0,
                registration_success_shown BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
    
    def _create_license_activation_table(self, cursor):
        """Create license activation table"""
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS license_activation (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                serial_number VARCHAR(50) UNIQUE NOT NULL,
                company_id INTEGER NOT NULL,
                license_type VARCHAR(50) NOT NULL,
                activation_date DATETIME NOT NULL,
                expiration_date DATETIME NOT NULL,
                is_active BOOLEAN DEFAULT 1,
                max_users INTEGER DEFAULT 5,
                features TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (company_id) REFERENCES company_registration (id)
            )
        ''')
    
    def _create_database_config_table(self, cursor):
        """Create database config table"""
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS database_config (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                config_name VARCHAR(100) NOT NULL,
                host VARCHAR(100),
                port INTEGER,
                username VARCHAR(100),
                password VARCHAR(100),
                database_name VARCHAR(100),
                is_remote BOOLEAN DEFAULT 0,
                license_key VARCHAR(100),
                remote_db_path VARCHAR(200),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
    
    def _create_inventory_table(self, cursor):
        """Create inventory table"""
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS inventory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_name VARCHAR(100) NOT NULL,
                category VARCHAR(50),
                current_stock INTEGER DEFAULT 0,
                minimum_stock INTEGER DEFAULT 0,
                unit_price FLOAT DEFAULT 0,
                supplier_id INTEGER,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (supplier_id) REFERENCES supplier (id)
            )
        ''')
    
    def _create_suppliers_table(self, cursor):
        """Create suppliers table"""
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS supplier (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(100) NOT NULL,
                contact_person VARCHAR(100),
                email VARCHAR(120),
                phone VARCHAR(20),
                address TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
    
    def _create_employees_table(self, cursor):
        """Create employees table"""
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS employee (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                employee_id VARCHAR(20) UNIQUE,
                hire_date DATE,
                position VARCHAR(50),
                hourly_rate FLOAT,
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES user (id)
            )
        ''')
    
    def _create_shifts_table(self, cursor):
        """Create shifts table"""
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS shift (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                employee_id INTEGER NOT NULL,
                shift_date DATE NOT NULL,
                start_time TIME NOT NULL,
                end_time TIME,
                hours_worked FLOAT DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (employee_id) REFERENCES employee (id)
            )
        ''')
    
    def _create_reports_table(self, cursor):
        """Create reports table"""
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS report (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                report_type VARCHAR(50) NOT NULL,
                report_name VARCHAR(100) NOT NULL,
                parameters TEXT,
                generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                file_path VARCHAR(200),
                created_by INTEGER,
                FOREIGN KEY (created_by) REFERENCES user (id)
            )
        ''')
    
    def _create_settings_table(self, cursor):
        """Create settings table"""
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS setting (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key VARCHAR(100) UNIQUE NOT NULL,
                value TEXT,
                description TEXT,
                category VARCHAR(50),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
    
    def _create_indexes(self, cursor):
        """Create database indexes for better performance"""
        indexes = [
            "CREATE INDEX IF NOT EXISTS idx_user_username ON user(username)",
            "CREATE INDEX IF NOT EXISTS idx_user_role ON user(role)",
            "CREATE INDEX IF NOT EXISTS idx_menu_item_category ON menu_item(category_id)",
            "CREATE INDEX IF NOT EXISTS idx_order_table ON \"order\"(table_number)",
            "CREATE INDEX IF NOT EXISTS idx_order_status ON \"order\"(status)",
            "CREATE INDEX IF NOT EXISTS idx_order_created ON \"order\"(created_at)",
            "CREATE INDEX IF NOT EXISTS idx_order_item_order ON order_item(order_id)",
            "CREATE INDEX IF NOT EXISTS idx_payment_order ON payment(order_id)",
            "CREATE INDEX IF NOT EXISTS idx_license_serial ON license_activation(serial_number)",
            "CREATE INDEX IF NOT EXISTS idx_inventory_supplier ON inventory(supplier_id)"
        ]
        
        for index_sql in indexes:
            cursor.execute(index_sql)
    
    def _insert_default_data(self, cursor):
        """Insert default data — schema only, no demo users/menu/tables.
        Admin user and restaurant data are created by the license registration flow.
        """
        # No demo data seeded. The restaurant configures their own data after registration.
        pass
    
    def _record_migration(self, cursor, migration_name):
        """Record migration in database"""
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS migrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                migration_name VARCHAR(100) UNIQUE NOT NULL,
                applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        cursor.execute('''
            INSERT OR IGNORE INTO migrations (migration_name)
            VALUES (?)
        ''', (migration_name,))
    
    def check_database_health(self):
        """Check database health and integrity"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Check foreign key constraints
            cursor.execute("PRAGMA foreign_key_check")
            fk_errors = cursor.fetchall()
            
            # Check table count
            cursor.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table'")
            table_count = cursor.fetchone()[0]
            
            # Check for required tables
            required_tables = ['user', 'category', 'menu_item', 'table', 'order', 'order_item']
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            existing_tables = [row[0] for row in cursor.fetchall()]
            
            missing_tables = [table for table in required_tables if table not in existing_tables]
            
            conn.close()
            
            return {
                'success': True,
                'table_count': table_count,
                'foreign_key_errors': len(fk_errors),
                'missing_tables': missing_tables,
                'is_healthy': len(fk_errors) == 0 and len(missing_tables) == 0
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f'Health check failed: {str(e)}'
            }

def initialize_restaurant_database(db_path):
    """Initialize restaurant database at the given path"""
    initializer = RestaurantDatabaseInitializer(db_path)
    return initializer.initialize_database()

def check_database_health(db_path):
    """Check database health"""
    initializer = RestaurantDatabaseInitializer(db_path)
    return initializer.check_database_health()

