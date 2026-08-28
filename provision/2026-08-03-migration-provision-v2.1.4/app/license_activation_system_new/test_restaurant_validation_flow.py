#!/usr/bin/env python3
"""
Test what the restaurant management system actually checks
"""

import requests
import json

def test_restaurant_validation_flow():
    """Test the exact flow the restaurant system uses"""
    
    serial_number = "LIC-MSP-a0dd06af-20251025-RESTAURANT-20251025204956"
    
    print("🔍 Testing Restaurant Management System Validation Flow")
    print("=" * 70)
    print()
    
    # Step 1: What the restaurant validator calls
    print("Step 1: Restaurant License Validator")
    print("-" * 70)
    restaurant_validator_url = "https://www.computerdynamicstt.com/api/license/validate"
    print(f"   URL: {restaurant_validator_url}")
    print(f"   Serial: {serial_number}")
    print()
    
    request_data = {
        'serial_number': serial_number,
        'system_info': {'system_type': 'restaurant_management'}
    }
    
    try:
        response = requests.post(
            restaurant_validator_url,
            json=request_data,
            timeout=10,
            headers={'Content-Type': 'application/json'}
        )
        
        print(f"   Status Code: {response.status_code}")
        print(f"   Response:")
        
        if response.status_code == 200:
            result = response.json()
            print(json.dumps(result, indent=4, default=str))
            
            if result.get('valid'):
                print()
                print("   ✅ Restaurant system would see: VALID")
                print(f"   📅 Expiration Date: {result.get('expiration_date')}")
            else:
                print()
                print("   ❌ Restaurant system would see: INVALID")
                print(f"   ⚠️  Error: {result.get('error')}")
        else:
            print(f"   Response Text: {response.text}")
            print()
            print(f"   ❌ Restaurant system would see: INVALID (HTTP {response.status_code})")
            
    except requests.exceptions.ConnectionError:
        print(f"   ❌ Cannot connect to external API")
        print(f"   ⚠️  This means the restaurant system cannot validate licenses!")
        print(f"   ⚠️  It's trying to call: {restaurant_validator_url}")
        print(f"   ⚠️  But should probably call: http://localhost:5001/api/license/validate")
    except requests.exceptions.Timeout:
        print(f"   ⏰ Request timed out")
        print(f"   ⚠️  External API not responding")
    except Exception as e:
        print(f"   ❌ Error: {e}")
    
    print()
    print("=" * 70)
    print()
    
    # Step 2: What the local API server would return
    print("Step 2: Local License API Server (localhost:5001)")
    print("-" * 70)
    local_api_url = "http://localhost:5001/api/license/validate"
    print(f"   URL: {local_api_url}")
    print(f"   Serial: {serial_number}")
    print()
    
    try:
        response = requests.post(
            local_api_url,
            json=request_data,
            timeout=5,
            headers={'Content-Type': 'application/json'}
        )
        
        print(f"   Status Code: {response.status_code}")
        print(f"   Response:")
        
        if response.status_code == 200:
            result = response.json()
            print(json.dumps(result, indent=4, default=str))
            print()
            print("   ✅ Local API would return: VALID" if result.get('valid') else "   ❌ Local API would return: INVALID")
        elif response.status_code == 403:
            result = response.json()
            print(json.dumps(result, indent=4, default=str))
            print()
            print("   ❌ Local API returns: INVALID (Expired)")
        else:
            print(f"   Response Text: {response.text}")
            
    except requests.exceptions.ConnectionError:
        print(f"   ❌ Cannot connect to local API server")
        print(f"   ⚠️  Local API server may not be running on port 5001")
    except Exception as e:
        print(f"   ❌ Error: {e}")
    
    print()
    print("=" * 70)
    print()
    print("📊 Summary:")
    print("-" * 70)
    print("Restaurant system calls: https://www.computerdynamicstt.com/api/license/validate")
    print("Local API server runs on: http://localhost:5001/api/license/validate")
    print()
    print("⚠️  If external API is down/unreachable, restaurant system will fail validation")
    print("⚠️  Restaurant system should ideally use local API server for testing")

if __name__ == '__main__':
    test_restaurant_validation_flow()














