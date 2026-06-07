#!/usr/bin/env python3
"""
Create Windows installer for workstation monitor
"""

import os
import shutil
import subprocess
import sys
import winreg
from pathlib import Path

def create_installer():
    """Create a proper Windows installer"""

    print("Creating Windows Installer for Workstation Monitor...")
    print("=" * 60)

    workdir = Path(__file__).parent

    # First build the exe
    print("Step 1: Building executable...")
    exe_path = workdir / "dist" / "LawFirm-WorkstationMonitor.exe"

    if not exe_path.exists():
        print("Building exe first...")
        build_cmd = [sys.executable, "build_exe.py"]
        result = subprocess.run(build_cmd, cwd=workdir, capture_output=True, text=True)
        if result.returncode != 0:
            print("❌ Failed to build exe")
            print("STDOUT:", result.stdout)
            print("STDERR:", result.stderr)
            return False

    if not exe_path.exists():
        print("❌ Exe not found after build attempt")
        return False

    print(f"✅ Exe ready: {exe_path}")

    # Create installer script
    print("Step 2: Creating installer script...")

    installer_script = f'''#!/usr/bin/env python3
"""
Law Firm Workstation Monitor Installer
Installs the application to Program Files and sets up startup
"""

import os
import sys
import shutil
import winreg
from pathlib import Path

def install():
    """Install the workstation monitor"""

    print("Installing Law Firm Workstation Monitor...")
    print("=" * 50)

    # Get current directory (where installer is run from)
    installer_dir = Path(__file__).parent

    # Installation paths
    program_files = Path(os.environ.get("ProgramFiles", "C:\\\\Program Files")) / "Law Firm Workstation Monitor"
    exe_source = installer_dir / "LawFirm-WorkstationMonitor.exe"
    config_source = installer_dir / "config.example.json"

    # Check if exe exists
    if not exe_source.exists():
        print("❌ Error: LawFirm-WorkstationMonitor.exe not found in installer directory")
        input("Press Enter to exit...")
        return False

    try:
        # Create program files directory
        print(f"Creating installation directory: {{program_files}}")
        program_files.mkdir(parents=True, exist_ok=True)

        # Copy exe
        exe_dest = program_files / "LawFirm-WorkstationMonitor.exe"
        print(f"Installing executable...")
        shutil.copy2(exe_source, exe_dest)

        # Copy config if it exists
        if config_source.exists():
            config_dest = program_files / "config.example.json"
            shutil.copy2(config_source, config_dest)
            print("Installed default configuration")

        # Create start menu shortcut (using PowerShell)
        print("Creating Start Menu shortcut...")
        start_menu_path = Path(os.environ.get("APPDATA", "")) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Law Firm Workstation Monitor.lnk"

        # PowerShell command to create shortcut
        ps_cmd = f'''
        $WshShell = New-Object -comObject WScript.Shell
        $Shortcut = $WshShell.CreateShortcut("{start_menu_path}")
        $Shortcut.TargetPath = "{exe_dest}"
        $Shortcut.WorkingDirectory = "{program_files}"
        $Shortcut.Description = "Law Firm Workstation Monitor"
        $Shortcut.Save()
        '''

        try:
            subprocess.run(["powershell", "-Command", ps_cmd], check=True, capture_output=True)
            print("✅ Start Menu shortcut created")
        except Exception as e:
            print(f"⚠️ Could not create Start Menu shortcut: {{e}}")

        # Ask about startup
        print()
        startup_choice = input("Do you want to run the monitor at system startup? (y/n): ").lower().strip()

        if startup_choice in ['y', 'yes']:
            try:
                # Add to startup using registry
                key = winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                                   r"Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                                   0, winreg.KEY_SET_VALUE)

                winreg.SetValueEx(key, "LawFirm-WorkstationMonitor",
                                0, winreg.REG_SZ, str(exe_dest))

                winreg.CloseKey(key)
                print("✅ Added to system startup")

            except Exception as e:
                print(f"⚠️ Could not add to startup: {{e}}")
                print("You can manually add it to startup later")
        else:
            print("ℹ️ Skipping startup configuration")

        # Create uninstaller
        print("Creating uninstaller...")
        uninstaller_path = program_files / "uninstall.exe"

        uninstaller_code = f'''import os
import sys
import shutil
import winreg
from pathlib import Path

