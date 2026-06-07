# POS Clock In/Clock Out Module

A comprehensive time tracking module for the POS system that allows users to clock in and out, track their work hours, and manage timesheets. Admins and managers can edit timesheets when the user management module is available.

## Features

### Clock In/Out System
- **Automatic Prompts**: Option to show clock in prompt on login and clock out prompt on logout
- **Manual Clock In/Out**: Users can manually clock in/out from the timesheet page
- **Auto Clock In/Out**: Optional automatic clock in/out without prompts
- **Active Session Tracking**: Tracks active clock in sessions and prevents duplicate entries
- **Notes Support**: Add optional notes when clocking in or out

### Time Sheet Management
- **View Timesheets**: Users can view their own timesheets with date filtering
- **Admin/Manager Access**: Admins and managers can view all users' timesheets
- **Date Range Filtering**: Filter timesheets by date range
- **Hours Calculation**: Automatic calculation of total hours worked
- **Status Indicators**: Visual indicators for active and completed sessions

### Admin/Manager Features
- **Edit Timesheets**: Admins and managers can edit clock in/out times and notes
- **Delete Timesheets**: Admins and managers can delete timesheet entries
- **User Filtering**: View timesheets for specific users
- **Bulk Operations**: Manage multiple timesheet entries efficiently

### Settings
- **Configurable Prompts**: Enable/disable clock in/out prompts
- **Auto Clock In/Out**: Configure automatic clock in/out behavior
- **Validation Rules**: Configure whether clock out is required before new clock in
- **Manual Operations**: Enable/disable manual clock in/out from timesheet page
- **Editing Permissions**: Control timesheet editing permissions

## Installation

1. **Upload Module**: Upload the `pos-clock-in-out.zip` file via the module management interface
2. **Automatic Installation**: The module will be extracted and registered automatically
3. **Enable Module**: Enable the module in the module settings
4. **Restart Server**: The module will be loaded on server restart
5. **Database Migration**: The module automatically creates the `time_tracking` table on first load

## Module Structure

```
pos-clock-in-out/
├── package.json          # Module configuration and dependencies
├── index.js              # Main module implementation (backend)
├── README.md              # This documentation
└── frontend/             # Frontend React components
    ├── index.js          # Component exports
    ├── ClockInOutPrompt.js  # Clock in/out prompt modal
    ├── TimeSheets.js     # Timesheet management component
    └── ClockInOutSettings.js # Settings component
```

## API Endpoints

### Clock In/Out

#### Clock In
```
POST /api/clock-in-out/clock-in
Body: {
  "notes": "string (optional)"
}
```
**Permissions**: Authenticated users  
**Response**: Clock in entry with ID and timestamp

#### Clock Out
```
POST /api/clock-in-out/clock-out
Body: {
  "notes": "string (optional)"
}
```
**Permissions**: Authenticated users  
**Response**: Clock out entry with calculated hours

#### Get Clock Status
```
GET /api/clock-in-out/status
```
**Permissions**: Authenticated users  
**Response**: Current clock status (isClockedIn, active entry)

### Timesheets

#### Get Timesheets
```
GET /api/clock-in-out/timesheets?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&targetUserId=ID
```
**Permissions**: Authenticated users (own timesheets), Admin/Manager (all timesheets)  
**Response**: List of timesheet entries

#### Get Single Timesheet
```
GET /api/clock-in-out/timesheets/:id
```
**Permissions**: Authenticated users (own timesheet), Admin/Manager (any timesheet)  
**Response**: Timesheet entry details

#### Update Timesheet
```
PUT /api/clock-in-out/timesheets/:id
Body: {
  "clock_in_time": "ISO datetime string",
  "clock_out_time": "ISO datetime string",
  "notes": "string"
}
```
**Permissions**: Admin, Manager  
**Response**: Updated timesheet entry

#### Delete Timesheet
```
DELETE /api/clock-in-out/timesheets/:id
```
**Permissions**: Admin, Manager  
**Response**: Success message

#### Get User Timesheets
```
GET /api/clock-in-out/timesheets/user/:userId?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
```
**Permissions**: Authenticated users (own timesheets), Admin/Manager (any user)  
**Response**: List of timesheet entries for specific user

### Settings

#### Get Settings
```
GET /api/clock-in-out/settings
```
**Permissions**: Authenticated users  
**Response**: Current module settings

## Module Settings

The module can be configured via the module settings interface:

