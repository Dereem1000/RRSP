"""
Conflict Resolution
Handles file editing conflicts when multiple users edit the same file
"""

from pathlib import Path
from typing import Dict, Optional
from datetime import datetime
import os


class ConflictResolver:
    def __init__(self, conflict_resolution: str = 'server_wins'):
        """
        Initialize conflict resolver
        
        Args:
            conflict_resolution: 'server_wins', 'local_wins', 'manual', 'timestamp'
        """
        self.resolution_strategy = conflict_resolution
    
    def resolve_conflict(
        self,
        document_id: int,
        local_path: Path,
        server_hash: str,
        local_hash: str,
        is_locked: bool,
        locked_by: Optional[int] = None,
        local_timestamp: Optional[float] = None,
        server_timestamp: Optional[float] = None
    ) -> Dict[str, any]:
        """
        Resolve a file editing conflict
        
        Args:
            document_id: Document ID
            local_path: Path to local file
            server_hash: Server file hash
            local_hash: Local file hash
            is_locked: Whether file is locked
            locked_by: Who locked the file
            local_timestamp: Local file modification timestamp (Unix timestamp)
            server_timestamp: Server file modification timestamp (Unix timestamp or ISO string)
        
        Returns:
            {
                'action': 'accept_local', 'accept_server', 'create_conflict', 'reject',
                'message': str,
                'conflict_file': Optional[Path]
            }
        """
        # If file is locked by another user, reject the change
        if is_locked and locked_by:
            return {
                'action': 'reject',
                'message': f'File is locked by user/workstation {locked_by}. Please wait for the lock to be released.',
                'conflict_file': None
            }
        
        # If hashes match, no conflict
        if server_hash == local_hash:
            return {
                'action': 'accept_local',
                'message': 'No conflict detected',
                'conflict_file': None
            }
        
        # Apply resolution strategy
        if self.resolution_strategy == 'server_wins':
            return {
                'action': 'accept_server',
                'message': 'Server version takes precedence. Local changes will be overwritten.',
                'conflict_file': None
            }
        
        elif self.resolution_strategy == 'local_wins':
            return {
                'action': 'accept_local',
                'message': 'Local version takes precedence. Server will be updated.',
                'conflict_file': None
            }
        
        elif self.resolution_strategy == 'timestamp':
            # Compare file modification times
            if local_timestamp is None and local_path.exists():
                # Get local file modification time
                local_timestamp = local_path.stat().st_mtime
            
            if server_timestamp is None:
                # No server timestamp available, default to server_wins
                return {
                    'action': 'accept_server',
                    'message': 'Using timestamp-based resolution (no server timestamp, defaulting to server)',
                    'conflict_file': None
                }
            
            # Convert server timestamp if it's a string (ISO format or Unix timestamp)
            if isinstance(server_timestamp, str):
                try:
                    # Try parsing as Unix timestamp string first
                    server_timestamp = float(server_timestamp)
                except:
                    try:
                        # Try parsing ISO format timestamp (YYYY-MM-DD HH:MM:SS or similar)
                        # Common formats: "2025-12-09 18:16:05", "2025-12-09T18:16:05"
                        server_timestamp = datetime.strptime(server_timestamp.replace('T', ' ').split('.')[0], '%Y-%m-%d %H:%M:%S').timestamp()
                    except:
                        # Can't parse, default to server
                        return {
                            'action': 'accept_server',
                            'message': 'Using timestamp-based resolution (invalid server timestamp, defaulting to server)',
                            'conflict_file': None
                        }
            
            # Compare timestamps
            if local_timestamp and server_timestamp:
                if local_timestamp > server_timestamp:
                    # Local is newer
                    return {
                        'action': 'accept_local',
                        'message': f'Timestamp-based resolution: Local file is newer (local: {datetime.fromtimestamp(local_timestamp)}, server: {datetime.fromtimestamp(server_timestamp)}). Local version will be used.',
                        'conflict_file': None
                    }
                elif server_timestamp > local_timestamp:
                    # Server is newer
                    return {
                        'action': 'accept_server',
                        'message': f'Timestamp-based resolution: Server file is newer (server: {datetime.fromtimestamp(server_timestamp)}, local: {datetime.fromtimestamp(local_timestamp)}). Server version will be used.',
                        'conflict_file': None
                    }
                else:
                    # Same timestamp (very unlikely), default to server
                    return {
                        'action': 'accept_server',
                        'message': 'Timestamp-based resolution: Timestamps are equal, defaulting to server version.',
                        'conflict_file': None
                    }
            else:
                # Missing timestamp, default to server
                return {
                    'action': 'accept_server',
                    'message': 'Using timestamp-based resolution (missing timestamp, defaulting to server)',
                    'conflict_file': None
                }
        
        elif self.resolution_strategy == 'manual':
            # Create conflict file for manual resolution
            conflict_file = self._create_conflict_file(local_path, document_id)
            return {
                'action': 'create_conflict',
                'message': f'Conflict detected. Conflict file created: {conflict_file.name}',
                'conflict_file': conflict_file
            }
        
        else:
            # Default to server_wins
            return {
                'action': 'accept_server',
                'message': 'Default resolution: server wins',
                'conflict_file': None
            }
    
    def _create_conflict_file(self, original_path: Path, document_id: int) -> Path:
        """Create a conflict file with timestamp"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        conflict_name = f"{original_path.stem}_CONFLICT_{timestamp}{original_path.suffix}"
        conflict_path = original_path.parent / conflict_name
        
        # Copy original file to conflict file
        if original_path.exists():
            with open(original_path, 'rb') as src, open(conflict_path, 'wb') as dst:
                dst.write(src.read())
        
        return conflict_path
    
    def handle_locked_file(self, document_id: int, locked_by: Optional[int], locked_by_type: Optional[str]) -> Dict[str, any]:
        """Handle attempt to edit a locked file"""
        if locked_by_type == 'user':
            message = f'File is currently being edited by user {locked_by}. Please wait for them to finish.'
        elif locked_by_type == 'workstation':
            message = f'File is currently being edited by workstation {locked_by}. Please wait.'
        else:
            message = 'File is currently locked. Please wait for the lock to be released.'
        
        return {
            'action': 'reject',
            'message': message,
            'conflict_file': None,
            'locked': True,
            'locked_by': locked_by
        }


