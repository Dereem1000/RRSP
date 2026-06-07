"""Resolve Computer Dynamics workspace paths (MultiServer at repo/server root)."""

from __future__ import annotations

import os
from pathlib import Path


def multiserver_root() -> Path:
    """Directory containing run.py and config.json."""
    return Path(__file__).resolve().parent.parent


def workspace_root() -> Path:
    """
    CD project root: parent of MultiServer/.
    v2 monorepo: Computer Dynamics System v2/ (apps/web/public).
    v1 layout: contains server/ and public/ at root.
    Override with CD_WORKSPACE_ROOT.
    """
    env = (os.environ.get("CD_WORKSPACE_ROOT") or "").strip()
    if env:
        return Path(env).resolve()
    return multiserver_root().parent


def default_website_public_dir() -> Path:
    root = workspace_root()
    v2_public = root / "apps" / "web" / "public"
    if v2_public.is_dir():
        return v2_public
    return root / "public"


def server_middleware_dir() -> Path:
    root = workspace_root()
    v2_lib = root / "apps" / "web" / "src" / "lib" / "multiserver"
    if v2_lib.parent.is_dir():
        return v2_lib
    return root / "server" / "middleware"


def server_dir() -> Path:
    return workspace_root() / "server"
