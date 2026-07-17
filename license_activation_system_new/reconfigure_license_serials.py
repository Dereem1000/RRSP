#!/usr/bin/env python3
"""
Reconfigure existing license/company serial numbers:
- Remove duplicate licenses per company + system
- Replace short / legacy serials with CD-LIC-* / CD-COMP-* format

Usage:
  python reconfigure_license_serials.py --dry-run
  python reconfigure_license_serials.py
"""

from __future__ import annotations

import argparse
import json
import sys

from models import db, CompanyRegistration, LicenseActivation, LicenseValidationLog
from msp_integration import MSPClientIntegration
from license_serial import (
    ensure_unique_company_serial,
    ensure_unique_license_serial,
    is_legacy_short_company_serial,
    is_legacy_short_license_serial,
    primary_system_code,
    parse_license_features,
)


def is_legacy_company_serial(serial: str) -> bool:
    return is_legacy_short_company_serial(serial)


def pick_primary_license_key(features: dict[str, bool]) -> str | None:
    for key in (
        'pos_systems',
        'restaurant_management',
        'document_management',
        'ecommerce_websites',
        'auto_system',
        'distribution_system',
        'customer_management',
    ):
        if features.get(key):
            return key
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    app = MSPClientIntegration.create_app()
    changes: list[str] = []
    removed = 0
    renumbered = 0
    company_renumbered = 0

    with app.app_context():
        companies = CompanyRegistration.query.order_by(CompanyRegistration.id).all()
        for company in companies:
            if is_legacy_company_serial(company.serial_number):
                with db.session.no_autoflush:
                    new_company_serial = ensure_unique_company_serial(
                        db.session, CompanyRegistration, company.msp_client_id
                    )
                changes.append(f'COMPANY {company.company_name}: {company.serial_number} -> {new_company_serial}')
                if not args.dry_run:
                    company.serial_number = new_company_serial
                    company_renumbered += 1

            licenses = (
                LicenseActivation.query.filter_by(company_id=company.id)
                .order_by(LicenseActivation.is_active.desc(), LicenseActivation.id.desc())
                .all()
            )
            seen_keys: set[str] = set()
            for lic in licenses:
                features = parse_license_features(lic.features)
                key = pick_primary_license_key(features) or f'GEN-{lic.id}'

                if key in seen_keys:
                    label = f'DUPE {company.company_name} / {key} id={lic.id} ({lic.serial_number})'
                    if lic.is_active:
                        changes.append(f'WARN active duplicate kept for manual review: {label}')
                        continue
                    changes.append(f'REMOVE inactive duplicate: {label}')
                    if not args.dry_run:
                        LicenseValidationLog.query.filter_by(license_id=lic.id).delete(
                            synchronize_session=False
                        )
                        db.session.delete(lic)
                        removed += 1
                    continue

                seen_keys.add(key)

                needs_new = is_legacy_short_license_serial(lic.serial_number) or not lic.serial_number.startswith('CD-LIC-')
                if needs_new:
                    msp_feature = {
                        'pos_systems': 'pos',
                        'restaurant_management': 'restaurant',
                        'document_management': 'document',
                        'ecommerce_websites': 'ecommerce',
                        'auto_system': 'auto',
                        'distribution_system': 'distribution',
                        'customer_management': 'crm',
                    }.get(key or '', 'pos')
                    with db.session.no_autoflush:
                        new_serial = ensure_unique_license_serial(
                            db.session,
                            LicenseActivation,
                            msp_feature=msp_feature if key else None,
                            feature_code=primary_system_code(features),
                            msp_client_id=company.msp_client_id,
                            features_raw=features,
                            exclude_id=lic.id,
                        )
                    active_note = ' [ACTIVE — update deployed systems]' if lic.is_active else ''
                    changes.append(
                        f'LICENSE {company.company_name} / {key}: {lic.serial_number} -> {new_serial}{active_note}'
                    )
                    if not args.dry_run:
                        lic.serial_number = new_serial
                        renumbered += 1

        if not args.dry_run:
            db.session.commit()

    print(f"{'DRY RUN — ' if args.dry_run else ''}License serial reconfiguration")
    print(f'Companies renumbered: {company_renumbered}')
    print(f'Licenses renumbered: {renumbered}')
    print(f'Duplicate licenses removed: {removed}')
    print('-' * 60)
    for line in changes:
        print(line)
    if not changes:
        print('No changes needed.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
