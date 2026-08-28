from admin_license_manager import create_app
from datetime import datetime, timedelta
import json

app = create_app()
with app.app_context():
    from models import db, CompanyRegistration, LicenseActivation
    # Create company
    company = CompanyRegistration(
        company_name='GUI Test Co',
        contact_person='GUI Tester',
        email='gui.test@example.com',
        phone='',
        business_type='auto',
        serial_number='GUI-COMP-TEST-001',
        is_verified=True,
    )
    db.session.add(company)
    db.session.flush()

    serial = 'GUI-TEST-' + datetime.utcnow().strftime('%Y%m%d%H%M%S')
    activation_date = datetime.utcnow()
    expiration_date = activation_date + timedelta(days=365)
    features = json.dumps({'auto_system': True, 'api_access': True})

    license = LicenseActivation(
        serial_number=serial,
        company_id=company.id,
        license_type='No Time Limit',
        activation_date=activation_date,
        expiration_date=expiration_date,
        is_active=True,
        max_users=1,
        features=features
    )
    db.session.add(license)
    db.session.commit()

    print('CREATED', serial)
