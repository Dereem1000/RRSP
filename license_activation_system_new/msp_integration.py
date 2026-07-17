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
from license_serial import (
    BUSINESS_LICENSE_FEATURE_KEYS,
    CODE_TO_LICENSE_KEY,
    ensure_unique_company_serial,
    ensure_unique_license_serial,
    feature_code_for_msp_feature,
    is_legacy_short_license_serial,
    parse_license_features,
    primary_system_code,
    primary_system_code_from_serial,
    resolve_license_feature_key,
    count_licenses_for_feature,
    next_device_seat,
    binding_status_label,
    LICENSE_KEY_TO_CODE,
)
from license_types import (
    DEFAULT_LICENSE_TYPE,
    DURATION_BY_LICENSE_TYPE,
    NO_TIME_LIMIT_DURATION,
    expiration_from_activation,
    normalize_license_type,
    resolve_duration_for_update,
    validate_license_type,
)

class MSPClientIntegration:
    """Handles MSP client integration with license activation system"""

    MSP_FEATURE_TO_LICENSE_KEY = {
        'pos': 'pos_systems',
        'restaurant': 'restaurant_management',
        'document': 'document_management',
        'ecommerce': 'ecommerce_websites',
        'auto': 'auto_system',
        'distribution': 'distribution_system',
        'crm': 'customer_management',
        'customer': 'customer_management',
        'inventory': 'inventory_management',
        'analytics': 'reporting_analytics',
        'multi_location': 'multi_location',
    }

    LICENSE_KEY_TO_MSP_FEATURE = {
        'pos_systems': 'pos',
        'restaurant_management': 'restaurant',
        'document_management': 'document',
        'ecommerce_websites': 'ecommerce',
        'auto_system': 'auto',
        'distribution_system': 'distribution',
        'customer_management': 'crm',
    }

    GUI_LABEL_TO_LICENSE_KEY = {
        'Point of Sale Systems': 'pos_systems',
        'Restaurant Management': 'restaurant_management',
        'Document Management': 'document_management',
        'E-commerce Websites': 'ecommerce_websites',
        'Auto System': 'auto_system',
        'Distribution System': 'distribution_system',
        'Inventory Management': 'inventory_management',
        'Reporting & Analytics': 'reporting_analytics',
        'Customer Management': 'customer_management',
        'Event Sponsor CRM': 'customer_management',
        'Multi-Location Support': 'multi_location',
    }

    ACTIVATION_FEATURES = frozenset({
        'pos', 'restaurant', 'document', 'ecommerce', 'auto', 'distribution', 'crm',
    })
    
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
        activation_features = list(self.ACTIVATION_FEATURES)
        
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
    
    @staticmethod
    def _parse_client_feature_list(raw) -> List[str]:
        if isinstance(raw, list):
            return [str(f) for f in raw]
        if isinstance(raw, str):
            try:
                parsed = json.loads(raw)
                return [str(f) for f in parsed] if isinstance(parsed, list) else []
            except json.JSONDecodeError:
                return []
        return []

    @staticmethod
    def _first_text(*values, default: str = '') -> str:
        """Return the first non-empty string; portal JSON often sends null instead of omitting keys."""
        for value in values:
            if value is not None and str(value).strip():
                return str(value).strip()
        return default

    @classmethod
    def _client_company_name(cls, client: Dict, msp_client_id: str = '') -> str:
        return cls._first_text(
            client.get('companyName'),
            client.get('company_name'),
            client.get('name'),
            default=f'MSP Client {msp_client_id}' if msp_client_id else 'Unknown Company',
        )

    @classmethod
    def _client_contact_person(cls, client: Dict) -> str:
        """Map portal client to license DB contact_person (matches license-sync: contactPerson || name)."""
        first = cls._first_text(client.get('firstName'), client.get('first_name'))
        last = cls._first_text(client.get('lastName'), client.get('last_name'))
        full_name = f'{first} {last}'.strip()
        return cls._first_text(
            client.get('contactPerson'),
            client.get('contact_person'),
            client.get('name'),
            client.get('contactName'),
            client.get('contact_name'),
            full_name,
            default='Unknown',
        )

    @classmethod
    def _client_email(cls, client: Dict) -> str:
        return cls._first_text(client.get('email'), default='no-email@local')

    @classmethod
    def _apply_client_fields(cls, company: CompanyRegistration, client: Dict) -> None:
        msp_client_id = str(client.get('id') or company.msp_client_id or '')
        company.company_name = cls._client_company_name(client, msp_client_id)
        company.contact_person = cls._client_contact_person(client)
        company.email = cls._client_email(client)
        company.phone = cls._first_text(client.get('phone'))
        company.address = cls._first_text(client.get('address'))

    @classmethod
    def _build_license_features_for_key(cls, license_feature_key: str) -> Dict[str, bool]:
        return {
            'inventory_management': True,
            'advanced_reporting': True,
            'api_access': True,
            'multi_location': True,
            'pos_systems': license_feature_key == 'pos_systems',
            'restaurant_management': license_feature_key == 'restaurant_management',
            'document_management': license_feature_key == 'document_management',
            'ecommerce_websites': license_feature_key == 'ecommerce_websites',
            'auto_system': license_feature_key == 'auto_system',
            'distribution_system': license_feature_key == 'distribution_system',
            'reporting_analytics': license_feature_key == 'reporting_analytics',
            'customer_management': license_feature_key == 'customer_management',
        }

    def sync_msp_client_to_license_system(self, client: Dict) -> Dict:
        """Sync a single MSP client to the license system (one license per management system)."""
        try:
            with self.create_app().app_context():
                try:
                    existing_company = CompanyRegistration.query.filter_by(
                        msp_client_id=client['id']
                    ).first()

                    if existing_company:
                        self._apply_client_fields(existing_company, client)
                        db.session.commit()

                        self._repair_combined_licenses_impl(existing_company.id)
                        sync_result = self._sync_licenses_for_msp_client(existing_company, client)
                        return {
                            'success': True,
                            'action': 'updated',
                            'company_id': existing_company.id,
                            'license_ids': sync_result['license_ids'],
                            'license_count': len(sync_result['license_ids']),
                            'licenses_created': sync_result['created'],
                            'licenses_updated': sync_result['updated'],
                        }

                    company = self._create_company_for_msp_client(client)
                    sync_result = self._sync_licenses_for_msp_client(company, client)

                    return {
                        'success': True,
                        'action': 'created',
                        'company_id': company.id,
                        'license_ids': sync_result['license_ids'],
                        'license_count': len(sync_result['license_ids']),
                        'licenses_created': sync_result['created'],
                        'licenses_updated': sync_result['updated'],
                    }
                except Exception as e:
                    db.session.rollback()
                    print(f"Error syncing client {client.get('name', 'Unknown')}: {e}")
                    return {
                        'success': False,
                        'error': str(e)
                    }

        except Exception as e:
            print(f"Error syncing client {client.get('name', 'Unknown')}: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def _enabled_business_feature_keys(self, features_raw) -> List[str]:
        features = parse_license_features(features_raw)
        keys = [key for key in BUSINESS_LICENSE_FEATURE_KEYS if features.get(key)]
        if keys:
            return keys
        from license_serial import MSP_FEATURE_TO_LICENSE_KEY

        for alias, key in MSP_FEATURE_TO_LICENSE_KEY.items():
            if features.get(alias) and key not in keys:
                keys.append(key)
        return keys

    def _primary_feature_key_for_license(self, license_row: LicenseActivation) -> str:
        enabled = self._enabled_business_feature_keys(license_row.features)
        if not enabled:
            resolved = resolve_license_feature_key(
                license_row.features,
                license_row.serial_number,
            )
            return resolved or 'pos_systems'
        serial = str(license_row.serial_number or '')
        if serial.upper().startswith('CD-LIC-'):
            parts = serial.split('-')
            if len(parts) >= 3:
                system_code = parts[2].upper()
                matched = CODE_TO_LICENSE_KEY.get(system_code)
                if matched and matched in enabled:
                    return matched
        return enabled[0]

    def _find_dedicated_license_for_feature(
        self, company_id: int, license_feature_key: str
    ) -> Optional[LicenseActivation]:
        for row in LicenseActivation.query.filter_by(company_id=company_id).all():
            enabled = self._enabled_business_feature_keys(row.features)
            if len(enabled) == 1 and enabled[0] == license_feature_key:
                return row
        return None

    def _repair_combined_licenses_impl(self, company_id: Optional[int] = None) -> Dict:
        """Split legacy rows that bundle multiple systems into one license per system."""
        from datetime import datetime, timezone

        if company_id is not None:
            license_rows = LicenseActivation.query.filter_by(company_id=company_id).all()
        else:
            license_rows = LicenseActivation.query.all()

        licenses_split = 0
        licenses_created = 0

        for license_row in license_rows:
            enabled = self._enabled_business_feature_keys(license_row.features)
            if len(enabled) <= 1:
                continue

            licenses_split += 1
            primary_key = self._primary_feature_key_for_license(license_row)
            extra_keys = [key for key in enabled if key != primary_key]

            license_row.features = json.dumps(self._build_license_features_for_key(primary_key))

            company = db.session.get(CompanyRegistration, license_row.company_id)
            msp_client_id = str(company.msp_client_id if company else '')

            for extra_key in extra_keys:
                if self._find_dedicated_license_for_feature(license_row.company_id, extra_key):
                    continue

                msp_feature = self.LICENSE_KEY_TO_MSP_FEATURE.get(extra_key, 'pos')
                license_serial = ensure_unique_license_serial(
                    db.session,
                    LicenseActivation,
                    msp_feature=msp_feature,
                    msp_client_id=msp_client_id,
                    device_seat=1,
                )
                if is_legacy_short_license_serial(str(license_serial)):
                    raise RuntimeError('Generated short or legacy license serial during repair')

                new_license = LicenseActivation(
                    serial_number=license_serial,
                    company_id=license_row.company_id,
                    license_type=license_row.license_type,
                    max_users=license_row.max_users,
                    service_level=license_row.service_level,
                    features=json.dumps(self._build_license_features_for_key(extra_key)),
                    activation_date=license_row.activation_date or datetime.now(timezone.utc),
                    expiration_date=license_row.expiration_date,
                    is_active=False,
                    browser_fingerprint=None,
                )
                db.session.add(new_license)
                licenses_created += 1

        if licenses_split:
            db.session.commit()

        return {
            'success': True,
            'licenses_split': licenses_split,
            'licenses_created': licenses_created,
        }

    def _repair_missing_license_features_impl(self, company_id: Optional[int] = None) -> Dict:
        """Set features JSON from serial when a row has no enabled business features."""
        if company_id is not None:
            license_rows = LicenseActivation.query.filter_by(company_id=company_id).all()
        else:
            license_rows = LicenseActivation.query.all()

        repaired = 0
        for license_row in license_rows:
            if self._enabled_business_feature_keys(license_row.features):
                continue
            key = resolve_license_feature_key(
                license_row.features,
                license_row.serial_number,
            )
            if not key:
                continue
            license_row.features = json.dumps(self._build_license_features_for_key(key))
            repaired += 1

        if repaired:
            db.session.commit()

        return {'success': True, 'licenses_repaired': repaired}

    def repair_missing_license_features(self, company_id: Optional[int] = None) -> Dict:
        try:
            with self.create_app().app_context():
                return self._repair_missing_license_features_impl(company_id)
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def repair_combined_licenses(self, company_id: Optional[int] = None) -> Dict:
        try:
            with self.create_app().app_context():
                return self._repair_combined_licenses_impl(company_id)
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def _find_license_for_feature(self, company_id: int, license_feature_key: str) -> Optional[LicenseActivation]:
        """Return the dedicated license row for this company + product feature."""
        dedicated = self._find_dedicated_license_for_feature(company_id, license_feature_key)
        if dedicated:
            return dedicated

        licenses = LicenseActivation.query.filter_by(company_id=company_id).all()
        for row in licenses:
            features = parse_license_features(row.features)
            if features.get(license_feature_key):
                return row
        return None

    def _find_unbound_inactive_license_for_feature(
        self, company_id: int, license_feature_key: str
    ) -> Optional[LicenseActivation]:
        """License waiting to be assigned to a device (not yet bound)."""
        licenses = LicenseActivation.query.filter_by(company_id=company_id).all()
        for row in licenses:
            features = parse_license_features(row.features)
            if features.get(license_feature_key) and not row.browser_fingerprint and not row.is_active:
                return row
        return None

    def _licenses_for_feature(self, company_id: int, license_feature_key: str) -> List[LicenseActivation]:
        rows = LicenseActivation.query.filter_by(company_id=company_id).all()
        matched = []
        for row in rows:
            features = parse_license_features(row.features)
            if features.get(license_feature_key):
                matched.append(row)
        return matched

    def _sync_licenses_for_msp_client(
        self,
        company: CompanyRegistration,
        client: Dict,
        *,
        license_type: Optional[str] = None,
        duration: int = 365,
        max_users: Optional[int] = None,
        feature_labels: Optional[List[str]] = None,
    ) -> Dict:
        """Ensure one license row per management system for this company."""
        from datetime import datetime, timezone, timedelta

        service_config = self.map_service_level_to_license(client.get('serviceLevel', 'basic'))
        if license_type:
            resolved_license_type = validate_license_type(license_type)
        else:
            resolved_license_type = DEFAULT_LICENSE_TYPE
        resolved_max_users = max_users if max_users is not None else service_config['max_users']
        service_level = client.get('serviceLevel', 'basic')
        duration_days, no_expiry = resolve_duration_for_update(
            resolved_license_type,
            duration if duration is not None else DURATION_BY_LICENSE_TYPE[resolved_license_type],
        )

        if feature_labels is not None:
            license_keys: List[tuple[str, str]] = []
            for label in feature_labels:
                license_key = self.GUI_LABEL_TO_LICENSE_KEY.get(label)
                if not license_key:
                    continue
                msp_feature = self.LICENSE_KEY_TO_MSP_FEATURE.get(license_key, 'pos')
                license_keys.append((msp_feature, license_key))
        else:
            client_features = self._parse_client_feature_list(client.get('features', []))
            license_keys = []
            for msp_feature in client_features:
                license_key = self.MSP_FEATURE_TO_LICENSE_KEY.get(msp_feature)
                if license_key:
                    license_keys.append((msp_feature, license_key))

        created_ids: List[int] = []
        updated_ids: List[int] = []
        company_licenses = LicenseActivation.query.filter_by(company_id=company.id).all()
        msp_client_id = str(client.get('id') or company.msp_client_id or '')
        now = datetime.now(timezone.utc)

        def apply_expiration(row: LicenseActivation) -> None:
            row.expiration_date = (
                None
                if no_expiry
                else expiration_from_activation(now, resolved_license_type, duration_days)
            )

        for msp_feature, license_feature_key in license_keys:
            license_features = self._build_license_features_for_key(license_feature_key)
            existing = self._find_license_for_feature(company.id, license_feature_key)

            if existing:
                existing.license_type = resolved_license_type
                existing.max_users = resolved_max_users
                existing.service_level = service_level
                existing.features = json.dumps(license_features)
                apply_expiration(existing)
                updated_ids.append(existing.id)
                continue

            reusable = self._find_unbound_inactive_license_for_feature(company.id, license_feature_key)
            if reusable:
                reusable.license_type = resolved_license_type
                reusable.max_users = resolved_max_users
                reusable.service_level = service_level
                reusable.features = json.dumps(license_features)
                apply_expiration(reusable)
                updated_ids.append(reusable.id)
                continue

            if count_licenses_for_feature(company_licenses, license_feature_key) > 0:
                print(
                    f"Skipping auto-create for {msp_feature} — company already has "
                    f"{count_licenses_for_feature(company_licenses, license_feature_key)} license(s). "
                    f"Use Add device license in the GUI for extra registers/PCs."
                )
                continue

            license_serial = ensure_unique_license_serial(
                db.session,
                LicenseActivation,
                msp_feature=msp_feature,
                msp_client_id=msp_client_id,
                device_seat=1,
            )
            if is_legacy_short_license_serial(str(license_serial)):
                raise RuntimeError('Generated short or legacy license serial; aborting license creation')

            activation_date = datetime.now(timezone.utc)
            expiration_date = (
                None
                if no_expiry
                else expiration_from_activation(activation_date, resolved_license_type, duration_days)
            )
            license_row = LicenseActivation(
                serial_number=license_serial,
                company_id=company.id,
                license_type=resolved_license_type,
                max_users=resolved_max_users,
                service_level=service_level,
                features=json.dumps(license_features),
                activation_date=activation_date,
                expiration_date=expiration_date,
                is_active=False,
            )
            db.session.add(license_row)
            db.session.flush()
            created_ids.append(license_row.id)
            company_licenses.append(license_row)

        db.session.commit()

        return {
            'license_ids': created_ids + updated_ids,
            'created': len(created_ids),
            'updated': len(updated_ids),
        }

    @classmethod
    def _create_stub_company(cls, msp_client_id: str) -> CompanyRegistration:
        """Minimal company row when portal client details are unavailable."""
        serial_number = ensure_unique_company_serial(db.session, CompanyRegistration, str(msp_client_id))
        company = CompanyRegistration(
            company_name=f'MSP Client {msp_client_id}',
            contact_person='Unknown',
            email='no-email@local',
            phone='',
            address='',
            serial_number=serial_number,
            msp_client_id=str(msp_client_id),
        )
        db.session.add(company)
        db.session.commit()
        db.session.refresh(company)
        return company

    def _create_company_for_msp_client(self, client: Dict) -> CompanyRegistration:
        """Create a new company registration for MSP client"""
        serial_number = ensure_unique_company_serial(db.session, CompanyRegistration, client.get('id'))
        
        company = CompanyRegistration(
            company_name=self._client_company_name(client, str(client.get('id', ''))),
            contact_person=self._client_contact_person(client),
            email=self._client_email(client),
            phone=self._first_text(client.get('phone')),
            address=self._first_text(client.get('address')),
            serial_number=serial_number,
            msp_client_id=client['id']
        )
        
        db.session.add(company)
        db.session.commit()
        db.session.refresh(company)
        return company
    
    def _create_license_for_msp_client(self, company: CompanyRegistration, client: Dict) -> List[LicenseActivation]:
        """Create separate licenses for each selected feature (legacy wrapper)."""
        result = self._sync_licenses_for_msp_client(company, client)
        if not result['license_ids']:
            return []
        return LicenseActivation.query.filter(LicenseActivation.id.in_(result['license_ids'])).all()
    
    def update_msp_client_license(self, msp_client_id: str, license_type: str, duration: int = 365, max_users: int = 5, features: list = None, license_id: int = None) -> Dict:
        """Update or create one license per selected management system for an MSP client."""
        print(f"\n[MSP-UPDATE-LICENSE] CALLED with:")
        print(f"  msp_client_id: {msp_client_id}")
        print(f"  license_type: {license_type}")
        print(f"  duration: {duration}")
        print(f"  features: {features}")
        print(f"  license_id: {license_id}")
        
        try:
            from datetime import datetime, timezone, timedelta
            
            with self.create_app().app_context():
                try:
                    company = CompanyRegistration.query.filter_by(msp_client_id=msp_client_id).first()
                    if not company:
                        try:
                            clients_response = self.get_msp_clients()
                            if 'error' not in clients_response:
                                clients = clients_response.get('clients', [])
                                client_data = None
                                for client in clients:
                                    if str(client.get('id')) == str(msp_client_id):
                                        client_data = client
                                        break

                                if client_data:
                                    company = self._create_company_for_msp_client(client_data)
                                else:
                                    company = self._create_stub_company(str(msp_client_id))
                            else:
                                company = self._create_stub_company(str(msp_client_id))
                        except Exception:
                            db.session.rollback()
                            company = self._create_stub_company(str(msp_client_id))

                    selected_features = features or []
                    try:
                        license_type = validate_license_type(license_type)
                        duration_days, no_expiry = resolve_duration_for_update(license_type, duration)
                    except ValueError as exc:
                        return {'success': False, 'error': str(exc)}

                    if license_id:
                        license_row = LicenseActivation.query.filter_by(id=license_id, company_id=company.id).first()
                        if not license_row:
                            return {'success': False, 'error': f'License with ID {license_id} not found for this company'}

                        license_row.license_type = license_type
                        license_row.max_users = max_users
                        now = datetime.now(timezone.utc)
                        license_row.expiration_date = (
                            None
                            if no_expiry
                            else expiration_from_activation(now, license_type, duration_days)
                        )

                        if selected_features:
                            updated_features = {
                                'inventory_management': True,
                                'advanced_reporting': True,
                                'api_access': True,
                                'multi_location': True,
                                'pos_systems': False,
                                'restaurant_management': False,
                                'document_management': False,
                                'ecommerce_websites': False,
                                'auto_system': False,
                                'distribution_system': False,
                                'reporting_analytics': False,
                                'customer_management': False,
                            }
                            for feature in selected_features:
                                feature_key = self.GUI_LABEL_TO_LICENSE_KEY.get(feature)
                                if feature_key:
                                    updated_features[feature_key] = True
                            license_row.features = json.dumps(updated_features)

                        db.session.commit()
                        db.session.refresh(license_row)
                        return {
                            'success': True,
                            'license_id': license_row.id,
                            'action': 'updated',
                            'created_licenses': 0,
                            'updated_licenses': 1,
                            'deleted_licenses': 0,
                        }

                    if not selected_features:
                        return {'success': False, 'error': 'Select at least one product'}

                    client_stub = {'id': msp_client_id, 'serviceLevel': 'standard'}
                    sync_result = self._sync_licenses_for_msp_client(
                        company,
                        client_stub,
                        license_type=license_type,
                        duration=duration_days,
                        max_users=max_users,
                        feature_labels=selected_features,
                    )

                    return {
                        'success': True,
                        'license_ids': sync_result['license_ids'],
                        'action': 'created' if sync_result['created'] else 'updated',
                        'created_licenses': sync_result['created'],
                        'updated_licenses': sync_result['updated'],
                        'deleted_licenses': 0,
                    }
                except Exception as e:
                    db.session.rollback()
                    return {'success': False, 'error': str(e)}
                
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
                        new_licenses += result.get('licenses_created', 0)
                        updated_licenses += result.get('licenses_updated', 0)
                    else:
                        errors.append(f"Failed to sync client {client.get('name', 'Unknown')}: {result.get('error', 'Unknown error')}")
                except Exception as e:
                    errors.append(f"Error syncing client {client.get('name', 'Unknown')}: {str(e)}")
            
            return {
                'success': True,
                'total_clients': clients_response.get('total_clients', 0),
                'filtered_clients': len(filtered_clients),
                'synced_count': synced_clients,
                'companies_created': synced_clients if new_licenses else 0,
                'licenses_created': new_licenses,
                'licenses_updated': updated_licenses,
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