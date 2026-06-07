def check_and_install_tesseract_gui():
    """Check if Tesseract OCR is installed and offer to install it (GUI version)"""
    try:
        import pytesseract
        # Try to get tesseract version to check if it's working
        try:
            version = pytesseract.get_tesseract_version()
            return True
        except Exception:
            pass
    except ImportError:
        pass

    # Tesseract not available, show GUI dialog
    root = tk.Tk()
    root.withdraw()  # Hide the main window

    result = messagebox.askyesno(
        "Tesseract OCR Required",
        "Tesseract OCR is required for processing scanned documents and images.\n\n"
        "Would you like to install Tesseract OCR now?\n\n"
        "(This will attempt automatic installation and may require administrator privileges)",
        icon='question'
    )

    root.destroy()

    if result:
        return install_tesseract_gui()
    else:
        return False

def install_tesseract_gui():
    """Attempt to install Tesseract OCR automatically (GUI version)"""
    try:
        import subprocess
        import platform

        if platform.system() == "Windows":
            try:
                # Try winget first
                result = subprocess.run(
                    ["winget", "install", "--id", "UB-Mannheim.TesseractOCR", "--accept-source-agreements", "--accept-package-agreements"],
                    capture_output=True, text=True, timeout=300
                )
                if result.returncode == 0:
                    messagebox.showinfo("Success", "Tesseract OCR installed successfully!")
                    return True
            except (subprocess.TimeoutExpired, FileNotFoundError):
                pass

            # Try manual download
            try:
                import urllib.request
                import tempfile

                # Show progress dialog
                progress_root = tk.Tk()
                progress_root.title("Installing Tesseract OCR")
                ttk.Label(progress_root, text="Downloading Tesseract OCR...").pack(pady=10)
                progress = ttk.Progressbar(progress_root, mode='indeterminate')
                progress.pack(pady=10, padx=20)
                progress.start()

                tesseract_url = "https://digi.bib.uni-mannheim.de/tesseract/tesseract-ocr-w64-setup-5.3.4.20241106.exe"

                with tempfile.NamedTemporaryFile(suffix='.exe', delete=False) as temp_file:
                    with urllib.request.urlopen(tesseract_url) as response:
                        temp_file.write(response.read())
                    installer_path = temp_file.name

                progress.stop()
                progress_root.destroy()

                # Run installer
                result = subprocess.run([installer_path], capture_output=True)

                # Clean up
                try:
                    import os
                    os.unlink(installer_path)
                except:
                    pass

                if result.returncode == 0:
                    messagebox.showinfo("Success", "Tesseract OCR installer launched!\n\nPlease complete the installation wizard.")
                    return True

            except Exception as e:
                messagebox.showerror("Installation Failed", f"Failed to install Tesseract OCR:\n\n{str(e)}")

        else:
            messagebox.showerror("Unsupported OS", "Automatic Tesseract installation is only supported on Windows.")

    except Exception as e:
        messagebox.showerror("Installation Failed", f"Tesseract installation failed:\n\n{str(e)}")

    return False
