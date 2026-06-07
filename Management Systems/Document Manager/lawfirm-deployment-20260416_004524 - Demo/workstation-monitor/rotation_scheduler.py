#!/usr/bin/env python3
"""
API Key Rotation Scheduler - Automatic Key Management
Runs on schedule to detect and rotate API keys that have expired.
Designed to be low-impact and non-blocking.
"""

import os
import sys
import json
import sqlite3
import logging
import asyncio
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
import requests
from typing import List, Dict, Optional

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

# Configure logging
file_handler = logging.FileHandler('rotation_scheduler.log', encoding='utf-8')
stream_handler = logging.StreamHandler()
stream_handler.setFormatter(logging.Formatter('[%(asctime)s] [%(levelname)s] %(message)s'))

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] [%(levelname)s] %(message)s',
    handlers=[file_handler, stream_handler]
)
logger = logging.getLogger(__name__)

class RotationScheduler:
    """Automatic API Key Rotation Scheduler"""
    
    def __init__(self, 
                 api_url: str = "http://localhost:5002/api",
                 db_path: str = "../server/data/lawfirm.db",
                 rotation_interval_days: int = 90,
                 grace_period_days: int = 14,
                 check_interval_minutes: int = 60):
        """
        Initialize the rotation scheduler
        
        Args:
            api_url: Base URL for API calls
            db_path: Path to database
            rotation_interval_days: Days between rotations (90 default)
            grace_period_days: Days grace period for old keys (14 default)
            check_interval_minutes: Minutes between checks (60 = daily)
        """
        self.api_url = api_url
        self.db_path = db_path
        self.rotation_interval_days = rotation_interval_days
        self.grace_period_days = grace_period_days
        self.check_interval_seconds = check_interval_minutes * 60
        self.admin_token = None
        self.session = requests.Session()
        
        logger.info(f"Rotation Scheduler initialized")
        logger.info(f"  Rotation interval: {rotation_interval_days} days")
        logger.info(f"  Grace period: {grace_period_days} days")
        logger.info(f"  Check interval: {check_interval_minutes} minutes")
        logger.info(f"  Database: {db_path}")
    
    def authenticate(self, email: str, password: str) -> bool:
        """
        Authenticate and get admin token
        
        Returns:
            True if authentication succeeded
        """
        try:
            response = self.session.post(
                f"{self.api_url}/auth/login",
                json={"email": email, "password": password},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                self.admin_token = data.get('token')
                if self.admin_token:
                    logger.info(f"✅ Authentication successful for {email}")
                    return True
                else:
                    logger.error("Authentication succeeded but no token received")
                    return False
            else:
                logger.error(f"Authentication failed: {response.status_code}")
                return False
        except Exception as e:
            logger.error(f"Authentication error: {e}")
            return False
    
    def _get_workstations_via_api(self) -> List[Dict]:
        """
        Fetch workstations needing rotation via API (works with encrypted DB).
        Returns list of {id, name, lastKeyRotation, daysSinceRotation}.
        """
        try:
            headers = {
                'Authorization': f'Bearer {self.admin_token}',
                'Content-Type': 'application/json'
            }
            response = self.session.get(
                f"{self.api_url}/workstations",
                headers=headers,
                timeout=15
            )
            if response.status_code != 200:
                logger.error(f"API error fetching workstations: {response.status_code}")
                return []
            workstations = response.json()
            now = datetime.now(timezone.utc).replace(tzinfo=None)
            needing_rotation = []
            for ws in workstations:
                last_rot = ws.get('lastKeyRotation')
                if not last_rot:
                    continue
                try:
                    if isinstance(last_rot, str):
                        s = last_rot.replace('Z', '+00:00').replace(' ', 'T')
                        last_dt = datetime.fromisoformat(s)
                        if last_dt.tzinfo:
                            last_dt = (last_dt.replace(tzinfo=None) -
                                       (last_dt.utcoffset() or timedelta(0)))
                    else:
                        continue
                except (ValueError, TypeError):
                    continue
                delta = now - last_dt
                days_since = delta.total_seconds() / 86400
                if days_since >= self.rotation_interval_days:
                    needing_rotation.append({
                        'id': ws['id'],
                        'name': ws.get('name', 'Unknown'),
                        'apiKey': ws.get('apiKey'),
                        'lastKeyRotation': last_rot,
                        'daysSinceRotation': days_since
                    })
            needing_rotation.sort(key=lambda x: x['daysSinceRotation'], reverse=True)
            return needing_rotation
        except Exception as e:
            logger.error(f"API error while fetching workstations: {e}")
            return []

    def _get_workstations_via_db(self) -> List[Dict]:
        """Query database directly (only works with unencrypted SQLite)."""
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            query = """
            SELECT id, name, apiKey, lastKeyRotation,
                   (julianday('now') - julianday(lastKeyRotation)) as daysSinceRotation
            FROM workstations
            WHERE lastKeyRotation IS NOT NULL AND
                  (julianday('now') - julianday(lastKeyRotation)) >= ?
            ORDER BY daysSinceRotation DESC
            """
            cursor.execute(query, (self.rotation_interval_days,))
            workstations = [dict(row) for row in cursor.fetchall()]
            conn.close()
            return workstations
        except Exception as e:
            logger.error(f"Database error while fetching workstations: {e}")
            return []

    def get_workstations_needing_rotation(self) -> List[Dict]:
        """
        Get workstations that need key rotation. Uses API when authenticated
        (works with encrypted DB); falls back to direct DB when no token.
        """
        if self.admin_token:
            return self._get_workstations_via_api()
        return self._get_workstations_via_db()
    
    def rotate_key_for_workstation(self, workstation_id: int, name: str) -> bool:
        """
        Rotate API key for a specific workstation
        
        Args:
            workstation_id: ID of workstation
            name: Name of workstation (for logging)
        
        Returns:
            True if rotation succeeded
        """
        try:
            if not self.admin_token:
                logger.warning(f"Cannot rotate key for {name}: No admin token")
                return False
            
            headers = {
                'Authorization': f'Bearer {self.admin_token}',
                'Content-Type': 'application/json'
            }
            
            response = self.session.post(
                f"{self.api_url}/workstations/{workstation_id}/rotate-key",
                headers=headers,
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                logger.info(f"✅ Key rotated for {name} (ID: {workstation_id})")
                logger.info(f"   - Old key (first 20 chars): {data.get('oldKey', '')[:20]}...")
                logger.info(f"   - New key (first 20 chars): {data.get('newKey', '')[:20]}...")
                logger.info(f"   - Grace period: {data.get('gracePeriodMessage', 'N/A')}")
                return True
            else:
                logger.warning(f"⚠️  Failed to rotate key for {name}: {response.status_code}")
                if response.text:
                    logger.debug(f"   Response: {response.text[:200]}")
                return False
        except Exception as e:
            logger.error(f"Error rotating key for {name}: {e}")
            return False
    
    async def run_checks(self):
        """Run rotation checks (async-compatible)"""
        logger.info("═" * 70)
        logger.info("🔄 Running API Key Rotation Check")
        logger.info(f"   Timestamp: {datetime.now().isoformat()}")
        logger.info("═" * 70)
        
        # Get workstations needing rotation
        workstations = self.get_workstations_needing_rotation()
        
        if not workstations:
            logger.info("✅ No workstations need rotation at this time")
            logger.info("─" * 70)
            return
        
        logger.info(f"Found {len(workstations)} workstation(s) needing rotation:")
        for ws in workstations:
            logger.info(f"  - {ws['name']} (ID: {ws['id']}, Last rotated: {ws['daysSinceRotation']:.1f} days ago)")
        
        # Rotate keys for each workstation
        rotated_count = 0
        for ws in workstations:
            if self.rotate_key_for_workstation(ws['id'], ws['name']):
                rotated_count += 1
            # Small delay to avoid hammering the server
            await asyncio.sleep(0.5)
        
        logger.info("─" * 70)
        logger.info(f"✅ Rotation check complete: {rotated_count}/{len(workstations)} keys rotated")
        logger.info("─" * 70)
    
    async def run_scheduler(self, admin_email: str = None, admin_password: str = None):
        """
        Run the scheduler in a loop
        
        Args:
            admin_email: Admin email for authentication
            admin_password: Admin password for authentication
        """
        logger.info("Starting API Key Rotation Scheduler")
        logger.info(f"Check interval: {self.check_interval_seconds} seconds ({self.check_interval_seconds/3600:.1f} hours)")
        
        # Authenticate if credentials provided
        if admin_email and admin_password:
            if not self.authenticate(admin_email, admin_password):
                logger.error("Failed to authenticate. Scheduler cannot proceed.")
                return
        else:
            logger.warning("⚠️  No authentication credentials provided")
            logger.warning("   Scheduler will run but may fail to rotate keys")
            logger.warning("   Set environment variables:")
            logger.warning("     ROTATION_ADMIN_EMAIL")
            logger.warning("     ROTATION_ADMIN_PASSWORD")
        
        # Main scheduler loop
        first_run = True
        while True:
            try:
                # Run checks (wait for completion to avoid overlapping)
                await self.run_checks()
                
                # Wait before next check (but first run happens immediately)
                if not first_run:
                    logger.info(f"Next check in {self.check_interval_seconds/60:.0f} minutes...")
                    await asyncio.sleep(self.check_interval_seconds)
                else:
                    first_run = False
                    # For first check, wait shorter interval before second check
                    logger.info(f"Next check in {self.check_interval_seconds/60:.0f} minutes...")
                    await asyncio.sleep(self.check_interval_seconds)
            
            except KeyboardInterrupt:
                logger.info("🛑 Scheduler shutdown requested")
                break
            except Exception as e:
                logger.error(f"Scheduler error: {e}")
                logger.info(f"Retrying in {self.check_interval_seconds/60:.0f} minutes...")
                await asyncio.sleep(self.check_interval_seconds)


def main():
    """Main entry point"""
    # Configuration from environment or defaults
    api_url = os.getenv('ROTATION_API_URL', 'http://localhost:5002/api')
    db_path = os.getenv('ROTATION_DB_PATH', '../server/data/lawfirm.db')
    interval_days = int(os.getenv('ROTATION_INTERVAL_DAYS', '90'))
    grace_days = int(os.getenv('ROTATION_GRACE_PERIOD_DAYS', '14'))
    check_minutes = int(os.getenv('ROTATION_CHECK_INTERVAL_MINUTES', '60'))
    
    admin_email = os.getenv('ROTATION_ADMIN_EMAIL')
    admin_password = os.getenv('ROTATION_ADMIN_PASSWORD')
    
    # Create and run scheduler
    scheduler = RotationScheduler(
        api_url=api_url,
        db_path=db_path,
        rotation_interval_days=interval_days,
        grace_period_days=grace_days,
        check_interval_minutes=check_minutes
    )
    
    # Run async scheduler
    try:
        asyncio.run(scheduler.run_scheduler(admin_email, admin_password))
    except KeyboardInterrupt:
        logger.info("Scheduler stopped by user")
        sys.exit(0)


if __name__ == '__main__':
    main()
