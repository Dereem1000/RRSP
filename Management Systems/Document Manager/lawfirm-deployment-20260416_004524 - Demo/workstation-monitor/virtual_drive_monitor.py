"""
Virtual Drive File Monitor
Handles file deletion detection from virtual drive
"""

from pathlib import Path
from typing import Optional, Callable
from watchdog.events import FileSystemEventHandler
from file_sync import is_word_temp_file


class VirtualDriveMonitor(FileSystemEventHandler):
    """Monitor virtual drive for manual file deletions"""
    
    def __init__(self, delete_callback: Callable[[int, str, str], None], log_callback: Optional[Callable[[str], None]] = None):
        """
        Initialize virtual drive monitor
        
        Args:
            delete_callback: Function(client_id, filename, client_name) to call when file is deleted
            log_callback: Optional logging function
        """
        self.delete_callback = delete_callback
        self.log_callback = log_callback
    
    def log(self, message: str):
        """Log message"""
        if self.log_callback:
            self.log_callback(message)
        else:
            print(message)
    
    def on_deleted(self, event):
        """Handle file deletion in virtual drive"""
        # Skip directories and temp files
        if event.is_directory:
            return
        
        deleted_path = Path(event.src_path)
        if is_word_temp_file(deleted_path):
            return
        
        try:
            # Parse virtual drive path structure
            # Expected: virtual_drive_path/clients/client_name/file.ext
            parts = deleted_path.parts
            
            # Find 'clients' in path
            if 'clients' not in parts:
                return
            
            clients_index = parts.index('clients')
            
            # Check if we have client folder and filename
            if len(parts) < clients_index + 3:
                return
            
            client_folder_name = parts[clients_index + 1]
            filename = deleted_path.name
            
            self.log(f"🗑️ File deleted from virtual drive: {filename} from client: {client_folder_name}")
            
            # Extract client ID from folder name if it's numeric (e.g., "123")
            # or just use the folder name if it's the client name
            client_id = None
            try:
                # Try to parse as client ID (numeric folder name)
                client_id = int(client_folder_name)
            except ValueError:
                # Folder name is client name, not ID
                # We'll need to search for client ID
                pass
            
            # Call the deletion callback
            self.delete_callback(client_id, filename, client_folder_name)
        
        except Exception as e:
            self.log(f"Error handling virtual drive file deletion: {e}")
