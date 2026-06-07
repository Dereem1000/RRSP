"""
Database Manager for Restaurant Management System
Handles integration with the portable database server system.

This provides API-based remote database access, not true network database sharing.
The remote server maintains its own SQLite file and provides HTTP API access.
"""

import os
import json
import zipfile
import tempfile
import shutil
from datetime import datetime
from flask import Flask, request, jsonify, send_file, session
# Removed import - database server is standalone

class DatabaseManager:
    """Manages database operations and server integration"""
    
    def __init__(self, app=None):
        self.app = app
        # Path to the standalone database server system
        self.server_system_path = r"e:\database_server_system"
        
    def init_app(self, app):
        """Initialize with Flask app"""
        self.app = app
        
    def create_database_server_package(self):
        """Create a downloadable package of the API-based database server system"""
        try:
            # Get the current working directory (restaurant management system)
            current_dir = os.path.dirname(os.path.abspath(__file__))
            
            # Check if the executable exists
            exe_path = os.path.join(current_dir, 'DatabaseServerGUI.exe')
            if not os.path.exists(exe_path):
                return {
                    'success': False, 
                    'error': 'DatabaseServerGUI.exe not found. Please ensure the executable is in the restaurant management system directory.'
                }
            
            # Get file size
            exe_size = os.path.getsize(exe_path)
            
            return {
                'success': True,
                'message': 'Database server executable ready for download',
                'package_path': exe_path,
                'package_size': exe_size,
                'package_info': {
                    'name': 'Database Server GUI',
                    'version': '1.0.0',
                    'description': 'Standalone Database Server GUI Executable',
                    'created_at': datetime.now().isoformat(),
                    'file_type': 'executable',
                    'features': [
                        'Standalone executable - no Python required',
                        'System tray functionality',
                        'Console log integration', 
                        'Hidden console startup',
                        'Professional GUI interface'
                    ]
                }
            }
                
        except Exception as e:
            return {'success': False, 'error': f'Package creation failed: {str(e)}'}
    
    def _create_fallback_package(self):
        """Fallback package creation method if database server system is not available"""
        try:
            # Create temporary directory for package
            with tempfile.TemporaryDirectory() as temp_dir:
                package_dir = os.path.join(temp_dir, "restaurant_database_server")
                os.makedirs(package_dir, exist_ok=True)
                
                # Copy database server system files
                if os.path.exists(self.server_system_path):
                    for item in os.listdir(self.server_system_path):
                        source_path = os.path.join(self.server_system_path, item)
                        dest_path = os.path.join(package_dir, item)
                        
                        if os.path.isfile(source_path):
                            shutil.copy2(source_path, dest_path)
                        elif os.path.isdir(source_path):
                            shutil.copytree(source_path, dest_path)
                
                # Create package info
                package_info = {
                    'name': 'Restaurant Database Server',
                    'version': '1.0.0',
                    'description': 'Portable API-based SQLite Database Server for Restaurant Management',
                    'created_at': datetime.now().isoformat(),
                    'restaurant_system_version': '1.0.0',
                    'features': [
                        'SQLite database support',
                        'License key validation',
                        'API-based remote database access',
                        'SQLite file synchronization',
                        'Backup and restore',
                        'REST API interface'
                    ]
                }
                
                with open(os.path.join(package_dir, "package_info.json"), 'w') as f:
                    json.dump(package_info, f, indent=2)
                
                # Create installation instructions
                install_instructions = """
# Restaurant Database Server Installation

## Quick Start

1. Extract this package to your desired location
2. Run: python install.py
3. Start the server: python server_app.py
4. Access at: http://localhost:5001

## How It Works

This is an API-based database server, not true network database sharing:
- Restaurant system uses local SQLite database
- Remote server maintains its own SQLite database file
- Communication via HTTP API calls
- Data synchronization between SQLite files

## Configuration

1. Open the Restaurant Management System
2. Go to Settings > Database Configuration
3. Enter your license key
4. Switch to remote mode
5. Enter the server URL: http://YOUR-SERVER:5001

## API Documentation

Visit http://YOUR-SERVER:5001/api/status for full API documentation.

## Support

For support, contact your system administrator or check the README.md file.
"""
                
                with open(os.path.join(package_dir, "INSTALLATION.txt"), 'w') as f:
                    f.write(install_instructions)
                
                # Create ZIP package
                package_path = os.path.join(temp_dir, "restaurant_database_server.zip")
                with zipfile.ZipFile(package_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                    for root, dirs, files in os.walk(package_dir):
                        for file in files:
                            file_path = os.path.join(root, file)
                            arcname = os.path.relpath(file_path, package_dir)
                            zipf.write(file_path, arcname)
                
                return {
                    'success': True,
                    'message': 'Database server package created successfully (fallback method)',
                    'package_path': package_path,
                    'package_size': os.path.getsize(package_path)
                }
        except Exception as e:
            return {'success': False, 'error': f'Fallback package creation failed: {str(e)}'}
    
    def get_database_configuration(self):
        """Get current database configuration"""
        try:
            from database.models import db, SystemSettings
            from app import app
            
            with app.app_context():
                # Get database configuration
                db_config = SystemSettings.query.filter_by(setting_key='database_config').first()
                config_data = {}
                if db_config:
                    config_data = json.loads(db_config.setting_value)
                
                # Get license key
                license_config = SystemSettings.query.filter_by(setting_key='license_key').first()
                license_key = license_config.setting_value if license_config else None
                
                return {
                    'success': True,
                    'config': {
                        'is_remote': config_data.get('is_remote', False),
                        'host': config_data.get('host', 'localhost'),
                        'port': config_data.get('port', 5002),
                        'username': config_data.get('username', 'database_user'),
                        'database_name': config_data.get('database_name', 'restaurant_db'),
                        'config_name': config_data.get('config_name', 'Local Database'),
                        'remote_db_path': config_data.get('remote_db_path'),
                        'licenseSerial': config_data.get('licenseSerial'),
                        'license_key': config_data.get('license_key'),
                        'license_key_set': bool(license_key or config_data.get('licenseSerial')),
                        'setup_completed': config_data.get('setup_completed', False),
                        'intended_mode': config_data.get('intended_mode', 'local')
                    }
                }
        except Exception as e:
            return {'success': False, 'error': f'Failed to get configuration: {str(e)}'}
    
    def is_remote_mode(self):
        """Check if system is in remote database mode"""
        config = self.get_database_configuration()
        return config.get('success', False) and config.get('config', {}).get('is_remote', False)
    
    def get_remote_config(self):
        """Get remote database configuration"""
        config = self.get_database_configuration()
        if config.get('success', False) and config.get('config', {}).get('is_remote', False):
            return config.get('config', {})
        return None
    
    def save_database_configuration(self, config_data):
        """Save database configuration"""
        try:
            from database.models import db, SystemSettings
            from app import app
            
            with app.app_context():
                # Save database configuration with error handling for UNIQUE constraint
                try:
                    setting = SystemSettings.query.filter_by(setting_key='database_config').first()
                    if setting:
                        setting.setting_value = json.dumps(config_data)
                        setting.updated_at = datetime.utcnow()
                    else:
                        setting = SystemSettings(
                            setting_key='database_config',
                            setting_value=json.dumps(config_data),
                            description='Database server configuration'
                        )
                        db.session.add(setting)
                except Exception as e:
                    # If there's a UNIQUE constraint error, try to update instead
                    if 'UNIQUE constraint failed' in str(e):
                        print("⚠️ UNIQUE constraint error, attempting to update existing setting...")
                        db.session.rollback()
                        setting = SystemSettings.query.filter_by(setting_key='database_config').first()
                        if setting:
                            setting.setting_value = json.dumps(config_data)
                            setting.updated_at = datetime.utcnow()
                        else:
                            raise e
                    else:
                        raise e
                
                # Save license key if provided
                if config_data.get('license_key'):
                    license_setting = SystemSettings.query.filter_by(setting_key='license_key').first()
                    if license_setting:
                        license_setting.setting_value = config_data['license_key']
                        license_setting.updated_at = datetime.utcnow()
                    else:
                        license_setting = SystemSettings(
                            setting_key='license_key',
                            setting_value=config_data['license_key'],
                            description='License key for database access'
                        )
                        db.session.add(license_setting)
                
                db.session.commit()
                
                return {'success': True, 'message': 'Database configuration saved successfully'}
        except Exception as e:
            return {'success': False, 'error': f'Failed to save configuration: {str(e)}'}
    
    def test_database_connection(self, config_data=None):
        """Test database connection"""
        try:
            if config_data is None:
                config_data = self.get_database_configuration()['config']
            
            if config_data.get('is_remote'):
                # Test remote database connection with authentication
                import requests
                server_url = f"http://{config_data['host']}:{config_data['port']}"
                
                try:
                    # Add system identifier and license serial headers
                    license_serial = config_data.get('licenseSerial') or config_data.get('license_key', '')
                    headers = {
                        'X-System-ID': 'restaurant_management_system',
                        'X-License-Serial': license_serial,
                        'Content-Type': 'application/json'
                    }
                    
                    response = requests.get(f"{server_url}/api/test_connection", 
                                          headers=headers, timeout=5)
                    if response.status_code == 200:
                        return response.json()
                    elif response.status_code == 401:
                        return {'success': False, 'error': 'Authentication failed. Please check license serial and ensure database server is authenticated.'}
                    else:
                        return {'success': False, 'error': f'Server responded with status {response.status_code}'}
                except requests.exceptions.RequestException as e:
                    return {'success': False, 'error': f'Cannot connect to database server: {str(e)}'}
            else:
                # Test local database connection - ensure database exists
                from database.database_init import check_database_health
                # Use the main database path
                db_path = os.path.join(os.path.dirname(__file__), 'restaurant.db')
                
                # Check if database exists and is healthy
                health_check = check_database_health(db_path)
                if not health_check['success']:
                    # Database doesn't exist or is corrupted, create it
                    from database.database_init import initialize_restaurant_database
                    init_result = initialize_restaurant_database(db_path)
                    if not init_result['success']:
                        return {'success': False, 'error': f'Failed to initialize database: {init_result["error"]}'}
                
                return {
                    'success': True, 
                    'message': 'Local database connection is working',
                    'tables': health_check.get('table_count', 0),
                    'is_healthy': health_check.get('is_healthy', True)
                }
        except Exception as e:
            return {'success': False, 'error': f'Connection test failed: {str(e)}'}
    
    def switch_to_remote_database(self, config_data):
        """Switch to remote database configuration with proper validation"""
        try:
            # Get license key from either 'license_key' or 'licenseSerial' field
            license_key = config_data.get('license_key') or config_data.get('licenseSerial', '')
            if not license_key or len(license_key) < 8:
                return {'success': False, 'error': 'Invalid license key'}
            
            # Check if this is a forced switch (user confirmed data loss)
            force_switch = config_data.get('force_switch', False)
            
            # CRITICAL: Test remote connection BEFORE switching
            print("🔍 Testing remote database connection before switching...")
            connection_test = self.test_database_connection(config_data)
            if not connection_test['success']:
                return {
                    'success': False, 
                    'error': f'Cannot connect to remote database server: {connection_test["error"]}. Please ensure the remote database server is running and accessible.'
                }
            
            # Only check for data loss if not forcing the switch
            if not force_switch:
                # CRITICAL: Check if remote database has data
                print("🔍 Checking remote database content...")
                try:
                    import requests
                    remote_url = f"http://{config_data.get('host', 'localhost')}:{config_data.get('port', '5002')}"
                    
                    # Add required headers for authentication
                    headers = {
                        'X-System-ID': 'restaurant_management_system',
                        'X-License-Serial': license_key,
                        'Content-Type': 'application/json'
                    }
                    
                    # Test if remote database has any data
                    response = requests.get(f"{remote_url}/api/users", headers=headers, timeout=5)
                    if response.status_code == 200:
                        remote_data = response.json()
                        if remote_data.get('success') and len(remote_data.get('data', [])) > 0:
                            print("✅ Remote database has data - safe to switch")
                        else:
                            print("⚠️ Remote database is empty - will sync local data")
                            # Sync local users to remote database
                            sync_result = self._sync_users_to_remote_database(config_data, license_key)
                            if not sync_result['success']:
                                return {
                                    'success': False,
                                    'error': f'Failed to sync users to remote database: {sync_result["error"]}'
                                }
                            print("✅ Users synced to remote database")
                    elif response.status_code == 401:
                        print("⚠️ Authentication failed - cannot verify remote database content")
                        return {
                            'success': False,
                            'error': 'Authentication failed. Please check license serial and ensure database server is authenticated.',
                            'requires_confirmation': True
                        }
                    else:
                        print("⚠️ Could not verify remote database content")
                        return {
                            'success': False,
                            'error': f'Could not verify remote database content (Status: {response.status_code}). Please ensure the remote database server is properly configured.',
                            'requires_confirmation': True
                        }
                except Exception as e:
                    print(f"⚠️ Error checking remote database: {e}")
                    return {
                        'success': False,
                        'error': f'Error checking remote database: {str(e)}. Please ensure the remote database server is running.',
                        'requires_confirmation': True
                    }
            else:
                print("⚠️ Force switch enabled - bypassing data loss check")
            
            # Mark setup as completed and save configuration
            config_data['setup_completed'] = True
            print("💾 Saving remote database configuration...")
            result = self.save_database_configuration(config_data)
            if result['success']:
                return {
                    'success': True, 
                    'message': 'Successfully switched to remote database. All operations will now use the remote database server.',
                    'warning': 'Make sure to keep the remote database server running for the system to work properly.'
                }
            else:
                return result
        except Exception as e:
            return {'success': False, 'error': f'Switch to remote failed: {str(e)}'}
    
    def switch_to_local_database(self):
        """Switch to local database configuration with data validation"""
        try:
            # Check if we're currently in remote mode and have data
            current_config = self.get_database_configuration()
            if current_config['success'] and current_config['config'].get('is_remote', False):
                print("⚠️ Switching from remote to local mode - data will be lost!")
                print("💡 Consider backing up your remote data first")
            
            config_data = {
                'is_remote': False,
                'host': 'localhost',
                'port': 5001,
                'username': 'database_user',
                'password': 'password',
                'database_name': 'restaurant_db',
                'config_name': 'Local Database',
                'remote_db_path': None
            }
            
            # Test local database connection
            print("🔍 Testing local database connection...")
            connection_test = self.test_database_connection(config_data)
            if not connection_test['success']:
                return {
                    'success': False,
                    'error': f'Cannot connect to local database: {connection_test["error"]}. Please ensure the local database is properly initialized.'
                }
            
            result = self.save_database_configuration(config_data)
            if result['success']:
                return {
                    'success': True, 
                    'message': 'Successfully switched to local database. All operations will now use the local SQLite database.',
                    'warning': 'Local database may be empty. You may need to add sample data or restore from backup.'
                }
            else:
                return result
        except Exception as e:
            return {'success': False, 'error': f'Switch to local failed: {str(e)}'}
    
    def _sync_users_to_remote_database(self, config_data, license_key):
        """Sync users from local database to remote database"""
        try:
            from database.models import User, db
            from app import app
            
            with app.app_context():
                # Get all users from local database
                local_users = User.query.all()
                if not local_users:
                    return {'success': False, 'error': 'No users found in local database'}
                
                # Prepare remote database connection
                remote_url = f"http://{config_data.get('host', 'localhost')}:{config_data.get('port', '5002')}"
                headers = {
                    'X-System-ID': 'restaurant_management_system',
                    'X-License-Serial': license_key,
                    'Content-Type': 'application/json'
                }
                
                # Sync each user to remote database
                for user in local_users:
                    user_data = {
                        'username': user.username,
                        'name': user.name,
                        'email': user.email,
                        'role': user.role,
                        'is_active': user.is_active,
                        'password_hash': user.password_hash  # Include password hash for authentication
                    }
                    
                    # Create user in remote database
                    import requests
                    response = requests.post(
                        f"{remote_url}/api/users",
                        json=user_data,
                        headers=headers,
                        timeout=10
                    )
                    
                    if response.status_code not in [200, 201, 409]:  # 409 = user already exists
                        print(f"⚠️ Failed to sync user {user.username}: {response.status_code}")
                        return {
                            'success': False,
                            'error': f'Failed to sync user {user.username} to remote database'
                        }
                    elif response.status_code == 409:
                        print(f"ℹ️ User {user.username} already exists in remote database - skipping")
                
                print(f"✅ Successfully synced {len(local_users)} users to remote database")
                return {'success': True, 'message': f'Synced {len(local_users)} users to remote database'}
                
        except Exception as e:
            return {'success': False, 'error': f'User sync failed: {str(e)}'}
    
# Global instance
db_manager = DatabaseManager()
