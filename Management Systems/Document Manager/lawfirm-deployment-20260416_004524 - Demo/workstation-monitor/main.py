"""
Law Firm Workstation Monitor
Monitors specified folders for client documents and syncs with the web application.
"""

import os
import sys
import json
import time
import subprocess
import platform
import signal
import atexit
import hashlib
from pathlib import Path
from typing import List, Dict, Optional
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from virtual_drive_sync import VirtualDriveSync
from file_organizer import FileOrganizer, FileOrganizerAPI
from file_sync import is_word_temp_file
from config_manager import ConfigManager

# Configuration
CONFIG_FILE = Path(__file__).parent / "config.json"
CONFIG_MANAGER = ConfigManager()
LOG_FILE = Path(__file__).parent / "monitor.log"
UPLOAD_STATE_FILE = Path(__file__).parent / ".upload_state.json"


class Config:
    def __init__(self):
        self.api_url = "http://localhost:5002/api"  # Default to correct port
        self.api_key = None
        self.workstation_id = None
        self.monitored_folders: List[str] = []
        self.virtual_drive_letter = None
        self.virtual_drive_path = None
        self.check_interval = 60  # seconds
        self.virtual_drive_sync_interval = 60  # seconds
        self.file_lock_check_interval = 10  # seconds
        self.conflict_resolution = "server_wins"
        # File Organizer configuration
        self.file_organizer_enabled = True
        self.file_organizer_scan_interval = (
            600  # 10 minutes (reduced frequency to avoid slowing main processing)
        )
        self.file_organizer_confidence_threshold = 0.8
        self.file_organizer_max_text_length = 50000
        # Sync deletion settings
        self.sync_delete_to_server = True  # Enable/disable manual deletion sync
        # SSL/TLS configuration for HTTPS
        self.verify_ssl = True  # Verify SSL certificates by default (will be auto-detected based on URL)
        self.ca_cert_path = None  # Optional path to CA certificate file for self-signed certs
        self._ssl_explicitly_set = False  # Track if verify_ssl was explicitly set in config
        self.load()
        # Auto-detect SSL verification based on URL if not explicitly set in config
        if not self._ssl_explicitly_set:
            self.verify_ssl = self._auto_detect_ssl_verification(self.api_url)
        # Save config after loading to ensure it persists
        if self.api_key and self.workstation_id:
            self.save()

    def _auto_detect_ssl_verification(self, api_url: str) -> bool:
        """
        Automatically detect SSL verification settings based on URL.
        
        Rules:
        - HTTP localhost → True (SSL not used, but warns about security)
        - HTTPS localhost → False (self-signed certs expected)
        - HTTP production → True (SSL not used, but warns to use HTTPS)
        - HTTPS production → True (CA-signed certs)
        """
        if not api_url:
            return True  # Default to secure
        
        api_url_lower = api_url.lower()
        
        # HTTP URLs - warn about security but set verify_ssl appropriately
        if api_url_lower.startswith("http://"):
            if "localhost" in api_url_lower or "127.0.0.1" in api_url_lower:
                self.log("⚠️  HTTP localhost detected → No SSL encryption (consider using https://localhost for better security)")
                return True  # Doesn't matter for HTTP, but default to secure
            else:
                self.log("⚠️  HTTP production URL detected → No SSL encryption (STRONGLY recommend using HTTPS)")
                return True  # Doesn't matter for HTTP, but default to secure
        
        # HTTPS URLs - check if localhost
        if api_url_lower.startswith("https://"):
            # Localhost/127.0.0.1 typically uses self-signed certs
            if "localhost" in api_url_lower or "127.0.0.1" in api_url_lower:
                self.log("🔒 Auto-detected: localhost HTTPS → SSL verification disabled (self-signed cert expected)")
                return False
            # Production domains use CA-signed certs
            else:
                self.log("🔒 Auto-detected: production HTTPS → SSL verification enabled (CA-signed cert)")
                return True
        
        # Default to secure
        return True

    def load(self):
        """Load configuration from file and environment variables"""
        # First try to load API key from environment variables (more secure)
        env_api_key = CONFIG_MANAGER.get_api_key(CONFIG_FILE)
        api_key_source = "config file"
        
        if CONFIG_FILE.exists():
            try:
                with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    old_api_url = self.api_url
                    self.api_url = data.get("api_url", self.api_url)
                    # Auto-update SSL verification if URL changed
                    if old_api_url != self.api_url:
                        self.verify_ssl = self._auto_detect_ssl_verification(self.api_url)
                    # Use environment variable if available; otherwise config file (decrypt if stored as fernet/base64)
                    if env_api_key:
                        self.api_key = env_api_key
                    else:
                        raw = data.get("api_key")
                        self.api_key = ConfigManager.decrypt_api_key(raw) if raw else raw
                    if env_api_key:
                        api_key_source = "environment variable (LAWFIRM_API_KEY or WORKSTATION_API_KEY)"
                        self.log(f"✅ API key loaded from: {api_key_source}")
                    self.workstation_id = data.get("workstation_id")
                    # Ensure monitored_folders is always a list
                    folders = data.get("monitored_folders", [])
                    if isinstance(folders, dict):
                        # Fix corrupted config where it's an object instead of array
                        self.monitored_folders = []
                    elif isinstance(folders, list):
                        self.monitored_folders = folders
                    else:
                        self.monitored_folders = []
                    self.virtual_drive_letter = data.get("virtual_drive_letter")
                    self.virtual_drive_path = data.get("virtual_drive_path")
                    self.check_interval = data.get("check_interval", 60)
                    self.virtual_drive_sync_interval = data.get(
                        "virtual_drive_sync_interval", 60
                    )
                    self.file_lock_check_interval = data.get(
                        "file_lock_check_interval", 10
                    )
                    self.conflict_resolution = data.get(
                        "conflict_resolution", "server_wins"
                    )
                    # File Organizer settings
                    self.file_organizer_enabled = data.get(
                        "file_organizer_enabled", True
                    )
                    self.file_organizer_scan_interval = data.get(
                        "file_organizer_scan_interval", 300
                    )
                    self.file_organizer_confidence_threshold = data.get(
                        "file_organizer_confidence_threshold", 0.8
                    )
                    self.file_organizer_max_text_length = data.get(
                        "file_organizer_max_text_length", 50000
                    )
                    # Sync deletion settings
                    self.sync_delete_to_server = data.get(
                        "sync_delete_to_server", True
                    )
                    # SSL/TLS configuration
                    # Auto-detect SSL verification based on URL if not explicitly set
                    if "verify_ssl" in data:
                        self.verify_ssl = data.get("verify_ssl")
                        self._ssl_explicitly_set = True
                    else:
                        # Will be auto-detected after load() completes
                        self._ssl_explicitly_set = False
                    self.ca_cert_path = data.get("ca_cert_path")
            except json.JSONDecodeError as e:
                self.log(f"Error parsing config file (invalid JSON): {e}")
                # Backup corrupted config
                backup_file = CONFIG_FILE.with_suffix(".json.bak")
                try:
                    import shutil

                    shutil.copy2(CONFIG_FILE, backup_file)
                    self.log(f"Backup saved to {backup_file}")
                except:
                    pass
            except Exception as e:
                self.log(f"Error loading config: {e}")
                import traceback

                self.log(traceback.format_exc())

    def save(self):
        """Save configuration to file"""
        try:
            # Ensure directory exists
            CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)

            with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                json.dump(
                    {
                        "api_url": self.api_url,
                        "api_key": self.api_key,
                        "workstation_id": self.workstation_id,
                        "monitored_folders": self.monitored_folders,
                        "virtual_drive_letter": self.virtual_drive_letter,
                        "virtual_drive_path": self.virtual_drive_path,
                        "check_interval": self.check_interval,
                        "virtual_drive_sync_interval": self.virtual_drive_sync_interval,
                        "file_lock_check_interval": self.file_lock_check_interval,
                        "conflict_resolution": self.conflict_resolution,
                        "file_organizer_enabled": self.file_organizer_enabled,
                        "file_organizer_scan_interval": self.file_organizer_scan_interval,
                        "file_organizer_confidence_threshold": self.file_organizer_confidence_threshold,
                        "file_organizer_max_text_length": self.file_organizer_max_text_length,
                        "sync_delete_to_server": self.sync_delete_to_server,
                        "verify_ssl": self.verify_ssl,
                        "ca_cert_path": self.ca_cert_path,
                    },
                    f,
                    indent=2,
                    ensure_ascii=False,
                )
            self.log(f"Configuration saved to {CONFIG_FILE}")
        except Exception as e:
            self.log(f"Error saving config: {e}")
            import traceback

            self.log(traceback.format_exc())

    @staticmethod
    def log(message: str):
        """Log message to file and console"""
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        log_message = f"[{timestamp}] {message}"
        print(log_message)
        try:
            with open(LOG_FILE, "a") as f:
                f.write(log_message + "\n")
        except:
            pass


