#!/usr/bin/env python3
"""
Utility script to force unmount virtual drive
Can be run standalone to unmount the drive manually
"""

import sys
import platform
from pathlib import Path

# Add current directory to path to import modules
sys.path.insert(0, str(Path(__file__).parent))

from main import VirtualDriveManager, Config

def main():
    if platform.system() != 'Windows':
        print("Error: Virtual drive mounting is only supported on Windows")
        return 1
    
    config = Config()
    
    if not config.virtual_drive_letter:
        print("Error: No virtual drive letter configured")
        print("Please configure a virtual drive letter in config.json")
        return 1
    
    print(f"Force unmounting virtual drive {config.virtual_drive_letter}...")
    
    success = VirtualDriveManager.force_unmount_drive(config.virtual_drive_letter)
    
    if success:
        print(f"✓ Successfully unmounted virtual drive {config.virtual_drive_letter}")
        return 0
    else:
        print(f"✗ Failed to unmount virtual drive {config.virtual_drive_letter}")
        print("You may need to close any open files or folders on the drive first")
        return 1

if __name__ == '__main__':
    sys.exit(main())





