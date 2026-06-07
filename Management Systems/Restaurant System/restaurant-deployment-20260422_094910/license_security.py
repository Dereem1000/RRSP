#!/usr/bin/env python3
"""
License Security System - Prevents unauthorized license creation
"""

import hashlib
import hmac
import time
import os
from datetime import datetime, timedelta

class LicenseSecurity:
    """Security system to prevent unauthorized license creation"""
    
    def __init__(self):
        # Secret key sourced exclusively from environment — no hardcoded fallback
        self.secret_key = os.environ.get('LICENSE_SECRET_KEY') or os.environ.get('SECRET_KEY', '')
        if not self.secret_key or len(self.secret_key) < 32:
            import sys
            print("FATAL: LICENSE_SECRET_KEY / SECRET_KEY env var is missing or too short.")
            sys.exit(1)
        self.activation_server_url = 'https://www.computerdynamicstt.com/api/auth/login'
    
    def generate_license_hash(self, license_data):
        """Generate a secure hash for license validation"""
        # Create a string with license data and timestamp
        data_string = f"{license_data['serial']}_{license_data['company']}_{int(time.time())}"
        
        # Generate HMAC hash
        signature = hmac.new(
            self.secret_key.encode(),
            data_string.encode(),
            hashlib.sha256
        ).hexdigest()
        
        return signature
    
    def validate_license_source(self, license_serial, company_name):
        """Validate that license comes from authorized activation system"""
        try:
            import requests
            
            # Check with external activation system
            response = requests.post(
                self.activation_server_url,
                json={
                    'license_serial': license_serial,
                    'company_name': company_name
                },
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                return data.get('valid', False)
            
            return False
            
        except Exception as e:
            print(f"License validation error: {e}")
            return False
    
    def is_license_creation_allowed(self, request_data):
        """Check if license creation is allowed from this source"""
        # Only allow license creation through specific endpoints
        allowed_endpoints = [
            '/api/activate_license',
            '/api/register_restaurant'
        ]
        
        # Check if request comes from authorized source
        if 'X-License-Source' not in request_data.get('headers', {}):
            return False
        
        if request_data.get('headers', {}).get('X-License-Source') != 'activation_system':
            return False
        
        return True
    
    def create_secure_license_record(self, license_data):
        """Create a license record with security validation"""
        # Validate license source
        if not self.is_license_creation_allowed(license_data):
            raise ValueError("Unauthorized license creation attempt")
        
        # Validate with external system
        if not self.validate_license_source(license_data['serial'], license_data['company']):
            raise ValueError("License not valid in activation system")
        
        # Generate security hash
        security_hash = self.generate_license_hash(license_data)
        
        return {
            'serial': license_data['serial'],
            'company': license_data['company'],
            'security_hash': security_hash,
            'created_at': datetime.now(),
            'source': 'activation_system',
            'validated': True
        }

# Global instance
license_security = LicenseSecurity()
