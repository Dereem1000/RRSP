import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { FiSettings, FiSave, FiInfo } from 'react-icons/fi';
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

const SettingGroup = styled.div`
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
`;

const SettingItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  border-bottom: 1px solid #f1f5f9;
  
  &:last-child {
    border-bottom: none;
  }
`;

const SettingInfo = styled.div`
  flex: 1;
`;

const SettingLabel = styled.label`
  display: block;
  font-weight: 500;
  color: #1e293b;
  margin-bottom: 4px;
  font-size: 14px;
`;

const SettingDescription = styled.p`
  margin: 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
`;

const Toggle = styled.label`
  position: relative;
  display: inline-block;
  width: 50px;
  height: 26px;
  
  input {
    opacity: 0;
    width: 0;
    height: 0;
  }
  
  span {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #cbd5e1;
    transition: 0.3s;
    border-radius: 26px;
    
    &:before {
      position: absolute;
      content: "";
      height: 20px;
      width: 20px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: 0.3s;
      border-radius: 50%;
    }
  }
  
  input:checked + span {
    background-color: #10b981;
  }
  
  input:checked + span:before {
    transform: translateX(24px);
  }
  
  input:disabled + span {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const InfoBox = styled.div`
  padding: 12px 16px;
  background: #eff6ff;
  border-left: 4px solid #3b82f6;
  border-radius: 8px;
  margin-bottom: 20px;
  display: flex;
  align-items: start;
  gap: 12px;
  
  svg {
    color: #3b82f6;
    margin-top: 2px;
    flex-shrink: 0;
  }
  
  p {
    margin: 0;
    color: #1e40af;
    font-size: 13px;
    line-height: 1.6;
  }
`;

const Button = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  
  &:hover:not(:disabled) {
    background: #5a6fd8;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
  }
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

function ClockInOutSettings() {
  const [settings, setSettings] = useState({
    showClockInPromptOnLogin: true,
    showClockOutPromptOnLogout: true,
    autoClockInOnLogin: false,
    autoClockOutOnLogout: false,
    requireClockOutBeforeClockIn: true,
    allowManualClockInOut: true,
    enableTimesheetEditing: true
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/clock-in-out/settings', {
        withCredentials: true
      });

      if (response.data.success) {
        setSettings(response.data.settings);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (key) => {
    setSettings(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      // Note: Settings are managed through the module system
      // This component is for display only - actual settings are managed via module settings
      toast.success('Settings are managed through the module settings page');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Container>Loading settings...</Container>;
  }

  return (
    <Container>
      <Header>
        <FiSettings style={{ color: '#667eea' }} />
        <Title>Clock In/Out Settings</Title>
      </Header>

      <InfoBox>
        <FiInfo />
        <p>
          These settings control the clock in/out behavior. To modify these settings, 
          go to Settings → Modules → Clock In/Out and use the module settings interface.
        </p>
      </InfoBox>

      <SettingGroup>
        <SettingItem>
          <SettingInfo>
            <SettingLabel>Show Clock In Prompt on Login</SettingLabel>
            <SettingDescription>
              Display a prompt asking users to clock in when they log in
            </SettingDescription>
          </SettingInfo>
          <Toggle>
            <input
              type="checkbox"
              checked={settings.showClockInPromptOnLogin}
              onChange={() => handleToggle('showClockInPromptOnLogin')}
              disabled
            />
            <span />
          </Toggle>
        </SettingItem>

        <SettingItem>
          <SettingInfo>
            <SettingLabel>Show Clock Out Prompt on Logout</SettingLabel>
            <SettingDescription>
              Display a prompt asking users to clock out when they log out
            </SettingDescription>
          </SettingInfo>
          <Toggle>
            <input
              type="checkbox"
              checked={settings.showClockOutPromptOnLogout}
              onChange={() => handleToggle('showClockOutPromptOnLogout')}
              disabled
            />
            <span />
          </Toggle>
        </SettingItem>

        <SettingItem>
          <SettingInfo>
            <SettingLabel>Auto Clock In on Login</SettingLabel>
            <SettingDescription>
              Automatically clock in users when they log in (no prompt shown)
            </SettingDescription>
          </SettingInfo>
          <Toggle>
            <input
              type="checkbox"
              checked={settings.autoClockInOnLogin}
              onChange={() => handleToggle('autoClockInOnLogin')}
              disabled
            />
            <span />
          </Toggle>
        </SettingItem>

        <SettingItem>
          <SettingInfo>
            <SettingLabel>Auto Clock Out on Logout</SettingLabel>
            <SettingDescription>
              Automatically clock out users when they log out (no prompt shown)
            </SettingDescription>
          </SettingInfo>
          <Toggle>
            <input
              type="checkbox"
              checked={settings.autoClockOutOnLogout}
              onChange={() => handleToggle('autoClockOutOnLogout')}
              disabled
            />
            <span />
          </Toggle>
        </SettingItem>

        <SettingItem>
          <SettingInfo>
            <SettingLabel>Require Clock Out Before Clock In</SettingLabel>
            <SettingDescription>
              Prevent users from clocking in if they have an active clock in entry
            </SettingDescription>
          </SettingInfo>
          <Toggle>
            <input
              type="checkbox"
              checked={settings.requireClockOutBeforeClockIn}
              onChange={() => handleToggle('requireClockOutBeforeClockIn')}
              disabled
            />
            <span />
          </Toggle>
        </SettingItem>

        <SettingItem>
          <SettingInfo>
            <SettingLabel>Allow Manual Clock In/Out</SettingLabel>
            <SettingDescription>
              Allow users to manually clock in/out from the timesheet page
            </SettingDescription>
          </SettingInfo>
          <Toggle>
            <input
              type="checkbox"
              checked={settings.allowManualClockInOut}
              onChange={() => handleToggle('allowManualClockInOut')}
              disabled
            />
            <span />
          </Toggle>
        </SettingItem>

        <SettingItem>
          <SettingInfo>
            <SettingLabel>Enable Timesheet Editing</SettingLabel>
            <SettingDescription>
              Allow admins and managers to edit timesheet entries
            </SettingDescription>
          </SettingInfo>
          <Toggle>
            <input
              type="checkbox"
              checked={settings.enableTimesheetEditing}
              onChange={() => handleToggle('enableTimesheetEditing')}
              disabled
            />
            <span />
          </Toggle>
        </SettingItem>
      </SettingGroup>
    </Container>
  );
}

export default ClockInOutSettings;

