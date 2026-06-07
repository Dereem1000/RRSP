"""
Law Firm Workstation Monitor - GUI Application
A Windows GUI application for monitoring folders and syncing documents.
"""

# Version information
WORKSTATION_VERSION = "2.2.0"
WORKSTATION_BUILD_DATE = "2026-04-15"

import os
import sys
import json
import time
import subprocess
import platform
import threading
import random
import hashlib
import base64
from pathlib import Path
from typing import List, Dict, Optional
from datetime import datetime
import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox, filedialog
import urllib.request
import tempfile
try:
    from cryptography.fernet import Fernet
    CRYPTO_AVAILABLE = True
except ImportError:
    CRYPTO_AVAILABLE = False
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from virtual_drive_sync import VirtualDriveSync
from main import Config, UPLOAD_STATE_FILE, CONFIG_MANAGER
from file_sync import is_word_temp_file

# System tray and notifications
try:
    import pystray
    from pystray import MenuItem as item
    from PIL import Image, ImageDraw
    import plyer
    SYSTEM_TRAY_AVAILABLE = True
except ImportError:
    SYSTEM_TRAY_AVAILABLE = False
    Config.log("System tray libraries not available. Install with: pip install pystray plyer Pillow")

# Process monitoring for single instance check
try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    PSUTIL_AVAILABLE = False
    Config.log("psutil not available. Single instance check disabled. Install with: pip install psutil")

# Windows API for bringing windows to front
if platform.system() == 'Windows':
    try:
        import ctypes
        from ctypes import wintypes
        
        # Windows API constants
        SW_RESTORE = 9
        SW_SHOW = 5
        HWND_TOP = 0
        SWP_NOMOVE = 0x0002
        SWP_NOSIZE = 0x0001
        SWP_SHOWWINDOW = 0x0040
        
        # Windows API functions
        user32 = ctypes.windll.user32
        kernel32 = ctypes.windll.kernel32
        
        def bring_window_to_front(process_handle):
            """Bring a window to front using Windows API"""
            try:
                # Get the main window handle of the process
                EnumWindows = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int))
                
                def enum_windows_callback(hwnd, lParam):
                    process_id = ctypes.c_ulong()
                    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(process_id))
                    if process_id.value == lParam:
                        # Found the window, bring it to front
                        user32.ShowWindow(hwnd, SW_RESTORE)
                        user32.SetForegroundWindow(hwnd)
                        user32.BringWindowToTop(hwnd)
                        return False
                    return True
                
                # Get process ID from handle
                process_id = kernel32.GetProcessId(process_handle)
                if process_id:
                    EnumWindowsProc = EnumWindows(enum_windows_callback)
                    user32.EnumWindows(EnumWindowsProc, process_id)
            except Exception as e:
                Config.log(f"Error bringing window to front: {e}")
        
        def bring_file_window_to_front(file_path: str, program_path: Optional[str] = None, process_id: Optional[int] = None):
            """Bring the window of an opened file to front"""
            try:
                # Wait a bit for the application to start
                time.sleep(0.8)
                
                # Get the filename to find the window
                file_name = os.path.basename(file_path)
                found_window = False
                
                # Try to find window by title containing the filename or by process ID
                EnumWindows = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int))
                
                def enum_windows_callback(hwnd, lParam):
                    nonlocal found_window
                    try:
                        # Check if window is visible
                        if not user32.IsWindowVisible(hwnd):
                            return True
                        
                        # Get process ID of window
                        window_process_id = ctypes.c_ulong()
                        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(window_process_id))
                        
                        # Check by process ID first (most reliable)
                        if process_id and window_process_id.value == process_id:
                            user32.ShowWindow(hwnd, SW_RESTORE)
                            user32.SetForegroundWindow(hwnd)
                            user32.BringWindowToTop(hwnd)
                            found_window = True
                            return False
                        
                        # Check by window title containing filename
                        length = user32.GetWindowTextLengthW(hwnd)
                        if length > 0:
                            buffer = ctypes.create_unicode_buffer(length + 1)
                            user32.GetWindowTextW(hwnd, buffer, length + 1)
                            window_title = buffer.value
                            
                            # Check if window title contains the filename
                            if file_name.lower() in window_title.lower():
                                user32.ShowWindow(hwnd, SW_RESTORE)
                                user32.SetForegroundWindow(hwnd)
                                user32.BringWindowToTop(hwnd)
                                found_window = True
                                return False
                    except:
                        pass
                    return True
                
                EnumWindowsProc = EnumWindows(enum_windows_callback)
                user32.EnumWindows(EnumWindowsProc, 0)
                
                # If not found by title/process, try to bring the foreground window (might be the one we just opened)
                if not found_window:
                    try:
                        hwnd = user32.GetForegroundWindow()
                        if hwnd:
                            user32.ShowWindow(hwnd, SW_RESTORE)
                            user32.SetForegroundWindow(hwnd)
                            user32.BringWindowToTop(hwnd)
                    except:
                        pass
            except Exception as e:
                Config.log(f"Error bringing file window to front: {e}")
    except ImportError:
        # ctypes not available, use fallback method
        def bring_window_to_front(process_handle):
            pass
        
        def bring_file_window_to_front(file_path: str, program_path: Optional[str] = None, process_id: Optional[int] = None):
            pass
else:
    # Non-Windows systems
    def bring_window_to_front(process_handle):
        pass
    
    def bring_file_window_to_front(file_path: str, program_path: Optional[str] = None, process_id: Optional[int] = None):
        pass

# Configuration
# When running as PyInstaller executable, use the executable's directory instead of __file__
if getattr(sys, '_MEIPASS', None):
    # Running as PyInstaller executable - use the executable's directory
    exe_dir = Path(sys.executable).parent
    CONFIG_FILE = exe_dir / 'config.json'
    LOG_FILE = exe_dir / 'monitor.log'
else:
    # Running as Python script - use the script's directory
    CONFIG_FILE = Path(__file__).parent / 'config.json'
    LOG_FILE = Path(__file__).parent / 'monitor.log'


class Config:
    def __init__(self):
        self.api_url = "http://localhost:5002/api"
        self.api_key = None
        self.workstation_id = None
        self.workstation_name = None  # Display name (persisted so "Connect & Load" doesn't overwrite it when server differs)
        self.monitored_folders: List[str] = []
        self.virtual_drive_letter = None
        self.virtual_drive_path = None
        self.check_interval = 60  # seconds
        self.virtual_drive_sync_interval = 60  # seconds
        self.file_lock_check_interval = 10  # seconds
        self.conflict_resolution = "server_wins"
        # Default programs for file extensions (extension -> program path)
        self.default_programs: Dict[str, str] = {}
        # Notification settings
        self.enable_notifications = True
        self.notification_level = "important"  # "all", "important", "errors_only"
        # Sync deletion settings
        self.sync_delete_to_server = True  # Enable/disable manual deletion sync
        self.load()
    
    def load(self):
        if CONFIG_FILE.exists():
            try:
                with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.api_url = data.get('api_url', self.api_url)
                    self.api_key = data.get('api_key')
                    self.workstation_id = data.get('workstation_id')
                    self.workstation_name = data.get('workstation_name')
                    self.monitored_folders = data.get('monitored_folders', [])
                    self.virtual_drive_letter = data.get('virtual_drive_letter')
                    self.virtual_drive_path = data.get('virtual_drive_path')
                    self.check_interval = data.get('check_interval', 60)
                    self.virtual_drive_sync_interval = data.get('virtual_drive_sync_interval', 60)
                    self.file_lock_check_interval = data.get('file_lock_check_interval', 10)
                    self.conflict_resolution = data.get('conflict_resolution', 'server_wins')
                    self.default_programs = data.get('default_programs', {})
                    self.enable_notifications = data.get('enable_notifications', True)
                    self.notification_level = data.get('notification_level', 'important')
                    self.sync_delete_to_server = data.get('sync_delete_to_server', True)
                    self.log(f"Configuration loaded from {CONFIG_FILE}")
            except json.JSONDecodeError as e:
                self.log(f"Error parsing config file (invalid JSON): {e}")
                # Backup corrupted config
                backup_file = CONFIG_FILE.with_suffix('.json.bak')
                try:
                    import shutil
                    shutil.copy2(CONFIG_FILE, backup_file)
                    self.log(f"Backup saved to {backup_file}")
                except:
                    pass
            except Exception as e:
                self.log(f"Error loading config: {e}")
        else:
            self.log(f"Config file not found at {CONFIG_FILE}, using defaults")
    
    def save(self):
        try:
            # Ensure directory exists
            CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
            
            with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
                json.dump({
                    'api_url': self.api_url,
                    'api_key': self.api_key,
                    'workstation_id': self.workstation_id,
                    'workstation_name': self.workstation_name,
                    'monitored_folders': self.monitored_folders,
                    'virtual_drive_letter': self.virtual_drive_letter,
                    'virtual_drive_path': self.virtual_drive_path,
                    'check_interval': self.check_interval,
                    'virtual_drive_sync_interval': self.virtual_drive_sync_interval,
                    'file_lock_check_interval': self.file_lock_check_interval,
                    'conflict_resolution': self.conflict_resolution,
                    'default_programs': self.default_programs,
                    'enable_notifications': self.enable_notifications,
                    'notification_level': self.notification_level,
                    'sync_delete_to_server': self.sync_delete_to_server,
                }, f, indent=2, ensure_ascii=False)
            self.log(f"Configuration saved to {CONFIG_FILE}")
        except Exception as e:
            self.log(f"Error saving config: {e}")
            import traceback
            self.log(traceback.format_exc())
    
    @staticmethod
    def log(message: str):
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        log_message = f"[{timestamp}] {message}"
        print(log_message)
        try:
            with open(LOG_FILE, 'a') as f:
                f.write(log_message + '\n')
        except:
            pass


# Encryption utilities for API key storage (defined after Config class)
class APIKeyEncryption:
    """Simple encryption/decryption for API keys in config file"""
    
    @staticmethod
    def _get_machine_key():
        """Generate a machine-specific key from hostname and os"""
        machine_id = f"{platform.node()}-{sys.platform}"
        return hashlib.sha256(machine_id.encode()).digest()[:32]
    
    @staticmethod
    def encrypt_key(api_key):
        """Encrypt API key for storage in config.json"""
        if not api_key:
            return None
        
        try:
            if CRYPTO_AVAILABLE:
                # Use cryptography library if available
                key = Fernet.generate_key()
                cipher = Fernet(key)
                encrypted = cipher.encrypt(api_key.encode())
                # Return both key and encrypted data as base64
                return f"fernet:{base64.b64encode(key).decode()}:{base64.b64encode(encrypted).decode()}"
            else:
                # Fallback: simple base64 encoding (better than plain text)
                # In production, this would be replaced with cryptography
                return f"base64:{base64.b64encode(api_key.encode()).decode()}"
        except Exception as e:
            Config.log(f"Error encrypting API key: {e}")
            return None
    
    @staticmethod
    def decrypt_key(encrypted_data):
        """Decrypt API key from config.json"""
        if not encrypted_data:
            return None
        
        try:
            if encrypted_data.startswith("fernet:"):
                # Decrypt using cryptography
                parts = encrypted_data.split(":", 2)
                if len(parts) != 3:
                    return None
                key = base64.b64decode(parts[1])
                encrypted = base64.b64decode(parts[2])
                cipher = Fernet(key)
                return cipher.decrypt(encrypted).decode()
            elif encrypted_data.startswith("base64:"):
                # Fallback: simple base64 decoding
                encoded = encrypted_data.replace("base64:", "", 1)
                return base64.b64decode(encoded).decode()
            else:
                # Legacy: plain text (no prefix) - for backward compatibility
                return encrypted_data
        except Exception as e:
            Config.log(f"Error decrypting API key: {e}")
            return None


