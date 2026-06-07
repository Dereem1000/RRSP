"""Load and save MultiServer configuration."""

from __future__ import annotations

import json
import uuid
from copy import deepcopy
from pathlib import Path
from typing import Any

def _default_website_public_dir() -> str:
    try:
        from .paths_workspace import default_website_public_dir

        return str(default_website_public_dir())
    except OSError:
        return ""


DEFAULT_SETTINGS = {
    "base_domain": "https://www.computerdynamicstt.com",
    "host": "localhost",
    "url_path_prefix": "/demo",
    "manager_port": 5674,
    "demo_port_range_start": 8100,
    "demo_port_range_end": 8990,
    "port_block_step": 10,
    "website_public_dir": _default_website_public_dir(),
    "ngrok_bat_name": "start-ngrok.bat",
    "ngrok_inspector_port_start": 4040,
}

DEFAULT_SYSTEM = {
    "id": "",
    "name": "",
    "slug": "",
    "working_dir": "",
    "type": "auto",
    "client_port": 8100,
    "server_port": 8101,
    "demo_port": 8100,
    "extra_ports": [],
    "command": "",
    "enabled": True,
    "notes": "",
    "demo_page": "",
    "ngrok_enabled": False,
    "ngrok_bat": "",
}


class ConfigStore:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.data: dict[str, Any] = {"settings": deepcopy(DEFAULT_SETTINGS), "systems": []}
        self.load()

    def load(self) -> None:
        if not self.path.exists():
            self.save()
            return
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            raw = {}
        settings = {**DEFAULT_SETTINGS, **(raw.get("settings") or {})}
        systems = []
        for item in raw.get("systems") or []:
            merged = {**DEFAULT_SYSTEM, **item}
            if not merged.get("id"):
                merged["id"] = str(uuid.uuid4())
            systems.append(merged)
        self.data = {"settings": settings, "systems": systems}

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            json.dumps(self.data, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

    @property
    def settings(self) -> dict[str, Any]:
        return self.data["settings"]

    @property
    def systems(self) -> list[dict[str, Any]]:
        return self.data["systems"]

    def add_system(self, system: dict[str, Any]) -> dict[str, Any]:
        merged = {**DEFAULT_SYSTEM, **system}
        if not merged.get("id"):
            merged["id"] = str(uuid.uuid4())
        self.systems.append(merged)
        self.save()
        return merged

    def update_system(self, system_id: str, updates: dict[str, Any]) -> bool:
        for idx, sys in enumerate(self.systems):
            if sys["id"] == system_id:
                self.systems[idx] = {**sys, **updates, "id": system_id}
                self.save()
                return True
        return False

    def remove_system(self, system_id: str) -> bool:
        before = len(self.systems)
        self.data["systems"] = [s for s in self.systems if s["id"] != system_id]
        if len(self.systems) < before:
            self.save()
            return True
        return False

    def get_system(self, system_id: str) -> dict[str, Any] | None:
        return next((s for s in self.systems if s["id"] == system_id), None)
