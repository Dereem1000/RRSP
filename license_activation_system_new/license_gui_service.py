"""Shared license GUI business logic for classic and modern interfaces."""

from __future__ import annotations

import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Callable, Optional

import requests

from models import db, CompanyRegistration, LicenseActivation, LicenseValidationLog, SystemConfiguration
from msp_integration import MSPClientIntegration

from license_activation_gui import (
    BUSINESS_LICENSE_FEATURE_KEYS,
    GUI_LICENSE_FEATURE_KEY_TO_LABEL,
    GUI_LICENSE_FEATURE_LABEL_TO_KEY,
    create_app,
    enabled_business_feature_labels,
    license_row_display_status,
    summarize_license_statuses,
)

from license_types import (
    DEFAULT_LICENSE_TYPE,
    DURATION_BY_LICENSE_TYPE,
    LICENSE_TYPE_OPTIONS,
    NO_TIME_LIMIT_DURATION,
    expiration_from_activation,
    normalize_license_type,
    parse_duration_days,
    resolve_duration_for_update,
    validate_license_type,
)

BUSINESS_PRODUCT_OPTIONS = [
    GUI_LICENSE_FEATURE_KEY_TO_LABEL[key] for key in BUSINESS_LICENSE_FEATURE_KEYS
]


class LicenseGuiService:
    def __init__(self) -> None:
        self.msp = MSPClientIntegration()

    def ensure_database(self) -> None:
        app = create_app()
        with app.app_context():
            db.create_all()

    def _run(self, fn: Callable[[], Any]) -> Any:
        app = create_app()
        with app.app_context():
            return fn()

    def load_msp_config(self) -> dict[str, str]:
        def inner() -> dict[str, str]:
            url = SystemConfiguration.query.filter_by(config_key='msp_api_url').first()
            token = SystemConfiguration.query.filter_by(config_key='msp_api_token').first()
            return {
                'msp_api_url': (url.config_value if url else self.msp.api_url) or '',
                'msp_api_token': (token.config_value if token else self.msp.api_token) or '',
            }

        config = self._run(inner)
        self.msp.api_url = config['msp_api_url']
        self.msp.api_token = config['msp_api_token']
        return config

    def save_msp_config(self, api_url: str, api_token: str) -> None:
        def inner() -> None:
            for key, value in (('msp_api_url', api_url), ('msp_api_token', api_token)):
                row = SystemConfiguration.query.filter_by(config_key=key).first()
                if row:
                    row.config_value = value
                else:
                    db.session.add(SystemConfiguration(config_key=key, config_value=value))
            db.session.commit()

        self._run(inner)
        self.msp.api_url = api_url.strip()
        self.msp.api_token = api_token.strip()

    def sync_msp_token_to_mini(self) -> dict[str, Any]:
        config = self.load_msp_config()
        api_url = str(config.get("msp_api_url") or "").strip()
        api_token = str(config.get("msp_api_token") or "").strip()
        if not api_url or not api_token:
            return {
                "success": False,
                "error": "Save the portal API URL and bearer token before syncing to Mini.",
            }

        v2_root = Path(__file__).resolve().parents[1]
        dock_path = v2_root / "data" / "mini-dock.json"
        if not dock_path.exists():
            return {
                "success": False,
                "error": "Mini dock config not found. Dock Mini in the CD portal Settings → Integrations first.",
            }

        try:
            dock = json.loads(dock_path.read_text(encoding="utf-8"))
        except Exception as exc:
            return {"success": False, "error": f"Could not read Mini dock config: {exc}"}

        if not dock.get("docked"):
            return {
                "success": False,
                "error": "Mini is not docked in the CD portal. Enable Mini dock in Settings → Integrations.",
            }

        mini_api_token = str(dock.get("apiToken") or "").strip()
        mini_base_url = str(dock.get("localUrl") or "http://127.0.0.1:8876").strip().rstrip("/")
        if not mini_api_token:
            return {
                "success": False,
                "error": "Mini API token is missing from mini-dock.json. Re-save Mini dock settings in the portal.",
            }

        try:
            response = requests.post(
                f"{mini_base_url}/api/cd/msp-sync",
                headers={
                    "Authorization": f"Bearer {mini_api_token}",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                json={
                    "msp_api_url": api_url,
                    "msp_api_token": api_token,
                    "source": "license_gui",
                },
                timeout=30,
            )
            payload = response.json() if response.content else {}
        except Exception as exc:
            return {"success": False, "error": f"Mini sync request failed: {exc}"}

        if response.status_code >= 400 or not payload.get("ok"):
            return {
                "success": False,
                "error": str(payload.get("error") or payload.get("message") or f"Mini returned HTTP {response.status_code}"),
            }

        return {
            "success": True,
            "message": "MSP sync token pushed to Mini. Project Guard can deactivate licenses on baseline tamper.",
            "mini_base_url": mini_base_url,
            "token_preview": payload.get("token_preview"),
            "synced_at": payload.get("synced_at"),
        }

    def get_dashboard(self) -> dict[str, Any]:
        def inner() -> dict[str, Any]:
            companies = CompanyRegistration.query.count()
            licenses = LicenseActivation.query.all()
            counts = summarize_license_statuses(licenses)
            recent = (
                LicenseActivation.query.order_by(LicenseActivation.created_at.desc()).limit(8).all()
            )
            recent_rows = []
            for lic in recent:
                company = db.session.get(CompanyRegistration, lic.company_id)
                recent_rows.append(
                    {
                        'id': lic.id,
                        'company': company.company_name if company else 'Unknown',
                        'serial': lic.serial_number,
                        'status': license_row_display_status(lic),
                        'product': ', '.join(
                            enabled_business_feature_labels(lic.features, lic.serial_number)
                        )
                        or '—',
                    }
                )
            return {
                'companies': companies,
                'licenses': len(licenses),
                'active': counts['Active'],
                'inactive': counts['Inactive'],
                'expired': counts['Expired'],
                'recent': recent_rows,
            }

        return self._run(inner)

    def list_licenses(self, status_filter: str = 'all', search: str = '') -> list[dict[str, Any]]:
        self.msp.repair_missing_license_features()
        self.msp.repair_combined_licenses()

        def inner() -> list[dict[str, Any]]:
            rows = []
            query = LicenseActivation.query.order_by(LicenseActivation.id.desc())
            for lic in query.all():
                status = license_row_display_status(lic)
                if status_filter != 'all' and status.lower() != status_filter.lower():
                    continue
                company = db.session.get(CompanyRegistration, lic.company_id)
                company_name = company.company_name if company else 'Unknown'
                product = ', '.join(
                    enabled_business_feature_labels(lic.features, lic.serial_number)
                ) or '—'
                haystack = f'{company_name} {lic.serial_number} {product}'.lower()
                if search and search.lower() not in haystack:
                    continue
                rows.append(
                    {
                        'id': lic.id,
                        'company': company_name,
                        'company_id': lic.company_id,
                        'product': product,
                        'status': status,
                        'serial': lic.serial_number,
                        'license_type': lic.license_type or '—',
                        'expires': lic.expiration_date.strftime('%Y-%m-%d')
                        if lic.expiration_date
                        else 'No expiry',
                        'is_active': bool(lic.is_active),
                        'max_users': lic.max_users or 1,
                        'binding': self._binding_label(lic),
                    }
                )
            rows.sort(key=lambda row: (row['company'].lower(), row['product'].lower(), -row['id']))
            return rows

        return self._run(inner)

    def count_licenses(self) -> int:
        def inner() -> int:
            return LicenseActivation.query.count()

        return self._run(inner)

    @staticmethod
    def _binding_label(license_row: LicenseActivation) -> str:
        from license_serial import binding_status_label

        return binding_status_label(license_row)

    def get_license_detail(self, license_id: int) -> Optional[dict[str, Any]]:
        self.msp.repair_missing_license_features()

        def inner() -> Optional[dict[str, Any]]:
            lic = db.session.get(LicenseActivation, license_id)
            if not lic:
                return None
            company = db.session.get(CompanyRegistration, lic.company_id)
            return {
                'id': lic.id,
                'serial': lic.serial_number,
                'company': company.company_name if company else 'Unknown',
                'status': license_row_display_status(lic),
                'license_type': normalize_license_type(lic.license_type, 'Day Pass'),
                'max_users': lic.max_users or 1,
                'expires': lic.expiration_date,
                'activation_date': lic.activation_date,
                'is_active': bool(lic.is_active),
                'product': ', '.join(
                    enabled_business_feature_labels(lic.features, lic.serial_number)
                )
                or '—',
                'binding': self._binding_label(lic),
                'features_raw': lic.features,
            }

        return self._run(inner)

    def list_companies(self) -> list[dict[str, Any]]:
        def inner() -> list[dict[str, Any]]:
            out = []
            for company in CompanyRegistration.query.order_by(CompanyRegistration.company_name).all():
                licenses = LicenseActivation.query.filter_by(company_id=company.id).all()
                counts = summarize_license_statuses(licenses)
                out.append(
                    {
                        'id': company.id,
                        'name': company.company_name,
                        'contact': company.contact_person,
                        'email': company.email,
                        'msp_client_id': company.msp_client_id,
                        'active': counts['Active'],
                        'expired': counts['Expired'],
                    }
                )
            return out

        return self._run(inner)

    def add_license_for_company(self, company_id: int) -> str:
        def inner() -> str:
            from license_serial import ensure_unique_license_serial, is_legacy_short_license_serial

            company = db.session.get(CompanyRegistration, company_id)
            if not company:
                raise ValueError('Company not found')
            serial = ensure_unique_license_serial(
                db.session,
                LicenseActivation,
                msp_client_id=company.msp_client_id,
                features_raw={'pos_systems': True},
            )
            if is_legacy_short_license_serial(serial):
                raise RuntimeError('Generated short or legacy serial')
            now = datetime.now(timezone.utc)
            lic = LicenseActivation(
                serial_number=serial,
                company_id=company.id,
                license_type='Day Pass',
                activation_date=now,
                expiration_date=now + timedelta(days=1),
                is_active=False,
                max_users=1,
                features=json.dumps(
                    {
                        'advanced_reporting': False,
                        'api_access': False,
                        'pos_systems': False,
                        'restaurant_management': False,
                        'document_management': False,
                        'ecommerce_websites': False,
                        'auto_system': False,
                        'distribution_system': False,
                        'customer_management': False,
                    }
                ),
            )
            db.session.add(lic)
            db.session.commit()
            return serial

        return self._run(inner)

    def activate_license(
        self,
        license_id: int,
        *,
        license_type: str,
        product_label: str,
        duration_days: int,
        max_users: int,
    ) -> None:
        resolved_type = validate_license_type(license_type)
        resolved_duration = parse_duration_days(duration_days, resolved_type)

        def inner() -> None:
            lic = db.session.get(LicenseActivation, license_id)
            if not lic:
                raise ValueError('License not found')
            if lic.is_active:
                raise ValueError('License is already active')
            selected_key = GUI_LICENSE_FEATURE_LABEL_TO_KEY.get(product_label, 'pos_systems')
            now = datetime.now(timezone.utc)
            lic.license_type = resolved_type
            lic.max_users = max_users
            lic.activation_date = now
            lic.expiration_date = expiration_from_activation(now, resolved_type, resolved_duration)
            lic.features = json.dumps(
                {
                    'advanced_reporting': True,
                    'api_access': True,
                    'pos_systems': selected_key == 'pos_systems',
                    'restaurant_management': selected_key == 'restaurant_management',
                    'document_management': selected_key == 'document_management',
                    'ecommerce_websites': selected_key == 'ecommerce_websites',
                    'auto_system': selected_key == 'auto_system',
                    'distribution_system': selected_key == 'distribution_system',
                    'customer_management': selected_key == 'customer_management',
                }
            )
            lic.is_active = True
            db.session.commit()

        self._run(inner)

    def deactivate_license(self, license_id: int) -> None:
        def inner() -> None:
            lic = db.session.get(LicenseActivation, license_id)
            if not lic:
                raise ValueError('License not found')
            lic.is_active = False
            db.session.commit()

        self._run(inner)

    def mark_expired(self, license_id: int) -> None:
        def inner() -> None:
            lic = db.session.get(LicenseActivation, license_id)
            if not lic:
                raise ValueError('License not found')
            lic.expiration_date = datetime.now(timezone.utc) - timedelta(days=1)
            lic.is_active = False
            db.session.commit()

        self._run(inner)

    def reactivate_license(self, license_id: int, extend_days: Optional[int] = None) -> None:
        def inner() -> None:
            lic = db.session.get(LicenseActivation, license_id)
            if not lic:
                raise ValueError('License not found')
            now = datetime.now(timezone.utc)
            if extend_days:
                if extend_days == NO_TIME_LIMIT_DURATION:
                    lic.license_type = 'No Time Limit'
                    lic.expiration_date = None
                else:
                    lic.expiration_date = now + timedelta(days=extend_days)
            lic.is_active = True
            lic.activation_date = now
            db.session.commit()

        self._run(inner)

    def extend_license(self, license_id: int, days: int) -> datetime:
        def inner() -> datetime:
            lic = db.session.get(LicenseActivation, license_id)
            if not lic:
                raise ValueError('License not found')
            if lic.expiration_date is None:
                raise ValueError(
                    'This license has no expiration (No Time Limit). It cannot be extended by days.'
                )
            if days == NO_TIME_LIMIT_DURATION:
                raise ValueError('Use license type "No Time Limit" instead of 9999 days when extending.')
            lic.expiration_date += timedelta(days=days)
            db.session.commit()
            return lic.expiration_date

        return self._run(inner)

    def delete_license(self, license_id: int) -> str:
        def inner() -> str:
            lic = db.session.get(LicenseActivation, license_id)
            if not lic:
                raise ValueError('License not found')
            serial = lic.serial_number
            LicenseValidationLog.query.filter_by(license_id=lic.id).delete(synchronize_session=False)
            db.session.delete(lic)
            db.session.commit()
            return serial

        return self._run(inner)

    def add_device_license(self, license_id: int) -> str:
        def inner() -> str:
            from license_serial import (
                LICENSE_KEY_TO_CODE,
                ensure_unique_license_serial,
                is_legacy_short_license_serial,
                next_device_seat,
                parse_license_features,
            )

            source = db.session.get(LicenseActivation, license_id)
            if not source:
                raise ValueError('License not found')
            company = db.session.get(CompanyRegistration, source.company_id)
            if not company:
                raise ValueError('Company not found')
            features = parse_license_features(source.features)
            feature_key = next(
                (k for k in BUSINESS_LICENSE_FEATURE_KEYS if features.get(k)),
                'pos_systems',
            )
            seat = next_device_seat(
                LicenseActivation.query.filter_by(company_id=company.id).all(),
                feature_key,
            )
            msp_from_key = {
                'pos_systems': 'pos',
                'restaurant_management': 'restaurant',
                'document_management': 'document',
                'ecommerce_websites': 'ecommerce',
                'auto_system': 'auto',
                'distribution_system': 'distribution',
                'customer_management': 'crm',
            }
            serial = ensure_unique_license_serial(
                db.session,
                LicenseActivation,
                msp_feature=msp_from_key.get(feature_key, 'pos'),
                msp_client_id=company.msp_client_id,
                features_raw=source.features,
                device_seat=seat,
            )
            if is_legacy_short_license_serial(serial):
                raise RuntimeError('Generated short or legacy serial')
            now = datetime.now(timezone.utc)
            lic = LicenseActivation(
                serial_number=serial,
                company_id=company.id,
                license_type=source.license_type,
                service_level=source.service_level,
                max_users=source.max_users,
                features=source.features,
                activation_date=now,
                expiration_date=source.expiration_date or (now + timedelta(days=365)),
                is_active=False,
            )
            db.session.add(lic)
            db.session.commit()
            _ = LICENSE_KEY_TO_CODE.get(feature_key, feature_key)
            return serial

        return self._run(inner)

    def clear_device_binding(self, license_id: int) -> None:
        def inner() -> None:
            lic = db.session.get(LicenseActivation, license_id)
            if not lic:
                raise ValueError('License not found')
            if not lic.browser_fingerprint:
                raise ValueError('No device binding stored')
            lic.browser_fingerprint = None
            db.session.commit()

        self._run(inner)

    def delete_company(self, company_id: int) -> None:
        result = self.msp.delete_company_and_licenses(company_id)
        if not result.get('success'):
            raise RuntimeError(result.get('error') or 'Delete failed')

    def test_msp_connection(self) -> dict[str, Any]:
        return self.msp.get_msp_clients()

    def load_msp_clients(self) -> list[dict[str, Any]]:
        result = self.msp.get_msp_clients()
        if 'error' in result:
            raise RuntimeError(result['error'])
        clients = result.get('clients', [])
        enriched = []
        for client in clients:
            license_status = 'No license'
            try:
                company = self._run(
                    lambda cid=client['id']: CompanyRegistration.query.filter_by(msp_client_id=cid).first()
                )
                if company:
                    licenses = self._run(
                        lambda cid=company.id: LicenseActivation.query.filter_by(company_id=cid).all()
                    )
                    if licenses:
                        counts = summarize_license_statuses(licenses)
                        total = len(licenses)
                        if counts['Active']:
                            license_status = f"{counts['Active']} active / {total} total"
                        elif counts['Expired']:
                            license_status = f"{counts['Expired']} expired / {total} total"
                        else:
                            license_status = f"{counts['Inactive']} pending / {total} total"
            except Exception:
                pass
            features = client.get('features', [])
            if isinstance(features, str):
                try:
                    features = json.loads(features)
                except json.JSONDecodeError:
                    features = []
            enriched.append(
                {
                    'id': client['id'],
                    'company': MSPClientIntegration._client_company_name(client, str(client.get('id', ''))),
                    'contact': MSPClientIntegration._client_contact_person(client),
                    'service': client.get('serviceLevel', '—'),
                    'features': ', '.join(features) if features else '—',
                    'license_status': license_status,
                }
            )
        return enriched

    def sync_all_msp_clients(self) -> dict[str, Any]:
        return self.msp.sync_all_msp_clients()

    def push_portal_client_licenses(
        self,
        msp_client_id: str,
        *,
        license_type: str,
        duration: int,
        max_users: int,
        product_labels: list[str],
    ) -> dict[str, Any]:
        license_type = validate_license_type(license_type)
        duration, _ = resolve_duration_for_update(license_type, duration)
        return self.msp.update_msp_client_license(
            msp_client_id,
            license_type,
            duration,
            max_users,
            product_labels,
        )
