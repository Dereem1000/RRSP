import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { 
  FiBarChart2, FiTrendingUp, FiDollarSign, FiCalendar, FiDownload, 
  FiFilter, FiX, FiPrinter, FiPackage, FiUsers, FiCreditCard, 
  FiGrid, FiClock, FiTrendingDown, FiDollarSign as FiDollar, FiRefreshCw
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import axios from 'axios';
import { formatCurrency, getCurrentCurrency } from '../../../utils/currency';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend 
} from 'recharts';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f5f7fa;
`;

const Header = styled.div`
  background: white;
  padding: 24px;
  border-bottom: 2px solid #e9ecef;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
`;

const Title = styled.h2`
  margin: 0;
  color: #333;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 24px;
`;

const FilterPanel = styled.div`
  background: white;
  padding: 20px;
  border-radius: 12px;
  margin: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  display: ${props => props.open ? 'block' : 'none'};
`;

const FilterRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
`;

const FilterGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Label = styled.label`
  font-size: 14px;
  font-weight: 600;
  color: #495057;
`;

const Input = styled.input`
  padding: 10px 12px;
  border: 2px solid #dee2e6;
  border-radius: 8px;
  font-size: 14px;
  transition: border-color 0.2s;
  
  &:focus {
    outline: none;
    border-color: #667eea;
  }
`;

const Select = styled.select`
  padding: 10px 12px;
  border: 2px solid #dee2e6;
  border-radius: 8px;
  font-size: 14px;
  background: white;
  cursor: pointer;
  transition: border-color 0.2s;
  
  &:focus {
    outline: none;
    border-color: #667eea;
  }
`;

const Button = styled.button`
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
  
  &.primary {
    background: #667eea;
    color: white;
    
    &:hover {
      background: #5a6fd8;
    }
  }
  
  &.secondary {
    background: #6c757d;
    color: white;
    
    &:hover {
      background: #5a6268;
    }
  }
  
  &.success {
    background: #28a745;
    color: white;
    
    &:hover {
      background: #218838;
    }
  }
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
`;

const Content = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 20px;
`;

const ReportTabs = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  overflow-x: auto;
  background: white;
  padding: 12px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
`;

const Tab = styled.button`
  padding: 12px 24px;
  border: none;
  background: ${props => props.active ? '#667eea' : 'transparent'};
  color: ${props => props.active ? 'white' : '#6c757d'};
  border-radius: 8px;
  font-size: 14px;
  font-weight: ${props => props.active ? '600' : '500'};
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
  
  &:hover {
    background: ${props => props.active ? '#5a6fd8' : '#f8f9fa'};
  }
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-bottom: 20px;
`;

const StatCard = styled.div`
  background: white;
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  gap: 16px;
`;

const StatIcon = styled.div`
  width: 60px;
  height: 60px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  color: white;
  background: ${props => {
    switch (props.type) {
      case 'revenue': return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      case 'sales': return 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)';
      case 'products': return 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)';
      case 'avg': return 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)';
      default: return '#667eea';
    }
  }};
`;

const StatInfo = styled.div`
  flex: 1;
`;

const StatLabel = styled.div`
  font-size: 14px;
  color: #6c757d;
  margin-bottom: 4px;
`;

const StatValue = styled.div`
  font-size: 28px;
  font-weight: 700;
  color: #333;
`;

const StatChange = styled.div`
  font-size: 12px;
  color: ${props => props.positive ? '#28a745' : '#dc3545'};
  font-weight: 600;
  margin-top: 4px;
`;

const ReportCard = styled.div`
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  margin-bottom: 20px;
  overflow: hidden;
`;

const ReportCardHeader = styled.div`
  padding: 20px;
  border-bottom: 1px solid #e9ecef;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f8f9fa;
`;

const ReportCardTitle = styled.h3`
  margin: 0;
  color: #333;
  font-size: 18px;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ReportCardContent = styled.div`
  padding: 20px;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const TableHeader = styled.th`
  text-align: left;
  padding: 12px;
  background: #f8f9fa;
  border-bottom: 2px solid #e9ecef;
  font-weight: 600;
  color: #333;
  font-size: 14px;
`;

const TableCell = styled.td`
  padding: 12px;
  border-bottom: 1px solid #f1f3f4;
  color: #333;
  font-size: 14px;
`;

const TableRow = styled.tr`
  cursor: pointer;
  &:hover {
    background: #f8f9fa;
  }
`;