class WorkstationAPI:
    def __init__(self, config: Config):
        self.config = config
        self.session = requests.Session()

        # Setup retry strategy
        retry_strategy = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)
        
        # Configure SSL verification
        # If ca_cert_path is provided, use it; otherwise use verify_ssl boolean
        if self.config.ca_cert_path and os.path.exists(self.config.ca_cert_path):
            self.session.verify = self.config.ca_cert_path
            Config.log(f"SSL verification enabled with CA cert: {self.config.ca_cert_path}")
        else:
            self.session.verify = self.config.verify_ssl
            if not self.config.verify_ssl:
                import urllib3
                urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
                Config.log("⚠️  SSL verification disabled (for self-signed certificates)")
            else:
                Config.log("SSL verification enabled (using system CA certificates)")

    def _headers(self) -> Dict[str, str]:
        """Get request headers with API key"""
        headers = {"Content-Type": "application/json"}
        if self.config.api_key:
            headers["X-API-Key"] = self.config.api_key
        return headers

    def register(
        self,
        name: str,
        computer_name: str,
        monitored_folders: List[str],
        virtual_drive_letter: Optional[str] = None,
        virtual_drive_path: Optional[str] = None,
    ) -> Dict:
        """Register workstation with server"""
        try:
            response = self.session.post(
                f"{self.config.api_url}/workstations/register",
                json={
                    "name": name,
                    "computerName": computer_name,
                    "monitoredFolders": monitored_folders,
                    "virtualDriveLetter": virtual_drive_letter,
                    "virtualDrivePath": virtual_drive_path,
                },
                headers={"Content-Type": "application/json"},
                timeout=10,
            )
            response.raise_for_status()
            data = response.json()
            self.config.api_key = data.get("apiKey")
            self.config.workstation_id = data.get("id")
            # Also update monitored folders and virtual drive settings if provided
            if "monitoredFolders" in data:
                self.config.monitored_folders = data.get("monitoredFolders", [])
            if "virtualDriveLetter" in data:
                self.config.virtual_drive_letter = data.get("virtualDriveLetter")
            if "virtualDrivePath" in data:
                self.config.virtual_drive_path = data.get("virtualDrivePath")
            self.config.save()  # Save immediately after registration
            return data
        except Exception as e:
            Config.log(f"Registration error: {e}")
            raise

    def heartbeat(self) -> bool:
        """Send heartbeat to server"""
        try:
            response = self.session.post(
                f"{self.config.api_url}/workstations/heartbeat",
                headers=self._headers(),
                timeout=5,
            )
            response.raise_for_status()
            return True
        except Exception as e:
            Config.log(f"Heartbeat error: {e}")
            return False

    def get_config(self) -> Dict:
        """Fetch workstation configuration from server (includes server-side policy fields)"""
        try:
            response = self.session.get(
                f"{self.config.api_url}/workstation-sync/config",
                headers=self._headers(),
                timeout=10,
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            Config.log(f"Get config error: {e}")
            return {}

    def search_client(self, client_name: str) -> Dict:
        """Search for client by name"""
        try:
            response = self.session.post(
                f"{self.config.api_url}/workstation-sync/search-client",
                json={"clientName": client_name},
                headers=self._headers(),
                timeout=10,
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            Config.log(f"Search client error: {e}")
            return {"clients": [], "found": False}

    def create_pending_request(
        self, client_name: str, folder_path: str, document_count: int = 0
    ) -> Dict:
        """Create pending client request"""
        try:
            response = self.session.post(
                f"{self.config.api_url}/workstation-sync/pending-client-request",
                json={
                    "clientName": client_name,
                    "folderPath": folder_path,
                    "documentCount": document_count,
                },
                headers=self._headers(),
                timeout=10,
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            Config.log(f"Create pending request error: {e}")
            raise

    def upload_document(
        self,
        file_path: str,
        client_id: int,
        title: str,
        description: Optional[str] = None,
        case_id: Optional[int] = None,
    ) -> Dict:
        """Upload document to server"""
        try:
            with open(file_path, "rb") as f:
                files = {"file": (os.path.basename(file_path), f)}
                data = {
                    "title": title,
                    "clientId": str(client_id),
                    "description": description or "",
                }
                if case_id:
                    data["caseId"] = str(case_id)

                headers = self._headers()
                headers.pop(
                    "Content-Type", None
                )  # Let requests set Content-Type for multipart

                response = self.session.post(
                    f"{self.config.api_url}/workstation-sync/upload-document",
                    files=files,
                    data=data,
                    headers=headers,
                    timeout=30,
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
                json={"clientId": client_id, "fileNames": file_names},
                headers=self._headers(),
                timeout=10,
            )
            response.raise_for_status()
            data = response.json()
            return list(data.get("existingFileNames") or [])
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
            items = data.get("items") or []
            return {(int(i["clientId"]), (i.get("fileName") or "").lower()) for i in items}
        except Exception as e:
            Config.log(f"Pending delete list error: {e}")
            return set()

    def clear_pending_delete(self, client_id: int, filename: str) -> bool:
        """Clear a pending-delete record when the file was removed from the monitored folder."""
        try:
            response = self.session.post(
                f"{self.config.api_url}/workstation-sync/pending-delete/clear",
                json={"clientId": client_id, "fileName": filename},
                headers=self._headers(),
                timeout=10,
            )
            response.raise_for_status()
            data = response.json()
            if data.get("cleared", 0) > 0:
                Config.log(f"Cleared pending delete (file removed from folder): {filename}")
            return True
        except Exception as e:
            Config.log(f"Clear pending delete error: {e}")
            return False

    def delete_document(self, client_id: int, filename: str) -> Dict:
        """Delete document from server by client ID and filename"""
        if not self.config.sync_delete_to_server:
            return {"success": False, "error": "Sync delete to server is disabled"}
        try:
            # Use workstation-sync DELETE endpoint that accepts API key
            response = self.session.delete(
                f"{self.config.api_url}/workstation-sync/documents",
                params={
                    "clientId": client_id,
                    "filename": filename
                },
                headers=self._headers(),
                timeout=10,
            )
            response.raise_for_status()
            result = response.json()
            Config.log(f"✓ Deleted document from server: {filename} (ID: {result.get('documentId')})")
            return {"success": True, "documentId": result.get('documentId')}
        except Exception as e:
            Config.log(f"Delete document error: {e}")
            return {"success": False, "error": str(e)}


class CombinedMonitor(FileSystemEventHandler):
    """Combined monitor that handles both folder monitoring and file organization"""

    def __init__(self, api: WorkstationAPI, config: Config, file_organizer=None):
        self.folder_monitor = FolderMonitor(api, config)
        self.file_organizer = file_organizer

        # Share processed folders list with file organizer to prevent conflicts
        if self.file_organizer:
            self.file_organizer.processed_folders = self.folder_monitor.processed_folders

    def on_created(self, event):
        """Handle file/folder creation"""
        # Handle folder monitoring first (priority)
        self.folder_monitor.on_created(event)

        # Handle file organization for loose files (separate processing)
        if self.file_organizer and not event.is_directory:
            # Run file organization in a separate thread to avoid blocking folder monitoring
            import threading

            threading.Thread(
                target=self._handle_file_organization, args=(event,), daemon=True
            ).start()

    def on_modified(self, event):
        """Handle file/folder modification"""
        # Handle folder monitoring first (priority)
        self.folder_monitor.on_modified(event)

        # Handle file organization for loose files (separate processing)
        if self.file_organizer and not event.is_directory:
            # Run file organization in a separate thread to avoid blocking folder monitoring
            import threading

            threading.Thread(
                target=self._handle_file_organization, args=(event,), daemon=True
            ).start()
    
    def on_deleted(self, event):
        """Handle file/folder deletion"""
        # Handle folder monitoring deletion (priority)
        self.folder_monitor.on_deleted(event)

    def _handle_file_organization(self, event):
        """Handle file organization in a separate thread"""
        try:
            if hasattr(event, "src_path"):
                self.file_organizer.on_created(event)
        except Exception as e:
            Config.log(f"Error in file organization thread: {e}")

    def process_folder(self, folder_path: str):
        """Delegate folder processing to the folder monitor"""
        self.folder_monitor.process_folder(folder_path)


class FolderMonitor(FileSystemEventHandler):
    def __init__(self, api: WorkstationAPI, config: Config):
        self.api = api
        self.config = config
        self.processed_folders = set()
        self.upload_state: Dict[str, Dict] = {}  # Track uploaded files: key = f"{client_id}:{filename}", value = {hash, lastUploaded}
        self.pending_deletions: Dict[str, float] = {}  # Track pending deletions: path -> timestamp
        self.load_upload_state()
    
    def calculate_file_hash(self, file_path: Path) -> str:
        """Calculate SHA256 hash of file"""
        hash_sha256 = hashlib.sha256()
        try:
            with open(file_path, 'rb') as f:
                for chunk in iter(lambda: f.read(4096), b""):
                    hash_sha256.update(chunk)
            return hash_sha256.hexdigest()
        except Exception as e:
            Config.log(f"Error calculating hash for {file_path}: {e}")
            return ""
    
    def load_upload_state(self):
        """Load upload state from file"""
        if UPLOAD_STATE_FILE.exists():
            try:
                with open(UPLOAD_STATE_FILE, 'r') as f:
                    data = json.load(f)
                    self.upload_state = data.get('files', {})
            except Exception as e:
                Config.log(f"Error loading upload state: {e}")
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
            Config.log(f"Error saving upload state: {e}")
    
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
        """Handle file/folder creation"""
        if event.is_directory:
            self.process_folder(event.src_path)

    def on_modified(self, event):
        """Handle file/folder modification"""
        if event.is_directory:
            self.process_folder(event.src_path)
    
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
            Config.log(f"Error handling file deletion: {e}")
    
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
                Config.log(f"ℹ️  File recreated (save operation): {deleted_path.name}")
                del self.pending_deletions[file_key]
                return
            
            # File is still deleted after grace period - process as actual deletion
            del self.pending_deletions[file_key]
            
            # Extract client name from folder structure
            filename = deleted_path.name
            client_folder = deleted_path.parent
            client_name = client_folder.name
            
            Config.log(f"🗑️  File deleted manually: {filename} from client folder: {client_name}")
            
            # Search for client to get client ID
            search_result = self.api.search_client(client_name)
            
            if search_result.get("found") and search_result.get("clients"):
                clients = search_result["clients"]
                client_id = clients[0]["id"]
                
                Config.log(f"Processing deletion for client: {clients[0]['fullName']} (ID: {client_id})")
                
                # Delete from server (this will also delete from virtual drive and all monitored folders)
                result = self.api.delete_document(client_id, filename)
                
                if result.get("success"):
                    Config.log(f"✅ Document deletion synced to server: {filename}")
                    
                    # Remove from upload state
                    state_key = f"{client_id}:{filename.lower()}"
                    if state_key in self.upload_state:
                        del self.upload_state[state_key]
                        self.save_upload_state()
                else:
                    Config.log(f"⚠️  Failed to sync deletion to server: {result.get('error', 'Unknown error')}")
            else:
                Config.log(f"⚠️  Client not found for deleted file: {client_name}")
        
        except Exception as e:
            Config.log(f"Error processing pending deletion: {e}")

    def process_folder(self, folder_path: str):
        """Process a folder to check if it's a client folder"""
        try:
            folder = Path(folder_path)
            if not folder.is_dir():
                return

            # Skip if already processed recently (but allow re-processing after client approval)
            # We'll clear processed_folders periodically to allow re-scanning
            if folder_path in self.processed_folders:
                return

            # Check if folder is in monitored directories
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

            # Check if this looks like a client folder (has documents)
            client_name = folder.name
            documents = self.find_documents(folder)

            if documents:
                self.handle_client_folder(client_name, folder_path, documents)
                self.processed_folders.add(folder_path)
        except Exception as e:
            Config.log(f"Error processing folder {folder_path}: {e}")

    def find_documents(self, folder: Path) -> List[Path]:
        """Find document files in folder"""
        documents = []
        allowed_extensions = {".pdf", ".doc", ".docx", ".txt", ".jpg", ".jpeg", ".png"}

        try:
            for item in folder.iterdir():
                if item.is_file() and item.suffix.lower() in allowed_extensions:
                    # Skip Word temporary files
                    if is_word_temp_file(item):
                        continue
                    documents.append(item)
        except PermissionError:
            pass

        return documents

    def handle_client_folder(
        self, client_name: str, folder_path: str, documents: List[Path]
    ):
        """Handle a client folder - check if client exists, upload documents"""
        Config.log(f"Found client folder: {client_name} at {folder_path}")
        Config.log(f"Documents found: {len(documents)}")

        # Search for client - try multiple variations
        search_result = self.api.search_client(client_name)

        # If not found, try with different case variations
        if not search_result.get("found"):
            # Try title case
            title_case = client_name.title()
            if title_case != client_name:
                Config.log(f"Trying title case: {title_case}")
                search_result = self.api.search_client(title_case)

        if search_result.get("found") and search_result.get("clients"):
            # Client exists - upload documents
            clients = search_result["clients"]
            client_id = clients[0]["id"]  # Use first match

            Config.log(f"Client found: {clients[0]['fullName']} (ID: {client_id})")
            Config.log(f"Uploading {len(documents)} document(s)...")

            # Reconcile with server: if we think a file is "already uploaded" but server doesn't have it, clear state so we re-upload
            # Unless sync delete is off and this file is pending delete (preserved on workstation) — then do not re-upload
            pending_delete_set = set()
            try:
                file_names = [p.name for p in documents]
                existing_on_server = self.api.check_documents_exist(client_id, file_names)
                existing_set = set(existing_on_server)
                pending_delete_set = self.api.get_pending_delete_set() if not self.config.sync_delete_to_server else set()
                if not self.config.sync_delete_to_server:
                    Config.log(f"Pending delete list: {len(pending_delete_set)} item(s)")
                for doc_path in documents:
                    if self.is_file_already_uploaded(doc_path, client_id, doc_path.name):
                        if doc_path.name.lower() not in existing_set:
                            key = (client_id, doc_path.name.lower())
                            if key in pending_delete_set:
                                Config.log(f"⏸ Preserved (pending delete), sync paused: {doc_path.name}")
                                continue
                            Config.log(f"🔄 Server missing document (reconciling): {doc_path.name} — will re-upload")
                            self.clear_upload_state_for_file(client_id, doc_path.name)
            except Exception as e:
                Config.log(f"Reconcile with server (check-documents-exist) failed: {e} — continuing with local state")

            # If user removed a pending-delete file from the monitored folder, clear it on the server so UI stops showing "Pending delete"
            if not self.config.sync_delete_to_server and pending_delete_set:
                current_lower = {p.name.lower() for p in documents}
                for (cid, fname_lower) in pending_delete_set:
                    if cid == client_id and fname_lower not in current_lower:
                        self.api.clear_pending_delete(client_id, fname_lower)

            uploaded_count = 0
            skipped_count = 0
            for doc_path in documents:
                try:
                    # Check if file was already uploaded with same content
                    if self.is_file_already_uploaded(doc_path, client_id, doc_path.name):
                        Config.log(f"⊘ Skipped (already uploaded): {doc_path.name}")
                        skipped_count += 1
                        continue
                    # Skip upload if this file is pending delete (server deleted, we preserved; sync paused)
                    # Only treat as pending delete if: (1) already in pending_delete_set, OR (2) was previously uploaded (in upload_state) but now missing on server
                    if not self.config.sync_delete_to_server:
                        # Check if already in pending_delete_set
                        if (client_id, doc_path.name.lower()) in pending_delete_set:
                            Config.log(f"⏸ Preserved (pending delete), sync paused: {doc_path.name}")
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
                                Config.log(f"⏸ Reported as pending delete (was uploaded, now missing on server, sync paused): {doc_path.name}")
                            except Exception as e:
                                Config.log(f"Could not report pending delete for {doc_path.name}: {e}")
                            skipped_count += 1
                            continue
                    title = doc_path.stem
                    result = self.api.upload_document(
                        str(doc_path),
                        client_id,
                        title,
                        f"Auto-uploaded from workstation: {folder_path}",
                    )
                    # Check if upload was skipped (file already exists on server)
                    if result.get("skipped"):
                        Config.log(f"⊘ Skipped (already exists on server): {doc_path.name}")
                        # Still mark as uploaded locally since server has it
                        file_hash = self.calculate_file_hash(doc_path)
                        if file_hash:
                            self.mark_file_uploaded(doc_path, client_id, doc_path.name, file_hash)
                        skipped_count += 1
                    elif result.get("document") and result.get("document", {}).get("id"):
                        # Verify document was actually created/updated in database
                        Config.log(f"✓ Uploaded document: {doc_path.name} (ID: {result.get('document', {}).get('id')})")
                        # Mark as uploaded in local state
                        file_hash = self.calculate_file_hash(doc_path)
                        if file_hash:
                            self.mark_file_uploaded(doc_path, client_id, doc_path.name, file_hash)
                        uploaded_count += 1
                    else:
                        # Upload response didn't include document info - might be an issue
                        Config.log(f"⚠️ Upload response unclear for {doc_path.name}: {result}")
                        # Still try to mark as uploaded if we can calculate hash
                        file_hash = self.calculate_file_hash(doc_path)
                        if file_hash:
                            self.mark_file_uploaded(doc_path, client_id, doc_path.name, file_hash)
                        uploaded_count += 1  # Count it anyway to avoid confusion
                except Exception as e:
                    error_msg = str(e)
                    # Check if error is about file already existing
                    if (
                        "already exists" in error_msg.lower()
                        or "duplicate" in error_msg.lower()
                    ):
                        Config.log(f"⊘ Skipped (already exists): {doc_path.name}")
                        # Mark as uploaded locally since server has it
                        file_hash = self.calculate_file_hash(doc_path)
                        if file_hash:
                            self.mark_file_uploaded(doc_path, client_id, doc_path.name, file_hash)
                        skipped_count += 1
                    else:
                        Config.log(f"✗ Error uploading {doc_path.name}: {e}")

            Config.log(
                f"Upload complete: {uploaded_count} uploaded, {skipped_count} skipped, {len(documents) - uploaded_count - skipped_count} errors"
            )
        else:
            # Client not found - create pending request
            Config.log(
                f"Client not found for folder name '{client_name}', creating pending request"
            )
            Config.log(f"  (Searched for: {client_name})")
            try:
                self.api.create_pending_request(
                    client_name, folder_path, len(documents)
                )
                Config.log(f"Pending request created for: {client_name}")
            except Exception as e:
                Config.log(f"Error creating pending request: {e}")


class VirtualDriveManager:
    @staticmethod
    def mount_drive(letter: str, path: str) -> bool:
        """Mount a virtual drive using Windows subst command"""
        if platform.system() != "Windows":
            Config.log("Virtual drive mounting only supported on Windows")
            return False

        try:
            # Normalize drive letter to include colon (e.g., "Z" -> "Z:")
            drive_letter = letter.upper().strip()
            if not drive_letter.endswith(":"):
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
                ["subst", drive_letter, abs_path],
                capture_output=True,
                text=True,
                check=True,
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
        """Unmount a virtual drive"""
        if platform.system() != "Windows":
            return False

        try:
            # Normalize drive letter to include colon
            drive_letter = letter.upper().strip()
            if not drive_letter.endswith(":"):
                drive_letter = f"{drive_letter}:"

            subprocess.run(
                ["subst", drive_letter, "/D"],
                capture_output=True,
                text=True,
                check=True,
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
        if platform.system() != "Windows":
            return False

        # Normalize drive letter
        drive_letter = letter.upper().strip()
        if not drive_letter.endswith(":"):
            drive_letter = f"{drive_letter}:"

        # Method 1: Standard unmount
        try:
            result = subprocess.run(
                ["subst", drive_letter, "/D"],
                capture_output=True,
                text=True,
                check=True,
                timeout=5,
            )
            Config.log(f"Force unmounted virtual drive {drive_letter}")
            return True
        except subprocess.TimeoutExpired:
            Config.log(
                f"Timeout unmounting drive {drive_letter}, trying alternative method..."
            )
        except subprocess.CalledProcessError as e:
            # Try alternative method
            Config.log(
                f"Standard unmount failed for {drive_letter}, trying alternative method..."
            )
        except Exception as e:
            Config.log(f"Error in standard unmount: {e}")

        # Method 2: Try with elevated privileges hint (if available)
        try:
            # Try using net use to disconnect (alternative method)
            result = subprocess.run(
                ["net", "use", drive_letter, "/DELETE", "/YES"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0:
                Config.log(
                    f"Force unmounted virtual drive {drive_letter} using net use"
                )
                return True
        except Exception as e:
            Config.log(f"Alternative unmount method failed: {e}")

        # Method 3: Final attempt with subst
        try:
            result = subprocess.run(
                ["subst", drive_letter, "/D"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            Config.log(f"Force unmounted virtual drive {drive_letter} (final attempt)")
            return True
        except Exception as e:
            Config.log(f"Failed to force unmount drive {drive_letter}: {e}")
            return False


# Global variables for cleanup
_cleanup_config = None
_cleanup_observer = None


def cleanup_virtual_drive():
    """Cleanup function to unmount virtual drive"""
    global _cleanup_config
    if _cleanup_config and _cleanup_config.virtual_drive_letter:
        Config.log("Cleaning up: Unmounting virtual drive...")
        VirtualDriveManager.force_unmount_drive(_cleanup_config.virtual_drive_letter)


def signal_handler(signum, frame):
    """Handle shutdown signals"""
    Config.log(f"Received signal {signum}, shutting down...")
    global _cleanup_observer
    if _cleanup_observer:
        _cleanup_observer.stop()
    cleanup_virtual_drive()
    sys.exit(0)


def main():
    """Main application entry point"""
    global _cleanup_config, _cleanup_observer

    config = Config()
    _cleanup_config = config

    # Check if registered
    if not config.api_key:
        print("=" * 60)
        print("Law Firm Workstation Monitor - Initial Setup")
        print("=" * 60)
        name = input("Enter workstation name: ").strip()
        computer_name = platform.node()
        print(f"Computer name: {computer_name}")

        folders_input = input("Enter monitored folders (comma-separated): ").strip()
        monitored_folders = [f.strip() for f in folders_input.split(",") if f.strip()]

        drive_letter = input(
            "Enter virtual drive letter (e.g., Z:, leave empty to skip): "
        ).strip()
        drive_path = None
        if drive_letter:
            drive_path = input("Enter virtual drive path: ").strip()
            if not drive_path:
                drive_letter = None

        # File Organizer configuration
        print("\nFile Organizer Configuration:")
        print("-" * 40)
        enable_file_organizer = (
            input("Enable File Organizer (automatically organize loose files)? (Y/n): ")
            .strip()
            .lower()
        )
        file_organizer_enabled = enable_file_organizer not in ["n", "no", "false"]

        if file_organizer_enabled:
            print(
                "\nFile Organizer will scan documents for client names and organize them automatically."
            )
            print(
                "This runs in the background and doesn't interfere with normal file monitoring."
            )

        api = WorkstationAPI(config)
        try:
            result = api.register(
                name, computer_name, monitored_folders, drive_letter, drive_path
            )
            print(f"\n✓ Registration successful!")
            print(f"API Key: {result.get('apiKey')}")
            print(f"Workstation ID: {result.get('id')}")

            # Update config with registration data (register() already saves, but ensure it's complete)
            config.api_key = result.get("apiKey")
            config.workstation_id = result.get("id")
            config.monitored_folders = monitored_folders
            config.virtual_drive_letter = drive_letter if drive_letter else None
            config.virtual_drive_path = drive_path if drive_path else None
            config.file_organizer_enabled = file_organizer_enabled
            config.save()  # Explicitly save to ensure persistence

            print("\nConfiguration saved. Starting monitor...")
        except Exception as e:
            print(f"\n✗ Registration failed: {e}")
            print("Please check your server URL and try again.")
            return

    # Mount virtual drive if configured
    if config.virtual_drive_letter and config.virtual_drive_path:
        VirtualDriveManager.mount_drive(
            config.virtual_drive_letter, config.virtual_drive_path
        )

    # Initialize API
    api = WorkstationAPI(config)

    # Fetch server-side conflict resolution policy and apply it (server overrides local config)
    try:
        server_cfg = api.get_config()
        server_policy = server_cfg.get('conflictResolutionPolicy')
        if server_policy:
            if config.conflict_resolution != server_policy:
                Config.log(f"Conflict resolution policy overridden by server: '{config.conflict_resolution}' → '{server_policy}'")
            config.conflict_resolution = server_policy
    except Exception as e:
        Config.log(f"Could not fetch server conflict resolution policy, using local config ('{config.conflict_resolution}'): {e}")

    # Initialize virtual drive sync if configured
    vd_sync = None
    if config.virtual_drive_path and config.api_key:
        try:
            def report_pending_delete(client_name: str, filename: str):
                """Report preserved file so server shows as 'pending delete'; user can re-enable via Upload."""
                try:
                    api.session.post(
                        f"{config.api_url}/workstation-sync/pending-delete",
                        json={"clientName": client_name, "fileName": filename},
                        headers=api._headers(),
                        timeout=10,
                    )
                except Exception as e:
                    Config.log(f"Could not report pending delete: {e}")

            vd_sync = VirtualDriveSync(
                api_url=config.api_url,
                api_key=config.api_key,
                virtual_drive_path=config.virtual_drive_path,
                monitored_folders=config.monitored_folders,
                conflict_resolution=config.conflict_resolution,
                sync_delete_to_server=config.sync_delete_to_server,
                report_pending_delete_callback=report_pending_delete,
                log_callback=Config.log,
            )
            Config.log("Virtual drive sync initialized")
        except Exception as e:
            Config.log(f"Error initializing virtual drive sync: {e}")

    # Initialize File Organizer
    file_organizer = None
    if config.file_organizer_enabled and config.api_key:
        try:
            file_organizer_api = FileOrganizerAPI(config)
            # Note: processed_folders will be set when CombinedMonitor is created
            file_organizer = FileOrganizer(file_organizer_api, config, Config.log)
            Config.log("File Organizer initialized")
        except Exception as e:
            Config.log(f"Error initializing File Organizer: {e}")

    # Register cleanup handlers
    atexit.register(cleanup_virtual_drive)
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    if platform.system() == "Windows":
        # Windows-specific signals
        signal.signal(signal.SIGBREAK, signal_handler)

    # Start monitoring
    Config.log("Starting workstation monitor...")
    event_handler = CombinedMonitor(api, config, file_organizer)
    observer = Observer()
    _cleanup_observer = observer

    # Watch all monitored folders
    for folder in config.monitored_folders:
        folder_path = Path(folder)
        if folder_path.exists() and folder_path.is_dir():
            observer.schedule(event_handler, str(folder_path), recursive=True)
            Config.log(f"Monitoring folder: {folder}")
        else:
            Config.log(f"Warning: Folder does not exist: {folder}")
    
    # Watch virtual drive if configured
    if config.virtual_drive_path:
        from virtual_drive_monitor import VirtualDriveMonitor
        
        def handle_virtual_drive_deletion(client_id: Optional[int], filename: str, client_folder_name: str):
            """Handle file deletion from virtual drive"""
            # Skip if feature is disabled
            if not config.sync_delete_to_server:
                return
            
            try:
                # If we don't have client_id, search for it
                if not client_id:
                    search_result = api.search_client(client_folder_name)
                    if search_result.get('found') and search_result.get('clients'):
                        client_id = search_result['clients'][0]['id']
                    else:
                        Config.log(f"⚠️ Could not find client ID for: {client_folder_name}")
                        return
                
                # Delete from server
                result = api.delete_document(client_id, filename)
                
                if result.get('success'):
                    Config.log(f"✅ Virtual drive deletion synced to server: {filename}")
                else:
                    Config.log(f"⚠️ Failed to sync virtual drive deletion: {result.get('error', 'Unknown error')}")
            except Exception as e:
                Config.log(f"Error handling virtual drive deletion: {e}")
        
        vd_monitor = VirtualDriveMonitor(handle_virtual_drive_deletion, Config.log)
        vd_path = Path(config.virtual_drive_path)
        if vd_path.exists() and vd_path.is_dir():
            observer.schedule(vd_monitor, str(vd_path), recursive=True)
            Config.log(f"Monitoring virtual drive: {config.virtual_drive_path}")
        else:
            Config.log(f"Warning: Virtual drive path does not exist: {config.virtual_drive_path}")

    observer.start()

    # Initial scan of existing folders
    Config.log("Performing initial scan...")
    for folder in config.monitored_folders:
        folder_path = Path(folder)
        if folder_path.exists():
            for item in folder_path.iterdir():
                if item.is_dir():
                    event_handler.process_folder(str(item))

    # Main loop - send heartbeat, scan, and sync periodically
    try:
        last_heartbeat = 0
        last_scan = 0
        last_sync_from_server = 0
        last_sync_to_server = 0
        last_file_organizer_scan = 0

        # Initial sync from server
        if vd_sync:
            Config.log("Performing initial sync from server...")
            try:
                stats = vd_sync.sync_from_server()
                Config.log(
                    f"Initial sync: {stats['downloaded']} downloaded, {stats['updated']} updated, {stats['errors']} errors"
                )
                for detail in (stats.get('error_details') or [])[:3]:
                    Config.log(f"  Sync error: {detail}")
            except Exception as e:
                Config.log(f"Error in initial sync: {e}")

        while True:
            current_time = time.time()

            # Send heartbeat every 5 minutes
            if current_time - last_heartbeat > 300:
                api.heartbeat()
                last_heartbeat = current_time

            # Sync from server (download updates)
            if (
                vd_sync
                and current_time - last_sync_from_server
                > config.virtual_drive_sync_interval
            ):
                Config.log("Syncing from server...")
                try:
                    stats = vd_sync.sync_from_server()
                    Config.log(
                        f"Sync from server: {stats['downloaded']} downloaded, {stats['updated']} updated, {stats['errors']} errors"
                    )
                    for detail in (stats.get('error_details') or [])[:3]:
                        Config.log(f"  Sync error: {detail}")
                except Exception as e:
                    Config.log(f"Error syncing from server: {e}")
                last_sync_from_server = current_time

            # Sync to server (upload changes)
            if (
                vd_sync
                and current_time - last_sync_to_server
                > config.virtual_drive_sync_interval
            ):
                Config.log("Syncing to server...")
                try:
                    stats = vd_sync.sync_to_server()
                    Config.log(
                        f"Sync to server: {stats['uploaded']} uploaded, {stats['locked']} locked, {stats['errors']} errors"
                    )
                except Exception as e:
                    Config.log(f"Error syncing to server: {e}")
                last_sync_to_server = current_time

            # Periodic scan every check_interval
            if current_time - last_scan > config.check_interval:
                Config.log("Performing periodic scan...")
                # Clear processed folders periodically to allow re-scanning for new files
                event_handler.folder_monitor.processed_folders.clear()
                for folder in config.monitored_folders:
                    folder_path = Path(folder)
                    if folder_path.exists():
                        for item in folder_path.iterdir():
                            if item.is_dir():
                                event_handler.process_folder(str(item))
                last_scan = current_time

            # File Organizer periodic scan
            if (
                file_organizer
                and current_time - last_file_organizer_scan
                > config.file_organizer_scan_interval
            ):
                try:
                    file_organizer.periodic_scan()
                except Exception as e:
                    Config.log(f"Error in File Organizer scan: {e}")
                last_file_organizer_scan = current_time

            time.sleep(10)  # Check every 10 seconds

    except KeyboardInterrupt:
        Config.log("Stopping monitor (KeyboardInterrupt)...")
        observer.stop()
        cleanup_virtual_drive()
    except Exception as e:
        Config.log(f"Error in main loop: {e}")
        observer.stop()
        cleanup_virtual_drive()
        raise
    finally:
        try:
            observer.join(timeout=5)
        except:
            pass
        Config.log("Monitor stopped.")


if __name__ == "__main__":
    main()
