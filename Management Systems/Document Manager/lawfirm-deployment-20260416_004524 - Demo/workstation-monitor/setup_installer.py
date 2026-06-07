#!/usr/bin/env python3
"""
Complete setup script for workstation monitor
Builds exe, creates installer, and sets up download
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

def build_exe():
    """Build the workstation monitor executable"""
    print("Building Workstation Monitor Executable...")

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

    result = subprocess.run(cmd, cwd=workdir, capture_output=True, text=True)
    if result.returncode != 0:
        print("❌ PyInstaller failed")
        print("STDOUT:", result.stdout)
        print("STDERR:", result.stderr)
        return False

    exe_path = dist_dir / "LawFirm-WorkstationMonitor.exe"
    if exe_path.exists():
        print(f"✅ Executable created: {exe_path}")
        print(f"File size: {exe_path.stat().st_size / (1024*1024):.1f} MB")
        return exe_path
    else:
        print("❌ Executable was not created")
        return False

def create_installer_script(exe_path):
    """Create the installer script that installs to Program Files"""
    print("Creating installer script...")

    installer_code = '''#!/usr/bin/env python3
"""
Law Firm Workstation Monitor Installer
Installs to Program Files and sets up startup
"""

import os
import sys
import shutil
import subprocess
from pathlib import Path

def install():
    print("Law Firm Workstation Monitor Setup")
    print("=" * 40)

    # Get installer directory
    installer_dir = Path(__file__).parent
    exe_source = installer_dir / "LawFirm-WorkstationMonitor.exe"

    # Check if exe exists
    if not exe_source.exists():
        print("❌ Error: LawFirm-WorkstationMonitor.exe not found")
        input("Press Enter to exit...")
        return False

    try:
        # Installation paths
        program_files = Path(os.environ.get("ProgramFiles", "C:\\\\Program Files")) / "Law Firm Workstation Monitor"
        exe_dest = program_files / "LawFirm-WorkstationMonitor.exe"

        # Create program files directory
        print(f"Creating installation directory: {{program_files}}")
        program_files.mkdir(parents=True, exist_ok=True)

        # Copy exe
        print("Installing executable...")
        shutil.copy2(exe_source, exe_dest)

        # Create start menu shortcut
        print("Creating Start Menu shortcut...")
        start_menu_dir = Path(os.environ.get("APPDATA", "")) / "Microsoft" / "Windows" / "Start Menu" / "Programs"
        shortcut_path = start_menu_dir / "Law Firm Workstation Monitor.lnk"

        # PowerShell command to create shortcut
        ps_cmd = '''
        $WshShell = New-Object -comObject WScript.Shell
        $Shortcut = $WshShell.CreateShortcut("''' + str(shortcut_path) + '''")
        $Shortcut.TargetPath = "''' + str(exe_dest) + '''"
        $Shortcut.WorkingDirectory = "''' + str(program_files) + '''"
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
                print("✅ Added to Windows startup")

            except Exception as e:
                print(f"⚠️ Could not add to startup: {{e}}")
                print("You can manually add it to startup later")
        else:
            print("ℹ️ Skipping startup configuration")

        # Create desktop shortcut
        desktop_choice = input("Create desktop shortcut? (y/n): ").lower().strip()

        if desktop_choice in ['y', 'yes']:
            desktop_path = Path(os.environ.get("USERPROFILE", "")) / "Desktop" / "Law Firm Workstation Monitor.lnk"

            ps_cmd = '''
            $WshShell = New-Object -comObject WScript.Shell
            $Shortcut = $WshShell.CreateShortcut("''' + str(desktop_path) + '''")
            $Shortcut.TargetPath = "''' + str(exe_dest) + '''"
            $Shortcut.WorkingDirectory = "''' + str(program_files) + '''"
            $Shortcut.Description = "Law Firm Workstation Monitor"
            $Shortcut.Save()
            '''

            try:
                subprocess.run(["powershell", "-Command", ps_cmd], check=True, capture_output=True)
                print("✅ Desktop shortcut created")
            except Exception as e:
                print(f"⚠️ Could not create desktop shortcut: {{e}}")

        # Create uninstaller
        print("Creating uninstaller...")
        uninstaller_path = program_files / "uninstall.exe"

        uninstaller_code = f'''import os
import sys
import shutil
import subprocess
from pathlib import Path

def uninstall():
    try:
        program_files = Path(r"{program_files}")

        # Remove from startup
        try:
            import winreg
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                               r"Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                               0, winreg.KEY_SET_VALUE)
            winreg.DeleteValue(key, "LawFirm-WorkstationMonitor")
            winreg.CloseKey(key)
            print("Removed from startup")
        except:
            pass

        # Remove shortcuts
        try:
            # Start menu
            start_menu = Path(os.environ.get("APPDATA", "")) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Law Firm Workstation Monitor.lnk"
            if start_menu.exists():
                start_menu.unlink()
                print("Removed Start Menu shortcut")

            # Desktop
            desktop = Path(os.environ.get("USERPROFILE", "")) / "Desktop" / "Law Firm Workstation Monitor.lnk"
            if desktop.exists():
                desktop.unlink()
                print("Removed desktop shortcut")

        except Exception as e:
            print(f"Error removing shortcuts: {{e}}")

        # Remove files
        if program_files.exists():
            shutil.rmtree(program_files)
            print(f"Removed installation directory: {{program_files}}")'''

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
        print("=" * 40)
        print("INSTALLATION COMPLETE!")
        print("=" * 40)
        print()
        print("The Law Firm Workstation Monitor has been installed to:")
        print(f"  {{program_files}}")
        print()
        print("What's been set up:")
        if startup_choice in ['y', 'yes']:
            print("• ✅ Runs at Windows startup")
        print("• ✅ Start Menu shortcut created")
        if desktop_choice in ['y', 'yes']:
            print("• ✅ Desktop shortcut created")
        print("• ✅ Uninstaller available")
        print()
        print("You can now:")
        print("• Run from Start Menu or Desktop")
        print("• The app will appear in system tray when running")
        print("• Use the uninstaller to remove everything")
        print()

        if startup_choice not in ['y', 'yes']:
            print("💡 Tip: You can add it to startup later by running the exe with --startup")
            print("   or manually add it to Windows startup folder.")

        input("Press Enter to exit installer...")

        return True

    except Exception as e:
        print(f"❌ Installation failed: {{e}}")
        input("Press Enter to exit...")
        return False

if __name__ == "__main__":
    # Check if running as admin (recommended)
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

    installer_path = exe_path.parent / "setup.py"
    with open(installer_path, 'w', encoding='utf-8') as f:
        f.write(installer_code)

    print(f"✅ Installer script created: {installer_path}")

    # Create batch file to run installer
    batch_content = '''@echo off
echo ========================================
echo Law Firm Workstation Monitor Setup
echo ========================================
echo.
echo This will install the Law Firm Workstation Monitor
echo to your system and set it up for use.
echo.
echo Administrator privileges are recommended.
echo.
pause

cd /d "%~dp0"

echo Running setup...
python setup.py

pause
'''

    batch_path = exe_path.parent / "Setup-LawFirm-WorkstationMonitor.bat"
    with open(batch_path, 'w', encoding='utf-8') as f:
        f.write(batch_content)

    print(f"✅ Batch installer created: {batch_path}")

    return installer_path, batch_path

def setup_download_files(exe_path):
    """Copy files to server download directory"""
    print("Setting up download files...")

    server_dir = Path(__file__).parent.parent / "server" / "public" / "downloads"
    server_dir.mkdir(parents=True, exist_ok=True)

    # Copy exe
    server_exe = server_dir / "LawFirm-WorkstationMonitor.exe"
    shutil.copy2(exe_path, server_exe)
    print(f"✅ Exe copied to server: {server_exe}")

    # Copy installer script
    installer_path = exe_path.parent / "setup.py"
    server_installer = server_dir / "setup.py"
    if installer_path.exists():
        shutil.copy2(installer_path, server_installer)
        print(f"✅ Installer script copied to server: {server_installer}")

    # Copy batch file
    batch_path = exe_path.parent / "Setup-LawFirm-WorkstationMonitor.bat"
    server_batch = server_dir / "Setup-LawFirm-WorkstationMonitor.bat"
    if batch_path.exists():
        shutil.copy2(batch_path, server_batch)
        print(f"✅ Batch installer copied to server: {server_batch}")

    # Copy config
    config_path = Path(__file__).parent / "config.example.json"
    server_config = server_dir / "config.example.json"
    if config_path.exists():
        shutil.copy2(config_path, server_config)
        print(f"✅ Config copied to server: {server_config}")

    return server_exe

def main():
    print("Setting up complete workstation monitor installation...")
    print("=" * 60)

    # Step 1: Build exe
    exe_path = build_exe()
    if not exe_path:
        print("❌ Failed to build exe")
        return False

    # Step 2: Create installer
    installer_path, batch_path = create_installer_script(exe_path)

    # Step 3: Setup download files
    server_exe = setup_download_files(exe_path)

    print()
    print("🎉 Complete setup finished!")
    print()
    print("Files ready for download:")
    print(f"• LawFirm-WorkstationMonitor.exe ({server_exe.stat().st_size / (1024*1024):.1f} MB)")
    print("• Setup-LawFirm-WorkstationMonitor.bat")
    print("• setup.py")
    print("• config.example.json")
    print()
    print("Users will download these files and run the .bat file.")
    print("The installer will:")
    print("• Install to Program Files")
    print("• Create Start Menu shortcut")
    print("• Optionally add to Windows startup")
    print("• Optionally create desktop shortcut")
    print("• Include uninstaller")

    return True

if __name__ == "__main__":
    success = main()
    if not success:
        print("\n❌ Setup failed")
        sys.exit(1)

