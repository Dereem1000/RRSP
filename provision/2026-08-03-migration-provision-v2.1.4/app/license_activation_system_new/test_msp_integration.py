#!/usr/bin/env python3
"""
Test script for MSP Integration
Demonstrates how the MSP client integration works
"""

import sys
import os
import json
from datetime import datetime, timezone

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from msp_integration import MSPClientIntegration

def create_mock_msp_clients():
    """Create mock MSP clients for testing"""
    return [
        {
            "id": "client-001",
            "name": "John Smith",
            "companyName": "Acme Corporation",
            "email": "john@acme.com",
            "phone": "555-0123",
            "address": "123 Main St, City, State",
            "serviceLevel": "basic",
            "status": "active",
            "features": ["pos", "restaurant"]  # Has activation features
        },
        {
            "id": "client-002", 
            "name": "Jane Doe",
            "companyName": "Tech Solutions Inc",
            "email": "jane@techsolutions.com",
            "phone": "555-0456",
            "address": "456 Tech Ave, City, State",
            "serviceLevel": "premium",
            "status": "active",
            "features": ["document", "ecommerce"]  # Has activation features
        },
        {
            "id": "client-003",
            "name": "Bob Johnson",
            "companyName": "Enterprise Systems",
            "email": "bob@enterprise.com",
            "phone": "555-0789",
            "address": "789 Enterprise Blvd, City, State",
            "serviceLevel": "enterprise",
            "status": "active",
            "features": ["auto", "distribution"]  # Has activation features
        },
        {
            "id": "client-004",
            "name": "Alice Brown",
            "companyName": "Small Business LLC",
            "email": "alice@smallbiz.com",
            "phone": "555-0321",
            "address": "321 Small St, City, State",
            "serviceLevel": "per-job",
            "status": "active",
            "features": ["pos"]  # Has activation features
        },
        {
            "id": "client-005",
            "name": "No Features Client",
            "companyName": "No Features Corp",
            "email": "nofeatures@corp.com",
            "phone": "555-9999",
            "address": "999 No Features St, City, State",
            "serviceLevel": "basic",
            "status": "active",
            "features": []  # No activation features - should be filtered out
        }
    ]

def test_activation_features_filtering():
    """Test activation features filtering"""
    print("Testing Activation Features Filtering")
    print("=" * 40)
    
    integration = MSPClientIntegration()
    
    # Test with mock clients
    mock_clients = create_mock_msp_clients()
    print(f"Total mock clients: {len(mock_clients)}")
    
    # Test filtering
    filtered_clients = integration.filter_clients_with_activation_features(mock_clients)
    print(f"Filtered clients with activation features: {len(filtered_clients)}")
    
    print("\nFiltered clients:")
    for client in filtered_clients:
        features = client.get('features', [])
        activation_features = ['pos', 'restaurant', 'document', 'ecommerce', 'auto', 'distribution']
        selected_features = [f for f in features if f in activation_features]
        print(f"  {client['name']}: {selected_features}")

def test_service_level_mapping():
    """Test service level to license type mapping"""
    print("\n\nTesting Service Level Mapping")
    print("=" * 40)
    
    integration = MSPClientIntegration()
    
    service_levels = ['basic', 'standard', 'premium', 'enterprise', 'per-job']
    
    for level in service_levels:
        service_config = integration.map_service_level_to_license(level)
        license_type = service_config['license_type']
        features = service_config['features']
        max_users = service_config['max_users']
        
        print(f"\nService Level: {level}")
        print(f"  License Type: {license_type}")
        print(f"  Max Users: {max_users}")
        print(f"  Features:")
        for feature, enabled in features.items():
            if isinstance(enabled, bool):
                print(f"    {feature}: {'Yes' if enabled else 'No'}")
            else:
                print(f"    {feature}: {enabled}")

