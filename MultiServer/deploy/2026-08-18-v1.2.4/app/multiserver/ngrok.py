"""ngrok tunnel helpers for MultiServer demos."""

from __future__ import annotations

import json
import re
import subprocess
import urllib.error
import urllib.request
from pathlib import Path

NGROK_BAT_CANDIDATES = (
    "start-ngrok.bat",
    "ngrok.bat",
    "start-ngrok.cmd",
    "ngrok.cmd",
)

_PUBLIC_URL_RE = re.compile(
    r"https?://[a-z0-9-]+\.(?:ngrok(?:-free)?\.(?:app|dev)|ngrok\.io)[^\s\"']*",
    re.IGNORECASE,
)

_supports_web_addr: bool | None = None


def ngrok_supports_web_addr() -> bool:
    """ngrok v3+ supports --web-addr; v2 uses fixed local API on :4040."""
    global _supports_web_addr
    if _supports_web_addr is not None:
        return _supports_web_addr
    try:
        result = subprocess.run(
            ["ngrok", "http", "--help"],
            capture_output=True,
            text=True,
            timeout=8,
            check=False,
        )
        text = f"{result.stdout}\n{result.stderr}"
        _supports_web_addr = "--web-addr" in text
    except (OSError, subprocess.SubprocessError):
        _supports_web_addr = False
    return _supports_web_addr


def effective_inspector_port(requested: int) -> int:
    if not ngrok_supports_web_addr():
        return 4040
    return requested


def ngrok_http_command(demo_port: int, inspector_port: int) -> str:
    """Build a compatible ngrok http command for the installed ngrok version."""
    inspector_port = effective_inspector_port(inspector_port)
    cmd = f"ngrok http {demo_port} --log=stdout"
    if ngrok_supports_web_addr() and inspector_port != 4040:
        cmd += f" --web-addr=127.0.0.1:{inspector_port}"
    return cmd


def ngrok_bat_name(settings: dict | None) -> str:
    return str((settings or {}).get("ngrok_bat_name") or "start-ngrok.bat").strip()


def find_project_ngrok_bat(working: Path, settings: dict | None = None) -> Path | None:
    """Return the first ngrok starter script found in the project root."""
    working = working.resolve()
    preferred = ngrok_bat_name(settings)
    if preferred and (working / preferred).is_file():
        return working / preferred
    for name in NGROK_BAT_CANDIDATES:
        path = working / name
        if path.is_file():
            return path
    return None


def write_ngrok_launcher(
    working: Path,
    demo_port: int,
    inspector_port: int,
    system: dict,
    settings: dict | None = None,
) -> Path:
    """
    Write .multiserver/run-ngrok.bat.

    Uses the MultiServer demo port (not hardcoded ports in project bats).
    Optional system['ngrok_bat'] runs a custom script after PORT is set.
    """
    working = working.resolve()
    ms_dir = working / ".multiserver"
    ms_dir.mkdir(exist_ok=True)
    path = ms_dir / "run-ngrok.bat"

    custom = (system.get("ngrok_bat") or "").strip()
    custom_path = Path(custom).resolve() if custom else None
    project_bat = find_project_ngrok_bat(working, settings)
    inspector = effective_inspector_port(inspector_port)

    lines = [
        "@echo off",
        f'cd /d "{working}"',
        "where ngrok >nul 2>&1",
        "if errorlevel 1 (",
        "  echo [ngrok] ngrok is not installed or not on PATH.",
        "  echo [ngrok] Install from https://ngrok.com/download",
        "  exit /b 1",
        ")",
        f"set MULTISERVER_DEMO_PORT={demo_port}",
        f"set PORT={demo_port}",
        f"echo [ngrok] Tunneling http://localhost:{demo_port}",
        f"echo [ngrok] Inspector: http://127.0.0.1:{inspector}",
    ]

    if custom_path and custom_path.is_file():
        lines.append(f'call "{custom_path}"')
    else:
        if project_bat:
            lines.append(
                f"echo [ngrok] Project script {project_bat.name} ignored — using demo port {demo_port}."
            )
        lines.append(ngrok_http_command(demo_port, inspector_port))

    path.write_text("\r\n".join(lines) + "\r\n", encoding="utf-8")
    return path


def parse_public_url_from_log(log_path: Path, *, tail_lines: int = 200) -> str | None:
    """Fallback: read the public URL ngrok printed to stdout."""
    try:
        text = log_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    https_url = None
    http_url = None
    for line in text.splitlines()[-tail_lines:]:
        for match in _PUBLIC_URL_RE.finditer(line):
            url = match.group(0).rstrip(".,)")
            if url.startswith("https://"):
                https_url = url
            elif not http_url:
                http_url = url
    return https_url or http_url


def ngrok_error_from_log(log_path: Path, *, tail_lines: int = 80) -> str | None:
    try:
        lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return None
    for line in reversed(lines[-tail_lines:]):
        stripped = line.strip()
        if stripped.startswith("ERROR:"):
            return stripped
        if "[ngrok]" in stripped and "not on PATH" in stripped:
            return stripped
    return None


def fetch_public_url(inspector_port: int, timeout: float = 2.0) -> str | None:
    """Read the first HTTPS public URL from the local ngrok inspector API."""
    inspector_port = effective_inspector_port(inspector_port)
    url = f"http://127.0.0.1:{inspector_port}/api/tunnels"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, OSError, json.JSONDecodeError, TimeoutError):
        return None

    tunnels = data.get("tunnels") or []
    if not isinstance(tunnels, list):
        return None

    https_url = None
    http_url = None
    for tunnel in tunnels:
        if not isinstance(tunnel, dict):
            continue
        public = str(tunnel.get("public_url") or "")
        if not public:
            continue
        if public.startswith("https://"):
            https_url = public
            break
        if public.startswith("http://") and not http_url:
            http_url = public
    return https_url or http_url


def wait_for_public_url(
    inspector_port: int,
    timeout: float = 90.0,
    interval: float = 1.0,
    log_path: Path | None = None,
) -> str | None:
    """Poll the ngrok inspector until a public URL is available."""
    import time

    inspector_port = effective_inspector_port(inspector_port)
    deadline = time.time() + timeout
    while time.time() < deadline:
        public = fetch_public_url(inspector_port, timeout=2.0)
        if public:
            return public
        if log_path:
            public = parse_public_url_from_log(log_path)
            if public:
                return public
        time.sleep(interval)
    if log_path:
        return parse_public_url_from_log(log_path)
    return None


def ngrok_status_line(system: dict, inspector_port: int | None) -> str | None:
    if not system.get("ngrok_enabled"):
        return None
    if not inspector_port:
        return "Ngrok: starting…"
    inspector_port = effective_inspector_port(inspector_port)
    public = fetch_public_url(inspector_port)
    if public:
        return f"Ngrok: {public}"
    return f"Ngrok: inspector http://127.0.0.1:{inspector_port}"


def parse_ngrok_port_from_bat(bat_path: Path) -> int | None:
    """Best-effort read of the port in `ngrok http <port>` from a project bat file."""
    try:
        text = bat_path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return None
    match = re.search(r"ngrok\s+http\s+(\d{4,5})", text, re.IGNORECASE)
    if match:
        return int(match.group(1))
    return None
