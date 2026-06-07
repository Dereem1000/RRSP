#!/usr/bin/env python3
"""
Simple installer for Law Firm Workstation Monitor
Installs exe to Program Files and sets up shortcuts/startup
"""

import os
import sys
import shutil
import subprocess
from pathlib import Path

def main():
    print("Law Firm Workstation Monitor Installer")
    print("=" * 40)

    # Get current directory (installer location)
    installer_dir = Path(__file__).parent
    exe_source = installer_dir / "LawFirm-WorkstationMonitor.exe"

    # Check if exe exists
    if not exe_source.exists():
        print("ERROR: LawFirm-WorkstationMonitor.exe not found in current directory")
        print("Please make sure the exe file is in the same directory as this installer.")
        input("Press Enter to exit installer...")
        return False

    try:
        # Installation paths
        program_files = Path(os.environ.get("ProgramFiles", "C:\\Program Files")) / "Law Firm Workstation Monitor"
        exe_dest = program_files / "LawFirm-WorkstationMonitor.exe"

        # Create program files directory
        print(f"Installing to: {program_files}")
        program_files.mkdir(parents=True, exist_ok=True)

        # Copy exe
        print("Copying executable...")
        shutil.copy2(exe_source, exe_dest)

        # Create Start Menu shortcut
        print("Creating Start Menu shortcut...")
        start_menu_dir = Path(os.environ.get("APPDATA", "")) / "Microsoft" / "Windows" / "Start Menu" / "Programs"
        start_menu_dir.mkdir(parents=True, exist_ok=True)

        # Use Windows shortcut creation (simpler method)
        try:
            # Create a .url file as shortcut (works better than .lnk)
            shortcut_content = '''[InternetShortcut]
URL=file:///{}
IconFile={}
IconIndex=0
'''.format(exe_dest, exe_dest)

            shortcut_path = start_menu_dir / "Law Firm Workstation Monitor.url"
            with open(shortcut_path, 'w') as f:
                f.write(shortcut_content)
            print("Start Menu shortcut created")
        except Exception as e:
            print(f"Warning: Could not create Start Menu shortcut: {e}")

        # Ask about startup
        print()
        startup_choice = input("Add to Windows startup? (y/n): ").lower().strip()

        if startup_choice in ['y', 'yes']:
            try:
                # Add to startup using registry
                import winreg
                key = winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                                   r"Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                                   0, winreg.KEY_SET_VALUE)

                winreg.SetValueEx(key, "LawFirm-WorkstationMonitor",
                                0, winreg.REG_SZ, str(exe_dest))

                winreg.CloseKey(key)
                print("Added to Windows startup")

            except Exception as e:
                print(f"Warning: Could not add to startup: {e}")
                print("You can manually add it to startup later")
        else:
            print("Skipping startup configuration")

        # Ask about desktop shortcut
        desktop_choice = input("Create desktop shortcut? (y/n): ").lower().strip()

        if desktop_choice in ['y', 'yes']:
            try:
                desktop_dir = Path(os.environ.get("USERPROFILE", "")) / "Desktop"
                desktop_dir.mkdir(parents=True, exist_ok=True)

                desktop_shortcut = desktop_dir / "Law Firm Workstation Monitor.url"
                with open(desktop_shortcut, 'w') as f:
                    f.write('''[InternetShortcut]
URL=file:///{}
IconFile={}
IconIndex=0
'''.format(exe_dest, exe_dest))

                print("Desktop shortcut created")

            except Exception as e:
                print(f"Warning: Could not create desktop shortcut: {e}")

        # Create simple uninstaller
        print("Creating uninstaller...")
        uninstaller_path = program_files / "uninstall.bat"

        uninstaller_content = '''@echo off
echo Uninstalling Law Firm Workstation Monitor...
echo.

REM Remove from startup
reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "LawFirm-WorkstationMonitor" /f 2>nul

REM Remove shortcuts
del "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Law Firm Workstation Monitor.url" 2>nul
del "%USERPROFILE%\\Desktop\\Law Firm Workstation Monitor.url" 2>nul

REM Remove program files
rmdir /s /q "{}"

echo.
echo Uninstallation complete!
echo.
pause
'''.format(program_files)

        with open(uninstaller_path, 'w') as f:
            f.write(uninstaller_content)

        print("✅ Uninstaller created")

        print()
        print("=" * 40)
        print("INSTALLATION COMPLETE!")
        print("=" * 40)
        print()
        print("The Law Firm Workstation Monitor has been installed!")
        print()
        print("Installation location:")
        print(f"  {program_files}")
        print()
        print("What's been set up:")
        if startup_choice in ['y', 'yes']:
            print("• ✅ Runs at Windows startup")
        print("• ✅ Start Menu shortcut")
        if desktop_choice in ['y', 'yes']:
            print("• ✅ Desktop shortcut")
        print("• ✅ Uninstaller available")
        print()
        print("To run the monitor:")
        print("• Use the Start Menu or Desktop shortcut")
        print("• Or run the exe directly from the installation folder")
        print()
        print("The monitor will appear in your system tray when running.")

        input("Press Enter to exit installer...")

        return True

    except Exception as e:
        print(f"Installation failed: {e}")
        input("Press Enter to exit...")
        return False

if __name__ == "__main__":
    # Check if running as admin (recommended)
    try:
        import ctypes
        if not ctypes.windll.shell32.IsUserAnAdmin():
            print("Warning: Not running as administrator.")
            print("Installation to Program Files may fail.")
            print("Consider running as administrator.")
            print()
    except:
        pass

    success = main()
    sys.exit(0 if success else 1)

