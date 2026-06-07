# POS User Management Module

A comprehensive user management module for the POS system with role-based access control, settings locking, PIN authentication, and automatic lock screen functionality.

## Features

### User Management
- **Create Users**: Add new users with username, password, role, full name, and email
- **View Users**: List all users with their roles and status
- **Update Users**: Modify user information (username, password, full name, email, status)
- **Delete Users**: Remove users from the system (admin only)
- **Role Management**: Assign and change user roles (Admin, Manager, Cashier)

### Role-Based Access Control
The module enforces three distinct roles with different permission levels:

#### **Admin** - Full System Access
- ✅ Can manage users (create, update, delete)
- ✅ Can manage roles
- ✅ Can access and modify all settings
- ✅ Can view reports
- ✅ Can manage inventory
- ✅ Can process refunds

#### **Manager** - Management Access
- ✅ Can view users (cannot create/delete)
- ✅ Can access and modify limited settings:
  - Inventory management
  - Products
  - Reports
  - Sales
  - Tax settings
  - Receipt settings
  - Printer settings
- ❌ Cannot access: System, Database, License, Users, Security, Backup, Advanced settings
- ✅ Can view reports
- ✅ Can manage inventory
- ✅ Can process refunds

#### **Cashier** - Basic POS Operations
- ❌ Cannot manage users
- ❌ Cannot access settings
- ❌ Cannot view reports
- ❌ Cannot manage inventory
- ❌ Cannot process refunds
- ✅ Basic point-of-sale operations only

### Settings Locking
- **Role-Based Locking**: Automatically locks settings based on user role
- **Configurable**: Can be enabled/disabled via module settings
- **Prevents Unauthorized Access**: Blocks access to sensitive system settings
- **Dynamic**: Settings access is checked in real-time

### PIN Authentication
- **Individual PINs**: Each user has their own unique PIN (stored per user ID)
- **PIN Setup**: Users can set up a 4-8 digit PIN for quick authentication
- **PIN Management**: Change or clear PIN from Profile page
- **Default PIN**: System provides a default PIN (configurable, default: "0000") when user hasn't set up their own
- **Default PIN Usage**: Users can use the default PIN to unlock if they haven't set up a personal PIN yet
- **Secure Storage**: PINs are hashed using bcrypt
- **Session Management**: PIN verification creates timed sessions
- **Session Persistence**: PIN sessions persist across page refreshes (validated on page load)
- **Configurable Timeout**: PIN session timeout (default: 5 minutes, configurable 60-3600 seconds)

### Automatic Lock Screen
- **Inactivity Detection**: Automatically locks screen after configurable inactivity timeout (default: 5 minutes)
- **Configurable Timeout**: Inactivity timeout can be configured in module settings (60-3600 seconds)
- **Manual Lock Button**: Lock button in the top bar allows users to manually lock their session
- **PIN Required**: Requires PIN to unlock when user returns
- **User-Friendly Interface**: Beautiful lock screen with user information
- **Activity Monitoring**: Tracks mouse, keyboard, scroll, and touch events
- **Session Validation**: PIN session is validated on page load/refresh to maintain lock state
- **Module-Provided**: Lock screen component is provided by the module itself

### Frontend Components
The module provides React components that are dynamically loaded:

1. **PinManagement Component**
   - Location: `client/src/components/modules/pos-user-management/PinManagement.js`
   - Usage: Automatically integrated into Profile page
   - Features: Setup, change, and clear PIN

2. **LockScreen Component**
   - Location: `client/src/components/modules/pos-user-management/LockScreen.js`
   - Usage: Automatically shown when session is locked
   - Features: PIN verification, user display, unlock functionality

## Installation

1. **Upload Module**: Upload the `pos-user-management.zip` file via the module management interface
2. **Automatic Installation**: The module will be extracted and registered automatically
3. **Enable Module**: Enable the module in the module settings
4. **Restart Server**: The module will be loaded on server restart
5. **Frontend Integration**: Frontend components are automatically loaded when module is enabled

## Module Structure

```
pos-user-management/
├── package.json          # Module configuration and dependencies
├── index.js              # Main module implementation (backend)
├── README.md             # This documentation
└── frontend/             # Frontend React components
    ├── index.js          # Component exports
    ├── PinManagement.js  # PIN setup/management component
    └── LockScreen.js     # Lock screen component
```

## Documentation

This module includes two documentation files:

