import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { FiClock, FiEdit2, FiTrash2, FiRefreshCw, FiCalendar, FiUser, FiLogIn, FiLogOut, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';
import axios from 'axios';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: 100%;
  padding: 24px;
  box-sizing: border-box;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 24px;
  color: #1e293b;
  display: flex;
  align-items: center;
  gap: 12px;
`;

const Controls = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
`;

const Button = styled.button`
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;
  
  ${props => {
    if (props.variant === 'primary') {
      return `
        background: #10b981;
        color: white;
        &:hover:not(:disabled) {
          background: #059669;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        }
      `;
    }
    if (props.variant === 'danger') {
      return `
        background: #ef4444;
        color: white;
        &:hover:not(:disabled) {
          background: #dc2626;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
        }
      `;
    }
    if (props.variant === 'secondary') {
      return `
        background: #f1f5f9;
        color: #475569;
        &:hover:not(:disabled) {
          background: #e2e8f0;
        }
      `;
    }
  }}
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const Filters = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  padding: 16px;
  background: #f8fafc;
  border-radius: 12px;
`;

const Input = styled.input`
  padding: 10px 14px;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  transition: all 0.2s;
  
  &:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }
`;

const Select = styled.select`
  padding: 10px 14px;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  background: white;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 200px;
  
  &:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
`;

const TableHeader = styled.thead`
  background: #f1f5f9;
`;

const TableRow = styled.tr`
  border-bottom: 1px solid #e2e8f0;
  transition: background 0.2s;
  
  &:hover {
    background: #f8fafc;
  }
  
  &:last-child {
    border-bottom: none;
  }
`;

const TableHeaderCell = styled.th`
  padding: 16px;
  text-align: left;
  font-weight: 600;
  color: #475569;
  font-size: 14px;
`;

const TableCell = styled.td`
  padding: 16px;
  color: #1e293b;
  font-size: 14px;
`;

const StatusBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  background: ${props => props.status === 'active' ? '#d1fae5' : '#e0e7ff'};
  color: ${props => props.status === 'active' ? '#065f46' : '#3730a3'};
`;

const ActionButton = styled.button`
  background: none;
  border: none;
  color: #64748b;
  cursor: pointer;
  padding: 8px;
  border-radius: 6px;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  
  &:hover {
    background: #f1f5f9;
    color: ${props => props.variant === 'danger' ? '#ef4444' : '#667eea'};
  }
  
  svg {
    font-size: 16px;
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 60px 20px;
  color: #64748b;
  
  svg {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.5;
  }
`;

const Modal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
`;

const ModalContent = styled.div`
  background: white;
  border-radius: 16px;
  padding: 32px;
  max-width: 500px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
`;

const ModalTitle = styled.h3`
  margin: 0;
  font-size: 20px;
  color: #1e293b;
`;

const FormGroup = styled.div`
  margin-bottom: 20px;
`;

const Label = styled.label`
  display: block;
  margin-bottom: 8px;
  color: #475569;
  font-weight: 500;
  font-size: 14px;
`;

const DateTimeInput = styled.input`
  width: 100%;
  padding: 12px;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  transition: all 0.2s;
  
  &:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  padding: 12px;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  min-height: 100px;
  transition: all 0.2s;
  
  &:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }
`;

function TimeSheets({ user }) {
  const [timesheets, setTimesheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [editingTimesheet, setEditingTimesheet] = useState(null);
  const [editForm, setEditForm] = useState({ clock_in_time: '', clock_out_time: '', notes: '' });
  const [clockStatus, setClockStatus] = useState(null);

  const userRole = user?.role || 'cashier';
  const canEdit = userRole === 'admin' || userRole === 'manager';
  const canFilterByUser = canEdit; // Only admins/managers can filter by user

  useEffect(() => {
    fetchTimesheets();
    fetchClockStatus();
    
    // Set default date range (last 30 days)
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    setEndDate(end.toISOString().split('T')[0]);
    setStartDate(start.toISOString().split('T')[0]);
    
    // Fetch users if admin/manager
    if (canFilterByUser) {
      fetchUsers();
    }
  }, []);

  useEffect(() => {
    if (startDate && endDate) {
      fetchTimesheets();
    }
  }, [startDate, endDate, selectedUserId]);

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      const response = await axios.get('/api/user-management/users', {
        withCredentials: true
      });

      if (response.data.success) {
        setUsers(response.data.users || []);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      // If user management module is not available, silently fail
      // Users can still use the timesheet without user filter
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchTimesheets = async () => {
    try {
      setLoading(true);
      const params = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (selectedUserId && canFilterByUser) {
        params.targetUserId = selectedUserId;
      }

      const response = await axios.get('/api/clock-in-out/timesheets', {
        params,
        withCredentials: true
      });

      if (response.data.success) {
        setTimesheets(response.data.timesheets || []);
      }
    } catch (error) {
      console.error('Error fetching timesheets:', error);
      toast.error('Failed to load timesheets');
    } finally {
      setLoading(false);
    }
  };

  const fetchClockStatus = async () => {
    try {
      const response = await axios.get('/api/clock-in-out/status', {
        withCredentials: true
      });

      if (response.data.success) {
        setClockStatus(response.data);
      }
    } catch (error) {
      console.error('Error fetching clock status:', error);
    }
  };

  const handleClockIn = async () => {
    try {
      const response = await axios.post('/api/clock-in-out/clock-in', {}, {
        withCredentials: true
      });

      if (response.data.success) {
        toast.success('Clocked in successfully');
        fetchClockStatus();
        fetchTimesheets();
      } else {
        toast.error(response.data.error || 'Failed to clock in');
      }
    } catch (error) {
      console.error('Error clocking in:', error);
      toast.error(error.response?.data?.error || 'Failed to clock in');
    }
  };

  const handleClockOut = async () => {
    try {
      const response = await axios.post('/api/clock-in-out/clock-out', {}, {
        withCredentials: true
      });

      if (response.data.success) {
        toast.success('Clocked out successfully');
        fetchClockStatus();
        fetchTimesheets();
      } else {
        toast.error(response.data.error || 'Failed to clock out');
      }
    } catch (error) {
      console.error('Error clocking out:', error);
      toast.error(error.response?.data?.error || 'Failed to clock out');
    }
  };

  const handleEdit = (timesheet) => {
    setEditingTimesheet(timesheet);
    setEditForm({
      clock_in_time: timesheet.clock_in_time ? timesheet.clock_in_time.slice(0, 16) : '',
      clock_out_time: timesheet.clock_out_time ? timesheet.clock_out_time.slice(0, 16) : '',
      notes: timesheet.notes || ''
    });
  };

  const handleSaveEdit = async () => {
    try {
      const response = await axios.put(
        `/api/clock-in-out/timesheets/${editingTimesheet.id}`,
        {
          clock_in_time: editForm.clock_in_time ? new Date(editForm.clock_in_time).toISOString() : undefined,
          clock_out_time: editForm.clock_out_time ? new Date(editForm.clock_out_time).toISOString() : undefined,
          notes: editForm.notes
        },
        { withCredentials: true }
      );

      if (response.data.success) {
        toast.success('Timesheet updated successfully');
        setEditingTimesheet(null);
        fetchTimesheets();
      } else {
        toast.error(response.data.error || 'Failed to update timesheet');
      }
    } catch (error) {
      console.error('Error updating timesheet:', error);
      toast.error(error.response?.data?.error || 'Failed to update timesheet');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this timesheet entry?')) {
      return;
    }

    try {
      const response = await axios.delete(`/api/clock-in-out/timesheets/${id}`, {
        withCredentials: true
      });

      if (response.data.success) {
        toast.success('Timesheet deleted successfully');
        fetchTimesheets();
      } else {
        toast.error(response.data.error || 'Failed to delete timesheet');
      }
    } catch (error) {
      console.error('Error deleting timesheet:', error);
      toast.error(error.response?.data?.error || 'Failed to delete timesheet');
    }
  };

  const formatDateTime = (dateTime) => {
    if (!dateTime) return 'N/A';
    const date = new Date(dateTime);
    return date.toLocaleString();
  };

  const formatHours = (hours) => {
    if (!hours) return 'N/A';
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    return `${h}h ${m}m`;
  };

  return (
    <Container>
      <Header>
        <Title>
          <FiClock />
          Time Sheets
        </Title>
        <Controls>
          {clockStatus?.isClockedIn ? (
            <Button variant="danger" onClick={handleClockOut}>
              <FiLogOut />
              Clock Out
            </Button>
          ) : (
            <Button variant="primary" onClick={handleClockIn}>
              <FiLogIn />
              Clock In
            </Button>
          )}
          <Button variant="secondary" onClick={fetchTimesheets} disabled={loading}>
            <FiRefreshCw />
            Refresh
          </Button>
        </Controls>
      </Header>

      <Filters>
        <Input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          placeholder="Start Date"
        />
        <Input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          placeholder="End Date"
        />
        {canFilterByUser && (
          <Select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
          >
            <option value="">All Users</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name || u.username}
              </option>
            ))}
          </Select>
        )}
      </Filters>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>Loading...</div>
      ) : timesheets.length === 0 ? (
        <EmptyState>
          <FiClock />
          <p>No timesheet entries found for the selected date range.</p>
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>User</TableHeaderCell>
              <TableHeaderCell>Clock In</TableHeaderCell>
              <TableHeaderCell>Clock Out</TableHeaderCell>
              <TableHeaderCell>Hours</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Notes</TableHeaderCell>
              {canEdit && <TableHeaderCell>Actions</TableHeaderCell>}
            </TableRow>
          </TableHeader>
          <tbody>
            {timesheets.map((timesheet) => (
              <TableRow key={timesheet.id}>
                <TableCell>{timesheet.full_name || timesheet.username || 'N/A'}</TableCell>
                <TableCell>{formatDateTime(timesheet.clock_in_time)}</TableCell>
                <TableCell>{formatDateTime(timesheet.clock_out_time)}</TableCell>
                <TableCell>{formatHours(timesheet.total_hours)}</TableCell>
                <TableCell>
                  <StatusBadge status={timesheet.clock_out_time ? 'completed' : 'active'}>
                    {timesheet.clock_out_time ? 'Completed' : 'Active'}
                  </StatusBadge>
                </TableCell>
                <TableCell>{timesheet.notes || '-'}</TableCell>
                {canEdit && (
                  <TableCell>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <ActionButton onClick={() => handleEdit(timesheet)} title="Edit">
                        <FiEdit2 />
                      </ActionButton>
                      <ActionButton variant="danger" onClick={() => handleDelete(timesheet.id)} title="Delete">
                        <FiTrash2 />
                      </ActionButton>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}

      {editingTimesheet && (
        <Modal onClick={(e) => e.target === e.currentTarget && setEditingTimesheet(null)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalHeader>
              <ModalTitle>Edit Timesheet</ModalTitle>
              <ActionButton onClick={() => setEditingTimesheet(null)}>
                <FiX />
              </ActionButton>
            </ModalHeader>
            <FormGroup>
              <Label>Clock In Time</Label>
              <DateTimeInput
                type="datetime-local"
                value={editForm.clock_in_time}
                onChange={(e) => setEditForm({ ...editForm, clock_in_time: e.target.value })}
              />
            </FormGroup>
            <FormGroup>
              <Label>Clock Out Time</Label>
              <DateTimeInput
                type="datetime-local"
                value={editForm.clock_out_time}
                onChange={(e) => setEditForm({ ...editForm, clock_out_time: e.target.value })}
              />
            </FormGroup>
            <FormGroup>
              <Label>Notes</Label>
              <TextArea
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                placeholder="Optional notes..."
              />
            </FormGroup>
            <Controls>
              <Button variant="secondary" onClick={() => setEditingTimesheet(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSaveEdit}>
                Save Changes
              </Button>
            </Controls>
          </ModalContent>
        </Modal>
      )}
    </Container>
  );
}

export default TimeSheets;

