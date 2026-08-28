"""Host mode — dedicate the PC to MultiServer by clearing non-essential user apps.

Safety: keep-whitelist for critical Windows + MultiServer/demo trees.
Never kill SYSTEM/Idle cores or NT AUTHORITY\\SYSTEM processes (except optional
service stops behind a separate toggle).
"""

from __future__ import annotations

import getpass
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

try:
    import ctypes
except ImportError:
    ctypes = None  # type: ignore

try:
    import psutil
except ImportError:
    psutil = None  # type: ignore


# Process *names* (lowercase, with or without .exe) that must never be killed.
KEEP_PROCESS_NAMES: frozenset[str] = frozenset(
    {
        # Kernel / session cores
        "system",
        "idle",
        "registry",
        "smss.exe",
        "csrss.exe",
        "wininit.exe",
        "services.exe",
        "lsass.exe",
        "lsaiso.exe",
        "winlogon.exe",
        "fontdrvhost.exe",
        "dwm.exe",
        "svchost.exe",
        "runtimebroker.exe",
        "sihost.exe",
        "taskhostw.exe",
        "ctfmon.exe",
        "conhost.exe",
        "dllhost.exe",
        "wmiadap.exe",
        "wmiprvse.exe",
        "searchindexer.exe",
        "searchprotocolhost.exe",
        "securityhealthservice.exe",
        "securityhealthsystray.exe",
        "msmpeng.exe",
        "nissrv.exe",
        "sgrmbroker.exe",
        "smartscreen.exe",
        # Desktop shell (MultiServer GUI needs this)
        "explorer.exe",
        "startmenuexperiencehost.exe",
        "shellexperiencehost.exe",
        "applicationframehost.exe",
        "textinputhost.exe",
        "systemsettings.exe",
        "searchhost.exe",
        "searchapp.exe",
        # Network / VPN / firewall helpers commonly needed
        "dashost.exe",
        "wlanext.exe",
        "igfxem.exe",
        "igfxtray.exe",
        # MultiServer / demo runtimes
        "python.exe",
        "pythonw.exe",
        "py.exe",
        "node.exe",
        "nodejs.exe",
        "npm.cmd",
        "npm.exe",
        "npx.exe",
        "cmd.exe",
        "powershell.exe",
        "pwsh.exe",
        "pm2.exe",
        "pm2-runtime.exe",
        "ngrok.exe",
        "caddy.exe",
        "cloudflared.exe",
        "git.exe",
        # Cursor / terminal often used while operating MultiServer
        "cursor.exe",
        "code.exe",
        "windowsterminal.exe",
        "openconsole.exe",
    }
)

# Optional services that may be stopped when host_mode_stop_services is ON.
OPTIONAL_STOP_SERVICES: tuple[str, ...] = (
    "SysMain",  # Superfetch
    "WSearch",  # Windows Search indexer
)

# Names we never kill even if they look like user apps
_PROTECTED_USERNAMES = frozenset(
    {
        "nt authority\\system",
        "nt authority\\local service",
        "nt authority\\network service",
        "font driver host\\umfd-0",
        "font driver host\\umfd-1",
    }
)


def _norm_name(name: str | None) -> str:
    return (name or "").strip().lower()


def _name_kept(name: str | None) -> bool:
    bare = _norm_name(name)
    if not bare:
        return True
    if bare in KEEP_PROCESS_NAMES:
        return True
    if f"{bare}.exe" in KEEP_PROCESS_NAMES:
        return True
    if bare.endswith(".exe") and bare[:-4] in {
        n[:-4] if n.endswith(".exe") else n for n in KEEP_PROCESS_NAMES
    }:
        return True
    return False


