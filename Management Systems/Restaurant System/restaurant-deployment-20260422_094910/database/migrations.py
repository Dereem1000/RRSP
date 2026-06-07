"""
Database Migration System for Restaurant Management System
Handles database schema updates and version management
"""

import os
import sqlite3
import json
from datetime import datetime
from pathlib import Path

class DatabaseMigrator:
    """Handles database migrations and schema updates"""
    
    def __init__(self, db_path):
        self.db_path = db_path
        self.migrations_dir = os.path.join(os.path.dirname(db_path), 'migrations')
        os.makedirs(self.migrations_dir, exist_ok=True)
    
    def get_current_version(self):
        """Get current database version"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Check if migrations table exists
            cursor.execute("""
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name='migrations'
            """)
            
            if not cursor.fetchone():
                conn.close()
                return 0
            
            # Get latest migration
            cursor.execute("""
                SELECT migration_name FROM migrations 
                ORDER BY applied_at DESC LIMIT 1
            """)
            
            result = cursor.fetchone()
            conn.close()
            
            if result:
                # Extract version number from migration name
                migration_name = result[0]
                if migration_name.startswith('v'):
                    return int(migration_name.split('_')[0][1:])
                return 1
            
            return 0
            
        except Exception as e:
            print(f"Error getting current version: {e}")
            return 0
    
    def get_available_migrations(self):
        """Get list of available migrations"""
        migrations = []
        
        if not os.path.exists(self.migrations_dir):
            return migrations
        
        for file in os.listdir(self.migrations_dir):
            if file.endswith('.sql'):
                version = int(file.split('_')[0][1:])  # Extract version from v1_migration.sql
                migrations.append({
                    'version': version,
                    'file': file,
                    'path': os.path.join(self.migrations_dir, file)
                })
        
        return sorted(migrations, key=lambda x: x['version'])
    
    def apply_migration(self, migration_file):
        """Apply a specific migration"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Read migration file
            with open(migration_file, 'r') as f:
                migration_sql = f.read()
            
            # Execute migration
            cursor.executescript(migration_sql)
            
            # Record migration
            migration_name = os.path.basename(migration_file).replace('.sql', '')
            cursor.execute("""
                INSERT INTO migrations (migration_name, applied_at)
                VALUES (?, ?)
            """, (migration_name, datetime.now()))
            
            conn.commit()
            conn.close()
            
            return {
                'success': True,
                'message': f'Migration {migration_name} applied successfully'
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f'Migration failed: {str(e)}'
            }
    
    def migrate_to_latest(self):
        """Migrate database to latest version"""
        try:
            current_version = self.get_current_version()
            available_migrations = self.get_available_migrations()
            
            # Filter migrations that need to be applied
            pending_migrations = [
                m for m in available_migrations 
                if m['version'] > current_version
            ]
            
            if not pending_migrations:
                return {
                    'success': True,
                    'message': 'Database is already up to date',
                    'current_version': current_version
                }
            
            # Apply pending migrations
            applied_migrations = []
            for migration in pending_migrations:
                result = self.apply_migration(migration['path'])
                if result['success']:
                    applied_migrations.append(migration['version'])
                else:
                    return {
                        'success': False,
                        'error': f'Migration v{migration["version"]} failed: {result["error"]}',
                        'applied_migrations': applied_migrations
                    }
            
            return {
                'success': True,
                'message': f'Successfully applied {len(applied_migrations)} migrations',
                'applied_migrations': applied_migrations,
                'new_version': max(applied_migrations) if applied_migrations else current_version
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f'Migration process failed: {str(e)}'
            }
    
    def create_migration(self, version, description):
        """Create a new migration file"""
        try:
            migration_name = f"v{version}_{description.lower().replace(' ', '_')}.sql"
            migration_path = os.path.join(self.migrations_dir, migration_name)
            
            # Create migration template
            template = f"""-- Migration v{version}: {description}
-- Created: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

-- Add your SQL statements here
-- Example:
-- ALTER TABLE table_name ADD COLUMN new_column VARCHAR(100);
-- CREATE INDEX idx_name ON table_name(column_name);

-- Remember to test your migration before applying!
"""
            
            with open(migration_path, 'w') as f:
                f.write(template)
            
            return {
                'success': True,
                'message': f'Migration file created: {migration_name}',
                'path': migration_path
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f'Failed to create migration: {str(e)}'
            }
    
    def rollback_migration(self, version):
        """Rollback to a specific version"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Get migrations to rollback
            cursor.execute("""
                SELECT migration_name FROM migrations 
                WHERE CAST(SUBSTR(migration_name, 2, INSTR(migration_name, '_') - 2) AS INTEGER) > ?
                ORDER BY applied_at DESC
            """, (version,))
            
            migrations_to_rollback = cursor.fetchall()
            
            if not migrations_to_rollback:
                return {
                    'success': True,
                    'message': f'Already at version {version} or lower'
                }
            
            # Note: This is a simplified rollback - in production you'd need rollback scripts
            # For now, we'll just remove the migration records
            for migration in migrations_to_rollback:
                cursor.execute("""
                    DELETE FROM migrations WHERE migration_name = ?
                """, (migration[0],))
            
            conn.commit()
            conn.close()
            
            return {
                'success': True,
                'message': f'Rolled back to version {version}',
                'removed_migrations': len(migrations_to_rollback)
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f'Rollback failed: {str(e)}'
            }
    
    def get_migration_status(self):
        """Get current migration status"""
        try:
            current_version = self.get_current_version()
            available_migrations = self.get_available_migrations()
            latest_version = max([m['version'] for m in available_migrations]) if available_migrations else 0
            
            return {
                'success': True,
                'current_version': current_version,
                'latest_version': latest_version,
                'is_up_to_date': current_version >= latest_version,
                'pending_migrations': len([m for m in available_migrations if m['version'] > current_version]),
                'total_migrations': len(available_migrations)
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f'Failed to get migration status: {str(e)}'
            }

def migrate_database(db_path):
    """Migrate database to latest version"""
    migrator = DatabaseMigrator(db_path)
    return migrator.migrate_to_latest()

def get_migration_status(db_path):
    """Get migration status"""
    migrator = DatabaseMigrator(db_path)
    return migrator.get_migration_status()

