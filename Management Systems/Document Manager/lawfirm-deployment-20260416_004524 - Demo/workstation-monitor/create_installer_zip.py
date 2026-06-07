#!/usr/bin/env python3
"""
Create installer zip file for workstation monitor
"""

import os
import zipfile
import shutil
from pathlib import Path

def create_installer_zip():
    """Create a zip file with all workstation monitor files"""

    print("Creating Workstation Monitor Installer Zip...")
    print("=" * 50)

    workdir = Path(__file__).parent

    # Files to include in the zip
    files_to_include = [
        'gui_app.py',
        'main.py',
        'requirements.txt',
        'README_GUI.md',
        'README.md',
        'start_workstation.bat',
        'start_gui.bat',
        'start_gui_windowed.bat',
        'install_dependencies.bat',
        'installer.bat',
        # Python modules
        'virtual_drive_sync.py',
        'file_sync.py',
        'conflict_resolver.py',
        'unmount_drive.py',
        # Documentation
        'BIDIRECTIONAL_SYNC_FLOW.md',
        'FILE_SYNC_TEST_RESULTS.md',
        'LOCAL_FILE_CLARIFICATION.md',
        'LOCK_EXPIRATION.md',
        'MONITORED_FOLDER_UPDATE.md',
        'TEST_RESULTS_SUCCESS.md',
        'TIMESTAMP_CONFLICT_IMPLEMENTATION.md',
        'TIMESTAMP_CONFLICT_TEST_RESULTS.md',
        'UPLOAD_VERIFICATION.md'
    ]

    # Create fresh config.example.json
    config_example = workdir / "config.example.json"
    default_config = {
        "api_url": "http://localhost:5002/api",
        "api_key": None,
        "workstation_id": None,
        "monitored_folders": [],
        "virtual_drive_letter": None,
        "virtual_drive_path": None,
        "check_interval": 60,
        "virtual_drive_sync_interval": 60,
        "file_lock_check_interval": 10,
        "conflict_resolution": "server_wins",
        "default_programs": {},
        "enable_notifications": True,
        "notification_level": "important"
    }

    import json
    with open(config_example, 'w', encoding='utf-8') as f:
        json.dump(default_config, f, indent=2, ensure_ascii=False)

    print("Created fresh config.example.json")

    # Create zip file
    zip_path = workdir.parent / "server" / "public" / "downloads" / "workstation-monitor-installer.zip"

    # Ensure directory exists
    zip_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"Creating zip file: {zip_path}")

    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for file_name in files_to_include:
            file_path = workdir / file_name
            if file_path.exists():
                # Add file to zip with relative path
                zipf.write(file_path, f"workstation-monitor/{file_name}")
                print(f"Added: {file_name}")
            else:
                print(f"Warning: {file_name} not found, skipping")

        # Add the config.example.json
        if config_example.exists():
            zipf.write(config_example, "workstation-monitor/config.example.json")
            print("Added: config.example.json")

    print(f"✅ Zip file created: {zip_path}")
    print(f"File size: {zip_path.stat().st_size / (1024*1024):.1f} MB")

    return True

if __name__ == "__main__":
    success = create_installer_zip()
    if success:
        print("\n🎉 Workstation Monitor installer zip created successfully!")
    else:
        print("\n❌ Failed to create installer zip")
        import sys
        sys.exit(1)

