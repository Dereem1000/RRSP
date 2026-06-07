# MSP Client Integration with License Activation System

This document explains how the MSP (Managed Service Provider) client management system integrates with the license activation system to automatically manage licenses based on client service levels and features.

## Overview

The integration allows the license activation system to:
- **Filter MSP clients** that have activation features selected (POS, Restaurant, Document, E-commerce, Auto, Distribution)
- Automatically sync only relevant MSP clients with service levels
- Map MSP service levels to appropriate license types
- Manage license features based on MSP client service plans
- Update licenses when MSP client service levels change
- Track license usage and compliance

## Activation Features Filtering

The system only shows and processes MSP clients that have at least one of the following activation features selected:
- **POS System** - Point of sale management
- **Restaurant Management** - Restaurant operations
- **Document Management** - Document handling systems
- **E-commerce** - Online commerce features
- **Auto System** - Automotive business management
- **Distribution System** - Distribution and logistics management

Clients without any of these activation features are automatically filtered out and will not appear in the license activation system.

## MSP Service Levels

The system supports the following MSP service levels:

### Basic Tier
- **License Type**: Basic
- **Max Users**: 5
- **Features**: 
  - Inventory management: Yes
  - Advanced reporting: No
  - API access: No
  - Multi-location: No
  - Onsite visits: 4/month
  - Support tickets: 20/month
  - Endpoints: 0
  - Support hours: 0

### Standard Tier
- **License Type**: Premium
- **Max Users**: 10
- **Features**:
  - Inventory management: Yes
  - Advanced reporting: Yes
  - API access: Yes
  - Multi-location: No
  - Onsite visits: 8/month
  - Support tickets: 50/month
  - Endpoints: 5
  - Support hours: 0

### Premium Tier
- **License Type**: Premium
- **Max Users**: 25
- **Features**:
  - Inventory management: Yes
  - Advanced reporting: Yes
  - API access: Yes
  - Multi-location: No
  - Onsite visits: 12/month
  - Support tickets: 100/month
  - Endpoints: 10
  - Support hours: 12/month

### Enterprise Tier
- **License Type**: Enterprise
- **Max Users**: 100
- **Features**:
  - Inventory management: Yes
  - Advanced reporting: Yes
  - API access: Yes
  - Multi-location: Yes
  - Onsite visits: 20/month
  - Support tickets: 200/month
  - Endpoints: 20
  - Support hours: 24/month

### Per-Job Tier
- **License Type**: Basic
- **Max Users**: 3
- **Features**:
  - Inventory management: Yes
  - Advanced reporting: No
  - API access: No
  - Multi-location: No
  - Onsite visits: 0
  - Support tickets: 0
  - Endpoints: 0
  - Support hours: 0

## Integration Components

### 1. MSP Integration Module (`msp_integration.py`)

The main integration module that handles:
- Fetching MSP clients from the MSP system API
- Mapping service levels to license types
- Syncing client data to the license system
- Updating licenses when service levels change
- Managing license features based on service plans

#### Key Methods:

- `get_msp_clients()`: Fetch all MSP clients from the API
- `sync_msp_client_to_license_system()`: Sync individual client
- `sync_all_msp_clients()`: Sync all MSP clients
- `update_msp_client_license()`: Update license when service level changes
- `get_license_status_for_msp_client()`: Get license status for MSP client

### 2. GUI Integration Tab

The license activation GUI includes a new "MSP Integration" tab that provides:
- MSP system configuration (API URL, authentication)
- List of MSP clients with their service levels
- License status for each client
- Sync functionality to update licenses
- Service level mapping information

### 3. Database Integration

The system uses the existing database models with enhanced support for:
- MSP client identification
- Service level tracking
- Feature mapping
- License synchronization

## Usage Instructions

### 1. Configuration

1. Open the License Activation GUI
2. Navigate to the "MSP Integration" tab
3. Configure the MSP API URL (default: `http://localhost:3000/api/msp`)
4. Enter API token if required
5. Test the connection

### 2. Syncing Clients

1. Click "Load MSP Clients" to fetch clients from the MSP system
2. Review the list of clients and their service levels
3. Click "Sync All Clients" to create/update licenses for all MSP clients
4. Review sync results

### 3. Managing Individual Clients

1. Select a client from the list
2. Use "View License Status" to see detailed license information
3. Use "Update License" to change service level and update license accordingly

### 4. Monitoring

- The system tracks license status for each MSP client
- Features are automatically updated based on service level
- License expiration dates are managed based on service tier
- Usage tracking is integrated with MSP service limits

## API Integration

### MSP API Endpoints

The integration expects the following MSP API endpoints:

#### GET /api/msp/clients
Returns list of MSP clients with service levels.

**Response Format:**
```json
{
  "success": true,
  "clients": [
    {
      "id": "client-uuid",
      "name": "Client Name",
      "companyName": "Company Name",
      "email": "client@company.com",
      "serviceLevel": "premium",
      "status": "active",
      "features": {...}
    }
  ]
}
```

#### GET /api/msp/clients/{id}
Returns specific MSP client details.

### Authentication

The integration supports Bearer token authentication:
```
Authorization: Bearer <token>
```

## Service Level Mapping

| MSP Service Level | License Type | Max Users | Key Features |
|------------------|--------------|-----------|--------------|
| basic | Basic | 5 | Basic inventory, 4 visits, 20 tickets |
| standard | Premium | 10 | Advanced reporting, API access, 8 visits |
| premium | Premium | 25 | All features, 12 visits, 10 endpoints |
| enterprise | Enterprise | 100 | Multi-location, 20 visits, 20 endpoints |
| per-job | Basic | 3 | Basic features, pay-per-service |

## Features Mapping

Each service level includes specific features:

### Core Features
- **inventory_management**: Always enabled
- **advanced_reporting**: Standard, Premium, Enterprise
- **api_access**: Standard, Premium, Enterprise
- **multi_location**: Enterprise only

### Service Features
- **onsite_visits**: Number of free onsite visits per month
- **support_tickets**: Number of support tickets per month
- **endpoints**: Number of managed endpoints
- **support_hours**: Number of support hours per month

## Error Handling

The integration includes comprehensive error handling:
- Connection failures to MSP API
- Invalid service levels
- License creation failures
- Database synchronization errors
- Authentication issues

## Troubleshooting

### Common Issues

1. **Connection Failed**
   - Check MSP API URL
   - Verify API token
   - Ensure MSP system is running

2. **Sync Errors**
   - Check client data format
   - Verify service level values
   - Review database permissions

3. **License Update Failures**
   - Check license exists
   - Verify service level mapping
   - Review database constraints

### Logs and Debugging

- Check console output for error messages
- Review sync results for detailed error information
- Use "Test Connection" to verify MSP API connectivity

## Security Considerations

- API tokens are stored in memory only
- Database connections use SQLite (local)
- No sensitive data is logged
- Authentication is handled via Bearer tokens

## Future Enhancements

Potential improvements:
- Real-time synchronization
- Webhook integration
- Advanced reporting
- Bulk operations
- Custom service level mapping
- Integration with other systems

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review error messages in the GUI
3. Verify MSP system connectivity
4. Check database integrity

The integration provides a seamless way to manage licenses for MSP clients based on their service levels and features, ensuring proper license allocation and feature access control.
