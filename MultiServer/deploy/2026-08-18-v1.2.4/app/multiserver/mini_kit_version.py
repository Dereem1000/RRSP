"""Mini kit version file — mirrors AutoM/CRM `mini-integration.kit-version.json`."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

KIT_VERSION_FILENAME = "mini-integration.kit-version.json"
# Match Mini's current catalog when no file is present yet.
EMBEDDED_FALLBACK_VERSION = "1.4.28"


def _read_json(path: Path) -> dict[str, Any] | None:
    try:
        if not path.is_file():
            return None
        raw = json.loads(path.read_text(encoding="utf-8-sig"))
        return raw if isinstance(raw, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


def normalize_version(version: str | None) -> str:
    text = str(version or "").strip()
    if text.lower().startswith("v"):
        text = text[1:].strip()
    if not text or text.lower() == "python-native":
        return ""
    return text


def load_kit_version(install_root: Path | None = None) -> dict[str, Any]:
    """Same shape as AutoM loadKitVersionFile — always returns a semver string."""
    roots: list[Path] = []
    if install_root is not None:
        roots.append(Path(install_root))
    # Package-relative fallback (MultiServer/ next to multiserver/)
    roots.append(Path(__file__).resolve().parent.parent)

    for root in roots:
        payload = _read_json(root / KIT_VERSION_FILENAME)
        version = normalize_version(str((payload or {}).get("version") or ""))
        if version:
            return {
                "version": version,
                "released_at": (payload or {}).get("released_at"),
                "source": "product",
                "path": str(root / KIT_VERSION_FILENAME),
            }

    return {
        "version": EMBEDDED_FALLBACK_VERSION,
        "released_at": None,
        "source": "fallback",
        "path": None,
    }


def write_kit_version(install_root: Path, version: str) -> dict[str, Any]:
    root = Path(install_root)
    root.mkdir(parents=True, exist_ok=True)
    normalized = normalize_version(version) or EMBEDDED_FALLBACK_VERSION
    payload = {
        "version": normalized,
        "released_at": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    target = root / KIT_VERSION_FILENAME
    target.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return payload
