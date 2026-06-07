"""
File Corruption Detection and Management
Handles detection of corrupted files and preservation of working copies
"""

import os
import hashlib
import json
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Callable
from dataclasses import dataclass, asdict
from enum import Enum


class CorruptionStatus(Enum):
    HEALTHY = "healthy"
    CORRUPTED = "corrupted"
    WORKING_COPY_FOUND = "working_copy_found"
    UPLOAD_PAUSED = "upload_paused"


@dataclass
class CorruptionRecord:
    """Record of file corruption detection"""
    file_path: str
    document_id: int
    client_id: int
    filename: str
    corruption_detected_at: float
    status: CorruptionStatus
    original_hash: str
    working_copy_paths: List[str] = None
    resolution_action: str = ""
    resolved_at: Optional[float] = None

    def __post_init__(self):
        if self.working_copy_paths is None:
            self.working_copy_paths = []

    def to_dict(self) -> Dict:
        data = asdict(self)
        data['status'] = self.status.value
        return data

    @classmethod
    def from_dict(cls, data: Dict) -> 'CorruptionRecord':
        data['status'] = CorruptionStatus(data['status'])
        return cls(**data)


class CorruptionDetector:
    """Handles file corruption detection and management"""

    def __init__(self, monitored_folders: List[str], virtual_drive_path: str, corruption_state_file: Optional[str] = None, auto_handle: bool = False):
        self.monitored_folders = [Path(folder) for folder in monitored_folders]
        self.virtual_drive_path = Path(virtual_drive_path)
        self.corruption_state_file = Path(corruption_state_file or (self.virtual_drive_path / '.corruption_state.json'))
        self.corruption_records: Dict[str, CorruptionRecord] = {}
        self.auto_handle = auto_handle  # If True, automatically handle corruption; if False, require user action
        self.load_corruption_state()

    def load_corruption_state(self):
        """Load corruption state from file"""
        if self.corruption_state_file.exists():
            try:
                with open(self.corruption_state_file, 'r') as f:
                    data = json.load(f)
                    self.corruption_records = {}
                    for key, record_data in data.get('records', {}).items():
                        self.corruption_records[key] = CorruptionRecord.from_dict(record_data)
            except Exception as e:
                print(f"Error loading corruption state: {e}")
                self.corruption_records = {}
        else:
            self.corruption_records = {}

    def save_corruption_state(self):
        """Save corruption state to file"""
        try:
            data = {
                'records': {key: record.to_dict() for key, record in self.corruption_records.items()}
            }
            with open(self.corruption_state_file, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"Error saving corruption state: {e}")

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

    def is_file_corrupted(self, file_path: Path) -> Tuple[bool, str]:
        """
        Check if a file is corrupted by attempting to read it and checking basic integrity
        Returns: (is_corrupted, reason)
        """
        if not file_path.exists():
            return True, "File does not exist"

        try:
            # Check file size
            stat = file_path.stat()
            if stat.st_size == 0:
                return True, "File is empty"

            # Try to read the file
            with open(file_path, 'rb') as f:
                # Read first 1KB to check if file is readable
                data = f.read(1024)
                if len(data) == 0:
                    return True, "File appears empty or unreadable"

                # For common file types, do basic structure checks
                extension = file_path.suffix.lower()

                if extension in ['.pdf']:
                    # PDF files should start with %PDF-
                    if not data.startswith(b'%PDF-'):
                        # Check if it looks like encrypted data instead
                        if self._is_data_encrypted(data, extension):
                            return True, "File appears to contain encrypted data instead of valid PDF"
                        return True, "Invalid PDF file format"

                elif extension in ['.docx', '.xlsx', '.pptx']:
                    # Office files should be ZIP archives
                    if not data.startswith(b'PK'):
                        if self._is_data_encrypted(data, extension):
                            return True, f"File appears to contain encrypted data instead of valid {extension}"
                        return True, f"Invalid {extension} file format"

                elif extension in ['.doc']:
                    # OLE files should start with specific signature
                    if len(data) < 8 or data[:8] not in [b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1', b'\x0e\x11\xfc\x0d\xd0\xcf\x11\x0e']:
                        if self._is_data_encrypted(data, extension):
                            return True, "File appears to contain encrypted data instead of valid DOC"
                        return True, "Invalid DOC file format"

                elif extension in ['.jpg', '.jpeg']:
                    # JPEG files should start with SOI marker
                    if not data.startswith(b'\xff\xd8'):
                        if self._is_data_encrypted(data, extension):
                            return True, "File appears to contain encrypted data instead of valid JPEG"
                        return True, "Invalid JPEG file format"

                elif extension in ['.png']:
                    # PNG files should start with PNG signature
                    if not data.startswith(b'\x89PNG\r\n\x1a\n'):
                        if self._is_data_encrypted(data, extension):
                            return True, "File appears to contain encrypted data instead of valid PNG"
                        return True, "Invalid PNG file format"

                elif extension in ['.txt']:
                    # Text files should be mostly printable ASCII
                    if self._is_data_encrypted(data, extension):
                        return True, "File appears to contain encrypted data instead of valid text"

                # Additional checks can be added for other file types

            # File appears to be intact
            return False, ""

        except (OSError, IOError) as e:
            return True, f"File read error: {str(e)}"
        except Exception as e:
            return True, f"Unexpected error during corruption check: {str(e)}"

    def _is_data_encrypted(self, data: bytes, extension: str) -> bool:
        """
        Check if binary data appears to be encrypted rather than valid file content.
        This is a heuristic check for encrypted data corruption.
        """
        if len(data) < 64:
            return False  # Too small to analyze

        if extension == '.txt':
            # Text files should be mostly printable ASCII
            sample = data[:min(100, len(data))]
            printable_chars = sum(1 for byte in sample if 32 <= byte <= 126 or byte in [9, 10, 13])  # printable ASCII + whitespace
            return (printable_chars / len(sample)) < 0.8  # Less than 80% printable = likely encrypted
        else:
            # For binary files, check for high entropy (many different byte values)
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

    def find_working_copies(self, client_id: int, filename: str, exclude_path: Optional[Path] = None) -> List[Path]:
        """Find working copies of a file in monitored folders"""
        working_copies = []

        for monitored_folder in self.monitored_folders:
            if not monitored_folder.exists():
                continue

            try:
                # Look for client folders
                for item in monitored_folder.iterdir():
                    if not item.is_dir():
                        continue

                    # Check if this folder belongs to the client
                    # This is a simplified check - in practice, you'd want to match by client name or ID
                    client_folder = item

                    # Look for the specific file
                    target_file = client_folder / filename
                    if target_file.exists() and (exclude_path is None or target_file != exclude_path):
                        # Quick corruption check on the candidate working copy
                        is_corrupted, _ = self.is_file_corrupted(target_file)
                        if not is_corrupted:
                            working_copies.append(target_file)

            except Exception as e:
                print(f"Error searching for working copies in {monitored_folder}: {e}")

        return working_copies

    def check_file_for_corruption(self, file_path: Path, document_id: int, client_id: int, filename: str) -> Tuple[bool, CorruptionRecord]:
        """
        Check if a file is corrupted and create corruption record if needed
        Returns: (should_pause_upload, corruption_record)
        """
        record_key = f"{document_id}_{filename}"

        # Check if already processed
        if record_key in self.corruption_records:
            existing_record = self.corruption_records[record_key]
            if existing_record.status in [CorruptionStatus.WORKING_COPY_FOUND, CorruptionStatus.UPLOAD_PAUSED]:
                return True, existing_record

        # Check file corruption
        is_corrupted, reason = self.is_file_corrupted(file_path)

        if not is_corrupted:
            # File is healthy, remove any existing corruption record
            if record_key in self.corruption_records:
                del self.corruption_records[record_key]
                self.save_corruption_state()
            return False, None

        # File is corrupted - find working copies
        working_copies = self.find_working_copies(client_id, filename, exclude_path=file_path)

        # Create corruption record
        record = CorruptionRecord(
            file_path=str(file_path),
            document_id=document_id,
            client_id=client_id,
            filename=filename,
            corruption_detected_at=time.time(),
            status=CorruptionStatus.WORKING_COPY_FOUND if working_copies else CorruptionStatus.CORRUPTED,
            original_hash=self.calculate_file_hash(file_path),
            working_copy_paths=[str(path) for path in working_copies]
        )

        self.corruption_records[record_key] = record
        self.save_corruption_state()

        # Return whether upload should be paused (pause if working copies exist)
        should_pause = len(working_copies) > 0
        if should_pause:
            record.status = CorruptionStatus.UPLOAD_PAUSED
            self.save_corruption_state()

        print(f"Corruption detected for {filename}: {reason}")
        if working_copies:
            print(f"Found {len(working_copies)} working copies, upload paused")
        else:
            print("No working copies found")

        return should_pause, record

    def get_corruption_records(self) -> List[CorruptionRecord]:
        """Get all active corruption records"""
        return list(self.corruption_records.values())

    def resolve_corruption(self, document_id: int, filename: str, action: str, working_copy_path: Optional[str] = None):
        """Resolve a corruption issue"""
        record_key = f"{document_id}_{filename}"

        if record_key not in self.corruption_records:
            return

        record = self.corruption_records[record_key]
        record.resolution_action = action
        record.resolved_at = time.time()

        if action == "use_working_copy" and working_copy_path:
            # Copy working copy to virtual drive location
            try:
                source_path = Path(working_copy_path)
                dest_path = Path(record.file_path)

                # Ensure destination directory exists
                dest_path.parent.mkdir(parents=True, exist_ok=True)

                # Copy the working copy
                import shutil
                shutil.copy2(source_path, dest_path)

                record.status = CorruptionStatus.HEALTHY
                print(f"Restored file from working copy: {working_copy_path}")

            except Exception as e:
                print(f"Error restoring from working copy: {e}")

        elif action == "delete_corrupted":
            # Remove the corrupted file
            try:
                Path(record.file_path).unlink(missing_ok=True)
                record.status = CorruptionStatus.HEALTHY
                print(f"Deleted corrupted file: {record.file_path}")
            except Exception as e:
                print(f"Error deleting corrupted file: {e}")

        elif action == "ignore":
            # Mark as healthy and continue
            record.status = CorruptionStatus.HEALTHY
            print(f"Ignored corruption for: {record.file_path}")

        self.save_corruption_state()

    def get_critical_issues_count(self) -> int:
        """Get count of critical corruption issues that need attention"""
        return len([r for r in self.corruption_records.values()
                   if r.status in [CorruptionStatus.CORRUPTED, CorruptionStatus.UPLOAD_PAUSED]])
