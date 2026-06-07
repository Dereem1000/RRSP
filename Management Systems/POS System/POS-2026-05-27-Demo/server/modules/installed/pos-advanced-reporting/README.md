# POS Advanced Reporting Module

## Overview

The Advanced Reporting Module provides comprehensive reporting and analytics capabilities for the POS system with enhanced filtering options, multiple report types, export functionality, and **full multi-tenant support**.

## Multi-Tenant Support

This module fully supports the POS system's multi-tenant architecture:

- **Complete Data Isolation**: All reports are automatically filtered by tenant, ensuring users only see data from their own company
- **Tenant Context**: Reports respect the user's tenant session context
- **Secure Access**: Tenant middleware ensures proper data separation at the API level
- **Role-Based Filtering**: Works seamlessly with existing role-based access controls

### Features

### 📊 **Advanced Filtering**
- Date range filtering (with role-based restrictions)
- User filtering (admin/manager only)
- Payment method filtering
- Amount range filtering (min/max)
- Product filtering
- Category filtering

### 📈 **Report Types**

#### Sales Reports
- **Advanced Sales Report**: Comprehensive sales data with multiple filter options
- **Sales by Product**: Product performance analysis
- **Sales by User**: User performance metrics (admin/manager only)
- **Sales by Payment Method**: Payment method distribution
- **Sales by Category**: Category performance analysis
- **Hourly Sales**: Hour-by-hour sales patterns
- **Daily Sales**: Daily sales trends
- **Weekly Sales**: Weekly sales summaries
- **Monthly Sales**: Monthly sales summaries

#### Product Analytics
- **Top Selling Products**: Best performing products
- **Low Selling Products**: Underperforming products
- **Product Profitability**: Revenue, cost, and profit analysis
- **Category Performance**: Category-level analytics

#### Comparison Reports
- **Period Comparison**: Compare two time periods side-by-side
- **Year Over Year**: Compare current year with previous year

#### Inventory Reports
- **Inventory Movement**: Track product sales and stock levels
- **Inventory Turnover**: Calculate turnover ratios

### 📤 **Export Capabilities**
- CSV export for all report types
- JSON data export
- Customizable export formats

### 🎯 **Dashboard Statistics**
- Real-time dashboard stats
- Period-over-period comparisons
- Key performance indicators

## Installation

**Note**: This module includes full multi-tenant support and will automatically isolate data by tenant in multi-tenant POS installations.

### Method 1: Via Web Interface

1. Navigate to **Modules** in the POS system
2. Click **Upload Module (ZIP)** 
3. Select the `pos-advanced-reporting.zip` file
4. The module will be installed and can be enabled

### Method 2: Via Path Installation

1. Navigate to **Modules** in the POS system
2. Click **Install from Path**
3. Enter the path to the `pos-advanced-reporting` directory
4. The module will be installed and can be enabled

### Method 3: Manual Installation

1. Copy the `pos-advanced-reporting` directory to `server/modules/installed/`
2. Restart the POS server
3. The module will be automatically detected and can be enabled

## Configuration

### Module Settings

Access module settings from the Modules page:

- **Enable Product Analytics**: Toggle product performance analytics (default: enabled)
- **Enable Customer Analytics**: Toggle customer behavior analytics (default: enabled)
- **Enable Inventory Reports**: Toggle inventory movement reports (default: enabled)
- **Enable Comparison Reports**: Toggle period comparison reports (default: enabled)
- **Default Date Range**: Set default date range for reports (7, 30, 90, 365 days, or custom)
- **Max Export Rows**: Maximum number of rows to export (default: 10,000)
- **Enable Scheduled Reports**: Enable scheduled report generation (default: disabled)

## Usage

### Accessing Advanced Reports

1. Navigate to the **Reports** page in the POS system
2. Look for the **Advanced Reports** tab or section
3. The module will automatically integrate with the existing reports interface

### Using Filters

1. Click **Show Filters** to open the filter panel
2. Set your desired filters:
   - Date range (required)
   - User (admin/manager only)
   - Payment method
   - Amount range
   - Category
3. Click **Apply Filters** to generate the report
4. Click **Reset** to clear all filters

### Report Tabs

- **Overview**: High-level statistics and key metrics
- **Product Analytics**: Product performance and profitability
- **Sales Analysis**: Detailed sales breakdowns and patterns

### Exporting Data

1. Navigate to any report
2. Click the **Export** button on the report card
3. Data will be downloaded as a CSV file
4. File will be named: `{report_type}_{start_date}_to_{end_date}.csv`

## API Endpoints

All endpoints require authentication and are prefixed with `/api/advanced-reporting/`:

### Sales Reports
- `GET /sales/advanced` - Advanced sales report with filters
- `GET /sales/by-product` - Sales grouped by product
- `GET /sales/by-user` - Sales grouped by user (admin/manager only)
- `GET /sales/by-payment-method` - Sales grouped by payment method
- `GET /sales/by-category` - Sales grouped by category
- `GET /sales/hourly` - Hourly sales breakdown
- `GET /sales/daily` - Daily sales summary
- `GET /sales/weekly` - Weekly sales summary
- `GET /sales/monthly` - Monthly sales summary

### Product Analytics
- `GET /products/top-selling` - Top selling products
- `GET /products/low-selling` - Low selling products
- `GET /products/profitability` - Product profitability analysis
- `GET /products/category-performance` - Category performance metrics

### Comparison Reports
- `GET /comparison/period` - Compare two time periods
- `GET /comparison/year-over-year` - Year-over-year comparison

### Inventory Reports
- `GET /inventory/movement` - Inventory movement tracking
- `GET /inventory/turnover` - Inventory turnover ratios

### Export
- `GET /export/csv` - Export data as CSV
- `GET /export/json` - Export data as JSON

### Dashboard
- `GET /dashboard/stats` - Dashboard statistics

## Permissions

The module requires the following permissions:
- `sales:read` - Read sales data
- `products:read` - Read product data
- `users:read` - Read user data (for user-based reports)
- `reports:read` - Access reports
- `reports:write` - Export reports

## Role-Based Access

### Cashier
- Can only view today's reports
- Cannot filter by date (locked to today)
- Cannot view user-based reports
- Cannot view comparison reports

### Manager/Admin
- Full access to all reports
- Can filter by any date range
- Can view user-based reports
- Can view comparison reports
- Can export all data

## Troubleshooting

### Reports Not Loading
1. Check that the module is enabled in the Modules page
2. Verify database connection
3. Check server logs for errors
4. Ensure user has required permissions

### Filters Not Working
1. Verify date range is valid
2. Check that user has permission to filter by user (if applicable)
3. Ensure all filter values are valid

### Export Not Working
1. Check browser download settings
2. Verify data exists for the selected filters
3. Check that export limit hasn't been exceeded

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review server logs
3. Verify module is properly installed and enabled
4. Check user permissions

## Version History

### v1.0.0
- Initial release
- Advanced filtering capabilities
- Multiple report types
- Export functionality
- Dashboard statistics
- Role-based access control

---

**Happy Reporting! 📊**

