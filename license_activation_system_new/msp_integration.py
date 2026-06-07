"""
MSP Client Integration Module
Handles integration between MSP system and license activation system
"""

import requests
import json
import os
from typing import List, Dict, Optional
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from models import db, CompanyRegistration, LicenseActivation

class MSPClientIntegration:
    """Handles MSP client integration with license activation system"""
    
    def __init__(self):
        self.msp_api_url = os.environ.get(
            "MSP_API_URL", "http://localhost:3000/api/msp"
        )
        self.api_token = os.environ.get("MSP_API_TOKEN", "")
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        })

    @property
    def api_url(self) -> str:
        return self.msp_api_url

    @api_url.setter
    def api_url(self, value: str) -> None:
        self.msp_api_url = value.rstrip("/") if value else self.msp_api_url
    
    @staticmethod
    def create_app():
        """Create Flask app for database operations"""
        app = Flask(__name__)
        # Use relative path to instance directory
        instance_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance')
        os.makedirs(instance_dir, exist_ok=True)
        db_path = os.path.join(instance_dir, 'license_system.db')
        app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
        app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
        db.init_app(app)
        return app
    
    def filter_clients_with_activation_features(self, clients: List[Dict]) -> List[Dict]:
        """Filter clients that have activation features selected"""
        # Define the activation features that require license activation
        activation_features = ['pos', 'restaurant', 'document', 'ecommerce', 'auto', 'distribution']
        
        filtered_clients = []
        for client in clients:
            # Check if client has any activation features selected
            client_features = client.get('features', [])
            if isinstance(client_features, str):
                try:
                    client_features = json.loads(client_features)
                except:
                    client_features = []
            
            # Check if client has at least one activation feature
            has_activation_feature = any(feature in client_features for feature in activation_features)
            
            if has_activation_feature:
                filtered_clients.append(client)
                print(f"Client {client.get('name', 'Unknown')} has activation features: {[f for f in client_features if f in activation_features]}")
            else:
                print(f"Client {client.get('name', 'Unknown')} has no activation features: {client_features}")
        
        print(f"Filtered {len(filtered_clients)} clients with activation features from {len(clients)} total clients")
        return filtered_clients
    
    def get_msp_clients(self) -> List[Dict]:
        """Fetch MSP clients from the MSP system"""
        try:
            # Add authorization header if token is set
            headers = {}
            if self.api_token:
                headers['Authorization'] = f'Bearer {self.api_token}'
            
            print(f"[DEBUG] API Token in integration: {self.api_token[:20] + '...' if self.api_token else 'None'}")
            print(f"[DEBUG] Session headers: {self.session.headers}")
            
            response = self.session.get(f"{self.msp_api_url}/clients", headers=headers)
            print(f"Requesting MSP clients from: {self.msp_api_url}/clients")
            print(f"Using token: {self.api_token[:20] + '...' if self.api_token else 'None'}")
            print(f"Response status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                clients = data.get('clients', [])
                print(f"Found {len(clients)} total clients from API")
                
                # Filter clients with activation features
                filtered_clients = self.filter_clients_with_activation_features(clients)
                return {
                    'clients': filtered_clients,
                    'total_clients': len(clients),
                    'filtered_clients': len(filtered_clients)
                }
            else:
                print(f"Failed to fetch MSP clients: {response.status_code}")
                print(f"Response: {response.text}")
                return {'error': f'HTTP {response.status_code}: {response.text}'}
        except Exception as e:
            print(f"Error fetching MSP clients: {e}")
            return {'error': str(e)}
    
    def map_service_level_to_license(self, service_level: str) -> Dict:
        """Map MSP service level to license configuration"""
        mapping = {
            'basic': {
                'license_type': 'basic',
                'max_users': 5,
                'features': {
                    'inventory_management': True,
                    'advanced_reporting': False,
                    'api_access': False,
                    'multi_location': False,
                    'onsite_visits': 4,
                    'support_tickets': 20,
                    'endpoints': 0,
                    'support_hours': 0
                }
            },
            'standard': {
                'license_type': 'premium',
                'max_users': 10,
                'features': {
                    'inventory_management': True,
                    'advanced_reporting': True,
                    'api_access': True,
                    'multi_location': False,
                    'onsite_visits': 8,
                    'support_tickets': 50,
                    'endpoints': 5,
                    'support_hours': 0
                }
            },
            'premium': {
                'license_type': 'premium',
                'max_users': 25,
                'features': {
                    'inventory_management': True,
                    'advanced_reporting': True,
                    'api_access': True,
                    'multi_location': False,
                    'onsite_visits': 12,
                    'support_tickets': 100,
                    'endpoints': 10,
                    'support_hours': 12
                }
            },
            'enterprise': {
                'license_type': 'enterprise',
                'max_users': 100,
                'features': {
                    'inventory_management': True,
                    'advanced_reporting': True,
                    'api_access': True,
                    'multi_location': True,
                    'onsite_visits': 20,
                    'support_tickets': 200,
                    'endpoints': 20,
                    'support_hours': 24
                }
            },
            'per-job': {
                'license_type': 'basic',
                'max_users': 3,
                'features': {
                    'inventory_management': True,
                    'advanced_reporting': False,
                    'api_access': False,
                    'multi_location': False,
                    'onsite_visits': 0,
                    'support_tickets': 0,
                    'endpoints': 0,
                    'support_hours': 0
                }
            }
        }
        
        return mapping.get(service_level, mapping['basic'])
    
    def sync_msp_client_to_license_system(self, client: Dict) -> Dict:
        """Sync a single MSP client to the license system"""
        try:
            with self.create_app().app_context():
                # Check if company already exists
                existing_company = CompanyRegistration.query.filter_by(
                    msp_client_id=client['id']
                ).first()
                
                if existing_company:
                    # Update existing company
                    existing_company.company_name = client.get('companyName', client.get('name', ''))
                    existing_company.contact_person = client.get('contactPerson', client.get('name', ''))
                    existing_company.email = client.get('email', '')
                    existing_company.phone = client.get('phone', '')
                    existing_company.address = client.get('address', '')
                    db.session.commit()
                    
                    # Update license
                    license = LicenseActivation.query.filter_by(
                        company_id=existing_company.id
                    ).first()
                    
                    if license:
                        service_config = self.map_service_level_to_license(client.get('serviceLevel', 'basic'))
                        license.license_type = service_config['license_type']
                        license.max_users = service_config['max_users']
                        license.service_level = client.get('serviceLevel', 'basic')
                        license.features = json.dumps(service_config['features'])
                        db.session.commit()
                        db.session.refresh(license)
                        
                        return {
                            'success': True,
                            'action': 'updated',
                            'company_id': existing_company.id,
                            'license_id': license.id
                        }
                    else:
                        # Create new licenses for each feature
                        licenses = self._create_license_for_msp_client(existing_company, client)
                        return {
                            'success': True,
                            'action': 'created_license',
                            'company_id': existing_company.id,
                            'license_ids': [license.id for license in licenses],
                            'license_count': len(licenses)
                        }
                else:
                    # Create new company and licenses for each feature
                    company = self._create_company_for_msp_client(client)
                    licenses = self._create_license_for_msp_client(company, client)
                    
                    return {
                        'success': True,
                        'action': 'created',
                        'company_id': company.id,
                        'license_ids': [license.id for license in licenses],
                        'license_count': len(licenses)
                    }
                    
        except Exception as e:
            print(f"Error syncing client {client.get('name', 'Unknown')}: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def _create_company_for_msp_client(self, client: Dict) -> CompanyRegistration:
        """Create a new company registration for MSP client"""
        import uuid
        from datetime import datetime, timezone
        
        # Generate a unique serial number
        serial_number = f"MSP-{client['id'][:8]}-{datetime.now().strftime('%Y%m%d')}"
        
        company = CompanyRegistration(
            company_name=client.get('companyName', client.get('name', '')),
            contact_person=client.get('contactPerson', client.get('name', '')),
            email=client.get('email', ''),
            phone=client.get('phone', ''),
            address=client.get('address', ''),
            serial_number=serial_number,
            msp_client_id=client['id']
        )
        
        db.session.add(company)
        db.session.commit()
        db.session.refresh(company)
        return company
    
    def _create_license_for_msp_client(self, company: CompanyRegistration, client: Dict) -> List[LicenseActivation]:
        """Create separate licenses for each selected feature"""
        from datetime import datetime, timezone, timedelta
        import uuid
        
        service_config = self.map_service_level_to_license(client.get('serviceLevel', 'basic'))
        
        # Get client activation features
        client_features = client.get('features', [])
        if isinstance(client_features, str):
            try:
                client_features = json.loads(client_features)
            except:
                client_features = []
        
        # Map MSP feature names to license feature keys
        feature_mapping = {
            'pos': 'pos_systems',
            'restaurant': 'restaurant_management', 
            'document': 'document_management',
            'ecommerce': 'ecommerce_websites',
            'auto': 'auto_system',
            'distribution': 'distribution_system',
            'inventory': 'inventory_management',
            'analytics': 'reporting_analytics',
            'customer': 'customer_management',
            'multi_location': 'multi_location'
        }
        
        created_licenses = []
        
        # Create a separate license for each selected feature
        for msp_feature in client_features:
            if msp_feature in feature_mapping:
                license_feature_key = feature_mapping[msp_feature]
                
                # Generate unique serial number for this specific feature license
                timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
                license_serial = f"LIC-{company.serial_number}-{msp_feature.upper()}-{timestamp}"
                
                # Set activation and expiration dates
                activation_date = datetime.now(timezone.utc)
                expiration_date = activation_date + timedelta(days=365)  # 1 year license
                
                # Create features object with only this specific feature enabled
                license_features = {
                    'inventory_management': True,  # Technical feature - always enabled
                    'advanced_reporting': True,   # Technical feature - always enabled
                    'api_access': True,           # Technical feature - always enabled
                    'multi_location': True,       # Technical feature - always enabled
                    'pos_systems': license_feature_key == 'pos_systems',
                    'restaurant_management': license_feature_key == 'restaurant_management',
                    'document_management': license_feature_key == 'document_management',
                    'ecommerce_websites': license_feature_key == 'ecommerce_websites',
                    'auto_system': license_feature_key == 'auto_system',
                    'distribution_system': license_feature_key == 'distribution_system',
                    'inventory_management': license_feature_key == 'inventory_management',
                    'reporting_analytics': license_feature_key == 'reporting_analytics',
                    'customer_management': license_feature_key == 'customer_management',
                    'multi_location': license_feature_key == 'multi_location'
                }
                
                license = LicenseActivation(
                    serial_number=license_serial,
                    company_id=company.id,
                    license_type=service_config['license_type'],
                    max_users=service_config['max_users'],
                    service_level=client.get('serviceLevel', 'basic'),
                    features=json.dumps(license_features),
                    activation_date=activation_date,
                    expiration_date=expiration_date,
                    is_active=False  # Created but not activated - requires manual activation
                )
                
                db.session.add(license)
                created_licenses.append(license)
        
        db.session.commit()
        
        # Refresh all licenses to get their IDs
        for license in created_licenses:
            db.session.refresh(license)
        
        return created_licenses
    
    def update_msp_client_license(self, msp_client_id: str, license_type: str, duration: int = 365, max_users: int = 5, features: list = None, license_id: int = None) -> Dict:
        """Update or create license for MSP client
        
        Args:
            msp_client_id: The MSP client ID
            license_type: License type (e.g., 'Day Pass', 'Trial 7 Days', etc.)
            duration: Duration in days (default: 365)
            max_users: Maximum number of users (default: 5)
            features: List of selected features (default: None)
            license_id: Specific license ID to update (None to create new or update first) (default: None)
        """
        try:
            from datetime import datetime, timezone, timedelta
            import uuid
            
            with self.create_app().app_context():
                company = CompanyRegistration.query.filter_by(msp_client_id=msp_client_id).first()
                if not company:
                    # Automatically create company from MSP client data
                    # Fetch client data from MSP API
                    try:
                        # Get all clients and find the one we need
                        clients_response = self.get_msp_clients()
                        if 'error' not in clients_response:
                            clients = clients_response.get('clients', [])
                            client_data = None
                            for client in clients:
                                if str(client.get('id')) == str(msp_client_id):
                                    client_data = client
                                    break
                            
                            if client_data:
                                # Create company using the helper method
                                company = self._create_company_for_msp_client(client_data)
                            else:
                                # If client not found in API, create with minimal data
                                from datetime import datetime
                                serial_number = f"MSP-{str(msp_client_id)[:8]}-{datetime.now().strftime('%Y%m%d')}"
                                company = CompanyRegistration(
                                    company_name=f"MSP Client {msp_client_id}",
                                    contact_person="Unknown",
                                    email="",
                                    phone="",
                                    address="",
                                    serial_number=serial_number,
                                    msp_client_id=str(msp_client_id)
                                )
                                db.session.add(company)
                                db.session.commit()
                                db.session.refresh(company)
                        else:
                            # If API call fails, create with minimal data
                            from datetime import datetime
                            serial_number = f"MSP-{str(msp_client_id)[:8]}-{datetime.now().strftime('%Y%m%d')}"
                            company = CompanyRegistration(
                                company_name=f"MSP Client {msp_client_id}",
                                contact_person="Unknown",
                                email="",
                                phone="",
                                address="",
                                serial_number=serial_number,
                                msp_client_id=str(msp_client_id)
                            )
                            db.session.add(company)
                            db.session.commit()
                            db.session.refresh(company)
                    except Exception as e:
                        # If API call fails, create with minimal data
                        from datetime import datetime
                        serial_number = f"MSP-{str(msp_client_id)[:8]}-{datetime.now().strftime('%Y%m%d')}"
                        company = CompanyRegistration(
                            company_name=f"MSP Client {msp_client_id}",
                            contact_person="Unknown",
                            email="",
                            phone="",
                            address="",
                            serial_number=serial_number,
                            msp_client_id=str(msp_client_id)
                        )
                        db.session.add(company)
                        db.session.commit()
                        db.session.refresh(company)
                
                # If license_id is provided, update that specific license
                # If license_id is None, create a new license (even if others exist)
                license = None
                if license_id:
                    license = LicenseActivation.query.filter_by(id=license_id, company_id=company.id).first()
                    if not license:
                        return {'success': False, 'error': f'License with ID {license_id} not found for this company'}
                
                if not license:
                    # Create new license if it doesn't exist
                    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
                    license_serial = f"LIC-{company.serial_number}-{timestamp}"
                    
                    # Set activation and expiration dates
                    activation_date = datetime.now(timezone.utc)
                    if duration == 9999:  # No time limit
                        expiration_date = None
                    else:
                        expiration_date = activation_date + timedelta(days=duration)
                    
                    # Map features
                    feature_mapping = {
                        'Point of Sale Systems': 'pos_systems',
                        'Restaurant Management': 'restaurant_management',
                        'Document Management': 'document_management',
                        'E-commerce Websites': 'ecommerce_websites',
                        'Auto System': 'auto_system',
                        'Distribution System': 'distribution_system',
                        'Inventory Management': 'inventory_management',
                        'Reporting & Analytics': 'reporting_analytics',
                        'Customer Management': 'customer_management',
                        'Multi-Location Support': 'multi_location'
                    }
                    
                    # Build features dictionary
                    if features:
                        updated_features = {
                            'inventory_management': True,  # Technical feature - always enabled
                            'advanced_reporting': True,   # Technical feature - always enabled
                            'api_access': True,           # Technical feature - always enabled
                            'multi_location': True,       # Technical feature - always enabled
                            'pos_systems': False,
                            'restaurant_management': False,
                            'document_management': False,
                            'ecommerce_websites': False,
                            'auto_system': False,
                            'distribution_system': False,
                            'reporting_analytics': False,
                            'customer_management': False
                        }
                        
                        # Enable selected features
                        for feature in features:
                            if feature in feature_mapping:
                                feature_key = feature_mapping[feature]
                                updated_features[feature_key] = True
                    else:
                        # Default features if none specified
                        updated_features = {
                            'inventory_management': True,
                            'advanced_reporting': True,
                            'api_access': True,
                            'multi_location': True,
                            'pos_systems': True,
                            'restaurant_management': False,
                            'document_management': False,
                            'ecommerce_websites': False,
                            'auto_system': False,
                            'distribution_system': False,
                            'reporting_analytics': False,
                            'customer_management': False
                        }
                    
                    # Create new license
                    license = LicenseActivation(
                        serial_number=license_serial,
                        company_id=company.id,
                        license_type=license_type,
                        max_users=max_users,
                        service_level='standard',  # Default service level
                        features=json.dumps(updated_features),
                        activation_date=activation_date,
                        expiration_date=expiration_date,
                        is_active=False  # Created but not activated
                    )
                    
                    db.session.add(license)
                    db.session.commit()
                    db.session.refresh(license)
                    
                    return {
                        'success': True,
                        'license_id': license.id,
                        'action': 'created',
                        'created_licenses': 1,
                        'updated_licenses': 0,
                        'deleted_licenses': 0
                    }
                else:
                    # Update existing license
                    license.license_type = license_type
                    license.max_users = max_users
                    
                    # Update expiration date
                    if duration == 9999:  # No time limit
                        license.expiration_date = None
                    else:
                        now = datetime.now(timezone.utc)
                        license.expiration_date = now + timedelta(days=duration)
                    
                    # Update features if provided
                    if features is not None:
                        feature_mapping = {
                            'Point of Sale Systems': 'pos_systems',
                            'Restaurant Management': 'restaurant_management',
                            'Document Management': 'document_management',
                            'E-commerce Websites': 'ecommerce_websites',
                            'Auto System': 'auto_system',
                            'Distribution System': 'distribution_system',
                            'Inventory Management': 'inventory_management',
                            'Reporting & Analytics': 'reporting_analytics',
                            'Customer Management': 'customer_management',
                            'Multi-Location Support': 'multi_location'
                        }
                        
                        updated_features = {
                            'inventory_management': True,  # Technical feature - always enabled
                            'advanced_reporting': True,   # Technical feature - always enabled
                            'api_access': True,           # Technical feature - always enabled
                            'multi_location': True,       # Technical feature - always enabled
                            'pos_systems': False,
                            'restaurant_management': False,
                            'document_management': False,
                            'ecommerce_websites': False,
                            'auto_system': False,
                            'distribution_system': False,
                            'reporting_analytics': False,
                            'customer_management': False
                        }
                        
                        # Enable selected features
                        for feature in features:
                            if feature in feature_mapping:
                                feature_key = feature_mapping[feature]
                                updated_features[feature_key] = True
                        
                        license.features = json.dumps(updated_features)
                    
                    db.session.commit()
                    db.session.refresh(license)
                    
                    return {
                        'success': True,
                        'license_id': license.id,
                        'action': 'updated',
                        'created_licenses': 0,
                        'updated_licenses': 1,
                        'deleted_licenses': 0
                    }
                
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def get_license_status_for_msp_client(self, msp_client_id: str) -> Dict:
        """Get license status for MSP client"""
        try:
            with self.create_app().app_context():
                company = CompanyRegistration.query.filter_by(msp_client_id=msp_client_id).first()
                if not company:
                    return {'error': 'Company not found'}
                
                license = LicenseActivation.query.filter_by(company_id=company.id).first()
                if not license:
                    return {'error': 'License not found'}
                
                features = json.loads(license.features) if license.features else {}
                
                return {
                    'is_active': license.is_active,
                    'license_type': license.license_type,
                    'max_users': license.max_users,
                    'service_level': license.service_level,
                    'features': features,
                    'serial_number': license.serial_number
                }
                
        except Exception as e:
            return {'error': str(e)}
    
    def sync_all_msp_clients(self) -> Dict:
        """Sync all MSP clients to the license system"""
        try:
            # Get all MSP clients
            clients_response = self.get_msp_clients()
            if 'error' in clients_response:
                return clients_response
            
            # Get filtered clients (already filtered in get_msp_clients)
            filtered_clients = clients_response.get('clients', [])
            if not filtered_clients:
                return {
                    'total_clients': clients_response.get('total_clients', 0),
                    'filtered_clients': 0,
                    'synced_clients': 0,
                    'new_licenses': 0,
                    'updated_licenses': 0,
                    'errors': []
                }
            
            synced_clients = 0
            new_licenses = 0
            updated_licenses = 0
            errors = []
            
            # Sync each client
            for client in filtered_clients:
                try:
                    result = self.sync_msp_client_to_license_system(client)
                    if result.get('success'):
                        synced_clients += 1
                        if result.get('action') == 'created_license':
                            new_licenses += 1
                        elif result.get('action') == 'updated':
                            updated_licenses += 1
                    else:
                        errors.append(f"Failed to sync client {client.get('name', 'Unknown')}: {result.get('error', 'Unknown error')}")
                except Exception as e:
                    errors.append(f"Error syncing client {client.get('name', 'Unknown')}: {str(e)}")
            
            return {
                'success': True,
                'total_clients': clients_response.get('total_clients', 0),
                'filtered_clients': len(filtered_clients),
                'synced_count': synced_clients,
                'companies_created': new_licenses,  # Assuming new licenses means new companies
                'licenses_created': new_licenses,
                'errors': errors
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'total_clients': 0,
                'synced_clients': 0,
                'new_licenses': 0,
                'updated_licenses': 0,
                'errors': [f"Sync failed: {str(e)}"]
            }
    
    def activate_msp_license(self, license_id: int) -> Dict:
        """Activate a license that was created from MSP sync"""
        try:
            with self.create_app().app_context():
                license = LicenseActivation.query.get(license_id)
                if not license:
                    return {'success': False, 'error': 'License not found'}
                
                if license.is_active:
                    return {'success': False, 'error': 'License is already active'}
                
                # Activate the license
                from datetime import datetime, timezone
                license.is_active = True
                license.activation_date = datetime.now(timezone.utc)
                db.session.commit()
                
                return {
                    'success': True,
                    'message': f'License {license.serial_number} activated successfully'
                }
                
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def get_pending_licenses(self) -> List[Dict]:
        """Get all licenses that are created but not activated"""
        try:
            with self.create_app().app_context():
                pending_licenses = LicenseActivation.query.filter_by(is_active=False).all()
                
                result = []
                for license in pending_licenses:
                    company = CompanyRegistration.query.get(license.company_id)
                    result.append({
                        'id': license.id,
                        'serial_number': license.serial_number,
                        'company_name': company.company_name if company else 'Unknown',
                        'license_type': license.license_type,
                        'service_level': license.service_level,
                        'max_users': license.max_users,
                        'created_at': license.created_at
                    })
                
                return result
                
        except Exception as e:
            print(f"Error getting pending licenses: {e}")
            return []
    
    def delete_company_and_licenses(self, company_id: int) -> Dict:
        """Delete a company and all its associated licenses"""
        try:
            with self.create_app().app_context():
                # Find the company
                company = CompanyRegistration.query.get(company_id)
                if not company:
                    return {'success': False, 'error': 'Company not found'}
                
                # Get all licenses for this company
                licenses = LicenseActivation.query.filter_by(company_id=company_id).all()
                license_count = len(licenses)
                
                # Delete all licenses first (to avoid foreign key constraint)
                for license in licenses:
                    db.session.delete(license)
                
                # Delete the company
                db.session.delete(company)
                
                # Commit the changes
                db.session.commit()
                
                return {
                    'success': True,
                    'message': f'Company {company.company_name} and {license_count} associated licenses deleted successfully'
                }
                
        except Exception as e:
            db.session.rollback()
            return {'success': False, 'error': str(e)}
    
    def delete_license_only(self, license_id: int) -> Dict:
        """Delete only a specific license"""
        try:
            with self.create_app().app_context():
                license = LicenseActivation.query.get(license_id)
                if not license:
                    return {'success': False, 'error': 'License not found'}
                
                license_serial = license.serial_number
                db.session.delete(license)
                db.session.commit()
                
                return {
                    'success': True,
                    'message': f'License {license_serial} deleted successfully'
                }
                
        except Exception as e:
            db.session.rollback()
            return {'success': False, 'error': str(e)}
    
    def get_company_with_licenses(self, company_id: int) -> Dict:
        """Get company information with all its licenses"""
        try:
            with self.create_app().app_context():
                company = CompanyRegistration.query.get(company_id)
                if not company:
                    return {'success': False, 'error': 'Company not found'}
                
                licenses = LicenseActivation.query.filter_by(company_id=company_id).all()
                
                return {
                    'success': True,
                    'company': {
                        'id': company.id,
                        'name': company.company_name,
                        'contact_person': company.contact_person,
                        'email': company.email,
                        'phone': company.phone,
                        'msp_client_id': company.msp_client_id
                    },
                    'licenses': [
                        {
                            'id': license.id,
                            'serial_number': license.serial_number,
                            'license_type': license.license_type,
                            'service_level': license.service_level,
                            'is_active': license.is_active,
                            'max_users': license.max_users,
                            'activation_date': license.activation_date,
                            'expiration_date': license.expiration_date
                        }
                        for license in licenses
                    ]
                }
                
        except Exception as e:
            return {'success': False, 'error': str(e)}