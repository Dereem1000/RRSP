import React, { useState } from 'react';
import styled from 'styled-components';
import { FiKey, FiLock, FiUnlock, FiSave, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';
import axios from 'axios';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  box-sizing: border-box;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
`;

const Title = styled.h3`
  margin: 0;
  color: #333;
  font-size: 18px;
`;

const FormGroup = styled.div`
  margin-bottom: 16px;
`;

const Label = styled.label`
  display: block;
  margin-bottom: 8px;
  color: #333;
  font-weight: 500;
  font-size: 14px;
`;

const Input = styled.input`
  width: 100%;
  padding: 12px;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  font-size: 16px;
  text-align: center;
  letter-spacing: 8px;
  font-family: 'Courier New', monospace;
  transition: all 0.2s ease;
  
  &:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }
`;

const Button = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: ${props => props.variant === 'danger' ? '#dc3545' : props.variant === 'secondary' ? '#6c757d' : '#667eea'};
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  
  &:hover:not(:disabled) {
    background: ${props => props.variant === 'danger' ? '#c82333' : props.variant === 'secondary' ? '#5a6268' : '#5a6fd8'};
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 8px;
`;

const InfoText = styled.p`
  margin: 8px 0 0 0;
  color: #6c757d;
  font-size: 12px;
`;

const StatusBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  background: ${props => props.status === 'set' ? '#d4edda' : '#f8d7da'};
  color: ${props => props.status === 'set' ? '#155724' : '#721c24'};
  margin-bottom: 16px;
`;

function PinManagement() {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinStatus, setPinStatus] = useState(null); // 'set', 'not-set', 'checking'
  const [loading, setLoading] = useState(false);
  const [showSetup, setShowSetup] = useState(false);

  React.useEffect(() => {
    checkPinStatus();
  }, []);

  const checkPinStatus = async () => {
    try {
      // Try to verify with a dummy PIN to check if PIN exists
      // Or we could add a status endpoint
      setPinStatus('checking');
      // For now, assume not set - in production, add a status endpoint
      setPinStatus('not-set');
    } catch (error) {
      setPinStatus('not-set');
    }
  };

  const handleSetupPin = async (e) => {
    e.preventDefault();
    
    if (!pin || pin.length < 4 || pin.length > 8) {
      toast.error('PIN must be between 4 and 8 digits');
      return;
    }

    if (!/^\d+$/.test(pin)) {
      toast.error('PIN must contain only digits');
      return;
    }

    if (pin !== confirmPin) {
      toast.error('PINs do not match');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post('/api/user-management/pin/setup', 
        { pin },
        { withCredentials: true }
      );
      
      if (response.data.success) {
        toast.success('PIN set up successfully');
        setPin('');
        setConfirmPin('');
        setShowSetup(false);
        setPinStatus('set');
      } else {
        toast.error(response.data.error || 'Failed to set up PIN');
      }
    } catch (error) {
      console.error('Error setting up PIN:', error);
      toast.error(error.response?.data?.error || 'Failed to set up PIN');
    } finally {
      setLoading(false);
    }
  };

  const handleClearPin = async () => {
    if (!window.confirm('Are you sure you want to clear your PIN? You will need to set it up again to use PIN authentication.')) {
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post('/api/user-management/pin/clear',
        {},
        { withCredentials: true }
      );
      
      if (response.data.success) {
        toast.success('PIN cleared successfully');
        setPinStatus('not-set');
      } else {
        toast.error(response.data.error || 'Failed to clear PIN');
      }
    } catch (error) {
      console.error('Error clearing PIN:', error);
      toast.error(error.response?.data?.error || 'Failed to clear PIN');
    } finally {
      setLoading(false);
    }
  };

  if (!showSetup && pinStatus === 'set') {
    return (
      <Container>
        <Header>
          <FiKey style={{ color: '#667eea' }} />
          <Title>PIN Authentication</Title>
        </Header>
        <StatusBadge status="set">
          <FiLock />
          PIN is set
        </StatusBadge>
        <InfoText>
          Your PIN is configured. You can use it for quick authentication when away from the platform.
        </InfoText>
        <ButtonGroup>
          <Button variant="secondary" onClick={() => setShowSetup(true)}>
            <FiKey />
            Change PIN
          </Button>
          <Button variant="danger" onClick={handleClearPin} disabled={loading}>
            <FiUnlock />
            Clear PIN
          </Button>
        </ButtonGroup>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <FiKey style={{ color: '#667eea' }} />
        <Title>{pinStatus === 'set' ? 'Change PIN' : 'Set Up PIN'}</Title>
      </Header>
      {pinStatus === 'set' && (
        <StatusBadge status="set">
          <FiLock />
          PIN is currently set
        </StatusBadge>
      )}
      <form onSubmit={handleSetupPin}>
        <FormGroup>
          <Label>Enter PIN (4-8 digits)</Label>
          <Input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={8}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="Enter PIN"
            required
          />
          <InfoText>PIN must be 4-8 digits and contain only numbers</InfoText>
        </FormGroup>
        <FormGroup>
          <Label>Confirm PIN</Label>
          <Input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={8}
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
            placeholder="Confirm PIN"
            required
          />
        </FormGroup>
        <ButtonGroup>
          {pinStatus === 'set' && (
            <Button type="button" variant="secondary" onClick={() => {
              setShowSetup(false);
              setPin('');
              setConfirmPin('');
            }}>
              <FiX />
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={loading || !pin || !confirmPin}>
            <FiSave />
            {loading ? 'Setting up...' : pinStatus === 'set' ? 'Update PIN' : 'Set Up PIN'}
          </Button>
        </ButtonGroup>
      </form>
    </Container>
  );
}

export default PinManagement;

