#!/usr/bin/env python3
"""
Build script to create workstation monitor executable
Creates a fresh exe with no saved configuration
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

def build_exe():
    """Build the workstation monitor executable"""

    print("Building Workstation Monitor Executable...")
    print("=" * 50)

    # Get the current directory
    workdir = Path(__file__).parent
    dist_dir = workdir / "dist"
    build_dir = workdir / "build"

    # Clean previous builds
    print("Cleaning previous builds...")
    if dist_dir.exists():
        shutil.rmtree(dist_dir)
    if build_dir.exists():
        shutil.rmtree(build_dir)

    # Create fresh config.example.json (no actual config)
    config_example = workdir / "config.example.json"
    if config_example.exists():
        os.remove(config_example)

    # Create a fresh config.example.json with default values
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

    # Build the executable using PyInstaller
    print("Running PyInstaller...")

    # PyInstaller command for Windows exe
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",  # Single executable file
        "--windowed",  # No console window (for GUI app)
        "--name", "LawFirm-WorkstationMonitor",
        "--clean",  # Clean cache and temporary files
        "--icon", "NONE",  # No icon for now
        f"--add-data={workdir}/config.example.json;.",  # Include default config
        # Exclude conflicting Qt libraries (app uses tkinter, not Qt)
        "--exclude-module", "PyQt5",
        "--exclude-module", "PyQt6",
        "--hidden-import", "pystray._win32",
        "--hidden-import", "plyer.platforms.win.notification",
        "--hidden-import", "PIL.Image",
        "--hidden-import", "PIL.ImageDraw",
        "gui_app.py"
    ]

    try:
        result = subprocess.run(cmd, cwd=workdir, check=True, capture_output=True, text=True)
        print("PyInstaller completed successfully")

        # Check if exe was created
        exe_path = dist_dir / "LawFirm-WorkstationMonitor.exe"
        if exe_path.exists():
            print(f"✅ Executable created: {exe_path}")
            print(f"File size: {exe_path.stat().st_size / (1024*1024):.1f} MB")

            # Copy exe to a known location for the web server
            exe_dest = workdir.parent / "server" / "public" / "downloads" / "workstation-monitor.exe"

            # Ensure destination directory exists
            exe_dest.parent.mkdir(parents=True, exist_ok=True)

            # Copy the exe
            shutil.copy2(exe_path, exe_dest)
            print(f"✅ Executable copied to: {exe_dest}")

            return True
        else:
            print("❌ Executable was not created")
            return False

    except subprocess.CalledProcessError as e:
        print(f"❌ PyInstaller failed: {e}")
        print("STDOUT:", e.stdout)
        print("STDERR:", e.stderr)
        return False

    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False

if __name__ == "__main__":
    success = build_exe()
    if success:
        print("\n🎉 Workstation Monitor executable built successfully!")
        print("The exe file is ready for download from the web interface.")
    else:
        print("\n❌ Failed to build executable")
        sys.exit(1)

