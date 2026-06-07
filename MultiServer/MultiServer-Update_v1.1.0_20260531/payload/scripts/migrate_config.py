#!/usr/bin/env python3
"""Merge new MultiServer defaults into an existing config.json after an update."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from multiserver.config import DEFAULT_SETTINGS, DEFAULT_SYSTEM  # noqa: E402


def migrate_config(path: Path) -> list[str]:
    """Add missing settings/system fields only. Never overwrite existing values."""
    changes: list[str] = []
    if not path.is_file():
        return changes

    try:
        raw = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"Could not read {path}: {exc}") from exc

    settings = dict(raw.get("settings") or {})
    for key, value in DEFAULT_SETTINGS.items():
        if key not in settings:
            settings[key] = value
            changes.append(f"settings.{key}")

    systems = []
    for item in raw.get("systems") or []:
        merged = {**DEFAULT_SYSTEM, **item}
        for key in DEFAULT_SYSTEM:
            if key not in item:
                changes.append(f"system.{merged.get('name') or merged.get('id', '?')[:8]}.{key}")
        systems.append(merged)

    raw["settings"] = settings
    raw["systems"] = systems
    path.write_text(json.dumps(raw, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return sorted(set(changes))


def main() -> None:
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "config.json"
    target = target.resolve()
    changes = migrate_config(target)
    if changes:
        print(f"Migrated {target} ({len(changes)} new field(s)):")
        for line in changes[:20]:
            print(f"  + {line}")
        if len(changes) > 20:
            print(f"  ... and {len(changes) - 20} more")
    else:
        print(f"No migration needed: {target}")


if __name__ == "__main__":
    main()
