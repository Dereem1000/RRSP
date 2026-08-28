"""HTTP handlers for Mini inbound callbacks on the MultiServer control API.

Matches AutoM/CRM inbound Mini routes:
  GET  /api/integrations/mini/health
  POST /api/integrations/mini/connection-status
  POST /api/integrations/mini/integration-kit/apply-update
  POST /api/integrations/mini/apply-update  (product Update Library)
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

from . import __version__
from .mini_client import apply_connection_status_callback, apply_remote_update
from .mini_config import SYSTEM_KEY, SYSTEM_NAME
from .mini_kit_version import load_kit_version, normalize_version, write_kit_version

GetMini = Callable[[], dict[str, Any]]
SaveMini = Callable[[dict[str, Any]], None]
GetResources = Callable[[], dict[str, Any]]


class MiniRouteContext:
    def __init__(
        self,
        *,
        get_mini: GetMini,
        save_mini: SaveMini,
        install_root: Path,
        preserves_path: Path | None,
        get_resources: GetResources | None = None,
    ) -> None:
        self.get_mini = get_mini
        self.save_mini = save_mini
        self.install_root = install_root
        self.preserves_path = preserves_path
        self.get_resources = get_resources


def _kit_version_for(ctx: MiniRouteContext, mini: dict[str, Any]) -> str:
    """Prefer stored config, else kit version file (AutoM pattern), never null."""
    stored = normalize_version(str(mini.get("integration_kit_version") or ""))
    if stored:
        return stored
    return load_kit_version(ctx.install_root)["version"]


def _bearer_token(headers: dict[str, str] | None) -> str:
    if not headers:
        return ""
    raw = ""
    for key, value in (headers.items() if hasattr(headers, "items") else []):
        if str(key).lower() == "authorization":
            raw = str(value or "")
            break
    if not raw and hasattr(headers, "get"):
        raw = str(headers.get("Authorization") or headers.get("authorization") or "")
    parts = raw.split(None, 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return ""


def _auth_ok(mini: dict[str, Any], payload: dict[str, Any], headers: dict | None) -> bool:
    token = str(
        payload.get("connection_token")
        or payload.get("integration_api_token")
        or _bearer_token(headers)
        or ""
    ).strip()
    if not token:
        return False
    return token in {
        str(mini.get("mini_connection_token") or "").strip(),
        str(mini.get("mini_api_token") or "").strip(),
    }


def handle_mini_request(
    method: str,
    path: str,
    body: bytes,
    ctx: MiniRouteContext,
    *,
    headers: dict | None = None,
) -> tuple[int, dict[str, Any]] | None:
    """Return (status, json_body) if handled, else None."""
    if path == "/api/integrations/mini/health" and method == "GET":
        mini = ctx.get_mini()
        kit_ver = _kit_version_for(ctx, mini)
        return 200, {
            "ok": True,
            "service": "MultiServer",
            "system_key": SYSTEM_KEY,
            "system_name": SYSTEM_NAME,
            "system": SYSTEM_KEY,
            "name": SYSTEM_NAME,
            "version": __version__,
            "integration_kit_version": kit_ver,
            "connection_status": mini.get("mini_connection_status"),
            "company_name": mini.get("company_name") or None,
        }

    if path == "/resources.json" and method == "GET":
        if not ctx.get_resources:
            return 200, {"systems": {}}
        return 200, ctx.get_resources()

    if path == "/api/integrations/mini/connection-status" and method == "POST":
        try:
            payload = json.loads(body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return 400, {"error": "Invalid JSON"}
        try:
            apply_connection_status_callback(ctx.get_mini(), payload, ctx.save_mini)
        except PermissionError as exc:
            return 401, {"error": str(exc)}
        return 200, {"ok": True, "status": ctx.get_mini().get("mini_connection_status")}

    if path == "/api/integrations/mini/integration-kit/apply-update" and method == "POST":
        try:
            payload = json.loads(body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return 400, {"error": "Invalid JSON"}
        mini = ctx.get_mini()
        # Match AutoM: auth required for all kit apply traffic (including probe).
        if not _auth_ok(mini, payload, headers):
            return 401, {"error": "Unauthorized"}
        entry_id = str(payload.get("entry_id") or "").strip()
        if entry_id == "__route_probe__":
            return 200, {
                "ok": True,
                "probe": True,
                "message": "apply-update route reachable",
                "entry_id": entry_id,
                "integration_kit_version": _kit_version_for(ctx, mini),
            }

        # MultiServer is Python-native — acknowledge kit push and stamp version like AutoM.
        applied = normalize_version(str(payload.get("version") or ""))
        if not applied:
            applied = load_kit_version(ctx.install_root)["version"]
        write_kit_version(ctx.install_root, applied)
        mini["integration_kit_version"] = applied
        ctx.save_mini(mini)
        return 200, {
            "ok": True,
            "skipped": True,
            "version": applied,
            "integration_kit_version": applied,
            "message": (
                "MultiServer uses a native Python Mini client; Node integration-kit "
                "files are not installed. Kit version recorded. Use Update Library "
                "project 'multiserver' for product updates."
            ),
            "copied_file_count": 0,
            "copied_files": [],
            "entry_id": entry_id or None,
        }

    if path == "/api/integrations/mini/apply-update" and method == "POST":
        try:
            payload = json.loads(body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return 400, {"error": "Invalid JSON"}
        mini = ctx.get_mini()
        if not _auth_ok(mini, payload, headers):
            return 401, {"error": "Unauthorized"}
        entry = None
        if payload.get("entry_id") or payload.get("version"):
            entry = {
                "id": payload.get("entry_id"),
                "entry_id": payload.get("entry_id"),
                "version": payload.get("version"),
                "title": payload.get("title"),
            }
        try:
            result = apply_remote_update(
                mini,
                ctx.save_mini,
                install_root=ctx.install_root,
                preserves_path=ctx.preserves_path,
                entry=entry if entry and entry.get("id") else None,
            )
        except Exception as exc:
            return 500, {"error": str(exc)}
        return 200, result

    return None
