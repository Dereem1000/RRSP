"""
File Sync Utility
Helper functions for file change detection and state tracking
"""

import hashlib
import os
from pathlib import Path
from typing import Optional, Dict
from datetime import datetime


def calculate_file_hash(file_path: Path) -> str:
    """Calculate MD5 hash of a file"""
    hash_md5 = hashlib.md5()
    try:
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_md5.update(chunk)
        return hash_md5.hexdigest()
    except Exception as e:
        print(f"Error calculating hash for {file_path}: {e}")
        return ""


def get_file_timestamp(file_path: Path) -> float:
    """Get file modification timestamp"""
    try:
        return os.path.getmtime(file_path)
    except Exception as e:
        print(f"Error getting timestamp for {file_path}: {e}")
        return 0.0


def detect_changes(local_path: Path, server_hash: Optional[str] = None, local_hash: Optional[str] = None) -> Dict[str, any]:
    """
    Detect if local file has changed compared to server
    
    Returns:
        {
            'changed': bool,
            'localHash': str,
            'serverHash': str,
            'timestamp': float
        }
    """
    if not local_path.exists():
        return {
            'changed': False,
            'localHash': None,
            'serverHash': server_hash,
            'timestamp': None,
            'exists': False
        }
    
    current_hash = local_hash or calculate_file_hash(local_path)
    current_timestamp = get_file_timestamp(local_path)
    
    return {
        'changed': current_hash != server_hash if server_hash else True,
        'localHash': current_hash,
        'serverHash': server_hash,
        'timestamp': current_timestamp,
        'exists': True
    }


def track_file_state(file_path: Path, hash_value: str, timestamp: float, metadata: Optional[Dict] = None) -> Dict:
    """
    Track file state for change detection
    
    Returns state dictionary
    """
    return {
        'path': str(file_path),
        'hash': hash_value,
        'timestamp': timestamp,
        'trackedAt': datetime.now().isoformat(),
        'metadata': metadata or {}
    }


def compare_file_states(local_state: Dict, server_state: Dict) -> Dict[str, any]:
    """
    Compare local and server file states
    
    Returns:
        {
            'localChanged': bool,
            'serverChanged': bool,
            'conflict': bool,
            'localNewer': bool
        }
    """
    local_hash = local_state.get('hash')
    server_hash = server_state.get('hash')
    local_timestamp = local_state.get('timestamp', 0)
    server_timestamp = server_state.get('timestamp', 0)
    
    local_changed = local_hash != server_hash
    server_changed = local_hash != server_hash  # Same condition for now
    conflict = local_changed and server_changed
    local_newer = local_timestamp > server_timestamp
    
    return {
        'localChanged': local_changed,
        'serverChanged': server_changed,
        'conflict': conflict,
        'localNewer': local_newer,
        'localHash': local_hash,
        'serverHash': server_hash
    }


def is_word_temp_file(file_path: Path) -> bool:
    """
    Check if a file is a Word temporary file that should be excluded from sync.
    
    Word creates temporary files when documents are opened:
    - Files starting with ~$ (e.g., ~$document.docx) - lock files created when document is opened
    - Files starting with ~WR (Word recovery files)
    - Files with .tmp extension that are in the same directory as Word documents
      (only exclude if the parent Word document exists)
    
    Args:
        file_path: Path to the file to check
        
    Returns:
        True if the file is a Word temporary file that should be excluded
    """
    filename = file_path.name
    
    # Check for files starting with ~$ (Word lock files created when document is opened)
    # These are always temporary and should be excluded
    if filename.startswith('~$'):
        return True
    
    # Check for Word recovery files starting with ~WR
    if filename.startswith('~WR'):
        return True
    
    # Check for .tmp files - these might be Word temporary files
    # Only exclude if there's a corresponding Word document in the same directory
    # and the parent file (the actual Word document) exists
    if file_path.suffix.lower() == '.tmp':
        parent_dir = file_path.parent
        # Check if there's a corresponding Word document in the same directory
        # Word temp files are usually in the same directory as the document
        try:
            # Get the base name without extension to check for corresponding Word doc
            base_name = file_path.stem
            
            # Check for corresponding .doc or .docx file
            # Word temp files often have names related to the document
            for item in parent_dir.iterdir():
                if item.is_file() and item != file_path:
                    # If there's a .doc or .docx file in the same directory,
                    # this .tmp might be a Word temporary file
                    if item.suffix.lower() in ['.doc', '.docx']:
                        # If the parent Word document exists, exclude the .tmp file
                        # This handles the case where Word creates temp files when opening documents
                        return True
        except (PermissionError, OSError):
            # If we can't check the directory, don't exclude (be conservative)
            pass
    
    return False