- **README.md** (this file) - Comprehensive module documentation including installation, features, usage examples, and troubleshooting
- **API_REFERENCE.md** - Quick reference guide for all API endpoints with examples in JavaScript, cURL, and Postman

For detailed API endpoint documentation with code examples, see [API_REFERENCE.md](./API_REFERENCE.md).

## API Endpoints

### User Management

#### Get All Users
```
GET /api/user-management/users
```
**Permissions**: Admin, Manager  
**Response**: List of all users with their roles and information

#### Get User by ID
```
GET /api/user-management/users/:id
```
**Permissions**: Authenticated users (can view own profile)  
**Response**: User details

#### Create User
```
POST /api/user-management/users
Body: {
  "username": "string",
  "password": "string",
  "role": "admin|manager|cashier",
  "full_name": "string",
  "email": "string"
}
```
**Permissions**: Admin only  
**Response**: Created user object

#### Update User
```
PUT /api/user-management/users/:id
Body: {
  "username": "string",
  "password": "string",
  "full_name": "string",
  "email": "string",
  "is_active": boolean
}
```
**Permissions**: Admin only  
**Response**: Updated user object

#### Delete User
```
DELETE /api/user-management/users/:id
```
**Permissions**: Admin only  
**Response**: Success message

#### Update User Role
```
PUT /api/user-management/users/:id/role
Body: {
  "role": "admin|manager|cashier"
}
```
**Permissions**: Admin only  
**Response**: Updated user object

### PIN Authentication

#### Setup PIN
```
POST /api/user-management/pin/setup
Body: {
  "pin": "1234"
}
```
**Permissions**: Authenticated users  
**Requirements**: PIN must be 4-8 digits, numeric only  
**Response**: Success message

#### Verify PIN
```
POST /api/user-management/pin/verify
Body: {
  "pin": "1234"
}
```
**Permissions**: Authenticated users  
**Response**: Session ID and expiration time

#### Clear PIN
```
POST /api/user-management/pin/clear
```
**Permissions**: Authenticated users  
**Response**: Success message

### Settings Access Control

#### Check Settings Access
```
GET /api/user-management/settings/check-access
```
**Permissions**: Authenticated users  
**Response**: Access permissions and locked settings for current user

#### Get Locked Settings
```
GET /api/user-management/settings/locked
```
**Permissions**: Authenticated users  
**Response**: List of locked settings for current user's role

### Role Permissions

#### Get All Roles
```
GET /api/user-management/roles
```
**Permissions**: Authenticated users  
**Response**: List of all available roles with their permissions

#### Get Role Permissions
```
GET /api/user-management/permissions/:role
```
**Permissions**: Authenticated users  
**Response**: Detailed permissions for specific role

## Module Settings

The module can be configured via the module settings interface:

- **pinLength** (number, default: 4)
  - Length of PIN for authentication
  - Range: 4-8 digits
  - Description: "Length of PIN for authentication"

- **pinTimeout** (number, default: 300)
  - PIN authentication timeout in seconds
  - Range: 60-3600 seconds
  - Description: "PIN authentication timeout in seconds"

- **requirePinForSettings** (boolean, default: true)
  - Require PIN authentication to access settings
  - Description: "Require PIN authentication to access settings"

- **lockSettingsByRole** (boolean, default: true)
  - Lock settings based on user role
  - Description: "Lock settings based on user role"

- **defaultPin** (string, default: "0000")
  - Default PIN to use when user hasn't set up their own PIN
  - Range: 4-8 digits, numeric only
  - Description: "Default PIN to use when user hasn't set up their own PIN"

- **inactivityTimeout** (number, default: 300)
  - Inactivity timeout in seconds before lock screen appears
  - Range: 60-3600 seconds (1 minute to 1 hour)
  - Default: 300 seconds (5 minutes)
  - Description: "Inactivity timeout in seconds before lock screen appears"

## Frontend Integration

### Dynamic Component Loading

The module's frontend components are automatically loaded when the module is enabled:

1. **PinManagement**: Appears in the Profile page
2. **LockScreen**: Automatically shown when session is locked due to inactivity

### Component Availability

- Components are only loaded when the module is **installed** and **enabled**
- If the module is disabled or uninstalled, components are removed from memory
- No hardcoded references - everything is module-driven

## Usage Examples

### Setting Up a PIN

1. Navigate to **Profile** page
2. Scroll to **PIN Authentication** section (if module is enabled)
3. Enter your desired PIN (4-8 digits)
4. Confirm the PIN
5. Click **Set Up PIN**
6. Each user can have their own unique PIN

