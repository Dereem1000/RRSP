#!/usr/bin/env python3
"""
Test what the API server returns when validating a license
"""

import requests
import json
from datetime import datetime, timezone

def test_license_validation(serial_number):
    """Test license validation through the API"""
    api_url = "http://localhost:5001/api/license/validate"
    
    request_data = {
        'serial_number': serial_number,
        'system_info': {
            'system_type': 'restaurant_management'
        }
    }
    
    print(f"🔍 Testing license validation API")
    print(f"   API URL: {api_url}")
    print(f"   Serial Number: {serial_number}")
    print()
    
    try:
        response = requests.post(
            api_url,
            json=request_data,
            timeout=5,
            headers={'Content-Type': 'application/json'}
        )
        
        print(f"📊 Response Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Response (Success):")
            print(json.dumps(result, indent=2, default=str))
            
            # Check expiration
            if result.get('valid'):
                expiration_date = result.get('expiration_date')
                if expiration_date:
                    try:
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
                            print()
                            print(f"⚠️ WARNING: API returned valid=True but license is expired!")
                            print(f"   Expiration: {exp_date}")
                            print(f"   Current: {current_time}")
                            print(f"   Difference: {current_time - exp_date}")
                        else:
                            print()
                            print(f"✅ License is valid and not expired")
                    except Exception as e:
                        print(f"⚠️ Error parsing expiration date: {e}")
            
        elif response.status_code == 403:
            result = response.json()
            print(f"❌ Response (Forbidden):")
            print(json.dumps(result, indent=2, default=str))
        else:
            print(f"❌ Response (Error {response.status_code}):")
            print(response.text)
            
    except requests.exceptions.ConnectionError:
        print(f"❌ Cannot connect to API server at {api_url}")
        print(f"   Make sure the license API server is running on port 5001")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == '__main__':
    serial_number = "LIC-MSP-a0dd06af-20251025-RESTAURANT-20251025204956"
    test_license_validation(serial_number)














