"""Resolve Computer Dynamics workspace paths (MultiServer at repo/server root)."""

from __future__ import annotations

import os
from pathlib import Path


def multiserver_root() -> Path:
    """Directory containing run.py and config.json."""
    return Path(__file__).resolve().parent.parent


def workspace_root() -> Path:
    """
    CD project root: parent of MultiServer/ (contains server/, public/, MultiServer/).
    Override with CD_WORKSPACE_ROOT.
    """
    env = (os.environ.get("CD_WORKSPACE_ROOT") or "").strip()
    if env:
        return Path(env).resolve()
    root = multiserver_root().parent
    if (root / "server").is_dir() and (root / "public").is_dir():
        return root
    return root


def default_website_public_dir() -> Path:
    return workspace_root() / "public"


def server_middleware_dir() -> Path:
    return workspace_root() / "server" / "middleware"


def server_dir() -> Path:
    return workspace_root() / "server"
