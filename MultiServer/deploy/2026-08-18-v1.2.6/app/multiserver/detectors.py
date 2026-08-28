"""Detect stack type and default ports from a project folder (working dir or app root)."""

from __future__ import annotations

import json
import re
from pathlib import Path

STACK_TYPES = (
    "auto",
    "nodejs-split",
    "nextjs",
    "nextjs-dist",
    "python-flask",
    "pm2-ecosystem",
    "custom",
)

_ECOSYSTEM_FILENAMES = (
    "provision-ecosystem.config.js",  # Law Firm provision install (install-provision copies this)
    "ecosystem.config.js",
    "ecosystem.config.cjs",
    "ecosystem.config.mjs",
)

_SKIP_DIR_NAMES = frozenset({
    "node_modules",
    ".git",
    ".multiserver",
    "archived_workspaces",
    "backups",
    "code_versions",
    "original",
    "dist",
    "build",
    ".next",
    "__pycache__",
    ".venv",
    "venv",
})

_DEPLOY_DIR_HINTS = (
    "deploy",
    "deployment",
    "distribution",
    "distributions",
    "production-deploy",
    "production",
)


def find_ecosystem_config(project_dir: Path) -> Path | None:
    """PM2 ecosystem at project root (deploy: ecosystem.config.js; provision: provision-ecosystem.config.js)."""
    if not project_dir.is_dir():
        return None
    for name in _ECOSYSTEM_FILENAMES:
        path = project_dir / name
        if path.is_file():
            return path
    return None


def is_provision_package(path: Path) -> bool:
    """Shipping folder you run install-provision.bat from — not the live worktree."""
    if not path.is_dir():
        return False
    has_installer = (path / "install-provision.ps1").is_file() or (
        path / "install-provision.bat"
    ).is_file()
    return has_installer and (path / "update-layout.json").is_file() and (path / "app").is_dir()


def is_provision_package_source(path: Path) -> bool:
    """True for package/app — the ship tree, not the extracted live install."""
    return path.name.lower() == "app" and is_provision_package(path.parent)