### Using Lock Screen

1. **Automatic Lock**: The lock screen automatically appears after the configured inactivity timeout (default: 5 minutes, configurable in module settings)
2. **Manual Lock**: Click the lock button (🔒) in the top bar to manually lock your session
3. Enter your PIN to unlock (or use default PIN if you haven't set one up)
4. Session is restored after successful PIN verification
5. Lock state persists across page refreshes

### Configuring Inactivity Timeout

1. Navigate to **Settings** → **Modules**
2. Find **POS User Management** module
3. Click **Settings** button
4. Adjust **Inactivity Timeout** value (60-3600 seconds)
5. Click **Save Settings**
6. Changes take effect immediately (no restart required)

### Managing Users (Admin)

1. Navigate to **Users** page (visible only to admins when module is enabled)
2. Click **Add User** to create a new user
3. Click **Change Role** to update a user's role
4. Click **Delete** to remove a user

### Changing User Roles

1. Go to **Users** page
2. Find the user you want to modify
3. Click **Change Role**
4. Select new role from dropdown
5. Click **Update Role**

## Security Considerations

- **Password Hashing**: Passwords are hashed using SHA-256 (matching POS system standard)
- **PIN Hashing**: PINs are hashed using bcrypt with salt rounds
- **PIN Sessions**: PIN sessions expire after configured timeout
- **Role-Based Access**: Enforced at both API and UI levels
- **Self-Protection**: Users cannot delete or modify their own account/role
- **Session Management**: PIN sessions are tracked and automatically cleaned up

## Database Integration

The module requires access to the POS system's database. The database connection is automatically passed during module initialization.

**Required Database Schema**:
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'cashier',
  full_name TEXT,
  email TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME
);
```

## Module Dependencies

- **bcryptjs** (^2.4.3): For PIN hashing and verification
- **POS Core** (>=1.0.0): Base POS system functionality

## Frontend Dependencies

The module's frontend components use:
- React
- styled-components
- axios
- react-hot-toast

These should already be available in the POS client application.

## Module Lifecycle

1. **Installation**: Module files are copied to `server/modules/installed/pos-user-management/`
2. **Registration**: Module is registered in `server/modules/config.json`
3. **Loading**: Module is loaded on server startup if enabled
4. **Initialization**: Database connection is passed to module
5. **Route Registration**: API routes are automatically registered
6. **Frontend Loading**: Frontend components are dynamically imported when module is enabled

## Uninstallation

When the module is uninstalled:
- Module files are removed from `server/modules/installed/`
- Module configuration is removed from `config.json`
- API routes are no longer available
- Frontend components are removed from memory
- Navigation items disappear
- All module functionality is completely removed

## Troubleshooting

### Module Not Loading
- Check that `bcryptjs` is installed: `npm install bcryptjs` in server directory
- Verify module is enabled in module settings
- Check server logs for error messages

### Routes Returning 404
- Ensure module is loaded (check server startup logs)
- Verify routes are registered (should see "Registering routes for module: pos-user-management")
- Check that route paths don't include `/api` prefix (server adds it automatically)

### Frontend Components Not Appearing
- Verify module is enabled
- Check browser console for import errors
- Ensure components exist in `client/src/components/modules/pos-user-management/`

### PIN Not Working
- Verify PIN is set up (check Profile page)
- Ensure PIN is 4-8 digits, numeric only
- Check that PIN session hasn't expired
- If PIN not set up, use the default PIN (configured in module settings, default: "0000")
- Default PIN will be shown in error message if PIN is not set up

### Lock Screen Not Appearing
- Verify module is enabled
- Check that LockScreen component loaded successfully
- Lock screen appears after 5 minutes of inactivity OR when lock button is clicked
- Lock button appears in top bar when module is enabled
- PIN session is validated on page load - expired sessions will show lock screen

### Lock Screen Disappears on Refresh
- This has been fixed - PIN session is now validated on page load
- If PIN session is expired or invalid, lock screen will appear automatically
- Valid PIN sessions persist across page refreshes

## Version

1.0.0

## Author

POS System

## License

MIT

## Changelog

### Version 1.0.0
- Initial release
- User management (CRUD operations)
- Role-based access control (Admin, Manager, Cashier)
- Settings locking based on roles
- PIN authentication system
- Automatic lock screen on inactivity
- Dynamic frontend component loading
- Module-driven UI integration
