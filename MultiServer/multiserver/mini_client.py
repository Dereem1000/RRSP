"""Python Mini client — register, refresh, pull/apply product updates."""

from __future__ import annotations

import json
import ssl
import tarfile
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse

from . import __version__
from .mini_apply import apply_update_directory, preserve_names_from_file
from .mini_config import (
    APP_BASE_URL_FIELD,
    DEFAULT_MINI_BASE_URL,
    SYSTEM_KEY,
    SYSTEM_NAME,
    ensure_connection_credentials,
)
from .mini_public_url import resolve_public_base_url

SaveMini = Callable[[dict[str, Any]], None]

# Cloudflare Browser Integrity Check blocks Python-urllib's default User-Agent
# (returns HTTP 403 body "error code: 1010"). Match CRM/browser-style clients.
_DEFAULT_HEADERS = {
    "User-Agent": f"Mozilla/5.0 (Windows NT 10.0; Win64; x64) MultiServer/{__version__}",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def is_allowed_auto_update_mini_url(base_url: str) -> bool:
    try:
        parsed = urlparse(str(base_url or "").strip())
    except Exception:
        return False
    if parsed.scheme != "https":
        return False
    host = (parsed.hostname or "").lower()
    if host == "computerdynamicstt.com" or host.endswith(".computerdynamicstt.com"):
        return True
    extra = {
        h.strip().lower()
        for h in str(
            __import__("os").environ.get("MINI_UPDATE_ALLOWED_HOSTS", "")
        ).split(",")
        if h.strip()
    }
    return host in extra


def _json_request(
    url: str,
    *,
    method: str = "GET",
    body: dict | None = None,
    headers: dict | None = None,
    timeout: float = 30.0,
    expect_json: bool = True,
) -> tuple[int, Any, bytes]:
    data = None
    req_headers = {**_DEFAULT_HEADERS, **(headers or {})}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        req_headers.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            raw = resp.read()
            status = resp.getcode() or 200
    except urllib.error.HTTPError as exc:
        raw = exc.read() if exc.fp else b""
        status = exc.code
        text = raw.decode("utf-8", errors="replace")
        if "1010" in text:
            return (
                status,
                {
                    "error": (
                        "Cloudflare blocked the request (error 1010). "
                        "MultiServer must send a browser User-Agent — update MultiServer "
                        "or allowlist API traffic on Cloudflare."
                    )
                },
                raw,
            )
        if expect_json:
            try:
                return status, json.loads(text), raw
            except json.JSONDecodeError:
                return status, {"error": text[:500]}, raw
        return status, {}, raw
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Could not reach Mini ({exc.reason})") from exc

    if not expect_json:
        return status, {}, raw
    try:
        return status, json.loads(raw.decode("utf-8") or "{}"), raw
    except json.JSONDecodeError:
        return status, {}, raw


def _base(mini: dict[str, Any]) -> str:
    return str(mini.get("mini_base_url") or DEFAULT_MINI_BASE_URL).rstrip("/")


def register_with_mini(
    mini: dict[str, Any],
    save: SaveMini,
    *,
    manager_port: int | None = None,
    base_domain: str | None = None,
) -> dict[str, Any]:
    ensure_connection_credentials(mini)
    port = int(manager_port or 5674)
    resolved = resolve_public_base_url(
        mini, manager_port=port, base_domain=base_domain
    )
    public_url = resolved["url"]
    company = str(mini.get("company_name") or "").strip()
    if not company:
        raise RuntimeError("Company name is required for Mini registration.")

    if resolved["source"] == "localhost-fallback":
        raise RuntimeError(
            "Mini is on a Computer Dynamics domain, but MultiServer has no public "
            "domain set. Set Settings → Public domain (e.g. https://www.computerdynamicstt.com) "
            "so Mini can call back — same pattern as CRM/AutoM."
        )

    payload = {
        "connection_id": mini["mini_connection_id"],
        "connection_token": mini["mini_connection_token"],
        "system_key": SYSTEM_KEY,
        "system_name": SYSTEM_NAME,
        "company_name": company,
        "crm_base_url": public_url,
        APP_BASE_URL_FIELD: public_url,
        "send_logs_enabled": False,
    }
    from .mini_kit_version import load_kit_version, normalize_version

    kit_ver = normalize_version(str(mini.get("integration_kit_version") or "")) or load_kit_version().get("version")
    if kit_ver:
        payload["integration_kit_version"] = kit_ver

    status, body, _ = _json_request(
        f"{_base(mini)}/api/external-systems/system-logs/register",
        method="POST",
        body=payload,
    )
    if status >= 400:
        err = body.get("error") if isinstance(body, dict) else f"HTTP {status}"
        mini["mini_connection_status"] = "error"
        mini["mini_last_sync_error"] = str(err)
        save(mini)
        raise RuntimeError(str(err))

    # Remember CD / env URLs so reconnect stays stable (CRM pattern).
    if resolved["source"] in ("env", "base_domain") and not str(
        mini.get("public_base_url") or ""
    ).strip():
        mini["public_base_url"] = public_url

    mini["mini_connection_status"] = (
        body.get("status") if isinstance(body, dict) else "pending"
    ) or "pending"
    mini["mini_last_sync_error"] = ""
    mini["_resolved_public_url"] = public_url
    mini["_resolved_public_source"] = resolved["source"]
    save(mini)
    return mini


def refresh_connection(mini: dict[str, Any], save: SaveMini) -> dict[str, Any]:
    cid = str(mini.get("mini_connection_id") or "").strip()
    if not cid:
        raise RuntimeError("Not registered with Mini yet.")
    token = str(mini.get("mini_connection_token") or "").strip()
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    query = f"?connection_token={urllib.parse.quote(token)}" if token else ""
    status, body, _ = _json_request(
        f"{_base(mini)}/api/external-systems/system-logs/connections/{urllib.parse.quote(cid)}{query}",
        headers=headers,
    )
    if status >= 400:
        err = body.get("error") if isinstance(body, dict) else f"HTTP {status}"
        raise RuntimeError(str(err))
    connection = (body or {}).get("connection") or {}
    st = connection.get("status") or mini.get("mini_connection_status")
    mini["mini_connection_status"] = st
    mini["mini_last_sync_error"] = ""
    if str(st).lower() == "accepted" and connection.get("integration_api_token"):
        mini["mini_api_token"] = str(connection["integration_api_token"]).strip()
    save(mini)
    return mini


def apply_connection_status_callback(
    mini: dict[str, Any], payload: dict[str, Any], save: SaveMini
) -> dict[str, Any]:
    """Handle Mini POST /api/integrations/mini/connection-status."""
    token = str(payload.get("connection_token") or "").strip()
    if token and token != str(mini.get("mini_connection_token") or ""):
        raise PermissionError("Invalid connection token")
    status = payload.get("status") or payload.get("connection_status")
    if status:
        mini["mini_connection_status"] = str(status)
    api_token = payload.get("integration_api_token") or payload.get("mini_api_token")
    if api_token:
        mini["mini_api_token"] = str(api_token).strip()
    mini["mini_last_sync_error"] = ""
    save(mini)
    return mini


def _auth_headers(mini: dict[str, Any]) -> dict[str, str]:
    token = str(mini.get("mini_api_token") or mini.get("mini_connection_token") or "").strip()
    if not token:
        return {}
    return {"Authorization": f"Bearer {token}"}


def _append_connection_query(path: str, mini: dict[str, Any]) -> str:
    cid = str(mini.get("mini_connection_id") or "").strip()
    token = str(mini.get("mini_connection_token") or "").strip()
    if str(mini.get("mini_connection_status") or "").lower() != "accepted":
        return path
    if not cid or not token:
        return path
    sep = "&" if "?" in path else "?"
    return (
        f"{path}{sep}connection_id={urllib.parse.quote(cid)}"
        f"&connection_token={urllib.parse.quote(token)}"
    )


def compare_versions(a: str, b: str) -> int:
    def parts(v: str) -> list[int]:
        out: list[int] = []
        for p in str(v or "0").split("."):
            try:
                out.append(int("".join(c for c in p if c.isdigit()) or "0"))
            except ValueError:
                out.append(0)
        return out or [0]

    left, right = parts(a), parts(b)
    n = max(len(left), len(right))
    left += [0] * (n - len(left))
    right += [0] * (n - len(right))
    for x, y in zip(left, right):
        if x != y:
            return 1 if x > y else -1
    return 0


def fetch_pullable(mini: dict[str, Any], project: str = SYSTEM_KEY) -> list[dict]:
    if not is_allowed_auto_update_mini_url(_base(mini)):
        raise RuntimeError(
            "Auto update requires Mini URL on HTTPS *.computerdynamicstt.com "
            f"(e.g. {DEFAULT_MINI_BASE_URL})"
        )
    path = _append_connection_query(
        f"/api/library/updates/pullable?project={urllib.parse.quote(project)}",
        mini,
    )
    status, body, _ = _json_request(
        f"{_base(mini)}{path}",
        headers=_auth_headers(mini),
        timeout=30.0,
    )
    if status >= 400:
        err = body.get("error") if isinstance(body, dict) else f"HTTP {status}"
        raise RuntimeError(str(err))
    return list((body or {}).get("updates") or [])


def pick_best_update(updates: list[dict], current_version: str) -> dict | None:
    candidates = [
        e
        for e in updates
        if e.get("version") and compare_versions(str(e["version"]), current_version) > 0
    ]
    candidates.sort(key=lambda e: str(e.get("version") or ""), reverse=True)
    # Prefer semantic compare sort
    candidates.sort(
        key=lambda e: tuple(
            int("".join(c for c in p if c.isdigit()) or 0)
            for p in str(e.get("version") or "0").split(".")
        ),
        reverse=True,
    )
    return candidates[0] if candidates else None


def download_package(mini: dict[str, Any], entry_id: str, dest_tar: Path) -> None:
    if not is_allowed_auto_update_mini_url(_base(mini)):
        raise RuntimeError("Package download requires allowed HTTPS Mini URL.")
    path = _append_connection_query(
        f"/api/library/updates/package/{urllib.parse.quote(entry_id)}",
        mini,
    )
    status, _, raw = _json_request(
        f"{_base(mini)}{path}",
        headers=_auth_headers(mini),
        timeout=300.0,
        expect_json=False,
    )
    if status >= 400:
        raise RuntimeError(f"Package download failed HTTP {status}")
    dest_tar.write_bytes(raw)


def mark_applied(mini: dict[str, Any], entry_id: str, version: str) -> None:
    path = _append_connection_query("/api/library/updates/mark-applied", mini)
    status, body, _ = _json_request(
        f"{_base(mini)}{path}",
        method="POST",
        body={"entry_id": entry_id, "version": version, "project": SYSTEM_KEY},
        headers=_auth_headers(mini),
    )
    if status >= 400:
        err = body.get("error") if isinstance(body, dict) else f"HTTP {status}"
        raise RuntimeError(str(err))


def apply_remote_update(
    mini: dict[str, Any],
    save: SaveMini,
    *,
    install_root: Path,
    preserves_path: Path | None,
    entry: dict | None = None,
) -> dict[str, Any]:
    """Download best (or given) pullable update and apply into install_root."""
    current = __version__
    updates = fetch_pullable(mini)
    chosen = entry or pick_best_update(updates, current)
    if not chosen:
        mini["mini_last_update_check_at"] = _now_iso()
        mini["mini_last_update_error"] = ""
        save(mini)
        return {"ok": True, "applied": False, "message": "No newer update available."}

    entry_id = str(chosen.get("id") or chosen.get("entry_id") or "").strip()
    version = str(chosen.get("version") or "").strip()
    if not entry_id:
        raise RuntimeError("Update entry missing id")

    with tempfile.TemporaryDirectory(prefix="ms-mini-upd-") as tmp:
        tar_path = Path(tmp) / "package.tar.gz"
        download_package(mini, entry_id, tar_path)
        extract_dir = Path(tmp) / "extracted"
        extract_dir.mkdir()
        with tarfile.open(tar_path, "r:*") as tar:
            tar.extractall(extract_dir)

        # Prefer app/ subfolder if present (Mini catalog layout)
        source = extract_dir / "app"
        if not source.is_dir():
            # Sometimes archive root IS the app payload
            children = [p for p in extract_dir.iterdir()]
            if len(children) == 1 and children[0].is_dir():
                nested = children[0]
                if (nested / "app").is_dir():
                    source = nested / "app"
                else:
                    source = nested
            else:
                source = extract_dir

        preserve = preserve_names_from_file(preserves_path) if preserves_path else None
        result = apply_update_directory(source, install_root, preserve_names=preserve)

    try:
        mark_applied(mini, entry_id, version)
    except Exception as exc:
        result["mark_applied_error"] = str(exc)

    history = list(mini.get("applied_updates") or [])
    history.insert(
        0,
        {
            "entry_id": entry_id,
            "version": version,
            "title": chosen.get("title"),
            "source": "mini-api",
            "applied_at": _now_iso(),
            "copied_file_count": result.get("copied_file_count", 0),
        },
    )
    mini["applied_updates"] = history[:40]
    mini["mini_last_update_check_at"] = _now_iso()
    mini["mini_last_update_error"] = ""
    save(mini)
    return {
        "ok": True,
        "applied": True,
        "version": version,
        "entry_id": entry_id,
        **result,
    }


def check_for_updates(mini: dict[str, Any], save: SaveMini) -> dict[str, Any]:
    try:
        updates = fetch_pullable(mini)
        best = pick_best_update(updates, __version__)
        mini["mini_last_update_check_at"] = _now_iso()
        mini["mini_last_update_error"] = ""
        save(mini)
        if not best:
            return {"available": None, "current_version": __version__}
        return {
            "available": {
                "entry_id": best.get("id") or best.get("entry_id"),
                "version": best.get("version"),
                "title": best.get("title"),
                "description": best.get("description"),
            },
            "current_version": __version__,
        }
    except Exception as exc:
        mini["mini_last_update_check_at"] = _now_iso()
        mini["mini_last_update_error"] = str(exc)
        save(mini)
        raise
