#!/usr/bin/env python3
"""
Enhanced License Activation GUI Program
Graphical interface for license activation and management with feature-specific licensing.
"""

import sys
import os
import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext, simpledialog
import threading
import json
from datetime import datetime, timezone, timedelta
import sqlite3
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from models import db, CompanyRegistration, LicenseActivation, LicenseValidationLog, SystemConfiguration
from msp_integration import MSPClientIntegration
from license_types import (
    DURATION_BY_LICENSE_TYPE,
    LICENSE_TYPE_OPTIONS,
    NO_TIME_LIMIT_DURATION,
    expiration_from_activation,
    normalize_license_type,
    parse_duration_days,
    validate_license_type,
)

def create_app():
    """Create Flask app for database context"""
    app = Flask(__name__)
    # Use relative path to instance directory
    instance_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance')
    os.makedirs(instance_dir, exist_ok=True)
    db_path = os.path.join(instance_dir, 'license_system.db')
    app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    db.init_app(app)
    return app

# DB feature keys ↔ labels shown in the GUI (keep in sync with msp_integration gui_feature_mapping).
GUI_LICENSE_FEATURE_KEY_TO_LABEL = {
    'pos_systems': 'Point of Sale Systems',
    'restaurant_management': 'Restaurant Management',
    'document_management': 'Document Management',
    'ecommerce_websites': 'E-commerce Websites',
    'auto_system': 'Auto System',
    'distribution_system': 'Distribution System',
    'customer_management': 'Event Sponsor CRM',
    'inventory_management': 'Inventory Management',
    'reporting_analytics': 'Reporting & Analytics',
    'multi_location': 'Multi-Location Support',
}
GUI_LICENSE_FEATURE_LABEL_TO_KEY = {v: k for k, v in GUI_LICENSE_FEATURE_KEY_TO_LABEL.items()}
GUI_LICENSE_FEATURE_OPTIONS = list(GUI_LICENSE_FEATURE_KEY_TO_LABEL.values())
TECHNICAL_LICENSE_FEATURES = frozenset({
    'inventory_management',
    'reporting_analytics',
    'multi_location',
    'advanced_reporting',
    'api_access',
})
BUSINESS_LICENSE_FEATURE_KEYS = (
    'pos_systems',
    'restaurant_management',
    'document_management',
    'ecommerce_websites',
    'auto_system',
    'distribution_system',
    'customer_management',
)


def license_row_display_status(license_row, now=None):
    """Active, Expired (past date), or Inactive (pending / deactivated, not past expiry)."""
    now = now or datetime.now(timezone.utc)
    exp = license_row.expiration_date
    if exp is not None:
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < now:
            return 'Expired'
    if license_row.is_active:
        return 'Active'
    return 'Inactive'


def summarize_license_statuses(licenses):
    counts = {'Active': 0, 'Inactive': 0, 'Expired': 0}
    for lic in licenses:
        status = license_row_display_status(lic)
        counts[status] = counts.get(status, 0) + 1
    return counts


def enabled_business_feature_labels(features_raw, serial_number=None):
    labels = []
    try:
        from license_serial import (
            MSP_FEATURE_TO_LICENSE_KEY,
            resolve_license_feature_key,
        )

        features = json.loads(features_raw) if isinstance(features_raw, str) else features_raw
        if isinstance(features, dict):
            for feature, enabled in features.items():
                if not enabled or feature in TECHNICAL_LICENSE_FEATURES:
                    continue
                license_key = feature
                if feature not in GUI_LICENSE_FEATURE_KEY_TO_LABEL:
                    license_key = MSP_FEATURE_TO_LICENSE_KEY.get(feature, feature)
                label = GUI_LICENSE_FEATURE_KEY_TO_LABEL.get(license_key)
                if label and label not in labels:
                    labels.append(label)

        if not labels and serial_number:
            resolved = resolve_license_feature_key(features_raw, serial_number)
            if resolved:
                label = GUI_LICENSE_FEATURE_KEY_TO_LABEL.get(resolved)
                if label:
                    labels.append(label)
    except (json.JSONDecodeError, TypeError):
        pass
    return labels


class LicenseActivationGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("License Activation Manager")
        self.root.geometry("1000x700")
        self.root.configure(bg='#f0f0f0')
        
        # Initialize MSP integration
        self.msp_integration = MSPClientIntegration()
        
        # Create main frame
        main_frame = ttk.Frame(root, padding="10")
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        # Configure grid weights
        root.columnconfigure(0, weight=1)
        root.rowconfigure(0, weight=1)
        main_frame.columnconfigure(1, weight=1)
        main_frame.rowconfigure(2, weight=1)
        
        # Title
        title_label = ttk.Label(main_frame, text="Enhanced License Activation System", 
                               font=('Arial', 16, 'bold'))
        title_label.grid(row=0, column=0, columnspan=3, pady=(0, 20))
        
        # Create notebook for tabs
        self.notebook = ttk.Notebook(main_frame)
        self.notebook.grid(row=1, column=0, columnspan=3, sticky=(tk.W, tk.E, tk.N, tk.S), pady=(0, 10))
        
        # Create tabs
        self.create_companies_tab()
        self.create_management_tab()
        self.create_msp_integration_tab()
        self.create_system_management_tab()
        
        # Status bar
        self.status_var = tk.StringVar()
        self.status_var.set("Ready")
        status_bar = ttk.Label(main_frame, textvariable=self.status_var, relief=tk.SUNKEN)
        status_bar.grid(row=2, column=0, columnspan=3, sticky=(tk.W, tk.E), pady=(10, 0))
        
        # Initialize database
        self.init_database()
        
        # Load saved configuration
        self.load_saved_config()
        
        # Load initial data
        try:
            self.refresh_companies()
            self.load_all_licenses()
        except Exception as e:
            print(f"Initial data load error: {e}")

    def init_database(self):
        """Initialize database with tables"""
        try:
            app = create_app()
            with app.app_context():
                db.create_all()
                print("Database initialized successfully")
        except Exception as e:
            print(f"Database initialization error: {e}")

    def load_saved_config(self):
        """Load saved configuration from database"""
        try:
            app = create_app()
            with app.app_context():
                # Load MSP API URL
                msp_url_config = SystemConfiguration.query.filter_by(config_key='msp_api_url').first()
                if msp_url_config:
                    self.msp_api_url_var.set(msp_url_config.config_value)
                    self.msp_integration.api_url = msp_url_config.config_value
                
                # Load API Token
                token_config = SystemConfiguration.query.filter_by(config_key='msp_api_token').first()
                if token_config:
                    self.msp_api_token_var.set(token_config.config_value)
                    self.msp_integration.api_token = token_config.config_value
                
                # Load Validation Server URL
                validation_url_config = SystemConfiguration.query.filter_by(config_key='validation_server_url').first()
                if validation_url_config:
                    self.validation_server_url_var.set(validation_url_config.config_value)
                
                print("Configuration loaded successfully")
        except Exception as e:
            print(f"Error loading configuration: {e}")

    def save_msp_config(self):
        """Save MSP configuration to database"""
        try:
            app = create_app()
            with app.app_context():
                # Save MSP API URL
                msp_url_config = SystemConfiguration.query.filter_by(config_key='msp_api_url').first()
                if msp_url_config:
                    msp_url_config.config_value = self.msp_api_url_var.get()
                else:
                    msp_url_config = SystemConfiguration(config_key='msp_api_url', config_value=self.msp_api_url_var.get())
                    db.session.add(msp_url_config)
                
                # Save API Token
                token_config = SystemConfiguration.query.filter_by(config_key='msp_api_token').first()
                if token_config:
                    token_config.config_value = self.msp_api_token_var.get()
                else:
                    token_config = SystemConfiguration(config_key='msp_api_token', config_value=self.msp_api_token_var.get())
                    db.session.add(token_config)
                
                db.session.commit()
                messagebox.showinfo("Success", "MSP configuration saved successfully!")
        except Exception as e:
            messagebox.showerror("Error", f"Failed to save configuration: {str(e)}")

    def on_token_change(self, *args):
        """Handle API token changes with debouncing"""
        if hasattr(self, '_token_timer'):
            self.root.after_cancel(self._token_timer)
        self._token_timer = self.root.after(2000, self.auto_save_token)

    def auto_save_token(self):
        """Auto-save token after delay"""
        try:
            app = create_app()
            with app.app_context():
                token_config = SystemConfiguration.query.filter_by(config_key='msp_api_token').first()
                if token_config:
                    token_config.config_value = self.msp_api_token_var.get()
                else:
                    token_config = SystemConfiguration(config_key='msp_api_token', config_value=self.msp_api_token_var.get())
                    db.session.add(token_config)
                
                db.session.commit()
                self.msp_integration.api_token = self.msp_api_token_var.get()
                print("API token auto-saved")
        except Exception as e:
            print(f"Error auto-saving token: {e}")

    def create_companies_tab(self):
        """Create the compact Companies tab"""
        companies_frame = ttk.Frame(self.notebook)
        self.notebook.add(companies_frame, text="Companies")
        
        # Top frame with buttons
        top_frame = ttk.Frame(companies_frame)
        top_frame.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Button(top_frame, text="Add Company", command=self.add_company).pack(side=tk.LEFT, padx=2)
        ttk.Button(top_frame, text="Edit", command=self.edit_company).pack(side=tk.LEFT, padx=2)
        ttk.Button(top_frame, text="Delete", command=self.delete_company).pack(side=tk.LEFT, padx=2)
        ttk.Button(top_frame, text="Refresh", command=self.refresh_companies).pack(side=tk.LEFT, padx=2)
        
        # Main content area
        content_frame = ttk.Frame(companies_frame)
        content_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # Companies list (left side)
        list_frame = ttk.LabelFrame(content_frame, text="Companies")
        list_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 5))
        
        # Compact columns
        columns = ('ID', 'Company', 'Contact', 'Status')
        self.companies_tree = ttk.Treeview(list_frame, columns=columns, show='headings', height=12)
        
        # Configure columns
        for col in columns:
            self.companies_tree.heading(col, text=col)
        
        # Configure column widths
        self.companies_tree.column('ID', width=40)
        self.companies_tree.column('Company', width=200)
        self.companies_tree.column('Contact', width=150)
        self.companies_tree.column('Status', width=100)
        
        # Scrollbar
        companies_scrollbar = ttk.Scrollbar(list_frame, orient=tk.VERTICAL, command=self.companies_tree.yview)
        self.companies_tree.configure(yscrollcommand=companies_scrollbar.set)
        
        self.companies_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        companies_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        # Bind selection event
        self.companies_tree.bind('<<TreeviewSelect>>', self.on_company_select)
        
        # Company details (right side)
        details_frame = ttk.LabelFrame(content_frame, text="Company Details")
        details_frame.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True, padx=(5, 0))
        
        # Compact details display
        self.company_details_text = tk.Text(details_frame, height=12, wrap=tk.WORD, font=('Consolas', 9))
        self.company_details_text.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

    def on_company_select(self, event):
        """Handle company selection"""
        try:
            selection = self.companies_tree.selection()
            if not selection:
                return
            
            item = self.companies_tree.item(selection[0])
            company_id = int(item['values'][0])
            
            app = create_app()
            with app.app_context():
                company = db.session.get(CompanyRegistration, company_id)
                if company:
                    # Calculate license statistics
                    licenses = LicenseActivation.query.filter_by(company_id=company.id).all()
                    total_licenses = len(licenses)
                    status_counts = summarize_license_statuses(licenses)
                    active_licenses = status_counts['Active']
                    expired_licenses = status_counts['Expired']
                    inactive_licenses = status_counts['Inactive']

                    current_features = []
                    for license in licenses:
                        current_features.extend(enabled_business_feature_labels(license.features))
                    current_features = list(dict.fromkeys(current_features))
                    
                    # Compact display
                    details_text = f"""COMPANY: {company.company_name}
CONTACT: {company.contact_person}
EMAIL: {company.email}
PHONE: {company.phone or 'N/A'}
SERIAL: {company.serial_number}
STATUS: {'Verified' if company.is_verified else 'Unverified'}

LICENSES: {total_licenses} total
• Active: {active_licenses}
• Inactive: {inactive_licenses}
• Expired: {expired_licenses}

FEATURES: {', '.join(current_features) if current_features else 'None'}"""
                    
                    self.company_details_text.delete(1.0, tk.END)
                    self.company_details_text.insert(1.0, details_text)
                    
        except Exception as e:
            print(f"Error handling company selection: {e}")

    def create_management_tab(self):
        """Create the compact License Management tab"""
        management_frame = ttk.Frame(self.notebook)
        self.notebook.add(management_frame, text="License Management")
        
        # Top frame with buttons
        top_frame = ttk.Frame(management_frame)
        top_frame.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Button(top_frame, text="Add License", command=self.add_new_license).pack(side=tk.LEFT, padx=2)
        ttk.Button(top_frame, text="Add Device License", command=self.add_device_license_for_selected).pack(side=tk.LEFT, padx=2)
        ttk.Button(top_frame, text="Clear Device Binding", command=self.clear_device_binding_for_selected).pack(side=tk.LEFT, padx=2)
        ttk.Button(top_frame, text="Refresh", command=self.load_all_licenses).pack(side=tk.LEFT, padx=2)
        ttk.Button(top_frame, text="Validate", command=self.validate_selected_license).pack(side=tk.LEFT, padx=2)
        ttk.Button(top_frame, text="Extend", command=self.extend_selected_license).pack(side=tk.LEFT, padx=2)
        ttk.Button(top_frame, text="Deactivate", command=self.deactivate_selected_license).pack(side=tk.LEFT, padx=2)
        ttk.Button(top_frame, text="Reactivate", command=self.reactivate_selected_license).pack(side=tk.LEFT, padx=2)
        ttk.Button(top_frame, text="Mark as Expired", command=self.mark_license_as_expired).pack(side=tk.LEFT, padx=2)
        ttk.Button(top_frame, text="Delete License", command=self.delete_selected_license).pack(side=tk.LEFT, padx=2)
        
        # Main content area
        content_frame = ttk.Frame(management_frame)
        content_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # Licenses list (left side)
        list_frame = ttk.LabelFrame(content_frame, text="Licenses")
        list_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 5))
        
        # Compact columns
        columns = ('ID', 'Company', 'Type', 'Feature', 'Status', 'Expires')
        self.all_licenses_tree = ttk.Treeview(list_frame, columns=columns, show='headings', height=12)
        
        # Configure columns
        for col in columns:
            self.all_licenses_tree.heading(col, text=col)
        
        # Configure column widths
        self.all_licenses_tree.column('ID', width=40)
        self.all_licenses_tree.column('Company', width=150)
        self.all_licenses_tree.column('Type', width=100)
        self.all_licenses_tree.column('Feature', width=120)
        self.all_licenses_tree.column('Status', width=80)
        self.all_licenses_tree.column('Expires', width=100)
        
        # Scrollbar
        licenses_scrollbar = ttk.Scrollbar(list_frame, orient=tk.VERTICAL, command=self.all_licenses_tree.yview)
        self.all_licenses_tree.configure(yscrollcommand=licenses_scrollbar.set)
        
        self.all_licenses_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        licenses_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        # Bind selection event
        self.all_licenses_tree.bind('<<TreeviewSelect>>', self.on_license_select)
        
        # License details and config (right side)
        details_frame = ttk.LabelFrame(content_frame, text="License Details & Configuration")
        details_frame.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True, padx=(5, 0))
        
        # License info
        info_frame = ttk.LabelFrame(details_frame, text="License Info")
        info_frame.pack(fill=tk.X, padx=5, pady=5)
        
        self.license_info_text = tk.Text(info_frame, height=4, wrap=tk.WORD, font=('Consolas', 9))
        self.license_info_text.pack(fill=tk.X, padx=5, pady=5)
        
        # Configuration (for inactive licenses)
        self.config_frame = ttk.LabelFrame(details_frame, text="Configuration")
        self.config_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # License type and feature
        type_frame = ttk.Frame(self.config_frame)
        type_frame.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Label(type_frame, text="Type:").pack(side=tk.LEFT)
        self.license_type_var = tk.StringVar()
        self.license_type_combo = ttk.Combobox(type_frame, textvariable=self.license_type_var, 
                                             values=list(LICENSE_TYPE_OPTIONS),
                                             state='readonly', width=15)
        self.license_type_combo.pack(side=tk.LEFT, padx=(5, 10))
        self.license_type_combo.bind('<<ComboboxSelected>>', self.on_license_type_change)
        
        ttk.Label(type_frame, text="Feature:").pack(side=tk.LEFT)
        self.feature_var = tk.StringVar()
        self.feature_combo = ttk.Combobox(type_frame, textvariable=self.feature_var,
                                        values=GUI_LICENSE_FEATURE_OPTIONS,
                                        state='readonly', width=15)
        self.feature_combo.pack(side=tk.LEFT, padx=(5, 0))
        self.feature_combo.bind('<<ComboboxSelected>>', self.on_feature_change)
        
        # Duration and max users
        config_frame = ttk.Frame(self.config_frame)
        config_frame.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Label(config_frame, text="Days:").pack(side=tk.LEFT)
        self.duration_var = tk.StringVar()
        self.duration_entry = ttk.Entry(config_frame, textvariable=self.duration_var, width=8)
        self.duration_entry.pack(side=tk.LEFT, padx=(5, 10))
        
        ttk.Label(config_frame, text="Users:").pack(side=tk.LEFT)
        self.max_users_var = tk.StringVar()
        self.max_users_entry = ttk.Entry(config_frame, textvariable=self.max_users_var, width=8)
        self.max_users_entry.pack(side=tk.LEFT, padx=(5, 0))
        
        # Features description
        self.features_text = tk.Text(self.config_frame, height=4, wrap=tk.WORD, font=('Consolas', 8))
        self.features_text.pack(fill=tk.X, padx=5, pady=5)
        
        # Action button
        self.primary_action_button = ttk.Button(self.config_frame, text="Activate License", 
                                              command=self.activate_selected_license)
        self.primary_action_button.pack(fill=tk.X, padx=5, pady=5)

    def on_license_select(self, event):
        """Handle license selection"""
        try:
            selection = self.all_licenses_tree.selection()
            if not selection:
                return
            
            item = self.all_licenses_tree.item(selection[0])
            license_id = int(item['values'][0])
            
            app = create_app()
            with app.app_context():
                license = db.session.get(LicenseActivation, license_id)
                if license:
                    company = db.session.get(CompanyRegistration, license.company_id)
                    company_name = company.company_name if company else "Unknown Company"
                    
                    # Display license information
                    info_text = f"""ID: {license.id} | Serial: {license.serial_number}
Company: {company_name}
Type: {license.license_type} | Users: {license.max_users}
Status: {'Active' if license.is_active else 'Inactive'} | Service: {license.service_level or 'N/A'}
Device: {self._binding_status_label(license)}
Activated: {license.activation_date or 'Not activated'}
Expires: {license.expiration_date or 'No expiration'}

Note: Each license binds to one browser (web/POS) or one machine install on first activation.
Issue "Add Device License" for a second register, PC, or browser profile."""
                    
                    self.license_info_text.delete(1.0, tk.END)
                    self.license_info_text.insert(1.0, info_text)
                    
                    # Handle configuration form based on license status
                    is_active = license.is_active
                    
                    # Enable/disable configuration form
                    for widget in self.config_frame.winfo_children():
                        self.set_widget_state(widget, not is_active)
                    
                    if is_active:
                        # Clear form for active licenses
                        self.license_type_var.set("")
                        self.feature_var.set("")
                        self.duration_var.set("")
                        self.max_users_var.set("")
                        self.features_text.delete(1.0, tk.END)
                        self.primary_action_button.config(text="License is Active")
                    else:
                        # Populate form for inactive licenses
                        self.license_type_var.set(normalize_license_type(license.license_type, 'Day Pass'))
                        self.duration_var.set(str(license.max_users or 1))
                        self.max_users_var.set(str(license.max_users or 1))
                        
                        # Parse features to set the selected feature
                        if license.features:
                            try:
                                features = json.loads(license.features)
                                for feature, enabled in features.items():
                                    if enabled and feature in GUI_LICENSE_FEATURE_KEY_TO_LABEL:
                                        self.feature_var.set(GUI_LICENSE_FEATURE_KEY_TO_LABEL[feature])
                                        break
                                else:
                                    self.feature_var.set('Point of Sale Systems')
                            except:
                                self.feature_var.set('Point of Sale Systems')
                        else:
                            self.feature_var.set('Point of Sale Systems')
                        
                        self.primary_action_button.config(text="Activate Selected License")
                        self.update_features()
                    
        except Exception as e:
            print(f"Error handling license selection: {e}")

    def set_widget_state(self, widget, enabled):
        """Recursively set widget state"""
        try:
            if hasattr(widget, 'configure'):
                widget.configure(state='normal' if enabled else 'disabled')
            for child in widget.winfo_children():
                self.set_widget_state(child, enabled)
        except:
            pass

    def on_license_type_change(self, event=None):
        """Handle license type change"""
        license_type = self.license_type_var.get()
        
        # Update duration based on license type
        duration_map = DURATION_BY_LICENSE_TYPE
        
        if license_type in duration_map:
            self.duration_var.set(str(duration_map[license_type]))
        
        self.update_features()

    def on_feature_change(self, event=None):
        """Handle feature change"""
        self.update_features()

    def update_features(self, event=None):
        """Update features text based on license type and selected feature"""
        license_type = self.license_type_var.get()
        selected_feature = self.feature_var.get()
        
        if not selected_feature:
            selected_feature = "Point of Sale Systems"
        
        # Feature-specific descriptions
        feature_descriptions = {
            'Point of Sale Systems': f"""Point of Sale Systems License Features:
• Complete POS functionality
• Order processing and management
• Payment processing
• Receipt generation
• Sales reporting
• Customer transaction history
• Multi-payment methods support
• Tax calculation and management""",
            
            'Inventory Management': f"""Inventory Management License Features:
• Real-time inventory tracking
• Stock level monitoring
• Automated reorder alerts
• Supplier management
• Product categorization
• Barcode scanning support
• Inventory reports and analytics
• Stock movement tracking""",
            
            'Reporting & Analytics': f"""Reporting & Analytics License Features:
• Comprehensive business reports
• Sales analytics and trends
• Performance dashboards
• Custom report generation
• Data export capabilities
• Visual charts and graphs
• Historical data analysis
• KPI tracking and monitoring""",
            
            'Event Sponsor CRM': f"""Event Sponsor CRM License Features:
• Customer database management
• Customer profile tracking
• Purchase history analysis
• Loyalty program management
• Customer communication tools
• Marketing campaign tracking
• Customer segmentation
• Relationship management tools""",
            
            'Multi-Location Support': f"""Multi-Location Support License Features:
• Multi-store management
• Centralized inventory control
• Cross-location reporting
• Unified customer database
• Inter-store transfers
• Location-specific settings
• Consolidated analytics
• Remote management capabilities""",
            
            'Restaurant Management': f"""Restaurant Management License Features:
• Complete restaurant management solutions
• Inventory management for food service
• Staff scheduling and management
• Customer management systems
• Menu management and pricing
• Table management and reservations
• Kitchen display systems
• Restaurant analytics and reporting""",
            
            'Document Management': f"""Document Management License Features:
• Digital filing and organization
• Workflow automation
• Secure document storage
• Version control and tracking
• Document collaboration tools
• Search and retrieval systems
• Access control and permissions
• Integration with business processes""",
            
            'E-commerce Websites': f"""E-commerce Websites License Features:
• Custom-built e-commerce platforms
• Payment integration systems
• Inventory management
• Customer portals and accounts
• Shopping cart functionality
• Order processing and fulfillment
• Product catalog management
• Analytics and reporting tools""",
            
            'Auto System': f"""Auto System License Features:
• Comprehensive automotive business management
• Multi-role interfaces for different users
• Vehicle tracking and management
• Workflow automation
• Service scheduling and tracking
• Customer relationship management
• Parts inventory management
• Financial reporting and analytics""",
            
            'Distribution System': f"""Distribution System License Features:
• Advanced distribution and logistics management
• Inventory tracking across locations
• Order management and processing
• Supply chain optimization
• Warehouse management
• Route planning and optimization
• Supplier relationship management
• Performance analytics and reporting"""
        }
        
        # Add license type specific information
        type_info = f"\n\nLicense Type: {license_type}\nDuration: {self.duration_var.get()} days\nMax Users: {self.max_users_var.get()}"
        
        description = feature_descriptions.get(selected_feature, feature_descriptions['Point of Sale Systems'])
        full_description = description + type_info
        
        self.features_text.delete(1.0, tk.END)
        self.features_text.insert(1.0, full_description)

    def load_all_licenses(self):
        """Load all licenses (active, inactive, expired)"""
        try:
            # Clear existing items
            for item in self.all_licenses_tree.get_children():
                self.all_licenses_tree.delete(item)
            
            app = create_app()
            with app.app_context():
                licenses = LicenseActivation.query.all()
                
                for license in licenses:
                    company = db.session.get(CompanyRegistration, license.company_id)
                    company_name = company.company_name if company else "Unknown Company"
                    
                    status = license_row_display_status(license)
                    
                    # Parse features to show only enabled business features
                    features_display = "All Features"
                    if license.features:
                        try:
                            enabled_features = enabled_business_feature_labels(license.features)
                            
                            if enabled_features:
                                features_display = ", ".join(enabled_features)
                        except Exception:
                            features_display = "Unknown"
                    
                    # Format dates
                    expires = license.expiration_date.strftime('%Y-%m-%d') if license.expiration_date else 'No expiration'
                    created = license.created_at.strftime('%Y-%m-%d') if license.created_at else 'Unknown'
                    
                    # Insert into tree (compact format)
                    item_id = self.all_licenses_tree.insert('', 'end', values=(
                        license.id,
                        company_name,
                        license.license_type or 'Unknown',
                        features_display,
                        status,
                        expires
                    ))
                    
                    # Color code based on status
                    if status == "Active":
                        self.all_licenses_tree.set(item_id, 'Status', 'Active')
                    elif status == "Expired":
                        self.all_licenses_tree.set(item_id, 'Status', 'Expired')
                    else:
                        self.all_licenses_tree.set(item_id, 'Status', 'Inactive')
                
        except Exception as e:
            print(f"Error loading licenses: {e}")
            import traceback
            traceback.print_exc()

    def activate_selected_license(self):
        """Activate the selected license"""
        try:
            selection = self.all_licenses_tree.selection()
            if not selection:
                messagebox.showwarning("Warning", "Please select a license to activate.")
                return
            
            item = self.all_licenses_tree.item(selection[0])
            license_id = int(item['values'][0])
            
            # Get configuration
            license_type = validate_license_type(self.license_type_var.get())
            duration = parse_duration_days(self.duration_var.get(), license_type)
            max_users = int(self.max_users_var.get()) if self.max_users_var.get().isdigit() else 1
            feature = self.feature_var.get()
            
            if not feature:
                messagebox.showwarning("Warning", "Please select a feature for this license.")
                return
            
            app = create_app()
            with app.app_context():
                license = db.session.get(LicenseActivation, license_id)
                if not license:
                    messagebox.showerror("Error", "License not found.")
                    return
                
                if license.is_active:
                    messagebox.showinfo("Info", "This license is already active.")
                    return
                
                # Update license with new configuration
                license.license_type = license_type
                license.max_users = max_users
                
                # Set activation and expiration dates
                now = datetime.now(timezone.utc)
                license.activation_date = now
                license.expiration_date = expiration_from_activation(now, license_type, duration)
                
                # Set features - only the selected business feature is enabled
                selected_feature_key = GUI_LICENSE_FEATURE_LABEL_TO_KEY.get(feature, 'pos_systems')
                
                features = {
                    'advanced_reporting': True,
                    'api_access': True,
                    'pos_systems': selected_feature_key == 'pos_systems',
                    'restaurant_management': selected_feature_key == 'restaurant_management',
                    'document_management': selected_feature_key == 'document_management',
                    'ecommerce_websites': selected_feature_key == 'ecommerce_websites',
                    'auto_system': selected_feature_key == 'auto_system',
                    'distribution_system': selected_feature_key == 'distribution_system',
                    'inventory_management': selected_feature_key == 'inventory_management',
                    'reporting_analytics': selected_feature_key == 'reporting_analytics',
                    'customer_management': selected_feature_key == 'customer_management',
                    'multi_location': selected_feature_key == 'multi_location',
                }
                
                license.features = json.dumps(features)
                license.is_active = True
                
                db.session.commit()
                
                messagebox.showinfo("Success", f"""License activated successfully!

License Details:
• Type: {license_type}
• Feature: {feature}
• Duration: {duration} days
• Max Users: {max_users}
• Serial Number: {license.serial_number}""")
                
                self.load_all_licenses()
                
        except Exception as e:
            messagebox.showerror("Error", f"Failed to activate license: {str(e)}")

    def add_new_license(self):
        """Add a new license entry for a company"""
        try:
            app = create_app()
            with app.app_context():
                # Check if there are any companies
                companies = CompanyRegistration.query.all()
                
                if not companies:
                    messagebox.showerror("No Company", 
                                       "No companies found. Please add a company first.\n\n"
                                       "Go to the Companies tab and click 'Add Company' to create a company.")
                    return
                
                # Show company selection dialog
                select_window = tk.Toplevel(self.root)
                select_window.title("Select Company for New License")
                select_window.geometry("500x300")
                select_window.transient(self.root)
                select_window.grab_set()
                
                main_frame = ttk.Frame(select_window)
                main_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
                
                ttk.Label(main_frame, text="Select a company for the new license:", 
                         font=('Arial', 10, 'bold')).pack(anchor=tk.W, pady=(0, 10))
                
                # Company list
                list_frame = ttk.LabelFrame(main_frame, text="Companies")
                list_frame.pack(fill=tk.BOTH, expand=True, pady=5)
                
                columns = ('ID', 'Company', 'Contact', 'Email')
                company_tree = ttk.Treeview(list_frame, columns=columns, show='headings', height=8)
                
                for col in columns:
                    company_tree.heading(col, text=col)
                    company_tree.column(col, width=100)
                
                company_tree.column('ID', width=40)
                company_tree.column('Company', width=150)
                company_tree.column('Contact', width=120)
                company_tree.column('Email', width=180)
                
                scrollbar = ttk.Scrollbar(list_frame, orient=tk.VERTICAL, command=company_tree.yview)
                company_tree.configure(yscrollcommand=scrollbar.set)
                
                company_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
                scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
                
                # Populate companies
                selected_company_id = [None]
                
                for company in companies:
                    company_tree.insert('', 'end', values=(
                        company.id,
                        company.company_name,
                        company.contact_person,
                        company.email
                    ))
                
                def on_select():
                    selection = company_tree.selection()
                    if selection:
                        item = company_tree.item(selection[0])
                        selected_company_id[0] = int(item['values'][0])
                        select_window.destroy()
                
                def on_double_click(event):
                    on_select()
                
                company_tree.bind('<Double-1>', on_double_click)
                
                # Buttons
                buttons_frame = ttk.Frame(main_frame)
                buttons_frame.pack(fill=tk.X, pady=(10, 0))
                
                ttk.Button(buttons_frame, text="Select", command=on_select).pack(side=tk.LEFT, padx=5)
                ttk.Button(buttons_frame, text="Cancel", command=select_window.destroy).pack(side=tk.LEFT, padx=5)
                
                # Wait for selection
                select_window.wait_window()
                
                if selected_company_id[0] is None:
                    return  # User cancelled
                
                # Get the selected company
                company = db.session.get(CompanyRegistration, selected_company_id[0])
                if not company:
                    messagebox.showerror("Error", "Selected company not found.")
                    return
                
                from license_serial import ensure_unique_license_serial, is_legacy_short_license_serial
                serial_number = ensure_unique_license_serial(
                    db.session,
                    LicenseActivation,
                    msp_client_id=company.msp_client_id,
                    features_raw={'pos_systems': True},
                )
                if is_legacy_short_license_serial(serial_number):
                    raise RuntimeError('Generated short or legacy license serial; aborting')
                
                # Create new inactive license
                now = datetime.now(timezone.utc)
                new_license = LicenseActivation(
                    serial_number=serial_number,
                    company_id=company.id,
                    license_type='Day Pass',  # Default type
                    activation_date=now,  # Required field, but license is inactive
                    expiration_date=now + timedelta(days=1),  # Required field, but license is inactive
                    is_active=False,  # Start as inactive
                    max_users=1,
                    features=json.dumps({
                        'inventory_management': False,
                        'advanced_reporting': False,
                        'api_access': False,
                        'multi_location': False,
                        'pos_systems': False,
                        'restaurant_management': False,
                        'document_management': False,
                        'ecommerce_websites': False,
                        'auto_system': False,
                        'distribution_system': False,
                        'reporting_analytics': False,
                        'customer_management': False
                    })
                )
                
                db.session.add(new_license)
                db.session.commit()
                
                messagebox.showinfo("Success", 
                                  f"New license created for '{company.company_name}'!\n\n"
                                  f"Serial Number: {serial_number}\n\n"
                                  f"The license is inactive. Select it and configure it to activate.")
                
                # Refresh license list
                self.load_all_licenses()
                
        except Exception as e:
            messagebox.showerror("Error", f"Failed to add license: {str(e)}")
            import traceback
            traceback.print_exc()

    def _binding_status_label(self, license_row):
        from license_serial import binding_status_label
        return binding_status_label(license_row)

    def _primary_license_feature_key(self, license_row):
        from license_serial import parse_license_features
        business_keys = BUSINESS_LICENSE_FEATURE_KEYS
        features = parse_license_features(license_row.features)
        for key in business_keys:
            if features.get(key):
                return key
        return 'pos_systems'

    def add_device_license_for_selected(self):
        """Issue another license for the same system (second register, PC, or browser)."""
        try:
            selection = self.all_licenses_tree.selection()
            if not selection:
                messagebox.showwarning("Warning", "Select a license first, then click Add Device License.")
                return

            item = self.all_licenses_tree.item(selection[0])
            license_id = int(item['values'][0])

            app = create_app()
            with app.app_context():
                source = db.session.get(LicenseActivation, license_id)
                if not source:
                    messagebox.showerror("Error", "Selected license not found.")
                    return

                company = db.session.get(CompanyRegistration, source.company_id)
                if not company:
                    messagebox.showerror("Error", "Company not found for this license.")
                    return

                feature_key = self._primary_license_feature_key(source)
                company_licenses = LicenseActivation.query.filter_by(company_id=company.id).all()
                from license_serial import (
                    next_device_seat,
                    ensure_unique_license_serial,
                    is_legacy_short_license_serial,
                    LICENSE_KEY_TO_CODE,
                )

                seat = next_device_seat(company_licenses, feature_key)
                msp_from_key = {
                    'pos_systems': 'pos',
                    'restaurant_management': 'restaurant',
                    'document_management': 'document',
                    'ecommerce_websites': 'ecommerce',
                    'auto_system': 'auto',
                    'distribution_system': 'distribution',
                    'customer_management': 'crm',
                }
                serial_number = ensure_unique_license_serial(
                    db.session,
                    LicenseActivation,
                    msp_feature=msp_from_key.get(feature_key, 'pos'),
                    msp_client_id=company.msp_client_id,
                    features_raw=source.features,
                    device_seat=seat,
                )
                if is_legacy_short_license_serial(serial_number):
                    raise RuntimeError('Generated short or legacy device license serial; aborting')

                now = datetime.now(timezone.utc)
                new_license = LicenseActivation(
                    serial_number=serial_number,
                    company_id=company.id,
                    license_type=source.license_type,
                    service_level=source.service_level,
                    max_users=source.max_users,
                    features=source.features,
                    activation_date=now,
                    expiration_date=source.expiration_date or (now + timedelta(days=365)),
                    is_active=False,
                )
                db.session.add(new_license)
                db.session.commit()

                feature_label = LICENSE_KEY_TO_CODE.get(feature_key, feature_key)
                messagebox.showinfo(
                    "Device license created",
                    f"Added device license #{seat} for {company.company_name} ({feature_label}).\n\n"
                    f"Serial: {serial_number}\n\n"
                    "Activate this serial on the additional register, PC, or browser.\n"
                    "Web/POS binds to browser fingerprint; desktop restaurant binds to machine install on first use.",
                )
                self.load_all_licenses()

        except Exception as e:
            messagebox.showerror("Error", f"Failed to add device license: {str(e)}")
            import traceback
            traceback.print_exc()

    def clear_device_binding_for_selected(self):
        """Clear browser binding so the license can be moved to another browser (support transfer)."""
        try:
            selection = self.all_licenses_tree.selection()
            if not selection:
                messagebox.showwarning("Warning", "Select a license to clear its device binding.")
                return

            item = self.all_licenses_tree.item(selection[0])
            license_id = int(item['values'][0])

            if not messagebox.askyesno(
                "Clear device binding",
                "Clear browser/device binding for this license?\n\n"
                "Use when moving a web/POS install to a new browser or PC.\n"
                "Restaurant desktop installs use a local machine fingerprint — issue a new device license instead if needed.\n\n"
                "Continue?",
            ):
                return

            app = create_app()
            with app.app_context():
                license_row = db.session.get(LicenseActivation, license_id)
                if not license_row:
                    messagebox.showerror("Error", "Selected license not found.")
                    return

                if not license_row.browser_fingerprint:
                    messagebox.showinfo("No binding", "This license has no browser fingerprint stored.")
                    return

                license_row.browser_fingerprint = None
                db.session.commit()
                messagebox.showinfo(
                    "Binding cleared",
                    f"Browser binding cleared for {license_row.serial_number}.\n"
                    "The next successful activation will bind to the new device/browser.",
                )
                self.load_all_licenses()

        except Exception as e:
            messagebox.showerror("Error", f"Failed to clear binding: {str(e)}")
            import traceback
            traceback.print_exc()

    def validate_selected_license(self):
        """Validate the selected license"""
        try:
            selection = self.all_licenses_tree.selection()
            if not selection:
                messagebox.showwarning("Warning", "Please select a license to validate.")
                return
            
            item = self.all_licenses_tree.item(selection[0])
            license_id = int(item['values'][0])
            
            app = create_app()
            with app.app_context():
                license = db.session.get(LicenseActivation, license_id)
                if not license:
                    messagebox.showerror("Error", "License not found.")
                    return
                
                # Check license status
                is_valid = license.is_active
                if license.expiration_date and license.expiration_date < datetime.now(timezone.utc):
                    is_valid = False
                
                status = "Valid" if is_valid else "Invalid"
                reason = "License is active and not expired" if is_valid else "License is inactive or expired"
                
                messagebox.showinfo("License Validation", f"""License Validation Result:

Status: {status}
Reason: {reason}
Serial Number: {license.serial_number}
Activation Date: {license.activation_date or 'Not activated'}
Expiration Date: {license.expiration_date or 'No expiration'}""")
                
        except Exception as e:
            messagebox.showerror("Error", f"Failed to validate license: {str(e)}")

    def extend_selected_license(self):
        """Extend the selected license"""
        try:
            selection = self.all_licenses_tree.selection()
            if not selection:
                messagebox.showwarning("Warning", "Please select a license to extend.")
                return
            
            item = self.all_licenses_tree.item(selection[0])
            license_id = int(item['values'][0])
            
            # Get extension days
            extension_days = tk.simpledialog.askinteger("Extend License", 
                                                       "Enter number of days to extend:", 
                                                       minvalue=1, maxvalue=3650)
            if not extension_days:
                return
            
            app = create_app()
            with app.app_context():
                license = db.session.get(LicenseActivation, license_id)
                if not license:
                    messagebox.showerror("Error", "License not found.")
                    return
                
                if license.expiration_date:
                    license.expiration_date += timedelta(days=extension_days)
                else:
                    license.expiration_date = datetime.now(timezone.utc) + timedelta(days=extension_days)
                
                db.session.commit()
                
                messagebox.showinfo("Success", f"License extended by {extension_days} days.\nNew expiration: {license.expiration_date}")
                
                # Refresh the license list
                self.load_all_licenses()
                
        except Exception as e:
            messagebox.showerror("Error", f"Failed to extend license: {str(e)}")

    def deactivate_selected_license(self):
        """Deactivate the selected license"""
        try:
            selection = self.all_licenses_tree.selection()
            if not selection:
                messagebox.showwarning("Warning", "Please select a license to deactivate.")
                return
            
            item = self.all_licenses_tree.item(selection[0])
            license_id = int(item['values'][0])
            company_name = item['values'][1]
            
            # Confirm deactivation
            result = messagebox.askyesno("Confirm Deactivation", 
                                       f"Are you sure you want to deactivate the license for {company_name}?\n\n"
                                       "This will make the license inactive but can be reactivated later.")
            if not result:
                return
            
            app = create_app()
            with app.app_context():
                license = db.session.get(LicenseActivation, license_id)
                if not license:
                    messagebox.showerror("Error", "License not found.")
                    return
                
                # Deactivate the license
                license.is_active = False
                db.session.commit()
                
                messagebox.showinfo("Success", f"License for {company_name} has been deactivated.")
                
                # Refresh the license list
                self.load_all_licenses()
                
        except Exception as e:
            messagebox.showerror("Error", f"Failed to deactivate license: {str(e)}")

    def mark_license_as_expired(self):
        """Mark the selected license as expired"""
        try:
            selection = self.all_licenses_tree.selection()
            if not selection:
                messagebox.showwarning("Warning", "Please select a license to mark as expired.")
                return
            
            item = self.all_licenses_tree.item(selection[0])
            license_id = int(item['values'][0])
            company_name = item['values'][1]
            
            # Confirm expiration
            result = messagebox.askyesno("Confirm Expiration", 
                                       f"Are you sure you want to mark the license for {company_name} as expired?\n\n"
                                       "This will set the expiration date to yesterday and deactivate the license.")
            if not result:
                return
            
            app = create_app()
            with app.app_context():
                license = db.session.get(LicenseActivation, license_id)
                if not license:
                    messagebox.showerror("Error", "License not found.")
                    return
                
                # Mark as expired by setting expiration date to yesterday and deactivating
                license.expiration_date = datetime.now(timezone.utc) - timedelta(days=1)
                license.is_active = False
                db.session.commit()
                
                messagebox.showinfo("Success", f"License for {company_name} has been marked as expired.")
                
                # Refresh the license list
                self.load_all_licenses()
                
        except Exception as e:
            messagebox.showerror("Error", f"Failed to mark license as expired: {str(e)}")

    def reactivate_selected_license(self):
        """Reactivate the selected license"""
        try:
            selection = self.all_licenses_tree.selection()
            if not selection:
                messagebox.showwarning("Warning", "Please select a license to reactivate.")
                return
            
            item = self.all_licenses_tree.item(selection[0])
            license_id = int(item['values'][0])
            company_name = item['values'][1]
            
            # Check if license is already active
            app = create_app()
            with app.app_context():
                license = db.session.get(LicenseActivation, license_id)
                if not license:
                    messagebox.showerror("Error", "License not found.")
                    return
                
                if license.is_active:
                    messagebox.showinfo("Info", "This license is already active.")
                    return
                
                # Check if license is expired
                now = datetime.now(timezone.utc)
                if license.expiration_date and license.expiration_date.replace(tzinfo=timezone.utc) < now:
                    # Ask if user wants to extend the license
                    extend_result = messagebox.askyesno("License Expired", 
                                                     f"The license for {company_name} has expired.\n\n"
                                                     "Would you like to extend it before reactivating?")
                    if extend_result:
                        # Get extension days
                        extension_days = simpledialog.askinteger("Extend License", 
                                                               "Enter number of days to extend:", 
                                                               minvalue=1, maxvalue=3650)
                        if extension_days:
                            license.expiration_date = now + timedelta(days=extension_days)
                        else:
                            return
                    else:
                        # Just reactivate without extending
                        pass
                
                # Reactivate the license
                license.is_active = True
                license.activation_date = now
                db.session.commit()
                
                messagebox.showinfo("Success", f"License for {company_name} has been reactivated.")
                
                # Refresh the license list
                self.load_all_licenses()
                
        except Exception as e:
            messagebox.showerror("Error", f"Failed to reactivate license: {str(e)}")

    def delete_selected_license(self):
        """Delete the selected license (without deleting the company)"""
        try:
            selection = self.all_licenses_tree.selection()
            if not selection:
                messagebox.showwarning("Warning", "Please select a license to delete.")
                return
            
            item = self.all_licenses_tree.item(selection[0])
            license_id = int(item['values'][0])
            company_name = item['values'][1]
            license_serial = None
            
            # Get license serial number for confirmation message
            app = create_app()
            with app.app_context():
                license = db.session.get(LicenseActivation, license_id)
                if not license:
                    messagebox.showerror("Error", "License not found.")
                    return
                license_serial = license.serial_number
            
            # Confirm deletion
            result = messagebox.askyesno("Confirm Delete License", 
                                       f"Are you sure you want to DELETE this license?\n\n"
                                       f"Company: {company_name}\n"
                                       f"Serial Number: {license_serial}\n\n"
                                       "⚠️ WARNING: This action cannot be undone!\n"
                                       "The license will be permanently deleted, but the company will remain.")
            if not result:
                return
            
            # Delete the license directly within app context
            app = create_app()
            with app.app_context():
                try:
                    license = db.session.get(LicenseActivation, license_id)
                    if not license:
                        messagebox.showerror("Error", "License not found.")
                        return
                    
                    # Store serial for success message
                    license_serial = license.serial_number
                    
                    # First, delete all validation logs associated with this license
                    # This prevents foreign key constraint errors
                    validation_logs = LicenseValidationLog.query.filter_by(license_id=license_id).all()
                    log_count = len(validation_logs)
                    for log in validation_logs:
                        db.session.delete(log)
                    
                    # Now delete the license itself
                    db.session.delete(license)
                    db.session.commit()
                    
                    log_message = f" and {log_count} validation log(s)" if log_count > 0 else ""
                    messagebox.showinfo("Success", f"License {license_serial}{log_message} has been deleted successfully.\n\nThe company '{company_name}' remains in the system.")
                    
                    # Refresh the license list
                    self.load_all_licenses()
                    
                except Exception as e:
                    db.session.rollback()
                    messagebox.showerror("Error", f"Failed to delete license: {str(e)}")
                
        except Exception as e:
            messagebox.showerror("Error", f"Failed to delete license: {str(e)}")

    def create_msp_integration_tab(self):
        """Create the compact MSP Integration tab"""
        msp_frame = ttk.Frame(self.notebook)
        self.notebook.add(msp_frame, text="MSP Integration")
        
        # Top frame with configuration
        config_frame = ttk.LabelFrame(msp_frame, text="MSP Configuration")
        config_frame.pack(fill=tk.X, padx=5, pady=5)
        
        # API URL and Token in one row
        url_frame = ttk.Frame(config_frame)
        url_frame.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Label(url_frame, text="API URL:").pack(side=tk.LEFT)
        self.msp_api_url_var = tk.StringVar()
        self.msp_api_url_entry = ttk.Entry(url_frame, textvariable=self.msp_api_url_var, width=40)
        self.msp_api_url_entry.pack(side=tk.LEFT, padx=(5, 20))
        
        ttk.Label(url_frame, text="Token:").pack(side=tk.LEFT)
        self.msp_api_token_var = tk.StringVar()
        self.msp_api_token_entry = ttk.Entry(url_frame, textvariable=self.msp_api_token_var, width=30, show="*")
        self.msp_api_token_entry.pack(side=tk.LEFT, padx=(5, 0))
        self.msp_api_token_var.trace('w', self.on_token_change)
        
        # Action buttons
        button_frame = ttk.Frame(config_frame)
        button_frame.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Button(button_frame, text="Save Config", command=self.save_msp_config).pack(side=tk.LEFT, padx=2)
        ttk.Button(button_frame, text="Test", command=self.test_msp_connection).pack(side=tk.LEFT, padx=2)
        ttk.Button(button_frame, text="Sync All", command=self.sync_all_msp_clients).pack(side=tk.LEFT, padx=2)
        ttk.Button(button_frame, text="Load Clients", command=self.load_msp_clients).pack(side=tk.LEFT, padx=2)
        
        # Main content area
        content_frame = ttk.Frame(msp_frame)
        content_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # MSP Clients list
        clients_frame = ttk.LabelFrame(content_frame, text="MSP Clients")
        clients_frame.pack(fill=tk.BOTH, expand=True)
        
        # Compact columns
        client_columns = ('ID', 'Company', 'Contact', 'Service', 'Features', 'License')
        self.msp_clients_tree = ttk.Treeview(clients_frame, columns=client_columns, show='headings', height=12)
        
        # Configure columns
        for col in client_columns:
            self.msp_clients_tree.heading(col, text=col)
        
        # Configure column widths
        self.msp_clients_tree.column('ID', width=60)
        self.msp_clients_tree.column('Company', width=180)
        self.msp_clients_tree.column('Contact', width=120)
        self.msp_clients_tree.column('Service', width=80)
        self.msp_clients_tree.column('Features', width=120)
        self.msp_clients_tree.column('License', width=100)
        
        # Scrollbar
        clients_scrollbar = ttk.Scrollbar(clients_frame, orient=tk.VERTICAL, command=self.msp_clients_tree.yview)
        self.msp_clients_tree.configure(yscrollcommand=clients_scrollbar.set)
        
        self.msp_clients_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        clients_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        # Bind double-click event
        self.msp_clients_tree.bind('<Double-1>', self.edit_msp_client_license)

    def test_msp_connection(self):
        """Test MSP API connection"""
        try:
            # Update integration with current values
            self.msp_integration.api_url = self.msp_api_url_var.get()
            self.msp_integration.api_token = self.msp_api_token_var.get()
            
            # Test connection
            result = self.msp_integration.get_msp_clients()
            
            if 'error' in result:
                messagebox.showerror("Connection Failed", f"Failed to connect to MSP API:\n{result['error']}")
            else:
                total_clients = result.get('total_clients', 0)
                filtered_clients = result.get('filtered_clients', 0)
                messagebox.showinfo("Connection Successful", 
                                  f"Successfully connected to MSP API!\n\n"
                                  f"Total clients: {total_clients}\n"
                                  f"Clients with activation features: {filtered_clients}")
        except Exception as e:
            messagebox.showerror("Connection Failed", f"Connection test failed: {str(e)}")

    def load_msp_clients(self):
        """Load MSP clients into the tree"""
        try:
            # Clear existing items
            for item in self.msp_clients_tree.get_children():
                self.msp_clients_tree.delete(item)
            
            # Update integration with current values
            self.msp_integration.api_url = self.msp_api_url_var.get()
            self.msp_integration.api_token = self.msp_api_token_var.get()
            
            # Get clients
            result = self.msp_integration.get_msp_clients()
            
            if 'error' in result:
                messagebox.showerror("Error", f"Failed to load MSP clients:\n{result['error']}")
                return
            
            clients = result.get('clients', [])
            
            for client in clients:
                # Get license status for this client
                license_status = "No License"
                try:
                    app = create_app()
                    with app.app_context():
                        company = CompanyRegistration.query.filter_by(msp_client_id=client['id']).first()
                        if company:
                            company_licenses = LicenseActivation.query.filter_by(company_id=company.id).all()
                            if not company_licenses:
                                license_status = "No License"
                            else:
                                active = next((l for l in company_licenses if l.is_active), None)
                                if active:
                                    license_status = f"Active: {active.license_type}"
                                else:
                                    license_status = "Inactive License"
                except:
                    pass
                
                # Format features
                features = client.get('features', [])
                if isinstance(features, str):
                    try:
                        features = json.loads(features)
                    except:
                        features = []
                
                features_display = ", ".join(features) if features else "None"
                
                # Insert into tree with correct field mappings
                # Columns: ID, Company, Contact, Service, Features, License
                self.msp_clients_tree.insert('', 'end', values=(
                    client['id'],
                    client.get('companyName', 'N/A'),
                    client.get('contactPerson', 'N/A'),
                    client.get('serviceLevel', 'N/A'),
                    features_display,
                    license_status
                ))
            
            messagebox.showinfo("Success", f"Loaded {len(clients)} MSP clients with activation features.")
            
        except Exception as e:
            messagebox.showerror("Error", f"Failed to load MSP clients: {str(e)}")

    def sync_all_msp_clients(self):
        """Sync all MSP clients to the license system"""
        try:
            # Update integration with current values
            self.msp_integration.api_url = self.msp_api_url_var.get()
            self.msp_integration.api_token = self.msp_api_token_var.get()
            
            # Show progress dialog
            progress_window = tk.Toplevel(self.root)
            progress_window.title("Syncing MSP Clients")
            progress_window.geometry("400x150")
            progress_window.transient(self.root)
            progress_window.grab_set()
            
            progress_label = ttk.Label(progress_window, text="Syncing MSP clients...")
            progress_label.pack(pady=20)
            
            progress_bar = ttk.Progressbar(progress_window, mode='indeterminate')
            progress_bar.pack(pady=10, padx=20, fill=tk.X)
            progress_bar.start()
            
            def sync_worker():
                try:
                    result = self.msp_integration.sync_all_msp_clients()
                    
                    self.root.after(0, lambda: progress_window.destroy())
                    
                    if result['success']:
                        self.root.after(0, lambda: messagebox.showinfo("Sync Complete", 
                            f"Successfully synced {result['synced_count']} clients.\n"
                            f"Created {result['companies_created']} companies.\n"
                            f"Created {result['licenses_created']} licenses."))
                        
                        # Refresh data
                        self.root.after(0, self.refresh_companies)
                        self.root.after(0, self.load_all_licenses)
                    else:
                        self.root.after(0, lambda: messagebox.showerror("Sync Failed", result['error']))
                        
                except Exception as e:
                    error_msg = str(e)
                    self.root.after(0, lambda: progress_window.destroy())
                    self.root.after(0, lambda: messagebox.showerror("Sync Error", f"Sync failed: {error_msg}"))
            
            # Run sync in background thread
            sync_thread = threading.Thread(target=sync_worker)
            sync_thread.daemon = True
            sync_thread.start()
            
        except Exception as e:
            messagebox.showerror("Error", f"Failed to start sync: {str(e)}")

    def _select_license_dialog(self, company_name, licenses, client_id):
        """Show dialog to select which license to edit, or create new one"""
        select_window = tk.Toplevel(self.root)
        select_window.title(f"Select License - {company_name}")
        select_window.geometry("600x400")
        select_window.transient(self.root)
        select_window.grab_set()
        
        selected_license_id = [None]  # Use list to allow modification in nested function
        
        main_frame = ttk.Frame(select_window)
        main_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        ttk.Label(main_frame, text=f"Company: {company_name}", font=('Arial', 12, 'bold')).pack(anchor=tk.W, pady=(0, 10))
        ttk.Label(main_frame, text=f"Found {len(licenses)} license(s). Select one to edit or create a new license:", 
                 font=('Arial', 10)).pack(anchor=tk.W, pady=(0, 10))
        
        # List of licenses
        list_frame = ttk.LabelFrame(main_frame, text="Existing Licenses")
        list_frame.pack(fill=tk.BOTH, expand=True, pady=5)
        
        # Create treeview for licenses
        columns = ('Serial', 'Type', 'Users', 'Status', 'Expires')
        license_tree = ttk.Treeview(list_frame, columns=columns, show='headings', height=8)
        
        for col in columns:
            license_tree.heading(col, text=col)
            license_tree.column(col, width=100)
        
        license_tree.column('Serial', width=150)
        license_tree.column('Type', width=120)
        license_tree.column('Users', width=60)
        license_tree.column('Status', width=80)
        license_tree.column('Expires', width=100)
        
        scrollbar = ttk.Scrollbar(list_frame, orient=tk.VERTICAL, command=license_tree.yview)
        license_tree.configure(yscrollcommand=scrollbar.set)
        
        license_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        # Populate licenses
        for lic in licenses:
            from datetime import datetime, timezone
            status = "Active" if lic['is_active'] else "Inactive"
            expires = "Never" if not lic['expiration_date'] else lic['expiration_date'].strftime('%Y-%m-%d')
            
            license_tree.insert('', 'end', values=(
                lic['serial_number'],
                lic['license_type'] or 'N/A',
                lic['max_users'] or 'N/A',
                status,
                expires
            ), tags=(lic['id'],))
        
        def on_select():
            selection = license_tree.selection()
            if selection:
                item = license_tree.item(selection[0])
                # Get license ID from tags
                selected_license_id[0] = int(item['tags'][0]) if item['tags'] else None
                select_window.destroy()
        
        def create_new():
            selected_license_id[0] = None  # None means create new
            select_window.destroy()
        
        # Buttons
        buttons_frame = ttk.Frame(main_frame)
        buttons_frame.pack(fill=tk.X, pady=(10, 0))
        
        ttk.Button(buttons_frame, text="Edit Selected License", command=on_select).pack(side=tk.LEFT, padx=5)
        ttk.Button(buttons_frame, text="Create New License", command=create_new).pack(side=tk.LEFT, padx=5)
        ttk.Button(buttons_frame, text="Cancel", command=select_window.destroy).pack(side=tk.LEFT, padx=5)
        
        # Bind double-click to select
        license_tree.bind('<Double-1>', lambda e: on_select())
        
        # Wait for window to close
        select_window.wait_window()
        
        return selected_license_id[0]
    
    def edit_msp_client_license(self, event):
        """Edit MSP client license"""
        try:
            selection = self.msp_clients_tree.selection()
            if not selection:
                return
            
            item = self.msp_clients_tree.item(selection[0])
            client_id = item['values'][0]
            company_name = item['values'][1]
            
            # Check if licenses exist in database and get all licenses
            all_licenses = []
            company_id = None
            app = create_app()
            with app.app_context():
                company = CompanyRegistration.query.filter_by(msp_client_id=client_id).first()
                if not company:
                    # Automatically create company from MSP client data
                    # Fetch client data from MSP API
                    try:
                        # Update integration with current values
                        self.msp_integration.api_url = self.msp_api_url_var.get()
                        self.msp_integration.api_token = self.msp_api_token_var.get()
                        
                        # Get all clients and find the one we need
                        clients_response = self.msp_integration.get_msp_clients()
                        if 'error' not in clients_response:
                            clients = clients_response.get('clients', [])
                            client_data = None
                            for client in clients:
                                if str(client.get('id')) == str(client_id):
                                    client_data = client
                                    break
                            
                            if client_data:
                                # Sync/create the company using the integration method
                                sync_result = self.msp_integration.sync_msp_client_to_license_system(client_data)
                                if sync_result.get('success'):
                                    company_id = sync_result.get('company_id')
                                    company = CompanyRegistration.query.get(company_id)
                                    if company:
                                        # Refresh companies list
                                        self.refresh_companies()
                                        messagebox.showinfo("Company Created", 
                                                          f"Company '{company.company_name}' was automatically created from MSP client data.")
                                    else:
                                        # Try to get company again
                                        company = CompanyRegistration.query.filter_by(msp_client_id=client_id).first()
                                        if company:
                                            self.refresh_companies()
                                else:
                                    messagebox.showerror("Error", f"Failed to create company: {sync_result.get('error', 'Unknown error')}")
                                    return
                            else:
                                # Create company with minimal data if client not found in API
                                from license_serial import ensure_unique_company_serial
                                serial_number = ensure_unique_company_serial(db.session, CompanyRegistration, str(client_id))
                                company = CompanyRegistration(
                                    company_name=company_name,
                                    contact_person="Unknown",
                                    email="",
                                    phone="",
                                    address="",
                                    serial_number=serial_number,
                                    msp_client_id=str(client_id)
                                )
                                db.session.add(company)
                                db.session.commit()
                                db.session.refresh(company)
                                # Refresh companies list
                                self.refresh_companies()
                                messagebox.showinfo("Company Created", 
                                                  f"Company '{company_name}' was automatically created.")
                        else:
                            # Create company with minimal data if API call fails
                            from license_serial import ensure_unique_company_serial
                            serial_number = ensure_unique_company_serial(db.session, CompanyRegistration, str(client_id))
                            company = CompanyRegistration(
                                company_name=company_name,
                                contact_person="Unknown",
                                email="",
                                phone="",
                                address="",
                                serial_number=serial_number,
                                msp_client_id=str(client_id)
                            )
                            db.session.add(company)
                            db.session.commit()
                            db.session.refresh(company)
                            # Refresh companies list
                            self.refresh_companies()
                            messagebox.showinfo("Company Created", 
                                              f"Company '{company_name}' was automatically created.")
                    except Exception as e:
                        messagebox.showerror("Error", f"Failed to create company automatically: {str(e)}")
                        return
                
                if company:
                    company_id = company.id
                    all_licenses = LicenseActivation.query.filter_by(company_id=company.id).all()
                    # Extract license data while in app context
                    all_licenses = [
                        {
                            'id': lic.id,
                            'serial_number': lic.serial_number,
                            'license_type': lic.license_type,
                            'max_users': lic.max_users,
                            'expiration_date': lic.expiration_date,
                            'features': lic.features,
                            'is_active': lic.is_active
                        }
                        for lic in all_licenses
                    ]
            
            # If multiple licenses exist, show selection dialog
            selected_license_id = None
            if len(all_licenses) > 1:
                selected_license_id = self._select_license_dialog(company_name, all_licenses, client_id)
                if selected_license_id is None:
                    return  # User cancelled
            elif len(all_licenses) == 1:
                selected_license_id = all_licenses[0]['id']
            
            # Get the selected license data
            existing_license_data = None
            if selected_license_id:
                for lic in all_licenses:
                    if lic['id'] == selected_license_id:
                        existing_license_data = lic
                        break
            
            has_license = existing_license_data is not None
            window_title = f"{'Edit' if has_license else 'Add'} License - {company_name}"
            
            # Create edit dialog
            edit_window = tk.Toplevel(self.root)
            edit_window.title(window_title)
            edit_window.geometry("500x600")
            edit_window.transient(self.root)
            edit_window.grab_set()
            
            # Main frame
            main_frame = ttk.Frame(edit_window)
            main_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
            
            # Company info
            ttk.Label(main_frame, text=f"Company: {company_name}", font=('Arial', 12, 'bold')).pack(anchor=tk.W, pady=(0, 10))
            
            # License type
            type_frame = ttk.Frame(main_frame)
            type_frame.pack(fill=tk.X, pady=5)
            ttk.Label(type_frame, text="License Type:").pack(side=tk.LEFT)
            license_type_var = tk.StringVar()
            license_type_combo = ttk.Combobox(type_frame, textvariable=license_type_var,
                                            values=list(LICENSE_TYPE_OPTIONS),
                                            state='readonly', width=20)
            license_type_combo.pack(side=tk.LEFT, padx=(5, 0))
            
            # Set default license type if no license exists
            if not has_license:
                license_type_var.set('Day Pass')
            
            # Duration and max users
            config_frame = ttk.Frame(main_frame)
            config_frame.pack(fill=tk.X, pady=5)
            
            ttk.Label(config_frame, text="Duration (days):").pack(side=tk.LEFT)
            duration_var = tk.StringVar()
            duration_entry = ttk.Entry(config_frame, textvariable=duration_var, width=10)
            duration_entry.pack(side=tk.LEFT, padx=(5, 20))
            
            # Set default duration if no license exists
            if not has_license:
                duration_var.set('1')
            
            ttk.Label(config_frame, text="Max Users:").pack(side=tk.LEFT)
            max_users_var = tk.StringVar()
            max_users_entry = ttk.Entry(config_frame, textvariable=max_users_var, width=10)
            max_users_entry.pack(side=tk.LEFT, padx=(5, 0))
            
            # Set default max users if no license exists
            if not has_license:
                max_users_var.set('5')
            
            # Features selection
            features_label = ttk.Label(main_frame, text="Activation Features:", font=('Arial', 10, 'bold'))
            features_label.pack(anchor=tk.W, pady=(10, 5))
            
            features_frame = ttk.Frame(main_frame)
            features_frame.pack(fill=tk.X, pady=5)
            
            feature_vars = {}
            feature_options = GUI_LICENSE_FEATURE_OPTIONS
            
            for i, feature in enumerate(feature_options):
                var = tk.BooleanVar()
                feature_vars[feature] = var
                ttk.Checkbutton(features_frame, text=feature, variable=var).grid(row=i//2, column=i%2, sticky=tk.W, padx=5, pady=2)
            
            # Store initial state for change detection
            initial_features = set()
            
            # Load existing license data if available
            if has_license and existing_license_data:
                # Pre-populate form with existing license data
                license_type_var.set(normalize_license_type(existing_license_data['license_type'], 'Day Pass'))
                max_users_var.set(str(existing_license_data['max_users'] or 1))
                
                # Calculate duration from expiration date
                if existing_license_data['expiration_date']:
                    from datetime import datetime, timezone
                    now = datetime.now(timezone.utc)
                    exp_date = existing_license_data['expiration_date']
                    if exp_date.tzinfo is None:
                        exp_date = exp_date.replace(tzinfo=timezone.utc)
                    days_remaining = (exp_date - now).days
                    duration_var.set(str(max(1, days_remaining)))
                else:
                    duration_var.set("9999")  # No time limit
                
                # Parse and pre-select features
                if existing_license_data['features']:
                    try:
                        features_dict = json.loads(existing_license_data['features'])
                        feature_mapping = GUI_LICENSE_FEATURE_KEY_TO_LABEL
                        
                        for feature_key, feature_name in feature_mapping.items():
                            if features_dict.get(feature_key, False):
                                if feature_name in feature_vars:
                                    feature_vars[feature_name].set(True)
                                    initial_features.add(feature_name)
                    except:
                        pass
            
            # Get current features from the tree as fallback
            if len(item['values']) > 4 and not initial_features:
                current_features = item['values'][4]  # Features column (index 4)
                current_feature_list = [f.strip() for f in current_features.split(',') if f.strip() and f.strip() != 'None']
                
                # Pre-select current features (only if not already set from license data)
                for feature in current_feature_list:
                    if feature in feature_vars and not feature_vars[feature].get():
                        feature_vars[feature].set(True)
                        initial_features.add(feature)
            
            # Buttons
            buttons_frame = ttk.Frame(main_frame)
            buttons_frame.pack(fill=tk.X, pady=(20, 0))
            
            def update_license():
                try:
                    selected_features = [feature for feature, var in feature_vars.items() if var.get()]
                    
                    if not selected_features:
                        messagebox.showwarning("Warning", "Please select at least one feature.")
                        return
                    
                    # Check if features have changed (compare with initial state)
                    if set(selected_features) == initial_features:
                        # Also check if other fields changed
                        current_license_type = license_type_var.get()
                        current_duration = int(duration_var.get()) if duration_var.get().isdigit() else 1
                        current_max_users = int(max_users_var.get()) if max_users_var.get().isdigit() else 1
                        
                        # If nothing changed, just close
                        # Note: We can't easily check duration/type changes without storing initial values
                        # So we'll allow the update to proceed
                        pass
                    
                    # Update license (pass license_id if editing existing, None if creating new)
                    result = self.msp_integration.update_msp_client_license(
                        client_id, 
                        validate_license_type(license_type_var.get()),
                        parse_duration_days(duration_var.get(), license_type_var.get()),
                        int(max_users_var.get()) if max_users_var.get().isdigit() else 1,
                        selected_features,
                        license_id=selected_license_id if has_license else None
                    )
                    
                    if result['success']:
                        created = result.get('created_licenses', 0)
                        updated = result.get('updated_licenses', 0)
                        deleted = result.get('deleted_licenses', 0)
                        
                        message_parts = []
                        if created > 0:
                            message_parts.append(f"{created} license(s) created")
                        if updated > 0:
                            message_parts.append(f"{updated} license(s) updated")
                        if deleted > 0:
                            message_parts.append(f"{deleted} license(s) deleted")
                        
                        message = "License changes applied successfully!\n\n" + "\n".join(message_parts)
                        if message_parts:
                            messagebox.showinfo("Success", message)
                        else:
                            messagebox.showinfo("Success", "License configuration saved.")
                        
                        edit_window.destroy()
                        self.load_msp_clients()  # Refresh the list
                        self.load_all_licenses()  # Also refresh license management tab
                    else:
                        messagebox.showerror("Error", result['error'])
                        
                except Exception as e:
                    messagebox.showerror("Error", f"Failed to update license: {str(e)}")
            
            # Button text changes based on whether license exists
            button_text = "Update License" if has_license else "Add License"
            ttk.Button(buttons_frame, text=button_text, command=update_license).pack(side=tk.LEFT, padx=5)
            ttk.Button(buttons_frame, text="Cancel", command=edit_window.destroy).pack(side=tk.LEFT, padx=5)
            
        except Exception as e:
            messagebox.showerror("Error", f"Failed to edit license: {str(e)}")

    def create_system_management_tab(self):
        """Create the compact System Management tab"""
        system_frame = ttk.Frame(self.notebook)
        self.notebook.add(system_frame, text="System Management")
        
        # Top frame with refresh button
        top_frame = ttk.Frame(system_frame)
        top_frame.pack(fill=tk.X, padx=5, pady=5)
        
        ttk.Button(top_frame, text="Refresh Stats", command=self.refresh_system_stats).pack(side=tk.LEFT, padx=2)
        
        # System stats frame
        stats_frame = ttk.LabelFrame(system_frame, text="System Statistics")
        stats_frame.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        self.system_stats_text = tk.Text(stats_frame, height=15, wrap=tk.WORD, font=('Consolas', 9))
        self.system_stats_text.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # Load initial stats
        self.refresh_system_stats()

    def refresh_system_stats(self):
        """Refresh system statistics"""
        try:
            app = create_app()
            with app.app_context():
                # Get counts
                total_companies = CompanyRegistration.query.count()
                all_licenses = LicenseActivation.query.all()
                total_licenses = len(all_licenses)
                status_counts = summarize_license_statuses(all_licenses)
                
                recent_licenses = LicenseActivation.query.order_by(LicenseActivation.created_at.desc()).limit(5).all()
                
                stats_text = f"""System Statistics:
• Total Companies: {total_companies}
• Total Licenses: {total_licenses}
• Active Licenses: {status_counts['Active']}
• Pending / Inactive: {status_counts['Inactive']}
• Expired Licenses: {status_counts['Expired']}

Recent License Activity:
"""
                
                for license in recent_licenses:
                    company = db.session.get(CompanyRegistration, license.company_id)
                    company_name = company.company_name if company else "Unknown"
                    status = license_row_display_status(license)
                    stats_text += f"• {license.serial_number} - {company_name} ({status})\n"
                
                self.system_stats_text.delete(1.0, tk.END)
                self.system_stats_text.insert(1.0, stats_text)
                
        except Exception as e:
            print(f"Error refreshing system stats: {e}")

    def refresh_companies(self):
        """Refresh companies list"""
        try:
            # Clear existing items
            for item in self.companies_tree.get_children():
                self.companies_tree.delete(item)
            
            app = create_app()
            with app.app_context():
                companies = CompanyRegistration.query.all()
                
                for company in companies:
                    licenses = LicenseActivation.query.filter_by(company_id=company.id).all()
                    if not licenses:
                        status = "No Licenses"
                    else:
                        counts = summarize_license_statuses(licenses)
                        parts = []
                        if counts['Active']:
                            parts.append(f"Active: {counts['Active']}")
                        if counts['Inactive']:
                            parts.append(f"Pending: {counts['Inactive']}")
                        if counts['Expired']:
                            parts.append(f"Expired: {counts['Expired']}")
                        status = ', '.join(parts) if parts else 'No Licenses'
                    
                    # Insert into tree (compact format)
                    self.companies_tree.insert('', 'end', values=(
                        company.id,
                        company.company_name,
                        company.contact_person,
                        status
                    ))
                
        except Exception as e:
            print(f"Error loading companies: {e}")

    def add_company(self):
        """Add a new company"""
        try:
            # Create add company dialog
            add_window = tk.Toplevel(self.root)
            add_window.title("Add New Company")
            add_window.geometry("500x400")
            add_window.transient(self.root)
            add_window.grab_set()
            
            # Main frame
            main_frame = ttk.Frame(add_window)
            main_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
            
            # Title
            ttk.Label(main_frame, text="Add New Company", font=('Arial', 12, 'bold')).pack(anchor=tk.W, pady=(0, 15))
            
            # Form fields
            form_frame = ttk.Frame(main_frame)
            form_frame.pack(fill=tk.BOTH, expand=True)
            
            # Company Name
            ttk.Label(form_frame, text="Company Name *:").grid(row=0, column=0, sticky=tk.W, pady=5, padx=(0, 10))
            company_name_var = tk.StringVar()
            ttk.Entry(form_frame, textvariable=company_name_var, width=35).grid(row=0, column=1, sticky=(tk.W, tk.E), pady=5)
            
            # Contact Person
            ttk.Label(form_frame, text="Contact Person *:").grid(row=1, column=0, sticky=tk.W, pady=5, padx=(0, 10))
            contact_person_var = tk.StringVar()
            ttk.Entry(form_frame, textvariable=contact_person_var, width=35).grid(row=1, column=1, sticky=(tk.W, tk.E), pady=5)
            
            # Email
            ttk.Label(form_frame, text="Email *:").grid(row=2, column=0, sticky=tk.W, pady=5, padx=(0, 10))
            email_var = tk.StringVar()
            ttk.Entry(form_frame, textvariable=email_var, width=35).grid(row=2, column=1, sticky=(tk.W, tk.E), pady=5)
            
            # Phone
            ttk.Label(form_frame, text="Phone:").grid(row=3, column=0, sticky=tk.W, pady=5, padx=(0, 10))
            phone_var = tk.StringVar()
            ttk.Entry(form_frame, textvariable=phone_var, width=35).grid(row=3, column=1, sticky=(tk.W, tk.E), pady=5)
            
            # Address
            ttk.Label(form_frame, text="Address:").grid(row=4, column=0, sticky=tk.W, pady=5, padx=(0, 10))
            address_var = tk.StringVar()
            ttk.Entry(form_frame, textvariable=address_var, width=35).grid(row=4, column=1, sticky=(tk.W, tk.E), pady=5)
            
            # Business Type
            ttk.Label(form_frame, text="Business Type:").grid(row=5, column=0, sticky=tk.W, pady=5, padx=(0, 10))
            business_type_var = tk.StringVar()
            business_type_combo = ttk.Combobox(form_frame, textvariable=business_type_var,
                                               values=['restaurant', 'cafe', 'bar', 'retail', 'other'],
                                               width=32, state='readonly')
            business_type_combo.grid(row=5, column=1, sticky=(tk.W, tk.E), pady=5)
            business_type_combo.set('restaurant')
            
            # MSP Client ID (optional)
            ttk.Label(form_frame, text="MSP Client ID:").grid(row=6, column=0, sticky=tk.W, pady=5, padx=(0, 10))
            msp_client_id_var = tk.StringVar()
            ttk.Entry(form_frame, textvariable=msp_client_id_var, width=35).grid(row=6, column=1, sticky=(tk.W, tk.E), pady=5)
            
            # Configure grid weights
            form_frame.columnconfigure(1, weight=1)
            
            # Buttons
            buttons_frame = ttk.Frame(main_frame)
            buttons_frame.pack(fill=tk.X, pady=(15, 0))
            
            def save_company():
                try:
                    # Get form data
                    company_name = company_name_var.get().strip()
                    contact_person = contact_person_var.get().strip()
                    email = email_var.get().strip()
                    phone = phone_var.get().strip()
                    address = address_var.get().strip()
                    business_type = business_type_var.get()
                    msp_client_id = msp_client_id_var.get().strip()
                    
                    # Validate required fields
                    if not company_name:
                        messagebox.showerror("Error", "Company Name is required")
                        return
                    
                    if not contact_person:
                        messagebox.showerror("Error", "Contact Person is required")
                        return
                    
                    if not email:
                        messagebox.showerror("Error", "Email is required")
                        return
                    
                    # Basic email validation
                    if '@' not in email or '.' not in email:
                        messagebox.showerror("Error", "Please enter a valid email address")
                        return
                    
                    # Check if MSP Client ID is already used
                    if msp_client_id:
                        app = create_app()
                        with app.app_context():
                            existing = CompanyRegistration.query.filter_by(msp_client_id=msp_client_id).first()
                            if existing:
                                messagebox.showerror("Error", f"MSP Client ID '{msp_client_id}' is already assigned to company '{existing.company_name}'")
                                return
                    
                    from license_serial import ensure_unique_company_serial

                    app = create_app()
                    with app.app_context():
                        serial_number = ensure_unique_company_serial(
                            db.session,
                            CompanyRegistration,
                            msp_client_id if msp_client_id else None,
                        )

                        company = CompanyRegistration(
                            company_name=company_name,
                            contact_person=contact_person,
                            email=email,
                            phone=phone if phone else None,
                            address=address if address else None,
                            business_type=business_type,
                            serial_number=serial_number,
                            msp_client_id=msp_client_id if msp_client_id else None,
                            is_verified=False
                        )
                        
                        db.session.add(company)
                        db.session.commit()
                        
                        messagebox.showinfo("Success", f"Company '{company_name}' added successfully!\n\nSerial Number: {serial_number}")
                        add_window.destroy()
                        
                        # Refresh companies list
                        self.refresh_companies()
                        
                except Exception as e:
                    messagebox.showerror("Error", f"Failed to add company: {str(e)}")
                    import traceback
                    traceback.print_exc()
            
            ttk.Button(buttons_frame, text="Save", command=save_company).pack(side=tk.LEFT, padx=5)
            ttk.Button(buttons_frame, text="Cancel", command=add_window.destroy).pack(side=tk.LEFT, padx=5)
            
        except Exception as e:
            messagebox.showerror("Error", f"Failed to open add company dialog: {str(e)}")
            import traceback
            traceback.print_exc()

    def edit_company(self):
        """Edit selected company"""
        # Simple implementation - you can expand this
        messagebox.showinfo("Info", "Edit company functionality - to be implemented")

    def delete_company(self):
        """Delete selected company"""
        try:
            selection = self.companies_tree.selection()
            if not selection:
                messagebox.showwarning("Warning", "Please select a company to delete.")
                return
            
            item = self.companies_tree.item(selection[0])
            company_id = int(item['values'][0])
            company_name = item['values'][1]
            
            # Confirm deletion
            if messagebox.askyesno("Confirm Delete", f"Are you sure you want to delete company '{company_name}' and all its licenses?"):
                app = create_app()
                with app.app_context():
                    result = self.msp_integration.delete_company_and_licenses(company_id)
                    
                    if result['success']:
                        messagebox.showinfo("Success", f"Company '{company_name}' and all associated licenses deleted successfully.")
                        self.refresh_companies()
                        self.load_all_licenses()
                    else:
                        messagebox.showerror("Error", result['error'])
                        
        except Exception as e:
            messagebox.showerror("Error", f"Failed to delete company: {str(e)}")

def main():
    """Main function to run the GUI"""
    root = tk.Tk()
    app = LicenseActivationGUI(root)
    root.mainloop()

if __name__ == "__main__":
    main()