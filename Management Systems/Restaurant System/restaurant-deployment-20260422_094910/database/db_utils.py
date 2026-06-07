"""
Database Utilities for Restaurant Management System
Common database operations and helper functions
"""

import os
import sqlite3
import json
import shutil
from datetime import datetime
from pathlib import Path

class DatabaseUtils:
    """Utility functions for database operations"""
    
    def __init__(self, db_path):
        self.db_path = db_path
    
    def backup_database(self, backup_path=None):
        """Create a backup of the database"""
        try:
            if backup_path is None:
                backup_dir = os.path.join(os.path.dirname(self.db_path), 'backups')
                os.makedirs(backup_dir, exist_ok=True)
                timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                backup_path = os.path.join(backup_dir, f'restaurant_backup_{timestamp}.db')
            
            # Create backup
            shutil.copy2(self.db_path, backup_path)
            
            return {
                'success': True,
                'message': 'Database backup created successfully',
                'backup_path': backup_path,
                'backup_size': os.path.getsize(backup_path)
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f'Backup failed: {str(e)}'
            }
    
    def restore_database(self, backup_path):
        """Restore database from backup"""
        try:
            if not os.path.exists(backup_path):
                return {
                    'success': False,
                    'error': 'Backup file not found'
                }
            
            # Create backup of current database before restore
            current_backup = self.backup_database()
            
            # Restore from backup
            shutil.copy2(backup_path, self.db_path)
            
            return {
                'success': True,
                'message': 'Database restored successfully',
                'restored_from': backup_path,
                'current_backup': current_backup.get('backup_path')
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f'Restore failed: {str(e)}'
            }
    
    def get_database_info(self):
        """Get database information and statistics"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Get table information
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [row[0] for row in cursor.fetchall()]
            
            # Get database size
            db_size = os.path.getsize(self.db_path)
            
            # Get table row counts
            table_counts = {}
            for table in tables:
                try:
                    cursor.execute(f"SELECT COUNT(*) FROM {table}")
                    table_counts[table] = cursor.fetchone()[0]
                except:
                    table_counts[table] = 0
            
            # Get database version
            cursor.execute("PRAGMA user_version")
            user_version = cursor.fetchone()[0]
            
            conn.close()
            
            return {
                'success': True,
                'database_path': self.db_path,
                'database_size': db_size,
                'database_size_mb': round(db_size / (1024 * 1024), 2),
                'table_count': len(tables),
                'tables': tables,
                'table_counts': table_counts,
                'user_version': user_version,
                'last_modified': datetime.fromtimestamp(os.path.getmtime(self.db_path))
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f'Failed to get database info: {str(e)}'
            }
    
    def optimize_database(self):
        """Optimize database performance"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Run VACUUM to reclaim space
            cursor.execute("VACUUM")
            
            # Analyze tables for better query planning
            cursor.execute("ANALYZE")
            
            # Get optimization results
            cursor.execute("PRAGMA page_count")
            page_count = cursor.fetchone()[0]
            
            cursor.execute("PRAGMA page_size")
            page_size = cursor.fetchone()[0]
            
            conn.close()
            
            return {
                'success': True,
                'message': 'Database optimized successfully',
                'total_pages': page_count,
                'page_size': page_size,
                'optimized_size': page_count * page_size
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f'Optimization failed: {str(e)}'
            }
    
    def export_data(self, table_name, export_path=None):
        """Export table data to JSON"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Get table data
            cursor.execute(f"SELECT * FROM {table_name}")
            rows = cursor.fetchall()
            
            # Get column names
            cursor.execute(f"PRAGMA table_info({table_name})")
            columns = [row[1] for row in cursor.fetchall()]
            
            # Convert to list of dictionaries
            data = []
            for row in rows:
                data.append(dict(zip(columns, row)))
            
            # Export to JSON
            if export_path is None:
                export_dir = os.path.join(os.path.dirname(self.db_path), 'exports')
                os.makedirs(export_dir, exist_ok=True)
                timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                export_path = os.path.join(export_dir, f'{table_name}_export_{timestamp}.json')
            
            with open(export_path, 'w') as f:
                json.dump(data, f, indent=2, default=str)
            
            conn.close()
            
            return {
                'success': True,
                'message': f'Data exported successfully',
                'export_path': export_path,
                'record_count': len(data)
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f'Export failed: {str(e)}'
            }
    
    def import_data(self, table_name, data_file):
        """Import data from JSON file"""
        try:
            if not os.path.exists(data_file):
                return {
                    'success': False,
                    'error': 'Data file not found'
                }
            
            # Load data
            with open(data_file, 'r') as f:
                data = json.load(f)
            
            if not data:
                return {
                    'success': False,
                    'error': 'No data to import'
                }
            
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Get table columns
            cursor.execute(f"PRAGMA table_info({table_name})")
            columns = [row[1] for row in cursor.fetchall()]
            
            # Insert data
            inserted_count = 0
            for record in data:
                # Filter record to only include existing columns
                filtered_record = {k: v for k, v in record.items() if k in columns}
                
                if filtered_record:
                    columns_str = ', '.join(filtered_record.keys())
                    placeholders = ', '.join(['?' for _ in filtered_record])
                    values = list(filtered_record.values())
                    
                    cursor.execute(f"""
                        INSERT OR REPLACE INTO {table_name} ({columns_str})
                        VALUES ({placeholders})
                    """, values)
                    inserted_count += 1
            
            conn.commit()
            conn.close()
            
            return {
                'success': True,
                'message': f'Data imported successfully',
                'imported_records': inserted_count
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f'Import failed: {str(e)}'
            }
    
    def clean_old_data(self, days=30):
        """Clean old data (older than specified days)"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Define tables and date columns to clean
            tables_to_clean = [
                ('order', 'created_at'),
                ('payment', 'created_at'),
                ('shift', 'created_at')
            ]
            
            cutoff_date = datetime.now().strftime('%Y-%m-%d')
            cleaned_records = 0
            
            for table, date_column in tables_to_clean:
                try:
                    cursor.execute(f"""
                        DELETE FROM {table} 
                        WHERE DATE({date_column}) < DATE('{cutoff_date}', '-{days} days')
                    """)
                    cleaned_records += cursor.rowcount
                except:
                    # Table or column might not exist
                    pass
            
            conn.commit()
            conn.close()
            
            return {
                'success': True,
                'message': f'Cleaned {cleaned_records} old records',
                'cleaned_records': cleaned_records
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f'Data cleaning failed: {str(e)}'
            }
    
    def get_database_health(self):
        """Get comprehensive database health information"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Check foreign key constraints
            cursor.execute("PRAGMA foreign_key_check")
            fk_errors = cursor.fetchall()
            
            # Check integrity
            cursor.execute("PRAGMA integrity_check")
            integrity_result = cursor.fetchone()[0]
            
            # Get database statistics
            cursor.execute("PRAGMA page_count")
            page_count = cursor.fetchone()[0]
            
            cursor.execute("PRAGMA page_size")
            page_size = cursor.fetchone()[0]
            
            # Check for missing indexes
            cursor.execute("""
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name NOT LIKE 'sqlite_%'
            """)
            tables = [row[0] for row in cursor.fetchall()]
            
            missing_indexes = []
            for table in tables:
                cursor.execute(f"PRAGMA table_info({table})")
                columns = [row[1] for row in cursor.fetchall()]
                
                # Check if table has primary key
                cursor.execute(f"PRAGMA table_info({table})")
                has_pk = any(row[5] for row in cursor.fetchall())
                
                if not has_pk:
                    missing_indexes.append(f"{table} (no primary key)")
            
            conn.close()
            
            return {
                'success': True,
                'is_healthy': integrity_result == 'ok' and len(fk_errors) == 0,
                'integrity_check': integrity_result,
                'foreign_key_errors': len(fk_errors),
                'database_size': page_count * page_size,
                'missing_indexes': missing_indexes,
                'recommendations': self._get_health_recommendations(fk_errors, missing_indexes)
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f'Health check failed: {str(e)}'
            }
    
    def _get_health_recommendations(self, fk_errors, missing_indexes):
        """Get health recommendations based on issues found"""
        recommendations = []
        
        if fk_errors:
            recommendations.append("Fix foreign key constraint violations")
        
        if missing_indexes:
            recommendations.append("Add primary keys to tables without them")
        
        if not recommendations:
            recommendations.append("Database is healthy - no issues found")
        
        return recommendations

def backup_database(db_path, backup_path=None):
    """Create database backup"""
    utils = DatabaseUtils(db_path)
    return utils.backup_database(backup_path)

def get_database_info(db_path):
    """Get database information"""
    utils = DatabaseUtils(db_path)
    return utils.get_database_info()

def optimize_database(db_path):
    """Optimize database"""
    utils = DatabaseUtils(db_path)
    return utils.optimize_database()

