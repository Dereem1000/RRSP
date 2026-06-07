# Law Firm Workstation Monitor

A Python application for Windows that monitors specified folders for client documents and automatically syncs them with the Law Firm Management System web application.

## Features

- **Virtual Drive Mounting**: Mounts a virtual drive (e.g., Z:) to a specified path for easy access
- **Bidirectional Sync**: Automatic sync between server and virtual drive
  - Downloads encrypted files from server and decrypts them to virtual drive
  - Uploads changed files from virtual drive to server (with encryption)
- **Folder Monitoring**: Monitors specified folders for new client folders and documents
- **Automatic Client Detection**: Detects client folders by name and checks if they exist in the system
- **Document Upload**: Automatically uploads documents to the web application when clients are found
- **File Organizer**: Automatically scans loose files for client names and uploads them to the server under the identified client
  - OCR support for scanned documents and images
  - PDF, DOCX, and TXT file processing
  - Configurable confidence thresholds and scan intervals
  - Original files remain in place after upload
- **Pending Client Requests**: Creates pending requests in the dashboard when new clients are detected
- **File Locking**: Checks file locks before syncing changes to prevent conflicts
- **Secure API Authentication**: Uses API keys for secure communication with the server
- **GUI Application**: User-friendly graphical interface for configuration and monitoring

## Installation

1. **Install Python 3.8 or higher** (if not already installed)

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

## Configuration

### Initial Setup

When you first run the application, it will prompt you for:

1. **Workstation Name**: A friendly name for this workstation (e.g., "Reception Desk")
2. **Monitored Folders**: Comma-separated list of folders to monitor (e.g., `C:\Documents\Clients, D:\LawFirm\Files`)
3. **Virtual Drive Letter** (optional): Drive letter to mount (e.g., `Z:`)
4. **Virtual Drive Path** (optional): Path that the virtual drive should point to

The application will register with the server and receive an API key, which is automatically saved.

### Configuration File

After initial setup, configuration is saved in `config.json`:

```json
{
  "api_url": "http://localhost:5002/api",
  "api_key": "your-api-key-here",
  "workstation_id": 1,
  "monitored_folders": [
    "C:\\Documents\\Clients",
    "D:\\LawFirm\\Files"
  ],
  "virtual_drive_letter": "Z:",
  "virtual_drive_path": "C:\\VirtualDrive",
  "check_interval": 60,
  "virtual_drive_sync_interval": 60,
  "file_lock_check_interval": 10,
  "conflict_resolution": "server_wins",
  "file_organizer_enabled": true,
  "file_organizer_scan_interval": 300,
  "file_organizer_confidence_threshold": 0.8,
  "file_organizer_max_text_length": 50000
}
```

### Configuration Options

- **api_url**: Server API endpoint (default: `http://localhost:5002/api`)
- **api_key**: Workstation API key (obtained during registration)
- **workstation_id**: Unique workstation identifier
- **monitored_folders**: List of folders to monitor for new client documents
- **virtual_drive_letter**: Drive letter for virtual drive (e.g., `Z:`)
- **virtual_drive_path**: Local path where virtual drive files are stored
- **check_interval**: How often to scan monitored folders (seconds, default: 60)
- **virtual_drive_sync_interval**: How often to sync with server (seconds, default: 60)
- **file_lock_check_interval**: How often to check file locks (seconds, default: 10)
- **conflict_resolution**: Strategy for handling conflicts (`server_wins`, `local_wins`, `manual`, `timestamp`)
- **file_organizer_enabled**: Enable/disable automatic file organization (default: true)
- **file_organizer_scan_interval**: How often to scan for loose files (seconds, default: 600)
- **file_organizer_confidence_threshold**: Minimum confidence level to auto-organize files (0.0-1.0, default: 0.8)
- **file_organizer_max_text_length**: Maximum characters to extract from documents (default: 50000)

## Usage

### Running the Application

**Command Line Interface**:
```bash
python main.py
```

**Graphical User Interface**:
```bash
python gui_app.py
```

Or use the provided batch files:
- `start_workstation.bat` - Start command-line monitor
- `start_gui.bat` - Start GUI application

The application will:
1. Register with the server (if not already registered)
2. Mount the virtual drive (if configured)
3. Start monitoring the specified folders
4. Send periodic heartbeats to the server
5. Process new client folders and documents
6. Organize loose files automatically (if File Organizer is enabled)
7. Sync files between server and virtual drive (if configured)

## File Organizer

The File Organizer is an intelligent feature that automatically scans loose files (files not in client folders) in monitored directories, extracts client names from document content, and uploads the documents to the server under the identified client record.

