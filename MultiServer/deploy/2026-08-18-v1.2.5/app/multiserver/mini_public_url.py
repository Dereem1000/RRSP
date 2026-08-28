"""Resolve MultiServer callback URL for Mini (CD-domain first).

CRM/AutoM register with their Computer Dynamics public URL
(e.g. https://dev1.computerdynamicstt.com). MultiServer uses Settings →
Public domain (base_domain), which Caddy already fronts for demos/manifest.
"""

from __future__ import annotations

import os
from typing import Any
from urllib.parse import urlparse


def normalize_base_url(url: str | None) -> str | None:
    if not url:
        return None
    trimmed = str(url).strip()
    if not trimmed:
        return None
    try:
        parsed = urlparse(trimmed if "://" in trimmed else f"https://{trimmed}")
        if not parsed.scheme or not parsed.netloc:
            return trimmed.rstrip("/")
        return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")
    except Exception:
        return trimmed.rstrip("/")


def is_localhost_host(hostname: str | None) -> bool:
    host = str(hostname or "").lower()
    return host in ("localhost", "127.0.0.1", "::1")


def is_localhost_url(url: str | None) -> bool:
    try:
        return is_localhost_host(urlparse(str(url or "")).hostname)
    except Exception:
        return True


def is_cd_domain_url(url: str | None) -> bool:
    try:
        host = (urlparse(str(url or "")).hostname or "").lower()
    except Exception:
        return False
    return host == "computerdynamicstt.com" or host.endswith(
        ".computerdynamicstt.com"
    )


def resolve_public_base_url(
    mini: dict[str, Any],
    *,
    manager_port: int = 5674,
    base_domain: str | None = None,
) -> dict[str, str]:
    """Return {url, source}.

    Order (aligned with CRM, CD-domain aware):
    1. env MULTISERVER_PUBLIC_BASE_URL / PUBLIC_BASE_URL
    2. stored mini.public_base_url override
    3. Settings public domain (base_domain) — normal path when Mini is on CD
    4. localhost — only when Mini is local and no CD domain is configured
    """
    for key in ("MULTISERVER_PUBLIC_BASE_URL", "PUBLIC_BASE_URL"):
        env_url = normalize_base_url(os.environ.get(key))
        if env_url:
            return {"url": env_url, "source": "env"}

    stored = normalize_base_url(mini.get("public_base_url"))
    if stored:
        return {"url": stored, "source": "stored"}

    domain = normalize_base_url(base_domain)
    if domain and not is_localhost_url(domain):
        return {"url": domain, "source": "base_domain"}

    mini_base = normalize_base_url(mini.get("mini_base_url")) or ""
    # Production Mini on CD domain without a public domain configured — still
    # prefer telling the operator to set base_domain rather than silently use
    # localhost (Mini cannot call back to the operator's loopback).
    if mini_base and is_cd_domain_url(mini_base) and not domain:
        return {
            "url": f"http://127.0.0.1:{int(manager_port)}",
            "source": "localhost-fallback",
        }

    return {
        "url": f"http://127.0.0.1:{int(manager_port)}",
        "source": "localhost",
    }
