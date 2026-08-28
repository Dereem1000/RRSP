"""
Internet-based License Validation System
Handles online license validation, offline validation, and license server communication
"""

import requests
import json
import hashlib
import hmac
from datetime import datetime, timezone, timedelta
from cryptography.fernet import Fernet
import jwt
import os
from models import db, LicenseActivation, LicenseValidationLog, SystemConfiguration

class LicenseValidator:
    def __init__(self, app=None):
        self.app = app
        # Computer Dynamics License API Server
        # This points to the local license API server that connects to the license management system
        self.validation_server_url = "http://localhost:5001/api/license/validate"  # Local Computer Dynamics License API
        self.secret_key = os.environ.get('LICENSE_SECRET_KEY', 'your-secret-key-here')
        self.encryption_key = os.environ.get('LICENSE_ENCRYPTION_KEY', Fernet.generate_key())
        self.fernet = Fernet(self.encryption_key)
        
    def init_app(self, app):
        self.app = app
        
    def generate_validation_token(self, license_data):
        """Generate a secure validation token for the license"""
        payload = {
            'serial_number': license_data['serial_number'],
            'company_id': license_data['company_id'],
            'license_type': license_data['license_type'],
            'expiration_date': license_data['expiration_date'].isoformat() if hasattr(license_data['expiration_date'], 'isoformat') else str(license_data['expiration_date']),
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
        
        token = jwt.encode(payload, self.secret_key, algorithm='HS256')
        return token
    
    def validate_license_online(self, serial_number, system_info=None):
        """Validate license against online server"""
        try:
            # Get license from database
            if self.app:
                with self.app.app_context():
                    try:
                        license = LicenseActivation.query.filter_by(serial_number=serial_number).first()
                    except Exception as e:
                        if 'service_level' in str(e):
                            # Database doesn't have service_level column, use raw SQL
                            from sqlalchemy import text
                            result = db.session.execute(text("SELECT * FROM license_activation WHERE serial_number = :serial"), {'serial': serial_number}).fetchone()
                            if result:
                                # Create a mock license object with the result
                                class MockLicense:
                                    def __init__(self, row):
                                        self.id = row[0]
                                        self.serial_number = row[1]
                                        self.company_id = row[2]
                                        self.license_type = row[3]
                                        self.service_level = None  # Not available in old schema
                                        self.activation_date = row[4] if len(row) > 4 else None
                                        self.expiration_date = row[5] if len(row) > 5 else None
                                        self.is_active = row[6] if len(row) > 6 else True
                                        self.max_users = row[7] if len(row) > 7 else 5
                                        self.features = row[8] if len(row) > 8 else '{}'
                                        self.created_at = row[9] if len(row) > 9 else None
                                        self.updated_at = row[10] if len(row) > 10 else None
                                        self.last_online_check = row[11] if len(row) > 11 else None
                                        self.online_validation_key = row[12] if len(row) > 12 else None
                                        self.validation_server_url = row[13] if len(row) > 13 else None
                                license = MockLicense(result)
                            else:
                                license = None
                        else:
                            raise e
            else:
                license = LicenseActivation.query.filter_by(serial_number=serial_number).first()
            
            if not license:
                return {'valid': False, 'error': 'License not found in local database'}
            
            # Prepare validation data
            validation_data = {
                'serial_number': serial_number,
                'company_id': license.company_id,
                'license_type': license.license_type,
                'expiration_date': license.expiration_date.isoformat() if hasattr(license.expiration_date, 'isoformat') else str(license.expiration_date),
                'system_info': system_info or {},
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'client_version': '1.0.0',
                'system_type': 'restaurant_management'
            }
            
            # Generate validation token
            token = self.generate_validation_token(validation_data)
            
            # Send request to validation server
            headers = {
                'Authorization': f'Bearer {token}',
                'Content-Type': 'application/json',
                'User-Agent': 'Restaurant-Management-System/1.0'
            }
            
            print(f"🔍 Attempting online validation for license: {serial_number}")
            print(f"🌐 Server URL: {self.validation_server_url}")
            
            response = requests.post(
                self.validation_server_url,
                json=validation_data,
                headers=headers,
                timeout=15
            )
            
            print(f"📡 Server response: {response.status_code}")
            
            if response.status_code == 200:
                result = response.json()
                print(f"✅ Online validation successful: {result}")
                
                # Log validation attempt
                self._log_validation(license.id, 'online', 'success', result.get('message', 'License validated successfully'))
                
                # Update last online check
                if self.app:
                    with self.app.app_context():
                        license.last_online_check = datetime.now(timezone.utc)
                        db.session.commit()
                else:
                    license.last_online_check = datetime.now(timezone.utc)
                    db.session.commit()
                
                return {
                    'valid': True,
                    'license_type': license.license_type,
                    'expiration_date': license.expiration_date.isoformat() if hasattr(license.expiration_date, 'isoformat') else str(license.expiration_date),
                    'max_users': license.max_users,
                    'features': json.loads(license.features) if license.features else {},
                    'validation_method': 'online'
                }
            elif response.status_code == 404:
                # Check if it's an API route not found error
                try:
                    error_data = response.json()
                    if 'API route not found' in error_data.get('message', ''):
                        self._log_validation(license.id, 'online', 'failed', 'License server API not implemented')
                        return {'valid': False, 'error': 'License server API is not yet implemented. Please contact support for license activation.'}
                except:
                    pass
                
                # License not found on server
                self._log_validation(license.id, 'online', 'failed', 'License not found on validation server')
                return {'valid': False, 'error': 'License not found on validation server. Please contact support.'}
            elif response.status_code == 403:
                # License invalid or expired on server
                self._log_validation(license.id, 'online', 'failed', 'License invalid or expired on server')
                return {'valid': False, 'error': 'License is invalid or expired. Please contact support.'}
            else:
                # Other server errors
                error_msg = f'Server returned status {response.status_code}'
                try:
                    error_data = response.json()
                    error_msg = error_data.get('error', error_msg)
                except:
                    pass
                
                self._log_validation(license.id, 'online', 'failed', error_msg)
                return {'valid': False, 'error': f'License validation failed: {error_msg}'}
                
        except requests.exceptions.Timeout:
            print("⏰ Online validation timeout - falling back to offline validation")
            self._log_validation(license.id, 'online', 'timeout', 'Online validation timeout')
            return self.validate_license_offline(serial_number)
        except requests.exceptions.ConnectionError as e:
            print(f"🌐 Connection error: {e} - falling back to offline validation")
            self._log_validation(license.id, 'online', 'connection_error', f'Connection error: {str(e)}')
            return self.validate_license_offline(serial_number)
        except requests.exceptions.RequestException as e:
            print(f"📡 Request error: {e} - falling back to offline validation")
            self._log_validation(license.id, 'online', 'request_error', f'Request error: {str(e)}')
            return self.validate_license_offline(serial_number)
        except Exception as e:
            print(f"❌ Validation error: {e}")
            return {'valid': False, 'error': f'Validation error: {str(e)}'}
    
    def calculate_grace_period(self, license_type, license_duration_days=None):
        """Calculate appropriate grace period based on license type and duration"""
        import traceback
        
        try:
            # Ensure license_type is a string
            if isinstance(license_type, dict):
                license_type = license_type.get('type', 'One Time License') if isinstance(license_type, dict) else 'One Time License'
            elif not isinstance(license_type, str):
                license_type = str(license_type) if license_type else 'One Time License'
            
            # Ensure license_duration_days is a number if provided
            if license_duration_days is not None and not isinstance(license_duration_days, (int, float)):
                print(f"⚠️ Warning: license_duration_days is not a number: {type(license_duration_days)} = {license_duration_days}, ignoring", flush=True)
                license_duration_days = None
        except Exception as e:
            print(f"❌ Error in calculate_grace_period type conversion: {e}", flush=True)
            print(f"❌ Traceback: {traceback.format_exc()}", flush=True)
            license_type = 'One Time License'
            license_duration_days = None
        
        # Grace period mapping based on license type
        grace_periods = {
            'Day Pass': 0.5,  # 12 hours for 1-day license
            'Trial 7 Days': 1,  # 1 day for 7-day license
            'Extended 30 Days': 3,  # 3 days for 30-day license
            'One Time License': 30,  # 30 days for annual license
            'No Time Limit': 30,  # 30 days for permanent license
        }
        
        # Default grace period
        default_grace_period = 30
        
        # Get grace period based on license type
        # Use try-except to handle case where license_type is a dict
        try:
            grace_period_days = grace_periods.get(license_type, default_grace_period)
        except (TypeError, ValueError) as e:
            print(f"⚠️ Error getting grace period for license_type {license_type}: {e}, using default")
            grace_period_days = default_grace_period
        
        # For unknown license types, calculate based on duration if provided
        # Use try-except to safely check if license_type is in grace_periods
        try:
            license_type_in_grace_periods = license_type in grace_periods
        except (TypeError, ValueError) as e:
            print(f"⚠️ Error checking if license_type is in grace_periods: {e}")
            license_type_in_grace_periods = False
        
        if not license_type_in_grace_periods and license_duration_days is not None:
            try:
                # Double-check that license_duration_days is numeric before comparison
                if not isinstance(license_duration_days, (int, float)):
                    print(f"⚠️ license_duration_days is not numeric in comparison: {type(license_duration_days)} = {license_duration_days}")
                    return default_grace_period
                
                if license_duration_days <= 1:
                    grace_period_days = 0.5  # 12 hours
                elif license_duration_days <= 7:
                    grace_period_days = 1  # 1 day
                elif license_duration_days <= 30:
                    grace_period_days = 3  # 3 days
                elif license_duration_days <= 365:
                    grace_period_days = 15  # 15 days
                else:
                    grace_period_days = 30  # 30 days
            except (TypeError, ValueError) as e:
                print(f"⚠️ Error calculating grace period from duration: {e}, using default")
                grace_period_days = default_grace_period
        
        # Final safety check - ensure we return a number
        if not isinstance(grace_period_days, (int, float)):
            print(f"⚠️ Warning: calculate_grace_period returned non-numeric value: {type(grace_period_days)} = {grace_period_days}, using default 30")
            return 30
        
        return grace_period_days

    def validate_license_offline(self, serial_number):
        """Validate license offline using cached data"""
        import traceback
        import sys
        
        try:
            print(f"🔍 Attempting offline validation for license: {serial_number}", flush=True)
            print(f"🔍 App context available: {self.app is not None}", flush=True)
            
            # Wrap database query in try-catch to catch any type errors early
            try:
                if self.app:
                    with self.app.app_context():
                        license = LicenseActivation.query.filter_by(serial_number=serial_number).first()
                else:
                    license = LicenseActivation.query.filter_by(serial_number=serial_number).first()
            except Exception as db_error:
                error_trace = traceback.format_exc()
                print(f"❌ Database query error: {db_error}", file=sys.stderr, flush=True)
                print(f"❌ Database error traceback:\n{error_trace}", file=sys.stderr, flush=True)
                print(f"❌ Database query error: {db_error}", flush=True)
                print(f"❌ Database error traceback:\n{error_trace}", flush=True)
                raise
            
            if not license:
                print(f"❌ License not found in local database: {serial_number}", flush=True)
                return {'valid': False, 'error': 'License not found in local database. Please ensure the license is properly activated.'}
            
            # Debug: Print types of all fields to identify the issue - DO THIS FIRST
            try:
                print(f"🔍 DEBUG - License field types:", flush=True)
                print(f"   license_type: {type(license.license_type)} = {license.license_type}", flush=True)
                print(f"   expiration_date: {type(license.expiration_date)} = {license.expiration_date}", flush=True)
                print(f"   activation_date: {type(license.activation_date)} = {license.activation_date}", flush=True)
                print(f"   last_online_check: {type(license.last_online_check)} = {license.last_online_check}", flush=True)
                print(f"   max_users: {type(license.max_users)} = {license.max_users}", flush=True)
            except Exception as debug_error:
                print(f"⚠️ Error printing debug info: {debug_error}", flush=True)
            
            # Check if license is active
            if not license.is_active:
                self._log_validation(license.id, 'offline', 'failed', 'License is deactivated')
                return {'valid': False, 'error': 'License is deactivated'}
            
            # Check expiration
            now = datetime.now(timezone.utc)
            # Convert expiration_date to datetime if it's a string
            expiration_date = None
            if license.expiration_date:
                if isinstance(license.expiration_date, str):
                    try:
                        expiration_date = datetime.fromisoformat(license.expiration_date.replace('Z', '+00:00'))
                    except:
                        expiration_date = datetime.strptime(license.expiration_date, '%Y-%m-%d %H:%M:%S.%f')
                        expiration_date = expiration_date.replace(tzinfo=timezone.utc)
                elif isinstance(license.expiration_date, datetime):
                    expiration_date = license.expiration_date
                    if expiration_date.tzinfo is None:
                        expiration_date = expiration_date.replace(tzinfo=timezone.utc)
                else:
                    # expiration_date is not a string or datetime - could be dict or other type
                    print(f"⚠️ expiration_date is unexpected type: {type(license.expiration_date)} = {license.expiration_date}")
                    expiration_date = None
            
            if expiration_date and isinstance(expiration_date, datetime) and expiration_date < now:
                # Automatically deactivate license if expired
                if self.app:
                    with self.app.app_context():
                        if license.is_active:
                            license.is_active = False
                            db.session.commit()
                            print(f"⚠️ License {serial_number} expired and automatically deactivated")
                else:
                    if license.is_active:
                        license.is_active = False
                        db.session.commit()
                        print(f"⚠️ License {serial_number} expired and automatically deactivated")
                
                self._log_validation(license.id, 'offline', 'expired', 'License has expired')
                return {'valid': False, 'error': 'License has expired'}
            
            # Calculate appropriate grace period based on license type
            # Convert activation_date to datetime if it's a string
            if isinstance(license.activation_date, str):
                try:
                    activation_date = datetime.fromisoformat(license.activation_date.replace('Z', '+00:00'))
                except:
                    activation_date = datetime.strptime(license.activation_date, '%Y-%m-%d %H:%M:%S.%f')
                    activation_date = activation_date.replace(tzinfo=timezone.utc)
            else:
                activation_date = license.activation_date
                if activation_date and activation_date.tzinfo is None:
                    activation_date = activation_date.replace(tzinfo=timezone.utc)
            
            # Calculate license duration safely
            license_duration = None
            if expiration_date and activation_date:
                try:
                    # Ensure both are datetime objects, not dicts or other types
                    if not isinstance(expiration_date, datetime):
                        print(f"⚠️ expiration_date is not datetime: {type(expiration_date)} = {expiration_date}")
                        expiration_date = None
                    if not isinstance(activation_date, datetime):
                        print(f"⚠️ activation_date is not datetime: {type(activation_date)} = {activation_date}")
                        activation_date = None
                    
                    if expiration_date and activation_date:
                        license_duration = (expiration_date - activation_date).days
                        # Ensure result is a number
                        if not isinstance(license_duration, (int, float)):
                            print(f"⚠️ license_duration calculation returned non-numeric: {type(license_duration)} = {license_duration}")
                            license_duration = None
                except (TypeError, AttributeError, ValueError) as e:
                    print(f"⚠️ Error calculating license duration: {e}, expiration_date type: {type(expiration_date)}, activation_date type: {type(activation_date)}")
                    license_duration = None
            
            # Ensure license_type is a string, not a dict
            license_type_str = license.license_type
            if isinstance(license_type_str, dict):
                # If license_type is a dict, try to extract a string value
                license_type_str = license_type_str.get('type', 'One Time License') if isinstance(license_type_str, dict) else 'One Time License'
            elif not isinstance(license_type_str, str):
                license_type_str = str(license_type_str) if license_type_str else 'One Time License'
            
            # Call calculate_grace_period with error handling
            try:
                print(f"🔍 About to call calculate_grace_period with license_type_str={license_type_str} (type: {type(license_type_str)}), license_duration={license_duration} (type: {type(license_duration)})", flush=True)
                grace_period_days = self.calculate_grace_period(license_type_str, license_duration)
                print(f"🔍 calculate_grace_period returned: {grace_period_days} (type: {type(grace_period_days)})", flush=True)
            except TypeError as e:
                if 'not supported between instances' in str(e):
                    error_trace = traceback.format_exc()
                    print(f'❌ TYPE ERROR in calculate_grace_period call: {e}', file=sys.stderr, flush=True)
                    print(f'❌ Full traceback:\n{error_trace}', file=sys.stderr, flush=True)
                    print(f'❌ TYPE ERROR in calculate_grace_period call: {e}', flush=True)
                    print(f'❌ Full traceback:\n{error_trace}', flush=True)
                grace_period_days = 30  # Use default
            except Exception as e:
                error_trace = traceback.format_exc()
                print(f'❌ ERROR in calculate_grace_period call: {e}', file=sys.stderr, flush=True)
                print(f'❌ Full traceback:\n{error_trace}', file=sys.stderr, flush=True)
                grace_period_days = 30  # Use default
            
            # Ensure grace_period_days is a number, not a dict or other type
            if not isinstance(grace_period_days, (int, float)):
                print(f"⚠️ Warning: grace_period_days is not a number: {type(grace_period_days)} = {grace_period_days}, using default 30", flush=True)
                grace_period_days = 30
            
            # Check if offline validation is allowed (within calculated grace period)
            if license.last_online_check:
                try:
                    # Ensure last_online_check is a datetime, not a dict or other type
                    last_check = license.last_online_check
                    if isinstance(last_check, str):
                        try:
                            last_check = datetime.fromisoformat(last_check.replace('Z', '+00:00'))
                        except:
                            last_check = datetime.strptime(last_check, '%Y-%m-%d %H:%M:%S.%f')
                            last_check = last_check.replace(tzinfo=timezone.utc)
                    elif not isinstance(last_check, datetime):
                        print(f"⚠️ last_online_check is not datetime: {type(last_check)} = {last_check}")
                        last_check = None
                    
                    if last_check and isinstance(last_check, datetime):
                        if last_check.tzinfo is None:
                            last_check = last_check.replace(tzinfo=timezone.utc)
                        
                        days_since_last_check = (now - last_check).days
                        # Ensure both values are numbers before comparison
                        if isinstance(days_since_last_check, (int, float)) and isinstance(grace_period_days, (int, float)):
                            if days_since_last_check > grace_period_days:
                                self._log_validation(license.id, 'offline', 'failed', 
                                                   f'License requires online validation (grace period: {grace_period_days} days)')
                                return {'valid': False, 'error': f'License requires online validation (grace period: {grace_period_days} days)'}
                        else:
                            print(f"⚠️ Type mismatch in comparison: days_since_last_check={type(days_since_last_check)}, grace_period_days={type(grace_period_days)}")
                except (TypeError, AttributeError, ValueError) as e:
                    print(f"⚠️ Error comparing days_since_last_check: {e}, last_online_check type: {type(license.last_online_check)}")
                    # If comparison fails, allow offline validation (fail open)
            
            # Log successful offline validation
            self._log_validation(license.id, 'offline', 'success', 
                               f'License validated offline (grace period: {grace_period_days} days)')
            
            # Convert expiration_date to ISO format string if it exists
            expiration_date = license.expiration_date
            expiration_date_str = None
            
            if expiration_date:
                if hasattr(expiration_date, 'isoformat'):
                    # It's a datetime object
                    expiration_date_str = expiration_date.isoformat()
                elif isinstance(expiration_date, str):
                    # Already a string
                    expiration_date_str = expiration_date
                else:
                    # Convert to string
                    expiration_date_str = str(expiration_date)
            
            # Ensure all return values are the correct types
            max_users = license.max_users
            if not isinstance(max_users, (int, float)):
                print(f"⚠️ max_users is not numeric: {type(max_users)} = {max_users}, using default 5")
                max_users = 5
            
            features = {}
            if license.features:
                try:
                    if isinstance(license.features, str):
                        features = json.loads(license.features)
                    elif isinstance(license.features, dict):
                        features = license.features
                    else:
                        print(f"⚠️ features is unexpected type: {type(license.features)}")
                        features = {}
                except json.JSONDecodeError as e:
                    print(f"⚠️ Error parsing features JSON: {e}")
                    features = {}
            
            # Ensure license_type is a string
            license_type_return = license.license_type
            if isinstance(license_type_return, dict):
                license_type_return = license_type_return.get('type', 'One Time License')
            elif not isinstance(license_type_return, str):
                license_type_return = str(license_type_return) if license_type_return else 'One Time License'
            
            return {
                'valid': True,
                'license_type': license_type_return,
                'expiration_date': expiration_date_str,
                'max_users': int(max_users) if max_users else 5,
                'features': features,
                'offline': True,
                'grace_period_days': float(grace_period_days) if grace_period_days else 30.0
            }
            
        except TypeError as e:
            import sys
            error_trace = traceback.format_exc()
            if 'not supported between instances' in str(e):
                print(f'❌ TYPE COMPARISON ERROR in validate_license_offline: {e}', file=sys.stderr, flush=True)
                print(f'❌ Full traceback:\n{error_trace}', file=sys.stderr, flush=True)
                print(f'❌ TYPE COMPARISON ERROR in validate_license_offline: {e}', flush=True)
                print(f'❌ Full traceback:\n{error_trace}', flush=True)
                # Try to identify which comparison failed
                if 'int' in str(e) and 'dict' in str(e):
                    print(f'❌ This error means we tried to compare an int with a dict using > or <', flush=True)
                    print(f'❌ Likely locations: expiration_date comparison, grace_period comparison, or license_duration calculation', flush=True)
            return {'valid': False, 'error': f'Type error: {str(e)}', 'error_type': type(e).__name__}
        except Exception as e:
            import sys
            error_trace = traceback.format_exc()
            print(f'❌ Offline validation error: {e}', file=sys.stderr, flush=True)
            print(f'❌ Full traceback:\n{error_trace}', file=sys.stderr, flush=True)
            print(f'❌ Offline validation error: {e}', flush=True)
            print(f'❌ Full traceback:\n{error_trace}', flush=True)
            return {'valid': False, 'error': f'Offline validation error: {str(e)}', 'error_type': type(e).__name__}
    
    def validate_license_manual(self, serial_number, admin_override=False):
        """Manual license validation (for admin purposes)"""
        try:
            license = LicenseActivation.query.filter_by(serial_number=serial_number).first()
            if not license:
                return {'valid': False, 'error': 'License not found'}
            
            if admin_override:
                # Admin override - always valid
                self._log_validation(license.id, 'manual', 'success', 'Admin override validation')
                return {
                    'valid': True,
                    'license_type': license.license_type,
                    'expiration_date': license.expiration_date,
                    'max_users': license.max_users,
                    'features': json.loads(license.features) if license.features else {},
                    'admin_override': True
                }
            else:
                # Regular manual validation
                if not license.is_active:
                    return {'valid': False, 'error': 'License is deactivated'}
                
                now = datetime.now(timezone.utc)
                
                # Handle timezone-aware expiration date
                expiration_date = license.expiration_date
                if isinstance(expiration_date, str):
                    try:
                        expiration_date = datetime.fromisoformat(expiration_date.replace('Z', '+00:00'))
                    except:
                        expiration_date = datetime.strptime(expiration_date, '%Y-%m-%d %H:%M:%S.%f')
                        expiration_date = expiration_date.replace(tzinfo=timezone.utc)
                elif expiration_date.tzinfo is None:
                    expiration_date = expiration_date.replace(tzinfo=timezone.utc)
                
                if expiration_date < now:
                    # Automatically deactivate license if expired
                    if self.app:
                        with self.app.app_context():
                            if license.is_active:
                                license.is_active = False
                                db.session.commit()
                                print(f"⚠️ License {serial_number} expired and automatically deactivated")
                    else:
                        if license.is_active:
                            license.is_active = False
                            db.session.commit()
                            print(f"⚠️ License {serial_number} expired and automatically deactivated")
                    
                    return {'valid': False, 'error': 'License has expired'}
                
                self._log_validation(license.id, 'manual', 'success', 'Manual validation successful')
                return {
                    'valid': True,
                    'license_type': license.license_type,
                    'expiration_date': license.expiration_date,
                    'max_users': license.max_users,
                    'features': json.loads(license.features) if license.features else {}
                }
                
        except Exception as e:
            return {'valid': False, 'error': f'Manual validation error: {str(e)}'}
    
    def _log_validation(self, license_id, validation_type, result, message):
        """Log validation attempt"""
        try:
            log_entry = LicenseValidationLog(
                license_id=license_id,
                validation_type=validation_type,
                validation_result=result,
                validation_message=message,
                created_at=datetime.now(timezone.utc)
            )
            db.session.add(log_entry)
            db.session.commit()
        except Exception as e:
            print(f"Error logging validation: {str(e)}")
    
    def get_license_status(self, serial_number):
        """Get comprehensive license status"""
        try:
            license = LicenseActivation.query.filter_by(serial_number=serial_number).first()
            if not license:
                return {'found': False, 'error': 'License not found'}
            
            now = datetime.now(timezone.utc)
            
            # Safely check expiration date
            is_expired = False
            days_until_expiry = 0
            expiration_date = None
            
            if license.expiration_date:
                if isinstance(license.expiration_date, str):
                    try:
                        expiration_date = datetime.fromisoformat(license.expiration_date.replace('Z', '+00:00'))
                    except:
                        expiration_date = datetime.strptime(license.expiration_date, '%Y-%m-%d %H:%M:%S.%f')
                        expiration_date = expiration_date.replace(tzinfo=timezone.utc)
                elif isinstance(license.expiration_date, datetime):
                    expiration_date = license.expiration_date
                    if expiration_date.tzinfo is None:
                        expiration_date = expiration_date.replace(tzinfo=timezone.utc)
                else:
                    print(f"⚠️ expiration_date is unexpected type in get_license_status: {type(license.expiration_date)}")
                    expiration_date = None
                
                if expiration_date and isinstance(expiration_date, datetime):
                    is_expired = expiration_date < now
                    days_until_expiry = (expiration_date - now).days if not is_expired else 0
            
            # Get recent validation logs
            recent_logs = LicenseValidationLog.query.filter_by(license_id=license.id)\
                .order_by(LicenseValidationLog.created_at.desc()).limit(5).all()
            
            return {
                'found': True,
                'serial_number': license.serial_number,
                'license_type': license.license_type,
                'is_active': license.is_active,
                'is_expired': is_expired,
                'expiration_date': license.expiration_date.isoformat() if hasattr(license.expiration_date, 'isoformat') else str(license.expiration_date),
                'days_until_expiry': days_until_expiry,
                'max_users': license.max_users,
                'features': json.loads(license.features) if license.features else {},
                'last_online_check': license.last_online_check.isoformat() if license.last_online_check else None,
                'recent_validations': [
                    {
                        'type': log.validation_type,
                        'result': log.validation_result,
                        'message': log.validation_message,
                        'timestamp': log.created_at.isoformat()
                    } for log in recent_logs
                ]
            }
            
        except Exception as e:
            return {'found': False, 'error': f'Error getting license status: {str(e)}'}
    
    def setup_validation_server(self, server_url, secret_key=None):
        """Configure validation server settings"""
        try:
            # Update system configuration
            config = SystemConfiguration.query.filter_by(config_key='validation_server_url').first()
            if config:
                config.config_value = server_url
            else:
                config = SystemConfiguration(
                    config_key='validation_server_url',
                    config_value=server_url,
                    description='License validation server URL'
                )
                db.session.add(config)
            
            if secret_key:
                secret_config = SystemConfiguration.query.filter_by(config_key='validation_secret_key').first()
                if secret_config:
                    secret_config.config_value = secret_key
                else:
                    secret_config = SystemConfiguration(
                        config_key='validation_secret_key',
                        config_value=secret_key,
                        description='License validation secret key'
                    )
                    db.session.add(secret_config)
            
            db.session.commit()
            self.validation_server_url = server_url
            if secret_key:
                self.secret_key = secret_key
            
            return True
        except Exception as e:
            return False