const LoadingSpinner = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 40px;
  color: #6c757d;
`;

const NoData = styled.div`
  text-align: center;
  padding: 40px;
  color: #6c757d;
  font-size: 16px;
`;

const ChartContainer = styled.div`
  height: 300px;
  margin: 20px 0;
`;

const COLORS = ['#667eea', '#f093fb', '#4facfe', '#43e97b', '#f5576c', '#764ba2'];

function AdvancedReports({ user }) {
  const [filters, setFilters] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    userId: '',
    paymentMethod: '',
    minAmount: '',
    maxAmount: '',
    productId: '',
    category: ''
  });
  
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState({});
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);

  const isCashier = user?.role === 'cashier';

  useEffect(() => {
    if (isCashier) {
      const today = new Date().toISOString().split('T')[0];
      setFilters(prev => ({ ...prev, startDate: today, endDate: today }));
    }
    loadInitialData();
    loadReportData();
  }, [isCashier]);

  const loadInitialData = async () => {
    try {
      if (!isCashier) {
        // Load users
        const usersRes = await axios.get('/api/users');
        setUsers(usersRes.data || []);
      }

      // Load products
      const productsRes = await axios.get('/api/products');
      setProducts(productsRes.data || []);

      // Extract unique categories
      const uniqueCategories = [...new Set((productsRes.data || []).map(p => p.category).filter(Boolean))];
      setCategories(uniqueCategories);
    } catch (error) {
      console.error('Error loading initial data:', error);
    }
  };

  const loadReportData = async () => {
    setLoading(true);
    try {
      const params = {
        startDate: filters.startDate,
        endDate: filters.endDate,
        ...(filters.userId && { userId: filters.userId }),
        ...(filters.paymentMethod && { paymentMethod: filters.paymentMethod }),
        ...(filters.minAmount && { minAmount: filters.minAmount }),
        ...(filters.maxAmount && { maxAmount: filters.maxAmount }),
        ...(filters.productId && { productId: filters.productId }),
        ...(filters.category && { category: filters.category })
      };

      // Load multiple reports in parallel
      const [
        salesRes,
        salesByProductRes,
        salesByUserRes,
        salesByPaymentRes,
        salesByCategoryRes,
        hourlyRes,
        dailyRes,
        topProductsRes,
        profitabilityRes
      ] = await Promise.allSettled([
        axios.get('/api/advanced-reporting/sales/advanced', { params }),
        axios.get('/api/advanced-reporting/sales/by-product', { params }),
        !isCashier ? axios.get('/api/advanced-reporting/sales/by-user', { params }) : Promise.resolve({ data: { success: true, data: [] } }),
        axios.get('/api/advanced-reporting/sales/by-payment-method', { params }),
        axios.get('/api/advanced-reporting/sales/by-category', { params }),
        axios.get('/api/advanced-reporting/sales/hourly', { params }),
        axios.get('/api/advanced-reporting/sales/daily', { params }),
        axios.get('/api/advanced-reporting/products/top-selling', { params }),
        axios.get('/api/advanced-reporting/products/profitability', { params })
      ]);

      setReportData({
        sales: salesRes.status === 'fulfilled' ? salesRes.value.data : null,
        salesByProduct: salesByProductRes.status === 'fulfilled' ? salesByProductRes.value.data : null,
        salesByUser: salesByUserRes.status === 'fulfilled' ? salesByUserRes.value.data : null,
        salesByPayment: salesByPaymentRes.status === 'fulfilled' ? salesByPaymentRes.value.data : null,
        salesByCategory: salesByCategoryRes.status === 'fulfilled' ? salesByCategoryRes.value.data : null,
        hourly: hourlyRes.status === 'fulfilled' ? hourlyRes.value.data : null,
        daily: dailyRes.status === 'fulfilled' ? dailyRes.value.data : null,
        topProducts: topProductsRes.status === 'fulfilled' ? topProductsRes.value.data : null,
        profitability: profitabilityRes.status === 'fulfilled' ? profitabilityRes.value.data : null
      });
    } catch (error) {
      console.error('Error loading report data:', error);
      toast.error('Failed to load report data');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const applyFilters = () => {
    if (isCashier) {
      const today = new Date().toISOString().split('T')[0];
      if (filters.startDate !== today || filters.endDate !== today) {
        toast.error('Cashers can only view today\'s reports');
        setFilters(prev => ({ ...prev, startDate: today, endDate: today }));
      }
    }
    loadReportData();
    setFilterPanelOpen(false);
  };

  const resetFilters = () => {
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    setFilters({
      startDate: isCashier ? today : thirtyDaysAgo,
      endDate: today,
      userId: '',
      paymentMethod: '',
      minAmount: '',
      maxAmount: '',
      productId: '',
      category: ''
    });
  };

  const exportToCSV = (data, filename) => {
    if (!data || !data.length) {
      toast.error('No data to export');
      return;
    }

    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row => 
      Object.values(row).map(val => 
        typeof val === 'string' && val.includes(',') ? `"${val}"` : val
      ).join(',')
    );
    
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${filters.startDate}_to_${filters.endDate}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('Data exported successfully');
  };

  const renderOverview = () => {
    const sales = reportData.sales?.data || [];
    const totalRevenue = sales.reduce((sum, s) => sum + (s.total_amount || 0), 0);
    const totalSales = sales.length;
    const avgSale = totalSales > 0 ? totalRevenue / totalSales : 0;
    const totalProducts = new Set(sales.flatMap(s => s.item_count || [])).size;

    return (
      <>
        <StatsGrid>
          <StatCard>
            <StatIcon type="revenue">
              <FiDollarSign />
            </StatIcon>
            <StatInfo>
              <StatLabel>Total Revenue</StatLabel>
              <StatValue>{formatCurrency(totalRevenue, getCurrentCurrency())}</StatValue>
            </StatInfo>
          </StatCard>

          <StatCard>
            <StatIcon type="sales">
              <FiBarChart2 />
            </StatIcon>
            <StatInfo>
              <StatLabel>Total Sales</StatLabel>
              <StatValue>{totalSales}</StatValue>
            </StatInfo>
          </StatCard>

          <StatCard>
            <StatIcon type="avg">
              <FiTrendingUp />
            </StatIcon>
            <StatInfo>
              <StatLabel>Average Sale</StatLabel>
              <StatValue>{formatCurrency(avgSale, getCurrentCurrency())}</StatValue>
            </StatInfo>
          </StatCard>

          <StatCard>
            <StatIcon type="products">
              <FiPackage />
            </StatIcon>
            <StatInfo>
              <StatLabel>Products Sold</StatLabel>
              <StatValue>{totalProducts}</StatValue>
            </StatInfo>
          </StatCard>
        </StatsGrid>

        {reportData.daily?.data && reportData.daily.data.length > 0 && (
          <ReportCard>
            <ReportCardHeader>
              <ReportCardTitle>
                <FiCalendar />
                Daily Sales Trend
              </ReportCardTitle>
              <Button className="success" onClick={() => exportToCSV(reportData.daily.data, 'daily_sales')}>
                <FiDownload />
                Export
              </Button>
            </ReportCardHeader>
            <ReportCardContent>
              <ChartContainer>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={reportData.daily.data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="total_revenue" stroke="#667eea" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartContainer>
            </ReportCardContent>
          </ReportCard>
        )}

        {reportData.salesByPayment?.data && reportData.salesByPayment.data.length > 0 && (
          <ReportCard>
            <ReportCardHeader>
              <ReportCardTitle>
                <FiCreditCard />
                Payment Method Distribution
              </ReportCardTitle>
            </ReportCardHeader>
            <ReportCardContent>
              <ChartContainer>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={reportData.salesByPayment.data}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="total_amount"
                    >
                      {reportData.salesByPayment.data.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </ChartContainer>
            </ReportCardContent>
          </ReportCard>
        )}
      </>
    );
  };

  const renderProductAnalytics = () => {
    return (
      <>
        {reportData.topProducts?.data && reportData.topProducts.data.length > 0 && (
          <ReportCard>
            <ReportCardHeader>
              <ReportCardTitle>
                <FiTrendingUp />
                Top Selling Products
              </ReportCardTitle>
              <Button className="success" onClick={() => exportToCSV(reportData.topProducts.data, 'top_products')}>
                <FiDownload />
                Export
              </Button>
            </ReportCardHeader>
            <ReportCardContent>
              <Table>
                <thead>
                  <tr>
                    <TableHeader>Product</TableHeader>
                    <TableHeader>Category</TableHeader>
                    <TableHeader>Quantity Sold</TableHeader>
                    <TableHeader>Revenue</TableHeader>
                    <TableHeader>Times Sold</TableHeader>
                  </tr>
                </thead>
                <tbody>
                  {reportData.topProducts.data.map((product, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{product.product_name}</TableCell>
                      <TableCell>{product.category || 'N/A'}</TableCell>
                      <TableCell>{product.total_quantity_sold}</TableCell>
                      <TableCell>{formatCurrency(product.total_revenue, getCurrentCurrency())}</TableCell>
                      <TableCell>{product.times_sold}</TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </Table>
            </ReportCardContent>
          </ReportCard>
        )}

        {reportData.profitability?.data && reportData.profitability.data.length > 0 && (
          <ReportCard>
            <ReportCardHeader>
              <ReportCardTitle>
                <FiDollar />
                Product Profitability
              </ReportCardTitle>
              <Button className="success" onClick={() => exportToCSV(reportData.profitability.data, 'profitability')}>
                <FiDownload />
                Export
              </Button>
            </ReportCardHeader>
            <ReportCardContent>
              <Table>
                <thead>
                  <tr>
                    <TableHeader>Product</TableHeader>
                    <TableHeader>Revenue</TableHeader>
                    <TableHeader>Cost</TableHeader>
                    <TableHeader>Profit</TableHeader>
                    <TableHeader>Margin %</TableHeader>
                  </tr>
                </thead>
                <tbody>
                  {reportData.profitability.data.map((product, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{product.product_name}</TableCell>
                      <TableCell>{formatCurrency(product.total_revenue, getCurrentCurrency())}</TableCell>
                      <TableCell>{formatCurrency(product.total_cost || 0, getCurrentCurrency())}</TableCell>
                      <TableCell>{formatCurrency(product.total_profit || 0, getCurrentCurrency())}</TableCell>
                      <TableCell>{parseFloat(product.profit_margin_percent || 0).toFixed(2)}%</TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </Table>
            </ReportCardContent>
          </ReportCard>
        )}
      </>
    );
  };

  const renderSalesAnalysis = () => {
    return (
      <>
        {reportData.hourly?.data && reportData.hourly.data.length > 0 && (
          <ReportCard>
            <ReportCardHeader>
              <ReportCardTitle>
                <FiClock />
                Hourly Sales Pattern
              </ReportCardTitle>
            </ReportCardHeader>
            <ReportCardContent>
              <ChartContainer>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={reportData.hourly.data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="total_revenue" fill="#667eea" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </ReportCardContent>
          </ReportCard>
        )}

        {reportData.salesByCategory?.data && reportData.salesByCategory.data.length > 0 && (
          <ReportCard>
            <ReportCardHeader>
              <ReportCardTitle>
                <FiGrid />
                Sales by Category
              </ReportCardTitle>
              <Button className="success" onClick={() => exportToCSV(reportData.salesByCategory.data, 'sales_by_category')}>
                <FiDownload />
                Export
              </Button>
            </ReportCardHeader>
            <ReportCardContent>
              <Table>
                <thead>
                  <tr>
                    <TableHeader>Category</TableHeader>
                    <TableHeader>Sales Count</TableHeader>
                    <TableHeader>Quantity Sold</TableHeader>
                    <TableHeader>Revenue</TableHeader>
                    <TableHeader>Avg Price</TableHeader>
                  </tr>
                </thead>
                <tbody>
                  {reportData.salesByCategory.data.map((cat, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{cat.category}</TableCell>
                      <TableCell>{cat.sale_count}</TableCell>
                      <TableCell>{cat.total_quantity}</TableCell>
                      <TableCell>{formatCurrency(cat.total_revenue, getCurrentCurrency())}</TableCell>
                      <TableCell>{formatCurrency(cat.avg_price, getCurrentCurrency())}</TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </Table>
            </ReportCardContent>
          </ReportCard>
        )}

        {!isCashier && reportData.salesByUser?.data && reportData.salesByUser.data.length > 0 && (
          <ReportCard>
            <ReportCardHeader>
              <ReportCardTitle>
                <FiUsers />
                Sales by User
              </ReportCardTitle>
              <Button className="success" onClick={() => exportToCSV(reportData.salesByUser.data, 'sales_by_user')}>
                <FiDownload />
                Export
              </Button>
            </ReportCardHeader>
            <ReportCardContent>
              <Table>
                <thead>
                  <tr>
                    <TableHeader>User</TableHeader>
                    <TableHeader>Sales Count</TableHeader>
                    <TableHeader>Total Revenue</TableHeader>
                    <TableHeader>Avg Sale</TableHeader>
                  </tr>
                </thead>
                <tbody>
                  {reportData.salesByUser.data.map((user, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{user.full_name || user.username}</TableCell>
                      <TableCell>{user.sale_count}</TableCell>
                      <TableCell>{formatCurrency(user.total_revenue, getCurrentCurrency())}</TableCell>
                      <TableCell>{formatCurrency(user.avg_sale_amount, getCurrentCurrency())}</TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </Table>
            </ReportCardContent>
          </ReportCard>
        )}
      </>
    );
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: FiBarChart2 },
    { id: 'products', label: 'Product Analytics', icon: FiPackage },
    { id: 'sales', label: 'Sales Analysis', icon: FiTrendingUp }
  ];

  return (
    <Container>
      <Header>
        <Title>
          <FiBarChart2 />
          Advanced Reports
        </Title>
        <ButtonGroup>
          <Button 
            className="primary" 
            onClick={() => setFilterPanelOpen(!filterPanelOpen)}
          >
            <FiFilter />
            {filterPanelOpen ? 'Hide Filters' : 'Show Filters'}
          </Button>
          <Button className="secondary" onClick={loadReportData} disabled={loading}>
            <FiRefreshCw />
            Refresh
          </Button>
        </ButtonGroup>
      </Header>

      <FilterPanel open={filterPanelOpen}>
        <FilterRow>
          <FilterGroup>
            <Label>Start Date</Label>
            <Input
              type="date"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
              max={isCashier ? new Date().toISOString().split('T')[0] : undefined}
              disabled={isCashier}
            />
          </FilterGroup>
          <FilterGroup>
            <Label>End Date</Label>
            <Input
              type="date"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
              max={isCashier ? new Date().toISOString().split('T')[0] : undefined}
              disabled={isCashier}
            />
          </FilterGroup>
          {!isCashier && (
            <FilterGroup>
              <Label>User</Label>
              <Select
                value={filters.userId}
                onChange={(e) => handleFilterChange('userId', e.target.value)}
              >
                <option value="">All Users</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.full_name || user.username}
                  </option>
                ))}
              </Select>
            </FilterGroup>
          )}
          <FilterGroup>
            <Label>Payment Method</Label>
            <Select
              value={filters.paymentMethod}
              onChange={(e) => handleFilterChange('paymentMethod', e.target.value)}
            >
              <option value="">All Methods</option>
              <option value="Cash">Cash</option>
              <option value="Card">Card</option>
              <option value="Mobile Payment">Mobile Payment</option>
            </Select>
          </FilterGroup>
        </FilterRow>
        <FilterRow>
          <FilterGroup>
            <Label>Min Amount</Label>
            <Input
              type="number"
              value={filters.minAmount}
              onChange={(e) => handleFilterChange('minAmount', e.target.value)}
              placeholder="0.00"
            />
          </FilterGroup>
          <FilterGroup>
            <Label>Max Amount</Label>
            <Input
              type="number"
              value={filters.maxAmount}
              onChange={(e) => handleFilterChange('maxAmount', e.target.value)}
              placeholder="0.00"
            />
          </FilterGroup>
          <FilterGroup>
            <Label>Category</Label>
            <Select
              value={filters.category}
              onChange={(e) => handleFilterChange('category', e.target.value)}
            >
              <option value="">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </Select>
          </FilterGroup>
        </FilterRow>
        <ButtonGroup>
          <Button className="primary" onClick={applyFilters}>
            Apply Filters
          </Button>
          <Button className="secondary" onClick={resetFilters}>
            Reset
          </Button>
        </ButtonGroup>
      </FilterPanel>

      <Content>
        <ReportTabs>
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <Tab
                key={tab.id}
                active={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon />
                {tab.label}
              </Tab>
            );
          })}
        </ReportTabs>

        {loading ? (
          <LoadingSpinner>Loading reports...</LoadingSpinner>
        ) : (
          <>
            {activeTab === 'overview' && renderOverview()}
            {activeTab === 'products' && renderProductAnalytics()}
            {activeTab === 'sales' && renderSalesAnalysis()}
          </>
        )}
      </Content>
    </Container>
  );
}

export default AdvancedReports;

