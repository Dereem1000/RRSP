# User Role Management Guide

The User Management Module provides API endpoints to manage user roles. Here are several ways to update user roles:

## Available Roles

- **admin** - Full system access with all permissions
- **manager** - Management access with limited administrative permissions  
- **cashier** - Basic access for point-of-sale operations

## Method 1: Using API Endpoint (Browser/Postman)

### Endpoint
```
PUT /api/user-management/users/:id/role
```

### Headers
```
Content-Type: application/json
Cookie: connect.sid=your-session-cookie
```

### Request Body
```json
{
  "role": "admin"
}
```

### Example using cURL
```bash
curl -X PUT http://localhost:5000/api/user-management/users/2/role \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=your-session-cookie" \
  -d '{"role": "manager"}'
```

### Example using Postman
1. Set method to `PUT`
2. URL: `http://localhost:5000/api/user-management/users/2/role`
3. Headers: Add `Content-Type: application/json` and your session cookie
4. Body: Select "raw" and "JSON", then enter:
   ```json
   {
     "role": "manager"
   }
   ```

## Method 2: Using JavaScript/Fetch (Frontend)

```javascript
// Update user role
async function updateUserRole(userId, newRole) {
  try {
    const response = await fetch(`/api/user-management/users/${userId}/role`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Include session cookie
      body: JSON.stringify({ role: newRole })
    });

    const data = await response.json();
    
    if (data.success) {
      console.log('Role updated:', data.user);
      return data;
    } else {
      console.error('Error:', data.error);
      return null;
    }
  } catch (error) {
    console.error('Request failed:', error);
    return null;
  }
}

// Usage
updateUserRole(2, 'manager');
```

## Method 3: Using the Helper Script

A helper script is available at: `server/modules/update-user-role.js`

### Usage
```bash
node server/modules/update-user-role.js <userId> <role>
```

### Examples
```bash
# Change user ID 2 to admin
node server/modules/update-user-role.js 2 admin

# Change user ID 3 to manager
node server/modules/update-user-role.js 3 manager

# Change user ID 4 to cashier
node server/modules/update-user-role.js 4 cashier
```

## Method 4: Direct Database Update (Not Recommended)

If you need to update directly in the database:

```sql
UPDATE users SET role = 'manager' WHERE id = 2;
```

**Warning**: This bypasses the module's validation and security checks.

## Get List of Users

To see all users and their current roles:

### API Endpoint
```
GET /api/user-management/users
```

### Example
```javascript
fetch('/api/user-management/users', {
  credentials: 'include'
})
.then(res => res.json())
.then(data => {
  console.log('Users:', data.users);
  // Each user has: id, username, role, full_name, email, is_active
});
```

## Get Available Roles

To see all available roles and their permissions:

### API Endpoint
```
GET /api/user-management/roles
```

### Example Response
```json
{
  "success": true,
  "roles": [
    {
      "name": "admin",
      "displayName": "Administrator",
      "description": "Full system access with all permissions",
      "permissions": { ... }
    },
    {
      "name": "manager",
      "displayName": "Manager",
      "description": "Management access with limited administrative permissions",
      "permissions": { ... }
    },
    {
      "name": "cashier",
      "displayName": "Cashier",
      "description": "Basic access for point-of-sale operations",
      "permissions": { ... }
    }
  ]
}
```

## Permissions Required

- **Admin role required** to update user roles
- You cannot change your own role (security measure)
- Must be authenticated (logged in)

## Error Handling

Common errors:

- `401 Unauthorized` - Not logged in
- `403 Forbidden` - Not an admin user
- `400 Bad Request` - Invalid role or trying to change your own role
- `404 Not Found` - User not found
- `500 Internal Server Error` - Database or server error

## Quick Test

1. **Get all users:**
   ```bash
   curl http://localhost:5000/api/user-management/users \
     -H "Cookie: connect.sid=your-session-cookie"
   ```

2. **Update a user's role:**
   ```bash
   curl -X PUT http://localhost:5000/api/user-management/users/2/role \
     -H "Content-Type: application/json" \
     -H "Cookie: connect.sid=your-session-cookie" \
     -d '{"role": "manager"}'
   ```

3. **Verify the change:**
   ```bash
   curl http://localhost:5000/api/user-management/users/2 \
     -H "Cookie: connect.sid=your-session-cookie"
   ```

---

## PIN Authentication Endpoints

### Setup PIN

```
POST /api/user-management/pin/setup
```

**Permissions**: Authenticated users  
**Request Body**:
```json
{
  "pin": "1234"
}
```

**Response**:
```json
{
  "success": true,
  "message": "PIN set up successfully"
}
```

**Note**: Each user has their own unique PIN. PINs are stored per user ID.

---

### Verify PIN

```
POST /api/user-management/pin/verify
```

**Permissions**: Authenticated users  
**Request Body**:
```json
{
  "pin": "1234"
}
```

**Response** (when PIN is set up):
```json
{
  "success": true,
  "sessionId": "pin_session_abc123",
  "expiresAt": "2024-01-01T12:05:00.000Z",
  "expiresIn": 300
}
```

**Response** (when using default PIN):
```json
{
  "success": true,
  "sessionId": "pin_session_abc123",
  "expiresAt": "2024-01-01T12:05:00.000Z",
  "expiresIn": 300,
  "isDefaultPin": true,
  "message": "Default PIN accepted. Please set up your own PIN in Profile settings."
}
```

**Error Response** (when PIN not set up):
```json
{
  "success": false,
  "error": "PIN not set up for this user",
  "defaultPin": "0000",
  "message": "PIN not set up for this user. Use default PIN: 0000"
}
```

**Note**: If user hasn't set up a PIN, they can use the default PIN (configurable in module settings, default: "0000"). The error response includes the default PIN value.

---

### Clear PIN

```
POST /api/user-management/pin/clear
```

**Permissions**: Authenticated users  
**Response**:
```json
{
  "success": true,
  "message": "PIN cleared successfully"
}
```

---

### Check PIN Session

```
GET /api/user-management/pin/session/check?sessionId=<session_id>
```

**Permissions**: Authenticated users  
**Query Parameters**:
- `sessionId` (optional): PIN session ID to check

**Response** (valid session):
```json
{
  "success": true,
  "valid": true,
  "hasPin": true,
  "message": "PIN session is valid"
}
```

**Response** (invalid/expired session):
```json
{
  "success": false,
  "valid": false,
  "hasPin": true,
  "message": "PIN session expired or invalid"
}
```

**Response** (no PIN set up):
```json
{
  "success": true,
  "valid": false,
  "hasPin": false,
  "message": "No PIN session required"
}
```

**Note**: This endpoint is used to validate PIN sessions on page load. If user has a PIN set up and no valid session, the lock screen should be shown.

---

## New Features

### Individual PINs
- Each user has their own unique PIN (stored per user ID)
- PINs are independent - users cannot see or access each other's PINs

### Default PIN Support
- System provides a default PIN when user hasn't set up their own
- Default PIN is configurable in module settings (default: "0000")
- Users are prompted to set up their own PIN when using default PIN

### Manual Lock Button
- Lock button (🔒) appears in the top bar when module is enabled
- Allows users to manually lock their session
- Clicking the button immediately shows the lock screen

### Session Persistence
- PIN sessions persist across page refreshes
- Sessions are validated on page load
- Expired sessions automatically trigger lock screen

