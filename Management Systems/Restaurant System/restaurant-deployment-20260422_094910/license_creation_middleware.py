#!/usr/bin/env python3
"""
License Creation Middleware - Prevents unauthorized license creation
"""

from functools import wraps
from flask import request, jsonify, session
import logging

def require_activation_system(f):
    """Decorator to ensure license creation only comes from activation system"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Check for activation system header
        if request.headers.get('X-License-Source') != 'activation_system':
            logging.warning(f"Unauthorized license creation attempt from {request.remote_addr}")
            return jsonify({
                'success': False,
                'error': 'License creation only allowed through activation system'
            }), 403
        
        # Check for valid session token
        if not session.get('activation_system_token'):
            return jsonify({
                'success': False,
                'error': 'Invalid activation system session'
            }), 401
        
        return f(*args, **kwargs)
    return decorated_function

def require_admin_privileges(f):
    """Decorator to require admin privileges for license operations"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Check if user is admin
        if session.get('user_role') != 'admin':
            return jsonify({
                'success': False,
                'error': 'Admin privileges required for license operations'
            }), 403
        
        return f(*args, **kwargs)
    return decorated_function

def log_license_operations(f):
    """Decorator to log all license operations"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        logging.info(f"License operation attempted by {session.get('username', 'unknown')} from {request.remote_addr}")
        return f(*args, **kwargs)
    return decorated_function
