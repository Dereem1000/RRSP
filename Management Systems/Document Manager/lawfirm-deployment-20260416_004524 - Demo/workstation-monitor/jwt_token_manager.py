"""
JWT Token Manager for Workstation Monitor
Handles automatic JWT token registration, storage, and refresh.
Completely transparent - no manual intervention needed from staff.
"""

import os
import json
import time
import requests
from pathlib import Path
from typing import Optional, Dict
from datetime import datetime


class JWTTokenManager:
    """
    Manages JWT tokens for workstation authentication.
    - Automatically registers workstation on first run
    - Stores token securely in config
    - Automatically refreshes token before expiration (like user tokens)
    - Zero manual intervention required
    """

    def __init__(self, config_file: Path, workstation_name: str, verify_ssl: bool = True, ca_cert_path: Optional[str] = None):
        self.config_file = config_file
        self.workstation_name = workstation_name
        self.token = None
        self.token_expiry = None
        self.refresh_interval = None  # Will be set based on token expiry
        self.last_refresh_attempt = None
        # SSL verification settings
        self.verify_ssl = verify_ssl
        self.ca_cert_path = ca_cert_path
        if not verify_ssl:
            import urllib3
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    def get_headers(self) -> Dict[str, str]:
        """Get authorization headers for API requests"""
        if not self.token:
            # Try to load existing token
            self.load_token()

        if not self.token:
            # Token doesn't exist or expired, try to refresh
            if not self.refresh_or_register():
                raise Exception("Failed to obtain JWT token - cannot authenticate")

        return {"Authorization": f"Bearer {self.token}"}

    def load_token(self) -> bool:
        """Load existing token from config file"""
        try:
            if self.config_file.exists():
                with open(self.config_file, "r", encoding="utf-8") as f:
                    data = json.load(f)

                self.token = data.get("workstation_jwt_token")
                self.token_expiry = data.get("workstation_jwt_expiry")
                self.refresh_interval = data.get("workstation_jwt_refresh_interval", 432000)  # 5 days default

                if self.token and self.token_expiry:
                    # Check if token is still valid
                    if time.time() < float(self.token_expiry):
                        return True
                    else:
                        # Token expired
                        self.token = None
                        self.token_expiry = None
                        return False
        except Exception as e:
            print(f"Error loading token: {e}")
            return False

        return False

    def save_token(self, token: str, expiry_seconds: int):
        """Save token to config file"""
        try:
            config_data = {}
            if self.config_file.exists():
                with open(self.config_file, "r", encoding="utf-8") as f:
                    config_data = json.load(f)

            # Calculate expiry timestamp
            expiry_time = time.time() + expiry_seconds
            refresh_interval = expiry_seconds - 3600  # Refresh 1 hour before expiry

            config_data["workstation_jwt_token"] = token
            config_data["workstation_jwt_expiry"] = expiry_time
            config_data["workstation_jwt_refresh_interval"] = refresh_interval
            config_data["workstation_jwt_obtained"] = datetime.now().isoformat()

            # Remove legacy API key if present (optional - can keep for backward compatibility)
            # config_data.pop("api_key", None)

            with open(self.config_file, "w", encoding="utf-8") as f:
                json.dump(config_data, f, indent=2)

            self.token = token
            self.token_expiry = expiry_time
            self.refresh_interval = refresh_interval
            return True
        except Exception as e:
            print(f"Error saving token: {e}")
            return False

    def register_workstation(self, api_url: str, api_key: str) -> bool:
        """
        Exchange API key for JWT token.
        This endpoint integrates with existing workstation registration.
        The workstation must already be registered via the admin UI.
        """
        try:
            register_url = f"{api_url}/workstation/get-jwt-token"
            headers = {"X-API-Key": api_key}

            print(f"🔐 Exchanging API key for JWT token...")
            response = requests.post(register_url, headers=headers, timeout=10)

            if response.status_code == 200:
                data = response.json()
                token = data.get("token")
                expires_in = data.get("expiresIn", 604800)  # Default 7 days

                if token:
                    if self.save_token(token, expires_in):
                        print(f"✅ JWT token obtained successfully")
                        print(f"   Token valid for {expires_in // 86400} days")
                        return True

            print(f"❌ Token exchange failed: {response.status_code}")
            if response.status_code == 401:
                print(f"   Error: Invalid or inactive API key")
            return False

        except Exception as e:
            print(f"❌ Token exchange error: {e}")
            return False

    def refresh_token(self, api_url: str) -> bool:
        """
        Automatically refresh the JWT token before it expires.
        Called transparently in background - no user action needed.
        """
        try:
            if not self.token:
                return False

            # Rate limit refresh attempts (don't try more than once per minute)
            if self.last_refresh_attempt and (time.time() - self.last_refresh_attempt) < 60:
                return False

            self.last_refresh_attempt = time.time()

            refresh_url = f"{api_url}/workstation/refresh-token"
            headers = {"Authorization": f"Bearer {self.token}"}

            print(f"🔄 Refreshing workstation token...")
            verify = self.ca_cert_path if self.ca_cert_path and os.path.exists(self.ca_cert_path) else self.verify_ssl
            response = requests.post(refresh_url, headers=headers, timeout=10, verify=verify)

            if response.status_code == 200:
                data = response.json()
                new_token = data.get("token")
                expires_in = data.get("expiresIn", 604800)

                if new_token:
                    if self.save_token(new_token, expires_in):
                        print(f"✅ Token refreshed successfully")
                        print(f"   New token valid for {expires_in // 86400} days")
                        return True

            print(f"⚠️  Token refresh failed: {response.status_code}")
            return False

        except Exception as e:
            print(f"⚠️  Token refresh error: {e}")
            return False

    def refresh_or_register(self, api_url: str = None, api_key: str = None) -> bool:
        """
        Smart token management:
        - If token exists and valid: do nothing (return True)
        - If token expired: automatically refresh
        - If no token: exchange API key for JWT token
        """
        # First try to load existing token
        if self.load_token():
            # Token is valid
            return True

        # Token doesn't exist or is expired
        if api_url and api_key:
            # Try to refresh first (if we had a token before)
            if self.token and self.refresh_token(api_url):
                return True

            # If no token or refresh failed, exchange API key for new token
            if self.register_workstation(api_url, api_key):
                return True

        return False

    def should_refresh_now(self) -> bool:
        """Check if token needs refreshing soon"""
        if not self.token_expiry or not self.refresh_interval:
            return True

        time_until_expiry = float(self.token_expiry) - time.time()
        return time_until_expiry <= (self.refresh_interval // 2)  # Refresh when halfway through interval

    def get_status(self) -> Dict:
        """Get current token status for monitoring"""
        if not self.token:
            return {"status": "not_registered", "token": None}

        if not self.token_expiry:
            return {"status": "unknown", "token": self.token[:20] + "..."}

        time_left = float(self.token_expiry) - time.time()
        if time_left <= 0:
            return {"status": "expired", "token": self.token[:20] + "..."}

        days_left = time_left / 86400
        return {
            "status": "active",
            "token": self.token[:20] + "...",
            "expires_in_days": round(days_left, 1),
            "needs_refresh": self.should_refresh_now(),
        }
