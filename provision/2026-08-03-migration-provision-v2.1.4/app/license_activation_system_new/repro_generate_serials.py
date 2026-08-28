from admin_license_manager import create_app
from license_serial import ensure_unique_company_serial, ensure_unique_license_serial
from models import db, CompanyRegistration, LicenseActivation

app = create_app()
with app.app_context():
    # Ensure company exists
    comp = CompanyRegistration.query.filter_by(serial_number='REPRO-COMP-001').first()
    if not comp:
        comp = CompanyRegistration(company_name='Repro Co', contact_person='Repro', email='repro@example.com', serial_number='REPRO-COMP-001', is_verified=True)
        db.session.add(comp)
        db.session.commit()

    print('Using company id', comp.id)

    for i in range(10):
        serial = ensure_unique_license_serial(db.session, LicenseActivation, msp_feature='auto')
        print(i+1, serial)
