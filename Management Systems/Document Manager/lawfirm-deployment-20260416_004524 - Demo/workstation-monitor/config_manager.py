"""
Workstation Configuration Manager
Supports API key loading from multiple sources with priority:
1. Environment variable (most secure - recommended)
2. Config file (backward compatible)
3. No key (JWT token exchange will be attempted)
"""

import os
import json
import base64
from pathlib import Path
from typing import Optional

try:
    from cryptography.fernet import Fernet
    _CRYPTO_AVAILABLE = True
except ImportError:
    _CRYPTO_AVAILABLE = False


class ConfigManager:
    """Enhanced config manager with environment variable support"""
    
    # Priority order for API key lookup
    ENV_VAR_NAMES = [
        'LAWFIRM_API_KEY',           # Specific env var
        'WORKSTATION_API_KEY',        # Alternative name
        'API_KEY',                    # Generic
    ]
    
    @staticmethod
    def get_api_key_from_env() -> Optional[str]:
        """
        Get API key from environment variables in priority order
        
        Returns:
            API key if found, None otherwise
        """
        for env_var in ConfigManager.ENV_VAR_NAMES:
            key = os.getenv(env_var)
            if key and key.strip():
                print(f"✅ API key loaded from environment variable: {env_var}")
                return key.strip()
        
        return None
    
    @staticmethod
    def decrypt_api_key(value: Optional[str]) -> Optional[str]:
        """
        Decrypt API key if stored as fernet: or base64:; otherwise return as-is.
        Server expects the raw key in X-API-Key header. Decryption happens only
        in memory for building the request; config file remains encrypted at rest.
        Production: prefer LAWFIRM_API_KEY env var so the key is never in config.
        """
        if not value or not value.strip():
            return value
        value = value.strip()
        try:
            if value.startswith("fernet:"):
                if not _CRYPTO_AVAILABLE:
                    return value
                parts = value.split(":", 2)
                if len(parts) != 3:
                    return value
                key = base64.b64decode(parts[1])
                encrypted = base64.b64decode(parts[2])
                cipher = Fernet(key)
                return cipher.decrypt(encrypted).decode()
            if value.startswith("base64:"):
                encoded = value.replace("base64:", "", 1)
                return base64.b64decode(encoded).decode()
        except Exception:
            pass
        return value

    @staticmethod
    def get_api_key_from_config(config_file: Path) -> Optional[str]:
        """
        Get API key from config.json file (decrypted if stored as fernet/base64).
        
        Args:
            config_file: Path to config.json
            
        Returns:
            API key if found, None otherwise
        """
        try:
            if config_file.exists():
                with open(config_file, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                    key = config.get('api_key')
                    if key and key.strip():
                        print(f"⚠️  API key loaded from config file (less secure)")
                        raw = ConfigManager.decrypt_api_key(key.strip())
                        return raw if raw else key.strip()
        except Exception as e:
            print(f"Error reading config file: {e}")
        
        return None
    
    @staticmethod
    def get_api_key(config_file: Path) -> Optional[str]:
        """
        Get API key using priority: Environment > Config File > None
        
        Args:
            config_file: Path to config.json
            
        Returns:
            API key if found, None otherwise
        """
        # Priority 1: Environment variables (most secure)
        key = ConfigManager.get_api_key_from_env()
        if key:
            return key
        
        # Priority 2: Config file (backward compatible)
        key = ConfigManager.get_api_key_from_config(config_file)
        if key:
            return key
        
        # Priority 3: None found
        print("⚠️  No API key found. JWT token exchange will be attempted on startup.")
        return None
    
    @staticmethod
    def save_api_key_to_config(config_file: Path, api_key: str, save_to_file: bool = False) -> bool:
        """
        Save API key to config file (optional - environment variables are preferred)
        
        Args:
            config_file: Path to config.json
            api_key: API key to save
            save_to_file: If False (default), don't save to file (use env vars instead)
            
        Returns:
            True if successful, False otherwise
        """
        if not save_to_file:
            # Don't save to file - encourage environment variables instead
            print("ℹ️  Set environment variable LAWFIRM_API_KEY instead of saving to config")
            return True
        
        try:
            config = {}
            if config_file.exists():
                with open(config_file, 'r', encoding='utf-8') as f:
                    config = json.load(f)
            
            config['api_key'] = api_key
            
            with open(config_file, 'w', encoding='utf-8') as f:
                json.dump(config, f, indent=2)
            
            print(f"✅ API key saved to config.json")
            return True
        except Exception as e:
            print(f"❌ Error saving API key to config: {e}")
            return False


class Config:
    """Enhanced Config class with API key source priority"""
    
    def __init__(self):
        self.api_url = "https://localhost:5002/api"  # Use HTTPS by default
        self.api_key = None
        self.workstation_id = None
        self.monitored_folders = []
        self.virtual_drive_letter = None
        self.virtual_drive_path = None
        self.check_interval = 60
        self.virtual_drive_sync_interval = 60
        self.file_lock_check_interval = 10
        self.conflict_resolution = "server_wins"
        self.file_organizer_enabled = True
        self.file_organizer_scan_interval = 600
        self.file_organizer_confidence_threshold = 0.8
        self.file_organizer_max_text_length = 50000
        self.sync_delete_to_server = True
        
        self.config_file = Path(__file__).parent / "config.json"
        self.load()
    
    def load(self):
        """Load configuration with API key priority: Environment > Config File"""
        # Try to load from config file first
        if self.config_file.exists():
            try:
                with open(self.config_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.api_url = data.get('api_url', self.api_url)
                    self.workstation_id = data.get('workstation_id')
                    
                    folders = data.get('monitored_folders', [])
                    if isinstance(folders, list):
                        self.monitored_folders = folders
                    
                    self.virtual_drive_letter = data.get('virtual_drive_letter')
                    self.virtual_drive_path = data.get('virtual_drive_path')
                    self.check_interval = data.get('check_interval', 60)
                    self.virtual_drive_sync_interval = data.get('virtual_drive_sync_interval', 60)
                    self.file_lock_check_interval = data.get('file_lock_check_interval', 10)
                    self.conflict_resolution = data.get('conflict_resolution', 'server_wins')
                    self.file_organizer_enabled = data.get('file_organizer_enabled', True)
                    self.file_organizer_scan_interval = data.get('file_organizer_scan_interval', 600)
                    self.file_organizer_confidence_threshold = data.get('file_organizer_confidence_threshold', 0.8)
                    self.file_organizer_max_text_length = data.get('file_organizer_max_text_length', 50000)
                    self.sync_delete_to_server = data.get('sync_delete_to_server', True)
            except Exception as e:
                print(f"Error loading config: {e}")
        
        # Load API key with priority: Environment > Config File
        self.api_key = ConfigManager.get_api_key(self.config_file)
        
        if self.api_key and self.workstation_id:
            self.save()
    
    def save(self):
        """Save configuration to file (excludes API key - use environment variables)"""
        try:
            self.config_file.parent.mkdir(parents=True, exist_ok=True)
            
            # Read existing config to preserve API key preference
            config_data = {}
            if self.config_file.exists():
                try:
                    with open(self.config_file, 'r', encoding='utf-8') as f:
                        config_data = json.load(f)
                except:
                    pass
            
            # Update with current values (preserve API key from env if set)
            config_data.update({
                'api_url': self.api_url,
                'workstation_id': self.workstation_id,
                'monitored_folders': self.monitored_folders,
                'virtual_drive_letter': self.virtual_drive_letter,
                'virtual_drive_path': self.virtual_drive_path,
                'check_interval': self.check_interval,
                'virtual_drive_sync_interval': self.virtual_drive_sync_interval,
                'file_lock_check_interval': self.file_lock_check_interval,
                'conflict_resolution': self.conflict_resolution,
                'file_organizer_enabled': self.file_organizer_enabled,
                'file_organizer_scan_interval': self.file_organizer_scan_interval,
                'file_organizer_confidence_threshold': self.file_organizer_confidence_threshold,
                'file_organizer_max_text_length': self.file_organizer_max_text_length,
                'sync_delete_to_server': self.sync_delete_to_server,
            })
            
            # Note about API key
            config_data['_api_key_note'] = 'Use environment variable LAWFIRM_API_KEY instead of storing in config'
            
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(config_data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"Error saving config: {e}")
    
    def get_status(self):
        """Get configuration status"""
        api_key_source = "Environment Variable" if os.getenv('LAWFIRM_API_KEY') else "Config File"
        
        return {
            'api_url': self.api_url,
            'api_key_source': api_key_source,
            'api_key': f"{self.api_key[:20]}..." if self.api_key else None,
            'workstation_id': self.workstation_id,
            'workstation_configured': bool(self.workstation_id),
            'jwt_capable': True,  # All workstations can exchange key for JWT
        }
