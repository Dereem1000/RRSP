# Standalone License Activation System

A comprehensive license activation and validation system that can be used independently for any application requiring license management.

## 🚀 Features

### Core Functionality
- **Company Registration**: Register businesses with contact information
- **License Activation**: Create licenses with custom duration and user limits
- **License Types**: Basic, Premium, Enterprise tiers
- **Internet Validation**: Online license validation with fallback to offline
- **GUI Interface**: Easy-to-use graphical interface
- **Database Management**: SQLite database with full CRUD operations

### License Validation Methods
1. **Online Validation**: Real-time validation against license server
2. **Offline Validation**: Cached validation with grace period
3. **Manual Validation**: Admin override capabilities

### License Types
- **Basic**: Local database, up to 5 users, basic features
- **Premium**: Remote database, up to 25 users, advanced features
- **Enterprise**: All features, unlimited users, multi-location support

## 📦 Installation

### Prerequisites
- Python 3.7+
- pip package manager

### Setup
```bash
# Navigate to the license activation system directory
cd license_activation_system_new

# Install required packages
pip install -r requirements.txt

# Initialize the database
python init_db.py

# Run the GUI application
python license_activation_gui.py
```

## 🖥️ Usage

### GUI Interface
The application provides a tabbed interface with:

1. **Companies Tab**: Manage registered companies
2. **Licenses Tab**: View and manage active licenses
3. **Activate License Tab**: Create new licenses
4. **License Validation Tab**: Test license validation
5. **System Management Tab**: System overview and configuration

### License Validation

#### Online Validation
- Validates against remote license server
- Requires internet connection
- Provides real-time license status
- Automatic fallback to offline validation

#### Offline Validation
- Uses cached license data
- 30-day grace period after last online check
- Works without internet connection
- Suitable for temporary network issues

#### Manual Validation
- Admin override capabilities
- Bypasses expiration checks
- Useful for testing and emergency situations

## 🔧 Configuration

### License Server Setup
1. Configure validation server URL in the GUI
2. Set up your license validation server
3. Implement the validation API endpoints

### Database Configuration
- Uses SQLite database (`license_system.db`)
- Automatically creates tables on first run
- No additional configuration required

### Environment Variables
```bash
# Required for AutoM.System (and other signed clients): HMAC on valid /api/license/validate responses
export LICENSE_RESPONSE_SECRET="same-secret-as-autom-env-local"

# Optional: Set custom secret keys
export LICENSE_SECRET_KEY="your-secret-key"
export LICENSE_ENCRYPTION_KEY="your-encryption-key"
```

Valid license API responses include `license_signature` (HMAC-SHA256). Clients without this secret cannot accept forgeries from a fake license server.

## 🌐 Internet Validation

### How It Works
1. **License Request**: Application sends license validation request
2. **Server Validation**: License server validates the request
3. **Response**: Server returns validation result
4. **Caching**: Valid licenses are cached for offline use

### Validation Server API
The system expects a license validation server with the following endpoint:

```
POST /api/validate
Content-Type: application/json
Authorization: Bearer <token>

{
  "serial_number": "REST-ABC12345",
  "company_id": 1,
  "license_type": "premium",
  "expiration_date": "2024-12-31T23:59:59Z",
  "system_info": {},
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Response Format
```json
{
  "valid": true,
  "license_type": "premium",
  "expiration_date": "2024-12-31T23:59:59Z",
  "max_users": 25,
  "features": {
    "inventory_management": true,
    "advanced_reporting": true,
    "api_access": true
  }
}
```

## 📊 Database Schema

### Tables
- `company_registration`: Company information
- `license_activation`: License details and expiration
- `license_validation_log`: Validation attempt logs
- `system_configuration`: System settings

### Key Fields
- **Serial Numbers**: Unique identifiers for licenses
- **Expiration Dates**: Time-based license expiration
- **User Limits**: Maximum number of concurrent users
- **Features**: JSON-encoded feature flags

## 🔒 Security Features

### License Security
- Unique serial numbers
- Time-based expiration
- User limit enforcement
- Feature-based access control

### Validation Security
- JWT tokens for API authentication
- Encrypted communication
- Request logging and monitoring
- Grace period for offline validation

## 🛠️ Development

### Adding New Features
1. Extend the `LicenseActivation` model
2. Update the GUI interface
3. Modify validation logic
4. Test with different license types

### Custom License Types
```python
# Add custom license type
license = LicenseActivation(
    license_type='custom',
    max_users=100,
    features=json.dumps({
        'custom_feature': True,
        'advanced_analytics': True
    })
)
```

### Integration with Applications
```python
from license_validator import LicenseValidator

validator = LicenseValidator()
result = validator.validate_license_online('REST-ABC12345')

if result['valid']:
    # License is valid, proceed with application
    features = result['features']
    max_users = result['max_users']
else:
    # License is invalid, show error
    error_message = result['error']
```

## 📝 API Reference

### LicenseValidator Class
- `validate_license_online(serial_number)`: Online validation
- `validate_license_offline(serial_number)`: Offline validation
- `validate_license_manual(serial_number)`: Manual validation
- `get_license_status(serial_number)`: Get comprehensive status
- `setup_validation_server(url, secret_key)`: Configure server

### Database Models
- `CompanyRegistration`: Company information
- `LicenseActivation`: License details
- `LicenseValidationLog`: Validation logs
- `SystemConfiguration`: System settings

## 🚀 Deployment

### Standalone Deployment
1. Copy the entire `license_activation_system_new` folder
2. Install dependencies: `pip install -r requirements.txt`
3. Initialize database: `python init_db.py`
4. Run: `python license_activation_gui.py`

### Integration with Applications
1. Import the license validation modules
2. Configure validation server URL
3. Implement license checking in your application
4. Handle validation responses appropriately

## 📞 Support

### Troubleshooting
- Check internet connection for online validation
- Verify license server configuration
- Review validation logs for errors
- Test with offline validation as fallback

### Common Issues
- **Network Errors**: Use offline validation as fallback
- **Expired Licenses**: Extend or create new licenses
- **Invalid Serial Numbers**: Check company registration
- **Server Errors**: Verify license server configuration

## 🔄 Updates and Maintenance

### Regular Tasks
- Monitor license expiration dates
- Check validation server status
- Review validation logs
- Update license configurations

### Backup and Recovery
- Backup the SQLite database regularly
- Export license data for migration
- Test restoration procedures
- Maintain license server backups

---

**Note**: This system is designed for standalone use and can be easily integrated into any application requiring license management. The internet validation provides real-time license checking while offline validation ensures continued operation during network issues.
