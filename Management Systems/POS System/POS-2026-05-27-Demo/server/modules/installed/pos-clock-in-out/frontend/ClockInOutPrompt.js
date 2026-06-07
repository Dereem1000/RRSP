import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { FiClock, FiX, FiCheck, FiAlertCircle } from 'react-icons/fi';
import toast from 'react-hot-toast';
import axios from 'axios';

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  backdrop-filter: blur(4px);
`;

const Modal = styled.div`
  background: white;
  border-radius: 16px;
  padding: 32px;
  max-width: 450px;
  width: 90%;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  position: relative;
  animation: slideIn 0.3s ease-out;
  
  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
`;

const Icon = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: ${props => props.type === 'in' ? '#10b981' : '#ef4444'};
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  
  svg {
    font-size: 24px;
  }
`;

const Title = styled.h2`
  margin: 0;
  font-size: 24px;
  color: #1e293b;
  flex: 1;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: #64748b;
  cursor: pointer;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: all 0.2s;
  
  &:hover {
    background: #f1f5f9;
    color: #1e293b;
  }
  
  svg {
    font-size: 20px;
  }
`;

const Message = styled.p`
  color: #64748b;
  font-size: 16px;
  margin: 0 0 24px 0;
  line-height: 1.6;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 24px;
`;

const Button = styled.button`
  flex: 1;
  padding: 14px 24px;
  border: none;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  
  ${props => {
    if (props.variant === 'primary') {
      return `
        background: ${props.type === 'in' ? '#10b981' : '#ef4444'};
        color: white;
        &:hover:not(:disabled) {
          background: ${props.type === 'in' ? '#059669' : '#dc2626'};
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
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
  
  svg {
    font-size: 18px;
  }
`;

const NotesInput = styled.textarea`
  width: 100%;
  padding: 12px;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  min-height: 80px;
  margin-bottom: 16px;
  transition: all 0.2s;
  
  &:focus {
    outline: none;
    border-color: ${props => props.type === 'in' ? '#10b981' : '#ef4444'};
    box-shadow: 0 0 0 3px ${props => props.type === 'in' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'};
  }
  
  &::placeholder {
    color: #94a3b8;
  }
`;

const Alert = styled.div`
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fef3c7;
  color: #92400e;
  font-size: 14px;
`;

function ClockInOutPrompt({ isOpen, onClose, type = 'in', onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isOpen) {
      setNotes('');
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const endpoint = type === 'in' ? '/api/clock-in-out/clock-in' : '/api/clock-in-out/clock-out';
      const response = await axios.post(
        endpoint,
        { notes: notes.trim() || null },
        { withCredentials: true }
      );

      if (response.data.success) {
        toast.success(response.data.message || `${type === 'in' ? 'Clocked in' : 'Clocked out'} successfully`);
        if (onSuccess) {
          onSuccess(response.data.entry);
        }
        onClose();
      } else {
        toast.error(response.data.error || `Failed to clock ${type === 'in' ? 'in' : 'out'}`);
      }
    } catch (error) {
      console.error(`Error clocking ${type}:`, error);
      console.error('Error response:', error.response?.data);
      const errorMessage = error.response?.data?.error || error.response?.data?.message || `Failed to clock ${type === 'in' ? 'in' : 'out'}`;
      toast.error(errorMessage);
      
      // If clocking out failed because no active entry, close the prompt
      if (type === 'out' && error.response?.status === 400) {
        console.log('[ClockInOutPrompt] Clock out failed - no active entry, closing prompt');
        onClose();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Overlay>
      <Modal>
        <Header>
          <Icon type={type}>
            <FiClock />
          </Icon>
          <Title>Clock {type === 'in' ? 'In' : 'Out'}</Title>
          <CloseButton onClick={handleSkip}>
            <FiX />
          </CloseButton>
        </Header>

        <Message>
          {type === 'in' 
            ? 'Would you like to clock in now? You can add optional notes below.'
            : 'Would you like to clock out now? You can add optional notes below.'}
        </Message>

        {type === 'out' && (
          <Alert>
            <FiAlertCircle />
            <span>Make sure you've completed all your work before clocking out.</span>
          </Alert>
        )}

        <NotesInput
          type={type}
          placeholder={`Optional notes for clock ${type === 'in' ? 'in' : 'out'}...`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={loading}
        />

        <ButtonGroup>
          <Button variant="secondary" onClick={handleSkip} disabled={loading}>
            <FiX />
            Skip
          </Button>
          <Button variant="primary" type={type} onClick={handleConfirm} disabled={loading}>
            {loading ? (
              <>Processing...</>
            ) : (
              <>
                <FiCheck />
                Clock {type === 'in' ? 'In' : 'Out'}
              </>
            )}
          </Button>
        </ButtonGroup>
      </Modal>
    </Overlay>
  );
}

export default ClockInOutPrompt;

