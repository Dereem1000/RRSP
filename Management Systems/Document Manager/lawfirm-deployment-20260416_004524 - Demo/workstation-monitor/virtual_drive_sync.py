"""
Virtual Drive Sync Service
Handles bidirectional sync between server and virtual drive
"""

import os
import json
import time
import hashlib
import re
import shutil
import requests
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Callable
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from conflict_resolver import ConflictResolver
from file_sync import is_word_temp_file
from corruption_detector import CorruptionDetector
from config_manager import ConfigManager


class VirtualDriveSync:
    def __init__(self, api_url: str, api_key: str, virtual_drive_path: str, monitored_folders: Optional[List[str]] = None, lock_release_callback: Optional[Callable[[int], None]] = None, conflict_resolution: str = 'server_wins', sync_delete_to_server: bool = True, report_pending_delete_callback: Optional[Callable[[str, str], None]] = None, log_callback: Optional[Callable[[str], None]] = None):
        self.api_url = api_url
        self.api_key = api_key
        self.virtual_drive_path = Path(virtual_drive_path)
        self.clients_dir = self.virtual_drive_path / 'clients'
        self.sync_state_file = self.virtual_drive_path / '.sync_state.json'
        self.sync_state: Dict[str, Dict] = {}
        self.client_name_map: Dict[int, str] = {}  # Maps client ID to sanitized client name
        self.monitored_folders = monitored_folders or []  # List of monitored folder paths
        self.lock_release_callback = lock_release_callback  # Callback to release locks after successful sync
        self.conflict_resolution = conflict_resolution
        self.conflict_resolver = ConflictResolver(conflict_resolution)
        # When False: orphan cleanup still removes files from virtual drive, but preserves originals in monitored folders.
        # Can be a bool or a callable() -> bool for dynamic config (e.g. GUI).
        self._sync_delete_to_server = sync_delete_to_server
        # When we preserve a file in monitored folder (sync_delete off), call this so server can show "pending delete"
        self.report_pending_delete_callback = report_pending_delete_callback
        self._log_callback = log_callback  # Optional: so messages appear in monitor.log when run with pythonw
        # Setup session with retry strategy
        self.session = requests.Session()
        retry_strategy = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)
        
        # Load sync state
        self.load_sync_state()

    def _log(self, message: str) -> None:
        """Log to callback if set (e.g. monitor.log when run with pythonw), else print."""
        if self._log_callback:
            try:
                self._log_callback(message)
            except Exception:
                print(message)
        else:
            print(message)

    def _headers(self) -> Dict[str, str]:
        """Get request headers with API key (env preferred; decrypt if stored encrypted)."""
        key = os.environ.get('LAWFIRM_API_KEY') or os.environ.get('WORKSTATION_API_KEY') or os.environ.get('API_KEY')
        if (not key or not str(key).strip()) and self.api_key:
            key = ConfigManager.decrypt_api_key(self.api_key) if isinstance(self.api_key, str) and self.api_key.strip() else None
            if not key:
                key = self.api_key
        if key and isinstance(key, str):
            key = key.strip()
        headers = {'Content-Type': 'application/json'}
        if key:
            headers['X-API-Key'] = key
        return headers
    
    def load_sync_state(self):
        """Load sync state from file"""
        if self.sync_state_file.exists():
            try:
                with open(self.sync_state_file, 'r') as f:
                    data = json.load(f)
                    self.sync_state = data.get('documents', {})
                    self.client_name_map = data.get('clientNameMap', {})
            except Exception as e:
                print(f"Error loading sync state: {e}")
                self.sync_state = {}
                self.client_name_map = {}
        else:
            self.sync_state = {}
            self.client_name_map = {}

    def _get_pending_delete_set(self) -> set:
        """Return set of (client_id, filename_lower) that are pending delete for this workstation. Empty if sync_delete is on or on error."""
        if self._sync_delete_to_server_current():
            return set()
        try:
            response = self.session.get(
                f"{self.api_url}/workstation-sync/pending-delete-list",
                headers=self._headers(),
                timeout=10,
            )
            response.raise_for_status()
            data = response.json()
            items = data.get("items") or []
            return {(int(i["clientId"]), (i.get("fileName") or "").lower()) for i in items}
        except Exception as e:
            self._log(f"Pending delete list error: {e}")
            return set()

    def save_sync_state(self):
        """Save sync state to file"""
        try:
            with open(self.sync_state_file, 'w') as f:
                json.dump({
                    'documents': self.sync_state,
                    'clientNameMap': self.client_name_map
                }, f, indent=2)
        except Exception as e:
            print(f"Error saving sync state: {e}")
    
    def sanitize_folder_name(self, name: str) -> str:
        """Sanitize client name for Windows folder name"""
        if not name:
            return "Unknown Client"
        
        # Remove or replace invalid Windows folder name characters
        # Invalid: < > : " / \ | ? *
        invalid_chars = r'[<>:"/\\|?*]'
        sanitized = re.sub(invalid_chars, '_', name)
        
        # Remove leading/trailing spaces and dots
        sanitized = sanitized.strip(' .')
        
        # Replace multiple spaces/underscores with single underscore
        sanitized = re.sub(r'[\s_]+', '_', sanitized)
        
        # Limit length to 255 characters (Windows max)
        if len(sanitized) > 255:
            sanitized = sanitized[:255]
        
        # Ensure it's not empty
        if not sanitized:
            sanitized = "Unknown Client"
        
        return sanitized
    
    def calculate_file_hash(self, file_path: Path) -> str:
        """Calculate MD5 hash of file"""
        hash_md5 = hashlib.md5()
        try:
            with open(file_path, 'rb') as f:
                for chunk in iter(lambda: f.read(4096), b""):
                    hash_md5.update(chunk)
            return hash_md5.hexdigest()
        except Exception as e:
            print(f"Error calculating hash for {file_path}: {e}")
            return ""
    
    def ensure_client_dir(self, client_id: int, client_name: Optional[str] = None) -> Path:
        """Ensure client directory exists using client name"""
        # Get or update client name mapping
        if client_name:
            sanitized_name = self.sanitize_folder_name(client_name)

            # Detect collisions: if another client already owns this sanitized name,
            # make this client's folder unique by appending its ID.
            for existing_id, existing_folder in self.client_name_map.items():
                if existing_id != client_id and existing_folder == sanitized_name:
                    sanitized_name = f"{sanitized_name}_{client_id}"
                    print(f"[FOLDER] Name collision detected: client {client_id} shares sanitized name with client {existing_id}. Using unique folder name '{sanitized_name}'.")
                    break

            old_name = self.client_name_map.get(client_id)
            
            # If client name changed, rename the folder
            if old_name and old_name != sanitized_name:
                old_dir = self.clients_dir / old_name
                new_dir = self.clients_dir / sanitized_name

                # Before renaming, verify the new target isn't already owned by a different client
                if new_dir.exists():
                    # The destination exists — do NOT move into it; keep using old folder name
                    print(f"[FOLDER] Cannot rename '{old_name}' to '{sanitized_name}': destination already exists (owned by another client). Keeping '{old_name}' for client {client_id}.")
                    sanitized_name = old_name
                else:
                    # Also check for old ID-based folder and migrate if needed
                    old_id_dir = self.clients_dir / str(client_id)
                    
                    if old_id_dir.exists():
                        # Migrate from ID-based to name-based
                        print(f"Migrating client folder from ID {client_id} to name '{sanitized_name}'")
                        try:
                            shutil.move(str(old_id_dir), str(new_dir))
                        except Exception as e:
                            print(f"Error migrating folder: {e}")
                    elif old_dir.exists():
                        # Rename folder due to name change
                        print(f"Renaming client folder from '{old_name}' to '{sanitized_name}'")
                        try:
                            shutil.move(str(old_dir), str(new_dir))
                        except Exception as e:
                            print(f"Error renaming folder: {e}")
            
            self.client_name_map[client_id] = sanitized_name
        
        # Use client name if available, otherwise fall back to ID
        if client_id in self.client_name_map:
            folder_name = self.client_name_map[client_id]
        elif client_name:
            folder_name = self.sanitize_folder_name(client_name)
            self.client_name_map[client_id] = folder_name
        else:
            # Fallback to ID if no name available (for backward compatibility)
            folder_name = str(client_id)
        
        client_dir = self.clients_dir / folder_name
        client_dir.mkdir(parents=True, exist_ok=True)
        return client_dir
    
    def get_virtual_drive_file_path(self, client_id: int, document_id: int, filename: str, client_name: Optional[str] = None) -> Path:
        """Get virtual drive file path for a document"""
        client_dir = self.ensure_client_dir(client_id, client_name)
        # Use original filename for consistency with monitored folder
        # Note: If there are duplicate filenames for the same client, the last one will overwrite
        return client_dir / filename
    
    def sync_from_server(self) -> Dict[str, int]:
        """Download all documents from server and save to virtual drive (decrypted)"""
        stats = {'downloaded': 0, 'updated': 0, 'errors': 0, 'deleted': 0, 'error_details': []}
        max_error_details = 5  # cap so log doesn't flood

        def _add_error(msg: str):
            stats['errors'] += 1
            if len(stats['error_details']) < max_error_details:
                stats['error_details'].append(msg)

        try:
            # Get all documents for sync (use workstation-sync endpoint)
            response = self.session.get(
                f"{self.api_url}/workstation-sync/sync/all",
                headers=self._headers(),
                timeout=30
            )
            response.raise_for_status()
            data = response.json()
            documents = data.get('documents', [])
            
            print(f"Syncing {len(documents)} documents from server...")
            
            # Track which document IDs exist on server (for orphan cleanup)
            server_document_ids = {str(doc['id']) for doc in documents}
            
            for doc in documents:
                try:
                    doc_id = str(doc['id'])
                    client_id = doc['clientId']
                    client_name = doc.get('clientName', '')
                    filename = doc['fileName']

                    # Guard: skip documents with no recognised extension — these should
                    # never have been uploaded and must not pollute the virtual drive.
                    _ext = Path(filename).suffix.lower()
                    _ALLOWED = {
                        '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
                        '.txt', '.rtf', '.odt', '.ods', '.odp',
                        '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif',
                        '.zip', '.7z', '.rar', '.tar', '.gz',
                        '.mp3', '.mp4', '.mov', '.avi', '.mkv',
                        '.eml', '.msg', '.csv', '.xml', '.json',
                    }
                    if not _ext or _ext not in _ALLOWED:
                        print(f"[SYNC] Skipping server document '{filename}' (ID {doc_id}) — unrecognised extension '{_ext}'. This document should be reviewed and deleted from the server.")
                        continue

                    # Skip if locked by another user
                    lock_status = doc.get('lockStatus', {})
                    if lock_status.get('isLocked') and lock_status.get('lockedByType') == 'user':
                        # Skip files locked by other users
                        continue
                    
                    # Get virtual drive file path using client name (now uses original filename)
                    vd_path = self.get_virtual_drive_file_path(client_id, doc['id'], filename, client_name)
                    
                    # Check for old format file and migrate if needed
                    client_dir = vd_path.parent
                    old_format_path = client_dir / f"{doc['id']}_{filename}"
                    if old_format_path.exists() and not vd_path.exists():
                        # Migrate from old format to new format
                        print(f"Migrating file from old format: {old_format_path.name} -> {filename}")
                        try:
                            old_format_path.rename(vd_path)
                        except Exception as e:
                            print(f"Error migrating file: {e}")
                    
                    # Check if file needs update
                    server_hash = doc.get('syncHash', '')
                    local_hash = self.sync_state.get(doc_id, {}).get('hash', '')
                    stored_server_hash = self.sync_state.get(doc_id, {}).get('serverHash', '')
                    is_deleted = self.sync_state.get(doc_id, {}).get('deleted', False)
                    
                    # Check if file was intentionally deleted by user
                    # If file doesn't exist locally but server hash hasn't changed, user likely deleted it
                    if not vd_path.exists() and is_deleted:
                        # File was intentionally deleted, don't re-download unless server changed
                        if server_hash == stored_server_hash and stored_server_hash:
                            print(f"Skipping download for document {doc_id} ({filename}): File was deleted and server unchanged")
                            continue
                        # Server changed, allow re-download (user might want the new version)
                        print(f"Re-downloading document {doc_id} ({filename}): Server version changed after deletion")
                    
                    # Check if file was intentionally deleted by user
                    # If file doesn't exist locally but was previously synced, check if it should be re-downloaded
                    if not vd_path.exists() and local_hash and stored_server_hash:
                        # File was deleted locally - check if server version changed
                        if server_hash == stored_server_hash:
                            # Server version unchanged - file was intentionally deleted, don't re-download
                            print(f"Skipping download for document {doc_id} ({filename}): File was deleted locally and server unchanged")
                            # Mark as deleted to prevent future re-downloads
                            if doc_id not in self.sync_state:
                                self.sync_state[doc_id] = {}
                            self.sync_state[doc_id]['deleted'] = True
                            self.sync_state[doc_id]['deletedAt'] = time.time()
                            self.sync_state[doc_id]['serverHash'] = server_hash
                            continue
                        else:
                            # Server version changed - allow re-download (new version available)
                            print(f"Re-downloading document {doc_id} ({filename}): Server version changed after local deletion")
                    
                    # Check if file is up to date
                    if server_hash and server_hash == local_hash and vd_path.exists():
                        # File is up to date, clear deleted flag if set
                        if is_deleted:
                            self.sync_state[doc_id]['deleted'] = False
                            if 'deletedAt' in self.sync_state[doc_id]:
                                del self.sync_state[doc_id]['deletedAt']
                        continue
                    
                    # Conflict detection: Check if local file has uncommitted changes
                    if vd_path.exists():
                        current_local_hash = self.calculate_file_hash(vd_path)
                        # If local file hash doesn't match stored hash, it has uncommitted changes
                        if current_local_hash != local_hash and local_hash:
                            # Local file has been modified but not synced yet
                            # Check if server also changed (conflict)
                            if server_hash and server_hash != stored_server_hash and stored_server_hash:
                                # Conflict: Both local and server have changes
                                print(f"Conflict detected for document {doc_id}: Both local and server have changes")
                                print(f"  Local hash: {current_local_hash[:16]}..., Server hash: {server_hash[:16]}...")
                                
                                # Get timestamps for conflict resolution
                                local_timestamp = vd_path.stat().st_mtime if vd_path.exists() else None
                                server_timestamp = doc.get('updatedAt') or doc.get('lastSyncedAt')
                                
                                # Use conflict resolver
                                lock_status = doc.get('lockStatus', {})
                                resolution = self.conflict_resolver.resolve_conflict(
                                    document_id=doc['id'],
                                    local_path=vd_path,
                                    server_hash=server_hash,
                                    local_hash=current_local_hash,
                                    is_locked=lock_status.get('isLocked', False),
                                    locked_by=lock_status.get('lockedBy'),
                                    local_timestamp=local_timestamp,
                                    server_timestamp=server_timestamp
                                )
                                
                                print(f"  Resolution strategy: {self.conflict_resolution}")
                                print(f"  Resolution: {resolution['message']}")
                                
                                # Handle resolution
                                if resolution['action'] == 'accept_local':
                                    # Skip download, keep local version
                                    print(f"  Action: Keeping local version (newer or local_wins)")
                                    continue
                                elif resolution['action'] == 'accept_server':
                                    # Continue to download server version
                                    print(f"  Action: Downloading server version (newer or server_wins)")
                                    # Continue to download below
                                elif resolution['action'] == 'create_conflict':
                                    # Create conflict file and download server version
                                    if resolution.get('conflict_file'):
                                        print(f"  Action: Created conflict file: {resolution['conflict_file']}")
                                    # Continue to download server version
                                elif resolution['action'] == 'reject':
                                    # Skip this file
                                    print(f"  Action: Rejected (file locked)")
                                    continue
                            else:
                                # Local has changes but server hasn't changed - keep local version
                                # Don't overwrite local changes with unchanged server version
                                print(f"Skipping download for document {doc_id}: Local file has uncommitted changes, server unchanged")
                                continue
                    
                    # Download decrypted file (use workstation-sync endpoint)
                    try:
                        download_response = self.session.get(
                            f"{self.api_url}/workstation-sync/sync/{doc_id}/download",
                            headers=self._headers(),
                            stream=True,
                            timeout=60
                        )
                        download_response.raise_for_status()

                        # Save to virtual drive (overwrites local file)
                        vd_path.parent.mkdir(parents=True, exist_ok=True)
                        with open(vd_path, 'wb') as f:
                            for chunk in download_response.iter_content(chunk_size=8192):
                                f.write(chunk)

                        # Check if downloaded file is actually encrypted data (corruption detection)
                        if self._is_file_encrypted(vd_path):
                            print(f"CRITICAL: Downloaded file {filename} (doc {doc_id}) appears to be encrypted data instead of decrypted content!")
                            print("This indicates a decryption failure on the server side.")

                            # Clean up the corrupted file
                            try:
                                vd_path.unlink(missing_ok=True)
                            except Exception as e:
                                print(f"Error removing corrupted file: {e}")

                            # Update sync state to mark file as corrupted/removed so it will be re-downloaded on next sync
                            # Remove from sync_state to force re-download, or mark as needing update
                            if doc_id in self.sync_state:
                                print(f"Removing document {doc_id} from sync state due to corruption - will be re-downloaded on next sync")
                                del self.sync_state[doc_id]

                            # Skip this file and mark for retry later
                            print(f"Skipping document {doc_id} due to decryption failure")
                            _add_error(f"doc {doc_id} ({filename}): decryption/corruption")
                            continue

                    except requests.exceptions.HTTPError as download_error:
                        # Server returned 4xx/5xx - often encryption/decryption related
                        err_msg = getattr(download_error, 'response', None)
                        body = ''
                        if err_msg is not None:
                            try:
                                body = err_msg.json().get('error', err_msg.text or '')[:200]
                            except Exception:
                                body = (err_msg.text or '')[:200]
                            code = getattr(err_msg, 'status_code', '')
                            print(f"Error downloading document {doc_id} ({filename}): HTTP {code} - {body or download_error}")
                        else:
                            print(f"Error downloading document {doc_id} ({filename}): {download_error}")
                        code = getattr(err_msg, 'status_code', '') if (err_msg := getattr(download_error, 'response', None)) else ''
                        _add_error(f"doc {doc_id} ({filename}): HTTP {code} - {(body or str(download_error))[:80]}")
                        continue
                    except Exception as download_error:
                        print(f"Error downloading document {doc_id} ({filename}): {download_error}")
                        _add_error(f"doc {doc_id} ({filename}): {download_error}")
                        continue

                    # Update sync state
                    file_hash = self.calculate_file_hash(vd_path)
                    self.sync_state[doc_id] = {
                        'hash': file_hash,
                        'serverHash': server_hash or file_hash,
                        'lastSynced': time.time(),
                        'path': str(vd_path),
                        'deleted': False  # Clear deleted flag when file is synced
                    }
                    
                    # Copy file to monitored folder if configured (same as sync_to_server)
                    copy_successful = self._copy_to_monitored_folder(vd_path, filename, client_name, client_id)
                    
                    if vd_path.exists() and local_hash:
                        stats['updated'] += 1
                    else:
                        stats['downloaded'] += 1
                    
                except Exception as e:
                    print(f"Error syncing document {doc.get('id', 'unknown')}: {e}")
                    _add_error(f"doc {doc.get('id', '?')} ({doc.get('fileName', '')}): {e}")
            
            # Clean up old ID-based folders (migrate to name-based)
            self._migrate_old_folders()
            
            # Ensure folder structure is up to date (handle client name changes)
            self._update_folder_structure(documents)
            
            # Clean up orphaned files (files that no longer exist on server)
            # This runs after sync completes to avoid slowing down downloads
            # Only deletes files that were synced from server (in sync_state)
            # Does NOT delete user-created files in virtual drive
            deleted_count = self._cleanup_orphaned_files(server_document_ids, documents)
            stats['deleted'] = deleted_count
            
            # Also check virtual drive for files matching deleted documents (by filename and client)
            # This catches files that might not be in sync_state but match server document patterns
            additional_deleted = self._cleanup_orphaned_files_by_matching(server_document_ids, documents)
            stats['deleted'] += additional_deleted
            
            # Save sync state
            self.save_sync_state()
            
        except requests.exceptions.HTTPError as e:
            if e.response is not None and e.response.status_code == 401:
                print(f"Sync from server failed: Unauthorized (401). Check API key and that LAWFIRM_API_KEY env is set if using encrypted config.")
            print(f"Error in sync_from_server: {e}")
            _add_error(f"sync_from_server: HTTP {getattr(e.response, 'status_code', '')} - {e}")
        except Exception as e:
            print(f"Error in sync_from_server: {e}")
            _add_error(f"sync_from_server: {e}")
        
        return stats

    def _is_file_encrypted(self, file_path: Path) -> bool:
        """
        Check if a file appears to contain encrypted data instead of valid content.
        This is a heuristic check to detect when the server returns encrypted data by mistake.
        """
        if not file_path.exists():
            return False

        try:
            with open(file_path, 'rb') as f:
                # Read first 1KB to check file signature
                data = f.read(1024)

            if len(data) == 0:
                return False

            # Check for common file signatures that indicate valid decrypted content
            extension = file_path.suffix.lower()

            if extension in ['.pdf']:
                # PDF files should start with %PDF-
                return not data.startswith(b'%PDF-')

            elif extension in ['.docx', '.xlsx', '.pptx']:
                # Office files should be ZIP archives starting with PK
                return not data.startswith(b'PK')

            elif extension in ['.doc']:
                # OLE files have specific signatures
                if len(data) < 8:
                    return True
                # Check for OLE signature
                ole_sig = data[:8]
                return ole_sig not in [b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1', b'\x0e\x11\xfc\x0d\xd0\xcf\x11\x0e']

            elif extension in ['.jpg', '.jpeg']:
                # JPEG files should start with SOI marker
                return not data.startswith(b'\xff\xd8')

            elif extension in ['.png']:
                # PNG files should start with PNG signature
                return not data.startswith(b'\x89PNG\r\n\x1a\n')

            elif extension in ['.txt']:
                # Text files should be mostly printable ASCII
                # Check if first 100 bytes contain mostly printable characters
                sample = data[:min(100, len(data))]
                printable_chars = sum(1 for byte in sample if 32 <= byte <= 126 or byte in [9, 10, 13])  # printable ASCII + tab, LF, CR
                return (printable_chars / len(sample)) < 0.8  # Less than 80% printable = likely encrypted

            else:
                # For other files, check if data looks like random binary (high entropy)
                # This is a simple heuristic - check for high byte value variation
                if len(data) < 64:
                    return False  # Too small to analyze

                # Calculate simple entropy heuristic
                byte_counts = {}
                sample_size = min(256, len(data))
                for byte in data[:sample_size]:
                    byte_counts[byte] = byte_counts.get(byte, 0) + 1

                # If we have many different byte values (high entropy), likely encrypted
                unique_bytes = len(byte_counts)
                # Lower threshold: more than 150 different byte values = likely encrypted
                if unique_bytes > 150:
                    return True

                # Additional check: if most bytes appear only once, likely encrypted
                single_occurrence_bytes = sum(1 for count in byte_counts.values() if count == 1)
                if single_occurrence_bytes > unique_bytes * 0.8:  # 80% of bytes appear only once
                    return True

                return False

        except Exception as e:
            print(f"Error checking if file is encrypted {file_path}: {e}")
            return False

    def _migrate_old_folders(self):
        """Migrate old ID-based folders to name-based folders"""
        if not self.clients_dir.exists():
            return
        
        for folder in self.clients_dir.iterdir():
            if not folder.is_dir():
                continue
            
            # Check if folder is ID-based (numeric name)
            try:
                client_id = int(folder.name)
                # This is an old ID-based folder
                if client_id in self.client_name_map:
                    new_name = self.client_name_map[client_id]
                    new_path = self.clients_dir / new_name
                    
                    if not new_path.exists():
                        print(f"Migrating folder from ID {client_id} to '{new_name}'")
                        try:
                            shutil.move(str(folder), str(new_path))
                        except Exception as e:
                            print(f"Error migrating folder {folder.name}: {e}")
            except ValueError:
                # Not a numeric folder name, skip
                pass
    
    def _update_folder_structure(self, documents: List[Dict]):
        """Ensure folder structure is up to date with current client names"""
        if not self.clients_dir.exists():
            return
        
        # Build current client name mapping from documents
        current_client_map: Dict[int, str] = {}
        for doc in documents:
            client_id = doc.get('clientId')
            client_name = doc.get('clientName', '')
            if client_id and client_name:
                sanitized = self.sanitize_folder_name(client_name)
                current_client_map[client_id] = sanitized
        
        # Check for client name changes and rename folders
        for client_id, new_name in current_client_map.items():
            old_name = self.client_name_map.get(client_id)
            
            if old_name and old_name != new_name:
                # Client name changed, rename folder — but only if the new name isn't already
                # taken by a different client (collision guard).
                collision = any(
                    cid != client_id and cname == new_name
                    for cid, cname in self.client_name_map.items()
                )
                if collision:
                    new_name = f"{new_name}_{client_id}"
                    print(f"[FOLDER] Name collision when renaming for client {client_id}: using unique name '{new_name}'")

                old_path = self.clients_dir / old_name
                new_path = self.clients_dir / new_name
                
                if old_path.exists() and not new_path.exists():
                    print(f"Renaming client folder from '{old_name}' to '{new_name}' (client ID: {client_id})")
                    try:
                        shutil.move(str(old_path), str(new_path))
                        self.client_name_map[client_id] = new_name
                    except Exception as e:
                        print(f"Error renaming folder from '{old_name}' to '{new_name}': {e}")
                elif not old_name in [f.name for f in self.clients_dir.iterdir() if f.is_dir()]:
                    # Old folder doesn't exist, just update mapping
                    self.client_name_map[client_id] = new_name
            elif not old_name:
                # New client, just update mapping
                self.client_name_map[client_id] = new_name
    
    def sync_to_server(self) -> Dict[str, int]:
        """Monitor virtual drive for changes and upload to server (encrypted)"""
        stats = {'uploaded': 0, 'errors': 0, 'locked': 0, 'skipped': 0}
        
        try:
            # Scan virtual drive for files
            if not self.clients_dir.exists():
                return stats
            
            # Get all documents to map folder names to client IDs
            try:
                response = self.session.get(
                    f"{self.api_url}/workstation-sync/sync/all",
                    headers=self._headers(),
                    timeout=30
                )
                response.raise_for_status()
                data = response.json()
                documents = data.get('documents', [])
                
                # Create reverse mapping: folder name -> client ID
                # IMPORTANT: Use client_name_map as the authoritative source because it contains
                # the unique folder names (with collision suffixes) built by ensure_client_dir.
                # Re-sanitizing raw client names here would miss those suffixes and cause wrong
                # client IDs to be assigned to folders.
                folder_to_client_id: Dict[str, int] = {v: k for k, v in self.client_name_map.items()}
                # Also create a set of existing server documents: (clientId, filename_lower) for quick lookup
                server_documents_set = set()
                for doc in documents:
                    client_id = doc['clientId']
                    client_name = doc.get('clientName', '')
                    filename_lower = doc.get('fileName', '').lower()
                    if client_id and filename_lower:
                        server_documents_set.add((client_id, filename_lower))
                    # Add ID-based folder mapping for backward compatibility with old folders
                    folder_to_client_id[str(client_id)] = client_id
                    # Seed any clients not yet in client_name_map (new clients seen for first time)
                    if client_id not in self.client_name_map and client_name:
                        sanitized = self.sanitize_folder_name(client_name)
                        if sanitized not in folder_to_client_id:
                            folder_to_client_id[sanitized] = client_id
            except Exception as e:
                print(f"Error getting client mapping: {e}")
                folder_to_client_id = {}
                server_documents_set = set()

            # When sync delete is off, files preserved after server-side delete are "pending delete" — do not re-upload them
            pending_delete_set = self._get_pending_delete_set()
            if pending_delete_set:
                self._log(f"Pending delete list: {len(pending_delete_set)} item(s) (will skip re-upload for these)")
            
            for client_dir in self.clients_dir.iterdir():
                if not client_dir.is_dir():
                    continue
                
                # Try to find client ID from folder name
                folder_name = client_dir.name
                client_id = None
                
                # Check if it's a name-based folder
                if folder_name in folder_to_client_id:
                    client_id = folder_to_client_id[folder_name]
                else:
                    # Try to parse as ID (for backward compatibility)
                    try:
                        client_id = int(folder_name)
                        folder_to_client_id[folder_name] = client_id
                    except ValueError:
                        # Unknown folder, skip
                        print(f"Warning: Unknown client folder '{folder_name}', skipping")
                        continue
                
                if client_id is None:
                    continue
                
                for file_path in client_dir.iterdir():
                    if not file_path.is_file() or file_path.name.startswith('.'):
                        continue
                    
                    # Skip Word temporary files
                    if is_word_temp_file(file_path):
                        continue

                    # Skip files with no recognised extension — these are system/tool artefacts
                    # (e.g. extensionless pip-installed scripts) and must never be treated as documents.
                    ALLOWED_SYNC_EXTENSIONS = {
                        '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
                        '.txt', '.rtf', '.odt', '.ods', '.odp',
                        '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif',
                        '.zip', '.7z', '.rar', '.tar', '.gz',
                        '.mp3', '.mp4', '.mov', '.avi', '.mkv',
                        '.eml', '.msg', '.csv', '.xml', '.json',
                    }
                    if file_path.suffix.lower() not in ALLOWED_SYNC_EXTENSIONS:
                        print(f"[SYNC] Skipping '{file_path.name}' in client folder — unrecognised extension, not a document.")
                        continue

                    try:
                        filename = file_path.name
                        document_id = None
                        
                        # Try to find document by filename + clientId
                        # First, check if filename matches any document for this client
                        matching_doc = None
                        for doc in documents:
                            if doc['clientId'] == client_id and doc['fileName'] == filename:
                                matching_doc = doc
                                document_id = doc['id']
                                break
                        
                        # If not found, try parsing old format: {documentId}_{filename}
                        if not matching_doc:
                            parts = file_path.stem.split('_', 1)
                            if len(parts) >= 2:
                                try:
                                    document_id = int(parts[0])
                                    old_filename = parts[1] + file_path.suffix
                                    # Find document by ID
                                    for doc in documents:
                                        if doc['id'] == document_id:
                                            matching_doc = doc
                                            # Rename file to new format (original filename)
                                            new_path = client_dir / doc['fileName']
                                            if new_path != file_path:
                                                print(f"Renaming file from old format: {filename} -> {doc['fileName']}")
                                                try:
                                                    file_path.rename(new_path)
                                                    file_path = new_path
                                                    filename = doc['fileName']
                                                except Exception as e:
                                                    print(f"Error renaming file: {e}")
                                            break
                                except ValueError:
                                    # Not in old format, skip
                                    continue
                        
                        if not document_id or not matching_doc:
                            # File doesn't match any document - check multiple conditions before uploading
                            
                            # Check 1: Is this file in the server documents list? (might have been deleted)
                            filename_lower = filename.lower()
                            if (client_id, filename_lower) in server_documents_set:
                                # File exists on server but doesn't match - might be a different version
                                # Skip upload to avoid conflicts
                                print(f"Skipping upload: File {filename} exists on server but doesn't match current document")
                                continue
                            
                            # Check 2: Was this file recently deleted?
                            was_recently_deleted = False
                            for doc_id, doc_state in self.sync_state.items():
                                if doc_state.get('deleted') and doc_state.get('path'):
                                    stored_path = Path(doc_state.get('path', ''))
                                    if stored_path.name.lower() == filename_lower:
                                        deleted_time = doc_state.get('deletedAt', 0)
                                        # If deleted within last 2 hours, don't re-upload
                                        if time.time() - deleted_time < 7200:
                                            was_recently_deleted = True
                                            print(f"Skipping upload of recently deleted file: {filename} (deleted {int((time.time() - deleted_time)/60)} minutes ago)")
                                            break
                            
                            if was_recently_deleted:
                                stats['errors'] += 1
                                continue

                            # Check 3: Is this file pending delete (server deleted, preserved on workstation)?
                            if (client_id, filename_lower) in pending_delete_set:
                                self._log(f"Preserved (pending delete), skipping upload: {filename}")
                                continue
                            
                            # File doesn't match any document and wasn't recently deleted - upload as new document
                            print(f"New file detected in virtual drive: {filename} (client: {client_id})")
                            
                            # Calculate file hash
                            current_hash = self.calculate_file_hash(file_path)
                            
                            # Derive title from filename (remove extension)
                            title = file_path.stem  # filename without extension
                            
                            # Upload as new document
                            try:
                                with open(file_path, 'rb') as f:
                                    files = {'file': (filename, f, 'application/octet-stream')}
                                    data = {
                                        'title': title,
                                        'clientId': str(client_id),
                                        'description': None,
                                        'caseId': None
                                    }
                                    headers = self._headers()
                                    headers.pop('Content-Type', None)  # Let requests set it for multipart
                                    
                                    upload_response = self.session.post(
                                        f"{self.api_url}/workstation-sync/upload-document",
                                        files=files,
                                        data=data,
                                        headers=headers,
                                        timeout=60
                                    )
                                    
                                    if upload_response.status_code == 400:
                                        error_msg = upload_response.json().get('error', 'Unknown error')
                                        print(f"Error uploading new document {filename}: {error_msg}")
                                        stats['errors'] += 1
                                        continue
                                    
                                    upload_response.raise_for_status()
                                    result = upload_response.json()
                                    
                                    # Get the new document ID from response
                                    new_document_id = result.get('id')
                                    if new_document_id:
                                        # Update sync state with new document
                                        self.sync_state[str(new_document_id)] = {
                                            'hash': current_hash,
                                            'serverHash': current_hash,
                                            'lastSynced': time.time(),
                                            'path': str(file_path)
                                        }
                                        
                                        # Copy file to monitored folder if configured
                                        client_name = result.get('clientName', '')
                                        if not client_name:
                                            # Try to get client name from documents list
                                            for doc in documents:
                                                if doc['clientId'] == client_id:
                                                    client_name = doc.get('clientName', '')
                                                    break
                                        
                                        copy_successful = self._copy_to_monitored_folder(file_path, filename, client_name, client_id)
                                        
                                        print(f"Successfully uploaded new document: {filename} (ID: {new_document_id})")
                                        stats['uploaded'] += 1
                                    else:
                                        print(f"Warning: Upload succeeded but no document ID returned for {filename}")
                                        stats['errors'] += 1
                                        
                            except Exception as e:
                                print(f"Error uploading new document {filename}: {e}")
                                stats['errors'] += 1
                            
                            continue  # Skip to next file
                        
                        # Calculate current file hash
                        current_hash = self.calculate_file_hash(file_path)
                        
                        # Check if file has changed
                        doc_state = self.sync_state.get(str(document_id), {})
                        last_hash = doc_state.get('hash', '')
                        stored_server_hash = doc_state.get('serverHash', '')
                        server_hash = matching_doc.get('syncHash', '')
                        
                        if current_hash == last_hash:
                            # File hasn't changed locally
                            continue
                        
                        # Conflict detection: Check if server has newer changes
                        if server_hash and stored_server_hash and server_hash != stored_server_hash:
                            # Server has changes that we don't have locally
                            print(f"Conflict detected for document {document_id}: Server has newer changes")
                            print(f"  Local hash: {current_hash[:16]}..., Server hash: {server_hash[:16]}...")
                            
                            # Get timestamps for conflict resolution
                            local_timestamp = file_path.stat().st_mtime if file_path.exists() else None
                            server_timestamp = matching_doc.get('updatedAt') or matching_doc.get('lastSyncedAt')
                            
                            # Use conflict resolver
                            lock_status = matching_doc.get('lockStatus', {})
                            resolution = self.conflict_resolver.resolve_conflict(
                                document_id=document_id,
                                local_path=file_path,
                                server_hash=server_hash,
                                local_hash=current_hash,
                                is_locked=lock_status.get('isLocked', False),
                                locked_by=lock_status.get('lockedBy'),
                                local_timestamp=local_timestamp,
                                server_timestamp=server_timestamp
                            )
                            
                            print(f"  Resolution strategy: {self.conflict_resolution}")
                            print(f"  Resolution: {resolution['message']}")
                            
                            # Handle resolution
                            if resolution['action'] == 'accept_local':
                                # Upload local version (it's newer or local_wins)
                                print(f"  Action: Uploading local version (newer or local_wins)")
                                # Continue to upload below
                            elif resolution['action'] == 'accept_server':
                                # Skip upload, server version takes precedence
                                print(f"  Action: Skipping upload, server version takes precedence")
                                # Update sync state to reflect server version
                                self.sync_state[str(document_id)] = {
                                    'hash': last_hash,  # Keep local hash for now
                                    'serverHash': server_hash,
                                    'lastSynced': time.time(),
                                    'path': str(file_path)
                                }
                                stats['skipped'] += 1
                                continue
                            elif resolution['action'] == 'create_conflict':
                                # Create conflict file and upload local version
                                if resolution.get('conflict_file'):
                                    print(f"  Action: Created conflict file: {resolution['conflict_file']}")
                                # Continue to upload below
                            elif resolution['action'] == 'reject':
                                # Skip this file (locked)
                                print(f"  Action: Rejected (file locked)")
                                stats['locked'] += 1
                                continue
                        
                        # Check if file is locked (use documents endpoint - requires user auth, skip for now)
                        # Lock check will be done server-side
                        lock_status = matching_doc.get('lockStatus', {})
                        if lock_status.get('isLocked') and lock_status.get('lockedByType') == 'user':
                            # File is locked by another user
                            stats['locked'] += 1
                            continue
                        
                        # Upload file to server
                        with open(file_path, 'rb') as f:
                            files = {'file': (filename, f, 'application/octet-stream')}
                            data = {
                                'syncHash': current_hash
                            }
                            headers = self._headers()
                            headers.pop('Content-Type', None)  # Let requests set it for multipart
                            
                            upload_response = self.session.post(
                                f"{self.api_url}/workstation-sync/sync/{document_id}",
                                files=files,
                                data=data,
                                headers=headers,
                                timeout=60
                            )
                            
                            if upload_response.status_code == 403:
                                # File is locked
                                stats['locked'] += 1
                                continue
                            
                            upload_response.raise_for_status()
                            
                            # Update sync state
                            self.sync_state[str(document_id)] = {
                                'hash': current_hash,
                                'serverHash': current_hash,
                                'lastSynced': time.time(),
                                'path': str(file_path)
                            }
                            
                            # Copy file to monitored folder if configured
                            copy_successful = self._copy_to_monitored_folder(file_path, filename, matching_doc.get('clientName', ''), client_id)
                            
                            # If file was successfully synced and copied to monitored folder, release the lock
                            if copy_successful and self.lock_release_callback:
                                try:
                                    self.lock_release_callback(document_id)
                                    print(f"Lock released for document {document_id} after successful sync")
                                except Exception as e:
                                    print(f"Error releasing lock for document {document_id}: {e}")
                            
                            stats['uploaded'] += 1
                    
                    except ValueError:
                        # Invalid filename format, skip
                        continue
                    except Exception as e:
                        print(f"Error syncing file {file_path}: {e}")
                        stats['errors'] += 1
            
            # Save sync state
            self.save_sync_state()
            
        except requests.exceptions.HTTPError as e:
            if e.response is not None and e.response.status_code == 401:
                print(f"Sync to server failed: Unauthorized (401). Check API key and that LAWFIRM_API_KEY env is set if using encrypted config.")
            print(f"Error in sync_to_server: {e}")
            stats['errors'] += 1
        except Exception as e:
            print(f"Error in sync_to_server: {e}")
            stats['errors'] += 1
        
        # Save sync state
        self.save_sync_state()
        
        return stats
    
    def _copy_to_monitored_folder(self, virtual_drive_file: Path, filename: str, client_name: str, client_id: int) -> bool:
        """Copy file from virtual drive to monitored folder after successful sync
        Returns True if file was successfully copied, False otherwise"""
        if not self.monitored_folders:
            return False
        
        # Check if auto_handle_corruption is disabled by reading config file
        auto_handle = True  # Default to True
        try:
            config_file = Path(__file__).parent / 'config.json'
            if config_file.exists():
                with open(config_file, 'r') as f:
                    config = json.load(f)
                    auto_handle = config.get('auto_handle_corruption', True)
        except Exception as e:
            print(f"[WARNING] Could not read auto_handle_corruption config: {e}, defaulting to True")
        
        try:
            # Find the monitored folder for this client
            for monitored_folder_path in self.monitored_folders:
                monitored_folder = Path(monitored_folder_path)
                if not monitored_folder.exists():
                    continue
                
                # Look for client folder in monitored directory
                # Try both sanitized name and original name
                sanitized_client_name = self.sanitize_folder_name(client_name) if client_name else None
                
                # Try to find client folder
                client_folder = None
                for item in monitored_folder.iterdir():
                    if item.is_dir():
                        # Check if folder name matches client (case-insensitive)
                        if client_name and item.name.lower() == client_name.lower():
                            client_folder = item
                            break
                        elif sanitized_client_name and item.name.lower() == sanitized_client_name.lower():
                            client_folder = item
                            break
                        # Also try matching by sanitized name
                        elif sanitized_client_name:
                            sanitized_item = self.sanitize_folder_name(item.name)
                            if sanitized_item.lower() == sanitized_client_name.lower():
                                client_folder = item
                                break
                
                if client_folder:
                    # Copy file to monitored folder (will overwrite if exists)
                    target_file = client_folder / filename
                    
                    # If auto_handle_corruption is disabled, check if target file is corrupted
                    # Only block copying if the destination is corrupted (to preserve corruption detection)
                    if not auto_handle and target_file.exists():
                        try:
                            # Check if target file is corrupted using imported CorruptionDetector
                            detector = CorruptionDetector([], self.virtual_drive_path)
                            is_corrupted, reason = detector.is_file_corrupted(target_file)
                            if is_corrupted:
                                print(f"[CORRUPTION] Skipping copy to monitored folder: {filename} is corrupted in destination ({reason})")
                                print(f"[CORRUPTION] User must manually restore via UI")
                                return False  # Don't overwrite corrupted file
                        except Exception as check_error:
                            # If corruption check fails, allow copy to proceed (fail-safe)
                            print(f"[WARNING] Could not check corruption status, allowing copy: {check_error}")
                            import traceback
                            traceback.print_exc()
                            # Continue with copy
                    
                    try:
                        # Check if file exists and is the same (to avoid unnecessary writes)
                        if target_file.exists():
                            existing_hash = self.calculate_file_hash(target_file)
                            new_hash = self.calculate_file_hash(virtual_drive_file)
                            if existing_hash == new_hash:
                                # File already exists and is identical, no need to copy
                                return True
                            # File exists but is different - explicitly remove old file first to ensure overwrite
                            try:
                                target_file.unlink()  # Remove existing file to ensure clean overwrite
                            except Exception as unlink_err:
                                # If can't remove (might be locked), try copy anyway (should overwrite)
                                print(f"Warning: Could not remove existing file before copy: {unlink_err}")
                        
                        # Copy/overwrite the file (shutil.copy2 overwrites by default, but we removed it above for safety)
                        shutil.copy2(virtual_drive_file, target_file)
                        print(f"Copied/overwritten {filename} to monitored folder: {client_folder}")
                        return True  # Successfully copied
                    except Exception as e:
                        print(f"Error copying file to monitored folder: {e}")
                        return False
        except Exception as e:
            print(f"Error in _copy_to_monitored_folder: {e}")
        
        return False  # File not found in any monitored folder
    
    def get_all_client_folders(self) -> List[Dict]:
        """Get all client folders from server (same endpoint as sync for consistent auth)."""
        try:
            response = self.session.get(
                f"{self.api_url}/workstation-sync/sync/all",
                headers=self._headers(),
                timeout=30
            )
            response.raise_for_status()
            data = response.json()
            return data.get('documents', [])
        except Exception as e:
            print(f"Error getting client folders: {e}")
            return []
    
    def acquire_file_lock(self, document_id: int, duration: Optional[int] = None) -> bool:
        """Acquire a lock on a file"""
        try:
            data = {}
            if duration:
                data['duration'] = duration
            
            response = self.session.post(
                f"{self.api_url}/documents/{document_id}/lock",
                headers=self._headers(),
                json=data,
                timeout=10
            )
            
            if response.status_code == 409:
                # Already locked
                return False
            
            response.raise_for_status()
            return True
        except Exception as e:
            print(f"Error acquiring lock for document {document_id}: {e}")
            return False
    
    def release_file_lock(self, document_id: int) -> bool:
        """Release a lock on a file"""
        try:
            response = self.session.delete(
                f"{self.api_url}/documents/{document_id}/lock",
                headers=self._headers(),
                timeout=10
            )
            response.raise_for_status()
            return True
        except Exception as e:
            print(f"Error releasing lock for document {document_id}: {e}")
            return False
    
    def _cleanup_orphaned_files(self, server_document_ids: set, documents: List[Dict]) -> int:
        """Clean up files that no longer exist on server (orphaned files)
        This runs after sync completes to avoid slowing down downloads.
        
        IMPORTANT: Only deletes files that were synced from server (in sync_state).
        Does NOT delete user-created files in virtual drive to prevent data loss.
        
        Returns count of deleted files."""
        deleted_count = 0
        
        # Find orphaned document IDs (in sync_state but not on server)
        # Only files in sync_state are guaranteed to be from server, not user-created
        orphaned_doc_ids = set(self.sync_state.keys()) - server_document_ids
        
        if not orphaned_doc_ids:
            return 0
        
        print(f"Cleaning up {len(orphaned_doc_ids)} orphaned files (synced from server but no longer exist)...")
        
        for doc_id in orphaned_doc_ids:
            try:
                doc_state = self.sync_state.get(doc_id, {})
                file_path_str = doc_state.get('path')
                
                if not file_path_str:
                    # No path stored, just remove from sync state
                    del self.sync_state[doc_id]
                    continue
                
                # Resolve path - handle both absolute and relative paths
                vd_path = Path(file_path_str)
                if not vd_path.is_absolute():
                    # If relative, resolve relative to virtual drive
                    vd_path = self.virtual_drive_path / vd_path
                vd_path = vd_path.resolve()
                
                # Verify this file should be deleted:
                # 1. It's in sync_state (was synced from server)
                # 2. The document ID is not in server list
                # 3. File exists at the stored path
                
                if not vd_path.exists():
                    # File already deleted - this is an orphaned file (not on server anymore)
                    # Just remove from sync state since it's truly orphaned
                    print(f"Orphaned file already deleted (not found at path): {vd_path.name}")
                    del self.sync_state[doc_id]
                    continue
                
                # Verify path is within virtual drive (safety check)
                try:
                    vd_path.relative_to(self.virtual_drive_path.resolve())
                except ValueError:
                    print(f"Warning: Orphaned file path outside virtual drive, skipping: {vd_path}")
                    del self.sync_state[doc_id]
                    continue
                
                # Additional safety check: Verify the file path structure matches expected pattern
                # Should be: .../clients/ClientName/filename
                if 'clients' not in vd_path.parts:
                    print(f"Warning: Orphaned file path doesn't match expected structure: {vd_path}")
                    # Still safe to delete since it's in sync_state (was from server)
                
                # Delete from virtual drive
                try:
                    filename = vd_path.name
                    vd_path.unlink()
                    deleted_count += 1
                    print(f"Deleted orphaned file from virtual drive: {filename} (docId: {doc_id})")
                except Exception as e:
                    print(f"Error deleting orphaned file {vd_path}: {e}")
                    # Continue to cleanup sync state even if file deletion fails
                
                # Try to delete from monitored folder
                # Extract client name from path: .../clients/ClientName/filename
                client_name = None
                if 'clients' in vd_path.parts:
                    try:
                        clients_index = vd_path.parts.index('clients')
                        if clients_index + 1 < len(vd_path.parts):
                            client_name = vd_path.parts[clients_index + 1]
                    except (ValueError, IndexError):
                        pass
                
                # If we have client name, try to delete from monitored folder
                if client_name:
                    self._delete_from_monitored_folder(filename, client_name)
                
                # Remove from sync state
                del self.sync_state[doc_id]
                
            except Exception as e:
                print(f"Error cleaning up orphaned document {doc_id}: {e}")
                # Still remove from sync state to avoid retrying
                if doc_id in self.sync_state:
                    del self.sync_state[doc_id]
        
        if deleted_count > 0:
            print(f"Cleaned up {deleted_count} orphaned files from virtual drive")
        
        return deleted_count
    
    def _cleanup_orphaned_files_by_matching(self, server_document_ids: set, documents: List[Dict]) -> int:
        """Additional cleanup: Check virtual drive files and match against server documents
        Only deletes files that match server document patterns (filename + client folder).
        This catches files that might not be in sync_state."""
        deleted_count = 0
        
        if not self.clients_dir.exists():
            return 0
        
        # Build a map of server documents: (clientId, filename_lower) -> document
        # and client_id -> display name (for pending-delete report; server expects "Robert Johnson" not "Robert_Johnson")
        server_files_map = {}
        client_display_names = {}
        for doc in documents:
            client_id = doc.get('clientId')
            filename = doc.get('fileName', '').lower()
            if client_id and filename:
                server_files_map[(client_id, filename)] = doc
            if client_id and doc.get('clientName'):
                client_display_names[client_id] = doc['clientName']

        # Scan virtual drive client folders
        try:
            for client_folder in self.clients_dir.iterdir():
                if not client_folder.is_dir():
                    continue
                
                # Find client ID from folder name (check client_name_map)
                client_id = None
                for cid, folder_name in self.client_name_map.items():
                    if folder_name == client_folder.name:
                        client_id = cid
                        break
                
                # If we can't find client ID, skip this folder (might be user-created)
                if not client_id:
                    continue
                
                # Check files in this client folder
                for file_path in client_folder.iterdir():
                    if not file_path.is_file():
                        continue
                    
                    # Skip temp files
                    if is_word_temp_file(file_path.name):
                        continue
                    
                    filename_lower = file_path.name.lower()
                    
                    # Check if this file exists on server
                    if (client_id, filename_lower) in server_files_map:
                        # File exists on server, keep it
                        continue
                    
                    # File doesn't exist on server - check if it was synced (in sync_state)
                    # Only delete if we can verify it was from server
                    file_was_synced = False
                    for doc_id, doc_state in self.sync_state.items():
                        stored_path = doc_state.get('path', '')
                        if stored_path and Path(stored_path) == file_path:
                            file_was_synced = True
                            break
                    
                    # Only delete if we're sure it was synced from server
                    if file_was_synced:
                        try:
                            file_path.unlink()
                            deleted_count += 1
                            print(f"Deleted orphaned file from virtual drive (by matching): {file_path.name} (client: {client_folder.name})")
                            # Pass display name for pending-delete report (server matches "Robert Johnson", not "Robert_Johnson")
                            display_name = client_display_names.get(client_id, client_folder.name)
                            self._delete_from_monitored_folder(file_path.name, display_name)
                        except Exception as e:
                            print(f"Error deleting orphaned file {file_path}: {e}")
        
        except Exception as e:
            print(f"Error in cleanup by matching: {e}")
        
        return deleted_count
    
    def _sync_delete_to_server_current(self) -> bool:
        """Current value of sync_delete_to_server (supports callable for dynamic config)."""
        v = self._sync_delete_to_server
        return v() if callable(v) else bool(v)

    def _delete_from_monitored_folder(self, filename: str, client_name: str):
        """Delete file from monitored folder if it exists.
        When sync_delete_to_server is False, preserve files in monitored folders (originals)
        and report to server so document shows as 'pending delete' with sync paused."""
        sync_enabled = self._sync_delete_to_server_current()
        if not sync_enabled:
            # Preserve originals in monitored folder when sync manual deletions is off
            print(f"Preserving in monitored folder (sync delete disabled): {client_name}/{filename}")
            if self.report_pending_delete_callback and client_name and filename:
                try:
                    self.report_pending_delete_callback(client_name, filename)
                except Exception as e:
                    print(f"Error reporting pending delete: {e}")
            return
        if not self.monitored_folders or not client_name:
            return
        
        sanitized_client_name = self.sanitize_folder_name(client_name)
        
        for monitored_folder in self.monitored_folders:
            monitored_path = Path(monitored_folder)
            if not monitored_path.exists():
                continue
            
            try:
                # Look for client folder (quick check, don't recurse)
                for item in monitored_path.iterdir():
                    if item.is_dir():
                        # Compare sanitized names (case-insensitive)
                        sanitized_item_name = self.sanitize_folder_name(item.name)
                        if sanitized_item_name.lower() == sanitized_client_name.lower():
                            file_path = item / filename
                            if file_path.exists():
                                # Double-check: never delete from monitored folder if sync delete is off
                                if not self._sync_delete_to_server_current():
                                    print(f"Preserving in monitored folder (sync delete disabled): {file_path.name}")
                                    return
                                try:
                                    file_path.unlink()
                                    print(f"Deleted file from monitored folder: {file_path.name}")
                                except Exception as e:
                                    print(f"Error deleting from monitored folder {file_path}: {e}")
                            break  # Found client folder, no need to continue
            except Exception as e:
                # Skip this monitored folder if there's an error
                print(f"Error checking monitored folder {monitored_folder}: {e}")
                continue

