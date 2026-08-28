#!/usr/bin/env python3
"""
Initialize License Activation System Database
Creates all required tables for the license activation system.
"""

import sys
import os
from datetime import datetime, timezone

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from models import db, CompanyRegistration, LicenseActivation, LicenseValidationLog, SystemConfiguration
from flask import Flask

def create_app():
    """Create Flask app for database operations"""
    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///../database.sqlite'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    db.init_app(app)
    return app

def init_database():
    """Initialize database with all tables"""
    print("Initializing License Activation System Database...")
    print("=" * 50)
    
    app = create_app()
    with app.app_context():
        try:
            # Create all tables
            db.create_all()
            print("Database initialized successfully!")
            print("Tables created:")
            print("   - company_registration")
            print("   - license_activation")
            print("   - license_validation_log")
            print("   - system_configuration")
            
            # Check if tables exist
            from sqlalchemy import inspect
            inspector = inspect(db.engine)
            tables = inspector.get_table_names()
            print(f"\nAvailable tables: {tables}")
            
            print("\nDatabase setup complete!")
            print("You can now run the GUI application.")
            
        except Exception as e:
            print(f"Error initializing database: {e}")
            return False
    
    return True

if __name__ == '__main__':
    init_database()