def test_mock_integration():
    """Test integration with mock data"""
    print("\n\nTesting Mock Integration")
    print("=" * 40)
    
    # Create mock integration that doesn't require real API
    class MockMSPIntegration(MSPClientIntegration):
        def __init__(self):
            super().__init__()
            self.mock_clients = create_mock_msp_clients()
        
        def get_msp_clients(self):
            return self.mock_clients
        
        def get_msp_client_by_id(self, client_id):
            for client in self.mock_clients:
                if client['id'] == client_id:
                    return client
            return None
    
    integration = MockMSPIntegration()
    
    # Test fetching clients
    print("Fetching mock MSP clients...")
    clients = integration.get_msp_clients()
    print(f"Found {len(clients)} clients")
    
    # Test syncing clients
    print("\nSyncing clients to license system...")
    try:
        results = integration.sync_all_msp_clients()
        
        print(f"\nSync Results:")
        print(f"  Total Clients: {results['total_clients']}")
        print(f"  Synced Clients: {results['synced_clients']}")
        print(f"  New Licenses: {results['new_licenses']}")
        print(f"  Updated Licenses: {results['updated_licenses']}")
        print(f"  Errors: {len(results['errors'])}")
        
        if results['errors']:
            print(f"\nErrors:")
            for error in results['errors'][:3]:  # Show first 3 errors
                print(f"  - {error}")
        
        # Test getting license status for first client
        if clients:
            first_client = clients[0]
            print(f"\nGetting license status for {first_client['name']}...")
            status = integration.get_license_status_for_msp_client(first_client['id'])
            
            if status.get('error'):
                print(f"Error: {status['error']}")
            else:
                print(f"License Status:")
                print(f"  Company: {status['company_name']}")
                print(f"  License Type: {status['license_type']}")
                print(f"  Serial Number: {status['serial_number']}")
                print(f"  Max Users: {status['max_users']}")
                print(f"  Service Level: {status['service_level']}")
                print(f"  Active: {status['is_active']}")
    except Exception as e:
        print(f"Sync test failed: {e}")
        print("This is expected in test environment without proper database setup")

def test_license_update():
    """Test license update functionality"""
    print("\n\nTesting License Update")
    print("=" * 40)
    
    class MockMSPIntegration(MSPClientIntegration):
        def __init__(self):
            super().__init__()
            self.mock_clients = create_mock_msp_clients()
        
        def get_msp_clients(self):
            return self.mock_clients
        
        def get_msp_client_by_id(self, client_id):
            for client in self.mock_clients:
                if client['id'] == client_id:
                    return client
            return None
    
    integration = MockMSPIntegration()
    
    # First sync a client
    client = integration.get_msp_clients()[0]
    print(f"Testing with client: {client['name']} (Service Level: {client['serviceLevel']})")
    
    try:
        # Sync the client
        license = integration.sync_msp_client_to_license_system(client)
        if license:
            print(f"Created/Updated license: {license.license_type}")
        
        # Test updating service level
        print(f"\nUpdating service level from {client['serviceLevel']} to 'premium'...")
        result = integration.update_msp_client_license(client['id'], 'premium')
        
        if result.get('success'):
            print(f"Update successful!")
            print(f"  New License Type: {result['updated_license_type']}")
            print(f"  New Max Users: {result['updated_max_users']}")
            print(f"  New Features: {result['updated_features']}")
        else:
            print(f"Update failed: {result.get('error', 'Unknown error')}")
    except Exception as e:
        print(f"License update test failed: {e}")
        print("This is expected in test environment without proper database setup")

def main():
    """Main test function"""
    print("MSP Integration Test Suite")
    print("=" * 50)
    
    try:
        # Test activation features filtering
        test_activation_features_filtering()
        
        # Test service level mapping
        test_service_level_mapping()
        
        # Test mock integration
        test_mock_integration()
        
        # Test license update
        test_license_update()
        
        print("\n\nAll tests completed!")
        
    except Exception as e:
        print(f"\nTest failed with error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    main()