def load_update_layout(path: Path) -> dict | None:
    layout_path = path / "update-layout.json"
    if not layout_path.is_file():
        return None
    try:
        data = json.loads(layout_path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def runtime_dir_from_layout(install_root: Path, layout: dict) -> Path:
    """Where install-provision extracts package app/ (flat → install root, nested-app → app/)."""
    mode = str(layout.get("layout_mode") or "flat").strip().lower()
    rel = str(layout.get("runtime_relative") or ".").strip() or "."
    if mode == "nested-app" and rel in (".", ""):
        rel = "app"
    if rel in (".", ""):
        return install_root
    return install_root / rel.replace("/", "\\")


def is_marked_project(path: Path) -> bool:
    """True when this folder is a runnable live worktree (not a provision package)."""
    if not path.is_dir() or is_provision_package(path) or is_provision_package_source(path):
        return False
    if find_ecosystem_config(path):
        return True
    if (path / "package.json").is_file():
        return True
    if (path / "DISTRIBUTION-MANIFEST.json").is_file():
        return True
    if (path / "app.py").is_file() and (path / "requirements.txt").is_file():
        return True
    return False


def resolve_project_dir(path: str | Path) -> Path | None:
    """Map a picked folder to the live worktree MultiServer should run.

    install-provision.bat extracts package app/ onto InstallRoot per update-layout.json
    (Law Firm is flat: files land at the install root, not under app/).
    Repair workspaces still resolve to working/.
    """
    p = Path(path)
    if not p.is_dir() or is_provision_package(p) or is_provision_package_source(p):
        return None
    if is_marked_project(p):
        return p
    layout = load_update_layout(p)
    if layout:
        runtime = runtime_dir_from_layout(p, layout)
        if runtime != p and is_marked_project(runtime):
            return runtime
    working = p / "working"
    if is_marked_project(working):
        return working
    found = list_deployment_candidates(p)
    return _prefer_project_candidate(found)


def _read_text(path: Path, limit: int = 200_000) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")[:limit]
    except OSError:
        return ""


def _find_port_in_text(text: str, default: int | None = None) -> int | None:
    patterns = [
        r'PORT\s*=\s*["\']?(\d{4,5})',
        r'process\.env\.PORT\s*\|\|\s*(\d{4,5})',
        r'listen\([^,]*,\s*(\d{4,5})',
        r'-p\s+(\d{4,5})',
        r'next dev -p (\d{4,5})',
        r'next start -p (\d{4,5})',
        r'localhost:(\d{4,5})',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return int(match.group(1))
    return default


def _has_next_source_tree(project_dir: Path) -> bool:
    return any(
        (project_dir / part).exists()
        for part in ("src/app", "app", "pages", "src/pages")
    )


def is_nextjs_distribution(project_dir: Path) -> bool:
    """Compiled client package (.next, no src) — use next start, not next dev."""
    if not project_dir.is_dir():
        return False
    if (project_dir / "DISTRIBUTION-MANIFEST.json").exists():
        return True
    if not (project_dir / ".next").is_dir():
        return False
    if _has_next_source_tree(project_dir):
        return False
    pkg_path = project_dir / "package.json"
    if not pkg_path.exists():
        return False
    try:
        pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return True
    start_script = str((pkg.get("scripts") or {}).get("start", "")).lower()
    if "next start" in start_script:
        return True
    name = project_dir.name.lower()
    return any(h in name for h in _DEPLOY_DIR_HINTS)


def list_deployment_candidates(parent: Path, limit: int = 12) -> list[Path]:
    """Subfolders that look like deploy/provision/working packages."""
    if not parent.is_dir():
        return []
    found: list[Path] = []
    seen: set[Path] = set()

    def _add(candidate: Path) -> None:
        if len(found) >= limit:
            return
        try:
            key = candidate.resolve()
        except OSError:
            key = candidate
        if key in seen or not is_marked_project(candidate):
            return
        seen.add(key)
        found.append(candidate)

    try:
        children = sorted(parent.iterdir(), key=lambda p: p.name.lower())
    except OSError:
        return []

    for child in children:
        if not child.is_dir() or child.name.lower() in _SKIP_DIR_NAMES:
            continue
        _add(child)
        if child.name.lower() == "working":
            continue
        if is_provision_package(child):
            continue
        if child.name.lower() == "repair_workspace":
            try:
                nested = sorted(child.iterdir(), key=lambda p: p.name.lower())
            except OSError:
                nested = []
            for repair in nested:
                if not repair.is_dir() or repair.name.lower() in _SKIP_DIR_NAMES:
                    continue
                _add(repair)
                _add(repair / "working")
        else:
            _add(child / "working")
            layout = load_update_layout(child)
            if layout and str(layout.get("layout_mode") or "").lower() == "nested-app":
                _add(runtime_dir_from_layout(child, layout))
        if len(found) >= limit:
            break
    return found


def _prefer_project_candidate(candidates: list[Path]) -> Path | None:
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]

    def _score(path: Path) -> int:
        name = path.name.lower()
        parent = path.parent.name.lower()
        score = 0
        if find_ecosystem_config(path):
            score += 15
        if name == "working":
            score += 10
        if parent.startswith("repair_"):
            score += 20
        if "backup" in parent or "backup" in name:
            score -= 30
        return score

    ranked = sorted(candidates, key=_score, reverse=True)
    if _score(ranked[0]) > _score(ranked[1]):
        return ranked[0]
    return None


def _parse_pm2_app_port(ecosystem_text: str, app_name: str, default: int | None = None) -> int | None:
    """Read PORT from a PM2 app block by name (e.g. zenlaw-server, master-vault)."""
    pattern = rf"name:\s*['\"]{re.escape(app_name)}['\"][\s\S]*?PORT:\s*(\d{{4,5}})"
    match = re.search(pattern, ecosystem_text, re.IGNORECASE)
    if match:
        return int(match.group(1))
    return default


def detect_pm2_ports(working_dir: Path) -> dict[str, int | list[int] | None]:
    """Ports declared in ecosystem.config.js (Law Firm / ZenLaw PM2 deployments)."""
    eco = find_ecosystem_config(working_dir)
    server_port = 5002
    vault_port: int | None = 3333
    if eco:
        text = _read_text(eco)
        server_port = (
            _parse_pm2_app_port(text, "zenlaw-server")
            or _parse_pm2_app_port(text, "server")
            or _find_port_in_text(text, 5002)
            or 5002
        )
        vault_port = _parse_pm2_app_port(text, "master-vault", None)
    extra: list[int] = []
    if vault_port:
        extra.append(vault_port)
    return {
        "client_port": server_port,
        "server_port": server_port,
        "demo_port": server_port,
        "extra_ports": extra,
        "vault_port": vault_port,
        "detected_server": server_port,
        "detected_vault": vault_port,
    }


def has_split_client_package(working_dir: Path) -> bool:
    """True when a separate client/ package exists (true split-stack layout)."""
    return (working_dir / "client" / "package.json").is_file()


def is_true_nodejs_split(working_dir: Path) -> bool:
    """Split client + server — not monoliths that use concurrently for CSS/watch tasks."""
    if has_split_client_package(working_dir):
        return True
    pkg_path = working_dir / "package.json"
    if not pkg_path.is_file():
        return False
    try:
        pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return False
    scripts = pkg.get("scripts") or {}
    return "client" in scripts and "server" in scripts


def detect_stack(working_dir: Path) -> str:
    if not working_dir.is_dir():
        return "custom"
    if find_ecosystem_config(working_dir):
        return "pm2-ecosystem"
    if (working_dir / "app.py").exists() and (working_dir / "requirements.txt").exists():
        return "python-flask"
    pkg_path = working_dir / "package.json"
    if pkg_path.exists():
        if is_nextjs_distribution(working_dir):
            return "nextjs-dist"
        try:
            pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return "custom"
        scripts = pkg.get("scripts") or {}
        deps = {**(pkg.get("dependencies") or {}), **(pkg.get("devDependencies") or {})}
        script_text = " ".join(str(v) for v in scripts.values()).lower()
        if "next" in deps or "next dev" in script_text:
            return "nextjs"
        if is_true_nodejs_split(working_dir):
            return "nodejs-split"
    return "custom"


def detect_ports(working_dir: Path, stack: str) -> dict[str, int | list[int]]:
    client_port = 3000
    server_port = 5000
    extra: list[int] = []

    env_files = list(working_dir.glob(".env")) + list(working_dir.glob(".env.local"))
    for sub in ("server", "client"):
        env_files.extend((working_dir / sub).glob(".env"))
        env_files.extend((working_dir / sub).glob(".env.local"))

    for env_file in env_files:
        text = _read_text(env_file)
        for key, target in (("PORT", "client"), ("CLIENT_PORT", "client"), ("SERVER_PORT", "server")):
            match = re.search(rf"^{key}=(\d+)", text, re.MULTILINE | re.IGNORECASE)
            if match:
                port = int(match.group(1))
                if target == "client":
                    client_port = port
                else:
                    server_port = port

    if stack in ("nextjs", "nextjs-dist"):
        pkg = _read_text(working_dir / "package.json")
        port = _find_port_in_text(pkg, 3000)
        if stack == "nextjs-dist" and port:
            pass
        elif stack == "nextjs-dist":
            port = 6001
        client_port = port or 3000
        server_port = client_port
    elif stack == "python-flask":
        bat = _read_text(working_dir / "start.bat")
        app_py = _read_text(working_dir / "app.py")
        port = _find_port_in_text(bat) or _find_port_in_text(app_py, 5000)
        client_port = server_port = port or 5000
    elif stack == "nodejs-split":
        server_js = working_dir / "server" / "index.js"
        if server_js.exists():
            port = _find_port_in_text(_read_text(server_js), 5000)
            if port:
                server_port = port
        server_ts = working_dir / "server" / "src" / "index.ts"
        if server_ts.exists():
            port = _find_port_in_text(_read_text(server_ts), server_port)
            if port:
                server_port = port
    elif stack == "pm2-ecosystem":
        pm2 = detect_pm2_ports(working_dir)
        client_port = int(pm2["client_port"])
        server_port = int(pm2["server_port"])
        extra = list(pm2.get("extra_ports") or [])

    demo_port = client_port
    out: dict[str, int | list[int] | None] = {
        "client_port": client_port,
        "server_port": server_port,
        "demo_port": demo_port,
        "extra_ports": extra,
    }
    if stack == "pm2-ecosystem":
        out["vault_port"] = pm2.get("vault_port")
        out["detected_server"] = pm2.get("detected_server")
        out["detected_vault"] = pm2.get("detected_vault")
    return out


def analyze_working_dir(
    path: str,
    systems: list | None = None,
    settings: dict | None = None,
    exclude_id: str | None = None,
    allocate: bool = True,
) -> dict:
    """Detect stack and ports. When allocate=True, assigns unique high ports (not 3000/5000)."""
    from .ports import allocate_ports

    working = resolve_project_dir(path) or Path(path)
    stack = detect_stack(working)
    detected = detect_ports(working, stack)
    name = working.name
    manifest = working / "DISTRIBUTION-MANIFEST.json"
    if manifest.exists():
        try:
            data = json.loads(manifest.read_text(encoding="utf-8-sig"))
            tag = data.get("clientTag") or data.get("product")
            if tag:
                name = f"{data.get('product', 'App')} — {tag}"
        except json.JSONDecodeError:
            pass
    elif working.name.lower() == "working":
        name = working.parent.name
    name = name.replace("_", " ").replace("-", " ")
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "demo"
    result = {
        "name": name.replace("_", " ").replace("-", " ").title(),
        "slug": slug,
        "type": stack,
        "detected_ports": {
            "client_port": detected["client_port"],
            "server_port": detected["server_port"],
            "demo_port": detected["demo_port"],
        },
        "extra_ports": list(detected.get("extra_ports") or []),
    }
    if allocate:
        assigned = allocate_ports(
            systems or [],
            settings,
            stack=stack,
            exclude_id=exclude_id,
            preferred=detected,
        )
        result.update(assigned)
    else:
        result.update(detected)
    result["resolved_dir"] = str(working)
    return result


def validate_project_dir(path: str) -> tuple[bool, str]:
    """Validate any app root — not only folders named 'working'."""
    p = Path(path)
    if not p.exists():
        return False, "Path does not exist."
    if not p.is_dir():
        return False, "Path must be a folder."
    if is_provision_package(p) or is_provision_package_source(p):
        layout = load_update_layout(p) or {}
        mode = str(layout.get("layout_mode") or "flat").strip().lower() or "flat"
        dest = "the install root (files land at that folder, not under app/)" if mode == "flat" else "InstallRoot/app/"
        return False, (
            "This is a provision package, not the live worktree.\n"
            "Run install-provision.bat from this folder; it extracts app/ onto "
            f"{dest}.\n"
            "Then point MultiServer at that install root "
            "(it will have provision-ecosystem.config.js or ecosystem.config.js)."
        )
    resolved = resolve_project_dir(p)
    if resolved:
        p = resolved
    nested_note = ""
    try:
        if resolved and resolved.resolve() != Path(path).resolve():
            nested_note = f" Using nested project folder: {resolved}"
    except OSError:
        if resolved and str(resolved) != str(Path(path)):
            nested_note = f" Using nested project folder: {resolved}"
    eco = find_ecosystem_config(p)
    if eco:
        kind = "provision install" if eco.name.startswith("provision-") else "deployment"
        return (
            True,
            f"PM2 {kind} detected ({eco.name}). "
            "Will use pm2 start with MultiServer-assigned ports."
            + nested_note,
        )
    markers = ["package.json", "app.py", "requirements.txt"]
    if not any((p / m).exists() for m in markers):
        subs = list_deployment_candidates(Path(path))
        if subs:
            lines = "\n".join(f"  • {d}" for d in subs[:10])
            return False, (
                "This folder has no package.json, ecosystem.config.js, "
                "or provision-ecosystem.config.js.\n"
                "Select the live install root (after install-provision.bat), "
                "a working folder, or a deployment subfolder, for example:\n"
                f"{lines}"
            )
        return False, (
            "No package.json, ecosystem.config.js, provision-ecosystem.config.js, "
            "app.py, or requirements.txt found. "
            "Select the live install root after install-provision.bat, "
            "the project working folder, or a deployment subfolder."
        )
    if is_nextjs_distribution(p):
        return (
            True,
            "Distribution / deployment package detected (.next build, no src). "
            "Will use npm run start (production), not dev.",
        )
    if p.name.lower() == "working":
        return True, "OK" + nested_note
    if any(h in p.name.lower() for h in _DEPLOY_DIR_HINTS):
        return True, "Deployment-style folder — OK." + nested_note
    return (
        True,
        "Project root (not a 'working' subfolder). OK for repos like AutoM.System."
        + nested_note,
    )


# Backward-compatible alias
validate_working_dir = validate_project_dir
