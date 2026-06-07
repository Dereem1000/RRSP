from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from flask_sqlalchemy import SQLAlchemy

# Create db instance that will be initialized by the main app
db = SQLAlchemy()

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(120), nullable=False)
    role = db.Column(db.String(20), nullable=False)  # admin, chef, waiter, cashier
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120))
    phone = db.Column(db.String(20))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'role': self.role,
            'name': self.name,
            'email': self.email,
            'phone': self.phone,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'is_active': self.is_active
        }

class Category(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False)
    description = db.Column(db.Text)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class MenuItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    price = db.Column(db.Float, nullable=False)
    category_id = db.Column(db.Integer, db.ForeignKey('category.id'), nullable=False)
    is_available = db.Column(db.Boolean, default=True)
    preparation_time = db.Column(db.Integer)  # in minutes
    image_url = db.Column(db.String(200))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    category = db.relationship('Category', backref='menu_items')
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'price': self.price,
            'category_id': self.category_id,
            'is_available': self.is_available,
            'preparation_time': self.preparation_time,
            'image_url': self.image_url,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class Table(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    number = db.Column(db.Integer, unique=True, nullable=False)
    capacity = db.Column(db.Integer, nullable=False)
    location = db.Column(db.String(100))  # Optional location field (e.g., Window, Patio, Private Room)
    is_occupied = db.Column(db.Boolean, default=False)
    qr_code_path = db.Column(db.String(200))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'number': self.number,
            'capacity': self.capacity,
            'location': self.location,
            'is_occupied': self.is_occupied,
            'qr_code_path': self.qr_code_path,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class Order(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    table_number = db.Column(db.Integer, db.ForeignKey('table.number'), nullable=False)
    waiter_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    customer_name = db.Column(db.String(100))
    customer_phone = db.Column(db.String(20))
    status = db.Column(db.String(20), default='pending')  # pending, preparing, ready, served, cancelled
    total_amount = db.Column(db.Float, default=0.0)
    tax_amount = db.Column(db.Float, default=0.0)
    tip_amount = db.Column(db.Float, default=0.0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = db.Column(db.DateTime)
    notes = db.Column(db.Text)
    
    table = db.relationship('Table', backref='orders')
    items = db.relationship('OrderItem', backref='order', lazy=True, cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'table_number': self.table_number,
            'waiter_id': self.waiter_id,
            'customer_name': self.customer_name,
            'customer_phone': self.customer_phone,
            'status': self.status,
            'total_amount': self.total_amount,
            'tax_amount': self.tax_amount,
            'tip_amount': self.tip_amount,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'notes': self.notes
        }

class OrderItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey('order.id'), nullable=False)
    menu_item_id = db.Column(db.Integer, db.ForeignKey('menu_item.id'), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    price = db.Column(db.Float, nullable=False)  # Changed from unit_price to price
    status = db.Column(db.String(20), default='pending')  # pending, preparing, ready, served
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    special_instructions = db.Column(db.Text)  # Changed from notes to special_instructions
    
    menu_item = db.relationship('MenuItem', backref='order_items')
    
    def to_dict(self):
        return {
            'id': self.id,
            'order_id': self.order_id,
            'menu_item_id': self.menu_item_id,
            'quantity': self.quantity,
            'price': self.price,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'special_instructions': self.special_instructions
        }

class Payment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey('order.id'), nullable=True)  # Can be null for manual payments
    amount = db.Column(db.Float, nullable=False)
    payment_method = db.Column(db.String(20), nullable=False)  # cash, card, mobile, check, gift_card
    transaction_id = db.Column(db.String(100))
    status = db.Column(db.String(20), default='pending')  # pending, completed, failed
    notes = db.Column(db.Text)  # For manual payment notes
    customer_name = db.Column(db.String(100))  # For manual payment customer name
    is_manual = db.Column(db.Boolean, default=False)  # Flag for manual payments
    processed_by = db.Column(db.String(150))  # Username of cashier who processed
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    order = db.relationship('Order', backref='payments')
    
    def to_dict(self):
        return {
            'id': self.id,
            'order_id': self.order_id,
            'amount': self.amount,
            'payment_method': self.payment_method,
            'transaction_id': self.transaction_id,
            'status': self.status,
            'notes': self.notes,
            'customer_name': self.customer_name,
            'is_manual': self.is_manual,
            'processed_by': self.processed_by,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class RefundRequest(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    payment_id = db.Column(db.Integer, db.ForeignKey('payment.id'), nullable=False)
    order_id = db.Column(db.Integer, db.ForeignKey('order.id'), nullable=True)
    amount = db.Column(db.Float, nullable=False)
    requested_by = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)  # User who requested refund
    reason = db.Column(db.Text)  # Optional reason for refund
    status = db.Column(db.String(20), default='pending')  # pending, approved, rejected, processed
    approved_by = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)  # Admin/Manager who approved
    approved_at = db.Column(db.DateTime, nullable=True)
    rejection_reason = db.Column(db.Text, nullable=True)  # Reason if rejected
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    processed_at = db.Column(db.DateTime, nullable=True)
    
    payment = db.relationship('Payment', backref='refund_requests')
    order = db.relationship('Order', backref='refund_requests')
    requester = db.relationship('User', foreign_keys=[requested_by], backref='refund_requests_made')
    approver = db.relationship('User', foreign_keys=[approved_by], backref='refund_requests_approved')
    
    def to_dict(self):
        return {
            'id': self.id,
            'payment_id': self.payment_id,
            'order_id': self.order_id,
            'amount': self.amount,
            'requested_by': self.requested_by,
            'reason': self.reason,
            'status': self.status,
            'approved_by': self.approved_by,
            'approved_at': self.approved_at.isoformat() if self.approved_at else None,
            'rejection_reason': self.rejection_reason,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'processed_at': self.processed_at.isoformat() if self.processed_at else None
        }

class Customer(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    phone = db.Column(db.String(20))
    email = db.Column(db.String(120))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class WaiterAssignment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    table_id = db.Column(db.Integer, db.ForeignKey('table.id'), nullable=False)
    waiter_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    assigned_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)
    
    table = db.relationship('Table', backref='waiter_assignments')
    waiter = db.relationship('User', backref='table_assignments')

# New Inventory Management Models
class InventoryItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    category = db.Column(db.String(50), nullable=False)  # ingredients, supplies, equipment, packaging
    current_stock = db.Column(db.Float, nullable=False, default=0)
    min_stock = db.Column(db.Float, nullable=False, default=0)
    unit = db.Column(db.String(20), nullable=False)  # kg, g, l, ml, pcs, boxes, bottles
    cost = db.Column(db.Float, nullable=False, default=0)
    supplier = db.Column(db.String(100))
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class PurchaseOrder(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    supplier = db.Column(db.String(100), nullable=False)
    expected_delivery = db.Column(db.Date, nullable=False)
    notes = db.Column(db.Text)
    status = db.Column(db.String(20), default='pending')  # pending, ordered, delivered, cancelled
    total_amount = db.Column(db.Float, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    items = db.relationship('PurchaseOrderItem', backref='purchase_order', lazy=True, cascade='all, delete-orphan')

class PurchaseOrderItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    purchase_order_id = db.Column(db.Integer, db.ForeignKey('purchase_order.id'), nullable=False)
    item_name = db.Column(db.String(100), nullable=False)
    quantity = db.Column(db.Float, nullable=False)
    cost = db.Column(db.Float, nullable=False)
    received_quantity = db.Column(db.Float, default=0)
    notes = db.Column(db.Text)

class InventoryReceiving(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    item_id = db.Column(db.Integer, db.ForeignKey('inventory_item.id'), nullable=False)
    quantity = db.Column(db.Float, nullable=False)
    unit_cost = db.Column(db.Float, nullable=False, default=0)
    supplier = db.Column(db.String(100))
    received_at = db.Column(db.DateTime, default=datetime.utcnow)
    notes = db.Column(db.Text)

    item = db.relationship('InventoryItem', backref='receivings')

class InventoryWaste(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    item_id = db.Column(db.Integer, db.ForeignKey('inventory_item.id'), nullable=False)
    quantity = db.Column(db.Float, nullable=False)
    reason = db.Column(db.String(100), nullable=False)  # spoilage, over-prep, spill, comp
    recorded_by = db.Column(db.Integer, db.ForeignKey('user.id'))
    recorded_at = db.Column(db.DateTime, default=datetime.utcnow)
    notes = db.Column(db.Text)

    item = db.relationship('InventoryItem', backref='wastes')
    user = db.relationship('User')

class InventoryCount(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    item_id = db.Column(db.Integer, db.ForeignKey('inventory_item.id'), nullable=False)
    counted_quantity = db.Column(db.Float, nullable=False)
    previous_quantity = db.Column(db.Float, nullable=False)
    counted_by = db.Column(db.Integer, db.ForeignKey('user.id'))
    counted_at = db.Column(db.DateTime, default=datetime.utcnow)
    notes = db.Column(db.Text)

    item = db.relationship('InventoryItem', backref='counts')
    user = db.relationship('User')

class SystemSettings(db.Model):
    __tablename__ = 'system_settings'
    
    id = db.Column(db.Integer, primary_key=True)
    setting_key = db.Column(db.String(100), unique=True, nullable=False)
    setting_value = db.Column(db.String(500), nullable=False)
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class DatabaseConfig(db.Model):
    __tablename__ = 'database_config'
    
    id = db.Column(db.Integer, primary_key=True)
    config_name = db.Column(db.String(100), nullable=False)
    db_type = db.Column(db.String(20), nullable=False)  # local, remote
    host = db.Column(db.String(200))
    port = db.Column(db.Integer)
    username = db.Column(db.String(100))
    password = db.Column(db.String(200))  # Encrypted
    database_name = db.Column(db.String(100))
    connection_string = db.Column(db.String(500))
    is_active = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class CompanyRegistration(db.Model):
    __tablename__ = 'company_registration'
    
    id = db.Column(db.Integer, primary_key=True)
    company_name = db.Column(db.String(200), nullable=False)
    contact_person = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(20))
    address = db.Column(db.Text)
    business_type = db.Column(db.String(50))  # restaurant, cafe, bar, etc.
    serial_number = db.Column(db.String(50), unique=True, nullable=False)
    msp_client_id = db.Column(db.String(50), unique=True)  # Link to MSP system client ID
    registration_date = db.Column(db.DateTime, default=datetime.utcnow)
    is_verified = db.Column(db.Boolean, default=False)
    registration_success_shown = db.Column(db.Boolean, default=False)  # Track if success message was shown
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class LicenseActivation(db.Model):
    __tablename__ = 'license_activation'
    
    id = db.Column(db.Integer, primary_key=True)
    serial_number = db.Column(db.String(50), unique=True, nullable=False)
    company_id = db.Column(db.Integer, db.ForeignKey('company_registration.id'), nullable=False)
    license_type = db.Column(db.String(50), nullable=False)  # basic, premium, enterprise
    activation_date = db.Column(db.DateTime, nullable=False)
    expiration_date = db.Column(db.DateTime, nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    max_users = db.Column(db.Integer, default=5)
    features = db.Column(db.Text)  # JSON string of enabled features
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    company = db.relationship('CompanyRegistration', backref='licenses')


# ── Meal Combo / Bundle Feature ──────────────────────────────────────────────

class MealCombo(db.Model):
    """A named meal bundle (e.g. 'Chicken Meal Deal') with a fixed price."""
    __tablename__ = 'meal_combo'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text)
    combo_price = db.Column(db.Float, nullable=False)   # fixed price for the whole combo
    image_url = db.Column(db.String(200))
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    items = db.relationship('MealComboItem', backref='combo',
                            lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'combo_price': self.combo_price,
            'image_url': self.image_url,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'items': [i.to_dict() for i in self.items]
        }


class MealComboItem(db.Model):
    """Links a MealCombo to a MenuItem (with quantity and optional label like 'Main', 'Side 1')."""
    __tablename__ = 'meal_combo_item'

    id = db.Column(db.Integer, primary_key=True)
    combo_id = db.Column(db.Integer, db.ForeignKey('meal_combo.id'), nullable=False)
    menu_item_id = db.Column(db.Integer, db.ForeignKey('menu_item.id'), nullable=False)
    quantity = db.Column(db.Integer, default=1, nullable=False)
    role_label = db.Column(db.String(50))   # e.g. 'Main', 'Side 1', 'Side 2', 'Drink'

    menu_item = db.relationship('MenuItem')

    def to_dict(self):
        item = self.menu_item
        return {
            'id': self.id,
            'menu_item_id': self.menu_item_id,
            'menu_item_name': item.name if item else '',
            'menu_item_price': item.price if item else 0,
            'menu_item_image_url': item.image_url if item else '',
            'quantity': self.quantity,
            'role_label': self.role_label or ''
        }