def is_elevated() -> bool:
    if sys.platform != "win32" or ctypes is None:
        return os.geteuid() == 0 if hasattr(os, "geteuid") else False
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def request_elevation_relaunch() -> bool:
    """Relaunch current MultiServer process elevated (UAC). Returns True if launched."""
    if sys.platform != "win32" or ctypes is None:
        return False
    try:
        params = subprocess.list2cmdline([*sys.argv])
        rc = ctypes.windll.shell32.ShellExecuteW(
            None,
            "runas",
            sys.executable,
            params,
            None,
            1,
        )
        return int(rc) > 32
    except Exception:
        return False


def _tree_pids(root_pid: int) -> set[int]:
    if not psutil or not root_pid:
        return set()
    out: set[int] = {int(root_pid)}
    try:
        parent = psutil.Process(int(root_pid))
        for child in parent.children(recursive=True):
            out.add(child.pid)
    except (psutil.Error, OSError):
        pass
    return out


def collect_keep_pids(process_manager: Any | None = None) -> set[int]:
    """PIDs that must survive cleanup."""
    keep: set[int] = {0, 4, os.getpid()}
    if psutil:
        try:
            keep |= _tree_pids(os.getpid())
        except Exception:
            pass
        # Parent python / launcher
        try:
            parent = psutil.Process(os.getpid()).parent()
            if parent:
                keep |= _tree_pids(parent.pid)
        except (psutil.Error, OSError):
            pass

    if process_manager is not None:
        try:
            for roots in process_manager.all_root_pids().values():
                for pid in roots:
                    keep |= _tree_pids(int(pid))
        except Exception:
            pass
    return keep


def _is_system_account(username: str | None) -> bool:
    u = (username or "").strip().lower()
    if not u:
        return True
    if u in _PROTECTED_USERNAMES:
        return True
    if u.startswith("nt authority\\"):
        return True
    if "\\umfd-" in u:
        return True
    return False


def list_cleanup_candidates(
    process_manager: Any | None = None,
    *,
    current_user: str | None = None,
) -> list[dict[str, Any]]:
    """Return user processes that would be terminated (dry-run)."""
    if not psutil:
        return []
    keep_pids = collect_keep_pids(process_manager)
    user = (current_user or getpass.getuser() or "").lower()
    candidates: list[dict[str, Any]] = []

    for proc in psutil.process_iter(["pid", "name", "username"]):
        try:
            info = proc.info
            pid = int(info.get("pid") or 0)
            if pid in keep_pids or pid <= 4:
                continue
            if _name_kept(info.get("name")):
                continue
            uname = info.get("username")
            if _is_system_account(uname):
                continue
            # Only current interactive user session apps
            if user and uname and user not in str(uname).lower():
                continue
            candidates.append(
                {
                    "pid": pid,
                    "name": info.get("name") or "?",
                    "username": uname,
                }
            )
        except (psutil.Error, OSError):
            continue
    return candidates


