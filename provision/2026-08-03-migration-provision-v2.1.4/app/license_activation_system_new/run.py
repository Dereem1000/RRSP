#!/usr/bin/env python3
"""
Standalone License Activation System - Main Entry Point
"""

import sys
import os

# Add current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from license_activation_gui import main

if __name__ == '__main__':
    print("Starting Standalone License Activation System...")
    print("=" * 50)
    print("Features:")
    print("• Company Registration")
    print("• License Activation")
    print("• Online/Offline Validation")
    print("• GUI Interface")
    print("• Internet-based License Checking")
    print("=" * 50)
    main()
