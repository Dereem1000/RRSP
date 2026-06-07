# Law Firm Workstation Monitor - GUI Application

A Windows GUI application for monitoring folders and syncing documents with the Law Firm Management System.

## Features

- **Graphical User Interface** - Easy-to-use Windows application
- **System Tray Support** - Minimize to system tray and run in background
- **Desktop Notifications** - Configurable notifications (All, Important, Errors Only)
- **Real-time Status** - Monitor connection status and workstation information
- **Configuration Management** - Configure settings through the GUI
- **Activity Logs** - View real-time activity logs
- **Folder Monitoring** - Add/remove monitored folders easily
- **Virtual Drive** - Configure and mount virtual drives
- **One-Click Start/Stop** - Simple controls to start and stop monitoring

## Installation

1. **Install Python 3.8 or higher** (if not already installed)

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

   **Note**: The application includes system tray and notification features that require additional packages:
   - `pystray` - System tray icon support
   - `plyer` - Desktop notifications
   - `Pillow` - Icon generation

   These are included in `requirements.txt` and will be installed automatically.

## System Tray Features

The application runs in the system tray (notification area) and provides desktop notifications for important events:

- **System Tray Icon**: Blue monitor icon in the system tray
- **Minimize to Tray**: Window automatically minimizes to tray when minimized
- **Right-click Menu**: Access all functions from the tray icon menu:
  - Show Window / Minimize to Tray
  - Start/Stop Monitor
  - Exit Application
- **Desktop Notifications**: Configurable notifications for:
  - Documents are successfully uploaded (optional)
  - Pending requests are created for new clients
  - Errors occur during uploads
  - Application is minimized/restored (optional)
- **Notification Control**: Choose notification level (All, Important, Errors Only)

## Running the Application

### Option 1: Double-click the batch file (Recommended)
- Double-click `start_workstation.bat` to launch the application in system tray mode
- Or use `start_gui.bat` (same functionality)
- The application will start minimized to the system tray (no console window visible)

### Option 2: Windowed mode (for debugging)
- Double-click `start_gui_windowed.bat` to run with visible console window
- Useful for troubleshooting or if system tray mode doesn't work

### Option 3: Run from command line
```bash
pythonw gui_app.py  # Runs without console window (system tray mode)
python gui_app.py   # Runs with console window visible
```

### First Time: Install Dependencies
If you haven't installed dependencies yet:
- Double-click `install_dependencies.bat`
- This will install all required Python packages

## Using the Application

### First Time Setup

**Option 1: If workstation was registered on web app first**

1. **Open the Configuration Tab**
   - Enter the Server URL (default: `http://localhost:5000/api`)
   - Enter your API Key (get it from the Workstations page in the web app)
   - Click **"Connect & Load Config"** button
   - This will automatically load and pre-fill all configuration from the server:
     - Workstation name
     - Monitored folders
     - Virtual drive settings
   - Review the settings and click "Save Configuration"

**Option 2: Register new workstation from the app**

1. **Open the Configuration Tab**
   - Enter the Server URL (default: `http://localhost:5000/api`)
   - Enter a Workstation Name
   - (Optional) Click "Add Folder" to select folders to monitor
   - (Optional) Configure virtual drive settings

2. **Register Workstation**
   - Click "Register Workstation" button
   - Save the API key that is displayed
   - The API key will be automatically saved to your configuration

3. **Save Configuration**
   - Click "Save Configuration" to save all settings

### Starting the Monitor

1. **Go to Status Tab**
   - Click "Start Monitor" button
   - The status will change to "Running" (green)
   - Connection status will show "Connected" when successful

2. **Monitor Activity**
   - Switch to "Logs" tab to see real-time activity
   - The application will automatically:
     - Detect new client folders
     - Search for clients in the system
     - Upload documents if client exists
     - Create pending requests if client not found

### Stopping the Monitor

- Click "Stop Monitor" button in the Status tab
- The monitor will gracefully stop and unmount virtual drives

## Tabs Overview

### Status Tab
- Monitor status (Running/Stopped)
- Connection status
- Start/Stop buttons
- Workstation information
- Refresh button to update info

### Configuration Tab
- **API Configuration** (Server URL, API Key)
  - **"Connect & Load Config"** button - Connects to server and automatically loads workstation configuration
  - Pre-fills all fields from server to prevent mismatches
- **Workstation Registration** - Register a new workstation (if not already registered)
- **Monitored Folders** (add/remove) - Can be configured here or loaded from server
- **Virtual Drive settings** - Optional virtual drive configuration
- **Notification Settings** - Control desktop notifications:
  - Enable/disable notifications
  - Choose notification level (All, Important, Errors Only)
- **Save Configuration** button - Saves all settings locally

### Logs Tab
- Real-time activity log
- Clear Logs button
- Refresh Logs button (loads from log file)

## Workflow

1. **Staff creates client folder** in a monitored directory
2. **Application detects** the new folder
3. **Searches for client** in the web application
4. **If found**: Documents are automatically uploaded
5. **If not found**: Pending request is created in dashboard
6. **Admin approves** request in web application dashboard
7. **Client is created** and documents can be uploaded

## Troubleshooting

### Application Won't Start
- Ensure Python is installed and in PATH
- Check that all dependencies are installed: `pip install -r requirements.txt`
- If running without console window fails, try: `python gui_app.py` (with console)

### System Tray Issues
- If system tray icon doesn't appear, check that pystray, plyer, and Pillow are installed
- Right-click the tray icon to access the menu
- If notifications don't work, check Windows notification settings

### Application Runs But No Tray Icon
- The application may have fallen back to windowed mode
- Check the logs for system tray initialization errors
- Install missing dependencies: `pip install pystray plyer Pillow`

### Too Many Notifications
- Go to Configuration tab → Notification Settings
- Uncheck "Enable desktop notifications" to disable all notifications
- Or change "Notification Level" to "Important" or "Errors Only" to reduce frequency
- "Important" shows start/stop events and new client requests
- "Errors Only" shows only error notifications

### Connection Errors
- Verify server URL is correct
- Check that web application server is running
- Ensure API key is valid (regenerate if needed)

### Virtual Drive Not Mounting
- Run application as Administrator
- Check that drive letter is not in use
- Verify path exists

### Documents Not Uploading
- Check Logs tab for error messages
- Verify client exists in system
- Check file size limits (10MB per file)
- Ensure file types are supported

## Configuration File

Configuration is automatically saved to `config.json` in the application directory. You can also edit this file manually if needed.

## Logs

All activities are logged to:
- **GUI Logs Tab** - Real-time display
- **monitor.log** - Persistent log file

## Security

- API keys are stored in `config.json` - keep this file secure
- The application communicates with the server over HTTP/HTTPS
- API keys can be regenerated from the Workstations page in the web application

## System Requirements

- Windows 7 or higher (system tray features require Windows)
- Python 3.8 or higher (must be installed and in PATH)
- Internet connection (for server communication and initial setup)
- Administrator privileges (for virtual drive mounting)

**Note**: System tray and notification features are Windows-only. On other platforms, the application will run in windowed mode without system tray support.