- **showClockInPromptOnLogin** (boolean, default: true)
  - Show clock in prompt when user logs in
  - Description: "Show clock in prompt when user logs in"

- **showClockOutPromptOnLogout** (boolean, default: true)
  - Show clock out prompt when user logs out
  - Description: "Show clock out prompt when user logs out"

- **autoClockInOnLogin** (boolean, default: false)
  - Automatically clock in when user logs in (no prompt)
  - Description: "Automatically clock in when user logs in (no prompt)"

- **autoClockOutOnLogout** (boolean, default: false)
  - Automatically clock out when user logs out (no prompt)
  - Description: "Automatically clock out when user logs out (no prompt)"

- **requireClockOutBeforeClockIn** (boolean, default: true)
  - Require clock out before allowing new clock in
  - Description: "Require clock out before allowing new clock in"

- **allowManualClockInOut** (boolean, default: true)
  - Allow users to manually clock in/out from timesheet page
  - Description: "Allow users to manually clock in/out from timesheet page"

- **enableTimesheetEditing** (boolean, default: true)
  - Enable admins and managers to edit timesheets
  - Description: "Enable admins and managers to edit timesheets"

## Frontend Integration

### Dynamic Component Loading

The module's frontend components are automatically loaded when the module is enabled:

1. **ClockInOutPrompt**: Modal prompt for clock in/out (used in login/logout flow)
2. **TimeSheets**: Main timesheet management component
3. **ClockInOutSettings**: Settings display component

### Integration with Login/Logout

The module integrates with the login/logout flow:

- **On Login**: Shows clock in prompt (if enabled) or auto clocks in (if configured)
- **On Logout**: Shows clock out prompt (if enabled) or auto clocks out (if configured)

### Component Usage

Components are only loaded when the module is **installed** and **enabled**. If the module is disabled or uninstalled, components are removed from memory.

## Database Schema

The module creates the following database table:

```sql
CREATE TABLE time_tracking (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  clock_in_time DATETIME NOT NULL,
  clock_out_time DATETIME,
  total_hours REAL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_time_tracking_user_id ON time_tracking(user_id);
CREATE INDEX idx_time_tracking_clock_in ON time_tracking(clock_in_time);
```

## Usage Examples

### Clocking In/Out

1. **On Login**: When a user logs in, they will see a prompt to clock in (if enabled)
2. **On Logout**: When a user logs out, they will see a prompt to clock out (if enabled)
3. **Manual**: Users can go to the Timesheets page and click "Clock In" or "Clock Out" buttons

### Viewing Timesheets

1. Navigate to **Timesheets** page (visible when module is enabled)
2. Use date filters to view specific date ranges
3. View your clock in/out history with calculated hours

### Editing Timesheets (Admin/Manager)

1. Navigate to **Timesheets** page
2. Click the **Edit** button on any timesheet entry
3. Modify clock in/out times or notes
4. Click **Save Changes**

### Configuring Settings

1. Navigate to **Settings** → **Modules**
2. Find **POS Clock In/Out** module
3. Click **Settings** button
4. Adjust settings as needed
5. Click **Save Settings**

## Security Considerations

- **Authentication Required**: All endpoints require user authentication
- **Role-Based Access**: Timesheet editing is restricted to admins and managers
- **User Isolation**: Users can only view their own timesheets unless they are admin/manager
- **Data Validation**: All inputs are validated before processing
- **SQL Injection Protection**: All database queries use parameterized statements

## Integration with User Management Module

If the `pos-user-management` module is installed:

- Admins and managers can edit timesheets for any user
- User information (username, full_name) is displayed in timesheet views
- Role-based permissions are enforced for timesheet operations

## Troubleshooting

### Module Not Loading
- Check that module is enabled in module settings
- Verify database connection is available
- Check server logs for error messages

### Clock In/Out Not Working
- Verify user is authenticated
- Check if user has an active clock in entry (for clock out)
- Ensure database table was created successfully

### Timesheets Not Showing
- Check date range filters
- Verify user has clock in/out entries
- Check database for time_tracking table

### Editing Not Available
- Verify user role is admin or manager
- Check `enableTimesheetEditing` setting
- Ensure user management module is installed (if required)

## Version

1.0.0

## Author

POS System

## License

MIT

## Changelog

### Version 1.0.0
- Initial release
- Clock in/out functionality
- Timesheet management
- Admin/manager editing capabilities
- Integration with login/logout flow
- Configurable settings
- Dynamic frontend component loading

