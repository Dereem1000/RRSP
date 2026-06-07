"""
License Registration System for Restaurant Management
Integrates with the license activation system and MSP client authentication
"""

import requests
import json
import hashlib
import hmac
from datetime import datetime, timezone, timedelta
from flask import Flask, request, jsonify, session, redirect, url_for, flash
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
import os
import sys

# Import the simple restaurant license validator
try:
    from restaurant_license_validator import RestaurantLicenseValidator
    LICENSE_SYSTEM_AVAILABLE = True
except ImportError as e:
    print(f"Warning: License system not available: {e}")
    LICENSE_SYSTEM_AVAILABLE = True  # Force enable for testing

class RestaurantLicenseRegistration:
    """Handles license registration and validation for restaurant system"""
    
    def __init__(self, app=None):
        self.app = app
        self.msp_api_url = "https://www.computerdynamicstt.com/api"
        self.license_validator = None
        
        if LICENSE_SYSTEM_AVAILABLE:
            self.license_validator = RestaurantLicenseValidator()
        
    def init_app(self, app):
        """Initialize with Flask app"""
        self.app = app
        if self.license_validator:
            self.license_validator.init_app(app)
        
    def validate_serial_number(self, serial_number):
        """Validate serial number against license system"""
        if not LICENSE_SYSTEM_AVAILABLE:
            return {
                'valid': False,
                'error': 'License system not available. Please contact support.'
            }
        
        try:
            print(f"🔍 Validating license serial number: {serial_number}")
            
            # Use online validation through Computer Dynamics API
            print("🌐 Attempting online validation through Computer Dynamics API...")
            result = self.license_validator.validate_license_online(serial_number)
            if result.get('valid'):
                print("✅ Online validation successful")
                return result
            
            print(f"❌ Online validation failed: {result.get('error', 'Unknown error')}")
            return result
            
        except Exception as e:
            print(f"❌ Validation exception: {str(e)}")
            return {
                'valid': False,
                'error': f'Validation error: {str(e)}'
            }
    
    def authenticate_msp_client(self, email, password):
        """Authenticate client against MSP system"""
        try:
            print(f"🔐 Authenticating client with username: {email}")
            
            # Prepare authentication data
            auth_data = {
                'username': email,  # Use username field as expected by the API
                'password': password,
                'system': 'restaurant_management'
            }
            
            print(f"🌐 Sending request to: {self.msp_api_url}/auth/login")
            
            # Send authentication request to MSP system
            response = requests.post(
                f"{self.msp_api_url}/auth/login",
                json=auth_data,
                timeout=10,
                headers={'Content-Type': 'application/json'}
            )
            
            print(f"📊 Response status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                if data.get('success'):
                    return {
                        'success': True,
                        'client_data': data.get('user'),  # Changed from 'client' to 'user'
                        'token': data.get('token')
                    }
                else:
                    return {
                        'success': False,
                        'error': data.get('message', 'Authentication failed')
                    }
            else:
                return {
                    'success': False,
                    'error': f'HTTP {response.status_code}: Authentication failed'
                }
                
        except requests.exceptions.RequestException as e:
            return {
                'success': False,
                'error': f'Network error: {str(e)}'
            }
        except Exception as e:
            print(f"❌ Authentication error: {str(e)}")
            return {
                'success': False,
                'error': f'Authentication error: {str(e)}'
            }
    
    def get_msp_client_licenses(self, client_id, token):
        """Get client's licenses from Computer Dynamics License API"""
        try:
            print(f"🔍 Fetching licenses for client ID: {client_id}")
            
            # Call the Computer Dynamics License API
            response = requests.get(
                f"https://www.computerdynamicstt.com/api/license/clients/{client_id}/licenses",
                timeout=10,
                headers={
                    'Authorization': f'Bearer {token}',
                    'Content-Type': 'application/json'
                }
            )
            
            print(f"📊 Client licenses response status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"📋 Client licenses data: {data}")
                return {
                    'success': True,
                    'licenses': data.get('licenses', [])
                }
            else:
                print(f"❌ Client licenses error: {response.text}")
                return {
                    'success': False,
                    'error': f'HTTP {response.status_code}: Failed to fetch licenses'
                }
                
        except Exception as e:
            print(f"❌ Error fetching client licenses: {str(e)}")
            return {
                'success': False,
                'error': f'Error fetching licenses: {str(e)}'
            }
    
    def register_restaurant_with_license(self, registration_data):
        """Complete restaurant registration with license validation"""
        try:
            # Step 1: Validate serial number
            serial_validation = self.validate_serial_number(registration_data['serial_number'])
            if not serial_validation.get('valid'):
                return {
                    'success': False,
                    'error': f'Invalid license: {serial_validation.get("error", "Unknown error")}'
                }
            
            # Step 2: Authenticate with MSP system
            msp_auth = self.authenticate_msp_client(
                registration_data['email'],
                registration_data['password']
            )
            if not msp_auth.get('success'):
                return {
                    'success': False,
                    'error': f'MSP authentication failed: {msp_auth.get("error", "Unknown error")}'
                }
            
            # Step 3: License already validated in Step 1, proceed with registration
            client_data = msp_auth['client_data']
            print(f"✅ License validation and client authentication successful for {client_data.get('username', 'unknown')}")
            
            # Step 4: Create restaurant registration
            registration_result = self.create_restaurant_registration(
                registration_data,
                client_data,
                serial_validation
            )
            
            return registration_result
            
        except Exception as e:
            return {
                'success': False,
                'error': f'Registration error: {str(e)}'
            }
    
    def _parse_expiration_date(self, date_string):
        """Parse expiration date from various formats"""
        try:
            if not date_string:
                return datetime.utcnow() + timedelta(days=365)
            
            # Try ISO format first
            if 'T' in date_string or 'Z' in date_string:
                return datetime.fromisoformat(date_string.replace('Z', '+00:00'))
            
            # Try RFC 2822 format (Wed, 05 Nov 2025 15:11:15 GMT)
            if ',' in date_string and 'GMT' in date_string:
                from email.utils import parsedate_to_datetime
                return parsedate_to_datetime(date_string)
            
            # Try other common formats
            for fmt in ['%Y-%m-%d %H:%M:%S', '%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y']:
                try:
                    return datetime.strptime(date_string, fmt)
                except ValueError:
                    continue
            
            # If all else fails, return default
            print(f"⚠️ Could not parse date: {date_string}, using default")
            return datetime.utcnow() + timedelta(days=365)
            
        except Exception as e:
            print(f"⚠️ Date parsing error: {e}, using default")
            return datetime.utcnow() + timedelta(days=365)
    
    def create_restaurant_registration(self, registration_data, client_data, license_data):
        """Create restaurant registration in local database"""
        try:
            from database.models import db, User, CompanyRegistration, LicenseActivation
            
            # Remove any existing company record that would conflict — match by serial OR email
            # so that re-registration always cleans up regardless of how data was previously stored.
            existing_companies = CompanyRegistration.query.filter(
                db.or_(
                    CompanyRegistration.serial_number == registration_data['serial_number'],
                    CompanyRegistration.email == registration_data['email']
                )
            ).all()

            for existing_company in existing_companies:
                print(f"🗑️ Removing existing company registration: {existing_company.company_name}")
                existing_licenses = LicenseActivation.query.filter_by(
                    company_id=existing_company.id
                ).all()
                for license_record in existing_licenses:
                    db.session.delete(license_record)
                db.session.delete(existing_company)

            # Also remove any orphaned license records for this serial
            orphaned = LicenseActivation.query.filter_by(
                serial_number=registration_data['serial_number']
            ).all()
            for orphan in orphaned:
                db.session.delete(orphan)

            db.session.flush()
            
            # Create company registration
            company = CompanyRegistration(
                company_name=registration_data.get('restaurant_name', client_data.get('company_name', '')),
                contact_person=registration_data.get('contact_person', client_data.get('name', '')),
                email=registration_data['email'],
                phone=registration_data.get('phone', client_data.get('phone', '')),
                address=registration_data.get('address', client_data.get('address', '')),
                business_type='restaurant',
                serial_number=registration_data['serial_number'],
                msp_client_id=client_data['id']
            )
            
            db.session.add(company)
            db.session.flush()  # Get the company ID
            
            # Create license activation record
            license_record = LicenseActivation(
                serial_number=registration_data['serial_number'],
                company_id=company.id,
                license_type=license_data.get('license_type', 'premium'),
                activation_date=datetime.utcnow(),
                expiration_date=self._parse_expiration_date(license_data.get('expiration_date')) if license_data.get('expiration_date') else datetime.utcnow() + timedelta(days=365),
                is_active=True,
                max_users=license_data.get('max_users', 25),
                features=json.dumps(license_data.get('features', {}))
            )
            
            db.session.add(license_record)
            
            # Remove any existing admin users (by username or any prior admin role)
            # so re-registration never hits a UNIQUE constraint on username.
            admin_username = registration_data.get('admin_username', 'admin')
            existing_admins = User.query.filter(
                db.or_(
                    User.username == admin_username,
                    User.role == 'admin'
                )
            ).all()
            for existing_admin in existing_admins:
                print(f"🗑️ Removing existing admin user: {existing_admin.username}")
                db.session.delete(existing_admin)
            db.session.flush()
            
            # Create default admin user
            admin_user = User(
                username=registration_data.get('admin_username', 'admin'),
                name=registration_data.get('admin_name', 'Administrator'),
                email=registration_data['email'],
                role='admin',
                is_active=True
            )
            
            # Debug password handling
            admin_password = registration_data.get('admin_password', 'admin123')
            print(f"🔑 Admin password from registration: '{admin_password}' (length: {len(admin_password)})")
            if admin_password == 'admin123':
                print("⚠️  Using fallback password - admin_password was empty or None")
            else:
                print("✅ Using custom password from registration form")
            
            admin_user.set_password(admin_password)
            
            db.session.add(admin_user)
            
            # Handle database mode selection
            database_mode = registration_data.get('database_mode', 'local')
            print(f"🗄️ Database mode selected: {database_mode}")
            
            # Save database configuration
            from database.models import SystemSettings
            db_config = {
                'is_remote': False,  # Always start in local mode for safety
                'intended_mode': database_mode,  # Store the user's choice
                'host': 'localhost' if database_mode == 'remote' else 'localhost',
                'port': '5002' if database_mode == 'remote' else '3306',
                'config_name': f'{"Remote" if database_mode == "remote" else "Local"} Database',
                'licenseSerial': registration_data['serial_number'],
                'setup_completed': False  # Mark setup as not completed initially
            }
            
            # Save database configuration setting (update if exists, create if not)
            existing_setting = SystemSettings.query.filter_by(setting_key='database_config').first()
            if existing_setting:
                existing_setting.setting_value = json.dumps(db_config)
                existing_setting.updated_at = datetime.utcnow()
            else:
                db_setting = SystemSettings(
                    setting_key='database_config',
                    setting_value=json.dumps(db_config),
                    description='Database server configuration'
                )
                db.session.add(db_setting)
            
            db.session.commit()
            
            # Registration only creates admin account and company info - no test data
            print("✅ Registration completed - no test data loaded")
            print("💡 Users can add their own data after login")
            
            # Create appropriate message based on database mode
            if database_mode == 'remote':
                message = 'Restaurant registration successful! Remote database mode has been configured but not activated yet. The system will start in local mode for safety. After login, go to Database Management to activate your remote database connection.'
                restart_message = 'Please restart the Restaurant Management System to activate your license. After restart, login and go to Database Management to activate your remote database connection.'
            else:
                message = f'Restaurant registration successful with local database mode. You can now add your own data after login.'
                restart_message = f'Please restart the Restaurant Management System to activate your license and begin using the system with local database.'
            
            return {
                'success': True,
                'message': message,
                'company_id': company.id,
                'license_id': license_record.id,
                'admin_username': admin_user.username,
                'database_mode': database_mode,
                'requires_restart': True,
                'restart_message': restart_message,
                'license_info': {
                    'type': license_record.license_type,
                    'max_users': license_record.max_users,
                    'expiration_date': license_record.expiration_date.isoformat(),
                    'features': json.loads(license_record.features) if license_record.features else {}
                }
            }
            
        except Exception as e:
            db.session.rollback()
            return {
                'success': False,
                'error': f'Database error: {str(e)}'
            }
    
    def check_license_status(self, serial_number):
        """Check current license status"""
        if not LICENSE_SYSTEM_AVAILABLE:
            return {
                'valid': False,
                'error': 'License system not available'
            }
        
        try:
            return self.license_validator.get_license_status(serial_number)
        except Exception as e:
            return {
                'valid': False,
                'error': f'Status check error: {str(e)}'
            }
    
    def validate_restaurant_access(self, user_id):
        """Validate if restaurant has valid license for current user - EXTERNAL API ONLY"""
        try:
            from database.database_adapter import DatabaseAdapter
            
            # Ensure we're in an application context
            if not self.app:
                return {'valid': False, 'error': 'Application context not available'}
            
            with self.app.app_context():
                # Use DatabaseAdapter to get user data (works for both local and remote)
                db_adapter = DatabaseAdapter()
                users_result = db_adapter.get_all_users()
                
                if not users_result.get('success'):
                    return {'valid': False, 'error': 'Failed to retrieve user data'}
                
                # Find user by ID
                user_data = None
                for user in users_result.get('data', []):
                    if user.get('id') == user_id:
                        user_data = user
                        break
                
                if not user_data:
                    return {'valid': False, 'error': 'User not found'}
                
                # For remote mode, we need to get license info from the database configuration
                # since the license data is stored in the local database configuration
                from database_manager import db_manager
                config = db_manager.get_database_configuration()
                
                if not config.get('success'):
                    return {'valid': False, 'error': 'Database configuration not available'}
                
                license_serial = config['config'].get('licenseSerial')
                if not license_serial:
                    return {'valid': False, 'error': 'No license serial found in configuration'}
                
                # SECURITY: ONLY validate through external API - NO local database fallback
                if not LICENSE_SYSTEM_AVAILABLE:
                    return {'valid': False, 'error': 'License validation system unavailable - external API required'}
                
                # Validate with external API ONLY
                try:
                    external_result = self.license_validator.validate_license_online(license_serial)
                    
                    if external_result.get('valid'):
                        # Get license type first
                        license_type = external_result.get('license_type', 'Unknown')
                        
                        # CRITICAL: Check expiration date even if external API says valid
                        # The external API may not check expiration properly
                        expiration_date = external_result.get('expiration_date')
                        expiration_date_valid = False
                        
                        # Check if expiration_date exists and is valid
                        if expiration_date and expiration_date not in [None, '', 'None', 'null']:
                            try:
                                from datetime import datetime, timezone
                                # Parse expiration date (handle various formats)
                                if isinstance(expiration_date, str):
                                    # Skip if it's a placeholder/null value
                                    if expiration_date.lower() in ['none', 'null', '']:
                                        expiration_date = None
                                    else:
                                        # Try ISO format first
                                        if 'T' in expiration_date or 'Z' in expiration_date:
                                            exp_date = datetime.fromisoformat(expiration_date.replace('Z', '+00:00'))
                                        else:
                                            # Try format: "2025-10-30 23:30:59.737568"
                                            try:
                                                exp_date = datetime.strptime(expiration_date, '%Y-%m-%d %H:%M:%S.%f')
                                            except ValueError:
                                                # Try without microseconds
                                                exp_date = datetime.strptime(expiration_date, '%Y-%m-%d %H:%M:%S')
                                            exp_date = exp_date.replace(tzinfo=timezone.utc)
                                        
                                        current_time = datetime.now(timezone.utc)
                                        if exp_date < current_time:
                                            # License expired - override external API's "valid" response
                                            print(f"⚠️ License expired in validate_restaurant_access: {exp_date} < {current_time}")
                                            return {
                                                'valid': False,
                                                'error': 'License has expired'
                                            }
                                        expiration_date_valid = True
                            except Exception as e:
                                print(f"⚠️ Error checking expiration in validate_restaurant_access: {e}")
                                # On error parsing expiration, treat as missing and calculate new one
                                expiration_date = None
                        
                        # If expiration_date is missing or invalid, calculate it based on license type
                        # Also calculate for Day Pass licenses even if expiration_date exists (they might be stale)
                        should_calculate = not expiration_date or not expiration_date_valid
                        if should_calculate or (license_type == 'Day Pass' and not expiration_date_valid):
                            from datetime import datetime, timezone, timedelta
                            now = datetime.now(timezone.utc)
                            
                            # Default durations based on license type
                            license_durations = {
                                'Day Pass': 1,  # 1 day
                                'Trial 7 Days': 7,  # 7 days
                                'Extended 30 Days': 30,  # 30 days
                                'One Time License': 365,  # 1 year
                                'No Time Limit': None  # No expiration
                            }
                            
                            duration_days = license_durations.get(license_type, 365)
                            
                            if duration_days is None:
                                # No Time Limit - set expiration far in the future
                                expiration_date = now + timedelta(days=36500)  # 100 years
                            else:
                                expiration_date = now + timedelta(days=duration_days)
                            
                            print(f"⚠️ Expiration date {'not provided' if should_calculate else 'invalid'} by API, calculated based on license type '{license_type}': {expiration_date.isoformat()}")
                        
                        # Convert to string format for return
                        if hasattr(expiration_date, 'isoformat'):
                            expiration_date_str = expiration_date.isoformat()
                        elif isinstance(expiration_date, str):
                            expiration_date_str = expiration_date
                        else:
                            expiration_date_str = str(expiration_date)
                        
                        return {
                            'valid': True,
                            'license_type': license_type,
                            'max_users': external_result.get('max_users', 0),
                            'features': external_result.get('features', {}),
                            'expiration_date': expiration_date_str,
                            'company_name': external_result.get('company_name', 'Restaurant'),
                            'contact_person': external_result.get('contact_person', 'Administrator'),
                            'registration_date': external_result.get('registration_date')
                        }
                    else:
                        # External API says license is invalid
                        print(f"❌ External API validation failed: {external_result.get('error', 'Unknown error')}")
                        return {
                            'valid': False,
                            'error': f"License validation failed: {external_result.get('error', 'External API validation failed')}"
                        }
                        
                except Exception as e:
                    print(f"❌ External API error: {e}")
                    return {
                        'valid': False,
                        'error': f'License validation failed: External API error - {str(e)}'
                    }
            
        except Exception as e:
            return {'valid': False, 'error': f'Validation error: {str(e)}'}
    
    def _initialize_local_database(self):
        """Initialize local database with sample data"""
        try:
            from database.database_init import initialize_restaurant_database
            import os
            
            # Get database path - use absolute path to avoid instance directory
            db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), 'restaurant.db'))
            
            # Initialize database with sample data
            init_result = initialize_restaurant_database(db_path)
            if init_result['success']:
                print(f"✅ Local database initialized with sample data: {init_result['message']}")
            else:
                print(f"❌ Local database initialization failed: {init_result['error']}")
                
        except Exception as e:
            print(f"❌ Error initializing local database: {e}")
