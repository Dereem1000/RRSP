"""Start, stop, and monitor demo server processes."""

from __future__ import annotations

import os
import json
import socket
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

try:
    import psutil
except ImportError:
    psutil = None  # type: ignore


LogCallback = Callable[[str, str], None]


@dataclass
class RunningProcess:
    system_id: str
    popen: subprocess.Popen
    command: str
    working_dir: str
    ports: list[int] = field(default_factory=list)
    log_file: Path | None = None
    ngrok_popen: subprocess.Popen | None = None
    ngrok_inspector_port: int | None = None


STATUS_PROBE_TIMEOUT = 0.25


def _pick_default_npm_script(working: Path) -> str:
    pkg_path = working / "package.json"
    if not pkg_path.is_file():
        return "dev"
    try:
        pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return "dev"
    scripts = pkg.get("scripts") or {}
    if not isinstance(scripts, dict):
        return "dev"
    if "dev" in scripts:
        return "dev"
    if "start" in scripts:
        return "start"
    return "dev"


def resolve_probe_host(host: str) -> str:
    if host in ("localhost", "0.0.0.0", ""):
        return "127.0.0.1"
    return host


def is_port_open(host: str, port: int, timeout: float = STATUS_PROBE_TIMEOUT) -> bool:
    if not port:
        return False
    candidates = [resolve_probe_host(host)]
    if resolve_probe_host(host) == "127.0.0.1":
        candidates.append("localhost")
    seen: set[tuple] = set()
    for name in candidates:
        try:
            for res in socket.getaddrinfo(name, port, 0, socket.SOCK_STREAM):
                addr = res[4]
                if addr in seen:
                    continue
                seen.add(addr)
                af, socktype, proto, _canon, sa = res
                try:
                    with socket.socket(af, socktype, proto) as sock:
                        sock.settimeout(timeout)
                        if sock.connect_ex(sa) == 0:
                            return True
                except OSError:
                    continue
        except OSError:
            continue
    return False


def any_port_open(host: str, ports: list[int]) -> bool:
    return any(is_port_open(host, p) for p in ports if p)


def kill_process_tree(pid: int) -> None:
    if psutil:
        try:
            proc = psutil.Process(pid)
            for child in proc.children(recursive=True):
                try:
                    child.kill()
                except psutil.Error:
                    pass
            proc.kill()
            return
        except psutil.Error:
            pass
    if sys.platform == "win32":
        subprocess.run(
            ["taskkill", "/PID", str(pid), "/T", "/F"],
            capture_output=True,
            check=False,
        )
    else:
        try:
            os.kill(pid, 9)
        except OSError:
            pass


