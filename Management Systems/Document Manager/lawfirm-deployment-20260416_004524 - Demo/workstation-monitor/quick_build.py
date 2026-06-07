#!/usr/bin/env python3
"""
Quick build script for workstation monitor exe
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

def build_exe():
    """Build the workstation monitor executable"""

    workdir = Path(__file__).parent

    # Clean previous builds
    dist_dir = workdir / "dist"
    build_dir = workdir / "build"

    if dist_dir.exists():
        shutil.rmtree(dist_dir)
    if build_dir.exists():
        shutil.rmtree(build_dir)

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

    # PyInstaller command
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",
        "--windowed",
        "--name", "LawFirm-WorkstationMonitor",
        "--clean",
        f"--add-data={workdir}/config.example.json;.",
        "--hidden-import", "pystray._win32",
        "--hidden-import", "plyer.platforms.win.notification",
        "--hidden-import", "PIL.Image",
        "--hidden-import", "PIL.ImageDraw",
        "gui_app.py"
    ]

    print("Running PyInstaller...")
    result = subprocess.run(cmd, cwd=workdir, capture_output=True, text=True)

    if result.returncode != 0:
        print("PyInstaller failed")
        print("STDOUT:", result.stdout)
        print("STDERR:", result.stderr)
        return False

    exe_path = dist_dir / "LawFirm-WorkstationMonitor.exe"
    if exe_path.exists():
        print(f"Executable created: {exe_path}")
        print(f"File size: {exe_path.stat().st_size / (1024*1024):.1f} MB")

        # Copy to server downloads
        server_dir = workdir.parent / "server" / "public" / "downloads"
        server_dir.mkdir(parents=True, exist_ok=True)
        server_exe = server_dir / "LawFirm-WorkstationMonitor.exe"
        shutil.copy2(exe_path, server_exe)
        print(f"Copied to server: {server_exe}")

        return exe_path

    print("Executable was not created")
    return False

if __name__ == "__main__":
    success = build_exe()
    if success:
        print("Build successful!")
    else:
        print("Build failed")
        sys.exit(1)

