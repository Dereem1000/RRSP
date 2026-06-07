"""
License Middleware for Restaurant System
Provides license validation and access control for protected routes
"""

from functools import wraps
from flask import session, redirect, url_for, flash, jsonify, request
from license_registration import RestaurantLicenseRegistration
import json
from datetime import datetime

class LicenseMiddleware:
    """Middleware for license validation and access control"""
    
    def __init__(self, app=None):
        self.app = app
        self.license_registration = RestaurantLicenseRegistration()
    
    def _calculate_days_remaining(self, expiration_date):
        """Calculate days remaining until expiration with detailed time info"""
        # Check for None, empty string, or other falsy values
        if not expiration_date or expiration_date in [None, '', 'None', 'null', 'NULL']:
            # Return unknown status instead of defaulting to 365 days
            print(f"⚠️ No expiration date provided to _calculate_days_remaining: {expiration_date}")
            return {'days': None, 'hours': 0, 'minutes': 0, 'total_seconds': 0, 'formatted': 'Unknown', 'is_unknown': True}
        
        try:
            from datetime import datetime, timezone
            # Parse the external API date format
            if isinstance(expiration_date, str):
                try:
                    exp_date = datetime.strptime(expiration_date, '%a, %d %b %Y %H:%M:%S %Z')
                except:
                    try:
                        exp_date = datetime.fromisoformat(expiration_date.replace('Z', '+00:00'))
                    except:
                        exp_date = datetime.strptime(expiration_date, '%Y-%m-%d %H:%M:%S')
                        exp_date = exp_date.replace(tzinfo=timezone.utc)
            else:
                exp_date = expiration_date
                if exp_date.tzinfo is None:
                    exp_date = exp_date.replace(tzinfo=timezone.utc)
            
            now = datetime.now(timezone.utc)
            delta = exp_date - now
            total_seconds = int(delta.total_seconds())
            
            # Calculate days, hours, and minutes
            days = delta.days
            hours = delta.seconds // 3600
            minutes = (delta.seconds % 3600) // 60
            
            # Format the display string
            if days > 0:
                formatted = f'{days} day{"s" if days != 1 else ""}'
            elif days == 0 and hours > 0:
                formatted = f'{hours} hour{"s" if hours != 1 else ""}'
                if minutes > 0:
                    formatted += f' {minutes} minute{"s" if minutes != 1 else ""}'
            elif days == 0 and hours == 0 and minutes > 0:
                formatted = f'{minutes} minute{"s" if minutes != 1 else ""}'
            else:
                # Expired - calculate how long ago
                total_seconds = abs(total_seconds)
                hours_ago = total_seconds // 3600
                minutes_ago = (total_seconds % 3600) // 60
                if hours_ago > 0:
                    formatted = f'{hours_ago} hour{"s" if hours_ago != 1 else ""} ago'
                else:
                    formatted = f'{minutes_ago} minute{"s" if minutes_ago != 1 else ""} ago'
            
            return {
                'days': days,
                'hours': hours,
                'minutes': minutes,
                'total_seconds': total_seconds,
                'formatted': formatted
            }
        except Exception as e:
            print(f"Warning: Could not parse expiration date: {e}")
            # Return unknown status instead of defaulting to 365 days
            return {'days': None, 'hours': 0, 'minutes': 0, 'total_seconds': 0, 'formatted': 'Unknown', 'is_unknown': True}
        
    def init_app(self, app):
        """Initialize with Flask app"""
        self.app = app
        self.license_registration.init_app(app)
        
    def require_license(self, f):
        """Decorator to require valid license for route access"""
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Check if user is logged in
            if 'user_id' not in session:
                if request.is_json:
                    return jsonify({'error': 'Authentication required'}), 401
                flash('Please login to access this page', 'error')
                return redirect(url_for('login'))
            
            # Check license status
            license_result = self.license_registration.validate_restaurant_access(session['user_id'])
            
            # Additional check: Verify expiration date even if API says valid
            if license_result.get('valid'):
                expiration_date = license_result.get('expiration_date')
                if expiration_date:
                    try:
                        from datetime import datetime, timezone
                        if isinstance(expiration_date, str):
                            if 'T' in expiration_date or 'Z' in expiration_date:
                                exp_date = datetime.fromisoformat(expiration_date.replace('Z', '+00:00'))
                            else:
                                exp_date = datetime.strptime(expiration_date, '%Y-%m-%d %H:%M:%S')
                                exp_date = exp_date.replace(tzinfo=timezone.utc)
                        else:
                            exp_date = expiration_date
                            if exp_date.tzinfo is None:
                                exp_date = exp_date.replace(tzinfo=timezone.utc)
                        
                        current_time = datetime.now(timezone.utc)
                        if exp_date < current_time:
                            # License expired - treat as invalid
                            print(f"⚠️ License expired in require_license: {exp_date} < {current_time}")
                            license_result['valid'] = False
                            license_result['error'] = 'License has expired'
                    except Exception as e:
                        print(f"⚠️ Error checking expiration in require_license: {e}")
            
            if not license_result.get('valid'):
                # Clear license info from session when validation fails
                session.pop('license_info', None)
                session['license_error'] = license_result.get('error', 'License validation failed')
                
                if request.is_json:
                    return jsonify({
                        'error': 'License validation failed',
                        'details': license_result.get('error', 'Unknown error')
                    }), 403
                
                flash(f'License Error: {license_result.get("error", "License validation failed")}', 'error')
                return redirect(url_for('license_error_page'))
            
            # Add license info to session for use in templates
            time_info = self._calculate_days_remaining(license_result.get('expiration_date'))
            days_val = time_info.get('days') if isinstance(time_info, dict) else time_info
            session['license_info'] = {
                'status': 'active',  # Add the missing status field
                'type': license_result.get('license_type'),
                'max_users': license_result.get('max_users'),
                'features': license_result.get('features', {}),
                'expiration_date': license_result.get('expiration_date'),
                'days_remaining': days_val if days_val is not None else None,
                'time_remaining': time_info.get('formatted', '') if isinstance(time_info, dict) else '',
                'time_info': time_info,  # Store full time info for templates
                'offline_mode': license_result.get('offline_mode', False),
                'grace_period': license_result.get('grace_period'),
                'grace_remaining_hours': license_result.get('grace_remaining_hours'),
            }
            
            return f(*args, **kwargs)
        return decorated_function
    
    def require_feature(self, feature_name):
        """Decorator to require specific license feature"""
        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                # First check license
                if 'user_id' not in session:
                    if request.is_json:
                        return jsonify({'error': 'Authentication required'}), 401
                    flash('Please login to access this page', 'error')
                    return redirect(url_for('login'))
                
                license_result = self.license_registration.validate_restaurant_access(session['user_id'])
                
                # Additional check: Verify expiration date even if API says valid
                if license_result.get('valid'):
                    expiration_date = license_result.get('expiration_date')
                    if expiration_date:
                        try:
                            from datetime import datetime, timezone
                            if isinstance(expiration_date, str):
                                if 'T' in expiration_date or 'Z' in expiration_date:
                                    exp_date = datetime.fromisoformat(expiration_date.replace('Z', '+00:00'))
                                else:
                                    exp_date = datetime.strptime(expiration_date, '%Y-%m-%d %H:%M:%S')
                                    exp_date = exp_date.replace(tzinfo=timezone.utc)
                            else:
                                exp_date = expiration_date
                                if exp_date.tzinfo is None:
                                    exp_date = exp_date.replace(tzinfo=timezone.utc)
                            
                            current_time = datetime.now(timezone.utc)
                            if exp_date < current_time:
                                # License expired - treat as invalid
                                print(f"⚠️ License expired in require_feature: {exp_date} < {current_time}")
                                license_result['valid'] = False
                                license_result['error'] = 'License has expired'
                        except Exception as e:
                            print(f"⚠️ Error checking expiration in require_feature: {e}")
                
                if not license_result.get('valid'):
                    if request.is_json:
                        return jsonify({
                            'error': 'License validation failed',
                            'details': license_result.get('error', 'Unknown error')
                        }), 403
                    session['license_error'] = license_result.get('error', 'License validation failed')
                    flash(f'License Error: {license_result.get("error", "License validation failed")}', 'error')
                    return redirect(url_for('license_error_page'))
                
                # Check specific feature
                features = license_result.get('features', {})
                if not features.get(feature_name, False):
                    if request.is_json:
                        return jsonify({
                            'error': f'Feature "{feature_name}" not available',
                            'details': 'This feature requires a higher license tier'
                        }), 403
                    flash(f'Feature "{feature_name}" is not available with your current license', 'error')
                    return redirect(url_for('license_error_page'))
                
                # Add license info to session
                time_info = self._calculate_days_remaining(license_result.get('expiration_date'))
                session['license_info'] = {
                    'status': 'active',  # Add the missing status field
                    'type': license_result.get('license_type'),
                    'max_users': license_result.get('max_users'),
                    'features': features,
                    'expiration_date': license_result.get('expiration_date'),
                    'days_remaining': time_info.get('days', 0) if isinstance(time_info, dict) else time_info,
                    'time_remaining': time_info.get('formatted', '') if isinstance(time_info, dict) else '',
                    'time_info': time_info,  # Store full time info for templates
                    'offline_mode': license_result.get('offline_mode', False),
                    'grace_period': license_result.get('grace_period'),
                    'grace_remaining_hours': license_result.get('grace_remaining_hours'),
                }
                
                return f(*args, **kwargs)
            return decorated_function
        return decorator
    
    def check_user_limit(self):
        """Check if restaurant has reached user limit"""
        try:
            from database.models import db, User
            
            # Get current active user count
            active_users = User.query.filter_by(is_active=True).count()
            
            # Get license info from session
            license_info = session.get('license_info', {})
            max_users = license_info.get('max_users', 5)
            
            if active_users >= max_users:
                return {
                    'limit_reached': True,
                    'current_users': active_users,
                    'max_users': max_users
                }
            
            return {
                'limit_reached': False,
                'current_users': active_users,
                'max_users': max_users,
                'remaining': max_users - active_users
            }
            
        except Exception as e:
            return {
                'limit_reached': False,
                'error': f'Error checking user limit: {str(e)}'
            }
    
    def get_license_status_display(self):
        """Get formatted license status for display"""
        try:
            license_info = session.get('license_info', {})
            if not license_info:
                return {
                    'status': 'unknown',
                    'message': 'License status unknown',
                    'expired': True
                }
            
            # Use detailed time info if available
            time_info = license_info.get('time_info')
            if time_info and isinstance(time_info, dict):
                days_remaining = time_info.get('days', 0)
                time_remaining = time_info.get('formatted', '')
                
                if days_remaining < 0:
                    return {
                        'status': 'expired',
                        'message': f'License expired {time_remaining}',
                        'expired': True,
                        'days_remaining': days_remaining,
                        'time_remaining': time_remaining
                    }
                elif days_remaining <= 30:
                    return {
                        'status': 'warning',
                        'message': f'License expires in {time_remaining}',
                        'expired': False,
                        'days_remaining': days_remaining,
                        'time_remaining': time_remaining
                    }
                else:
                    return {
                        'status': 'active',
                        'message': f'License active, expires in {time_remaining}',
                        'expired': False,
                        'days_remaining': days_remaining,
                        'time_remaining': time_remaining
                    }
            
            # Fallback to old calculation if time_info not available
            from datetime import datetime
            expiration_date = license_info.get('expiration_date')
            
            if expiration_date:
                try:
                    exp_date = datetime.fromisoformat(expiration_date.replace('Z', '+00:00'))
                    now = datetime.utcnow()
                    days_remaining = (exp_date - now).days
                    
                    if days_remaining < 0:
                        return {
                            'status': 'expired',
                            'message': f'License expired {abs(days_remaining)} days ago',
                            'expired': True,
                            'days_remaining': days_remaining
                        }
                    elif days_remaining <= 30:
                        return {
                            'status': 'warning',
                            'message': f'License expires in {days_remaining} days',
                            'expired': False,
                            'days_remaining': days_remaining
                        }
                    else:
                        return {
                            'status': 'active',
                            'message': f'License active, expires in {days_remaining} days',
                            'expired': False,
                            'days_remaining': days_remaining
                        }
                except:
                    return {
                        'status': 'unknown',
                        'message': 'License status unknown',
                        'expired': True
                    }
            
            return {
                'status': 'active',
                'message': 'License active',
                'expired': False
            }
            
        except Exception as e:
            return {
                'status': 'error',
                'message': f'Error checking license: {str(e)}',
                'expired': True
            }
    
    def require_license_for_all(self, f):
        """Decorator to require valid license for ALL routes (except public ones)"""
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Public routes that don't require license
            public_routes = [
                'index', 'login', 'logout', 'license_registration_page', 
                'license_error', 'customer_menu', 'table_menu'
            ]
            
            # Check if this is a public route
            if request.endpoint in public_routes:
                return f(*args, **kwargs)
            
            # Check if user is logged in
            if 'user_id' not in session:
                if request.is_json:
                    return jsonify({'error': 'Authentication required'}), 401
                flash('Please login to access this page', 'error')
                return redirect(url_for('login'))
            
            # Check license status
            license_result = self.license_registration.validate_restaurant_access(session['user_id'])
            
            if not license_result.get('valid'):
                # Clear license info from session when validation fails
                session.pop('license_info', None)
                session['license_error'] = license_result.get('error', 'License validation failed')
                
                if request.is_json:
                    return jsonify({
                        'error': 'License validation failed',
                        'details': license_result.get('error', 'Unknown error')
                    }), 403
                
                flash(f'License Error: {license_result.get("error", "License validation failed")}', 'error')
                return redirect(url_for('license_error_page'))
            
            # Add license info to session for use in templates
            time_info = self._calculate_days_remaining(license_result.get('expiration_date'))
            days_val = time_info.get('days') if isinstance(time_info, dict) else time_info
            session['license_info'] = {
                'status': 'active',  # Add the missing status field
                'type': license_result.get('license_type'),
                'max_users': license_result.get('max_users'),
                'features': license_result.get('features', {}),
                'expiration_date': license_result.get('expiration_date'),
                'days_remaining': days_val if days_val is not None else None,
                'time_remaining': time_info.get('formatted', '') if isinstance(time_info, dict) else '',
                'time_info': time_info,  # Store full time info for templates
                'offline_mode': license_result.get('offline_mode', False),
                'grace_period': license_result.get('grace_period'),
                'grace_remaining_hours': license_result.get('grace_remaining_hours'),
            }
            
            return f(*args, **kwargs)
        return decorated_function
    
    def require_license_for_staff(self, f):
        """Decorator to require valid license for staff routes only"""
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Staff routes that require license
            staff_routes = [
                'kitchen', 'kitchen_fullscreen', 'cashier', 'manual_cash_register',
                'table_management', 'cash_register_fullscreen', 'waiter', 'waiter_mobile',
                'admin', 'admin_tables', 'admin_menu', 'admin_staff', 'admin_inventory',
                'admin_waiter_assignments', 'admin_settings'
            ]
            
            # Check if this is a staff route
            if request.endpoint not in staff_routes:
                return f(*args, **kwargs)
            
            # Check if user is logged in
            if 'user_id' not in session:
                if request.is_json:
                    return jsonify({'error': 'Authentication required'}), 401
                flash('Please login to access this page', 'error')
                return redirect(url_for('login'))
            
            # Check license status
            license_result = self.license_registration.validate_restaurant_access(session['user_id'])
            
            if not license_result.get('valid'):
                # Clear license info from session when validation fails
                session.pop('license_info', None)
                session['license_error'] = license_result.get('error', 'License validation failed')
                
                if request.is_json:
                    return jsonify({
                        'error': 'License validation failed',
                        'details': license_result.get('error', 'Unknown error')
                    }), 403
                
                flash(f'License Error: {license_result.get("error", "License validation failed")}', 'error')
                return redirect(url_for('license_error_page'))
            
            # Add license info to session for use in templates
            time_info = self._calculate_days_remaining(license_result.get('expiration_date'))
            days_val = time_info.get('days') if isinstance(time_info, dict) else time_info
            session['license_info'] = {
                'status': 'active',  # Add the missing status field
                'type': license_result.get('license_type'),
                'max_users': license_result.get('max_users'),
                'features': license_result.get('features', {}),
                'expiration_date': license_result.get('expiration_date'),
                'days_remaining': days_val if days_val is not None else None,
                'time_remaining': time_info.get('formatted', '') if isinstance(time_info, dict) else '',
                'time_info': time_info,  # Store full time info for templates
                'offline_mode': license_result.get('offline_mode', False),
                'grace_period': license_result.get('grace_period'),
                'grace_remaining_hours': license_result.get('grace_remaining_hours'),
            }
            
            return f(*args, **kwargs)
        return decorated_function
    
    def require_license_for_api(self, f):
        """Decorator to require valid license for API routes only - optimized with caching"""
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Public API routes that don't require license
            public_api_routes = [
                'validate_license', 'authenticate_msp', 'register_restaurant',
                'clear_license_error', 'get_base_url', 'get_menu', 'create_order',
                'request_assistance'
            ]
            
            # Check if this is a public API route
            if request.endpoint in public_api_routes:
                return f(*args, **kwargs)
            
            # Check if user is logged in
            if 'user_id' not in session:
                return jsonify({'error': 'Authentication required'}), 401
            
            # Use cached license validation for better performance
            try:
                from app import get_cached_license_validation
                license_result = get_cached_license_validation()
            except:
                # Fallback to direct validation if cache not available
                license_result = self.license_registration.validate_restaurant_access(session['user_id'])
            
            if not license_result.get('valid'):
                return jsonify({
                    'error': 'License validation failed',
                    'details': license_result.get('error', 'Unknown error')
                }), 403
            
            # Add license info to session for use in templates
            time_info = self._calculate_days_remaining(license_result.get('expiration_date'))
            days_val = time_info.get('days') if isinstance(time_info, dict) else time_info
            session['license_info'] = {
                'status': 'active',  # Add the missing status field
                'type': license_result.get('license_type'),
                'max_users': license_result.get('max_users'),
                'features': license_result.get('features', {}),
                'expiration_date': license_result.get('expiration_date'),
                'days_remaining': days_val if days_val is not None else None,
                'time_remaining': time_info.get('formatted', '') if isinstance(time_info, dict) else '',
                'time_info': time_info,  # Store full time info for templates
                'offline_mode': license_result.get('offline_mode', False),
                'grace_period': license_result.get('grace_period'),
                'grace_remaining_hours': license_result.get('grace_remaining_hours'),
            }
            
            return f(*args, **kwargs)
        return decorated_function
