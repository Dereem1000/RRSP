"""Apply MultiServer update payloads while preserving instance files."""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

DEFAULT_PRESERVE_FILES = {
    "config.json",
    "demos-manifest.json",
    "demo-pages.json",
    "DISTRIBUTION-MANIFEST.json",
    "Caddyfile",
}
DEFAULT_PRESERVE_DIRS = {
    "logs",
    ".git",
    "distributions",
    "__pycache__",
    ".venv",
    "venv",
    ".cursor",
    ".vscode",
}
DEFAULT_PRESERVE_PATTERNS_PREFIX = ("config.json.bak",)


def preserve_names_from_file(path: Path | None) -> dict[str, Any]:
    if not path or not path.is_file():
        return {
            "files": set(DEFAULT_PRESERVE_FILES),
            "directories": set(DEFAULT_PRESERVE_DIRS),
            "file_prefixes": list(DEFAULT_PRESERVE_PATTERNS_PREFIX),
        }
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {
            "files": set(DEFAULT_PRESERVE_FILES),
            "directories": set(DEFAULT_PRESERVE_DIRS),
            "file_prefixes": list(DEFAULT_PRESERVE_PATTERNS_PREFIX),
        }
    pot = raw.get("preserveOnTarget") or {}
    files = set(pot.get("files") or DEFAULT_PRESERVE_FILES)
    directories = set(pot.get("directories") or DEFAULT_PRESERVE_DIRS)
    patterns = pot.get("filePatterns") or []
    prefixes = []
    for p in patterns:
        s = str(p)
        if s.endswith("*"):
            prefixes.append(s[:-1])
        elif s.startswith("*"):
            continue
        else:
            files.add(s)
    return {"files": files, "directories": directories, "file_prefixes": prefixes}


def _should_skip(rel: str, preserve: dict[str, Any]) -> bool:
    normalized = rel.replace("\\", "/")
    name = Path(normalized).name
    parts = normalized.split("/")
    if name in preserve["files"] or normalized in preserve["files"]:
        return True
    for pref in preserve.get("file_prefixes") or []:
        if name.startswith(pref) or normalized.startswith(pref):
            return True
    if parts and parts[0] in preserve["directories"]:
        return True
    if "deploy/Caddyfile" in (normalized,):
        return True
    if normalized == "deploy/Caddyfile" or normalized.endswith("/Caddyfile"):
        if "Caddyfile" in preserve["files"]:
            return True
    return False


def apply_update_directory(
    source_root: Path,
    install_root: Path,
    *,
    preserve_names: dict[str, Any] | None = None,
) -> dict[str, Any]:
    preserve = preserve_names or {
        "files": set(DEFAULT_PRESERVE_FILES),
        "directories": set(DEFAULT_PRESERVE_DIRS),
        "file_prefixes": list(DEFAULT_PRESERVE_PATTERNS_PREFIX),
    }
    source_root = source_root.resolve()
    install_root = install_root.resolve()
    copied = 0
    skipped = 0

    # Backup config before overwrite attempts
    cfg = install_root / "config.json"
    if cfg.is_file():
        bak = install_root / f"config.json.bak-{__import__('time').strftime('%Y%m%d%H%M%S')}"
        try:
            shutil.copy2(cfg, bak)
        except OSError:
            pass

    for path in source_root.rglob("*"):
        if not path.is_file():
            continue
        rel = str(path.relative_to(source_root)).replace("\\", "/")
        if _should_skip(rel, preserve):
            skipped += 1
            continue
        dest = install_root / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, dest)
        copied += 1

    return {"copied_file_count": copied, "skipped_file_count": skipped}


def apply_local_deploy_folder(
    package_dir: Path,
    install_root: Path,
    *,
    preserves_path: Path | None = None,
) -> dict[str, Any]:
    """Apply a Mini-style deploy folder or legacy payload folder."""
    package_dir = package_dir.resolve()
    if (package_dir / "app").is_dir():
        source = package_dir / "app"
    elif (package_dir / "payload").is_dir():
        source = package_dir / "payload"
    else:
        source = package_dir
    preserve = preserve_names_from_file(preserves_path)
    return apply_update_directory(source, install_root, preserve_names=preserve)
