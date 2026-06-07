#!/usr/bin/env python3
"""
Test script for File Organizer functionality
"""

import os
import sys
import tempfile
import json
from pathlib import Path

# Add current directory to path so we can import our modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from file_organizer import FileOrganizer, FileOrganizerAPI

class MockConfig:
    """Mock configuration for testing"""
    def __init__(self):
        self.api_url = "http://localhost:5002/api"
        self.api_key = "test-key"
        self.file_organizer_enabled = True
        self.file_organizer_scan_interval = 300
        self.file_organizer_confidence_threshold = 0.8
        self.file_organizer_max_text_length = 50000
        self.monitored_folders = []

class MockAPI:
    """Mock API for testing"""
    def __init__(self, config):
        self.config = config

    def search_client(self, client_name: str):
        """Mock client search - returns test clients"""
        test_clients = {
            "john smith": {
                "clients": [{"id": 1, "firstName": "John", "lastName": "Smith", "fullName": "John Smith"}],
                "found": True
            },
            "jane doe": {
                "clients": [{"id": 2, "firstName": "Jane", "lastName": "Doe", "fullName": "Jane Doe"}],
                "found": True
            },
            "bob johnson": {
                "clients": [{"id": 3, "firstName": "Bob", "lastName": "Johnson", "fullName": "Bob Johnson"}],
                "found": True
            }
        }

        # Case-insensitive search
        client_name_lower = client_name.lower().strip()
        for test_name, result in test_clients.items():
            if test_name in client_name_lower or client_name_lower in test_name:
                return result

        return {"clients": [], "found": False}

def test_client_name_extraction():
    """Test client name extraction from text"""
    print("🧪 Testing client name extraction...")

    config = MockConfig()
    api = MockAPI(config)
    organizer = FileOrganizer(api, config)

    # Test cases
    test_cases = [
        {
            "text": "This document belongs to John Smith. He is our client and needs legal assistance.",
            "expected_client": "John Smith",
            "expected_confidence": 0.9
        },
        {
            "text": "Client: Jane Doe\nCase: Divorce proceedings\nDate: 2024",
            "expected_client": "Jane Doe",
            "expected_confidence": 0.85
        },
        {
            "text": "Bob Johnson, Plaintiff\nvs\nXYZ Corporation, Defendant",
            "expected_client": "Bob Johnson",
            "expected_confidence": 0.9
        },
        {
            "text": "This is a random document with no client names mentioned.",
            "expected_client": None,
            "expected_confidence": 0
        }
    ]

    for i, test_case in enumerate(test_cases, 1):
        print(f"\nTest case {i}:")
        print(f"Text: {test_case['text'][:60]}...")

        matches = organizer.find_client_names_in_text(test_case['text'])

        if test_case['expected_client']:
            if matches and matches[0].client_name == test_case['expected_client']:
                print(f"✅ PASS: Found expected client '{matches[0].client_name}' with confidence {matches[0].confidence:.2f}")
            else:
                print(f"❌ FAIL: Expected '{test_case['expected_client']}', got '{matches[0].client_name if matches else 'None'}'")
        else:
            if not matches:
                print("✅ PASS: No clients found as expected")
            else:
                print(f"❌ FAIL: Unexpected client found: '{matches[0].client_name}'")

def test_loose_file_detection():
    """Test loose file detection logic"""
    print("\n🧪 Testing loose file detection...")

    config = MockConfig()
    api = MockAPI(config)
    organizer = FileOrganizer(api, config)

    # Create temporary directory structure
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)

        # Create monitored folder
        monitored = temp_path / "monitored"
        monitored.mkdir()

        # Create client folder (should not be considered loose)
        client_folder = monitored / "John Smith"
        client_folder.mkdir()

        # Create loose file in monitored folder
        loose_file = monitored / "document.pdf"
        loose_file.write_text("test")

        # Create file in client folder (should not be considered loose)
        client_file = client_folder / "contract.pdf"
        client_file.write_text("test")

        # Create file in subdirectory of monitored (should be considered loose)
        sub_dir = monitored / "temp"
        sub_dir.mkdir()
        sub_loose_file = sub_dir / "scan.pdf"
        sub_loose_file.write_text("test")

        # Test loose file detection
        test_cases = [
            (str(loose_file), True, "File in root monitored folder"),
            (str(client_file), False, "File in client folder"),
            (str(sub_loose_file), True, "File in subdirectory of monitored folder"),
        ]

        for file_path, expected_loose, description in test_cases:
            config.monitored_folders = [str(monitored)]
            is_loose = organizer.is_loose_file(file_path)

            if is_loose == expected_loose:
                print(f"✅ PASS: {description} - {'loose' if is_loose else 'not loose'}")
            else:
                print(f"❌ FAIL: {description} - expected {'loose' if expected_loose else 'not loose'}, got {'loose' if is_loose else 'not loose'}")

def test_text_extraction():
    """Test text extraction from different file types"""
    print("\n🧪 Testing text extraction...")

    config = MockConfig()
    api = MockAPI(config)
    organizer = FileOrganizer(api, config)

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)

        # Test TXT file
        txt_file = temp_path / "test.txt"
        txt_content = "This is a test document for John Smith."
        txt_file.write_text(txt_content)

        extracted = organizer.extract_text_from_file(str(txt_file))
        if txt_content in extracted:
            print("✅ PASS: TXT file extraction")
        else:
            print("❌ FAIL: TXT file extraction")

        # Test PDF file (if pdfminer available)
        pdf_file = temp_path / "test.pdf"
        # Note: We can't easily create a test PDF without additional dependencies
        # but we can test the method exists and handles missing libraries gracefully
        extracted_pdf = organizer.extract_text_from_file(str(pdf_file))
        if extracted_pdf == "":  # Should return empty string for non-existent file
            print("✅ PASS: PDF extraction handles missing file")
        else:
            print("❌ FAIL: PDF extraction should return empty for missing file")

def main():
    """Run all tests"""
    print("🚀 File Organizer Test Suite")
    print("=" * 50)

    try:
        test_client_name_extraction()
        test_loose_file_detection()
        test_text_extraction()

        print("\n" + "=" * 50)
        print("✅ All tests completed!")
        print("\nNote: For full functionality testing, ensure:")
        print("- Python libraries installed: pdfminer.six, python-docx, pytesseract, Pillow")
        print("- Tesseract OCR installed for image processing")
        print("- Valid API connection for client data")

    except Exception as e:
        print(f"\n❌ Test suite failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
