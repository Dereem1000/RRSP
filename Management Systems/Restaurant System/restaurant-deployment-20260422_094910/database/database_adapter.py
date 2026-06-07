"""
Database Adapter for Restaurant Management System
Handles both local and remote database operations
"""

import requests
import json
from database_manager import db_manager
from datetime import datetime

class DatabaseAdapter:
    """Adapter that handles database operations for both local and remote modes"""
    
    def __init__(self):
        self.db_manager = db_manager
    
    def is_remote_mode(self):
        """Check if system is in remote mode"""
        return self.db_manager.is_remote_mode()
    
    def get_remote_config(self):
        """Get remote configuration"""
        return self.db_manager.get_remote_config()
    
    def make_remote_api_call(self, endpoint, method='GET', data=None):
        """Make API call to remote database server"""
        try:
            config = self.get_remote_config()
            if not config:
                return {'success': False, 'error': 'No remote configuration found'}
            
            server_url = f"http://{config['host']}:{config['port']}"
            license_serial = config.get('licenseSerial') or config.get('license_key', '')
            
            headers = {
                'X-System-ID': 'restaurant_management_system',
                'X-License-Serial': license_serial,
                'Content-Type': 'application/json'
            }
            
            url = f"{server_url}{endpoint}"
            
            if method.upper() == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method.upper() == 'POST':
                response = requests.post(url, headers=headers, json=data, timeout=30)
            elif method.upper() == 'PUT':
                response = requests.put(url, headers=headers, json=data, timeout=30)
            elif method.upper() == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=30)
            else:
                return {'success': False, 'error': f'Unsupported HTTP method: {method}'}
            
            if response.status_code == 200:
                return response.json()
            elif response.status_code == 401:
                return {'success': False, 'error': 'Authentication failed. Please check license serial.'}
            else:
                return {'success': False, 'error': f'API call failed with status {response.status_code}'}
                
        except requests.exceptions.RequestException as e:
            return {'success': False, 'error': f'Network error: {str(e)}'}
        except Exception as e:
            return {'success': False, 'error': f'API call failed: {str(e)}'}
    
    def get_all_orders(self):
        """Get all orders - works for both local and remote"""
        if self.is_remote_mode():
            result = self.make_remote_api_call('/api/orders')
            # Normalize the response format
            if result.get('success') and 'orders' in result:
                result['data'] = result['orders']
            return result
        else:
            # Use local database - need to include table_id for frontend compatibility
            try:
                from database.models import Order, Table, db
                from app import app
                with app.app_context():
                    orders = Order.query.all()
                    orders_data = []
                    for order in orders:
                        order_dict = order.to_dict()
                        # Add table_id for frontend compatibility (Order uses table_number, frontend needs table_id)
                        if order.table:
                            order_dict['table_id'] = order.table.id
                        else:
                            # Fallback: try to find table by table_number
                            table = Table.query.filter_by(number=order.table_number).first()
                            if table:
                                order_dict['table_id'] = table.id
                            else:
                                order_dict['table_id'] = None
                        orders_data.append(order_dict)
                    return {
                        'success': True,
                        'orders': orders_data,
                        'data': orders_data
                    }
            except Exception as e:
                return {'success': False, 'error': str(e)}
    
    def get_all_menu_items(self):
        """Get all menu items - works for both local and remote"""
        if self.is_remote_mode():
            result = self.make_remote_api_call('/api/menu_items')
            # Normalize the response format
            if result.get('success') and 'menu_items' in result:
                result['data'] = result['menu_items']
            return result
        else:
            # Use local database
            try:
                from database.models import MenuItem, db
                from app import app
                with app.app_context():
                    items = MenuItem.query.all()
                    return {
                        'success': True,
                        'menu_items': [item.to_dict() for item in items],
                        'data': [item.to_dict() for item in items]
                    }
            except Exception as e:
                return {'success': False, 'error': str(e)}
    
    def get_all_users(self):
        """Get all users - works for both local and remote"""
        if self.is_remote_mode():
            result = self.make_remote_api_call('/api/users')
            # Normalize the response format
            if result.get('success') and 'users' in result:
                result['data'] = result['users']
            return result
        else:
            # Use local database
            try:
                from database.models import User, db
                from app import app
                with app.app_context():
                    users = User.query.all()
                    # Include password_hash for authentication purposes
                    user_data = []
                    for user in users:
                        user_dict = user.to_dict()
                        user_dict['password_hash'] = user.password_hash
                        user_data.append(user_dict)
                    return {
                        'success': True,
                        'data': user_data
                    }
            except Exception as e:
                return {'success': False, 'error': str(e)}
    
    def create_order(self, order_data):
        """Create a new order - works for both local and remote"""
        if self.is_remote_mode():
            return self.make_remote_api_call('/api/orders', 'POST', order_data)
        else:
            # Use local database
            try:
                from database.models import Order, db
                from app import app
                with app.app_context():
                    order = Order(**order_data)
                    db.session.add(order)
                    db.session.commit()
                    return {'success': True, 'order': order.to_dict()}
            except Exception as e:
                return {'success': False, 'error': str(e)}
    
    def update_order(self, order_id, order_data):
        """Update an order - works for both local and remote"""
        if self.is_remote_mode():
            return self.make_remote_api_call(f'/api/orders/{order_id}', 'PUT', order_data)
        else:
            # Use local database
            try:
                from database.models import Order, db
                from app import app
                with app.app_context():
                    order = Order.query.get(order_id)
                    if order:
                        for key, value in order_data.items():
                            setattr(order, key, value)
                        db.session.commit()
                        return {'success': True, 'order': order.to_dict()}
                    else:
                        return {'success': False, 'error': 'Order not found'}
            except Exception as e:
                return {'success': False, 'error': str(e)}
    
    def delete_order(self, order_id):
        """Delete an order - works for both local and remote"""
        if self.is_remote_mode():
            return self.make_remote_api_call(f'/api/orders/{order_id}', 'DELETE')
        else:
            # Use local database
            try:
                from database.models import Order, db
                from app import app
                with app.app_context():
                    order = Order.query.get(order_id)
                    if order:
                        db.session.delete(order)
                        db.session.commit()
                        return {'success': True, 'message': 'Order deleted successfully'}
                    else:
                        return {'success': False, 'error': 'Order not found'}
            except Exception as e:
                return {'success': False, 'error': str(e)}
    
    def get_all_categories(self):
        """Get all categories - works for both local and remote"""
        if self.is_remote_mode():
            result = self.make_remote_api_call('/api/categories')
            # Normalize the response format
            if result.get('success') and 'categories' in result:
                result['data'] = result['categories']
            return result
        else:
            try:
                from database.models import Category, db
                from app import app
                with app.app_context():
                    categories = Category.query.all()
                    return {
                        'success': True,
                        'categories': [category.to_dict() for category in categories],
                        'data': [category.to_dict() for category in categories]
                    }
            except Exception as e:
                return {'success': False, 'error': str(e)}
    
    def get_all_tables(self):
        """Get all tables - works for both local and remote"""
        if self.is_remote_mode():
            result = self.make_remote_api_call('/api/tables')
            # Normalize the response format
            if result.get('success') and 'tables' in result:
                result['data'] = result['tables']
            return result
        else:
            try:
                from database.models import Table, db
                from app import app
                with app.app_context():
                    tables = Table.query.all()
                    return {
                        'success': True,
                        'tables': [table.to_dict() for table in tables],
                        'data': [table.to_dict() for table in tables]
                    }
            except Exception as e:
                return {'success': False, 'error': str(e)}
    
    def get_all_payments(self):
        """Get all payments - works for both local and remote"""
        if self.is_remote_mode():
            result = self.make_remote_api_call('/api/payments')
            # Normalize the response format
            if result.get('success') and 'payments' in result:
                result['data'] = result['payments']
            return result
        else:
            try:
                from database.models import Payment, db
                from app import app
                with app.app_context():
                    payments = Payment.query.all()
                    return {
                        'success': True,
                        'payments': [payment.to_dict() for payment in payments],
                        'data': [payment.to_dict() for payment in payments]
                    }
            except Exception as e:
                return {'success': False, 'error': str(e)}
    
    def get_all_order_items(self):
        """Get all order items - works for both local and remote"""
        if self.is_remote_mode():
            result = self.make_remote_api_call('/api/order_items')
            # Normalize the response format
            if result.get('success') and 'order_items' in result:
                result['data'] = result['order_items']
            return result
        else:
            try:
                from database.models import OrderItem, db
                from app import app
                with app.app_context():
                    order_items = OrderItem.query.all()
                    return {
                        'success': True,
                        'order_items': [item.to_dict() for item in order_items],
                        'data': [item.to_dict() for item in order_items]
                    }
            except Exception as e:
                return {'success': False, 'error': str(e)}
    
    def get_system_settings(self, setting_key):
        """Get system setting by key - always uses local database for configuration"""
        # System settings are always stored locally, even in remote mode
        # This prevents circular dependency issues with database configuration
        try:
            from database.models import SystemSettings
            from app import app
            with app.app_context():
                setting = SystemSettings.query.filter_by(setting_key=setting_key).first()
                if setting:
                    return {
                        'success': True,
                        'data': {
                            'key': setting.setting_key,
                            'value': setting.setting_value
                        }
                    }
                else:
                    return {'success': False, 'error': 'Setting not found'}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def get_waiter_assignments(self):
        """Get all waiter assignments - works for both local and remote"""
        if self.is_remote_mode():
            return self.make_remote_api_call('/api/waiter_assignments')
        else:
            try:
                from database.models import WaiterAssignment, Table, User
                from app import app
                with app.app_context():
                    from database.models import db
                    assignments = db.session.query(
                        WaiterAssignment.table_id,
                        WaiterAssignment.waiter_id,
                        Table.number.label('table_number'),
                        User.username.label('waiter_name')
                    ).join(Table, WaiterAssignment.table_id == Table.id)\
                     .join(User, WaiterAssignment.waiter_id == User.id)\
                     .filter(WaiterAssignment.is_active == True)\
                     .all()
                    
                    return {
                        'success': True,
                        'data': [{
                            'table_id': a.table_id,
                            'table_number': a.table_number,
                            'waiter_id': a.waiter_id,
                            'waiter_name': a.waiter_name
                        } for a in assignments]
                    }
            except Exception as e:
                return {'success': False, 'error': str(e)}
    
    def get_my_assigned_tables(self, waiter_id):
        """Get tables assigned to a specific waiter - works for both local and remote"""
        if self.is_remote_mode():
            return self.make_remote_api_call(f'/api/waiter_assignments/{waiter_id}/tables')
        else:
            try:
                from database.models import Table, WaiterAssignment
                from app import app
                with app.app_context():
                    from database.models import db
                    assigned_tables = db.session.query(Table).join(WaiterAssignment).filter(
                        WaiterAssignment.waiter_id == waiter_id,
                        WaiterAssignment.is_active == True
                    ).all()
                    
                    return {
                        'success': True,
                        'data': [{
                            'id': t.id,
                            'number': t.number,
                            'capacity': t.capacity,
                            'is_occupied': t.is_occupied,
                            'qr_code_path': t.qr_code_path
                        } for t in assigned_tables]
                    }
            except Exception as e:
                return {'success': False, 'error': str(e)}
    
    def get_waiters(self):
        """Get all waiters - works for both local and remote"""
        if self.is_remote_mode():
            return self.make_remote_api_call('/api/waiters')
        else:
            try:
                from database.models import User
                from app import app
                with app.app_context():
                    waiters = User.query.filter_by(role='waiter').all()
                    return {
                        'success': True,
                        'data': [{
                            'id': w.id,
                            'username': w.username,
                            'name': w.username.title()
                        } for w in waiters]
                    }
            except Exception as e:
                return {'success': False, 'error': str(e)}
    
    def assign_waiter(self, table_id, waiter_id):
        """Assign a waiter to a table - works for both local and remote"""
        if self.is_remote_mode():
            return self.make_remote_api_call('/api/assign_waiter', 'POST', {
                'table_id': table_id,
                'waiter_id': waiter_id
            })
        else:
            try:
                from database.models import WaiterAssignment
                from app import app
                with app.app_context():
                    from database.models import db
                    # Deactivate existing assignment for this table
                    existing = WaiterAssignment.query.filter_by(table_id=table_id, is_active=True).first()
                    if existing:
                        existing.is_active = False
                    
                    # Create new assignment
                    assignment = WaiterAssignment(
                        table_id=table_id,
                        waiter_id=waiter_id
                    )
                    db.session.add(assignment)
                    db.session.commit()
                    
                    return {'success': True, 'message': 'Waiter assigned successfully'}
            except Exception as e:
                return {'success': False, 'error': str(e)}
    
    def remove_waiter_assignment(self, table_id):
        """Remove waiter assignment from a table - works for both local and remote"""
        if self.is_remote_mode():
            return self.make_remote_api_call('/api/remove_waiter_assignment', 'POST', {
                'table_id': table_id
            })
        else:
            try:
                from database.models import WaiterAssignment
                from app import app
                with app.app_context():
                    from database.models import db
                    assignment = WaiterAssignment.query.filter_by(table_id=table_id, is_active=True).first()
                    if assignment:
                        assignment.is_active = False
                        db.session.commit()
                        return {'success': True, 'message': 'Assignment removed successfully'}
                    else:
                        return {'success': False, 'error': 'Assignment not found'}
            except Exception as e:
                return {'success': False, 'error': str(e)}
    
    def claim_table(self, table_id, waiter_id):
        """Claim a table for a waiter - works for both local and remote"""
        if self.is_remote_mode():
            return self.make_remote_api_call('/api/claim_table', 'POST', {
                'table_id': table_id,
                'waiter_id': waiter_id
            })
        else:
            try:
                from database.models import WaiterAssignment
                from app import app
                with app.app_context():
                    from database.models import db
                    # Check if table is still unassigned
                    existing = WaiterAssignment.query.filter_by(table_id=table_id, is_active=True).first()
                    if existing:
                        return {'success': False, 'error': 'Table already assigned'}
                    
                    # Create new assignment
                    assignment = WaiterAssignment(
                        table_id=table_id,
                        waiter_id=waiter_id,
                        is_active=True
                    )
                    db.session.add(assignment)
                    db.session.commit()
                    
                    return {'success': True, 'message': 'Table claimed successfully'}
            except Exception as e:
                return {'success': False, 'error': str(e)}
    
    def get_waiter_assignments(self):
        """Get all waiter assignments - works for both local and remote"""
        if self.is_remote_mode():
            result = self.make_remote_api_call('/api/waiter_assignments')
            # Normalize the response format
            if result.get('success') and 'data' in result:
                result['data'] = result['data']
            return result
        else:
            try:
                from database.models import WaiterAssignment, db
                from app import app
                with app.app_context():
                    assignments = WaiterAssignment.query.all()
                    return {
                        'success': True,
                        'data': [{
                            'id': a.id,
                            'table_id': a.table_id,
                            'waiter_id': a.waiter_id,
                            'is_active': a.is_active,
                            'assigned_at': a.assigned_at.isoformat() if a.assigned_at else None
                        } for a in assignments]
                    }
            except Exception as e:
                return {'success': False, 'error': str(e)}
    
    def get_my_assigned_tables(self, waiter_id):
        """Get tables assigned to a specific waiter - works for both local and remote"""
        if self.is_remote_mode():
            result = self.make_remote_api_call(f'/api/waiter_assignments/{waiter_id}/tables')
            # Normalize the response format
            if result.get('success') and 'data' in result:
                result['data'] = result['data']
            return result
        else:
            try:
                from database.models import WaiterAssignment, Table, db
                from app import app
                with app.app_context():
                    assignments = WaiterAssignment.query.filter_by(waiter_id=waiter_id, is_active=True).all()
                    tables = []
                    for assignment in assignments:
                        table = Table.query.get(assignment.table_id)
                        if table:
                            tables.append({
                                'id': table.id,
                                'number': table.number,
                                'capacity': table.capacity,
                                'is_occupied': table.is_occupied,
                                'location': getattr(table, 'location', None),
                                'assigned_at': assignment.assigned_at.isoformat() if assignment.assigned_at else None
                            })
                    return {
                        'success': True,
                        'data': tables
                    }
            except Exception as e:
                return {'success': False, 'error': str(e)}
    
    def get_all_inventory_items(self):
        """Get all inventory items - works for both local and remote"""
        if self.is_remote_mode():
            result = self.make_remote_api_call('/api/inventory')
            # Normalize the response format
            if result.get('success') and 'inventory' in result:
                result['data'] = result['inventory']
            return result
        else:
            try:
                from database.models import InventoryItem, db
                from app import app
                with app.app_context():
                    items = InventoryItem.query.all()
                    return {
                        'success': True,
                        'data': [{
                            'id': item.id,
                            'name': item.name,
                            'category': item.category,
                            'current_stock': item.current_stock,
                            'min_stock': item.min_stock,
                            'unit': item.unit,
                            'cost': item.cost,
                            'supplier': item.supplier,
                            'description': item.description,
                            'created_at': item.created_at.isoformat() if item.created_at else None,
                            'updated_at': item.updated_at.isoformat() if item.updated_at else None
                        } for item in items]
                    }
            except Exception as e:
                return {'success': False, 'error': str(e)}
    
    def create_inventory_item(self, item_data):
        """Create a new inventory item - works for both local and remote"""
        if self.is_remote_mode():
            return self.make_remote_api_call('/api/inventory', 'POST', item_data)
        else:
            try:
                from database.models import InventoryItem, db
                from app import app
                with app.app_context():
                    # Soft de-duplication: same name+unit considered the same item
                    existing = InventoryItem.query.filter(
                        InventoryItem.name == item_data['name'],
                        InventoryItem.unit == item_data.get('unit', 'pieces')
                    ).first()
                    if existing:
                        # Optionally update fields; do not change current_stock here
                        existing.category = item_data.get('category', existing.category)
                        existing.min_stock = item_data.get('min_stock', existing.min_stock)
                        existing.cost = item_data.get('cost', existing.cost)
                        existing.supplier = item_data.get('supplier', existing.supplier)
                        existing.description = item_data.get('description', existing.description)
                        db.session.commit()
                        return {'success': True, 'data': {'id': existing.id}, 'message': 'exists'}

                    item = InventoryItem(
                        name=item_data['name'],
                        category=item_data['category'],
                        current_stock=item_data.get('current_stock', 0),
                        min_stock=item_data.get('min_stock', 0),
                        unit=item_data.get('unit', 'pieces'),
                        cost=item_data.get('cost', 0.0),
                        supplier=item_data.get('supplier', ''),
                        description=item_data.get('description', '')
                    )
                    db.session.add(item)
                    db.session.commit()
                    return {'success': True, 'data': {'id': item.id}}
            except Exception as e:
                return {'success': False, 'error': str(e)}
    
    def update_inventory_item(self, item_id, item_data):
        """Update an inventory item - works for both local and remote"""
        if self.is_remote_mode():
            return self.make_remote_api_call(f'/api/inventory/{item_id}', 'PUT', item_data)
        else:
            try:
                from database.models import InventoryItem, db
                from app import app
                with app.app_context():
                    item = InventoryItem.query.get(item_id)
                    if not item:
                        return {'success': False, 'error': 'Item not found'}
                    
                    item.name = item_data.get('name', item.name)
                    item.category = item_data.get('category', item.category)
                    item.current_stock = item_data.get('current_stock', item.current_stock)
                    item.min_stock = item_data.get('min_stock', item.min_stock)
                    item.unit = item_data.get('unit', item.unit)
                    item.cost = item_data.get('cost', item.cost)
                    item.supplier = item_data.get('supplier', item.supplier)
                    item.description = item_data.get('description', item.description)
                    item.updated_at = datetime.utcnow()
                    
                    db.session.commit()
                    return {'success': True}
            except Exception as e:
                return {'success': False, 'error': str(e)}
    
    def delete_inventory_item(self, item_id):
        """Delete an inventory item - works for both local and remote"""
        if self.is_remote_mode():
            return self.make_remote_api_call(f'/api/inventory/{item_id}', 'DELETE')
        else:
            try:
                from database.models import InventoryItem, db
                from app import app
                with app.app_context():
                    item = InventoryItem.query.get(item_id)
                    if not item:
                        return {'success': False, 'error': 'Item not found'}
                    
                    db.session.delete(item)
                    db.session.commit()
                    return {'success': True}
            except Exception as e:
                    return {'success': False, 'error': str(e)}

    # --- Inventory basic logs (receive, waste, count) ---
    def receive_inventory(self, item_id, quantity, unit_cost=0, supplier=None, notes=''):
        if self.is_remote_mode():
            return self.make_remote_api_call('/api/inventory/receive', 'POST', {
                'item_id': item_id,
                'quantity': quantity,
                'unit_cost': unit_cost,
                'supplier': supplier,
                'notes': notes
            })
        else:
            try:
                from database.models import InventoryItem, InventoryReceiving, db
                from app import app
                with app.app_context():
                    # Ensure new tables exist
                    db.create_all()
                    item = InventoryItem.query.get(item_id)
                    if not item:
                        return {'success': False, 'error': 'Item not found'}
                    recv = InventoryReceiving(
                        item_id=item_id,
                        quantity=quantity,
                        unit_cost=unit_cost,
                        supplier=supplier,
                        notes=notes
                    )
                    item.current_stock = (item.current_stock or 0) + float(quantity)
                    db.session.add(recv)
                    db.session.commit()
                    return {'success': True}
            except Exception as e:
                return {'success': False, 'error': str(e)}

    def record_inventory_waste(self, item_id, quantity, reason='waste', user_id=None, notes=''):
        if self.is_remote_mode():
            return self.make_remote_api_call('/api/inventory/waste', 'POST', {
                'item_id': item_id,
                'quantity': quantity,
                'reason': reason,
                'notes': notes,
                'recorded_by': user_id
            })
        else:
            try:
                from database.models import InventoryItem, InventoryWaste, db
                from app import app
                with app.app_context():
                    # Ensure new tables exist
                    db.create_all()
                    item = InventoryItem.query.get(item_id)
                    if not item:
                        return {'success': False, 'error': 'Item not found'}
                    waste = InventoryWaste(
                        item_id=item_id,
                        quantity=quantity,
                        reason=reason,
                        recorded_by=user_id,
                        notes=notes
                    )
                    item.current_stock = max(0, (item.current_stock or 0) - float(quantity))
                    db.session.add(waste)
                    db.session.commit()
                    return {'success': True}
            except Exception as e:
                return {'success': False, 'error': str(e)}

    def record_inventory_count(self, item_id, counted_quantity, user_id=None, notes=''):
        if self.is_remote_mode():
            return self.make_remote_api_call('/api/inventory/count', 'POST', {
                'item_id': item_id,
                'counted_quantity': counted_quantity,
                'notes': notes,
                'counted_by': user_id
            })
        else:
            try:
                from database.models import InventoryItem, InventoryCount, db
                from app import app
                with app.app_context():
                    # Ensure new tables exist
                    db.create_all()
                    item = InventoryItem.query.get(item_id)
                    if not item:
                        return {'success': False, 'error': 'Item not found'}
                    previous_quantity = item.current_stock or 0
                    count_entry = InventoryCount(
                        item_id=item_id,
                        counted_quantity=counted_quantity,
                        previous_quantity=previous_quantity,
                        counted_by=user_id,
                        notes=notes
                    )
                    item.current_stock = float(counted_quantity)
                    db.session.add(count_entry)
                    db.session.commit()
                    return {'success': True}
            except Exception as e:
                return {'success': False, 'error': str(e)}

    def list_receivings(self, limit=200):
        if self.is_remote_mode():
            return self.make_remote_api_call('/api/inventory/receivings')
        else:
            try:
                from database.models import InventoryReceiving, db
                from app import app
                with app.app_context():
                    # Ensure new tables exist
                    db.create_all()
                    rows = InventoryReceiving.query.order_by(InventoryReceiving.received_at.desc()).limit(limit).all()
                    return {'success': True, 'data': [
                        {
                            'id': r.id,
                            'item_id': r.item_id,
                            'item_name': r.item.name if r.item else None,
                            'quantity': r.quantity,
                            'unit_cost': r.unit_cost,
                            'supplier': r.supplier,
                            'received_at': r.received_at.isoformat(),
                            'notes': r.notes
                        } for r in rows
                    ]}
            except Exception as e:
                return {'success': False, 'error': str(e)}

    def list_wastes(self, limit=200):
        if self.is_remote_mode():
            return self.make_remote_api_call('/api/inventory/wastes')
        else:
            try:
                from database.models import InventoryWaste, db
                from app import app
                with app.app_context():
                    # Ensure new tables exist
                    db.create_all()
                    rows = InventoryWaste.query.order_by(InventoryWaste.recorded_at.desc()).limit(limit).all()
                    return {'success': True, 'data': [
                        {
                            'id': w.id,
                            'item_id': w.item_id,
                            'item_name': w.item.name if w.item else None,
                            'quantity': w.quantity,
                            'reason': w.reason,
                            'recorded_by': w.recorded_by,
                            'recorded_at': w.recorded_at.isoformat(),
                            'notes': w.notes
                        } for w in rows
                    ]}
            except Exception as e:
                return {'success': False, 'error': str(e)}

    def list_counts(self, limit=200):
        if self.is_remote_mode():
            return self.make_remote_api_call('/api/inventory/counts')
        else:
            try:
                from database.models import InventoryCount, db
                from app import app
                with app.app_context():
                    # Ensure new tables exist
                    db.create_all()
                    rows = InventoryCount.query.order_by(InventoryCount.counted_at.desc()).limit(limit).all()
                    return {'success': True, 'data': [
                        {
                            'id': c.id,
                            'item_id': c.item_id,
                            'item_name': c.item.name if c.item else None,
                            'counted_quantity': c.counted_quantity,
                            'previous_quantity': c.previous_quantity,
                            'counted_by': c.counted_by,
                            'counted_at': c.counted_at.isoformat(),
                            'notes': c.notes
                        } for c in rows
                    ]}
            except Exception as e:
                return {'success': False, 'error': str(e)}
    
    def get_company_registrations(self):
        """Get all company registrations - works for both local and remote"""
        if self.is_remote_mode():
            result = self.make_remote_api_call('/api/company_registration')
            # Normalize the response format
            if result.get('success') and 'data' in result:
                result['data'] = result['data']
            return result
        else:
            try:
                from database.models import CompanyRegistration, db
                from app import app
                with app.app_context():
                    companies = CompanyRegistration.query.all()
                    return {
                        'success': True,
                        'data': [{
                            'id': company.id,
                            'company_name': company.company_name,
                            'contact_person': company.contact_person,
                            'email': company.email,
                            'phone': company.phone,
                            'address': company.address,
                            'business_type': company.business_type,
                            'serial_number': company.serial_number,
                            'msp_client_id': company.msp_client_id,
                            'registration_date': company.registration_date.isoformat() if company.registration_date else None,
                            'registration_success_shown': company.registration_success_shown
                        } for company in companies]
                    }
            except Exception as e:
                return {'success': False, 'error': str(e)}

# Global instance
db_adapter = DatabaseAdapter()
