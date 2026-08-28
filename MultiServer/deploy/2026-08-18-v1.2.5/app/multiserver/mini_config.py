"""Mini integration settings stored under config.json â†’ mini."""

from __future__ import annotations

import secrets
import uuid
from copy import deepcopy
from typing import Any

SYSTEM_KEY = "multiserver"
SYSTEM_NAME = "MultiServer"
DEFAULT_MINI_BASE_URL = "https://mini.computerdynamicstt.com"
APP_BASE_URL_FIELD = "multiserver_base_url"

DEFAULT_MINI: dict[str, Any] = {
    "mini_base_url": DEFAULT_MINI_BASE_URL,
    "company_name": "",
    "public_base_url": "",
    "mini_connection_id": "",
    "mini_connection_token": "",
    "mini_connection_status": "disconnected",
    "mini_api_token": "",
    "mini_auto_update_enabled": False,
    "mini_last_update_check_at": "",
    "mini_last_update_error": "",
    "mini_last_sync_error": "",
    "bind_public": False,
    "applied_updates": [],
    "integration_kit_version": "",
}


def get_mini(data: dict[str, Any]) -> dict[str, Any]:
    raw = data.get("mini")
    if not isinstance(raw, dict):
        return deepcopy(DEFAULT_MINI)
    return {**DEFAULT_MINI, **raw}


def set_mini(data: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    current = get_mini(data)
    current.update(patch)
    data["mini"] = current
    return current


def ensure_connection_credentials(mini: dict[str, Any]) -> dict[str, Any]:
    if not mini.get("mini_connection_id"):
        mini["mini_connection_id"] = str(uuid.uuid4())
    if not mini.get("mini_connection_token"):
        mini["mini_connection_token"] = secrets.token_hex(24)
    return mini


def resource_thresholds(settings: dict[str, Any]) -> dict[str, float]:
    return {
        "host_cpu_warn": float(settings.get("host_cpu_warn", 85)),
        "host_ram_warn": float(settings.get("host_ram_warn", 90)),
        "demo_cpu_warn": float(settings.get("demo_cpu_warn", 50)),
    }
