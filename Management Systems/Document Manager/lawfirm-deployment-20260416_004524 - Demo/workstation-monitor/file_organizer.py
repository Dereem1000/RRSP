"""
File Organizer for Law Firm Workstation Monitor
Organizes loose files in monitored folders by extracting client names from document content.
"""

import os
import re
import time
import json
import threading
from pathlib import Path
from typing import List, Dict, Optional, Set, Tuple
from dataclasses import dataclass
from watchdog.events import FileSystemEventHandler
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from file_sync import is_word_temp_file

# Import document processing libraries
try:
    from pdfminer.high_level import extract_text as pdf_extract_text
except ImportError:
    pdf_extract_text = None

try:
    from docx import Document as DocxDocument
except ImportError:
    DocxDocument = None

try:
    import pytesseract
    from PIL import Image
except ImportError:
    pytesseract = None
    Image = None

@dataclass
class ClientMatch:
    """Represents a potential client match found in document content"""
    client_id: int
    client_name: str
    full_name: str
    confidence: float
    matched_text: str

@dataclass
class DocumentAnalysis:
    """Analysis result of a document"""
    file_path: str
    extracted_text: str
    potential_clients: List[ClientMatch]
    best_match: Optional[ClientMatch] = None
    confidence_threshold: float = 0.8