class ProcessManager:
    def __init__(self, log_dir: Path, on_log: LogCallback | None = None) -> None:
        self.log_dir = log_dir
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.on_log = on_log
        self._running: dict[str, RunningProcess] = {}

    def _emit(self, system_id: str, message: str) -> None:
        if self.on_log:
            self.on_log(system_id, message)

    def is_running(self, system_id: str) -> bool:
        proc = self._running.get(system_id)
        if not proc:
            return False
        if proc.popen.poll() is None:
            return True
        # Launcher parent may exit while node/concurrently children keep running
        if any_port_open("127.0.0.1", proc.ports):
            return True
        self._running.pop(system_id, None)
        return False

    def build_command(
        self, system: dict, settings: dict | None = None
    ) -> tuple[list[str], dict[str, str]]:
        working = Path(system["working_dir"])
        stack = system.get("type") or "auto"
        if stack == "auto":
            from .detectors import detect_stack

            stack = detect_stack(working)

        custom = (system.get("command") or "").strip()
        env = os.environ.copy()
        client_port = str(system.get("client_port") or 8100)
        server_port = str(system.get("server_port") or 8101)
        demo_port = str(system.get("demo_port") or client_port)

        env["BROWSER"] = "none"
        env["MULTISERVER"] = "1"

        if custom:
            if sys.platform == "win32":
                return ["cmd", "/c", custom], env
            return ["sh", "-c", custom], env

        from .launchers import has_cra_production_build, write_cra_build_launcher
        from .urls import public_demo_paths

        if has_cra_production_build(working):
            env["PORT"] = server_port
            env["CLIENT_PORT"] = client_port
            if settings and system.get("include_public_path", True):
                public_base, _ = public_demo_paths(settings, system)
                env["MULTISERVER_PUBLIC_BASE"] = public_base
            launch = write_cra_build_launcher(
                working, int(client_port), int(server_port)
            )
            return ["cmd", "/c", str(launch)], env

        if stack == "python-flask":
            from .runners import write_flask_launcher
            from .urls import public_demo_paths

            port = int(demo_port or server_port)
            env["PORT"] = str(port)
            env["FLASK_RUN_PORT"] = str(port)
            env["PYTHONUTF8"] = "1"
            env["PYTHONIOENCODING"] = "utf-8"
            env["DEV_MODE"] = "1"
            env["FLASK_ENV"] = "development"
            public_base, _ = public_demo_paths(settings, system)
            script_name = public_base.rstrip("/")
            env["MULTISERVER_SCRIPT_NAME"] = script_name
            launch = write_flask_launcher(working, port, script_name)
            return ["cmd", "/c", str(launch)], env

        if stack == "nextjs-dist":
            from .runners import write_nextjs_dist_launcher

            env["PORT"] = demo_port
            env["NODE_ENV"] = "production"
            launch = write_nextjs_dist_launcher(working, int(demo_port))
            return ["cmd", "/c", str(launch)], env

        if stack == "nextjs":
            from .runners import write_nextjs_dev_launcher

            env["PORT"] = demo_port
            launch = write_nextjs_dev_launcher(working, int(demo_port))
            return ["cmd", "/c", str(launch)], env

        if stack == "nodejs-split":
            from .launchers import build_nodejs_split_command
            from .urls import public_demo_paths

            env["PORT"] = server_port
            env["CLIENT_PORT"] = client_port
            env["REACT_APP_API_URL"] = f"http://localhost:{server_port}"
            env["REACT_APP_SERVER_PORT"] = server_port
            env["MULTISERVER_CLIENT_PORT"] = client_port
            env["MULTISERVER_SERVER_PORT"] = server_port

            public_base = None
            public_api = None
            if settings and system.get("include_public_path", True):
                public_base, public_api = public_demo_paths(settings, system)
                env["MULTISERVER_PUBLIC_BASE"] = public_base

            return build_nodejs_split_command(
                working,
                int(client_port),
                int(server_port),
                public_base_path=public_base,
                public_api_path=public_api,
            ), env

        if stack == "pm2-ecosystem":
            from .detectors import detect_pm2_ports
            from .runners import find_pm2, write_pm2_launcher

            if not find_pm2():
                raise FileNotFoundError(
                    "PM2 not found. Install with: npm install -g pm2 "
                    "Then restart MultiServer."
                )
            detected = detect_pm2_ports(working)
            extra = system.get("extra_ports") or []
            vault_port = int(extra[0]) if extra else detected.get("vault_port")
            launch, _app_names = write_pm2_launcher(
                working,
                system.get("id") or "demo",
                int(server_port or demo_port),
                int(vault_port) if vault_port else None,
                detected_server=int(detected.get("detected_server") or server_port),
                detected_vault=detected.get("detected_vault"),
            )
            return ["cmd", "/c", str(launch)], env

        from .runners import npm_command

        env["PORT"] = demo_port
        script = _pick_default_npm_script(working)
        return npm_command("run", script), env

    def start(
        self,
        system: dict,
        systems: list[dict] | None = None,
        settings: dict | None = None,
    ) -> tuple[bool, str]:
        system_id = system["id"]
        if self.is_running(system_id):
            return False, "Already running."

        working = Path(system["working_dir"])
        if not working.is_dir():
            return False, f"Working directory not found: {working}"

        from .ports import validate_system_ports

        host = (settings or {}).get("host") or "127.0.0.1"
        if host in ("localhost", "0.0.0.0"):
            bind_host = "127.0.0.1"
        else:
            bind_host = host
        issues = validate_system_ports(
            system, systems or [], settings, host=bind_host, check_bind=True
        )
        if issues:
            return False, "Port conflict:\n" + "\n".join(f"  • {i}" for i in issues[:6])

        try:
            command, env = self.build_command(system, settings=settings)
        except FileNotFoundError as exc:
            return False, str(exc)

        from .runners import augment_path_env

        stack = system.get("type") or "auto"
        if stack == "auto":
            from .detectors import detect_stack

            stack = detect_stack(working)
        if stack == "pm2-ecosystem":
            env = augment_path_env(env)

        log_path = self.log_dir / f"{system_id}.log"
        cmd_display = " ".join(command)
        launcher = working / ".multiserver" / "launch.bat"
        if launcher.is_file():
            cmd_display = str(launcher)
        self._emit(system_id, f"Starting: {cmd_display}")
        self._emit(system_id, f"Directory: {working}")

        creationflags = 0
        if sys.platform == "win32":
            creationflags = subprocess.CREATE_NEW_PROCESS_GROUP

        try:
            log_handle = open(log_path, "a", encoding="utf-8", errors="replace")
            if log_path.stat().st_size == 0:
                log_handle.write(
                    f"--- MultiServer log {time.strftime('%Y-%m-%d %H:%M:%S')} ---\n"
                )
            popen = subprocess.Popen(
                command,
                cwd=str(working),
                env=env,
                stdout=log_handle,
                stderr=subprocess.STDOUT,
                creationflags=creationflags,
                shell=False,
            )
        except FileNotFoundError as exc:
            return False, f"Failed to start process: {exc}"
        except OSError as exc:
            return False, f"Failed to start process: {exc}"

        ports = [system.get("demo_port"), system.get("client_port"), system.get("server_port")]
        extra = system.get("extra_ports") or []
        all_ports = [int(p) for p in (*ports, *extra) if p]

        self._running[system_id] = RunningProcess(
            system_id=system_id,
            popen=popen,
            command=" ".join(command),
            working_dir=str(working),
            ports=all_ports,
            log_file=log_path,
        )
        return True, f"Started (PID {popen.pid}). Logs: {log_path}"

    def ensure_ngrok_started(
        self,
        system_id: str,
        system: dict,
        settings: dict | None = None,
    ) -> tuple[bool, str]:
        """Start ngrok after the demo port is ready (idempotent)."""
        if not system.get("ngrok_enabled"):
            return False, "Ngrok not enabled."
        proc = self._running.get(system_id)
        if not proc:
            return False, "System not running."
        if proc.ngrok_popen and proc.ngrok_popen.poll() is None:
            return True, "Ngrok already running."
        if not proc.log_file:
            return False, "Log file missing."
        try:
            self._start_ngrok(system_id, system, settings, proc, proc.log_file)
        except OSError as exc:
            return False, f"Ngrok failed to start: {exc}"
        return True, "Ngrok started."

    def _allocate_inspector_port(self, settings: dict | None) -> int:
        start = int((settings or {}).get("ngrok_inspector_port_start") or 4040)
        used = {
            proc.ngrok_inspector_port
            for proc in self._running.values()
            if proc.ngrok_inspector_port
        }
        for port in range(start, start + 100):
            if port not in used:
                return port
        return start

    def _start_ngrok(
        self,
        system_id: str,
        system: dict,
        settings: dict | None,
        proc: RunningProcess,
        log_path: Path,
    ) -> None:
        from .ngrok import effective_inspector_port, write_ngrok_launcher

        working = Path(system["working_dir"])
        demo_port = int(system.get("demo_port") or system.get("client_port") or 8100)
        requested_inspector = self._allocate_inspector_port(settings)
        inspector_port = effective_inspector_port(requested_inspector)
        launch = write_ngrok_launcher(
            working, demo_port, inspector_port, system, settings
        )

        creationflags = 0
        if sys.platform == "win32":
            creationflags = subprocess.CREATE_NEW_PROCESS_GROUP

        log_handle = open(log_path, "a", encoding="utf-8", errors="replace")
        log_handle.write(
            f"\n--- ngrok tunnel {time.strftime('%Y-%m-%d %H:%M:%S')} ---\n"
        )
        ngrok_popen = subprocess.Popen(
            ["cmd", "/c", str(launch)],
            cwd=str(working),
            env=os.environ.copy(),
            stdout=log_handle,
            stderr=subprocess.STDOUT,
            creationflags=creationflags,
            shell=False,
        )
        proc.ngrok_popen = ngrok_popen
        proc.ngrok_inspector_port = inspector_port
        self._emit(
            system_id,
            f"Ngrok tunnel starting on port {demo_port} "
            f"(inspector http://127.0.0.1:{inspector_port})",
        )

    def _kill_ports(self, ports: list[int]) -> None:
        if not psutil or not ports:
            return
        wanted = set(ports)
        for conn in psutil.net_connections(kind="inet"):
            try:
                if not conn.laddr or conn.laddr.port not in wanted:
                    continue
                if conn.status != psutil.CONN_LISTEN:
                    continue
                if conn.pid:
                    kill_process_tree(conn.pid)
            except (psutil.Error, AttributeError):
                continue

    def stop(self, system_id: str) -> tuple[bool, str]:
        proc = self._running.get(system_id)
        if not proc:
            return False, "Not running."
        try:
            working = Path(proc.working_dir)
            if (working / ".multiserver" / "pm2-app-names.json").is_file():
                from .runners import pm2_stop_apps

                pm2_stop_apps(working)
            if proc.popen.poll() is None:
                kill_process_tree(proc.popen.pid)
            else:
                self._kill_ports(proc.ports)
            if proc.ngrok_popen and proc.ngrok_popen.poll() is None:
                kill_process_tree(proc.ngrok_popen.pid)
        except Exception as exc:
            return False, f"Stop failed: {exc}"
        finally:
            self._running.pop(system_id, None)
        return True, "Stopped."

    def stop_all(self) -> None:
        for system_id in list(self._running.keys()):
            self.stop(system_id)

    def ngrok_public_url(self, system_id: str) -> str | None:
        proc = self._running.get(system_id)
        if not proc or not proc.ngrok_inspector_port:
            return None
        from .ngrok import fetch_public_url

        return fetch_public_url(proc.ngrok_inspector_port)

    def ngrok_inspector_port(self, system_id: str) -> int | None:
        proc = self._running.get(system_id)
        if proc:
            return proc.ngrok_inspector_port
        return None

    def wait_for_ngrok_public_url(
        self, system_id: str, timeout: float = 120.0
    ) -> str | None:
        from .ngrok import (
            effective_inspector_port,
            fetch_public_url,
            ngrok_error_from_log,
            parse_public_url_from_log,
            wait_for_public_url,
        )

        deadline = time.time() + timeout
        inspector_port: int | None = None
        while time.time() < deadline:
            proc = self._running.get(system_id)
            if not proc:
                return None
            if proc.ngrok_inspector_port:
                inspector_port = effective_inspector_port(proc.ngrok_inspector_port)
                break
            if proc.ngrok_popen and proc.ngrok_popen.poll() is not None:
                if proc.log_file:
                    err = ngrok_error_from_log(proc.log_file)
                    if err:
                        self._emit(system_id, f"Ngrok error: {err}")
                    url = parse_public_url_from_log(proc.log_file)
                    if url:
                        return url
                return None
            time.sleep(0.5)

        if not inspector_port:
            return None

        remaining = max(0.0, deadline - time.time())
        proc = self._running.get(system_id)
        log_path = proc.log_file if proc else None
        public = wait_for_public_url(
            inspector_port,
            timeout=remaining,
            log_path=log_path,
        )
        if public:
            return public
        if proc and proc.ngrok_popen and proc.ngrok_popen.poll() is not None and log_path:
            err = ngrok_error_from_log(log_path)
            if err:
                self._emit(system_id, f"Ngrok error: {err}")
        return None

    def wait_for_ports(
        self, system_id: str, host: str = "127.0.0.1", timeout: float = 90.0
    ) -> dict[int, bool]:
        proc = self._running.get(system_id)
        if not proc:
            return {}
        deadline = time.time() + timeout
        result = {p: False for p in proc.ports}
        while time.time() < deadline:
            for port in proc.ports:
                if not result[port] and is_port_open(host, port):
                    result[port] = True
            if all(result.values()) or not result:
                break
            time.sleep(0.8)
        return result

    def status_text(self, system: dict, host: str = "127.0.0.1") -> str:
        system_id = system["id"]
        probe = resolve_probe_host(host)
        running = self.is_running(system_id)
        demo_port = int(system.get("demo_port") or 8100)
        client_port = int(system.get("client_port") or demo_port)
        server_port = int(system.get("server_port") or 0)
        stack = system.get("type") or ""

        ui_ports = list({demo_port, client_port})
        ui_up = any_port_open(probe, ui_ports)
        server_up = bool(server_port and is_port_open(probe, server_port))
        split = stack == "nodejs-split"
        server_only = False
        if split and server_port and server_port not in ui_ports:
            from .detectors import has_split_client_package

            server_only = not has_split_client_package(
                Path(system.get("working_dir") or "")
            )

        if ui_up or (server_only and server_up):
            return "Running"
        if running and split and server_up:
            return "Starting (API ready)"
        if running:
            return "Starting…"
        if ui_up or server_up:
            busy = []
            if ui_up:
                busy.extend(str(p) for p in ui_ports)
            if server_up and server_port:
                busy.append(str(server_port))
            ports_label = ", ".join(dict.fromkeys(busy))
            return f"Port in use ({ports_label})"
        return "Stopped"
