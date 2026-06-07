from database.models import db, User, Category, MenuItem, Table, Order, OrderItem, Payment, Customer, WaiterAssignment, InventoryItem, PurchaseOrder, PurchaseOrderItem, SystemSettings
from datetime import datetime, date
import os

def init_database(app):
    with app.app_context():
        # Create all tables (schema only — no demo data seeded).
        # Admin user and restaurant settings are created by the
        # license registration flow (/register).
        db.create_all()
        print("✅ Database schema ready.")
        return
        
        # Create users with correct demo credentials
        admin = User(username='admin', name='Administrator', role='admin', email='admin@restaurant.com')
        admin.set_password('admin123')
        
        chef = User(username='chef1', name='Head Chef', role='chef', email='chef@restaurant.com')
        chef.set_password('chef123')
        
        waiter = User(username='waiter1', name='Server Staff', role='waiter', email='waiter@restaurant.com')
        waiter.set_password('waiter123')
        
        cashier = User(username='cashier1', name='Cashier', role='cashier', email='cashier@restaurant.com')
        cashier.set_password('cashier123')
        
        db.session.add_all([admin, chef, waiter, cashier])
        
        # Create categories
        appetizers = Category(name='Appetizers', description='Start your meal right')
        main_courses = Category(name='Main Courses', description='Delicious main dishes')
        desserts = Category(name='Desserts', description='Sweet endings')
        beverages = Category(name='Beverages', description='Refreshing drinks')
        
        db.session.add_all([appetizers, main_courses, desserts, beverages])
        db.session.commit()
        
        # Create menu items
        menu_items = [
            MenuItem(name='Bruschetta', description='Toasted bread with tomatoes and herbs', price=8.99, category_id=appetizers.id, preparation_time=10, 
                    image_url='https://images.unsplash.com/photo-1572695157366-5e585ab2b69f?w=400&h=300&fit=crop'),
            MenuItem(name='Caesar Salad', description='Fresh romaine lettuce with Caesar dressing', price=12.99, category_id=appetizers.id, preparation_time=8,
                    image_url='https://images.unsplash.com/photo-1546793665-c74683f339c1?w=400&h=300&fit=crop'),
            MenuItem(name='Grilled Salmon', description='Fresh salmon with seasonal vegetables', price=24.99, category_id=main_courses.id, preparation_time=20,
                    image_url='https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=400&h=300&fit=crop'),
            MenuItem(name='Beef Tenderloin', description='Premium beef with mashed potatoes', price=29.99, category_id=main_courses.id, preparation_time=25,
                    image_url='https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400&h=300&fit=crop'),
            MenuItem(name='Chocolate Cake', description='Rich chocolate cake with berries', price=9.99, category_id=desserts.id, preparation_time=5,
                    image_url='https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400&h=300&fit=crop'),
            MenuItem(name='Iced Tea', description='Fresh brewed iced tea', price=3.99, category_id=beverages.id, preparation_time=2,
                    image_url='https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400&h=300&fit=crop'),
        ]
        
        db.session.add_all(menu_items)
        
        # Create tables
        tables = []
        for i in range(1, 11):
            table = Table(number=i, capacity=4 if i <= 6 else 6, is_occupied=False)
            tables.append(table)
        
        db.session.add_all(tables)
        
        # Create sample inventory items
        inventory_items = [
            InventoryItem(name='Fresh Tomatoes', category='ingredients', current_stock=25.0, min_stock=10.0, unit='kg', cost=2.50, supplier='Local Farm Market', description='Ripe tomatoes for salads and cooking'),
            InventoryItem(name='Romaine Lettuce', category='ingredients', current_stock=15.0, min_stock=8.0, unit='kg', cost=3.20, supplier='Green Valley Farms', description='Fresh romaine lettuce heads'),
            InventoryItem(name='Salmon Fillets', category='ingredients', current_stock=12.0, min_stock=5.0, unit='kg', cost=18.50, supplier='Ocean Fresh Seafood', description='Fresh Atlantic salmon fillets'),
            InventoryItem(name='Beef Tenderloin', category='ingredients', current_stock=8.0, min_stock=3.0, unit='kg', cost=32.00, supplier='Premium Meats Co', description='Premium grade beef tenderloin'),
            InventoryItem(name='Chocolate Chips', category='ingredients', current_stock=5.0, min_stock=2.0, unit='kg', cost=8.75, supplier='Sweet Supplies Inc', description='Dark chocolate chips for baking'),
            InventoryItem(name='Paper Napkins', category='supplies', current_stock=200.0, min_stock=50.0, unit='pcs', cost=0.15, supplier='Restaurant Supply Co', description='Quality paper napkins'),
            InventoryItem(name='Plastic Forks', category='supplies', current_stock=150.0, min_stock=75.0, unit='pcs', cost=0.08, supplier='Restaurant Supply Co', description='Disposable plastic forks'),
            InventoryItem(name='Cooking Oil', category='ingredients', current_stock=20.0, min_stock=8.0, unit='l', cost=4.50, supplier='Kitchen Essentials', description='Vegetable cooking oil'),
            InventoryItem(name='Salt', category='ingredients', current_stock=10.0, min_stock=3.0, unit='kg', cost=1.20, supplier='Kitchen Essentials', description='Fine sea salt'),
            InventoryItem(name='Black Pepper', category='ingredients', current_stock=2.0, min_stock=1.0, unit='kg', cost=15.00, supplier='Spice World', description='Freshly ground black pepper'),
        ]
        
        db.session.add_all(inventory_items)
        
        # Create sample purchase orders
        po1 = PurchaseOrder(
            supplier='Local Farm Market',
            expected_delivery=date.today(),
            notes='Weekly vegetable delivery',
            status='ordered',
            total_amount=125.50
        )
        
        po2 = PurchaseOrder(
            supplier='Restaurant Supply Co',
            expected_delivery=date.today(),
            notes='Monthly supplies restock',
            status='pending',
            total_amount=89.75
        )
        
        db.session.add_all([po1, po2])
        db.session.commit()
        
        # Create purchase order items
        po_items = [
            PurchaseOrderItem(purchase_order_id=po1.id, item_name='Fresh Tomatoes', quantity=20.0, cost=2.50),
            PurchaseOrderItem(purchase_order_id=po1.id, item_name='Romaine Lettuce', quantity=12.0, cost=3.20),
            PurchaseOrderItem(purchase_order_id=po2.id, item_name='Paper Napkins', quantity=300.0, cost=0.15),
            PurchaseOrderItem(purchase_order_id=po2.id, item_name='Plastic Forks', quantity=200.0, cost=0.08),
        ]
        
        db.session.add_all(po_items)
        
        # Create sample orders with status 'ready' for cashier to see
        order1 = Order(table_number=1, customer_name='John Doe', customer_phone='555-0101', status='ready', total_amount=45.97)
        order2 = Order(table_number=2, customer_name='Jane Smith', customer_phone='555-0102', status='ready', total_amount=38.98)
        
        # Create unassigned orders for table claiming demo
        order3 = Order(table_number=3, customer_name='Mike Johnson', customer_phone='555-0103', status='pending', total_amount=32.50)
        order4 = Order(table_number=4, customer_name='Sarah Wilson', customer_phone='555-0104', status='ready', total_amount=28.75)
        
        db.session.add_all([order1, order2, order3, order4])
        db.session.commit()
        
        # Create order items
        order_items = [
            OrderItem(order_id=order1.id, menu_item_id=1, quantity=2, price=8.99, status='ready'),
            OrderItem(order_id=order1.id, menu_item_id=3, quantity=1, price=24.99, status='ready'),
            OrderItem(order_id=order1.id, menu_item_id=5, quantity=1, price=9.99, status='ready'),
            OrderItem(order_id=order2.id, menu_item_id=2, quantity=1, price=12.99, status='ready'),
            OrderItem(order_id=order2.id, menu_item_id=4, quantity=1, price=29.99, status='ready'),
            # Unassigned orders items
            OrderItem(order_id=order3.id, menu_item_id=1, quantity=1, price=8.99, status='pending'),
            OrderItem(order_id=order3.id, menu_item_id=2, quantity=1, price=12.99, status='pending'),
            OrderItem(order_id=order4.id, menu_item_id=3, quantity=1, price=24.99, status='ready'),
        ]
        
        db.session.add_all(order_items)
        
        # Create waiter assignments
        assignment1 = WaiterAssignment(table_id=1, waiter_id=waiter.id)
        assignment2 = WaiterAssignment(table_id=2, waiter_id=waiter.id)
        
        db.session.add_all([assignment1, assignment2])
        
        # Create default system settings
        settings = [
            SystemSettings(
                setting_key='allow_table_claiming',
                setting_value='true',
                description='Allow waiters to claim unassigned tables with orders'
            ),
            SystemSettings(
                setting_key='allow_cashier_assignments',
                setting_value='true',
                description='Allow cashiers to assign tables to waiters'
            ),
            SystemSettings(
                setting_key='public_url',
                setting_value='',
                description='Public URL for QR codes (e.g., https://yourrestaurant.com)'
            )
        ]
        
        db.session.add_all(settings)
        
        db.session.commit()
        print("Database initialized successfully!")

def generate_qr_codes(app):
    """Generate QR codes for each table"""
    with app.app_context():
        import qrcode
        from PIL import Image
        
        # Create qr_codes directory if it doesn't exist
        qr_dir = os.path.join(app.static_folder, 'qr_codes')
        if not os.path.exists(qr_dir):
            os.makedirs(qr_dir)
        
        tables = Table.query.all()
        
        for table in tables:
            # Generate QR code for customer menu
            qr = qrcode.QRCode(version=1, box_size=10, border=5)
            # Use a relative URL that will work in production
            qr.add_data(f"/customer_menu/{table.id}")
            qr.make(fit=True)
            
            # Create QR code image
            qr_image = qr.make_image(fill_color="black", back_color="white")
            
            # Save QR code image
            qr_path = os.path.join(qr_dir, f'table_{table.number}_qr.png')
            qr_image.save(qr_path)
            
            # Update table with QR code path
            table.qr_code_path = f'static/qr_codes/table_{table.number}_qr.png'
        
        db.session.commit()
        print("QR codes generated successfully!")