class FileOrganizer(FileSystemEventHandler):
    """
    Organizes loose files in monitored folders by scanning document content
    for approved client names and moving them to appropriate client folders.
    """

    def __init__(self, api_client, config, logger=None, processed_folders=None):
        self.api = api_client
        self.config = config
        self.logger = logger or self._default_logger
        self.processed_folders = processed_folders or set()  # Reference to folder monitor's processed folders

        # Configuration
        self.scan_interval = getattr(config, 'file_organizer_scan_interval', 300)  # 5 minutes default
        self.confidence_threshold = getattr(config, 'file_organizer_confidence_threshold', 0.8)
        self.max_text_length = getattr(config, 'file_organizer_max_text_length', 50000)  # Limit text extraction
        self.enabled = getattr(config, 'file_organizer_enabled', True)

        # Supported file extensions for scanning
        self.scan_extensions = {
            '.pdf', '.doc', '.docx', '.txt', '.rtf',
            '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff'
        }

        # Cache for client data to avoid repeated API calls
        self.client_cache = {}
        self.cache_expiry = 600  # 10 minutes

        # Processing state
        self.processing_files = set()
        self.last_scan_time = 0

        # Thread safety
        self.lock = threading.Lock()

        self.logger(f"File Organizer initialized (enabled: {self.enabled})")

    @staticmethod
    def _default_logger(message: str):
        """Default logger that prints to console"""
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] FILE ORGANIZER: {message}")

    def is_loose_file(self, file_path: str) -> bool:
        """
        Check if a file is a 'loose' file (not inside a client folder).
        A loose file is one that exists directly in a monitored folder or its subfolders,
        but not in a folder that matches a client name.
        """
        file_path = Path(file_path)

        # Check if file is in monitored directories
        is_monitored = False
        for monitored in self.config.monitored_folders:
            try:
                if file_path.resolve().is_relative_to(Path(monitored).resolve()):
                    is_monitored = True
                    break
            except:
                continue

        if not is_monitored:
            return False

        # Walk up the directory tree to find the first client folder
        current_dir = file_path.parent
        root_monitored_dir = None

        # Find which monitored directory this file is in
        for monitored in self.config.monitored_folders:
            monitored_path = Path(monitored)
            try:
                if file_path.resolve().is_relative_to(monitored_path.resolve()):
                    root_monitored_dir = monitored_path
                    break
            except:
                continue

        if not root_monitored_dir:
            return True  # Not in monitored directory

        # First check if any parent directory has been processed by the folder monitor
        current_dir = file_path.parent
        while current_dir != current_dir.parent:  # Stop at filesystem root
            if str(current_dir) in self.processed_folders:
                self.logger(f"File {file_path.name} is in folder '{current_dir.name}' that was processed by folder monitor - not a loose file")
                return False  # Folder was already processed by folder monitor

            if current_dir == root_monitored_dir:
                # We've reached the root monitored directory
                break

            current_dir = current_dir.parent

        # Check parent directories to see if any is a client folder
        current_dir = file_path.parent
        while current_dir != current_dir.parent:  # Stop at filesystem root
            if current_dir == root_monitored_dir:
                # We've reached the root monitored directory without finding a client folder
                break

            folder_name = current_dir.name.strip()

            # Quick check: if folder name has spaces or is longer than 2 words, it might be a client name
            if ' ' in folder_name or len(folder_name.split()) > 2:
                # Verify it's actually a known client
                try:
                    search_result = self.api.search_client(folder_name)
                    if search_result.get('found') and search_result.get('clients'):
                        self.logger(f"File {file_path.name} is in client folder '{folder_name}' - not a loose file")
                        return False  # It's in a valid client folder, don't treat as loose
                except Exception as e:
                    self.logger(f"Error checking if {folder_name} is a client folder: {e}")

            current_dir = current_dir.parent

        return True  # Consider it a loose file

    def extract_text_from_file(self, file_path: str) -> str:
        """
        Extract text content from various file types using OCR and document parsing.
        """
        file_path = Path(file_path)

        if not file_path.exists():
            return ""

        file_ext = file_path.suffix.lower()

        try:
            if file_ext == '.pdf':
                return self._extract_pdf_text(str(file_path))
            elif file_ext == '.docx':
                return self._extract_docx_text(str(file_path))
            elif file_ext == '.doc':
                return self._extract_doc_text(str(file_path))
            elif file_ext == '.txt':
                return self._extract_txt_text(str(file_path))
            elif file_ext in {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff'}:
                return self._extract_image_text(str(file_path))
            else:
                return ""
        except Exception as e:
            self.logger(f"Error extracting text from {file_path}: {e}")
            return ""

    def _extract_pdf_text(self, file_path: str) -> str:
        """Extract text from PDF files"""
        if not pdf_extract_text:
            self.logger("pdfminer not available for PDF text extraction")
            return ""

        try:
            text = pdf_extract_text(file_path)
            return text[:self.max_text_length] if text else ""
        except Exception as e:
            self.logger(f"PDF extraction failed: {e}")
            return ""

    def _extract_docx_text(self, file_path: str) -> str:
        """Extract text from DOCX files"""
        if not DocxDocument:
            self.logger("python-docx not available for DOCX text extraction")
            return ""

        try:
            doc = DocxDocument(file_path)
            text = ""
            for paragraph in doc.paragraphs:
                text += paragraph.text + "\n"
            return text[:self.max_text_length]
        except Exception as e:
            self.logger(f"DOCX extraction failed: {e}")
            return ""

    def _extract_doc_text(self, file_path: str) -> str:
        """Extract text from legacy DOC files"""
        # For legacy .doc files, we can't easily extract text without additional libraries
        self.logger(f"Legacy .doc files not supported: {file_path}")
        return ""

    def _extract_txt_text(self, file_path: str) -> str:
        """Extract text from plain text files"""
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                text = f.read()
                return text[:self.max_text_length]
        except Exception as e:
            self.logger(f"TXT extraction failed: {e}")
            return ""

    def _extract_image_text(self, file_path: str) -> str:
        """Extract text from images using OCR"""
        if not pytesseract or not Image:
            self.logger("Tesseract/PIL not available for OCR")
            return ""

        try:
            image = Image.open(file_path)
            text = pytesseract.image_to_string(image)
            return text[:self.max_text_length] if text else ""
        except Exception as e:
            self.logger(f"OCR extraction failed: {e}")
            return ""

    def find_client_names_in_text(self, text: str) -> List[ClientMatch]:
        """
        Search for client names in extracted text and return potential matches.
        """
        potential_clients = []

        if not text or len(text.strip()) < 10:
            return potential_clients

        # Get all clients from cache or API
        clients = self._get_all_clients()

        # Normalize text for better matching
        normalized_text = self._normalize_text(text)

        for client in clients:
            client_full_name = f"{client['firstName']} {client['lastName']}".strip()
            client_last_name = client['lastName'].strip()

            # Search for exact full name matches
            full_name_matches = re.findall(
                r'\b' + re.escape(client_full_name) + r'\b',
                normalized_text,
                re.IGNORECASE
            )

            # Search for "Last Name, First Name" format
            reversed_name = f"{client_last_name}, {client['firstName']}"
            reversed_matches = re.findall(
                r'\b' + re.escape(reversed_name) + r'\b',
                normalized_text,
                re.IGNORECASE
            )

            # Calculate confidence based on matches
            total_matches = len(full_name_matches) + len(reversed_matches)

            if total_matches > 0:
                # Higher confidence for multiple matches or exact matches
                confidence = min(0.95, 0.7 + (total_matches * 0.1))

                # Bonus for full name matches vs last name only
                if full_name_matches:
                    confidence += 0.1

                matched_text = full_name_matches[0] if full_name_matches else reversed_name

                potential_clients.append(ClientMatch(
                    client_id=client['id'],
                    client_name=client_full_name,
                    full_name=client_full_name,
                    confidence=min(confidence, 1.0),
                    matched_text=matched_text
                ))

        # Sort by confidence (highest first)
        potential_clients.sort(key=lambda x: x.confidence, reverse=True)

        return potential_clients

    def _normalize_text(self, text: str) -> str:
        """Normalize text for better client name matching"""
        # Remove extra whitespace and normalize
        text = re.sub(r'\s+', ' ', text.strip())

        # Common OCR error corrections
        corrections = {
            ' ,': ',',
            ' .': '.',
            ' ;': ';',
            ' :': ':',
        }

        for wrong, correct in corrections.items():
            text = text.replace(wrong, correct)

        return text

    def _get_all_clients(self) -> List[Dict]:
        """
        Get all clients by performing a broad search.
        Since there's no single endpoint to get all clients, we'll use a broad search approach.
        """
        current_time = time.time()

        # Check cache validity
        if (self.client_cache and
            current_time - self.client_cache.get('timestamp', 0) < self.cache_expiry):
            return self.client_cache['clients']

        # For workstation API, we don't have direct access to /clients endpoint
        # Instead, we'll build a client cache by searching with common patterns
        # This is less efficient but works with the available API

        clients = []
        common_search_terms = [
            'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
            'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
            'smith', 'johnson', 'williams', 'brown', 'jones', 'miller', 'davis'
        ]

        try:
            for term in common_search_terms:
                search_result = self.api.search_client(term)
                if search_result.get('clients'):
                    # Add new clients not already in our list
                    for client in search_result['clients']:
                        if not any(c['id'] == client['id'] for c in clients):
                            clients.append(client)

                # Limit to prevent excessive API calls
                if len(clients) > 500:  # Reasonable limit
                    break

            # Cache the results
            self.client_cache = {
                'clients': clients,
                'timestamp': current_time
            }

            self.logger(f"Cached {len(clients)} clients for document analysis")
            return clients

        except Exception as e:
            self.logger(f"Error building client cache: {e}")

            # Fallback: return cached data if available
            if self.client_cache:
                self.logger("Using cached client data")
                return self.client_cache['clients']

            return []

    def analyze_document(self, file_path: str) -> DocumentAnalysis:
        """
        Analyze a document to find potential client matches.
        """
        # Extract text from the file
        extracted_text = self.extract_text_from_file(file_path)

        if not extracted_text:
            return DocumentAnalysis(
                file_path=file_path,
                extracted_text="",
                potential_clients=[]
            )

        # Find potential client matches
        potential_clients = self.find_client_names_in_text(extracted_text)

        # Select best match above confidence threshold
        best_match = None
        if potential_clients and potential_clients[0].confidence >= self.confidence_threshold:
            best_match = potential_clients[0]

        return DocumentAnalysis(
            file_path=file_path,
            extracted_text=extracted_text,
            potential_clients=potential_clients,
            best_match=best_match,
            confidence_threshold=self.confidence_threshold
        )

    def organize_file(self, file_path: str, client_match: ClientMatch) -> bool:
        """
        Upload a file to the server for the identified client.
        The original file remains in its current location.
        """
        try:
            file_path_obj = Path(file_path)

            # Upload document to server for the identified client
            title = file_path_obj.stem  # Use filename without extension as title
            description = f"Auto-organized from workstation: {file_path_obj.parent}"

            result = self.api.upload_document(
                file_path=str(file_path_obj),
                client_id=client_match.client_id,
                title=title,
                description=description
            )

            # Check if upload was skipped (file already exists)
            if result.get('skipped'):
                self.logger(f"⊘ Skipped (already exists on server): {file_path_obj.name}")
                self.logger(f"  Client: {client_match.client_name} (ID: {client_match.client_id})")
                return True  # Consider this successful since file is already on server
            else:
                self.logger(f"✓ Uploaded organized file to server: {file_path_obj.name}")
                self.logger(f"  Client: {client_match.client_name} (ID: {client_match.client_id})")
                self.logger(".2f")
                return True

        except Exception as e:
            self.logger(f"Error uploading organized file {file_path}: {e}")
            return False

    def process_loose_file(self, file_path: str) -> bool:
        """
        Process a single loose file: analyze and organize if client found.
        """
        if not self.enabled:
            return False

        file_path_str = str(file_path)

        # Skip if already processing
        with self.lock:
            if file_path_str in self.processing_files:
                return False
            self.processing_files.add(file_path_str)

        try:
            self.logger(f"🔍 Analyzing loose file: {Path(file_path).name}")

            # Check if it's actually a loose file
            if not self.is_loose_file(file_path_str):
                return False

            # Analyze the document
            analysis = self.analyze_document(file_path_str)

            if not analysis.best_match:
                self.logger(f"  No suitable client match found in {Path(file_path).name}")
                return False

            # Organize the file
            success = self.organize_file(file_path_str, analysis.best_match)

            if success:
                self.logger(f"✓ Successfully organized {Path(file_path).name}")
            else:
                self.logger(f"✗ Failed to organize {Path(file_path).name}")

            return success

        finally:
            with self.lock:
                self.processing_files.discard(file_path_str)

    def scan_monitored_folders(self):
        """
        Scan all monitored folders for loose files and organize them.
        """
        if not self.enabled:
            return

        current_time = time.time()
        if current_time - self.last_scan_time < self.scan_interval:
            return  # Too soon for another scan

        self.last_scan_time = current_time

        self.logger("🔍 Starting File Organizer scan...")

        organized_count = 0
        scanned_count = 0

        for monitored_folder in self.config.monitored_folders:
            try:
                folder_path = Path(monitored_folder)
                if not folder_path.exists():
                    continue

                # Scan for loose files
                for file_path in folder_path.rglob('*'):
                    if file_path.is_file() and file_path.suffix.lower() in self.scan_extensions:
                        # Skip Word temporary files
                        if is_word_temp_file(file_path):
                            continue
                        scanned_count += 1

                        # Process the file
                        if self.process_loose_file(str(file_path)):
                            organized_count += 1

            except Exception as e:
                self.logger(f"Error scanning folder {monitored_folder}: {e}")

        self.logger(f"📊 Scan complete: {scanned_count} files scanned, {organized_count} organized")

    def on_created(self, event):
        """Handle file creation events"""
        if event.is_directory:
            return

        file_path = event.src_path
        if Path(file_path).suffix.lower() in self.scan_extensions:
            # Small delay to ensure file is fully written
            time.sleep(1)
            self.process_loose_file(file_path)

    def on_modified(self, event):
        """Handle file modification events"""
        if event.is_directory:
            return

        file_path = event.src_path
        if Path(file_path).suffix.lower() in self.scan_extensions:
            # Small delay to ensure file is fully written
            time.sleep(1)
            self.process_loose_file(file_path)

    def periodic_scan(self):
        """Periodic scan function to be called by a timer"""
        try:
            self.scan_monitored_folders()
        except Exception as e:
            self.logger(f"Error in periodic scan: {e}")

class FileOrganizerAPI:
    """
    API client for File Organizer operations.
    """

    def __init__(self, config):
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
        
        # Configure SSL verification (same as WorkstationAPI)
        if hasattr(config, 'ca_cert_path') and config.ca_cert_path and os.path.exists(config.ca_cert_path):
            self.session.verify = config.ca_cert_path
        else:
            verify_ssl = getattr(config, 'verify_ssl', True)
            self.session.verify = verify_ssl
            if not verify_ssl:
                import urllib3
                urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    def _headers(self) -> Dict[str, str]:
        """Get request headers with API key"""
        headers = {'Content-Type': 'application/json'}
        if self.config.api_key:
            headers['X-API-Key'] = self.config.api_key
        return headers

    def get_all_clients(self) -> List[Dict]:
        """Get all clients for matching purposes"""
        try:
            response = self.session.get(
                f"{self.config.api_url}/clients",
                headers=self._headers(),
                timeout=30
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"Error fetching all clients: {e}")
            return []

    def search_client(self, client_name: str) -> Dict:
        """Search for client by name"""
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
            print(f"Search client error: {e}")
            return {'clients': [], 'found': False}

    def upload_document(self, file_path: str, client_id: int, title: str, description: Optional[str] = None) -> Dict:
        """Upload document to server"""
        try:
            with open(file_path, 'rb') as f:
                files = {'file': (os.path.basename(file_path), f)}
                data = {
                    'title': title,
                    'clientId': str(client_id),
                    'description': description or '',
                }

                headers = self._headers()
                headers.pop('Content-Type', None)  # Let requests set Content-Type for multipart

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
            print(f"Upload document error: {e}")
            raise
