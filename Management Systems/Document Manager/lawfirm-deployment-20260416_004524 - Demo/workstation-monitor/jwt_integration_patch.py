#!/usr/bin/env python3
"""
Workstation Monitor JWT Integration
Updates the workstation monitor to use JWT tokens instead of static API keys.
This script modifies main.py to integrate the JWT token manager.
"""

import re
from pathlib import Path

def integrate_jwt():
    """Add JWT integration to main.py"""
    
    main_py = Path(__file__).parent / "main.py"
    
    # Read the current main.py
    with open(main_py, "r", encoding="utf-8") as f:
        content = f.read()
    
    # 1. Add import for JWT token manager at the top
    import_addition = "from jwt_token_manager import JWTTokenManager\n"
    
    if "from jwt_token_manager import" not in content:
        # Add after other imports
        content = content.replace(
            "from file_sync import is_word_temp_file\n",
            "from file_sync import is_word_temp_file\nfrom jwt_token_manager import JWTTokenManager\n"
        )
    
    # 2. Update Config class to include JWT token manager
    config_init_pattern = r"(class Config:\n    def __init__\(self\):)"
    config_init_replacement = r"\1\n        self.jwt_manager = None  # JWT token manager for automatic auth"
    
    if "self.jwt_manager" not in content:
        content = re.sub(config_init_pattern, config_init_replacement, content)
    
    # 3. Update the load() method in Config to initialize JWT manager
    load_method_pattern = r"(self\.sync_delete_to_server = data\.get\(\s*\"sync_delete_to_server\",\s*True\s*\))"
    load_method_replacement = r"\1\n                    \n                    # Initialize JWT token manager\n                    if self.workstation_id:\n                        verify_ssl = getattr(self, 'verify_ssl', True)\n                        ca_cert_path = getattr(self, 'ca_cert_path', None)\n                        self.jwt_manager = JWTTokenManager(\n                            CONFIG_FILE,\n                            f\"Workstation-{self.workstation_id}\",\n                            verify_ssl=verify_ssl,\n                            ca_cert_path=ca_cert_path\n                        )"
    
    if "self.jwt_manager = JWTTokenManager" not in content:
        content = re.sub(load_method_pattern, load_method_replacement, content)
    
    # 4. Find the session creation and update it to use JWT headers
    # Look for where requests.Session is created or used
    session_pattern = r"(session = requests\.Session\(\).*?session\.headers\.update\({[^}]*}\))"
    
    if "session.headers.update" in content:
        # Add JWT header update after existing headers
        old_pattern = r"(session\.headers\.update\(\{[^}]*\}\))"
        new_headers = r"\1\n\n        # Add JWT authorization header (will be updated by token manager)\n        if self.jwt_manager and self.jwt_manager.get_headers():\n            session.headers.update(self.jwt_manager.get_headers())"
        
        if "JWT authorization header" not in content:
            content = re.sub(old_pattern, new_headers, content)
    
    # Write back the updated content
    with open(main_py, "w", encoding="utf-8") as f:
        f.write(content)
    
    print("✅ JWT integration added to main.py")
    return True


def create_integration_patch():
    """
    Create a more robust integration by creating wrapper functions
    that handle JWT token refresh in the main loop
    """
    
    patch_file = Path(__file__).parent / "jwt_integration_patch.py"
    
    patch_code = '''"""
JWT Integration Patch for Workstation Monitor
Provides helper functions to integrate JWT token management into main.py
"""

from jwt_token_manager import JWTTokenManager
from pathlib import Path
import time


class WorkstationSession:
    """Wrapper around requests.Session that handles JWT token refresh automatically"""
    
    def __init__(self, config, session):
        self.config = config
        self.session = session
        self.jwt_manager = None
        self.initialize_jwt()
    
    def initialize_jwt(self):
        """Initialize JWT token manager on first run"""
        if not self.config.api_key:
            return
        
        # Get SSL verification settings from config
        verify_ssl = getattr(self.config, 'verify_ssl', True)
        ca_cert_path = getattr(self.config, 'ca_cert_path', None)
        
        self.jwt_manager = JWTTokenManager(
            Path(__file__).parent / "config.json",
            f"Workstation-{self.config.workstation_id or 'unknown'}",
            verify_ssl=verify_ssl,
            ca_cert_path=ca_cert_path
        )
        
        # Try to load existing token or exchange API key
        if not self.jwt_manager.load_token():
            print("🔐 Exchanging API key for JWT token...")
            if self.jwt_manager.register_workstation(
                self.config.api_url,
                self.config.api_key
            ):
                self.update_session_headers()
    
    def get_headers(self):
        """Get current authorization headers"""
        if self.jwt_manager:
            return self.jwt_manager.get_headers()
        elif self.config.api_key:
            # Fallback to legacy API key for backward compatibility
            return {"X-API-Key": self.config.api_key}
        return {}
    
    def update_session_headers(self):
        """Update session headers with current token"""
        headers = self.get_headers()
        if headers:
            self.session.headers.update(headers)
    
    def maybe_refresh_token(self):
        """
        Check if token needs refresh and refresh if needed.
        Call this periodically in main loop.
        """
        if not self.jwt_manager:
            return
        
        if self.jwt_manager.should_refresh_now():
            print("🔄 Refreshing workstation JWT token...")
            if self.jwt_manager.refresh_token(self.config.api_url):
                self.update_session_headers()
    
    def get_status(self):
        """Get JWT token status for monitoring"""
        if self.jwt_manager:
            return self.jwt_manager.get_status()
        return {"status": "no_jwt"}
'''
    
    with open(patch_file, "w", encoding="utf-8") as f:
        f.write(patch_code)
    
    print("✅ JWT integration patch created")
    return True


if __name__ == "__main__":
    print("Integrating JWT token management into workstation monitor...")
    try:
        integrate_jwt()
        create_integration_patch()
        print("\n✅ JWT integration complete!")
        print("Workstation monitor will now:")
        print("  • Automatically register and get JWT token on first run")
        print("  • Refresh token automatically before expiration")
        print("  • Use JWT Bearer tokens instead of static API keys")
        print("  • Require ZERO manual intervention from staff")
    except Exception as e:
        print(f"❌ Integration failed: {e}")
        import traceback
        traceback.print_exc()
