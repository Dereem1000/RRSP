"""
Standalone License Activation System - Database Models
"""

from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timezone
from werkzeug.security import generate_password_hash, check_password_hash
import json

db = SQLAlchemy()

class CompanyRegistration(db.Model):
    __tablename__ = 'company_registration'
    
    id = db.Column(db.Integer, primary_key=True)
    company_name = db.Column(db.String(200), nullable=False)
    contact_person = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(20))
    address = db.Column(db.Text)
    business_type = db.Column(db.String(50))  # restaurant, cafe, bar, etc.
    serial_number = db.Column(db.String(128), unique=True, nullable=False)
    msp_client_id = db.Column(db.String(50), unique=True)  # Link to MSP system client ID
    registration_date = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    is_verified = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

class LicenseActivation(db.Model):
    __tablename__ = 'license_activation'
    
    id = db.Column(db.Integer, primary_key=True)
    serial_number = db.Column(db.String(128), unique=True, nullable=False)
    company_id = db.Column(db.Integer, db.ForeignKey('company_registration.id'), nullable=False)
    license_type = db.Column(db.String(50), nullable=False)  # basic, premium, enterprise
    service_level = db.Column(db.String(50), nullable=True)  # MSP service level (optional for backward compatibility)
    activation_date = db.Column(db.DateTime, nullable=False)
    expiration_date = db.Column(db.DateTime, nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    max_users = db.Column(db.Integer, default=5)
    features = db.Column(db.Text)  # JSON string of enabled features
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Internet validation fields
    last_online_check = db.Column(db.DateTime)
    online_validation_key = db.Column(db.String(200))  # Encrypted validation key
    validation_server_url = db.Column(db.String(500))  # License validation server URL
    
    # Browser/Device binding
    browser_fingerprint = db.Column(db.String(255), nullable=True)  # Browser fingerprint hash for device binding
    
    company = db.relationship('CompanyRegistration', backref='licenses')

class LicenseValidationLog(db.Model):
    __tablename__ = 'license_validation_log'
    
    id = db.Column(db.Integer, primary_key=True)
    license_id = db.Column(db.Integer, db.ForeignKey('license_activation.id'), nullable=False)
    validation_type = db.Column(db.String(20), nullable=False)  # online, offline, manual
    validation_result = db.Column(db.String(20), nullable=False)  # success, failed, expired
    validation_message = db.Column(db.Text)
    ip_address = db.Column(db.String(45))  # IPv4 or IPv6
    user_agent = db.Column(db.String(500))
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    
    license = db.relationship('LicenseActivation', backref='validation_logs')

class SystemConfiguration(db.Model):
    __tablename__ = 'system_configuration'
    
    id = db.Column(db.Integer, primary_key=True)
    config_key = db.Column(db.String(100), unique=True, nullable=False)
    config_value = db.Column(db.Text, nullable=False)
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
