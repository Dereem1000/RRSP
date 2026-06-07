"""Sync MultiServer demo manifest to the Computer Dynamics website public folder."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .paths_workspace import default_website_public_dir, server_middleware_dir
from .urls import export_manifest

# Marketing HTML page -> MultiServer slug (edit when you add systems)
DEFAULT_DEMO_PAGES: dict[str, str] = {
    "document-management.html": "lawfirm",
    "auto-system.html": "autom-jsd-management",
    "distribution-system.html": "distribution",
    "restaurant-management-learn-more.html": "repair-restaurant",
    "pos-system-learn-more.html": "pos-2026-05-27-demo",
    "index.html": "",
    "homepage.html": "",
}


def _resolve_slug_alias(systems: list[dict], alias: str) -> str | None:
    """Match marketing alias (e.g. repair-restaurant) to configured slug."""
    alias_l = alias.lower().strip()
    if not alias_l:
        return None
    for sys in systems:
        slug = (sys.get("slug") or "").strip()
        if not slug:
            continue
        slug_l = slug.lower()
        if slug_l == alias_l or alias_l in slug_l or slug_l in alias_l:
            return slug
        # repair-restaurant <-> restaurant-deployment-20260422-094910
        if "restaurant" in alias_l and "restaurant" in slug_l:
            return slug
        if "lawfirm" in alias_l and "lawfirm" in slug_l:
            return slug
        if "pos" in alias_l and "pos" in slug_l:
            return slug
    return None


def demo_pages_for_systems(systems: list[dict]) -> dict[str, str]:
    """Build page map from configured systems (optional demo_page / website_page)."""
    pages = dict(DEFAULT_DEMO_PAGES)
    for sys in systems:
        page = (sys.get("demo_page") or sys.get("website_page") or "").strip()
        slug = (sys.get("slug") or "").strip()
        if page and slug:
            pages[page] = slug
    for html_page, alias in DEFAULT_DEMO_PAGES.items():
        if not alias:
            continue
        resolved = _resolve_slug_alias(systems, alias)
        if resolved:
            pages[html_page] = resolved
    return pages


def sync_to_website(
    website_public_dir: Path,
    settings: dict[str, Any],
    systems: list[dict],
    *,
    copy_js: bool = True,
) -> tuple[bool, str]:
    public = Path(website_public_dir)
    if not public.is_dir():
        return False, f"Website public folder not found: {public}"

    manifest_path = public / "demos-manifest.json"
    pages_path = public / "demo-pages.json"
    manifest = export_manifest(settings, systems)
    manifest_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    pages_path.write_text(
        json.dumps(demo_pages_for_systems(systems), indent=2),
        encoding="utf-8",
    )

    if copy_js:
        static_dir = Path(__file__).resolve().parent / "static"
        for name in ("multiserver-demos.js", "multiserver-demo-proxy.js"):
            src = static_dir / name
            if not src.is_file():
                continue
            if name.endswith("-proxy.js"):
                dest_dir = server_middleware_dir()
            else:
                dest_dir = public / "js"
            dest_dir.mkdir(parents=True, exist_ok=True)
            (dest_dir / name).write_text(
                src.read_text(encoding="utf-8"),
                encoding="utf-8",
            )

    return True, f"Synced demos to {public}"
