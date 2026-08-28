#!/usr/bin/env python3
"""
Admin License Manager - Simple tool for creating and managing licenses
This is for you (the admin) to create licenses and send serial numbers to clients.
"""

import sys
import os
import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext
from datetime import datetime, timezone, timedelta
import json
import uuid

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from models import db, CompanyRegistration, LicenseActivation
from flask import Flask

def create_app():
    """Create Flask app for database operations"""
    app = Flask(__name__)
    # Use the same instance DB location as the license API server
    _dir = os.path.dirname(os.path.abspath(__file__))
    instance_dir = os.path.join(_dir, 'instance')
    os.makedirs(instance_dir, exist_ok=True)
    db_path = os.path.join(instance_dir, 'license_system.db')
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + db_path.replace('\\', '/')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    db.init_app(app)
    return app

class AdminLicenseManager:
    def __init__(self, root):
        self.root = root
        self.root.title("Admin License Manager")
        self.root.geometry("800x600")
        self.root.configure(bg='#f0f0f0')
        
        # Create main frame
        main_frame = ttk.Frame(root, padding="10")
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # Title
        title_label = ttk.Label(main_frame, text="Admin License Manager", 
                               font=('Arial', 16, 'bold'))
        title_label.pack(pady=(0, 20))
        
        # Create notebook for tabs
        self.notebook = ttk.Notebook(main_frame)
        self.notebook.pack(fill=tk.BOTH, expand=True)
        
        # Create tabs
        self.create_license_tab()
        self.create_manage_tab()
        
        # Initialize database
        self.init_database()
    
    def init_database(self):
        """Initialize database with tables"""
        app = create_app()
        with app.app_context():
            try:
                db.create_all()
                print("Database initialized successfully")
            except Exception as e:
                print(f"Database initialization error: {e}")
    
    def create_license_tab(self):
        """Create license creation tab"""
        create_frame = ttk.Frame(self.notebook)
        self.notebook.add(create_frame, text="Create License")
        
        # Form frame
        form_frame = ttk.LabelFrame(create_frame, text="Create New License", padding="20")
        form_frame.pack(fill=tk.X, padx=20, pady=10)
        
        # Company information
        ttk.Label(form_frame, text="Company Name:").grid(row=0, column=0, sticky=tk.W, pady=5)
        self.company_name_var = tk.StringVar()
        ttk.Entry(form_frame, textvariable=self.company_name_var, width=40).grid(row=0, column=1, sticky=(tk.W, tk.E), pady=5, padx=(10, 0))
        
        ttk.Label(form_frame, text="Contact Person:").grid(row=1, column=0, sticky=tk.W, pady=5)
        self.contact_person_var = tk.StringVar()
        ttk.Entry(form_frame, textvariable=self.contact_person_var, width=40).grid(row=1, column=1, sticky=(tk.W, tk.E), pady=5, padx=(10, 0))
        
        ttk.Label(form_frame, text="Email:").grid(row=2, column=0, sticky=tk.W, pady=5)
        self.email_var = tk.StringVar()
        ttk.Entry(form_frame, textvariable=self.email_var, width=40).grid(row=2, column=1, sticky=(tk.W, tk.E), pady=5, padx=(10, 0))
        
        ttk.Label(form_frame, text="Phone:").grid(row=3, column=0, sticky=tk.W, pady=5)
        self.phone_var = tk.StringVar()
        ttk.Entry(form_frame, textvariable=self.phone_var, width=40).grid(row=3, column=1, sticky=(tk.W, tk.E), pady=5, padx=(10, 0))
        
        # License details
        ttk.Label(form_frame, text="License Type:").grid(row=4, column=0, sticky=tk.W, pady=5)
        self.license_type_var = tk.StringVar(value="premium")
        license_type_combo = ttk.Combobox(form_frame, textvariable=self.license_type_var, 
                                         values=['basic', 'premium', 'enterprise'], width=37, state='readonly')
        license_type_combo.grid(row=4, column=1, sticky=(tk.W, tk.E), pady=5, padx=(10, 0))
        
        ttk.Label(form_frame, text="Duration (days):").grid(row=5, column=0, sticky=tk.W, pady=5)
        self.duration_var = tk.StringVar(value="365")
        ttk.Spinbox(form_frame, from_=30, to=3650, textvariable=self.duration_var, width=37).grid(row=5, column=1, sticky=(tk.W, tk.E), pady=5, padx=(10, 0))
        
        ttk.Label(form_frame, text="Max Users:").grid(row=6, column=0, sticky=tk.W, pady=5)
        self.max_users_var = tk.StringVar(value="25")
        ttk.Spinbox(form_frame, from_=1, to=1000, textvariable=self.max_users_var, width=37).grid(row=6, column=1, sticky=(tk.W, tk.E), pady=5, padx=(10, 0))
        
        # Create button
        ttk.Button(form_frame, text="Create License", command=self.create_license, 
                   style='Accent.TButton').grid(row=7, column=0, columnspan=2, pady=20)
        
        # Result display
        result_frame = ttk.LabelFrame(create_frame, text="License Details", padding="20")
        result_frame.pack(fill=tk.BOTH, expand=True, padx=20, pady=10)
        
        self.result_text = scrolledtext.ScrolledText(result_frame, height=10, width=70)
        self.result_text.pack(fill=tk.BOTH, expand=True)
    
    def create_manage_tab(self):
        """Create license management tab"""
        manage_frame = ttk.Frame(self.notebook)
        self.notebook.add(manage_frame, text="Manage Licenses")
        
        # Licenses list
        ttk.Label(manage_frame, text="Active Licenses", font=('Arial', 12, 'bold')).pack(anchor=tk.W, pady=(10, 5))
        
        # Treeview for licenses
        columns = ('ID', 'Serial', 'Company', 'Type', 'Expiration', 'Users', 'Active')
        self.licenses_tree = ttk.Treeview(manage_frame, columns=columns, show='headings', height=15)
        
        for col in columns:
            self.licenses_tree.heading(col, text=col)
            self.licenses_tree.column(col, width=100)
        
        # Scrollbar for licenses
        licenses_scrollbar = ttk.Scrollbar(manage_frame, orient=tk.VERTICAL, command=self.licenses_tree.yview)
        self.licenses_tree.configure(yscrollcommand=licenses_scrollbar.set)
        
        self.licenses_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(10, 0), pady=10)
        licenses_scrollbar.pack(side=tk.RIGHT, fill=tk.Y, pady=10)
        
        # Buttons frame
        buttons_frame = ttk.Frame(manage_frame)
        buttons_frame.pack(fill=tk.X, padx=10, pady=(0, 10))
        
        ttk.Button(buttons_frame, text="Refresh", command=self.refresh_licenses).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Button(buttons_frame, text="Extend License", command=self.extend_license_dialog).pack(side=tk.LEFT, padx=5)
        ttk.Button(buttons_frame, text="Deactivate License", command=self.deactivate_license).pack(side=tk.LEFT, padx=5)
        ttk.Button(buttons_frame, text="Copy Serial", command=self.copy_serial).pack(side=tk.LEFT, padx=5)
        
        # Load initial data
        self.refresh_licenses()
    
    def create_license(self):
        """Create a new license"""
        try:
            # Get form data
            company_name = self.company_name_var.get().strip()
            contact_person = self.contact_person_var.get().strip()
            email = self.email_var.get().strip()
            phone = self.phone_var.get().strip()
            license_type = self.license_type_var.get()
            duration = int(self.duration_var.get())
            max_users = int(self.max_users_var.get())
            
            # Validate required fields
            if not all([company_name, contact_person, email]):
                messagebox.showerror("Error", "Please fill in Company Name, Contact Person, and Email")
                return
            
            app = create_app()
            with app.app_context():
                from license_serial import ensure_unique_company_serial, ensure_unique_license_serial

                company_serial = ensure_unique_company_serial(db.session, CompanyRegistration)
                license_serial = ensure_unique_license_serial(
                    db.session,
                    LicenseActivation,
                    msp_feature='restaurant',
                )
                # Safety guard: ensure we don't accidentally create legacy LIC-MSP- serials
                if str(license_serial).upper().startswith('LIC-MSP-'):
                    # Regenerate using the canonical generator until we get a modern serial
                    for _ in range(5):
                        license_serial = ensure_unique_license_serial(db.session, LicenseActivation, msp_feature='restaurant')
                        if not str(license_serial).upper().startswith('LIC-MSP-'):
                            break
                    else:
                        raise RuntimeError('Generated legacy LIC-MSP serial unexpectedly; aborting')

                company = CompanyRegistration(
                    company_name=company_name,
                    contact_person=contact_person,
                    email=email,
                    phone=phone,
                    business_type='restaurant',
                    serial_number=company_serial,
                    is_verified=True
                )
                
                db.session.add(company)
                db.session.flush()  # Get the company ID
                
                # Create license activation
                activation_date = datetime.now(timezone.utc)
                expiration_date = activation_date + timedelta(days=duration)
                
                # Define features based on license type
                features = {
                    'basic': {
                        'inventory_management': True,
                        'advanced_reporting': False,
                        'api_access': False,
                        'multi_location': False
                    },
                    'premium': {
                        'inventory_management': True,
                        'advanced_reporting': True,
                        'api_access': True,
                        'multi_location': False
                    },
                    'enterprise': {
                        'inventory_management': True,
                        'advanced_reporting': True,
                        'api_access': True,
                        'multi_location': True
                    }
                }
                
                license = LicenseActivation(
                    serial_number=license_serial,
                    company_id=company.id,
                    license_type=license_type,
                    activation_date=activation_date,
                    expiration_date=expiration_date,
                    is_active=True,
                    max_users=max_users,
                    features=json.dumps(features[license_type])
                )
                
                db.session.add(license)
                db.session.commit()
                
                # Display result
                result_text = f"""License Created Successfully!

Company Information:
• Company: {company_name}
• Contact: {contact_person}
• Email: {email}
• Phone: {phone}

License Details:
• Serial Number: {license_serial}
• License Type: {license_type.upper()}
• Duration: {duration} days
• Expiration: {expiration_date.strftime('%Y-%m-%d')}
• Max Users: {max_users}

Features Included:
{chr(10).join([f"• {key.replace('_', ' ').title()}: {'Yes' if value else 'No'}" for key, value in features[license_type].items()])}

Instructions for Client:
1. Go to Admin Panel → System Settings → License Management
2. Enter Serial Number: {license_serial}
3. Click "Activate License"
4. The system will automatically configure the license

Send this serial number to your client: {license_serial}
"""
                
                self.result_text.delete(1.0, tk.END)
                self.result_text.insert(1.0, result_text)
                
                # Clear form
                self.company_name_var.set('')
                self.contact_person_var.set('')
                self.email_var.set('')
                self.phone_var.set('')
                
                # Refresh licenses list
                self.refresh_licenses()
                
                messagebox.showinfo("Success", f"License created successfully!\nSerial Number: {license_serial}")
                
        except Exception as e:
            messagebox.showerror("Error", f"Failed to create license: {str(e)}")
    
    def refresh_licenses(self):
        """Refresh licenses list"""
        app = create_app()
        with app.app_context():
            licenses = LicenseActivation.query.all()
            
            # Clear existing items
            for item in self.licenses_tree.get_children():
                self.licenses_tree.delete(item)
            
            # Add licenses to tree
            for license in licenses:
                company = CompanyRegistration.query.get(license.company_id)
                company_name = company.company_name if company else 'Unknown'
                
                self.licenses_tree.insert('', 'end', values=(
                    license.id,
                    license.serial_number,
                    company_name,
                    license.license_type,
                    license.expiration_date.strftime('%Y-%m-%d'),
                    license.max_users,
                    'Yes' if license.is_active else 'No'
                ))
    
    def extend_license_dialog(self):
        """Show extend license dialog"""
        selected = self.licenses_tree.selection()
        if not selected:
            messagebox.showwarning("Warning", "Please select a license to extend")
            return
        
        item = self.licenses_tree.item(selected[0])
        license_id = item['values'][0]
        
        # Create extend dialog
        dialog = tk.Toplevel(self.root)
        dialog.title("Extend License")
        dialog.geometry("300x150")
        dialog.transient(self.root)
        dialog.grab_set()
        
        ttk.Label(dialog, text="Additional Days:").pack(pady=10)
        days_var = tk.StringVar(value="30")
        days_spinbox = ttk.Spinbox(dialog, from_=1, to=3650, textvariable=days_var)
        days_spinbox.pack(pady=5)
        
        def extend_license():
            try:
                additional_days = int(days_var.get())
                app = create_app()
                with app.app_context():
                    license = LicenseActivation.query.get(license_id)
                    if license:
                        license.expiration_date += timedelta(days=additional_days)
                        db.session.commit()
                        messagebox.showinfo("Success", f"License extended by {additional_days} days")
                        self.refresh_licenses()
                        dialog.destroy()
                    else:
                        messagebox.showerror("Error", "License not found")
            except Exception as e:
                messagebox.showerror("Error", str(e))
        
        ttk.Button(dialog, text="Extend", command=extend_license).pack(pady=10)
    
    def deactivate_license(self):
        """Deactivate selected license"""
        selected = self.licenses_tree.selection()
        if not selected:
            messagebox.showwarning("Warning", "Please select a license to deactivate")
            return
        
        if messagebox.askyesno("Confirm", "Are you sure you want to deactivate this license?"):
            item = self.licenses_tree.item(selected[0])
            license_id = item['values'][0]
            
            try:
                app = create_app()
                with app.app_context():
                    license = LicenseActivation.query.get(license_id)
                    if license:
                        license.is_active = False
                        db.session.commit()
                        messagebox.showinfo("Success", "License deactivated successfully")
                        self.refresh_licenses()
                    else:
                        messagebox.showerror("Error", "License not found")
            except Exception as e:
                messagebox.showerror("Error", f"Failed to deactivate license: {str(e)}")
    
    def copy_serial(self):
        """Copy selected license serial to clipboard"""
        selected = self.licenses_tree.selection()
        if not selected:
            messagebox.showwarning("Warning", "Please select a license")
            return
        
        item = self.licenses_tree.item(selected[0])
        serial_number = item['values'][1]
        
        # Copy to clipboard
        self.root.clipboard_clear()
        self.root.clipboard_append(serial_number)
        messagebox.showinfo("Success", f"Serial number copied to clipboard: {serial_number}")

def main():
    root = tk.Tk()
    app = AdminLicenseManager(root)
    root.mainloop()

if __name__ == '__main__':
    main()
