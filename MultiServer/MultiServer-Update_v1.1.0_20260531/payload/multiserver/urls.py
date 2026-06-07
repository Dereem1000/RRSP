"""Build local and public demo URLs for website integration."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

from . import __version__


def demo_local_url(settings: dict, system: dict) -> str:
    host = settings.get("host") or "localhost"
    demo_port = int(system.get("demo_port") or system.get("client_port") or 8100)
    server_port = int(system.get("server_port") or 0)
    stack = system.get("type") or ""
    port = demo_port
    if stack == "nodejs-split" and server_port and server_port != demo_port:
        from .detectors import has_split_client_package

        if not has_split_client_package(Path(system.get("working_dir") or "")):
            port = server_port
    return f"http://{host}:{port}/"


def public_demo_paths(settings: dict, system: dict) -> tuple[str, str]:
    """Return (vite_base_path, vite_api_url) for path-hosted demos, e.g. /demo/lawfirm/."""
    prefix = (settings.get("url_path_prefix") or "/demo").rstrip("/")
    if not prefix.startswith("/"):
        prefix = "/" + prefix
    slug = (system.get("slug") or "demo").strip("/")
    base = f"{prefix}/{slug}"
    return f"{base}/", f"{base}/api"


def demo_public_url(settings: dict, system: dict) -> str:
    base = (settings.get("base_domain") or "https://yourdomain.com").rstrip("/")
    prefix = settings.get("url_path_prefix") or "/demo"
    if not prefix.startswith("/"):
        prefix = "/" + prefix
    slug = (system.get("slug") or "demo").strip("/")
    path = f"{prefix.rstrip('/')}/{slug}/"
    return urljoin(base + "/", path.lstrip("/"))


def export_manifest(settings: dict, systems: list[dict], running_check=None) -> dict[str, Any]:
    demos = []
    for sys in systems:
        if not sys.get("enabled", True):
            continue
        entry = {
            "id": sys["id"],
            "name": sys["name"],
            "slug": sys.get("slug") or "",
            "local_url": demo_local_url(settings, sys),
            "public_url": demo_public_url(settings, sys),
            "demo_port": sys.get("demo_port"),
            "client_port": sys.get("client_port"),
            "server_port": sys.get("server_port"),
            "working_dir": sys.get("working_dir"),
            "ngrok_enabled": bool(sys.get("ngrok_enabled")),
        }
        if running_check:
            entry["status"] = running_check(sys["id"])
        demos.append(entry)
    return {
        "generated_by": "MultiServer",
        "version": __version__,
        "base_domain": settings.get("base_domain"),
        "url_path_prefix": settings.get("url_path_prefix"),
        "demos": demos,
    }


def export_manifest_json(settings: dict, systems: list[dict], **kwargs) -> str:
    return json.dumps(export_manifest(settings, systems, **kwargs), indent=2)


def caddy_demo_handlers(settings: dict, systems: list[dict]) -> list[str]:
    """Caddy handle_path blocks for each demo (API route first for split stacks)."""
    lines: list[str] = []
    prefix = (settings.get("url_path_prefix") or "/demo").rstrip("/")
    for sys in systems:
        if not sys.get("enabled", True):
            continue
        slug = sys.get("slug") or "demo"
        demo_port = int(sys.get("demo_port") or sys.get("client_port") or 8100)
        server_port = int(sys.get("server_port") or demo_port)
        stack = sys.get("type") or ""
        if stack == "nodejs-split" and server_port != demo_port:
            api_path = f"{prefix}/{slug}/api/*"
            lines.append(f"    handle {api_path} {{")
            lines.append(f"        uri strip_prefix {prefix}/{slug}")
            lines.append(f"        reverse_proxy 127.0.0.1:{server_port}")
            lines.append("    }")
            lines.append("")
        elif stack == "pm2-ecosystem":
            # Law Firm / PM2: API and UI share demo_port (vault uses extra_ports)
            api_path = f"{prefix}/{slug}/api/*"
            lines.append(f"    handle {api_path} {{")
            lines.append(f"        uri strip_prefix {prefix}/{slug}")
            lines.append(f"        reverse_proxy 127.0.0.1:{demo_port}")
            lines.append("    }")
            lines.append("")
        elif stack == "python-flask":
            # Flask apps use SCRIPT_NAME middleware; strip path prefix before proxying.
            ui_path = f"{prefix}/{slug}"
            lines.append(f"    redir {ui_path} {ui_path}/ permanent")
            lines.append(f"    handle {ui_path}/* {{")
            lines.append(f"        uri strip_prefix {ui_path}")
            lines.append(f"        reverse_proxy 127.0.0.1:{demo_port}")
            lines.append("    }")
            lines.append("")
            continue
        ui_path = f"{prefix}/{slug}/*"
        lines.append(f"    handle {ui_path} {{")
        lines.append(f"        reverse_proxy 127.0.0.1:{demo_port}")
        lines.append("    }")
        lines.append("")
    return lines


def caddy_snippet(settings: dict, systems: list[dict]) -> str:
    base = (settings.get("base_domain") or "yourdomain.com").replace(
        "https://", ""
    ).replace("http://", "")
    header = [
        f"# MultiServer reverse proxy — add inside your {base} site block",
        f"# Route each demo under {settings.get('url_path_prefix', '/demo')}/<slug>",
        "",
    ]
    return "\n".join(header + caddy_demo_handlers(settings, systems))


def caddy_full_config(
    settings: dict,
    systems: list[dict],
    *,
    main_backend_port: int = 8000,
    main_backend_host: str = "127.0.0.1",
) -> str:
    """Complete Caddyfile for computerdynamicstt.com + MultiServer demos."""
    base = (settings.get("base_domain") or "https://www.computerdynamicstt.com").replace(
        "https://", ""
    ).replace("http://", "")
    if base.startswith("www."):
        root = base[4:]
        site_names = f"{base}, {root}"
    else:
        site_names = f"www.{base}, {base}"

    lines = [
        "# Computer Dynamics + MultiServer demos",
        "# Generated by MultiServer — adjust main_backend_port if your CD app uses another port",
        "#",
        "# Install: copy to C:\\caddy\\Caddyfile (or your path)",
        "#          caddy validate --config Caddyfile",
        "#          caddy run   (or: caddy start --config Caddyfile)",
        "#",
        f"# Main website (Node): {main_backend_host}:{main_backend_port}",
        f"# Demos: start them in MultiServer first",
        "",
        f"{site_names} {{",
        "    encode gzip zstd",
        "",
        "    # Demo manifest (Open Live Demo buttons)",
        "    handle /demos-manifest.json {",
        "        reverse_proxy 127.0.0.1:5674",
        "    }",
        "    handle /demo-pages.json {",
        "        reverse_proxy 127.0.0.1:5674",
        "    }",
        "",
    ]
    lines.extend(caddy_demo_handlers(settings, systems))
    lines.extend(
        [
            "    # Computer Dynamics intranet (Express in server/index.js)",
            "    handle {",
            f"        reverse_proxy {main_backend_host}:{main_backend_port}",
            "    }",
            "}",
            "",
        ]
    )
    return "\n".join(lines)


def nginx_snippet(settings: dict, systems: list[dict]) -> str:
    prefix = (settings.get("url_path_prefix") or "/demo").rstrip("/")
    lines = ["# MultiServer nginx locations", ""]
    for sys in systems:
        if not sys.get("enabled", True):
            continue
        slug = sys.get("slug") or "demo"
        port = int(sys.get("demo_port") or 8100)
        loc = f"{prefix}/{slug}/"
        lines.append(f"location {loc} {{")
        lines.append(f"    proxy_pass http://127.0.0.1:{port}/;")
        lines.append("    proxy_http_version 1.1;")
        lines.append("    proxy_set_header Host $host;")
        lines.append("    proxy_set_header X-Real-IP $remote_addr;")
        lines.append("    proxy_set_header Upgrade $http_upgrade;")
        lines.append("    proxy_set_header Connection 'upgrade';")
        lines.append("}")
        lines.append("")
    return "\n".join(lines)