### How It Works

1. **File Detection**: Identifies files that are not already in client folders within monitored directories
2. **Content Analysis**: Extracts text from various file types:
   - PDF documents (using pdfminer)
   - Word documents (DOCX)
   - Text files (TXT)
   - Images with text (using OCR with Tesseract)
3. **Client Matching**: Searches extracted text for approved client names using fuzzy matching
4. **Server Upload**: Uploads files to the server under the identified client record when matches are found with sufficient confidence
5. **File Preservation**: Original files remain in their current location after successful upload

### Supported File Types

- PDF (.pdf)
- Microsoft Word (.docx)
- Plain Text (.txt)
- Images (.jpg, .jpeg, .png, .gif, .bmp, .tiff)

### Requirements

For full functionality, install additional Python packages:
```bash
pip install pdfminer.six python-docx pytesseract
```

For OCR functionality (image processing), also install Tesseract OCR:
- Windows: Download from https://github.com/UB-Mannheim/tesseract/wiki
- Add to PATH environment variable

### Configuration

The File Organizer can be configured during initial setup or by editing `config.json`:

- **Enable/Disable**: Set `file_organizer_enabled` to control the feature
- **Scan Frequency**: Adjust `file_organizer_scan_interval` (default: 300 seconds / 5 minutes)
- **Confidence Threshold**: Set `file_organizer_confidence_threshold` to control auto-organization sensitivity (0.0-1.0)
- **Text Limits**: Configure `file_organizer_max_text_length` to limit processing time for large documents

### Manual Testing

Run the test script to verify File Organizer functionality:
```bash
python test_file_organizer.py
```

### How It Works

1. **Folder Detection**: When a new folder is created in a monitored directory, the application checks if it contains documents
2. **Client Lookup**: The folder name is used to search for the client in the web application
3. **Document Upload**: If the client exists, all documents in the folder are automatically uploaded (and encrypted on server)
4. **Pending Request**: If the client doesn't exist, a pending request is created in the web application dashboard
5. **Virtual Drive Sync**:
   - **From Server**: Downloads encrypted files, decrypts them, and saves to virtual drive
   - **To Server**: Detects changes in virtual drive files, encrypts them, and uploads to server
   - **File Locking**: Checks locks before syncing changes to prevent conflicts

### Supported Document Types

- PDF (`.pdf`)
- Word Documents (`.doc`, `.docx`)
- Text Files (`.txt`)
- Images (`.jpg`, `.jpeg`, `.png`)

## Workflow Example

1. Staff creates a folder named "John Doe" in `C:\Documents\Clients\`
2. Staff adds documents (contracts, forms, etc.) to the folder
3. The monitor detects the folder and searches for "John Doe" in the system
4. If found: Documents are automatically uploaded to John Doe's client record
5. If not found: A pending request appears in the dashboard asking to create the client

## Logging

All activities are logged to `monitor.log` in the application directory. The log includes:
- Registration events
- Folder detection
- Client lookups
- Document uploads
- Errors and warnings

## Troubleshooting

### Virtual Drive Not Mounting

- Ensure you're running as Administrator (required for `subst` command)
- Check that the drive letter is not already in use
- Verify the path exists and is accessible

### Connection Errors

- Verify the server URL is correct in `config.json`
- Check that the web application server is running
- Ensure the API key is valid (regenerate if needed from the Workstations page)

### Documents Not Uploading

- Check the log file for errors
- Verify the client exists in the system
- Ensure document file types are supported
- Check file size limits (10MB per file)

## Security Notes

- **Production**: Use the `LAWFIRM_API_KEY` (or `WORKSTATION_API_KEY`) environment variable for the API key so it is never stored in config. The app checks env first, then config.
- The API key in `config.json` (if used) can be stored encrypted (fernet/base64); the app decrypts only in memory when building requests. Keep `config.json` secure and use HTTPS in production.
- The application communicates with the server over HTTP/HTTPS; use HTTPS in production so the API key is protected in transit.
- API keys can be regenerated from the Workstations page in the web application.

## Running as a Service

To run the application as a Windows service, you can use tools like:
- **NSSM** (Non-Sucking Service Manager)
- **Task Scheduler** (for scheduled tasks)

Example Task Scheduler setup:
1. Open Task Scheduler
2. Create Basic Task
3. Set trigger to "When the computer starts"
4. Set action to start program: `python.exe` with arguments: `"C:\path\to\main.py"`
5. Set "Start in" to the application directory

## Support

For issues or questions, refer to the main Law Firm Management System documentation.

