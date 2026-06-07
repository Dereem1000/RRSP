#!/usr/bin/env python3
"""
Database Migration Script for New Tables
Adds DatabaseConfig, CompanyRegistration, and LicenseActivation tables
"""

import sys
import os

# Add the current directory to the path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.models import db, DatabaseConfig, CompanyRegistration, LicenseActivation
from flask import Flask

def create_app():
    """Create Flask app for database operations"""
    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///restaurant.db'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    db.init_app(app)
    return app

def migrate_database():
    """Add new tables to the database"""
    app = create_app()
    
    with app.app_context():
        try:
            # Create all tables (this will only create new ones)
            db.create_all()
            print("✅ Database migration completed successfully!")
            print("New tables created:")
            print("- database_config")
            print("- company_registration") 
            print("- license_activation")
            
            # Create a default local database configuration
            existing_config = DatabaseConfig.query.filter_by(is_active=True).first()
            if not existing_config:
                default_config = DatabaseConfig(
                    config_name='Default Local SQLite',
                    db_type='local',
                    is_active=True
                )
                db.session.add(default_config)
                db.session.commit()
                print("✅ Default local database configuration created")
            
        except Exception as e:
            print(f"❌ Error during migration: {str(e)}")
            return False
    
    return True

if __name__ == '__main__':
    print("Starting database migration...")
    migrate_database()