def uninstall():
    try:
        program_files = Path(r"{program_files}")

        # Remove from startup
        try:
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                               r"Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                               0, winreg.KEY_SET_VALUE)
            winreg.DeleteValue(key, "LawFirm-WorkstationMonitor")
            winreg.CloseKey(key)
            print("Removed from startup")
        except:
            pass

        # Remove files
        if program_files.exists():
            shutil.rmtree(program_files)
            print(f"Removed installation directory: {{program_files}}")

        # Remove start menu shortcut
        start_menu = Path(os.environ.get("APPDATA", "")) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Law Firm Workstation Monitor.lnk"
        if start_menu.exists():
            start_menu.unlink()
            print("Removed Start Menu shortcut")

        print("Uninstallation complete!")
        input("Press Enter to exit...")

    except Exception as e:
        print(f"Error during uninstallation: {{e}}")
        input("Press Enter to exit...")

if __name__ == "__main__":
    uninstall()
'''

        with open(uninstaller_path, 'w') as f:
            f.write(uninstaller_code)

        print("✅ Uninstaller created")

        print()
        print("=" * 50)
        print("INSTALLATION COMPLETE!")
        print("=" * 50)
        print()
        print("The Law Firm Workstation Monitor has been installed to:")
        print(f"  {{program_files}}")
        print()
        print("You can now:")
        print("• Run the application from Start Menu")
        print("• Find it running in system tray when started")
        print("• Use the uninstaller to remove it")
        print()

        if startup_choice in ['y', 'yes']:
            print("The monitor will start automatically with Windows.")
        else:
            print("To start manually, use the Start Menu shortcut.")

        print()
        input("Press Enter to exit installer...")

        return True

    except Exception as e:
        print(f"❌ Installation failed: {{e}}")
        input("Press Enter to exit...")
        return False

if __name__ == "__main__":
    # Check if running as admin (recommended for installation)
    try:
        import ctypes
        if not ctypes.windll.shell32.IsUserAnAdmin():
            print("⚠️ Warning: Not running as administrator.")
            print("Installation may fail. Consider running as administrator.")
            print()
    except:
        pass

    success = install()
    sys.exit(0 if success else 1)
'''

    installer_path = workdir / "installer.py"
    with open(installer_path, 'w', encoding='utf-8') as f:
        f.write(installer_script)

    print(f"✅ Installer script created: {installer_path}")

    # Create batch file to run the installer
    batch_content = '''@echo off
echo ========================================
echo Law Firm Workstation Monitor Installer
echo ========================================
echo.
echo This installer will install the Law Firm Workstation Monitor
echo to your system and optionally add it to startup.
echo.
echo Administrator privileges are recommended.
echo.
pause

cd /d "%~dp0"

echo Running installer...
python installer.py

pause
'''

    batch_path = workdir / "Install-LawFirm-WorkstationMonitor.bat"
    with open(batch_path, 'w', encoding='utf-8') as f:
        f.write(batch_content)

    print(f"✅ Batch installer created: {batch_path}")

    # Copy files to server
    print("Step 3: Preparing files for download...")

    server_dir = workdir.parent / "server" / "public" / "downloads"
    server_dir.mkdir(parents=True, exist_ok=True)

    # Copy exe
    server_exe = server_dir / "LawFirm-WorkstationMonitor.exe"
    shutil.copy2(exe_path, server_exe)
    print(f"✅ Exe copied to server: {server_exe}")

    # Copy installer batch
    server_installer = server_dir / "Install-LawFirm-WorkstationMonitor.bat"
    shutil.copy2(batch_path, server_installer)
    print(f"✅ Installer copied to server: {server_installer}")

    # Copy config
    config_path = workdir / "config.example.json"
    if config_path.exists():
        server_config = server_dir / "config.example.json"
        shutil.copy2(config_path, server_config)
        print(f"✅ Config copied to server: {server_config}")

    print()
    print("🎉 Windows installer package created successfully!")
    print()
    print("Files ready for download:")
    print(f"• LawFirm-WorkstationMonitor.exe ({server_exe.stat().st_size / (1024*1024):.1f} MB)")
    print("• Install-LawFirm-WorkstationMonitor.bat")
    print("• config.example.json")
    print()
    print("Users will download these files and run the .bat file to install.")

    return True

if __name__ == "__main__":
    success = create_installer()
    if not success:
        print("\n❌ Failed to create installer package")
        sys.exit(1)

