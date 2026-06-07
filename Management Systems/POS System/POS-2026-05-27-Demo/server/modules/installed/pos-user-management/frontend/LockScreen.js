import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { FiLock, FiUnlock, FiUser, FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';
import axios from 'axios';

const LockOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  backdrop-filter: blur(10px);
`;

const LockContainer = styled.div`
  background: white;
  border-radius: 20px;
  padding: 40px;
  max-width: 400px;
  width: 90%;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  text-align: center;
`;

const LockIcon = styled.div`
  width: 80px;
  height: 80px;
  margin: 0 auto 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 36px;
  box-shadow: 0 8px 24px rgba(102, 126, 234, 0.4);
`;

const Title = styled.h2`
  margin: 0 0 8px 0;
  color: #333;
  font-size: 24px;
  font-weight: 700;
`;

const Subtitle = styled.p`
  margin: 0 0 32px 0;
  color: #6c757d;
  font-size: 14px;
`;

const UserInfo = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 24px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 8px;
`;

const UserName = styled.span`
  font-weight: 600;
  color: #333;
`;

const PinInput = styled.input`
  width: 100%;
  padding: 16px;
  border: 2px solid #dee2e6;
  border-radius: 12px;
  font-size: 24px;
  text-align: center;
  letter-spacing: 12px;
  font-family: 'Courier New', monospace;
  transition: all 0.2s ease;
  margin-bottom: 16px;
  
  &:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
  }
  
  &::placeholder {
    letter-spacing: 4px;
    font-size: 16px;
  }
`;

const Button = styled.button`
  width: 100%;
  padding: 14px;
  background: ${props => props.variant === 'secondary' ? '#6c757d' : '#667eea'};
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  
  &:hover:not(:disabled) {
    background: ${props => props.variant === 'secondary' ? '#5a6268' : '#5a6fd8'};
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const ErrorMessage = styled.div`
  color: #dc3545;
  font-size: 14px;
  margin-top: 8px;
  min-height: 20px;
`;

const CloseButton = styled.button`
  position: absolute;
  top: 20px;
  right: 20px;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 20px;
  
  &:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: scale(1.1);
  }
`;

function LockScreen({ user, onUnlock, onClose }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const pinInputRef = useRef(null);

  useEffect(() => {
    // Focus PIN input when component mounts
    if (pinInputRef.current) {
      pinInputRef.current.focus();
    }
  }, []);

  const handlePinChange = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 8);
    setPin(value);
    setError('');
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    
    if (!pin || pin.length < 4) {
      setError('PIN must be at least 4 digits');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const response = await axios.post('/api/user-management/pin/verify',
        { pin },
        { withCredentials: true }
      );
      
      if (response.data.success) {
        if (response.data.isDefaultPin) {
          toast.success('Default PIN accepted. Please set up your own PIN in Profile settings.', {
            duration: 5000
          });
        } else {
          toast.success('PIN verified successfully');
        }
        if (onUnlock) {
          onUnlock(response.data.sessionId);
        }
      } else {
        const errorData = response.data;
        const errorMessage = errorData?.error || 'Invalid PIN';
        
        // If PIN not set up, show default PIN
        if (errorData?.defaultPin) {
          setError(`${errorMessage}. Default PIN: ${errorData.defaultPin}`);
        } else {
          setError(errorMessage);
        }
        
        setPin('');
        if (pinInputRef.current) {
          pinInputRef.current.focus();
        }
      }
    } catch (error) {
      console.error('Error verifying PIN:', error);
      const errorData = error.response?.data;
      const errorMessage = errorData?.error || 'Failed to verify PIN';
      
      // If PIN not set up, show default PIN
      if (errorData?.defaultPin) {
        setError(`${errorMessage}. Default PIN: ${errorData.defaultPin}`);
      } else {
        setError(errorMessage);
      }
      
      setPin('');
      if (pinInputRef.current) {
        pinInputRef.current.focus();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && pin.length >= 4) {
      handleVerify(e);
    }
  };

  return (
    <LockOverlay>
      {onClose && (
        <CloseButton onClick={onClose} title="Close">
          <FiX />
        </CloseButton>
      )}
      <LockContainer>
        <LockIcon>
          <FiLock />
        </LockIcon>
        <Title>Session Locked</Title>
        <Subtitle>Enter your PIN to unlock</Subtitle>
        
        {user && (
          <UserInfo>
            <FiUser />
            <UserName>{user.full_name || user.username}</UserName>
          </UserInfo>
        )}
        
        <form onSubmit={handleVerify}>
          <PinInput
            ref={pinInputRef}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={8}
            value={pin}
            onChange={handlePinChange}
            onKeyPress={handleKeyPress}
            placeholder="Enter PIN"
            autoFocus
            disabled={loading}
          />
          <ErrorMessage>{error}</ErrorMessage>
          <Button type="submit" disabled={loading || pin.length < 4}>
            {loading ? 'Verifying...' : (
              <>
                <FiUnlock />
                Unlock
              </>
            )}
          </Button>
        </form>
      </LockContainer>
    </LockOverlay>
  );
}

export default LockScreen;