class WorkstationAPI:
    def __init__(self, config: Config):
        self.config = config
        self.session = requests.Session()
        retry_strategy = Retry(
            total=5,  # Increased retries for better handling of rate limits
            backoff_factor=2,  # Longer exponential backoff: 2s, 4s, 8s, 16s, 32s
            status_forcelist=[429, 500, 502, 503, 504],
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)
    
    def _headers(self) -> Dict[str, str]:
        headers = {'Content-Type': 'application/json'}
        # Prefer environment so "Load configuration" uses the key just verified (even if not saved yet)
        key = os.environ.get('LAWFIRM_API_KEY') or os.environ.get('WORKSTATION_API_KEY') or os.environ.get('API_KEY')
        if (not key or (isinstance(key, str) and not key.strip())) and self.config.api_key:
            raw = self.config.api_key
            if raw.startswith(('fernet:', 'base64:')):
                key = APIKeyEncryption.decrypt_key(raw)
                if not key or (isinstance(key, str) and key.startswith(('fernet:', 'base64:'))):
                    Config.log("API key decryption failed or returned invalid value; re-enter key in Settings and save.")
                    key = None
            else:
                key = raw.strip() if isinstance(raw, str) else None
        if key and isinstance(key, str):
            key = key.strip()
        if key:
            headers['X-API-Key'] = key
        return headers
    
    def register(self, name: str, computer_name: str, monitored_folders: List[str], 
                 virtual_drive_letter: Optional[str] = None, 
                 virtual_drive_path: Optional[str] = None) -> Dict:
        try:
            response = self.session.post(
                f"{self.config.api_url}/workstations/register",
                json={
                    'name': name,
                    'computerName': computer_name,
                    'monitoredFolders': monitored_folders,
                    'virtualDriveLetter': virtual_drive_letter,
                    'virtualDrivePath': virtual_drive_path,
                },
                headers={'Content-Type': 'application/json'},
                timeout=10
            )
            response.raise_for_status()
            data = response.json()
            self.config.api_key = data.get('apiKey')
            self.config.workstation_id = data.get('id')
            self.config.save()
            return data
        except Exception as e:
            Config.log(f"Registration error: {e}")
            raise
    
    def heartbeat(self) -> bool:
        try:
            response = self.session.post(
                f"{self.config.api_url}/workstations/heartbeat",
                headers=self._headers(),
                timeout=5
            )
            response.raise_for_status()
            return True
        except Exception as e:
            Config.log(f"Heartbeat error: {e}")
            return False
    
    def get_config(self) -> Dict:
        """Get workstation configuration from server"""
        try:
            response = self.session.get(
                f"{self.config.api_url}/workstation-sync/config",
                headers=self._headers(),
                timeout=10
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            Config.log(f"Get config error: {e}")
            raise
    
    def search_client(self, client_name: str) -> Dict:
        try:
            response = self.session.post(
                f"{self.config.api_url}/workstation-sync/search-client",
                json={'clientName': client_name},
                headers=self._headers(),
                timeout=10
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            Config.log(f"Search client error: {e}")
            return {'clients': [], 'found': False}
    
    def create_pending_request(self, client_name: str, folder_path: str, document_count: int = 0) -> Dict:
        try:
            response = self.session.post(
                f"{self.config.api_url}/workstation-sync/pending-client-request",
                json={
                    'clientName': client_name,
                    'folderPath': folder_path,
                    'documentCount': document_count,
                },
                headers=self._headers(),
                timeout=10
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            Config.log(f"Create pending request error: {e}")
            raise
    
    def check_for_updates(self) -> Dict:
        """Check if there's a newer version available"""
        try:
            response = self.session.get(
                f"{self.config.api_url}/workstation-sync/version-check",
                headers=self._headers(),
                params={'current_version': WORKSTATION_VERSION},
                timeout=10
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            Config.log(f"Version check error: {e}")
            return {'update_available': False}

    def get_open_requests(self) -> Dict:
        """Get pending file open requests from server"""
        try:
            response = self.session.get(
                f"{self.config.api_url}/workstation-sync/open-requests",
                headers=self._headers(),
                timeout=5
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            Config.log(f"Get open requests error: {e}")
            return {'requests': []}
    
    def acquire_file_lock(self, document_id: int, duration: Optional[int] = None) -> bool:
        """Acquire a lock on a file (workstation lock)"""
        try:
            data = {}
            if duration:
                data['duration'] = duration
            
            # Use workstation-sync endpoint for workstation locks
            response = self.session.post(
                f"{self.config.api_url}/workstation-sync/documents/{document_id}/lock",
                headers=self._headers(),
                json=data,
                timeout=10
            )
            
            if response.status_code == 409:
                # Already locked - get details from error message
                try:
                    error_data = response.json()
                    error_msg = error_data.get('error', 'File is already locked')
                    Config.log(f"Lock acquisition failed: {error_msg}")
                except:
                    pass
                return False
            
            response.raise_for_status()
            return True
        except requests.exceptions.RequestException as e:
            Config.log(f"Error acquiring lock for document {document_id}: {e}")
            return False
        except Exception as e:
            Config.log(f"Unexpected error acquiring lock for document {document_id}: {e}")
            return False
    
    def release_file_lock(self, document_id: int) -> bool:
        """Release a lock on a file"""
        try:
            response = self.session.delete(
                f"{self.config.api_url}/workstation-sync/documents/{document_id}/lock",
                headers=self._headers(),
                timeout=10
            )
            response.raise_for_status()
            return True
        except Exception as e:
            Config.log(f"Error releasing lock for document {document_id}: {e}")
            return False
    
    def get_all_locks_for_workstation(self) -> List[Dict]:
        """Get all locks held by this workstation from the server"""
        try:
            # Get all documents and check which ones are locked by this workstation
            response = self.session.get(
                f"{self.config.api_url}/workstation-sync/sync/all",
                headers=self._headers(),
                timeout=30
            )
            response.raise_for_status()
            data = response.json()
            documents = data.get('documents', [])
            
            # Filter documents locked by this workstation
            locked_docs = []
            for doc in documents:
                lock_status = doc.get('lockStatus', {})
                if lock_status.get('isLocked') and lock_status.get('lockedByType') == 'workstation':
                    # Check if locked by this workstation (lockedBy should be workstation_id)
                    locked_by = lock_status.get('lockedBy')
                    if locked_by and int(locked_by) == int(self.config.workstation_id):
                        locked_docs.append({
                            'id': doc['id'],
                            'fileName': doc.get('fileName', ''),
                            'title': doc.get('title', '')
                        })
            
            return locked_docs
        except Exception as e:
            Config.log(f"Error getting locks for workstation: {e}")
            return []
    
    def update_config(self, monitored_folders: List[str] = None, 
                     virtual_drive_letter: Optional[str] = None,
                     virtual_drive_path: Optional[str] = None,
                     sync_delete_to_server: Optional[bool] = None) -> Dict:
        """Update workstation configuration on server"""
        try:
            payload = {}
            if monitored_folders is not None:
                payload['monitoredFolders'] = monitored_folders
            if virtual_drive_letter is not None:
                payload['virtualDriveLetter'] = virtual_drive_letter
            if virtual_drive_path is not None:
                payload['virtualDrivePath'] = virtual_drive_path
            if sync_delete_to_server is not None:
                payload['syncDeleteToServer'] = sync_delete_to_server
            
            if not payload:
                return {'success': True, 'message': 'No changes to update'}
            
            response = self.session.put(
                f"{self.config.api_url}/workstation-sync/config",
                json=payload,
                headers=self._headers(),
                timeout=10
            )
            response.raise_for_status()
            data = response.json()
            
            # Update local config with server response
            if 'monitoredFolders' in data:
                self.config.monitored_folders = data.get('monitoredFolders', [])
            if 'virtualDriveLetter' in data:
                self.config.virtual_drive_letter = data.get('virtualDriveLetter')
            if 'virtualDrivePath' in data:
                self.config.virtual_drive_path = data.get('virtualDrivePath')
            if 'syncDeleteToServer' in data:
                self.config.sync_delete_to_server = bool(data.get('syncDeleteToServer'))
            self.config.save()
            
            return data
        except Exception as e:
            Config.log(f"Update config error: {e}")
            raise
    
    def upload_document(self, file_path: str, client_id: int, title: str, 
                       description: Optional[str] = None, case_id: Optional[int] = None) -> Dict:
        try:
            with open(file_path, 'rb') as f:
                files = {'file': (os.path.basename(file_path), f)}
                data = {
                    'title': title,
                    'clientId': str(client_id),
                    'description': description or '',
                }
                if case_id:
                    data['caseId'] = str(case_id)
                
                headers = self._headers()
                headers.pop('Content-Type', None)
                
                response = self.session.post(
                    f"{self.config.api_url}/workstation-sync/upload-document",
                    files=files,
                    data=data,
                    headers=headers,
                    timeout=30
                )
                response.raise_for_status()
                result = response.json()
                # Return result even if skipped (status 200 with skipped flag)
                return result
        except Exception as e:
            Config.log(f"Upload document error: {e}")
            raise

    def check_documents_exist(self, client_id: int, file_names: list) -> list:
        """Return list of filenames (lowercase) that exist on server for this client. Used to reconcile upload state."""
        try:
            response = self.session.post(
                f"{self.config.api_url}/workstation-sync/check-documents-exist",
                json={'clientId': client_id, 'fileNames': file_names},
                headers=self._headers(),
                timeout=10
            )
            response.raise_for_status()
            data = response.json()
            return list(data.get('existingFileNames') or [])
        except Exception as e:
            Config.log(f"Check documents exist error: {e}")
            return []  # On error, assume none exist so we may re-upload (safe)

    def get_pending_delete_set(self) -> set:
        """Return set of (client_id, filename_lower) that are pending delete for this workstation. Used to skip re-upload."""
        try:
            response = self.session.get(
                f"{self.config.api_url}/workstation-sync/pending-delete-list",
                headers=self._headers(),
                timeout=10,
            )
            response.raise_for_status()
            data = response.json()
            items = data.get('items') or []
            return {(int(i['clientId']), (i.get('fileName') or '').lower()) for i in items}
        except Exception as e:
            Config.log(f"Pending delete list error: {e}")
            return set()

    def clear_pending_delete(self, client_id: int, filename: str) -> bool:
        """Clear a pending-delete record when the file was removed from the monitored folder."""
        try:
            response = self.session.post(
                f"{self.config.api_url}/workstation-sync/pending-delete/clear",
                json={'clientId': client_id, 'fileName': filename},
                headers=self._headers(),
                timeout=10,
            )
            response.raise_for_status()
            data = response.json()
            if data.get('cleared', 0) > 0:
                Config.log(f"Cleared pending delete (file removed from folder): {filename}")
            return True
        except Exception as e:
            Config.log(f"Clear pending delete error: {e}")
            return False

    def delete_document(self, client_id: int, filename: str) -> Dict:
        """Delete document from server by client ID and filename"""
        if not self.config.sync_delete_to_server:
            return {'success': False, 'error': 'Sync delete to server is disabled'}
        try:
            # Use workstation-sync DELETE endpoint that accepts API key
            response = self.session.delete(
                f"{self.config.api_url}/workstation-sync/documents",
                params={
                    'clientId': client_id,
                    'filename': filename
                },
                headers=self._headers(),
                timeout=10,
            )
            response.raise_for_status()
            result = response.json()
            Config.log(f"✓ Deleted document from server: {filename} (ID: {result.get('documentId')})")
            return {'success': True, 'documentId': result.get('documentId')}
        except Exception as e:
            Config.log(f"Delete document error: {e}")
            return {'success': False, 'error': str(e)}


class FolderMonitor(FileSystemEventHandler):
    def __init__(self, api: WorkstationAPI, config: Config, log_callback=None):
        self.api = api
        self.config = config
        self.processed_folders = set()
        self.log_callback = log_callback
        self.upload_state: Dict[str, Dict] = {}  # Track uploaded files: key = f"{client_id}:{filename}", value = {hash, lastUploaded}
        self.pending_deletions: Dict[str, float] = {}  # Track pending deletions: path -> timestamp
        self.load_upload_state()
    
    def log(self, message: str):
        if self.log_callback:
            self.log_callback(message)
        else:
            Config.log(message)
    
    def calculate_file_hash(self, file_path: Path) -> str:
        """Calculate SHA256 hash of file"""
        hash_sha256 = hashlib.sha256()
        try:
            with open(file_path, 'rb') as f:
                for chunk in iter(lambda: f.read(4096), b""):
                    hash_sha256.update(chunk)
            return hash_sha256.hexdigest()
        except Exception as e:
            self.log(f"Error calculating hash for {file_path}: {e}")
            return ""
    
    def load_upload_state(self):
        """Load upload state from file"""
        if UPLOAD_STATE_FILE.exists():
            try:
                with open(UPLOAD_STATE_FILE, 'r') as f:
                    data = json.load(f)
                    self.upload_state = data.get('files', {})
            except Exception as e:
                self.log(f"Error loading upload state: {e}")
                self.upload_state = {}
        else:
            self.upload_state = {}
    
    def save_upload_state(self):
        """Save upload state to file"""
        try:
            with open(UPLOAD_STATE_FILE, 'w') as f:
                json.dump({
                    'files': self.upload_state,
                    'lastUpdated': time.time()
                }, f, indent=2)
        except Exception as e:
            self.log(f"Error saving upload state: {e}")
    
    def is_file_already_uploaded(self, file_path: Path, client_id: int, filename: str) -> bool:
        """Check if file was already uploaded with same content"""
        # Calculate current file hash
        current_hash = self.calculate_file_hash(file_path)
        if not current_hash:
            return False  # Can't verify, allow upload
        
        # Check upload state
        state_key = f"{client_id}:{filename.lower()}"
        stored_state = self.upload_state.get(state_key, {})
        stored_hash = stored_state.get('hash', '')
        stored_path = stored_state.get('path', '')
        
        # If hash matches and file path matches, file was already uploaded
        if current_hash == stored_hash and stored_path == str(file_path):
            return True
        
        return False
    
    def mark_file_uploaded(self, file_path: Path, client_id: int, filename: str, file_hash: str):
        """Mark file as uploaded in state"""
        state_key = f"{client_id}:{filename.lower()}"
        self.upload_state[state_key] = {
            'hash': file_hash,
            'path': str(file_path),
            'lastUploaded': time.time()
        }
        self.save_upload_state()

    def clear_upload_state_for_file(self, client_id: int, filename: str):
        """Clear 'already uploaded' state for one file so it will be re-uploaded (e.g. after server reconciliation)."""
        state_key = f"{client_id}:{filename.lower()}"
        if state_key in self.upload_state:
            del self.upload_state[state_key]
            self.save_upload_state()
    
    def on_created(self, event):
        if event.is_directory:
            self.process_folder(event.src_path)
    
    def on_modified(self, event):
        if event.is_directory:
            self.process_folder(event.src_path)
        else:
            # File was modified - check if it's an existing document that needs to be synced
            self.handle_file_modification(event.src_path)
    
    def on_deleted(self, event):
        """Handle file/folder deletion - sync deletion to server"""
        # Skip if feature is disabled
        if not self.config.sync_delete_to_server:
            return
        
        # Skip if it's a directory or Word temp file
        if event.is_directory:
            return
        
        deleted_path = Path(event.src_path)
        if is_word_temp_file(deleted_path):
            return
        
        try:
            # Check if the deleted file was in a monitored folder
            is_monitored = False
            for monitored in self.config.monitored_folders:
                try:
                    if deleted_path.resolve().is_relative_to(Path(monitored).resolve()):
                        is_monitored = True
                        break
                except:
                    pass
            
            if not is_monitored:
                return
            
            # Add to pending deletions with current timestamp
            # Wait 2 seconds to see if file is recreated (indicating save operation)
            file_key = str(deleted_path)
            self.pending_deletions[file_key] = time.time()
            
            # Schedule delayed check
            import threading
            threading.Timer(2.0, self._process_pending_deletion, args=(file_key,)).start()
        
        except Exception as e:
            self.log(f"Error handling file deletion: {e}")
    
    def _process_pending_deletion(self, file_key: str):
        """Process a pending deletion after grace period"""
        try:
            # Re-check setting in case user disabled sync delete during grace period
            if not self.config.sync_delete_to_server:
                if file_key in self.pending_deletions:
                    del self.pending_deletions[file_key]
                return
            # Check if this deletion is still pending
            if file_key not in self.pending_deletions:
                return  # Already processed or cancelled
            
            deleted_path = Path(file_key)
            
            # Check if file was recreated (save operation, not deletion)
            if deleted_path.exists():
                self.log(f"ℹ️  File recreated (save operation): {deleted_path.name}")
                del self.pending_deletions[file_key]
                return
            
            # File is still deleted after grace period - process as actual deletion
            del self.pending_deletions[file_key]
            
            # Extract client name from folder structure
            filename = deleted_path.name
            client_folder = deleted_path.parent
            client_name = client_folder.name
            
            self.log(f"🗑️ File deleted manually: {filename} from client folder: {client_name}")
            
            # Search for client to get client ID
            search_result = self.api.search_client(client_name)
            
            if search_result.get('found') and search_result.get('clients'):
                clients = search_result['clients']
                client_id = clients[0]['id']
                
                self.log(f"Processing deletion for client: {clients[0]['fullName']} (ID: {client_id})")
                
                # Delete from server (this will also delete from virtual drive and all monitored folders)
                result = self.api.delete_document(client_id, filename)
                
                if result.get('success'):
                    self.log(f"✅ Document deletion synced to server: {filename}")
                    
                    # Remove from upload state
                    state_key = f"{client_id}:{filename.lower()}"
                    if state_key in self.upload_state:
                        del self.upload_state[state_key]
                        self.save_upload_state()
                else:
                    self.log(f"⚠️ Failed to sync deletion to server: {result.get('error', 'Unknown error')}")
            else:
                self.log(f"⚠️ Client not found for deleted file: {client_name}")
        
        except Exception as e:
            self.log(f"Error processing pending deletion: {e}")
    
    def handle_file_modification(self, file_path_str: str):
        """Handle file modification in monitored folder - upload if newer and not locked"""
        try:
            file_path = Path(file_path_str)
            if not file_path.is_file():
                return
            
            # Find which client folder this file belongs to
            client_folder = None
            client_name = None
            for monitored_folder in self.config.monitored_folders:
                monitored_path = Path(monitored_folder)
                try:
                    if file_path.resolve().is_relative_to(monitored_path.resolve()):
                        client_folder = file_path.parent
                        client_name = client_folder.name
                        break
                except:
                    continue
            
            if not client_name or not client_folder:
                return
            
            # Search for client
            search_result = self.api.search_client(client_name)
            if not search_result.get('found') or not search_result.get('clients'):
                # Try title case
                title_case = client_name.title()
                if title_case != client_name:
                    search_result = self.api.search_client(title_case)
            
            if not search_result.get('found') or not search_result.get('clients'):
                return
            
            client_id = search_result['clients'][0]['id']
            filename = file_path.name
            
            # Check upload state first - if file was just uploaded and hasn't changed, skip
            if self.is_file_already_uploaded(file_path, client_id, filename):
                # File was already uploaded with same content, skip
                return
            
            # Get document info from server to check if it exists and get lock status
            try:
                # Get all documents for this client
                response = self.api.session.get(
                    f"{self.api.config.api_url}/workstation-sync/sync/all",
                    headers=self.api._headers(),
                    timeout=30
                )
                response.raise_for_status()
                data = response.json()
                documents = data.get('documents', [])
                
                # Find matching document
                matching_doc = None
                for doc in documents:
                    if doc['clientId'] == client_id and doc['fileName'] == filename:
                        matching_doc = doc
                        break
                
                if not matching_doc:
                    # File doesn't exist in system yet, will be handled by process_folder
                    return
                
                # Check if file is locked
                lock_status = matching_doc.get('lockStatus', {})
                if lock_status.get('isLocked'):
                    self.log(f"File {filename} is locked, skipping auto-upload")
                    return
                
                # Calculate file hash to check if it's newer
                local_hash = self.calculate_file_hash(file_path)
                if not local_hash:
                    # Can't calculate hash, skip to avoid errors
                    return
                
                server_hash = matching_doc.get('syncHash', '')
                
                # If hashes are the same, file hasn't actually changed
                if local_hash == server_hash:
                    # Mark as uploaded in state since server already has this version
                    self.mark_file_uploaded(file_path, client_id, filename, local_hash)
                    return
                
                # File is newer and not locked - upload it
                self.log(f"Auto-uploading modified file: {filename} (newer than server version)")
                
                # Use sync endpoint to update existing document
                document_id = matching_doc['id']
                with open(file_path, 'rb') as f:
                    files = {'file': (filename, f, 'application/octet-stream')}
                    data = {'syncHash': local_hash}
                    headers = self.api._headers()
                    headers.pop('Content-Type', None)
                    
                    sync_response = self.api.session.post(
                        f"{self.api.config.api_url}/workstation-sync/sync/{document_id}",
                        files=files,
                        data=data,
                        headers=headers,
                        timeout=60
                    )
                    
                    if sync_response.status_code == 403:
                        self.log(f"File {filename} is locked, cannot upload")
                    elif sync_response.status_code == 409:
                        self.log(f"Conflict: Server has newer version of {filename}, skipping upload")
                    else:
                        sync_response.raise_for_status()
                        self.log(f"✓ Successfully uploaded modified file: {filename}")
                        # Mark as uploaded in local state
                        self.mark_file_uploaded(file_path, client_id, filename, local_hash)
                        
            except Exception as e:
                self.log(f"Error auto-uploading modified file {filename}: {e}")
                
        except Exception as e:
            self.log(f"Error handling file modification: {e}")
    
    def process_folder(self, folder_path: str):
        try:
            folder = Path(folder_path)
            if not folder.is_dir():
                return
            
            if folder_path in self.processed_folders:
                return
            
            is_monitored = False
            for monitored in self.config.monitored_folders:
                try:
                    if folder.resolve().is_relative_to(Path(monitored).resolve()):
                        is_monitored = True
                        break
                except:
                    pass
            
            if not is_monitored:
                return
            
            client_name = folder.name
            documents = self.find_documents(folder)
            
            if documents:
                self.handle_client_folder(client_name, folder_path, documents)
                self.processed_folders.add(folder_path)
        except Exception as e:
            self.log(f"Error processing folder {folder_path}: {e}")
    
    def find_documents(self, folder: Path) -> List[Path]:
        """Find document files in folder recursively"""
        documents = []
        allowed_extensions = {".pdf", ".doc", ".docx", ".txt", ".jpg", ".jpeg", ".png"}

        try:
            # RECURSIVE SEARCH - DO NOT MODIFY THIS CODE
            # This enables finding documents in subfolders
            for item in folder.rglob("*"):
                if item.is_file() and item.suffix.lower() in allowed_extensions:
                    # Skip Word temporary files
                    if is_word_temp_file(item):
                        continue
                    documents.append(item)
        except PermissionError:
            pass

        return documents
    
    def handle_client_folder(self, client_name: str, folder_path: str, documents: List[Path]):
        self.log(f"Found client folder: {client_name} at {folder_path}")
        self.log(f"Documents found: {len(documents)}")

        # Search for client - try multiple variations with better error handling
        self.log(f"🔍 Searching for client: '{client_name}'")
        client_found = False
        client_id = None
        client_data = None

        try:
            search_result = self.api.search_client(client_name)
            self.log(f"Search result: found={search_result.get('found')}, clients={len(search_result.get('clients', []))}")

            if search_result.get('found') and search_result.get('clients'):
                client_data = search_result['clients'][0]
                client_id = client_data['id']
                client_found = True
                self.log(f"✅ Client found: {client_data['fullName']} (ID: {client_id})")
            else:
                # If not found, try with different case variations
                title_case = client_name.title()
                if title_case != client_name:
                    self.log(f"🔄 Trying title case: {title_case}")
                    search_result = self.api.search_client(title_case)
                    self.log(f"Title case search result: found={search_result.get('found')}, clients={len(search_result.get('clients', []))}")

                    if search_result.get('found') and search_result.get('clients'):
                        client_data = search_result['clients'][0]
                        client_id = client_data['id']
                        client_found = True
                        self.log(f"✅ Client found with title case: {client_data['fullName']} (ID: {client_id})")

                # Try lowercase as final fallback
                if not client_found:
                    lower_case = client_name.lower()
                    if lower_case != client_name and lower_case != title_case.lower():
                        self.log(f"🔄 Trying lowercase: {lower_case}")
                        # Note: This is just for logging, the actual search handles case insensitivity
        except Exception as search_error:
            self.log(f"⚠️ Client search failed: {search_error}")
            # Continue with pending request creation as fallback

        if client_found and client_id:
            self.log(f"📤 Uploading {len(documents)} document(s) to client {client_data['fullName']}...")
            self.upload_documents_to_client(client_id, client_data['fullName'], documents)
        else:
            # Client not found - create pending request
            self.log(f"❌ Client not found for folder name '{client_name}', creating pending request")
            try:
                result = self.api.create_pending_request(client_name, folder_path, len(documents))
                self.log(f"✅ Pending request created for: {client_name} (ID: {result.get('id', 'unknown')})")

                # Show notification for pending request
                if hasattr(self, 'gui_app') and self.gui_app:
                    self.gui_app.show_notification(
                        "Pending Client Request",
                        f"Created request for client '{client_name}' with {len(documents)} documents",
                        level="info"
                    )
            except Exception as e:
                self.log(f"❌ Failed to create pending request for {client_name}: {e}")

    def upload_documents_to_client(self, client_id: int, client_name: str, documents: List[Path]):
        """Upload documents to a specific client"""
        uploaded_count = 0
        skipped_count = 0
        rate_limited_count = 0

        # Reconcile with server: if we think a file is "already uploaded" but server doesn't have it, clear state so we re-upload
        # Unless sync delete is off and this file is pending delete (preserved on workstation) — then do not re-upload
        pending_delete_set = set()
        try:
            file_names = [p.name for p in documents]
            existing_on_server = self.api.check_documents_exist(client_id, file_names)
            existing_set = set(existing_on_server)
            pending_delete_set = self.api.get_pending_delete_set() if not self.config.sync_delete_to_server else set()
            for doc_path in documents:
                if self.is_file_already_uploaded(doc_path, client_id, doc_path.name):
                    if doc_path.name.lower() not in existing_set:
                        key = (client_id, doc_path.name.lower())
                        if key in pending_delete_set:
                            self.log(f"⏸ Preserved (pending delete), sync paused: {doc_path.name}")
                            continue
                        self.log(f"🔄 Server missing document (reconciling): {doc_path.name} — will re-upload")
                        self.clear_upload_state_for_file(client_id, doc_path.name)
        except Exception as e:
            self.log(f"Reconcile with server (check-documents-exist) failed: {e} — continuing with local state")

        # If user removed a pending-delete file from the monitored folder, clear it on the server so UI stops showing "Pending delete"
        if not self.config.sync_delete_to_server and pending_delete_set:
            current_lower = {p.name.lower() for p in documents}
            for (cid, fname_lower) in pending_delete_set:
                if cid == client_id and fname_lower not in current_lower:
                    self.api.clear_pending_delete(client_id, fname_lower)

        # RATE LIMITING LOGIC - DO NOT MODIFY
        # This prevents 429 errors and enables smooth uploads
        for i, doc_path in enumerate(documents):
            try:
                # Check if file was already uploaded with same content
                if self.is_file_already_uploaded(doc_path, client_id, doc_path.name):
                    self.log(f"⊘ Skipped (already uploaded): {doc_path.name}")
                    skipped_count += 1
                    continue
                # Skip upload if this file is pending delete (server deleted, we preserved; sync paused)
                # Only treat as pending delete if: (1) already in pending_delete_set, OR (2) was previously uploaded (in upload_state) but now missing on server
                if not self.config.sync_delete_to_server:
                    # Check if already in pending_delete_set
                    if (client_id, doc_path.name.lower()) in pending_delete_set:
                        self.log(f"⏸ Preserved (pending delete), sync paused: {doc_path.name}")
                        skipped_count += 1
                        continue
                    # If file was previously uploaded (in upload_state) but is now missing on server, treat as pending delete (sync paused)
                    # This catches files that were synced from server, then deleted on server, before sync_from_server reports pending delete
                    # Don't treat NEW files (never uploaded) as pending delete - they should upload normally
                    if self.is_file_already_uploaded(doc_path, client_id, doc_path.name) and doc_path.name.lower() not in existing_set:
                        # File was uploaded before but is now missing on server - report as pending delete and skip upload (sync paused)
                        try:
                            self.api.session.post(
                                f"{self.config.api_url}/workstation-sync/pending-delete",
                                json={"clientName": client_name, "fileName": doc_path.name},
                                headers=self.api._headers(),
                                timeout=10
                            )
                            self.log(f"⏸ Reported as pending delete (was uploaded, now missing on server, sync paused): {doc_path.name}")
                        except Exception as e:
                            self.log(f"Could not report pending delete for {doc_path.name}: {e}")
                        skipped_count += 1
                        continue
                title = doc_path.stem
                result = self.api.upload_document(
                    str(doc_path),
                    client_id,
                    title,
                    f"Auto-uploaded from workstation: {doc_path.parent}"
                )
                # Check if upload was skipped (file already exists on server)
                if result.get('skipped'):
                    self.log(f"⊘ Skipped (already exists on server): {doc_path.name}")
                    # Still mark as uploaded locally since server has it
                    file_hash = self.calculate_file_hash(doc_path)
                    if file_hash:
                        self.mark_file_uploaded(doc_path, client_id, doc_path.name, file_hash)
                    skipped_count += 1
                else:
                    self.log(f"✓ Uploaded document: {doc_path.name}")
                    # Mark as uploaded in local state
                    file_hash = self.calculate_file_hash(doc_path)
                    if file_hash:
                        self.mark_file_uploaded(doc_path, client_id, doc_path.name, file_hash)
                    uploaded_count += 1

            except Exception as e:
                error_msg = str(e)
                # Check if error is about file already existing
                if 'already exists' in error_msg.lower() or 'duplicate' in error_msg.lower():
                    self.log(f"⊘ Skipped (already exists): {doc_path.name}")
                    # Mark as uploaded locally since server has it
                    file_hash = self.calculate_file_hash(doc_path)
                    if file_hash:
                        self.mark_file_uploaded(doc_path, client_id, doc_path.name, file_hash)
                    skipped_count += 1
                # Check for rate limiting (429 Too Many Requests)
                elif '429' in error_msg or 'too many requests' in error_msg.lower():
                    self.log(f"⏱️ Rate limited, retrying {doc_path.name} in 5 seconds...")
                    rate_limited_count += 1
                    time.sleep(5)  # Wait 5 seconds before retrying
                    try:
                        # Retry the upload
                        result = self.api.upload_document(
                            str(doc_path),
                            client_id,
                            title,
                            f"Auto-uploaded from workstation: {doc_path.parent}"
                        )
                        if result.get('skipped'):
                            self.log(f"⊘ Skipped (already exists): {doc_path.name}")
                            # Mark as uploaded locally since server has it
                            file_hash = self.calculate_file_hash(doc_path)
                            if file_hash:
                                self.mark_file_uploaded(doc_path, client_id, doc_path.name, file_hash)
                            skipped_count += 1
                        else:
                            self.log(f"✓ Uploaded document (retry): {doc_path.name}")
                            # Mark as uploaded in local state
                            file_hash = self.calculate_file_hash(doc_path)
                            if file_hash:
                                self.mark_file_uploaded(doc_path, client_id, doc_path.name, file_hash)
                            uploaded_count += 1
                    except Exception as retry_e:
                        self.log(f"✗ Error uploading {doc_path.name} (retry failed): {retry_e}")
                else:
                    self.log(f"✗ Error uploading {doc_path.name}: {e}")

            # Add delay between uploads to prevent rate limiting (except for the last document)
            if i < len(documents) - 1:
                time.sleep(1)  # 1 second delay between uploads
        # END RATE LIMITING LOGIC

        self.log(f"Upload complete: {uploaded_count} uploaded, {skipped_count} skipped, {rate_limited_count} rate limited, {len(documents) - uploaded_count - skipped_count - rate_limited_count} errors")

        # Show notification for successful uploads (only if enabled)
        if uploaded_count > 0:
            # Access the GUI app instance to show notification
            if hasattr(self, 'gui_app') and self.gui_app:
                self.gui_app.show_notification(
                    "Documents Uploaded",
                    f"Successfully uploaded {uploaded_count} document(s) for client: {client_name}",
                    level="normal"
                )


class VirtualDriveManager:
    @staticmethod
    def mount_drive(letter: str, path: str) -> bool:
        if platform.system() != 'Windows':
            Config.log("Virtual drive mounting only supported on Windows")
            return False
        try:
            # Normalize drive letter to include colon (e.g., "Z" -> "Z:")
            drive_letter = letter.upper().strip()
            if not drive_letter.endswith(':'):
                drive_letter = f"{drive_letter}:"
            
            # Ensure path exists
            path_obj = Path(path)
            if not path_obj.exists():
                Config.log(f"Creating virtual drive path: {path}")
                path_obj.mkdir(parents=True, exist_ok=True)
            
            # Convert path to absolute and normalize
            abs_path = str(path_obj.resolve())
            
            # Unmount if already mounted
            VirtualDriveManager.unmount_drive(drive_letter)
            
            # Mount drive using subst command
            result = subprocess.run(
                ['subst', drive_letter, abs_path],
                capture_output=True,
                text=True,
                check=True
            )
            Config.log(f"Mounted virtual drive {drive_letter} to {abs_path}")
            return True
        except subprocess.CalledProcessError as e:
            error_msg = e.stderr.strip() if e.stderr else str(e)
            Config.log(f"Error mounting drive {letter}: {error_msg}")
            if e.stdout:
                Config.log(f"subst output: {e.stdout}")
            return False
        except Exception as e:
            Config.log(f"Error mounting drive {letter}: {e}")
            return False
    
    @staticmethod
    def unmount_drive(letter: str) -> bool:
        if platform.system() != 'Windows':
            return False
        try:
            # Normalize drive letter to include colon
            drive_letter = letter.upper().strip()
            if not drive_letter.endswith(':'):
                drive_letter = f"{drive_letter}:"
            
            subprocess.run(
                ['subst', drive_letter, '/D'],
                capture_output=True,
                text=True,
                check=True
            )
            Config.log(f"Unmounted virtual drive {drive_letter}")
            return True
        except subprocess.CalledProcessError:
            # Drive might not be mounted, which is fine
            return True
        except Exception as e:
            Config.log(f"Error unmounting drive {letter}: {e}")
            return False
    
    @staticmethod
    def force_unmount_drive(letter: str) -> bool:
        """Force unmount a virtual drive using multiple methods"""
        if platform.system() != 'Windows':
            return False
        
        # Normalize drive letter
        drive_letter = letter.upper().strip()
        if not drive_letter.endswith(':'):
            drive_letter = f"{drive_letter}:"
        
        # Method 1: Standard unmount
        try:
            result = subprocess.run(
                ['subst', drive_letter, '/D'],
                capture_output=True,
                text=True,
                check=True,
                timeout=5
            )
            Config.log(f"Force unmounted virtual drive {drive_letter}")
            return True
        except subprocess.TimeoutExpired:
            Config.log(f"Timeout unmounting drive {drive_letter}, trying alternative method...")
        except subprocess.CalledProcessError as e:
            # Try alternative method
            Config.log(f"Standard unmount failed for {drive_letter}, trying alternative method...")
        except Exception as e:
            Config.log(f"Error in standard unmount: {e}")
        
        # Method 2: Try with elevated privileges hint (if available)
        try:
            # Try using net use to disconnect (alternative method)
            result = subprocess.run(
                ['net', 'use', drive_letter, '/DELETE', '/YES'],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0:
                Config.log(f"Force unmounted virtual drive {drive_letter} using net use")
                return True
        except Exception as e:
            Config.log(f"Alternative unmount method failed: {e}")
        
        # Method 3: Final attempt with subst
        try:
            result = subprocess.run(
                ['subst', drive_letter, '/D'],
                capture_output=True,
                text=True,
                timeout=10
            )
            Config.log(f"Force unmounted virtual drive {drive_letter} (final attempt)")
            return True
        except Exception as e:
            Config.log(f"Failed to force unmount drive {drive_letter}: {e}")
            return False


class WorkstationMonitorGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("Law Firm Workstation Monitor")
        self.root.geometry("900x700")
        self.root.resizable(True, True)
        
        self.config = Config()
        self.api = WorkstationAPI(self.config)
        self.observer = None
        self.monitoring = False
        self.monitor_thread = None
        self.open_requests_thread = None
        self.stop_open_requests = False
        # Track opened files: {document_id: {'process': process, 'file_path': path, 'lock_acquired': bool}}
        self.opened_files: Dict[int, Dict] = {}
        self.file_lock_monitor_thread = None
        self.stop_file_lock_monitor = False
        
        # Register window close handler
        self.root.protocol("WM_DELETE_WINDOW", self.on_closing)

        # Bind minimize event to system tray if available
        if SYSTEM_TRAY_AVAILABLE:
            self.root.bind("<Unmap>", self.on_minimize)
        
        self.setup_ui()
        
        # Schedule load_config and check_registration AFTER UI is fully rendered
        self.root.after(100, self._post_ui_init)
    
    def _post_ui_init(self):
        """Called after UI setup is complete to load configuration and auto-connect."""
        self.load_config()
        self.check_registration()
        # Auto-connect and auto-start if configuration is already present
        self.root.after(500, self.auto_connect_and_start)
    
    def setup_ui(self):
        # Create notebook for tabs
        notebook = ttk.Notebook(self.root)
        notebook.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        # Status Tab
        self.status_frame = ttk.Frame(notebook)
        notebook.add(self.status_frame, text="Status")
        self.setup_status_tab()

        # Configuration Tab
        self.config_frame = ttk.Frame(notebook)
        notebook.add(self.config_frame, text="Configuration")
        self.setup_config_tab()

        # File Extensions Tab
        self.extensions_frame = ttk.Frame(notebook)
        notebook.add(self.extensions_frame, text="File Extensions")
        self.setup_extensions_tab()

        # Logs Tab
        self.logs_frame = ttk.Frame(notebook)
        notebook.add(self.logs_frame, text="Logs")
        self.setup_logs_tab()

        # Initialize system tray if available
        if SYSTEM_TRAY_AVAILABLE:
            self.setup_system_tray()
    
    def setup_status_tab(self):
        # Status section
        status_group = ttk.LabelFrame(self.status_frame, text="Monitor Status", padding=10)
        status_group.pack(fill=tk.X, padx=10, pady=10)
        
        self.status_label = ttk.Label(status_group, text="Status: Stopped", font=('Arial', 12, 'bold'))
        self.status_label.pack(anchor=tk.W)
        
        self.connection_label = ttk.Label(status_group, text="Connection: Not Connected", font=('Arial', 10))
        self.connection_label.pack(anchor=tk.W, pady=5)

        self.version_label = ttk.Label(status_group, text=f"Version: {WORKSTATION_VERSION}", font=('Arial', 9))
        self.version_label.pack(anchor=tk.W)
        
        # Control buttons
        button_frame = ttk.Frame(status_group)
        button_frame.pack(fill=tk.X, pady=10)
        
        self.start_button = ttk.Button(button_frame, text="Start Monitor", command=self.start_monitoring)
        self.start_button.pack(side=tk.LEFT, padx=5)
        
        self.stop_button = ttk.Button(button_frame, text="Stop Monitor", command=self.stop_monitoring, state=tk.DISABLED)
        self.stop_button.pack(side=tk.LEFT, padx=5)
        
        # Workstation info
        info_group = ttk.LabelFrame(self.status_frame, text="Workstation Information", padding=10)
        info_group.pack(fill=tk.X, padx=10, pady=10)
        
        self.workstation_info = scrolledtext.ScrolledText(info_group, height=8, wrap=tk.WORD)
        self.workstation_info.pack(fill=tk.BOTH, expand=True)
        self.workstation_info.config(state=tk.DISABLED)
        
        # Refresh button
        ttk.Button(info_group, text="Refresh Info", command=self.refresh_workstation_info).pack(pady=5)
        
        # Lock Management section
        lock_group = ttk.LabelFrame(self.status_frame, text="File Lock Management", padding=10)
        lock_group.pack(fill=tk.X, padx=10, pady=10)
        
        lock_info_label = ttk.Label(
            lock_group, 
            text="If a file is locked and you've closed the application, you can manually release the lock.",
            font=('Arial', 9),
            foreground='gray',
            wraplength=600
        )
        lock_info_label.pack(anchor=tk.W, pady=5)
        
        lock_button_frame = ttk.Frame(lock_group)
        lock_button_frame.pack(fill=tk.X, pady=5)
        
        ttk.Button(
            lock_button_frame, 
            text="Release All Locks", 
            command=self.release_all_locks
        ).pack(side=tk.LEFT, padx=5)
        
        self.lock_status_label = ttk.Label(lock_group, text="", font=('Arial', 9))
        self.lock_status_label.pack(anchor=tk.W, pady=5)
    
    def setup_config_tab(self):
        # Create main container with left and right sections
        main_container = ttk.Frame(self.config_frame)
        main_container.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

        # Left section - existing configuration
        left_frame = ttk.Frame(main_container)
        left_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        # Create a canvas with scrollbar for the left section
        canvas = tk.Canvas(left_frame)
        scrollbar = ttk.Scrollbar(left_frame, orient="vertical", command=canvas.yview)
        scrollable_frame = ttk.Frame(canvas)

        scrollable_frame.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )

        canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)

        # Bind mousewheel to canvas
        def _on_mousewheel(event):
            canvas.yview_scroll(int(-1*(event.delta/120)), "units")

        def _bind_to_mousewheel(event):
            canvas.bind_all("<MouseWheel>", _on_mousewheel)

        def _unbind_from_mousewheel(event):
            canvas.unbind_all("<MouseWheel>")

        canvas.bind('<Enter>', _bind_to_mousewheel)
        canvas.bind('<Leave>', _unbind_from_mousewheel)

        canvas.pack(side="left", fill="both", expand=True)
        canvas.config(width=600)  # Minimum width
        scrollbar.pack(side="right", fill="y")

        # Right section - file organization settings
        right_frame = ttk.Frame(main_container)
        right_frame.pack(side=tk.RIGHT, fill=tk.Y, padx=(10, 0))

        # Create file organization settings in right frame
        self.setup_file_organizer_config(right_frame)

        # API Configuration (Secure Method Only)
        api_group = ttk.LabelFrame(scrollable_frame, text="API Configuration (Secure)", padding=10)
        api_group.pack(fill=tk.X, padx=10, pady=10)

        # Configure grid weights for proper expansion
        api_group.grid_columnconfigure(1, weight=1)

        ttk.Label(api_group, text="Server URL:").grid(row=0, column=0, sticky=tk.W, pady=5)
        self.api_url_var = tk.StringVar()
        ttk.Entry(api_group, textvariable=self.api_url_var).grid(row=0, column=1, padx=5, pady=5, sticky=tk.W+tk.E)

        # API Key Input (Encrypted Storage)
        ttk.Label(api_group, text="API Key:").grid(row=1, column=0, sticky=tk.W, pady=5)
        self.api_key_var = tk.StringVar()
        self.api_key_entry = ttk.Entry(api_group, textvariable=self.api_key_var, show="*")
        self.api_key_entry.grid(row=1, column=1, padx=5, pady=5, sticky=tk.W+tk.E)
        
        # Show/Hide password button
        show_hide_btn = ttk.Button(api_group, text="👁️", width=3, command=self.toggle_api_key_visibility)
        show_hide_btn.grid(row=1, column=2, padx=5, pady=5)
        
        # API Key Status and Security Info
        security_frame = ttk.Frame(api_group)
        security_frame.grid(row=2, column=0, columnspan=3, padx=5, pady=10, sticky=tk.W+tk.E)
        
        ttk.Label(security_frame, text="🔒 API Key Security", font=('Arial', 10, 'bold'), foreground='green').pack(anchor=tk.W, pady=(0, 5))
        
        api_key_status = os.environ.get('LAWFIRM_API_KEY') or os.environ.get('WORKSTATION_API_KEY') or os.environ.get('API_KEY')
        status_text = "✅ Configured in environment" if api_key_status else "❌ Enter API key above to configure"
        status_color = "green" if api_key_status else "orange"
        ttk.Label(security_frame, text=f"Status: {status_text}", foreground=status_color).pack(anchor=tk.W, pady=2)
        
        security_info = (
            "Security: API keys are encrypted when saved to config.json\n"
            "and automatically set as environment variable (LAWFIRM_API_KEY)\n"
            "for secure access by the workstation monitor."
        )
        ttk.Label(security_frame, text=security_info, font=('Arial', 8), foreground='blue', justify=tk.LEFT).pack(anchor=tk.W, pady=5)
        
        button_frame = ttk.Frame(security_frame)
        button_frame.pack(fill=tk.X, pady=(10, 0))
        ttk.Button(button_frame, text="Verify API Key", command=self.verify_api_key).pack(side=tk.LEFT, padx=2)
        ttk.Button(button_frame, text="Connect & Load Config", command=self.connect_and_load_config).pack(side=tk.LEFT, padx=2)

        # Registration section
        reg_group = ttk.LabelFrame(scrollable_frame, text="Registration", padding=10)
        reg_group.pack(fill=tk.X, padx=10, pady=10)

        # Configure grid weights for proper expansion
        reg_group.grid_columnconfigure(1, weight=1)

        ttk.Label(reg_group, text="Workstation Name:").grid(row=0, column=0, sticky=tk.W, pady=5)
        self.workstation_name_var = tk.StringVar()
        ttk.Entry(reg_group, textvariable=self.workstation_name_var).grid(row=0, column=1, padx=5, pady=5, sticky=tk.W+tk.E)

        reg_button_frame = ttk.Frame(reg_group)
        reg_button_frame.grid(row=0, column=2, padx=5, pady=5)
        ttk.Button(reg_button_frame, text="Register Workstation", command=self.register_workstation).pack(side=tk.LEFT, padx=2)

        # Monitored Folders
        folders_group = ttk.LabelFrame(scrollable_frame, text="Monitored Folders", padding=10)
        folders_group.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

        folder_list_frame = ttk.Frame(folders_group)
        folder_list_frame.pack(fill=tk.BOTH, expand=True)

        self.folder_listbox = tk.Listbox(folder_list_frame, height=6)
        self.folder_listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        folder_scrollbar = ttk.Scrollbar(folder_list_frame, orient=tk.VERTICAL, command=self.folder_listbox.yview)
        folder_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.folder_listbox.config(yscrollcommand=folder_scrollbar.set)

        folder_button_frame = ttk.Frame(folders_group)
        folder_button_frame.pack(fill=tk.X, pady=5)

        ttk.Button(folder_button_frame, text="Add Folder", command=self.add_folder).pack(side=tk.LEFT, padx=5)
        ttk.Button(folder_button_frame, text="Remove Folder", command=self.remove_folder).pack(side=tk.LEFT, padx=5)

        # Virtual Drive
        drive_group = ttk.LabelFrame(scrollable_frame, text="Virtual Drive (Optional)", padding=10)
        drive_group.pack(fill=tk.X, padx=10, pady=10)

        # Configure grid weights for proper expansion
        drive_group.grid_columnconfigure(1, weight=1)

        # Help text
        help_text = ttk.Label(
            drive_group,
            text="Creates a virtual drive letter (e.g., Z:) that points to a folder path.\nExample: Z: → C:\\Documents\\Clients (accessing Z:\\ is the same as C:\\Documents\\Clients)",
            font=('Arial', 8),
            foreground='gray'
        )
        help_text.grid(row=0, column=0, columnspan=3, sticky=tk.W, pady=(0, 10))

        ttk.Label(drive_group, text="Drive Letter:").grid(row=1, column=0, sticky=tk.W, pady=5)
        self.drive_letter_var = tk.StringVar()
        drive_letter_entry = ttk.Entry(drive_group, textvariable=self.drive_letter_var, width=10)
        drive_letter_entry.grid(row=1, column=1, padx=5, pady=5, sticky=tk.W)
        ttk.Label(drive_group, text="(e.g., Z:)", font=('Arial', 8), foreground='gray').grid(row=1, column=2, sticky=tk.W, padx=5)

        ttk.Label(drive_group, text="Drive Path:").grid(row=2, column=0, sticky=tk.W, pady=5)
        self.drive_path_var = tk.StringVar()
        drive_path_frame = ttk.Frame(drive_group)
        drive_path_frame.grid(row=2, column=1, columnspan=2, padx=5, pady=5, sticky=tk.W+tk.E)
        ttk.Entry(drive_path_frame, textvariable=self.drive_path_var).pack(side=tk.LEFT, fill=tk.X, expand=True)
        ttk.Button(drive_path_frame, text="Browse", command=self.browse_drive_path).pack(side=tk.LEFT, padx=5)
        ttk.Label(drive_group, text="(the actual folder path)", font=('Arial', 8), foreground='gray').grid(row=3, column=1, sticky=tk.W, padx=5)

        # Sync Configuration
        sync_group = ttk.LabelFrame(scrollable_frame, text="Sync Configuration", padding=10)
        sync_group.pack(fill=tk.X, padx=10, pady=10)

        ttk.Label(sync_group, text="Sync Interval (seconds):").grid(row=0, column=0, sticky=tk.W, pady=5)
        self.sync_interval_var = tk.StringVar()
        ttk.Entry(sync_group, textvariable=self.sync_interval_var, width=10).grid(row=0, column=1, padx=5, pady=5, sticky=tk.W)
        ttk.Label(sync_group, text="(How often to sync with server)", font=('Arial', 8), foreground='gray').grid(row=0, column=2, sticky=tk.W, padx=5)

        ttk.Label(sync_group, text="Lock Check Interval (seconds):").grid(row=1, column=0, sticky=tk.W, pady=5)
        self.lock_check_interval_var = tk.StringVar()
        ttk.Entry(sync_group, textvariable=self.lock_check_interval_var, width=10).grid(row=1, column=1, padx=5, pady=5, sticky=tk.W)
        ttk.Label(sync_group, text="(How often to check file locks)", font=('Arial', 8), foreground='gray').grid(row=1, column=2, sticky=tk.W, padx=5)

        ttk.Label(sync_group, text="Conflict Resolution:").grid(row=2, column=0, sticky=tk.W, pady=5)
        self.conflict_resolution_var = tk.StringVar()
        conflict_label = ttk.Label(sync_group, textvariable=self.conflict_resolution_var, foreground='gray')
        conflict_label.grid(row=2, column=1, padx=5, pady=5, sticky=tk.W)
        ttk.Label(sync_group, text="(Controlled by server admin)", font=('Arial', 8), foreground='gray').grid(row=2, column=2, sticky=tk.W, padx=5)

        # Notification Settings
        notification_group = ttk.LabelFrame(scrollable_frame, text="Notification Settings", padding=10)
        notification_group.pack(fill=tk.X, padx=10, pady=10)

        # Enable notifications checkbox
        self.enable_notifications_var = tk.BooleanVar()
        ttk.Checkbutton(
            notification_group,
            text="Enable desktop notifications",
            variable=self.enable_notifications_var,
            command=self.toggle_notification_settings
        ).pack(anchor=tk.W, pady=5)

        # Notification level
        level_frame = ttk.Frame(notification_group)
        level_frame.pack(fill=tk.X, pady=5)

        ttk.Label(level_frame, text="Notification Level:").pack(side=tk.LEFT, padx=5)
        self.notification_level_var = tk.StringVar()
        notification_combo = ttk.Combobox(
            level_frame,
            textvariable=self.notification_level_var,
            width=15,
            state='readonly'
        )
        notification_combo['values'] = ('all', 'important', 'errors_only')
        notification_combo.pack(side=tk.LEFT, padx=5)

        # Help text for notification levels
        help_text = ttk.Label(
            notification_group,
            text="All: Show all notifications\nImportant: Show important events and errors\nErrors Only: Show only errors",
            font=('Arial', 8),
            foreground='gray',
            justify=tk.LEFT
        )
        help_text.pack(anchor=tk.W, pady=5)

        # Deletion Sync Settings
        deletion_group = ttk.LabelFrame(scrollable_frame, text="File Deletion Settings", padding=10)
        deletion_group.pack(fill=tk.X, padx=10, pady=10)

        # Sync delete to server checkbox
        self.sync_delete_to_server_var = tk.BooleanVar()
        ttk.Checkbutton(
            deletion_group,
            text="Sync manual file deletions to server",
            variable=self.sync_delete_to_server_var
        ).pack(anchor=tk.W, pady=5)

        # Help text for deletion sync
        deletion_help = ttk.Label(
            deletion_group,
            text="When enabled, manually deleting files from Windows File Explorer will\nautomatically delete the file from the server and all other workstations.",
            font=('Arial', 8),
            foreground='gray',
            justify=tk.LEFT
        )
        deletion_help.pack(anchor=tk.W, pady=5)

        # Save button
        ttk.Button(scrollable_frame, text="Save Configuration", command=self.save_config).pack(pady=10)

    def toggle_api_key_visibility(self):
        """Toggle API key field visibility"""
        if self.api_key_entry.cget('show') == '*':
            self.api_key_entry.config(show='')
        else:
            self.api_key_entry.config(show='*')

    def setup_file_organizer_config(self, parent_frame):
        """Setup file organization configuration settings in the right panel"""
        # File Organizer Settings
        organizer_group = ttk.LabelFrame(parent_frame, text="File Organization", padding=10)
        organizer_group.pack(fill=tk.X, pady=5)

        # Enable file organizer
        self.file_organizer_enabled_var = tk.BooleanVar()
        ttk.Checkbutton(
            organizer_group,
            text="Enable File Organizer",
            variable=self.file_organizer_enabled_var
        ).pack(anchor=tk.W, pady=2)

        # Scan interval
        ttk.Label(organizer_group, text="Scan Interval (seconds):").pack(anchor=tk.W, pady=(10, 2))
        self.file_organizer_scan_interval_var = tk.StringVar()
        scan_interval_entry = ttk.Entry(organizer_group, textvariable=self.file_organizer_scan_interval_var, width=15)
        scan_interval_entry.pack(anchor=tk.W, pady=2)
        ttk.Label(organizer_group, text="(How often to scan for loose files)", font=('Arial', 8), foreground='gray').pack(anchor=tk.W)

        # Confidence threshold
        ttk.Label(organizer_group, text="Confidence Threshold:").pack(anchor=tk.W, pady=(10, 2))
        self.file_organizer_confidence_var = tk.StringVar()
        confidence_entry = ttk.Entry(organizer_group, textvariable=self.file_organizer_confidence_var, width=15)
        confidence_entry.pack(anchor=tk.W, pady=2)
        ttk.Label(organizer_group, text="(0.0-1.0, higher = stricter matching)", font=('Arial', 8), foreground='gray').pack(anchor=tk.W)

        # Max text length
        ttk.Label(organizer_group, text="Max Text Length:").pack(anchor=tk.W, pady=(10, 2))
        self.file_organizer_max_text_var = tk.StringVar()
        max_text_entry = ttk.Entry(organizer_group, textvariable=self.file_organizer_max_text_var, width=15)
        max_text_entry.pack(anchor=tk.W, pady=2)
        ttk.Label(organizer_group, text="(Maximum characters to extract)", font=('Arial', 8), foreground='gray').pack(anchor=tk.W)

        # Manual folder overrides
        ttk.Label(organizer_group, text="Manual Folder Overrides:").pack(anchor=tk.W, pady=(15, 5))

        # Client folders
        ttk.Label(organizer_group, text="Client Folders:").pack(anchor=tk.W, pady=(5, 2))
        client_frame = ttk.Frame(organizer_group)
        client_frame.pack(fill=tk.X, pady=2)
        self.client_folders_var = tk.StringVar()
        client_entry = ttk.Entry(client_frame, textvariable=self.client_folders_var)
        client_entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
        ttk.Label(client_frame, text="(comma-separated)", font=('Arial', 8), foreground='gray').pack(side=tk.LEFT, padx=(5, 0))

        # Utility folders
        ttk.Label(organizer_group, text="Utility Folders:").pack(anchor=tk.W, pady=(5, 2))
        utility_frame = ttk.Frame(organizer_group)
        utility_frame.pack(fill=tk.X, pady=2)
        self.utility_folders_var = tk.StringVar()
        utility_entry = ttk.Entry(utility_frame, textvariable=self.utility_folders_var)
        utility_entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
        ttk.Label(utility_frame, text="(comma-separated)", font=('Arial', 8), foreground='gray').pack(side=tk.LEFT, padx=(5, 0))

        # Ignore folders
        ttk.Label(organizer_group, text="Ignore Folders:").pack(anchor=tk.W, pady=(5, 2))
        ignore_frame = ttk.Frame(organizer_group)
        ignore_frame.pack(fill=tk.X, pady=2)
        self.ignore_folders_var = tk.StringVar()
        ignore_entry = ttk.Entry(ignore_frame, textvariable=self.ignore_folders_var)
        ignore_entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
        ttk.Label(ignore_frame, text="(comma-separated)", font=('Arial', 8), foreground='gray').pack(side=tk.LEFT, padx=(5, 0))

        # Help text for overrides
        override_help = ("Folder names to override automatic detection. "
                        "Client folders: always treated as client folders. "
                        "Utility folders: always scanned for organization. "
                        "Ignore folders: never scanned.")
        ttk.Label(organizer_group, text=override_help, font=('Arial', 8), foreground='gray',
                 wraplength=400, justify=tk.LEFT).pack(anchor=tk.W, pady=(5, 10))

        # Supported extensions
        ttk.Label(organizer_group, text="Supported Extensions:").pack(anchor=tk.W, pady=(10, 2))
        extensions_text = ".pdf, .docx, .doc, .txt, .jpg, .jpeg, .png, .gif, .bmp, .tiff"
        ttk.Label(organizer_group, text=extensions_text, font=('Arial', 8), foreground='blue').pack(anchor=tk.W)
        ttk.Label(organizer_group, text="(File types to scan and organize)", font=('Arial', 8), foreground='gray').pack(anchor=tk.W)
    
    def setup_extensions_tab(self):
        """Setup File Extensions tab for configuring default programs"""
        # Main container
        main_frame = ttk.Frame(self.extensions_frame)
        main_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # Title and description
        title_label = ttk.Label(
            main_frame,
            text="Default Programs for File Extensions",
            font=('Arial', 14, 'bold')
        )
        title_label.pack(anchor=tk.W, pady=(0, 5))
        
        desc_label = ttk.Label(
            main_frame,
            text="Configure default programs to open files when requested from the web app.\nWhen a file is opened from the browser, it will use the program configured here, or Windows default if not configured.",
            font=('Arial', 9),
            foreground='gray',
            justify=tk.LEFT
        )
        desc_label.pack(anchor=tk.W, pady=(0, 15))
        
        # Example
        example_label = ttk.Label(
            main_frame,
            text="Example: .pdf → C:\\Program Files\\Adobe\\Acrobat\\Acrobat.exe",
            font=('Arial', 8),
            foreground='blue'
        )
        example_label.pack(anchor=tk.W, pady=(0, 15))
        
        # Programs list frame
        list_container = ttk.LabelFrame(main_frame, text="Configured Programs", padding=10)
        list_container.pack(fill=tk.BOTH, expand=True, pady=(0, 10))
        
        programs_list_frame = ttk.Frame(list_container)
        programs_list_frame.pack(fill=tk.BOTH, expand=True)
        
        # Treeview for programs
        columns = ('Extension', 'Program Path')
        self.programs_tree = ttk.Treeview(programs_list_frame, columns=columns, show='headings', height=10)
        self.programs_tree.heading('Extension', text='Extension')
        self.programs_tree.heading('Program Path', text='Program Path')
        self.programs_tree.column('Extension', width=120)
        self.programs_tree.column('Program Path', width=500)
        self.programs_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        programs_scrollbar = ttk.Scrollbar(programs_list_frame, orient=tk.VERTICAL, command=self.programs_tree.yview)
        programs_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.programs_tree.config(yscrollcommand=programs_scrollbar.set)
        
        # Programs buttons
        programs_button_frame = ttk.Frame(list_container)
        programs_button_frame.pack(fill=tk.X, pady=(10, 0))
        
        ttk.Button(programs_button_frame, text="Remove Selected", command=self.remove_program).pack(side=tk.LEFT, padx=5)
        
        # Add program section
        add_section = ttk.LabelFrame(main_frame, text="Add New Program", padding=10)
        add_section.pack(fill=tk.X, pady=(0, 10))
        
        add_program_frame = ttk.Frame(add_section)
        add_program_frame.pack(fill=tk.X)
        
        ttk.Label(add_program_frame, text="Extension:", font=('Arial', 10)).pack(side=tk.LEFT, padx=5)
        self.new_ext_var = tk.StringVar()
        ext_entry = ttk.Entry(add_program_frame, textvariable=self.new_ext_var, width=15)
        ext_entry.pack(side=tk.LEFT, padx=5)
        ttk.Label(add_program_frame, text="(e.g., .pdf, .docx)", font=('Arial', 8), foreground='gray').pack(side=tk.LEFT, padx=2)
        
        ttk.Label(add_program_frame, text="Program Path:", font=('Arial', 10)).pack(side=tk.LEFT, padx=(20, 5))
        self.new_program_var = tk.StringVar()
        program_entry = ttk.Entry(add_program_frame, textvariable=self.new_program_var, width=50)
        program_entry.pack(side=tk.LEFT, padx=5, fill=tk.X, expand=True)
        ttk.Button(add_program_frame, text="Browse", command=self.browse_program).pack(side=tk.LEFT, padx=5)
        ttk.Button(add_program_frame, text="Add", command=self.add_program).pack(side=tk.LEFT, padx=5)
        
        # Save button
        save_frame = ttk.Frame(main_frame)
        save_frame.pack(fill=tk.X, pady=10)
        ttk.Button(save_frame, text="Save Configuration", command=self.save_extensions_config).pack()
    
    def setup_logs_tab(self):
        logs_group = ttk.LabelFrame(self.logs_frame, text="Activity Log", padding=10)
        logs_group.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

        self.log_text = scrolledtext.ScrolledText(logs_group, height=25, wrap=tk.WORD)
        self.log_text.pack(fill=tk.BOTH, expand=True)

        button_frame = ttk.Frame(logs_group)
        button_frame.pack(fill=tk.X, pady=5)

        ttk.Button(button_frame, text="Clear Logs", command=self.clear_logs).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="Refresh Logs", command=self.refresh_logs).pack(side=tk.LEFT, padx=5)

    def setup_system_tray(self):
        """Setup system tray icon and menu"""
        try:
            # Create tray icon image
            self.tray_icon = self.create_tray_icon()

            # Create tray menu
            menu = (
                item('Show Window', self.show_window_from_tray),
                item('Minimize to Tray', self.minimize_to_tray),
                item('Start Monitor', self.start_monitor_from_tray, enabled=lambda item: not self.monitoring),
                item('Stop Monitor', self.stop_monitor_from_tray, enabled=lambda item: self.monitoring),
                item('Exit', self.exit_from_tray)
            )

            # Create tray icon
            self.tray = pystray.Icon(
                "WorkstationMonitor",
                self.tray_icon,
                "Law Firm Workstation Monitor",
                menu
            )

            # Start tray in background thread
            threading.Thread(target=self.tray.run, daemon=True).start()

            self.log("System tray initialized")
        except Exception as e:
            self.log(f"Error setting up system tray: {e}")

    def create_tray_icon(self):
        """Create a simple tray icon image"""
        # Create a 64x64 icon
        image = Image.new('RGB', (64, 64), color='white')
        draw = ImageDraw.Draw(image)

        # Draw a simple monitor/document icon
        # Monitor base
        draw.rectangle([8, 40, 56, 56], fill='blue', outline='black')
        # Screen
        draw.rectangle([12, 12, 52, 40], fill='lightblue', outline='black')
        # Document lines
        draw.line([16, 16, 48, 16], fill='black', width=2)
        draw.line([16, 22, 44, 22], fill='black', width=2)
        draw.line([16, 28, 40, 28], fill='black', width=2)
        draw.line([16, 34, 36, 34], fill='black', width=2)

        return image

    def show_window_from_tray(self, icon, item):
        """Show main window from system tray"""
        self.root.deiconify()
        self.root.lift()
        self.root.focus_force()
        # Only show notification if user wants all notifications
        if self.notification_level == "all":
            self.show_notification("Workstation Monitor", "Window restored from system tray", level="normal")

    def minimize_to_tray(self, icon, item):
        """Minimize window to system tray"""
        self.root.withdraw()
        # Only show notification if user wants all notifications
        if self.config.notification_level == "all":
            self.show_notification("Workstation Monitor", "Application minimized to system tray", level="normal")

    def start_monitor_from_tray(self, icon, item):
        """Start monitoring from tray menu"""
        if not self.monitoring:
            self.start_monitoring()
            self.show_notification("Workstation Monitor", "Monitoring started", level="important")

    def stop_monitor_from_tray(self, icon, item):
        """Stop monitoring from tray menu"""
        if self.monitoring:
            self.stop_monitoring()
            self.show_notification("Workstation Monitor", "Monitoring stopped", level="important")

    def exit_from_tray(self, icon, item):
        """Exit application from tray menu"""
        self.tray.stop()
        self.on_closing()

    def show_notification(self, title: str, message: str, timeout: int = 5, level: str = "normal"):
        """Show system notification based on user preferences"""
        try:
            if not SYSTEM_TRAY_AVAILABLE or not self.config.enable_notifications:
                return

            # Check notification level
            if self.notification_level == "errors_only":
                # Only show error notifications
                if level != "error":
                    return
            elif self.notification_level == "important":
                # Show important notifications and errors
                if level not in ["important", "error"]:
                    return
            # "all" level shows everything

            plyer.notification.notify(
                title=title,
                message=message,
                app_name="Workstation Monitor",
                timeout=timeout
            )
        except Exception as e:
            self.log(f"Error showing notification: {e}")
    
    def log(self, message: str):
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        log_message = f"[{timestamp}] {message}\n"
        self.log_text.insert(tk.END, log_message)
        self.log_text.see(tk.END)
        Config.log(message)
    
    # Placeholder shown when API key is already stored (encrypted); never put raw fernet in field
    API_KEY_PLACEHOLDER = "(configured - leave blank to keep)"

    def load_config(self):
        self.api_url_var.set(self.config.api_url)
        self.workstation_name_var.set(self.config.workstation_name or '')
        # Never put encrypted blob in field: would be re-encrypted on save and break auth
        if self.config.api_key and self.config.api_key.startswith(('fernet:', 'base64:')):
            self.api_key_var.set(self.API_KEY_PLACEHOLDER)
        elif self.config.api_key:
            self.api_key_var.set(self.config.api_key)
        else:
            self.api_key_var.set("")
        self.drive_letter_var.set(self.config.virtual_drive_letter or "")
        self.drive_path_var.set(self.config.virtual_drive_path or "")
        self.sync_interval_var.set(str(self.config.virtual_drive_sync_interval))
        self.lock_check_interval_var.set(str(self.config.file_lock_check_interval))
        self.conflict_resolution_var.set(self.config.conflict_resolution)

        # Load notification settings
        self.enable_notifications_var.set(self.config.enable_notifications)
        self.notification_level_var.set(self.config.notification_level)
        self.notification_level = self.config.notification_level
        self.toggle_notification_settings()  # Update UI state

        # Load deletion sync settings
        self.sync_delete_to_server_var.set(self.config.sync_delete_to_server)

        # Load file organizer settings
        self.file_organizer_enabled_var.set(getattr(self.config, 'file_organizer_enabled', True))
        self.file_organizer_scan_interval_var.set(str(getattr(self.config, 'file_organizer_scan_interval', 600)))
        self.file_organizer_confidence_var.set(str(getattr(self.config, 'file_organizer_confidence_threshold', 0.8)))
        self.file_organizer_max_text_var.set(str(getattr(self.config, 'file_organizer_max_text_length', 50000)))

        # Load manual folder overrides
        client_folders = getattr(self.config, 'file_organizer_client_folders', [])
        self.client_folders_var.set(', '.join(client_folders))

        utility_folders = getattr(self.config, 'file_organizer_utility_folders', [])
        self.utility_folders_var.set(', '.join(utility_folders))

        ignore_folders = getattr(self.config, 'file_organizer_ignore_folders', [])
        self.ignore_folders_var.set(', '.join(ignore_folders))
        
        self.folder_listbox.delete(0, tk.END)
        for folder in self.config.monitored_folders:
            self.folder_listbox.insert(tk.END, folder)
        
        # Load default programs (if treeview exists)
        if hasattr(self, 'programs_tree'):
            self.programs_tree.delete(*self.programs_tree.get_children())
            for ext, program in self.config.default_programs.items():
                self.programs_tree.insert('', tk.END, values=(ext, program))
    
    def toggle_notification_settings(self):
        """Enable/disable notification level controls based on checkbox"""
        enabled = self.enable_notifications_var.get()
        # Enable/disable the combobox based on the checkbox
        if hasattr(self, 'notification_level_var'):
            # This will be handled by the UI state
            pass

    def verify_api_key(self):
        """Verify API key from input field, encrypted config, or environment"""
        raw = self.api_key_var.get().strip()
        # Ignore placeholder or encrypted blob; treat as "use stored key"
        if raw == self.API_KEY_PLACEHOLDER or (raw and raw.startswith(('fernet:', 'base64:'))):
            raw = ""
        api_key = raw or os.environ.get('LAWFIRM_API_KEY') or os.environ.get('WORKSTATION_API_KEY') or os.environ.get('API_KEY')
        if not api_key and self.config.api_key:
            api_key = APIKeyEncryption.decrypt_key(self.config.api_key)
        if api_key:
            masked = api_key[:4] + '*' * (len(api_key) - 8) + api_key[-4:] if len(api_key) > 8 else '*' * len(api_key)
            messagebox.showinfo(
                "API Key Verified",
                f"✅ API key is configured\n\n"
                f"Key (masked): {masked}\n\n"
                f"Your workstation can now connect to the server and sync documents securely."
            )
            self.log("API Key verified successfully")
        else:
            messagebox.showerror("API Key Not Found", "❌ No API key found. Please enter your API key in the field above.")
            self.log("API Key verification failed")
    
    def save_config(self):
        self.config.api_url = self.api_url_var.get()
        # Persist workstation name so it isn't overwritten when "Connect & Load Config" gets a different workstation from server
        name_val = self.workstation_name_var.get()
        if isinstance(name_val, str) and name_val.strip():
            self.config.workstation_name = name_val.strip()
        else:
            self.config.workstation_name = None

        # Handle API key: only update when user entered a new plain key (never re-encrypt stored blob)
        api_key_raw = self.api_key_var.get().strip()
        if api_key_raw and api_key_raw != self.API_KEY_PLACEHOLDER and not api_key_raw.startswith(('fernet:', 'base64:')):
            # User entered a new plain API key: encrypt and save
            encrypted_key = APIKeyEncryption.encrypt_key(api_key_raw)
            self.config.api_key = encrypted_key
            os.environ['LAWFIRM_API_KEY'] = api_key_raw
            self.log("API key encrypted and set as LAWFIRM_API_KEY environment variable")
            Config.log("[SECURITY] API key has been configured and will be auto-loaded for workstation sync operations")
        elif not api_key_raw or api_key_raw == self.API_KEY_PLACEHOLDER:
            # Leave blank or placeholder: keep existing key (do not clear)
            if self.config.api_key:
                # Reload decrypted key into env so sync-to-server uses it
                decrypted = APIKeyEncryption.decrypt_key(self.config.api_key) if self.config.api_key.startswith(('fernet:', 'base64:')) else self.config.api_key
                if decrypted:
                    os.environ['LAWFIRM_API_KEY'] = decrypted
            # self.config.api_key unchanged
        # If field contained fernet:/base64: (shouldn't happen now), leave config.api_key unchanged
        self.config.virtual_drive_letter = self.drive_letter_var.get() if self.drive_letter_var.get() else None
        self.config.virtual_drive_path = self.drive_path_var.get() if self.drive_path_var.get() else None

        # Sync configuration
        try:
            self.config.virtual_drive_sync_interval = int(self.sync_interval_var.get() or 60)
        except ValueError:
            self.config.virtual_drive_sync_interval = 60

        try:
            self.config.file_lock_check_interval = int(self.lock_check_interval_var.get() or 10)
        except ValueError:
            self.config.file_lock_check_interval = 10

        # conflict_resolution is set by server policy — do not overwrite from GUI

        # Notification settings
        self.config.enable_notifications = self.enable_notifications_var.get()
        self.config.notification_level = self.notification_level_var.get() or 'important'
        self.notification_level = self.config.notification_level

        # Deletion sync settings
        self.config.sync_delete_to_server = self.sync_delete_to_server_var.get()

        # File organizer settings
        self.config.file_organizer_enabled = self.file_organizer_enabled_var.get()
        try:
            self.config.file_organizer_scan_interval = int(self.file_organizer_scan_interval_var.get() or 600)
        except ValueError:
            self.config.file_organizer_scan_interval = 600

        try:
            self.config.file_organizer_confidence_threshold = float(self.file_organizer_confidence_var.get() or 0.8)
        except ValueError:
            self.config.file_organizer_confidence_threshold = 0.8

        try:
            self.config.file_organizer_max_text_length = int(self.file_organizer_max_text_var.get() or 50000)
        except ValueError:
            self.config.file_organizer_max_text_length = 50000

        # Save manual folder overrides (parse comma-separated strings)
        client_folders_str = self.client_folders_var.get().strip()
        self.config.file_organizer_client_folders = [f.strip() for f in client_folders_str.split(',') if f.strip()]

        utility_folders_str = self.utility_folders_var.get().strip()
        self.config.file_organizer_utility_folders = [f.strip() for f in utility_folders_str.split(',') if f.strip()]

        ignore_folders_str = self.ignore_folders_var.get().strip()
        self.config.file_organizer_ignore_folders = [f.strip() for f in ignore_folders_str.split(',') if f.strip()]

        self.config.monitored_folders = list(self.folder_listbox.get(0, tk.END))
        self.config.save()
        
        # Load encrypted API key from config if it exists
        if self.config.api_key and self.config.api_key.startswith(('fernet:', 'base64:')):
            decrypted_key = APIKeyEncryption.decrypt_key(self.config.api_key)
            if decrypted_key:
                os.environ['LAWFIRM_API_KEY'] = decrypted_key
                self.log(f"API key loaded from encrypted storage")

        self.api = WorkstationAPI(self.config)

        # Sync config to server if registered
        api_key_env = os.environ.get('LAWFIRM_API_KEY') or os.environ.get('WORKSTATION_API_KEY') or os.environ.get('API_KEY')
        if api_key_env and self.config.workstation_id:
            try:
                self.api.update_config(
                    monitored_folders=self.config.monitored_folders,
                    virtual_drive_letter=self.config.virtual_drive_letter,
                    virtual_drive_path=self.config.virtual_drive_path,
                    sync_delete_to_server=self.config.sync_delete_to_server
                )
                self.log("Configuration synced to server")
            except Exception as e:
                self.log(f"Warning: Could not sync config to server: {e}")

        self.log("Configuration saved successfully")
        messagebox.showinfo("Success", "Configuration saved successfully!")
    
    def add_folder(self):
        folder = filedialog.askdirectory(title="Select Folder to Monitor")
        if folder:
            self.folder_listbox.insert(tk.END, folder)
    
    def remove_folder(self):
        selection = self.folder_listbox.curselection()
        if selection:
            self.folder_listbox.delete(selection[0])
    
    def browse_drive_path(self):
        folder = filedialog.askdirectory(title="Select Virtual Drive Path")
        if folder:
            self.drive_path_var.set(folder)
    
    def browse_program(self):
        program = filedialog.askopenfilename(
            title="Select Program Executable",
            filetypes=[("Executable files", "*.exe"), ("All files", "*.*")]
        )
        if program:
            self.new_program_var.set(program)
    
    def add_program(self):
        ext = self.new_ext_var.get().strip().lower()
        program = self.new_program_var.get().strip()
        
        if not ext:
            messagebox.showerror("Error", "Please enter a file extension (e.g., .pdf)")
            return
        
        if not ext.startswith('.'):
            ext = '.' + ext
        
        if not program:
            messagebox.showerror("Error", "Please enter or browse for a program path")
            return
        
        if not os.path.exists(program):
            messagebox.showerror("Error", f"Program not found: {program}")
            return
        
        # Check if extension already exists
        for item in self.programs_tree.get_children():
            values = self.programs_tree.item(item, 'values')
            if values[0].lower() == ext:
                # Update existing
                self.programs_tree.item(item, values=(ext, program))
                self.new_ext_var.set("")
                self.new_program_var.set("")
                return
        
        # Add new
        self.programs_tree.insert('', tk.END, values=(ext, program))
        self.new_ext_var.set("")
        self.new_program_var.set("")
    
    def save_extensions_config(self):
        """Save file extensions configuration"""
        # Save default programs from treeview
        self.config.default_programs = {}
        for item in self.programs_tree.get_children():
            values = self.programs_tree.item(item, 'values')
            if len(values) >= 2:
                ext = values[0].strip().lower()
                program = values[1].strip()
                if ext and program:
                    self.config.default_programs[ext] = program
        
        self.config.save()
        self.log("File extensions configuration saved successfully")
        messagebox.showinfo("Success", "File extensions configuration saved successfully!")
    
    def remove_program(self):
        selection = self.programs_tree.selection()
        if not selection:
            messagebox.showwarning("Warning", "Please select a program to remove")
            return
        
        for item in selection:
            self.programs_tree.delete(item)
    
    def register_workstation(self):
        """Registration must be performed by an admin via the web panel."""
        messagebox.showinfo(
            "Registration Required",
            "Workstations must be registered by an administrator via the web admin panel.\n\n"
            "Steps:\n"
            "  1. An administrator logs into the web application\n"
            "  2. Navigates to the Workstations page\n"
            "  3. Clicks 'Register Workstation' and fills in this workstation's details\n"
            "  4. Copies the API key that is displayed\n"
            "  5. Pastes that API key into the field above and clicks 'Save Configuration'\n"
            "  6. Click 'Connect & Load Config' to complete the connection\n\n"
            "This requirement ensures only authorised workstations can connect to the server."
        )
        self.log("Registration must be completed via the web admin panel.")
    
    def connect_and_load_config(self):
        """Connect to server and load workstation configuration"""
        api_url = self.api_url_var.get().strip()
        
        if not api_url:
            messagebox.showerror("Error", "Please enter Server URL")
            return

        # Check that API key is available from input, env, or encrypted config
        raw = self.api_key_var.get().strip()
        if raw == self.API_KEY_PLACEHOLDER or (raw and raw.startswith(('fernet:', 'base64:'))):
            raw = ""
        api_key = raw or os.environ.get('LAWFIRM_API_KEY') or os.environ.get('WORKSTATION_API_KEY') or os.environ.get('API_KEY')
        if not api_key and self.config.api_key:
            api_key = APIKeyEncryption.decrypt_key(self.config.api_key)
        if not api_key:
            messagebox.showerror(
                "Error",
                "API key is required to connect.\n\n"
                "Please:\n"
                "  1. Enter your API key in the field above\n"
                "  2. Click 'Save Configuration'\n"
                "  3. Then try connecting again"
            )
            return
        
        # Ensure API key is in environment for connection
        if not os.environ.get('LAWFIRM_API_KEY'):
            os.environ['LAWFIRM_API_KEY'] = api_key
        
        # Temporarily update config for connection test
        old_api_url = self.config.api_url
        self.config.api_url = api_url
        # API key comes from environment via ConfigManager - don't set manually
        self.api = WorkstationAPI(self.config)
        
        try:
            self.log("Connecting to server and loading configuration...")
            config_data = self.api.get_config()
            
            # If we already have a local workstation and server returns a different one,
            # do not overwrite local identity (avoid server config overwriting this machine's config)
            local_id = self.config.workstation_id
            server_id = config_data.get('id')
            preserve_local = False
            if local_id is not None and server_id is not None:
                try:
                    if int(local_id) != int(server_id):
                        preserve_local = True
                        self.log(f"Server returned different workstation (ID {server_id}, name '{config_data.get('name')}'). Keeping local workstation (ID {local_id}) and merging folders/drive only.")
                except (TypeError, ValueError):
                    pass

            server_drive_letter = config_data.get('virtualDriveLetter') or ''
            server_drive_path = config_data.get('virtualDrivePath') or ''
            self.drive_letter_var.set(server_drive_letter if server_drive_letter else (self.config.virtual_drive_letter or ''))
            self.drive_path_var.set(server_drive_path if server_drive_path else (self.config.virtual_drive_path or ''))

            if not preserve_local:
                server_name = config_data.get('name', '') or ''
                self.workstation_name_var.set(server_name)
                self.config.workstation_id = config_data.get('id')
                self.config.workstation_name = server_name.strip() or None

            # Update monitored folders list (always merge from server when we have server data)
            self.folder_listbox.delete(0, tk.END)
            for folder in config_data.get('monitoredFolders', []):
                self.folder_listbox.insert(tk.END, folder)

            # Update config: monitored folders and virtual drive from server
            self.config.monitored_folders = config_data.get('monitoredFolders', [])
            if server_drive_letter:
                self.config.virtual_drive_letter = server_drive_letter.strip().rstrip(':') or server_drive_letter
            if server_drive_path:
                self.config.virtual_drive_path = server_drive_path
            # Apply server-side conflict resolution policy (server is authoritative)
            server_policy = config_data.get('conflictResolutionPolicy')
            if server_policy:
                self.config.conflict_resolution = server_policy
                if hasattr(self, 'conflict_resolution_var'):
                    self.conflict_resolution_var.set(server_policy)
            self.config.save()

            display_name = config_data.get('name') if not preserve_local else self.workstation_name_var.get() or f"Workstation {local_id}"
            self.log(f"Configuration loaded successfully for: {display_name}")
            if preserve_local:
                messagebox.showinfo("Success",
                    f"Configuration merged from server.\n\n"
                    f"Kept your local workstation (ID {local_id}).\n"
                    f"Server had a different workstation ('{config_data.get('name')}'); only folders and drive settings were updated.\n\n"
                    f"Review and save if needed.")
            else:
                messagebox.showinfo("Success",
                    f"Configuration loaded successfully!\n\n"
                    f"Workstation: {config_data.get('name')}\n"
                    f"Computer: {config_data.get('computerName')}\n"
                    f"Folders: {len(config_data.get('monitoredFolders', []))}\n\n"
                    f"All fields have been pre-filled. Review and save if needed.")
            
            # Update connection status
            self.connection_label.config(text="Connection: Connected", foreground="green")
            
        except Exception as e:
            self.log(f"Failed to load configuration: {e}")
            messagebox.showerror("Error", f"Failed to connect or load configuration:\n{str(e)}")
            # Restore old config
            self.config.api_url = old_api_url
            self.api = WorkstationAPI(self.config)
            self.connection_label.config(text="Connection: Failed", foreground="red")
    
    def check_registration(self):
        if not self.config.api_key:
            self.log("Not registered. Please register in Configuration tab.")
            self.connection_label.config(text="Connection: Not Registered", foreground="red")
        else:
            self.refresh_workstation_info()
            # Check for updates after confirming registration
            self.check_for_updates()

    def check_for_updates(self):
        """Check for workstation monitor updates"""
        try:
            result = self.api.check_for_updates()
            if result.get('update_available'):
                latest_version = result.get('latest_version', 'Unknown')
                download_url = result.get('download_url')
                changelog = result.get('changelog', [])

                # Show update notification
                message = f"A new version of Workstation Monitor is available!\n\n" \
                         f"Current: {WORKSTATION_VERSION}\n" \
                         f"Latest: {latest_version}\n\n"

                if changelog:
                    message += "What's new:\n"
                    for item in changelog[:3]:  # Show first 3 items
                        message += f"• {item}\n"
                    message += "\n"

                message += "Would you like to download the update now?"

                if messagebox.askyesno("Update Available", message):
                    if download_url:
                        self.log(f"Opening download URL: {download_url}")
                        import webbrowser
                        webbrowser.open(download_url)
                    else:
                        messagebox.showinfo("Download", "Please check with your administrator for the download link.")
        except Exception as e:
            self.log(f"Update check failed: {e}")
            # Don't show error to user, just log it
    
    def auto_connect_and_start(self):
        """Automatically connect and start monitoring if configuration is present"""
        # Check if we have the minimum required configuration
        if not self.config.api_key:
            self.log("Auto-start: No API key configured, skipping auto-start")
            return
        
        if not self.config.api_url:
            self.log("Auto-start: No API URL configured, skipping auto-start")
            return
        
        # Check if we have monitored folders
        if not self.config.monitored_folders:
            self.log("Auto-start: No monitored folders configured, skipping auto-start")
            return
        
        try:
            self.log("Auto-start: Configuration detected, connecting to server...")
            
            # Update API with current config
            self.api = WorkstationAPI(self.config)
            
            # Test connection and load config from server
            if self.api.heartbeat():
                self.log("Auto-start: Connection successful, loading configuration from server...")
                
                try:
                    # Load config from server to ensure we have latest settings
                    config_data = self.api.get_config()
                    local_id = self.config.workstation_id
                    server_id = config_data.get('id')
                    # Do not overwrite local workstation identity if server returns a different workstation
                    if local_id is None or server_id is None:
                        self.config.workstation_id = config_data.get('id')
                    else:
                        try:
                            if int(local_id) != int(server_id):
                                self.log("Auto-start: Server returned different workstation; keeping local workstation ID and merging folders/drive only.")
                                # Do not set self.config.workstation_id
                            else:
                                self.config.workstation_id = config_data.get('id')
                        except (TypeError, ValueError):
                            self.config.workstation_id = config_data.get('id')
                    if config_data.get('monitoredFolders'):
                        self.config.monitored_folders = config_data.get('monitoredFolders', [])
                    vd_letter = config_data.get('virtualDriveLetter')
                    vd_path = config_data.get('virtualDrivePath')
                    if vd_letter is not None and str(vd_letter).strip():
                        self.config.virtual_drive_letter = str(vd_letter).strip().rstrip(':') or vd_letter
                    if vd_path is not None and str(vd_path).strip():
                        self.config.virtual_drive_path = str(vd_path).strip()
                    # Apply server-side conflict resolution policy (server is authoritative)
                    server_policy = config_data.get('conflictResolutionPolicy')
                    if server_policy:
                        self.config.conflict_resolution = server_policy
                    self.config.save()
                    
                    # Update UI
                    self.load_config()
                    self.refresh_workstation_info()
                    
                    self.log("Auto-start: Configuration loaded successfully")
                    
                    # Auto-start monitoring
                    if not self.monitoring:
                        self.log("Auto-start: Starting monitoring automatically...")
                        self.start_monitoring()
                    else:
                        self.log("Auto-start: Monitoring already running")
                        
                except Exception as e:
                    self.log(f"Auto-start: Failed to load config from server: {e}")
                    self.log("Auto-start: Continuing with local configuration...")
                    # Still try to start with local config
                    if not self.monitoring and self.config.monitored_folders:
                        self.log("Auto-start: Starting monitoring with local configuration...")
                        self.start_monitoring()
            else:
                self.log("Auto-start: Connection to server failed (heartbeat), starting with local configuration...")
                self.connection_label.config(text="Connection: Failed", foreground="red")
                if not self.monitoring and self.config.monitored_folders:
                    self.log("Auto-start: Starting monitoring with local configuration")
                    self.start_monitoring()
                
        except Exception as e:
            self.log(f"Auto-start: Error during auto-connect: {e}")
            self.log("Auto-start: You can manually start monitoring from the Status tab")
    
    def release_all_locks(self):
        """Release all locks held by this workstation"""
        if not self.config.api_key or not self.config.workstation_id:
            messagebox.showerror("Error", "Workstation not registered. Please register first.")
            return
        
        # Get all locks from server (not just tracked ones)
        self.log("Querying server for all locks held by this workstation...")
        server_locks = self.api.get_all_locks_for_workstation()
        
        # Also check locally tracked files
        local_locks = [doc_id for doc_id, info in self.opened_files.items() if info.get('lock_acquired')]
        
        # Combine and deduplicate
        all_lock_ids = set(local_locks)
        if isinstance(server_locks, list):
            all_lock_ids.update([lock['id'] for lock in server_locks])
        
        if not all_lock_ids:
            messagebox.showinfo("No Locks", "No files are currently locked by this workstation.")
            return
        
        # Confirm action
        lock_count = len(all_lock_ids)
        if not messagebox.askyesno(
            "Release All Locks",
            f"Release locks for {lock_count} file(s)?\n\n"
            "This will allow other users/workstations to edit these files."
        ):
            return
        
        released_count = 0
        failed_count = 0
        failed_docs = []
        
        # Release all locks found on server
        for doc_id in all_lock_ids:
            try:
                if self.api.release_file_lock(doc_id):
                    released_count += 1
                    self.log(f"Released lock for document {doc_id}")
                    # Remove from local tracking if present
                    if doc_id in self.opened_files:
                        del self.opened_files[doc_id]
                else:
                    failed_count += 1
                    # Try to get document name for error message
                    doc_name = "unknown"
                    if isinstance(server_locks, list):
                        for lock in server_locks:
                            if lock.get('id') == doc_id:
                                doc_name = lock.get('fileName', lock.get('title', 'unknown'))
                                break
                    failed_docs.append(f"Document {doc_id} ({doc_name})")
                    self.log(f"Failed to release lock for document {doc_id}")
            except Exception as e:
                failed_count += 1
                self.log(f"Error releasing lock for document {doc_id}: {e}")
        
        # Update status
        if released_count > 0:
            self.lock_status_label.config(
                text=f"✓ Released {released_count} lock(s) successfully",
                foreground="green"
            )
            message = f"Successfully released {released_count} lock(s)."
            if failed_count > 0:
                message += f"\n\n{failed_count} lock(s) could not be released:"
                message += "\n" + "\n".join(failed_docs[:5])  # Show first 5
                if len(failed_docs) > 5:
                    message += f"\n... and {len(failed_docs) - 5} more"
            messagebox.showinfo("Locks Released", message)
        else:
            self.lock_status_label.config(
                text=f"✗ Failed to release locks",
                foreground="red"
            )
            error_msg = f"Could not release any locks.\n\n"
            if failed_docs:
                error_msg += "Failed documents:\n" + "\n".join(failed_docs[:5])
                if len(failed_docs) > 5:
                    error_msg += f"\n... and {len(failed_docs) - 5} more"
            else:
                error_msg += "The locks may have already expired or been released."
            messagebox.showerror("Release Failed", error_msg)
        
        # Clear status after 5 seconds
        self.root.after(5000, lambda: self.lock_status_label.config(text="", foreground="black"))
    
    def refresh_workstation_info(self):
        if not self.config.api_key:
            self.workstation_info.config(state=tk.NORMAL)
            self.workstation_info.delete(1.0, tk.END)
            self.workstation_info.insert(tk.END, "Not registered. Please register in Configuration tab.")
            self.workstation_info.config(state=tk.DISABLED)
            return
        
        try:
            if self.api.heartbeat():
                self.connection_label.config(text="Connection: Connected", foreground="green")
                self.workstation_info.config(state=tk.NORMAL)
                self.workstation_info.delete(1.0, tk.END)
                # Check Tesseract status
                tesseract_status = "Not installed"
                ocr_status = "Not available"

                try:
                    import os
                    import subprocess
                    possible_paths = [
                        r'C:\Program Files\Tesseract-OCR\tesseract.exe',
                        r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe',
                        r'C:\Users\{}\AppData\Local\Tesseract-OCR\tesseract.exe'.format(os.environ.get('USERNAME', ''))
                    ]

                    for path in possible_paths:
                        if os.path.exists(path):
                            try:
                                result = subprocess.run([path, '--version'], capture_output=True, text=True, timeout=5)
                                if result.returncode == 0:
                                    tesseract_status = "Installed"
                                    ocr_status = "Available"
                                    break
                            except:
                                pass
                except:
                    pass

                info = f"""Workstation ID: {self.config.workstation_id}
API Key: {self.config.api_key[:30]}...
Server URL: {self.config.api_url}
Computer Name: {platform.node()}
Monitored Folders: {len(self.config.monitored_folders)}
Virtual Drive: {self.config.virtual_drive_letter or 'Not configured'}
Tesseract OCR: {tesseract_status}
OCR Functionality: {ocr_status}
Last Update: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
"""
                self.workstation_info.insert(tk.END, info)
                self.workstation_info.config(state=tk.DISABLED)
            else:
                self.connection_label.config(text="Connection: Failed", foreground="red")
        except Exception as e:
            self.connection_label.config(text=f"Connection: Error - {str(e)[:30]}", foreground="red")
    
    def start_monitoring(self):
        if not self.config.api_key:
            messagebox.showerror("Error", "Please register the workstation first")
            return
        
        if not self.config.monitored_folders:
            messagebox.showerror("Error", "Please add at least one monitored folder")
            return
        
        if self.monitoring:
            return
        
        self.monitoring = True
        self.start_button.config(state=tk.DISABLED)
        self.stop_button.config(state=tk.NORMAL)
        self.status_label.config(text="Status: Running", foreground="green")
        
        self.log("Starting monitor...")
        # Push sync_delete_to_server to server so it does not delete from our monitored folders when doc is deleted
        try:
            self.api.update_config(sync_delete_to_server=self.config.sync_delete_to_server)
        except Exception as e:
            self.log(f"Warning: Could not sync delete setting to server: {e}")
        
        def monitor_loop():
            try:
                # Mount virtual drive and ensure path exists
                if self.config.virtual_drive_letter and self.config.virtual_drive_path:
                    VirtualDriveManager.mount_drive(
                        self.config.virtual_drive_letter,
                        self.config.virtual_drive_path
                    )
                elif self.config.virtual_drive_path:
                    # Path set but no letter: ensure directory exists so sync can write files
                    vd_path = Path(self.config.virtual_drive_path)
                    if not vd_path.exists():
                        vd_path.mkdir(parents=True, exist_ok=True)
                        self.log(f"Created virtual drive path: {self.config.virtual_drive_path}")
                
                # Initialize virtual drive sync if configured
                vd_sync = None
                if self.config.virtual_drive_path and self.config.api_key:
                    try:
                        # Create callback to release locks after successful sync
                        def release_lock_after_sync(document_id: int):
                            """Release lock after file is successfully synced and copied to monitored folder"""
                            if document_id in self.opened_files:
                                file_info = self.opened_files[document_id]
                                if file_info.get('lock_acquired'):
                                    try:
                                        if self.api.release_file_lock(document_id):
                                            self.log(f"Auto-released lock for document {document_id} (file synced to monitored folder)")
                                            # Remove from tracking but keep file info for process monitoring
                                            file_info['lock_acquired'] = False
                                        else:
                                            self.log(f"Could not auto-release lock for document {document_id}")
                                    except Exception as e:
                                        self.log(f"Error auto-releasing lock for document {document_id}: {e}")
                        
                        def report_pending_delete(client_name: str, filename: str):
                            """Report preserved file so server shows as 'pending delete'; user can re-enable via Upload."""
                            try:
                                self.api.session.post(
                                    f"{self.config.api_url}/workstation-sync/pending-delete",
                                    json={"clientName": client_name, "fileName": filename},
                                    headers=self.api._headers(),
                                    timeout=10
                                )
                            except Exception as e:
                                self.log(f"Could not report pending delete: {e}")

                        vd_sync = VirtualDriveSync(
                            api_url=self.config.api_url,
                            api_key=self.config.api_key,
                            virtual_drive_path=self.config.virtual_drive_path,
                            monitored_folders=self.config.monitored_folders,
                            lock_release_callback=release_lock_after_sync,
                            conflict_resolution=self.config.conflict_resolution,
                            sync_delete_to_server=lambda: self.config.sync_delete_to_server,
                            report_pending_delete_callback=report_pending_delete,
                            log_callback=self.log
                        )
                        self.log("Virtual drive sync initialized")
                    except Exception as e:
                        self.log(f"Error initializing virtual drive sync: {e}")
                
                # Setup folder monitor
                event_handler = FolderMonitor(self.api, self.config, self.log)
                # Pass reference to GUI app for notifications
                event_handler.gui_app = self
                self.observer = Observer()
                
                for folder in self.config.monitored_folders:
                    folder_path = Path(folder)
                    if folder_path.exists() and folder_path.is_dir():
                        self.observer.schedule(event_handler, str(folder_path), recursive=True)
                        self.log(f"Monitoring folder: {folder}")
                    else:
                        self.log(f"Warning: Folder does not exist: {folder}")
                
                # Watch virtual drive if configured
                if self.config.virtual_drive_path:
                    from virtual_drive_monitor import VirtualDriveMonitor
                    
                    def handle_virtual_drive_deletion(client_id: Optional[int], filename: str, client_folder_name: str):
                        """Handle file deletion from virtual drive"""
                        # Skip if feature is disabled
                        if not self.config.sync_delete_to_server:
                            return
                        
                        try:
                            # If we don't have client_id, search for it
                            if not client_id:
                                search_result = self.api.search_client(client_folder_name)
                                if search_result.get('found') and search_result.get('clients'):
                                    client_id = search_result['clients'][0]['id']
                                else:
                                    self.log(f"⚠️ Could not find client ID for: {client_folder_name}")
                                    return
                            
                            # Delete from server
                            result = self.api.delete_document(client_id, filename)
                            
                            if result.get('success'):
                                self.log(f"✅ Virtual drive deletion synced to server: {filename}")
                            else:
                                self.log(f"⚠️ Failed to sync virtual drive deletion: {result.get('error', 'Unknown error')}")
                        except Exception as e:
                            self.log(f"Error handling virtual drive deletion: {e}")
                    
                    vd_monitor = VirtualDriveMonitor(handle_virtual_drive_deletion, self.log)
                    vd_path = Path(self.config.virtual_drive_path)
                    if vd_path.exists() and vd_path.is_dir():
                        self.observer.schedule(vd_monitor, str(vd_path), recursive=True)
                        self.log(f"Monitoring virtual drive: {self.config.virtual_drive_path}")
                    else:
                        self.log(f"Warning: Virtual drive path does not exist: {self.config.virtual_drive_path}")
                
                self.observer.start()
                
                # Start polling for file open requests
                self.stop_open_requests = False
                self.open_requests_thread = threading.Thread(target=self.poll_open_requests, daemon=True)
                self.open_requests_thread.start()
                self.log("File open request polling started")
                
                # Initial scan
                self.log("Performing initial scan...")
                for folder in self.config.monitored_folders:
                    folder_path = Path(folder)
                    if folder_path.exists():
                        try:
                            resolved = folder_path.resolve()
                            all_items = list(folder_path.iterdir())
                            subdirs = [item for item in all_items if item.is_dir()]
                            # Log exactly what the OS returns so we can see path vs contents
                            self.log(f"Scanning '{resolved}': {len(subdirs)} subfolder(s), {len(all_items)} item(s) total")
                            if all_items:
                                for item in all_items:
                                    kind = "dir" if item.is_dir() else "file"
                                    self.log(f"  - {item.name} ({kind})")
                            for item in subdirs:
                                event_handler.process_folder(str(item))
                        except Exception as e:
                            self.log(f"Error listing monitored folder '{folder_path}': {e}")
                    else:
                        self.log(f"Monitored folder does not exist: {folder}")
                
                # Initial sync from server
                if vd_sync:
                    self.log("Performing initial sync from server...")
                    try:
                        stats = vd_sync.sync_from_server()
                        self.log(f"Initial sync: {stats['downloaded']} downloaded, {stats['updated']} updated, {stats['errors']} errors")
                        for detail in (stats.get('error_details') or [])[:3]:
                            self.log(f"  Sync error: {detail}")
                    except Exception as e:
                        self.log(f"Error in initial sync: {e}")
                
                # Main loop
                last_heartbeat = 0
                last_scan = 0
                last_sync_from_server = 0
                last_sync_to_server = 0
                
                while self.monitoring:
                    current_time = time.time()
                    
                    if current_time - last_heartbeat > 300:
                        if self.api.heartbeat():
                            self.root.after(0, lambda: self.connection_label.config(
                                text="Connection: Connected", foreground="green"
                            ))
                        last_heartbeat = current_time
                    
                    # Sync from server (download updates)
                    if vd_sync and current_time - last_sync_from_server > self.config.virtual_drive_sync_interval:
                        self.log("Syncing from server...")
                        try:
                            stats = vd_sync.sync_from_server()
                            self.log(f"Sync from server: {stats['downloaded']} downloaded, {stats['updated']} updated, {stats['errors']} errors")
                            for detail in (stats.get('error_details') or [])[:3]:
                                self.log(f"  Sync error: {detail}")
                        except Exception as e:
                            self.log(f"Error syncing from server: {e}")
                        last_sync_from_server = current_time
                    
                    # Sync to server (upload changes)
                    if vd_sync and current_time - last_sync_to_server > self.config.virtual_drive_sync_interval:
                        self.log("Syncing to server...")
                        try:
                            stats = vd_sync.sync_to_server()
                            self.log(f"Sync to server: {stats['uploaded']} uploaded, {stats['locked']} locked, {stats['errors']} errors")
                        except Exception as e:
                            self.log(f"Error syncing to server: {e}")
                        last_sync_to_server = current_time
                    
                    if current_time - last_scan > self.config.check_interval:
                        self.log("Performing periodic scan...")
                        # Clear processed folders periodically to allow re-scanning after client approval
                        event_handler.processed_folders.clear()
                        for folder in self.config.monitored_folders:
                            folder_path = Path(folder)
                            if folder_path.exists():
                                try:
                                    resolved = folder_path.resolve()
                                    all_items = list(folder_path.iterdir())
                                    subdirs = [item for item in all_items if item.is_dir()]
                                    self.log(f"Scanning '{resolved}': {len(subdirs)} subfolder(s), {len(all_items)} item(s) total")
                                    if all_items:
                                        for item in all_items:
                                            kind = "dir" if item.is_dir() else "file"
                                            self.log(f"  - {item.name} ({kind})")
                                    for item in subdirs:
                                        event_handler.process_folder(str(item))
                                except Exception as e:
                                    self.log(f"Error listing monitored folder '{folder_path}': {e}")
                            else:
                                self.log(f"Monitored folder does not exist: {folder}")
                        last_scan = current_time
                    
                    time.sleep(10)
                
                # Stop polling for open requests
                self.stop_open_requests = True
                
                # Stop file lock monitoring
                self.stop_file_lock_monitor = True
                
                # Release all locks for opened files
                for doc_id in list(self.opened_files.keys()):
                    if self.opened_files[doc_id].get('lock_acquired'):
                        try:
                            self.api.release_file_lock(doc_id)
                            self.log(f"Released lock for document {doc_id}")
                        except:
                            pass
                
                if self.observer:
                    self.observer.stop()
                    try:
                        self.observer.join(timeout=5)
                    except:
                        pass
                
                if self.config.virtual_drive_letter:
                    VirtualDriveManager.force_unmount_drive(self.config.virtual_drive_letter)
                
                self.log("Monitor stopped.")
            except Exception as e:
                self.log(f"Monitor error: {e}")
            finally:
                self.root.after(0, self.monitoring_stopped)
        
        self.monitor_thread = threading.Thread(target=monitor_loop, daemon=True)
        self.monitor_thread.start()
    
    def monitoring_stopped(self):
        self.monitoring = False
        self.start_button.config(state=tk.NORMAL)
        self.stop_button.config(state=tk.DISABLED)
        self.status_label.config(text="Status: Stopped", foreground="black")
    
    def poll_open_requests(self):
        """Background thread to poll for file open requests"""
        while not self.stop_open_requests:
            try:
                if self.config.api_key:
                    result = self.api.get_open_requests()
                    requests = result.get('requests', [])
                    
                    for req in requests:
                        file_path = req.get('filePath')
                        file_name = req.get('fileName', 'Unknown')
                        client_name = req.get('clientName', 'Unknown')
                        document_id = req.get('documentId')
                        
                        if file_path:
                            self.log(f"Opening file request: {file_name} for {client_name}")
                            self.open_file(file_path, file_name, document_id)
                    
                    if requests:
                        self.log(f"Processed {len(requests)} file open request(s)")
                
                # Poll every 30 seconds with random jitter to avoid rate limiting
                jitter = random.uniform(0, 5)  # Add up to 5 seconds of random delay
                time.sleep(30 + jitter)
            except Exception as e:
                self.log(f"Error polling open requests: {e}")
                time.sleep(60)  # Wait longer on error (1 minute)
    
    def open_file(self, file_path: str, file_name: str, document_id: Optional[int] = None):
        """Open a file using the configured default program and acquire lock if document_id provided"""
        try:
            # Acquire lock if document_id is provided
            lock_acquired = False
            if document_id:
                try:
                    if self.api.acquire_file_lock(document_id):
                        self.log(f"Lock acquired for document {document_id}")
                        lock_acquired = True
                    else:
                        # Lock acquisition failed - show warning to user
                        self.log(f"Warning: Could not acquire lock for document {document_id} (may be locked by another user)")
                        messagebox.showwarning(
                            "File Locked",
                            f"The file '{file_name}' is currently locked by another user or workstation.\n\n"
                            "The file will still open, but your changes may not sync if the file is being edited elsewhere.\n\n"
                            "Please coordinate with other users before making changes."
                        )
                except Exception as e:
                    self.log(f"Error acquiring lock: {e}")
                    messagebox.showwarning(
                        "Lock Warning",
                        f"Could not acquire lock for '{file_name}': {str(e)}\n\n"
                        "The file will still open, but please be aware that it may be in use by another user."
                    )
            # Normalize the path - ensure Windows path format
            # Replace forward slashes with backslashes
            file_path = file_path.replace('/', '\\')
            
            # Ensure drive letter has colon if it's a drive path
            if len(file_path) >= 2 and file_path[1] != ':' and file_path[0].isalpha():
                # Looks like a drive letter without colon (e.g., "Z\clients" -> "Z:\clients")
                file_path = f"{file_path[0]}:{file_path[1:]}"
            
            # Check if file exists at the exact path first
            if os.path.exists(file_path):
                # File exists at exact path, open it
                ext = os.path.splitext(file_name)[1].lower()
                if not ext:
                    ext = os.path.splitext(file_path)[1].lower()
                
                program_path = self.config.default_programs.get(ext)
                
                if program_path and os.path.exists(program_path):
                    self.log(f"Opening {file_name} with {program_path}")
                    process = subprocess.Popen([program_path, file_path], shell=False)
                    # Track opened file if document_id provided
                    if document_id and process:
                        self.opened_files[document_id] = {
                            'process': process,
                            'file_path': file_path,
                            'lock_acquired': lock_acquired
                        }
                        # Start monitoring thread if not already started
                        if not self.file_lock_monitor_thread or not self.file_lock_monitor_thread.is_alive():
                            self.stop_file_lock_monitor = False
                            self.file_lock_monitor_thread = threading.Thread(target=self.monitor_file_locks, daemon=True)
                            self.file_lock_monitor_thread.start()
                    # Bring window to front after a short delay, using process ID
                    process_id = process.pid if process else None
                    threading.Timer(0.8, lambda: bring_file_window_to_front(file_path, program_path, process_id)).start()
                else:
                    self.log(f"Opening {file_name} with default program")
                    # For os.startfile, we can't track the process easily, but we can still track the lock
                    if document_id:
                        self.opened_files[document_id] = {
                            'process': None,  # Can't track process for startfile
                            'file_path': file_path,
                            'lock_acquired': lock_acquired,
                            'start_time': time.time()  # Track when opened, release after timeout
                        }
                    os.startfile(file_path)
                    # Bring window to front after a short delay
                    threading.Timer(0.8, lambda: bring_file_window_to_front(file_path)).start()
                return
            
            # File not found at exact path - try to find it by searching in clients directory
            # Extract drive letter and path components
            path_parts = file_path.replace('/', '\\').split('\\')
            if len(path_parts) >= 3 and path_parts[1] == 'clients':
                drive_letter = path_parts[0]
                # Ensure drive letter has colon
                if not drive_letter.endswith(':'):
                    drive_letter = f"{drive_letter}:"
                expected_client_folder = path_parts[2]
                # Filename is now just the original filename (no document ID prefix)
                expected_filename = '\\'.join(path_parts[3:]) if len(path_parts) > 3 else file_name
                
                # Try to find the actual client folder (might have different sanitization)
                clients_dir = Path(f"{drive_letter}\\clients")
                if clients_dir.exists():
                    # Look for client folders that might match
                    for client_folder in clients_dir.iterdir():
                        if client_folder.is_dir():
                            # Try new format first: just filename
                            potential_file = client_folder / expected_filename
                            
                            # If not found, try old format: {documentId}_{filename}
                            if not potential_file.exists():
                                # Extract document ID from expected path if available
                                # expected_filename might be in format {id}_{filename} from old system
                                if '_' in expected_filename:
                                    parts = expected_filename.split('_', 1)
                                    if len(parts) >= 2:
                                        # Try to find file with just the filename part
                                        potential_file = client_folder / parts[1]
                            
                            # Also search by just the filename (original name)
                            if not potential_file.exists():
                                # Search for any file with the same name (in case of format mismatch)
                                for file_in_folder in client_folder.iterdir():
                                    if file_in_folder.is_file():
                                        # Check if it matches the original filename
                                        if file_in_folder.name == file_name or file_in_folder.name.endswith(file_name):
                                            potential_file = file_in_folder
                                            break
                                        # Also check old format: {id}_{filename}
                                        if '_' in file_in_folder.name:
                                            parts = file_in_folder.name.split('_', 1)
                                            if len(parts) >= 2 and parts[1] == file_name:
                                                potential_file = file_in_folder
                                                break
                            
                            if potential_file.exists():
                                # Found the file! Open it
                                ext = os.path.splitext(file_name)[1].lower()
                                if not ext:
                                    ext = os.path.splitext(str(potential_file))[1].lower()
                                
                                program_path = self.config.default_programs.get(ext)
                                
                                if program_path and os.path.exists(program_path):
                                    self.log(f"Opening {file_name} with {program_path} (found in {client_folder.name})")
                                    process = subprocess.Popen([program_path, str(potential_file)], shell=False)
                                    # Track opened file if document_id provided
                                    if document_id and process:
                                        self.opened_files[document_id] = {
                                            'process': process,
                                            'file_path': str(potential_file),
                                            'lock_acquired': lock_acquired
                                        }
                                    # Bring window to front after a short delay, using process ID
                                    process_id = process.pid if process else None
                                    threading.Timer(0.8, lambda: bring_file_window_to_front(str(potential_file), program_path, process_id)).start()
                                else:
                                    self.log(f"Opening {file_name} with default program (found in {client_folder.name})")
                                    if document_id:
                                        self.opened_files[document_id] = {
                                            'process': None,
                                            'file_path': str(potential_file),
                                            'lock_acquired': lock_acquired,
                                            'start_time': time.time()
                                        }
                                    os.startfile(str(potential_file))
                                    # Bring window to front after a short delay
                                    threading.Timer(0.8, lambda: bring_file_window_to_front(str(potential_file))).start()
                                return
                    
                    # If we get here, file wasn't found in any client folder
                    self.log(f"Error: File not found: {file_path}")
                    messagebox.showerror("File Not Found", f"Could not find file:\n{file_path}\n\nSearched in clients directory but file was not found.\n\nPlease ensure the virtual drive is mounted and the file exists.")
                else:
                    self.log(f"Error: Clients directory not found: {clients_dir}")
                    messagebox.showerror("File Not Found", f"Could not find clients directory:\n{clients_dir}\n\nPlease ensure the virtual drive is mounted.")
            else:
                self.log(f"Error: File not found: {file_path}")
                messagebox.showerror("File Not Found", f"Could not find file:\n{file_path}\n\nPlease ensure the virtual drive is mounted and the file exists.")
        except Exception as e:
            self.log(f"Error opening file {file_path}: {e}")
            messagebox.showerror("Error", f"Failed to open file:\n{file_path}\n\nError: {e}")
            # Release lock if we acquired it
            if document_id and document_id in self.opened_files:
                if self.opened_files[document_id].get('lock_acquired'):
                    try:
                        self.api.release_file_lock(document_id)
                    except:
                        pass
                del self.opened_files[document_id]
    
    def monitor_file_locks(self):
        """Monitor opened files and release locks when processes close"""
        while not self.stop_file_lock_monitor:
            try:
                time.sleep(5)  # Check every 5 seconds
                
                for doc_id in list(self.opened_files.keys()):
                    file_info = self.opened_files[doc_id]
                    process = file_info.get('process')
                    lock_acquired = file_info.get('lock_acquired', False)
                    
                    if process:
                        # Check if process is still running
                        if process.poll() is not None:
                            # Process has terminated, release lock
                            if lock_acquired:
                                try:
                                    self.api.release_file_lock(doc_id)
                                    self.log(f"Released lock for document {doc_id} (process closed)")
                                except Exception as e:
                                    self.log(f"Error releasing lock for document {doc_id}: {e}")
                            del self.opened_files[doc_id]
                    elif 'start_time' in file_info:
                        # For os.startfile, we can't track process, so use timeout (30 minutes)
                        if time.time() - file_info['start_time'] > 1800:
                            # Timeout reached, release lock
                            if lock_acquired:
                                try:
                                    self.api.release_file_lock(doc_id)
                                    self.log(f"Released lock for document {doc_id} (timeout)")
                                except Exception as e:
                                    self.log(f"Error releasing lock for document {doc_id}: {e}")
                            del self.opened_files[doc_id]
            except Exception as e:
                self.log(f"Error in file lock monitor: {e}")
                time.sleep(10)  # Wait longer on error
    
    def stop_monitoring(self):
        self.log("Stopping monitor...")
        self.monitoring = False
    
    def on_minimize(self, event=None):
        """Handle window minimize event"""
        # Only minimize to tray if system tray is available and window is being minimized
        if SYSTEM_TRAY_AVAILABLE and event and hasattr(self, 'tray'):
            try:
                # Check if window is actually minimized (iconified)
                if self.root.state() == 'iconic':
                    # Auto-minimize to tray after a short delay
                    self.root.after(100, lambda: self.minimize_to_tray(None, None))
            except:
                pass

    def on_closing(self):
        """Handle window close event"""
        if self.monitoring:
            if messagebox.askokcancel("Quit", "Monitoring is active. Stop monitoring and unmount virtual drive?"):
                self.stop_monitoring()
                # Wait a moment for monitoring to stop
                self.root.after(1000, self._cleanup_and_exit)
            else:
                return  # User cancelled
        else:
            self._cleanup_and_exit()
    
    def _cleanup_and_exit(self):
        """Cleanup resources and exit"""
        self.log("Cleaning up and exiting...")
        
        # Stop observer if running
        if self.observer:
            try:
                self.observer.stop()
                self.observer.join(timeout=2)
            except:
                pass
        
        # Force unmount virtual drive
        if self.config.virtual_drive_letter:
            self.log("Unmounting virtual drive...")
            VirtualDriveManager.force_unmount_drive(self.config.virtual_drive_letter)
        
        # Destroy window
        self.root.destroy()
    
    def clear_logs(self):
        self.log_text.delete(1.0, tk.END)
    
    def refresh_logs(self):
        if LOG_FILE.exists():
            try:
                with open(LOG_FILE, 'r') as f:
                    content = f.read()
                    self.log_text.delete(1.0, tk.END)
                    self.log_text.insert(1.0, content)
                    self.log_text.see(tk.END)
            except Exception as e:
                self.log(f"Error reading log file: {e}")


def check_and_install_tesseract_gui():
    """Check if Tesseract OCR is installed and offer to install it (GUI version)"""
    import os

    # Check if Tesseract executable exists (more reliable than pytesseract)
    possible_paths = [
        r'C:\Program Files\Tesseract-OCR\tesseract.exe',
        r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe',
        r'C:\Users\{}\AppData\Local\Tesseract-OCR\tesseract.exe'.format(os.environ.get('USERNAME', '')),
    ]

    for path in possible_paths:
        if os.path.exists(path):
            # Verify it actually works by running it
            try:
                import subprocess
                result = subprocess.run([path, '--version'], capture_output=True, text=True, timeout=5)
                if result.returncode == 0:
                    return True
            except:
                pass

    # Tesseract not found or not working

    # Tesseract not available, check if we can show GUI dialog
    try:
        # Try to create a test window to see if GUI is available
        test_root = tk.Tk()
        test_root.withdraw()
        test_root.destroy()

        # GUI is available, show dialog
        root = tk.Tk()
        root.withdraw()  # Hide the main window

        result = messagebox.askyesno(
            "Tesseract OCR Required",
            "Tesseract OCR is required for processing scanned documents and images.\n\n"
            "Would you like to install Tesseract OCR now?\n\n"
            "Note: Administrator privileges are required for installation.\n"
            "You will see a User Account Control (UAC) prompt.",
            icon='question'
        )

        root.destroy()

        if result:
            return install_tesseract_gui()
        else:
            return False

    except tk.TclError:
        # No GUI display available, fall back to console message
        print("\n" + "=" * 60)
        print("Tesseract OCR Not Found")
        print("=" * 60)
        print()
        print("Tesseract OCR is required for processing scanned documents and images.")
        print("Without it, the File Organizer cannot read text from JPG, PNG, and other image files.")
        print()
        print("Please install Tesseract OCR manually:")
        print("1. Visit: https://github.com/UB-Mannheim/tesseract/wiki")
        print("2. Download the Windows installer (tesseract-ocr-w64-setup-*.exe)")
        print("3. Run the installer and follow the setup wizard")
        print("4. Restart the workstation monitor")
        print()
        input("Press Enter to continue...")
        return False

def install_tesseract_gui():
    """Attempt to install Tesseract OCR automatically (GUI version)"""
    try:
        import subprocess
        import platform

        if platform.system() == "Windows":
            try:
                # Try winget first
                print("Trying to install Tesseract OCR with winget...")
                result = subprocess.run(
                    ["winget", "install", "--id", "UB-Mannheim.TesseractOCR", "--accept-source-agreements", "--accept-package-agreements"],
                    capture_output=True, text=True, timeout=300
                )
                if result.returncode == 0:
                    try:
                        # Try to show success message
                        messagebox.showinfo("Success", "Tesseract OCR installed successfully!")
                    except tk.TclError:
                        print("✅ Tesseract OCR installed successfully!")
                    return True
                else:
                    print("Winget installation failed, trying manual download...")
            except (subprocess.TimeoutExpired, FileNotFoundError):
                print("Winget not available, trying manual download...")

            # Try manual download
            try:
                import urllib.request
                import tempfile

                print("Downloading Tesseract OCR installer...")

                # Check if GUI is available for progress dialog
                gui_available = True
                try:
                    test_root = tk.Tk()
                    test_root.withdraw()
                    test_root.destroy()
                except tk.TclError:
                    gui_available = False

                progress_root = None
                if gui_available:
                    # Show progress dialog
                    progress_root = tk.Tk()
                    progress_root.title("Installing Tesseract OCR")
                    ttk.Label(progress_root, text="Downloading Tesseract OCR...").pack(pady=10)
                    progress = ttk.Progressbar(progress_root, mode='indeterminate')
                    progress.pack(pady=10, padx=20)
                    progress.start()

                # Try multiple download URLs in order of preference
                tesseract_urls = [
                    "https://github.com/UB-Mannheim/tesseract/releases/download/v5.4.0.20240606/tesseract-ocr-w64-setup-5.4.0.20240606.exe",
                    "https://digi.bib.uni-mannheim.de/tesseract/tesseract-ocr-w64-setup-v5.3.4.20241106.exe",
                    "https://github.com/UB-Mannheim/tesseract/wiki"
                ]

                tesseract_url = None
                for url in tesseract_urls[:-1]:  # Try all URLs except the wiki
                    try:
                        with urllib.request.urlopen(url) as test_response:
                            if test_response.status == 200:
                                tesseract_url = url
                                print(f"Found working download URL: {url}")
                                break
                    except:
                        continue

                if not tesseract_url:
                    # If no direct download works, show wiki page
                    print("Could not find direct download. Please visit the Tesseract wiki for manual installation.")
                    try:
                        import webbrowser
                        webbrowser.open(tesseract_urls[-1])
                    except:
                        pass
                    raise Exception("No working download URL found. Please visit https://github.com/UB-Mannheim/tesseract/wiki for manual installation.")

                with tempfile.NamedTemporaryFile(suffix='.exe', delete=False) as temp_file:
                    with urllib.request.urlopen(tesseract_url) as response:
                        temp_file.write(response.read())
                    installer_path = temp_file.name

                if progress_root:
                    progress_root.destroy()

                print("Running Tesseract OCR installer (requires administrator privileges)...")

                # Run installer with elevated privileges on Windows
                if platform.system() == "Windows":
                    try:
                        # Use PowerShell to run the installer as administrator
                        ps_command = f'Start-Process "{installer_path}" -Verb RunAs -Wait'
                        result = subprocess.run(
                            ["powershell", "-Command", ps_command],
                            capture_output=True,
                            text=True,
                            timeout=300  # 5 minutes timeout
                        )

                        if result.returncode == 0:
                            print("✅ Tesseract installer completed successfully!")
                        else:
                            print("⚠️ Tesseract installer may have been cancelled or failed")
                            print("Please check if Tesseract was installed successfully")

                    except subprocess.TimeoutExpired:
                        print("❌ Tesseract installer timed out")
                        print("The installer may still be running - please complete it manually")
                    except Exception as e:
                        print(f"❌ Failed to run installer with elevated privileges: {e}")
                        print("Please run the installer manually as administrator:")
                        print(f'   "{installer_path}"')
                        # Don't clean up the installer file so user can run it manually
                        installer_path = None
                else:
                    # For non-Windows systems, run normally
                    result = subprocess.run([installer_path], capture_output=True)

                # Clean up
                try:
                    import os
                    os.unlink(installer_path)
                except:
                    pass

                if result.returncode == 0:
                    try:
                        messagebox.showinfo("Success", "Tesseract OCR installer launched!\n\nPlease complete the installation wizard.")
                    except tk.TclError:
                        print("✅ Tesseract OCR installer launched successfully!")
                        print("Please complete the installation wizard.")
                    return True
                else:
                    error_msg = "Tesseract OCR installer may have failed"

            except Exception as e:
                error_msg = f"Failed to install Tesseract OCR: {str(e)}"

        else:
            error_msg = "Automatic Tesseract installation is only supported on Windows."

    except Exception as e:
        error_msg = f"Tesseract installation failed: {str(e)}"

    # Show error message
    try:
        messagebox.showerror("Installation Failed", error_msg)
    except tk.TclError:
        print(f"❌ {error_msg}")
        print("\nManual Installation Instructions:")
        print("1. Visit: https://github.com/UB-Mannheim/tesseract/wiki")
        print("2. Download the Windows installer (tesseract-ocr-w64-setup-*.exe)")
        print("3. Run the installer and follow the setup wizard")
        print("4. Restart the workstation monitor")

    return False

def main():
    # Check for existing instance
    import tempfile
    import os

    lock_file = os.path.join(tempfile.gettempdir(), 'workstation_monitor.lock')
    if os.path.exists(lock_file):
        try:
            with open(lock_file, 'r') as f:
                pid = int(f.read().strip())
            # Check if process is still running
            if PSUTIL_AVAILABLE:
                import psutil
                if psutil.pid_exists(pid):
                    Config.log("Another instance of Workstation Monitor is already running (PID: {}). Exiting.".format(pid))
                    print("Another instance of Workstation Monitor is already running.")
                    print("Please close the existing instance before starting a new one.")
                    return
            else:
                # Fallback: check if any pythonw.exe is running (basic check)
                try:
                    import subprocess
                    result = subprocess.run(['tasklist', '/fi', 'imagename eq pythonw.exe', '/nh'],
                                          capture_output=True, text=True, timeout=5)
                    if 'pythonw.exe' in result.stdout and len(result.stdout.strip().split('\n')) > 1:
                        Config.log("Another instance of Workstation Monitor may be running. Exiting.")
                        print("Another instance of Workstation Monitor may be running.")
                        print("Please close existing instances before starting a new one.")
                        return
                except:
                    pass  # Continue if tasklist fails
        except (ValueError, psutil.NoSuchProcess, psutil.AccessDenied):
            pass  # Lock file is stale, continue

    # Create lock file with current PID
    try:
        with open(lock_file, 'w') as f:
            f.write(str(os.getpid()))
    except Exception as e:
        Config.log(f"Warning: Could not create lock file: {e}")

    # Check if GUI environment is available
    gui_available = False
    try:
        # Test if we can create a minimal tkinter instance
        test_root = tk.Tk()
        test_root.withdraw()
        # Try to get screen dimensions to verify GUI works
        width = test_root.winfo_screenwidth()
        height = test_root.winfo_screenheight()
        test_root.destroy()
        if width > 0 and height > 0:
            gui_available = True
            print("GUI environment detected - screen size: {}x{}".format(width, height))
        else:
            gui_available = False
    except tk.TclError as e:
        gui_available = False
        print("\n" + "="*60)
        print("GUI UNAVAILABLE - Running in Console Mode")
        print("="*60)
        print()
        print("This environment doesn't support graphical windows.")
        print("Error:", str(e))
        print()
        print("The workstation monitor will run with limited functionality.")
        print("For full GUI features, run on a Windows system with desktop.")
        print()

    def cleanup_lock_file():
        """Clean up lock file on exit"""
        try:
            if os.path.exists(lock_file):
                os.remove(lock_file)
        except:
            pass

    # Register cleanup on exit
    import atexit
    atexit.register(cleanup_lock_file)

    if gui_available:
        # GUI environment available - run full GUI
        print("GUI environment detected - starting full interface...")
        check_and_install_tesseract_gui()

        root = tk.Tk()
        app = WorkstationMonitorGUI(root)
        root.mainloop()
    else:
        # CLI-only environment - show console interface
        print("CLI-only mode - checking Tesseract OCR...")

        # Run Tesseract check in console mode (using direct executable check)
        import os
        import subprocess

        possible_paths = [
            r'C:\Program Files\Tesseract-OCR\tesseract.exe',
            r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe',
            r'C:\Users\{}\AppData\Local\Tesseract-OCR\tesseract.exe'.format(os.environ.get('USERNAME', '')),
        ]

        tesseract_found = False
        for path in possible_paths:
            if os.path.exists(path):
                try:
                    result = subprocess.run([path, '--version'], capture_output=True, text=True, timeout=5)
                    if result.returncode == 0:
                        version = result.stdout.split('\n')[0] if result.stdout else 'Unknown'
                        print(f"✅ Tesseract OCR found: {version}")
                        print("✅ OCR functionality available")
                        tesseract_found = True
                        break
                except Exception:
                    continue

        if not tesseract_found:
            print("❌ Tesseract OCR not found")
            print("For OCR functionality, please install Tesseract manually:")
            print("https://github.com/UB-Mannheim/tesseract/wiki")

        print("\nTo use the full GUI, run on a Windows system with desktop environment.")
        print("Press Ctrl+C to exit.")
        try:
            while True:
                import time
                time.sleep(1)
        except KeyboardInterrupt:
            print("\nExiting CLI mode...")


if __name__ == '__main__':
    main()