def run_cleanup(
    process_manager: Any | None = None,
    *,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Terminate eligible user apps. Returns summary."""
    candidates = list_cleanup_candidates(process_manager)
    killed: list[dict[str, Any]] = []
    errors: list[str] = []

    if dry_run or not psutil:
        return {
            "killed": [],
            "candidates": candidates,
            "errors": errors if psutil else ["psutil not available"],
            "dry_run": True,
        }

    for entry in candidates:
        pid = entry["pid"]
        try:
            proc = psutil.Process(pid)
            proc.terminate()
            try:
                proc.wait(timeout=2.0)
            except psutil.TimeoutExpired:
                proc.kill()
            killed.append(entry)
        except (psutil.Error, OSError) as exc:
            errors.append(f"{entry.get('name')} ({pid}): {exc}")

    return {
        "killed": killed,
        "candidates": candidates,
        "errors": errors,
        "dry_run": False,
    }


def boost_priorities(process_manager: Any | None = None) -> int:
    """Raise MultiServer + demo trees to high priority. Returns count updated."""
    if not psutil or sys.platform != "win32":
        return 0
    # Windows HIGH_PRIORITY_CLASS ≈ psutil.HIGH_PRIORITY_CLASS if present
    high = getattr(psutil, "HIGH_PRIORITY_CLASS", None)
    if high is None:
        high = -10  # Unix nice fallback; ignored on Windows if wrong type

    boost_set = _tree_pids(os.getpid())
    if process_manager is not None:
        for roots in process_manager.all_root_pids().values():
            for pid in roots:
                boost_set |= _tree_pids(int(pid))

    updated = 0
    for pid in boost_set:
        if pid <= 4:
            continue
        try:
            p = psutil.Process(pid)
            p.nice(high)
            updated += 1
        except (psutil.Error, OSError, ValueError):
            continue
    return updated


def reset_priorities(process_manager: Any | None = None) -> int:
    """Reset MultiServer + demo trees to normal priority."""
    if not psutil or sys.platform != "win32":
        return 0
    normal = getattr(psutil, "NORMAL_PRIORITY_CLASS", None)
    if normal is None:
        normal = 0
    boost_set = _tree_pids(os.getpid())
    if process_manager is not None:
        for roots in process_manager.all_root_pids().values():
            for pid in roots:
                boost_set |= _tree_pids(int(pid))
    updated = 0
    for pid in boost_set:
        if pid <= 4:
            continue
        try:
            psutil.Process(pid).nice(normal)
            updated += 1
        except (psutil.Error, OSError, ValueError):
            continue
    return updated


def stop_optional_services() -> dict[str, Any]:
    """Stop SysMain / WSearch if elevated. Best-effort."""
    stopped: list[str] = []
    errors: list[str] = []
    if sys.platform != "win32":
        return {"stopped": stopped, "errors": ["Windows only"]}
    if not is_elevated():
        return {"stopped": stopped, "errors": ["Elevation required to stop services"]}
    for name in OPTIONAL_STOP_SERVICES:
        try:
            r = subprocess.run(
                ["sc", "stop", name],
                capture_output=True,
                text=True,
                timeout=15,
                check=False,
            )
            if r.returncode == 0 or "STOP_PENDING" in (r.stdout or "").upper() or "STOP_PENDING" in (
                r.stderr or ""
            ).upper():
                stopped.append(name)
            elif "1062" in (r.stdout or "") + (r.stderr or ""):
                # already stopped
                stopped.append(name)
            else:
                errors.append(
                    f"{name}: {(r.stderr or r.stdout or 'failed').strip()[:200]}"
                )
        except Exception as exc:
            errors.append(f"{name}: {exc}")
    return {"stopped": stopped, "errors": errors}


def run_host_mode_pass(
    process_manager: Any | None = None,
    *,
    stop_services: bool = False,
) -> dict[str, Any]:
    """Full Host mode pass: cleanup + boost (+ optional services)."""
    cleanup = run_cleanup(process_manager, dry_run=False)
    boosted = boost_priorities(process_manager)
    services: dict[str, Any] = {"stopped": [], "errors": []}
    if stop_services:
        services = stop_optional_services()
    return {
        "killed_count": len(cleanup.get("killed") or []),
        "killed": cleanup.get("killed") or [],
        "errors": list(cleanup.get("errors") or []) + list(services.get("errors") or []),
        "boosted": boosted,
        "services_stopped": services.get("stopped") or [],
    }


def elevate_cleanup_helper(
    script_path: Path,
    *,
    pids_file: Path | None = None,
) -> bool:
    """Spawn elevated PowerShell helper for cleanup (optional path)."""
    if sys.platform != "win32" or not script_path.is_file():
        return False
    args = f'-ExecutionPolicy Bypass -File "{script_path}"'
    if pids_file:
        args += f' -KeepPidsFile "{pids_file}"'
    try:
        cmd = (
            f'Start-Process powershell.exe -ArgumentList \'{args}\' -Verb RunAs -Wait'
        )
        subprocess.run(
            ["powershell", "-NoProfile", "-Command", cmd],
            check=False,
            timeout=120,
        )
        return True
    except Exception:
        return False
