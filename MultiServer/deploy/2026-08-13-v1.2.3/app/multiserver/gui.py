"""Modern CustomTkinter GUI for MultiServer."""

from __future__ import annotations

import threading
import tkinter as tk
import webbrowser
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

import customtkinter as ctk

from . import __version__
from .config import ConfigStore, DEFAULT_SYSTEM
from .detectors import (
    STACK_TYPES,
    analyze_working_dir,
    resolve_project_dir,
    validate_working_dir,
)
from .gui_theme import COLORS, apply_app_theme, load_level_color
from .host_mode import (
    is_elevated,
    request_elevation_relaunch,
    reset_priorities,
    run_host_mode_pass,
)
from .mini_apply import apply_local_deploy_folder
from .mini_client import (
    apply_remote_update,
    check_for_updates,
    refresh_connection,
    register_with_mini,
)
from .mini_config import DEFAULT_MINI_BASE_URL, resource_thresholds
from .mini_public_url import resolve_public_base_url
from .mini_routes import MiniRouteContext
from .ngrok import find_project_ngrok_bat, ngrok_status_line, parse_ngrok_port_from_bat
from .ports import (
    PortAllocationError,
    allocate_ports,
    manager_port,
    reassign_all_systems,
    validate_system_ports,
)
from .process_manager import ProcessManager
from .resources import HostSnapshot, ResourceMonitor, format_bytes, format_cpu
from .status_server import StatusServer
from .urls import (
    caddy_full_config,
    caddy_snippet,
    demo_local_url,
    demo_public_url,
    export_manifest_json,
    nginx_snippet,
)


def _preserves_path(root: Path) -> Path | None:
    for candidate in (
        root / "distributions" / "update-preserves.json",
        root / "update-preserves.json",
    ):
        if candidate.is_file():
            return candidate
    return None


class SystemDialog(ctk.CTkToplevel):
    def __init__(
        self,
        parent,
        title: str,
        initial: dict | None = None,
        *,
        all_systems: list | None = None,
        settings: dict | None = None,
        edit_id: str | None = None,
    ) -> None:
        super().__init__(parent)
        self.title(title)
        self.resizable(True, True)
        self.result: dict | None = None
        self.geometry("640x620")
        self.transient(parent)
        self.grab_set()

        self.all_systems = all_systems or []
        self.settings = settings or {}
        self.edit_id = edit_id

        data = {**DEFAULT_SYSTEM, **(initial or {})}
        self.vars = {
            "name": tk.StringVar(value=data.get("name", "")),
            "slug": tk.StringVar(value=data.get("slug", "")),
            "working_dir": tk.StringVar(value=data.get("working_dir", "")),
            "type": tk.StringVar(value=data.get("type", "auto")),
            "client_port": tk.StringVar(value=str(data.get("client_port", 8100))),
            "server_port": tk.StringVar(value=str(data.get("server_port", 8101))),
            "demo_port": tk.StringVar(value=str(data.get("demo_port", 8100))),
            "extra_ports": tk.StringVar(
                value=",".join(str(p) for p in (data.get("extra_ports") or []))
            ),
            "command": tk.StringVar(value=data.get("command", "")),
            "notes": tk.StringVar(value=data.get("notes", "")),
            "ngrok_bat": tk.StringVar(value=data.get("ngrok_bat", "")),
        }
        self.ngrok_enabled = tk.BooleanVar(value=bool(data.get("ngrok_enabled")))

        frame = ctk.CTkScrollableFrame(self)
        frame.pack(fill=tk.BOTH, expand=True, padx=12, pady=12)

        rows = [
            ("Display name", "name"),
            ("URL slug (for /demo/<slug>)", "slug"),
            ("Project folder", "working_dir"),
            ("Stack type", "type"),
            ("Client / UI port", "client_port"),
            ("API / server port", "server_port"),
            ("Demo port (link opens this)", "demo_port"),
            ("Extra ports (comma-separated)", "extra_ports"),
            ("Custom start command (optional)", "command"),
            ("Ngrok bat override (optional)", "ngrok_bat"),
            ("Notes", "notes"),
        ]

        for label, key in rows:
            ctk.CTkLabel(frame, text=label, text_color=COLORS["muted"]).pack(
                anchor=tk.W, pady=(8, 2)
            )
            if key == "working_dir":
                sub = ctk.CTkFrame(frame, fg_color="transparent")
                sub.pack(fill=tk.X)
                ctk.CTkEntry(sub, textvariable=self.vars[key]).pack(
                    side=tk.LEFT, fill=tk.X, expand=True
                )
                ctk.CTkButton(sub, text="Browse…", width=80, command=self._browse).pack(
                    side=tk.LEFT, padx=(6, 0)
                )
                ctk.CTkButton(
                    sub, text="Auto-detect", width=100, command=self._autodetect
                ).pack(side=tk.LEFT, padx=(6, 0))
                ctk.CTkButton(
                    sub, text="Assign ports", width=100, command=self._assign_ports
                ).pack(side=tk.LEFT, padx=(6, 0))
            elif key == "type":
                ctk.CTkOptionMenu(
                    frame, variable=self.vars[key], values=list(STACK_TYPES)
                ).pack(fill=tk.X)
            elif key == "ngrok_bat":
                sub = ctk.CTkFrame(frame, fg_color="transparent")
                sub.pack(fill=tk.X)
                ctk.CTkEntry(sub, textvariable=self.vars[key]).pack(
                    side=tk.LEFT, fill=tk.X, expand=True
                )
                ctk.CTkButton(
                    sub, text="Browse…", width=80, command=self._browse_ngrok_bat
                ).pack(side=tk.LEFT, padx=(6, 0))
            else:
                ctk.CTkEntry(frame, textvariable=self.vars[key]).pack(fill=tk.X)

        ctk.CTkCheckBox(
            frame,
            text="Start ngrok tunnel with this system",
            variable=self.ngrok_enabled,
            command=self._refresh_ngrok_hint,
        ).pack(anchor=tk.W, pady=(12, 4))
        self.ngrok_hint = ctk.CTkLabel(
            frame, text="", wraplength=560, text_color=COLORS["muted"], justify=tk.LEFT
        )
        self.ngrok_hint.pack(anchor=tk.W)

        btns = ctk.CTkFrame(self, fg_color="transparent")
        btns.pack(fill=tk.X, padx=12, pady=12)
        ctk.CTkButton(btns, text="Cancel", width=100, command=self.destroy).pack(
            side=tk.RIGHT, padx=4
        )
        ctk.CTkButton(btns, text="Save", width=100, command=self._save).pack(
            side=tk.RIGHT
        )

        self.bind("<Escape>", lambda _e: self.destroy())
        self._refresh_ngrok_hint()
        self.wait_window()

    def _browse_ngrok_bat(self) -> None:
        path = filedialog.askopenfilename(
            title="Select ngrok starter script",
            filetypes=[("Batch files", "*.bat"), ("All files", "*.*")],
            initialdir=self.vars["working_dir"].get().strip() or None,
        )
        if path:
            self.vars["ngrok_bat"].set(path)
            self._refresh_ngrok_hint()

    def _refresh_ngrok_hint(self) -> None:
        path = self.vars["working_dir"].get().strip()
        custom = self.vars["ngrok_bat"].get().strip()
        if not path:
            self.ngrok_hint.configure(text="")
            return
        working = Path(path)
        bat_name = (self.settings or {}).get("ngrok_bat_name") or "start-ngrok.bat"
        found = find_project_ngrok_bat(working, self.settings)
        parts = [
            f"Looks for {bat_name} in the project root. "
            "MultiServer tunnels the demo port — not hardcoded ports in project bats."
        ]
        if found:
            wrong = parse_ngrok_port_from_bat(found)
            demo = self.vars["demo_port"].get().strip()
            try:
                demo_int = int(demo) if demo else None
            except ValueError:
                demo_int = None
            if wrong and demo_int and wrong != demo_int:
                parts.append(
                    f"Found {found.name} (tunnels port {wrong}); "
                    f"MultiServer will use demo port {demo_int}."
                )
            else:
                parts.append(f"Found {found.name}.")
        elif custom:
            parts.append(f"Custom script: {custom}")
        else:
            parts.append("No project ngrok script — built-in ngrok http <demo port>.")
        self.ngrok_hint.configure(text=" ".join(parts))

    def _browse(self) -> None:
        path = filedialog.askdirectory(
            title="Select project folder (working subfolder or app root)"
        )
        if path:
            self.vars["working_dir"].set(path)
            self._autodetect()

    def _autodetect(self) -> None:
        path = self.vars["working_dir"].get().strip()
        if not path:
            return
        ok, msg = validate_working_dir(path)
        if not ok:
            messagebox.showwarning("Auto-detect", msg, parent=self)
            return
        try:
            info = analyze_working_dir(
                path,
                systems=self.all_systems,
                settings=self.settings,
                exclude_id=self.edit_id,
                allocate=True,
            )
        except PortAllocationError as exc:
            messagebox.showerror("Auto-detect", str(exc), parent=self)
            return
        resolved = info.get("resolved_dir") or path
        if resolved != path:
            path = resolved
            self.vars["working_dir"].set(path)
        if not self.vars["name"].get().strip():
            self.vars["name"].set(info["name"])
        if not self.vars["slug"].get().strip():
            self.vars["slug"].set(info["slug"])
        self.vars["type"].set(info["type"])
        self.vars["client_port"].set(str(info["client_port"]))
        self.vars["server_port"].set(str(info["server_port"]))
        self.vars["demo_port"].set(str(info["demo_port"]))
        if info.get("extra_ports"):
            self.vars["extra_ports"].set(
                ",".join(str(p) for p in info["extra_ports"])
            )
        found = find_project_ngrok_bat(Path(path), self.settings)
        if found and not self.edit_id:
            self.ngrok_enabled.set(True)
        self._refresh_ngrok_hint()
        det = info.get("detected_ports") or {}
        extra = (
            f"\n\nApp defaults: UI={det.get('client_port')}, API={det.get('server_port')} "
            f"(not used — avoids clashes)."
        )
        messagebox.showinfo(
            "Auto-detect",
            (msg if msg != "OK" else f"Assigned ports {info['demo_port']} / {info['server_port']}.")
            + extra,
            parent=self,
        )

    def _assign_ports(self) -> None:
        path = self.vars["working_dir"].get().strip()
        stack = self.vars["type"].get() or "auto"
        if path and stack == "auto":
            from .detectors import detect_stack

            stack = detect_stack(Path(path))
        try:
            alloc = allocate_ports(
                self.all_systems,
                self.settings,
                stack=stack,
                exclude_id=self.edit_id,
            )
        except PortAllocationError as exc:
            messagebox.showerror("Assign ports", str(exc), parent=self)
            return
        self.vars["client_port"].set(str(alloc["client_port"]))
        self.vars["server_port"].set(str(alloc["server_port"]))
        self.vars["demo_port"].set(str(alloc["demo_port"]))
        self._refresh_ngrok_hint()

    def _save(self) -> None:
        path = self.vars["working_dir"].get().strip()
        if not self.vars["name"].get().strip():
            messagebox.showerror("Validation", "Name is required.", parent=self)
            return
        if not path:
            messagebox.showerror("Validation", "Working folder is required.", parent=self)
            return
        ok, msg = validate_working_dir(path)
        if not ok:
            messagebox.showerror("Validation", msg, parent=self)
            return
        resolved = resolve_project_dir(path)
        if resolved:
            path = str(resolved)
            self.vars["working_dir"].set(path)
        try:
            extra = [
                int(p.strip())
                for p in self.vars["extra_ports"].get().split(",")
                if p.strip()
            ]
            client_port = int(self.vars["client_port"].get())
            server_port = int(self.vars["server_port"].get())
            demo_port = int(self.vars["demo_port"].get())
        except ValueError:
            messagebox.showerror("Validation", "Ports must be numbers.", parent=self)
            return

        draft = {
            "id": self.edit_id or "",
            "name": self.vars["name"].get().strip(),
            "slug": self.vars["slug"].get().strip() or "demo",
            "working_dir": path,
            "type": self.vars["type"].get(),
            "client_port": client_port,
            "server_port": server_port,
            "demo_port": demo_port,
            "extra_ports": extra,
            "command": self.vars["command"].get().strip(),
            "notes": self.vars["notes"].get().strip(),
            "ngrok_enabled": bool(self.ngrok_enabled.get()),
            "ngrok_bat": self.vars["ngrok_bat"].get().strip(),
        }
        port_issues = validate_system_ports(
            draft, self.all_systems, self.settings, check_bind=True
        )
        if port_issues:
            if not messagebox.askyesno(
                "Port warnings",
                "Port issues detected:\n\n"
                + "\n".join(f"• {i}" for i in port_issues[:8])
                + "\n\nSave anyway?",
                parent=self,
            ):
                return

        self.result = {
            "name": self.vars["name"].get().strip(),
            "slug": self.vars["slug"].get().strip() or "demo",
            "working_dir": path,
            "type": self.vars["type"].get(),
            "client_port": client_port,
            "server_port": server_port,
            "demo_port": demo_port,
            "extra_ports": extra,
            "command": self.vars["command"].get().strip(),
            "notes": self.vars["notes"].get().strip(),
            "ngrok_enabled": bool(self.ngrok_enabled.get()),
            "ngrok_bat": self.vars["ngrok_bat"].get().strip(),
        }
        self.destroy()


class MultiServerApp:
    def __init__(self, config_path: Path, log_dir: Path) -> None:
        apply_app_theme()
        self.config_path = config_path
        self.install_root = config_path.parent
        self.store = ConfigStore(config_path)
        self.root = ctk.CTk()
        self.root.title(f"MultiServer v{__version__} — Demo Host Manager")
        self.root.geometry("1280x780")
        self.root.minsize(1000, 640)
        self.root.configure(fg_color=COLORS["bg"])

        self.processes = ProcessManager(log_dir, on_log=self._on_process_log)
        self.resources = ResourceMonitor()
        self._resource_snap: HostSnapshot = HostSnapshot()
        self._log_filter = tk.StringVar(value="All")

        self._mini_ctx = MiniRouteContext(
            get_mini=lambda: self.store.mini,
            save_mini=lambda m: self.store.replace_mini(m),
            install_root=self.install_root,
            preserves_path=_preserves_path(self.install_root),
            get_resources=lambda: self._resource_snap.to_dict(),
        )
        bind_host = (
            "0.0.0.0"
            if self.store.mini.get("bind_public")
            else "127.0.0.1"
        )
        self.status_server = StatusServer(
            manager_port(self.store.settings),
            manifest_provider=self._live_manifest_json,
            host=bind_host,
            mini_context=self._mini_ctx,
        )
        self._status_job: str | None = None
        self._selected_id: str | None = None
        self._refreshing = False
        self._status_cache: dict[str, str] = {}
        self._poll_inflight = False
        self._pending_update: dict | None = None
        self._host_mode_job: str | None = None
        self._host_mode_inflight = False

        self._build_ui()
        self._refresh_list(refresh_detail=True)
        self._schedule_status_poll()
        self._schedule_auto_update()
        self._schedule_host_mode()
        self._start_status_server()
        if self.store.settings.get("host_mode_enabled"):
            self.root.after(1500, lambda: self._host_mode_tick(force=True))
            self.statusbar.configure(text="Host mode ON")
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def _schedule_host_mode(self) -> None:
        self._host_mode_tick()
        self._host_mode_job = self.root.after(60_000, self._schedule_host_mode)

    def _host_mode_tick(self, *, force: bool = False) -> None:
        if not self.store.settings.get("host_mode_enabled"):
            return
        if self._host_mode_inflight and not force:
            return
        self._host_mode_inflight = True
        stop_services = bool(self.store.settings.get("host_mode_stop_services"))

        def work() -> None:
            try:
                result = run_host_mode_pass(
                    self.processes, stop_services=stop_services
                )
            except Exception as exc:
                result = {"killed_count": 0, "errors": [str(exc)], "boosted": 0}

            def apply() -> None:
                self._host_mode_inflight = False
                n = int(result.get("killed_count") or 0)
                boosted = int(result.get("boosted") or 0)
                for err in result.get("errors") or []:
                    self._log(f"Host mode: {err}")
                for entry in result.get("killed") or []:
                    self._log(
                        f"Host mode closed {entry.get('name')} (PID {entry.get('pid')})"
                    )
                svc = result.get("services_stopped") or []
                if svc:
                    self._log(f"Host mode stopped services: {', '.join(svc)}")
                msg = f"Host mode ON — cleared {n} apps, boosted {boosted} processes"
                self.statusbar.configure(text=msg)
                if n or boosted:
                    self._log(msg)

            self.root.after(0, apply)

        threading.Thread(target=work, daemon=True).start()

    def _enable_host_mode(self) -> bool:
        """Confirm + elevate if needed. Returns True if Host mode may stay ON."""
        if not self.store.settings.get("host_mode_confirmed"):
            ok = messagebox.askyesno(
                "Enable Host mode?",
                "Host mode closes other user apps (browsers, Office, chat, etc.) "
                "so this PC can dedicate CPU/RAM to MultiServer and its demos.\n\n"
                "Windows core processes, Explorer, networking, MultiServer, and "
                "running demos are kept.\n\n"
                "Unsaved work in other apps may be lost. Continue?",
                parent=self.root,
            )
            if not ok:
                return False
            self.store.data.setdefault("settings", {})["host_mode_confirmed"] = True

        if not is_elevated():
            again = messagebox.askyesno(
                "Administrator recommended",
                "Host mode works best with elevated privileges (UAC).\n\n"
                "Relaunch MultiServer as Administrator now?\n\n"
                "Choose No to enable Host mode without elevation "
                "(some apps may not close).",
                parent=self.root,
            )
            if again:
                if request_elevation_relaunch():
                    self.store.data.setdefault("settings", {})["host_mode_enabled"] = True
                    self.store.data["settings"]["host_mode_confirmed"] = True
                    self.store.save()
                    self.root.after(200, self._on_close_for_elevate)
                    return True
                messagebox.showwarning(
                    "Elevation",
                    "UAC relaunch was cancelled. Enabling Host mode without elevation.",
                    parent=self.root,
                )
        return True

    def _on_close_for_elevate(self) -> None:
        """Exit after spawning elevated copy (don't stop demos)."""
        if self._status_job:
            self.root.after_cancel(self._status_job)
        if self._host_mode_job:
            self.root.after_cancel(self._host_mode_job)
        self.status_server.stop()
        self.root.destroy()

    def _schedule_auto_update(self) -> None:
        self._auto_update_tick()
        self.root.after(15 * 60 * 1000, self._schedule_auto_update)

    def _auto_update_tick(self) -> None:
        mini = self.store.mini
        if not mini.get("mini_auto_update_enabled"):
            return
        if str(mini.get("mini_connection_status") or "").lower() != "accepted":
            return

        def work() -> None:
            try:
                result = apply_remote_update(
                    self.store.mini,
                    self.store.replace_mini,
                    install_root=self.install_root,
                    preserves_path=_preserves_path(self.install_root),
                )
                if result.get("applied"):
                    self.root.after(
                        0,
                        lambda: self._log(
                            f"Auto-update applied v{result.get('version')} — restart recommended."
                        ),
                    )
            except Exception as exc:
                self.root.after(0, lambda: self._log(f"Auto-update: {exc}"))

        threading.Thread(target=work, daemon=True).start()

    def _live_manifest_json(self) -> str:
        try:
            mtime = self.store.path.stat().st_mtime
            if mtime != getattr(self, "_config_mtime", None):
                self._config_mtime = mtime
                self.store.load()
                self.root.after(0, self._refresh_tree_safe)
        except OSError:
            pass

        cache = self._status_cache

        def running_check(sid: str) -> str:
            return cache.get(sid, "Stopped")

        return export_manifest_json(
            self.store.settings,
            self.store.systems,
            running_check=running_check,
        )

    def _refresh_tree_safe(self) -> None:
        self._refresh_list()

    def _start_status_server(self) -> None:
        ok, msg = self.status_server.start()
        self._log(msg if ok else f"WARNING: {msg}")
        mp = manager_port(self.store.settings)
        host = self.status_server.host
        display = "127.0.0.1" if host == "0.0.0.0" else host
        self.api_label.configure(
            text=f"API http://{display}:{mp}/demos-manifest.json"
        )

    def _group_label(self, parent, text: str) -> None:
        ctk.CTkLabel(
            parent, text=text.upper(), font=ctk.CTkFont(size=11, weight="bold"),
            text_color=COLORS["muted"],
        ).pack(side=tk.LEFT, padx=(0, 6))

    def _build_ui(self) -> None:
        header = ctk.CTkFrame(self.root, fg_color=COLORS["panel"], corner_radius=0)
        header.pack(fill=tk.X)
        title_row = ctk.CTkFrame(header, fg_color="transparent")
        title_row.pack(fill=tk.X, padx=16, pady=(12, 4))
        ctk.CTkLabel(
            title_row,
            text="MultiServer",
            font=ctk.CTkFont(size=22, weight="bold"),
            text_color=COLORS["text"],
        ).pack(side=tk.LEFT)
        ctk.CTkLabel(
            title_row,
            text=f"v{__version__}",
            font=ctk.CTkFont(size=13),
            text_color=COLORS["muted"],
        ).pack(side=tk.LEFT, padx=(10, 0))
        self.api_label = ctk.CTkLabel(
            title_row, text="", text_color=COLORS["muted"], font=ctk.CTkFont(size=12)
        )
        self.api_label.pack(side=tk.RIGHT)

        # Host resource strip
        self.resource_strip = ctk.CTkFrame(header, fg_color=COLORS["panel2"], corner_radius=8)
        self.resource_strip.pack(fill=tk.X, padx=16, pady=(4, 8))
        self.host_cpu_label = ctk.CTkLabel(
            self.resource_strip, text="Host CPU —", font=ctk.CTkFont(size=13)
        )
        self.host_cpu_label.pack(side=tk.LEFT, padx=12, pady=8)
        self.host_ram_label = ctk.CTkLabel(
            self.resource_strip, text="RAM —", font=ctk.CTkFont(size=13)
        )
        self.host_ram_label.pack(side=tk.LEFT, padx=12)
        self.demos_load_label = ctk.CTkLabel(
            self.resource_strip, text="Demos —", font=ctk.CTkFont(size=13)
        )
        self.demos_load_label.pack(side=tk.LEFT, padx=12)
        self.load_warn_label = ctk.CTkLabel(
            self.resource_strip, text="", font=ctk.CTkFont(size=12, weight="bold")
        )
        self.load_warn_label.pack(side=tk.RIGHT, padx=12)

        toolbar = ctk.CTkFrame(self.root, fg_color="transparent")
        toolbar.pack(fill=tk.X, padx=12, pady=(4, 8))

        systems_g = ctk.CTkFrame(toolbar, fg_color=COLORS["panel"], corner_radius=8)
        systems_g.pack(side=tk.LEFT, padx=(0, 8), pady=2)
        inner = ctk.CTkFrame(systems_g, fg_color="transparent")
        inner.pack(padx=8, pady=6)
        self._group_label(inner, "Systems")
        for text, cmd in (
            ("Add", self._add_system),
            ("Edit", self._edit_system),
            ("Remove", self._remove_system),
        ):
            ctk.CTkButton(inner, text=text, width=70, command=cmd).pack(
            side=tk.LEFT, padx=2
        )

        runtime_g = ctk.CTkFrame(toolbar, fg_color=COLORS["panel"], corner_radius=8)
        runtime_g.pack(side=tk.LEFT, padx=(0, 8), pady=2)
        inner2 = ctk.CTkFrame(runtime_g, fg_color="transparent")
        inner2.pack(padx=8, pady=6)
        self._group_label(inner2, "Runtime")
        for text, cmd in (
            ("Start", self._start_selected),
            ("Stop", self._stop_selected),
            ("Start all", self._start_all),
            ("Stop all", self._stop_all),
        ):
            ctk.CTkButton(inner2, text=text, width=78, command=cmd).pack(
            side=tk.LEFT, padx=2
        )

        tools_g = ctk.CTkFrame(toolbar, fg_color=COLORS["panel"], corner_radius=8)
        tools_g.pack(side=tk.LEFT, pady=2)
        inner3 = ctk.CTkFrame(tools_g, fg_color="transparent")
        inner3.pack(padx=8, pady=6)
        self._group_label(inner3, "Tools")
        for text, cmd in (
            ("Open demo", self._open_demo),
            ("Copy URL", self._copy_public_url),
            ("Settings", self._edit_settings),
            ("Export", self._export_manifest),
            ("Proxy", self._show_proxy),
            ("Reassign ports", self._reassign_all_ports),
            ("Sync site", self._sync_website),
        ):
            ctk.CTkButton(inner3, text=text, width=96, command=cmd).pack(
            side=tk.LEFT, padx=2
        )

        paned = tk.PanedWindow(
            self.root, orient=tk.HORIZONTAL, sashrelief=tk.FLAT, bg=COLORS["bg"],
            sashwidth=6, bd=0,
        )
        paned.pack(fill=tk.BOTH, expand=True, padx=12, pady=(0, 8))

        left = ctk.CTkFrame(paned, fg_color=COLORS["panel"], corner_radius=10)
        paned.add(left, minsize=420)

        tree_wrap = tk.Frame(left, bg=COLORS["panel"])
        tree_wrap.pack(fill=tk.BOTH, expand=True, padx=8, pady=8)
        cols = ("name", "slug", "status", "cpu", "ram", "demo_port", "local_url")
        style = ttk.Style()
        style.theme_use("clam")
        style.configure(
            "MS.Treeview",
            background=COLORS["panel2"],
            foreground=COLORS["text"],
            fieldbackground=COLORS["panel2"],
            rowheight=28,
            borderwidth=0,
            font=("Segoe UI", 10),
        )
        style.configure(
            "MS.Treeview.Heading",
            background=COLORS["panel"],
            foreground=COLORS["muted"],
            font=("Segoe UI", 9, "bold"),
        )
        style.map("MS.Treeview", background=[("selected", COLORS["accent"])])
        self.tree = ttk.Treeview(
            tree_wrap, columns=cols, show="headings", height=20, style="MS.Treeview"
        )
        headings = {
            "name": ("System", 130),
            "slug": ("Slug", 90),
            "status": ("Status", 90),
            "cpu": ("CPU", 55),
            "ram": ("RAM", 70),
            "demo_port": ("Port", 50),
            "local_url": ("Local URL", 200),
        }
        for key, (label, width) in headings.items():
            self.tree.heading(key, text=label)
            self.tree.column(key, width=width, stretch=(key == "local_url"))
        scroll = ttk.Scrollbar(tree_wrap, orient=tk.VERTICAL, command=self.tree.yview)
        self.tree.configure(yscrollcommand=scroll.set)
        self.tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scroll.pack(side=tk.RIGHT, fill=tk.Y)
        self.tree.bind("<<TreeviewSelect>>", self._on_select)

        right = ctk.CTkFrame(paned, fg_color=COLORS["panel"], corner_radius=10)
        paned.add(right, minsize=420)

        ctk.CTkLabel(
            right, text="Details", font=ctk.CTkFont(size=14, weight="bold")
        ).pack(anchor=tk.W, padx=12, pady=(12, 4))
        self.detail = ctk.CTkTextbox(right, height=200, font=ctk.CTkFont(family="Consolas", size=12))
        self.detail.pack(fill=tk.BOTH, expand=False, padx=12, pady=(0, 8))

        log_header = ctk.CTkFrame(right, fg_color="transparent")
        log_header.pack(fill=tk.X, padx=12)
        ctk.CTkLabel(
            log_header, text="Log", font=ctk.CTkFont(size=14, weight="bold")
        ).pack(side=tk.LEFT)
        ctk.CTkLabel(log_header, text="Filter", text_color=COLORS["muted"]).pack(
            side=tk.LEFT, padx=(16, 6)
        )
        self.log_filter_menu = ctk.CTkOptionMenu(
            log_header,
            variable=self._log_filter,
            values=["All"],
            width=140,
            command=lambda _v: None,
        )
        self.log_filter_menu.pack(side=tk.LEFT)

        self.log = ctk.CTkTextbox(right, font=ctk.CTkFont(family="Consolas", size=11))
        self.log.pack(fill=tk.BOTH, expand=True, padx=12, pady=(4, 12))
        self._log_lines: list[tuple[str, str]] = []  # (system_name_or_*, message)

        self.statusbar = ctk.CTkLabel(
            self.root,
            text=f"Ready — MultiServer v{__version__}",
            anchor="w",
            text_color=COLORS["muted"],
            fg_color=COLORS["panel"],
            height=28,
        )
        self.statusbar.pack(fill=tk.X)

    def _log(self, message: str, system_name: str = "*") -> None:
        self._log_lines.append((system_name, message))
        if len(self._log_lines) > 2000:
            self._log_lines = self._log_lines[-1500:]
        filt = self._log_filter.get()
        if filt != "All" and system_name not in (filt, "*"):
            return
        prefix = f"[{system_name}] " if system_name != "*" else ""
        self.log.insert("end", prefix + message + "\n")
        self.log.see("end")

    def _rebuild_log_view(self) -> None:
        self.log.delete("1.0", "end")
        filt = self._log_filter.get()
        for name, msg in self._log_lines:
            if filt != "All" and name not in (filt, "*"):
                continue
            prefix = f"[{name}] " if name != "*" else ""
            self.log.insert("end", prefix + msg + "\n")
        self.log.see("end")

    def _refresh_log_filter_options(self) -> None:
        names = ["All"] + [s.get("name") or s["id"][:8] for s in self.store.systems]
        current = self._log_filter.get()
        self.log_filter_menu.configure(values=names)
        if current not in names:
            self._log_filter.set("All")
        self.log_filter_menu.configure(command=lambda _v: self._rebuild_log_view())

    def _on_process_log(self, system_id: str, message: str) -> None:
        sys = self.store.get_system(system_id)
        name = sys["name"] if sys else system_id[:8]
        self.root.after(0, lambda: self._log(message, name))

    def _selected_system(self) -> dict | None:
        if not self._selected_id:
            return None
        return self.store.get_system(self._selected_id)

    def _on_select(self, _event=None) -> None:
        if self._refreshing:
            return
        sel = self.tree.selection()
        if not sel:
            self._selected_id = None
            return
        self._selected_id = sel[0]
        self._update_detail()

    def _status_for_system(self, sys: dict, host: str) -> str:
        settings = self.store.settings
        status = self._status_cache.get(sys["id"])
        if status is None:
            status = self.processes.status_text(sys, host)
        port_issues = validate_system_ports(
            sys, self.store.systems, settings, check_bind=False
        )
        if port_issues and status in ("Stopped", "Port issue"):
            return "Port issue"
        return status

    def _resource_cells(self, system_id: str) -> tuple[str, str]:
        entry = self._resource_snap.systems.get(system_id)
        if not entry or entry.process_count == 0:
            return ("—", "—")
        cpu = format_cpu(entry.cpu_percent)
        if entry.warn:
            cpu = f"⚠{cpu}"
        return (cpu, f"{entry.ram_mb:.0f} MB")

    def _tree_values(self, sys: dict, host: str) -> tuple:
        settings = self.store.settings
        cpu, ram = self._resource_cells(sys["id"])
        return (
            sys["name"],
            sys.get("slug", ""),
            self._status_for_system(sys, host),
            cpu,
            ram,
            sys.get("demo_port", ""),
            demo_local_url(settings, sys),
        )

    def _update_host_strip(self) -> None:
        snap = self._resource_snap
        thr = resource_thresholds(self.store.settings)
        self.host_cpu_label.configure(
            text=f"Host CPU  {format_cpu(snap.cpu_percent)}",
            text_color=load_level_color(snap.cpu_percent, thr["host_cpu_warn"]),
        )
        self.host_ram_label.configure(
            text=(
                f"RAM  {format_bytes(snap.ram_used)} / {format_bytes(snap.ram_total)}"
                f"  ({snap.ram_percent:.0f}%)"
            ),
            text_color=load_level_color(snap.ram_percent, thr["host_ram_warn"]),
        )
        other_ram = max(snap.ram_used - snap.demos_ram, 0)
        self.demos_load_label.configure(
            text=(
                f"Demos  CPU {format_cpu(snap.demos_cpu)}  ·  "
                f"{format_bytes(snap.demos_ram)}  ·  other {format_bytes(other_ram)}"
            ),
            text_color=COLORS["text"],
        )
        if snap.host_warn:
            self.load_warn_label.configure(
                text="HOST UNDER LOAD", text_color=COLORS["danger"]
            )
        elif any(s.warn for s in snap.systems.values()):
            self.load_warn_label.configure(
                text="Demo under load", text_color=COLORS["warn"]
            )
        else:
            self.load_warn_label.configure(text="", text_color=COLORS["muted"])

    def _update_detail(self) -> None:
        sys = self._selected_system()
        self.detail.configure(state="normal")
        self.detail.delete("1.0", "end")
        if not sys:
            self.detail.configure(state="disabled")
            return
        settings = self.store.settings
        host = settings.get("host", "127.0.0.1")
        lines = [
            f"Name: {sys['name']}",
            f"Slug: {sys.get('slug')}",
            f"Type: {sys.get('type')}",
            f"Working dir: {sys.get('working_dir')}",
            f"Client port: {sys.get('client_port')}  |  Server port: {sys.get('server_port')}",
            f"Demo port: {sys.get('demo_port')}",
            f"Extra ports: {', '.join(str(p) for p in (sys.get('extra_ports') or [])) or '—'}",
            f"Command override: {sys.get('command') or '(auto)'}",
            f"Ngrok tunnel: {'yes' if sys.get('ngrok_enabled') else 'no'}",
        ]
        if sys.get("ngrok_enabled"):
            bat = (sys.get("ngrok_bat") or "").strip()
            if bat:
                lines.append(f"Ngrok script: {bat}")
            else:
                found = find_project_ngrok_bat(
                    Path(sys.get("working_dir") or ""), settings
                )
                if found:
                    lines.append(f"Ngrok script: {found.name} (auto)")
                else:
                    lines.append("Ngrok script: built-in ngrok http <demo port>")
            ngrok_line = ngrok_status_line(
                sys, self.processes.ngrok_inspector_port(sys["id"])
            )
            if ngrok_line:
                lines.append(ngrok_line)
            public = self.processes.ngrok_public_url(sys["id"])
            if public:
                lines.append(f"Ngrok public URL: {public}")

        res = self._resource_snap.systems.get(sys["id"])
        lines.append("")
        lines.append("— Resources —")
        if res and res.process_count:
            share_cpu = (
                100.0 * res.cpu_percent / self._resource_snap.demos_cpu
                if self._resource_snap.demos_cpu > 0.05
                else 0.0
            )
            share_ram = (
                100.0 * res.ram_bytes / self._resource_snap.demos_ram
                if self._resource_snap.demos_ram
                else 0.0
            )
            lines.append(
                f"CPU: {res.cpu_percent:.1f}%  ({share_cpu:.0f}% of MultiServer demos)"
            )
            lines.append(
                f"RAM: {res.ram_mb:.0f} MB ({res.ram_percent_of_host:.1f}% of host, "
                f"{share_ram:.0f}% of demos)  ·  processes: {res.process_count}"
            )
            if res.warn:
                lines.append("⚠ This demo is under elevated CPU load.")
        else:
            lines.append("Not running / no process sample.")

        lines.extend([
            "",
            f"Status: {self._status_for_system(sys, host)}",
            f"Local demo:  {demo_local_url(settings, sys)}",
            f"Public demo: {demo_public_url(settings, sys)}",
        ])
        port_issues = validate_system_ports(
            sys, self.store.systems, settings, check_bind=False
        )
        if port_issues:
            lines.extend(["", "Port checks:"])
            lines.extend(f"  • {i}" for i in port_issues[:6])
        if sys.get("notes"):
            lines.extend(["", f"Notes: {sys['notes']}"])
        self.detail.insert("end", "\n".join(lines))
        self.detail.configure(state="disabled")

    def _refresh_list(self, *, refresh_detail: bool = False) -> None:
        settings = self.store.settings
        host = settings.get("host", "127.0.0.1")
        sel = self._selected_id
        existing = set(self.tree.get_children())
        wanted = {sys["id"] for sys in self.store.systems}

        self._refreshing = True
        try:
            for sys in self.store.systems:
                iid = sys["id"]
                values = self._tree_values(sys, host)
                self._status_cache[iid] = values[2]
                if iid in existing:
                    if self.tree.item(iid, "values") != values:
                        self.tree.item(iid, values=values)
                    existing.discard(iid)
                else:
                    self.tree.insert("", tk.END, iid=iid, values=values)
            for iid in existing:
                self.tree.delete(iid)
                self._status_cache.pop(iid, None)
            if sel and self.tree.exists(sel):
                self.tree.selection_set(sel)
        finally:
            self._refreshing = False

        self._refresh_log_filter_options()
        if refresh_detail:
            self._update_detail()

    def _schedule_status_poll(self) -> None:
        self._poll_status_async()
        self._status_job = self.root.after(2000, self._schedule_status_poll)

    def _poll_status_async(self) -> None:
        if self._poll_inflight:
            return
        self._poll_inflight = True
        systems = list(self.store.systems)
        settings = self.store.settings
        host = settings.get("host", "127.0.0.1")
        probe_host = "127.0.0.1" if host in ("localhost", "0.0.0.0") else host
        thr = resource_thresholds(settings)
        roots = self.processes.all_root_pids()

        def work() -> None:
            updates: dict[str, tuple] = {}
            cache: dict[str, str] = {}
            for sys in systems:
                status = self.processes.status_text(sys, probe_host)
                cache[sys["id"]] = status
            snap = self.resources.sample(
                roots,
                host_cpu_warn=thr["host_cpu_warn"],
                host_ram_warn=thr["host_ram_warn"],
                demo_cpu_warn=thr["demo_cpu_warn"],
            )
            for sys in systems:
                display = self._status_for_system_from_cache(sys, cache[sys["id"]], settings)
                cpu, ram = ("—", "—")
                entry = snap.systems.get(sys["id"])
                if entry and entry.process_count:
                    cpu = format_cpu(entry.cpu_percent)
                    if entry.warn:
                        cpu = f"⚠{cpu}"
                    ram = f"{entry.ram_mb:.0f} MB"
                updates[sys["id"]] = (
                    sys["name"],
                    sys.get("slug", ""),
                    display,
                    cpu,
                    ram,
                    sys.get("demo_port", ""),
                    demo_local_url(settings, sys),
                )
            self.root.after(0, lambda: self._apply_status_updates(updates, cache, snap))

        threading.Thread(target=work, daemon=True).start()

    def _status_for_system_from_cache(
        self, sys: dict, status: str, settings: dict
    ) -> str:
        port_issues = validate_system_ports(
            sys, self.store.systems, settings, check_bind=False
        )
        if port_issues and status in ("Stopped", "Port issue"):
            return "Port issue"
        return status

    def _apply_status_updates(
        self,
        updates: dict[str, tuple],
        cache: dict[str, str],
        snap: HostSnapshot,
    ) -> None:
        self._poll_inflight = False
        self._status_cache.update(cache)
        self._resource_snap = snap
        self._update_host_strip()
        if updates:
            self._refreshing = True
            try:
                for iid, values in updates.items():
                    if self.tree.exists(iid) and self.tree.item(iid, "values") != values:
                        self.tree.item(iid, values=values)
            finally:
                self._refreshing = False
        if self._selected_id:
            self._update_detail()

    def _add_system(self) -> None:
        dlg = SystemDialog(
            self.root,
            "Add system",
            all_systems=self.store.systems,
            settings=self.store.settings,
        )
        if dlg.result:
            self.store.add_system(dlg.result)
            self._log(f"Added system: {dlg.result['name']}")
            self._refresh_list(refresh_detail=True)

    def _edit_system(self) -> None:
        sys = self._selected_system()
        if not sys:
            messagebox.showinfo("Edit", "Select a system first.")
            return
        dlg = SystemDialog(
            self.root,
            "Edit system",
            sys,
            all_systems=self.store.systems,
            settings=self.store.settings,
            edit_id=sys["id"],
        )
        if dlg.result:
            self.store.update_system(sys["id"], dlg.result)
            self._log(f"Updated: {dlg.result['name']}")
            self._refresh_list(refresh_detail=True)

    def _remove_system(self) -> None:
        sys = self._selected_system()
        if not sys:
            return
        if messagebox.askyesno("Remove", f"Remove '{sys['name']}' from the list?"):
            self.processes.stop(sys["id"])
            self.store.remove_system(sys["id"])
            self._selected_id = None
            self._refresh_list(refresh_detail=True)

    def _start_selected(self) -> None:
        sys = self._selected_system()
        if not sys:
            messagebox.showinfo("Start", "Select a system first.")
            return
        self._start_system(sys)

    def _start_system(self, sys: dict) -> None:
        def run() -> None:
            ok, msg = self.processes.start(
                sys, systems=self.store.systems, settings=self.store.settings
            )
            self.root.after(0, lambda: self._log(msg, sys.get("name", "*")))
            if ok:
                ports = self.processes.wait_for_ports(sys["id"], timeout=120)
                up = [p for p, v in ports.items() if v]

                def report_ports() -> None:
                    if up:
                        self._log(f"Ports ready: {up}", sys.get("name", "*"))
                    else:
                        log_path = self.processes.log_dir / f"{sys['id']}.log"
                        tail = ""
                        try:
                            if log_path.is_file():
                                lines = log_path.read_text(
                                    encoding="utf-8", errors="replace"
                                ).splitlines()
                                tail = "\n".join(lines[-12:])
                        except OSError:
                            pass
                        msg = "Ports not open yet — see log below or open the log file."
                        if tail:
                            msg += f"\n--- log tail ---\n{tail}"
                        self._log(msg, sys.get("name", "*"))
                    if sys.get("ngrok_enabled"):
                        threading.Thread(
                            target=lambda: self._start_and_open_ngrok(sys),
                            daemon=True,
                        ).start()
                    elif up:
                        self.root.after(0, lambda: self._open_local_demo(sys))

                self.root.after(0, report_ports)
            self.root.after(0, self._refresh_list)

        threading.Thread(target=run, daemon=True).start()

    def _open_local_demo(self, sys: dict) -> None:
        url = demo_local_url(self.store.settings, sys)
        webbrowser.open(url)
        self._log(f"Opened {url}", sys.get("name", "*"))

    def _start_and_open_ngrok(self, sys: dict) -> None:
        if not sys.get("ngrok_enabled"):
            return
        ok, msg = self.processes.ensure_ngrok_started(
            sys["id"], sys, settings=self.store.settings
        )
        if msg and msg != "Ngrok already running.":
            self.root.after(0, lambda: self._log(msg, sys.get("name", "*")))
        public = self.processes.wait_for_ngrok_public_url(sys["id"], timeout=120.0)
        if public:
            self.root.after(0, lambda: self._open_ngrok_url(sys, public))
            return
        detail = "Ngrok public URL not ready after 120s."
        inspector = self.processes.ngrok_inspector_port(sys["id"])
        if inspector:
            detail += f" Check inspector http://127.0.0.1:{inspector}"
        self.root.after(0, lambda: self._log(detail, sys.get("name", "*")))

    def _open_ngrok_url(self, sys: dict, url: str) -> None:
        webbrowser.open(url)
        self._log(f"Opened ngrok URL: {url}", sys.get("name", "*"))
        self._refresh_list(refresh_detail=True)

    def _stop_selected(self) -> None:
        sys = self._selected_system()
        if not sys:
            return
        ok, msg = self.processes.stop(sys["id"])
        self._log(msg, sys.get("name", "*"))
        self._refresh_list()

    def _start_all(self) -> None:
        for sys in self.store.systems:
            if sys.get("enabled", True):
                self._start_system(sys)

    def _stop_all(self) -> None:
        self.processes.stop_all()
        self._log("Stopped all managed processes.")
        self._refresh_list()

    def _open_demo(self) -> None:
        sys = self._selected_system()
        if not sys:
            return
        if sys.get("ngrok_enabled"):
            public = self.processes.ngrok_public_url(sys["id"])
            if not public:
                public = self.processes.wait_for_ngrok_public_url(
                    sys["id"], timeout=15.0
                )
            if public:
                webbrowser.open(public)
                self._log(f"Opened ngrok URL: {public}", sys.get("name", "*"))
                return
            messagebox.showinfo(
                "Ngrok",
                "Ngrok tunnel is not ready yet. Wait a few seconds and try again.",
                parent=self.root,
            )
            return
        self._open_local_demo(sys)

    def _copy_public_url(self) -> None:
        sys = self._selected_system()
        if not sys:
            return
        url = demo_public_url(self.store.settings, sys)
        self.root.clipboard_clear()
        self.root.clipboard_append(url)
        self.statusbar.configure(text=f"Copied: {url}")

    def _reassign_all_ports(self) -> None:
        if not self.store.systems:
            messagebox.showinfo("Ports", "No systems configured.")
            return
        if not messagebox.askyesno(
            "Reassign all ports",
            "Give every system a fresh unique port block in 8100–8990?\n"
            f"Port {manager_port(self.store.settings)} stays reserved for MultiServer.",
        ):
            return
        self.processes.stop_all()
        self.store.data["systems"] = reassign_all_systems(
            self.store.systems, self.store.settings
        )
        self.store.save()
        self._log("Reassigned unique ports for all systems.")
        self._refresh_list(refresh_detail=True)

    def _edit_settings(self) -> None:
        s = self.store.settings
        mini = self.store.mini
        win = ctk.CTkToplevel(self.root)
        win.title("Settings")
        win.geometry("640x620")
        win.transient(self.root)
        win.grab_set()

        tabs = ctk.CTkTabview(win)
        tabs.pack(fill=tk.BOTH, expand=True, padx=12, pady=12)
        general = tabs.add("General")
        support = tabs.add("Support / Mini")

        base_var = tk.StringVar(value=s.get("base_domain", ""))
        host_var = tk.StringVar(value=s.get("host", "localhost"))
        prefix_var = tk.StringVar(value=s.get("url_path_prefix", "/demo"))
        script_name_mode_var = tk.StringVar(
            value=s.get("flask_script_name_mode", "never")
        )
        mgr_var = tk.StringVar(value=str(s.get("manager_port", 5674)))
        range_start_var = tk.StringVar(value=str(s.get("demo_port_range_start", 8100)))
        range_end_var = tk.StringVar(value=str(s.get("demo_port_range_end", 8990)))
        step_var = tk.StringVar(value=str(s.get("port_block_step", 10)))
        website_var = tk.StringVar(value=s.get("website_public_dir", ""))
        ngrok_bat_var = tk.StringVar(value=s.get("ngrok_bat_name", "start-ngrok.bat"))
        ngrok_inspector_var = tk.StringVar(
            value=str(s.get("ngrok_inspector_port_start", 4040))
        )
        host_cpu_warn = tk.StringVar(value=str(s.get("host_cpu_warn", 85)))
        host_ram_warn = tk.StringVar(value=str(s.get("host_ram_warn", 90)))
        demo_cpu_warn = tk.StringVar(value=str(s.get("demo_cpu_warn", 50)))
        host_mode_var = tk.BooleanVar(value=bool(s.get("host_mode_enabled")))
        host_mode_svc_var = tk.BooleanVar(value=bool(s.get("host_mode_stop_services")))

        gen_scroll = ctk.CTkScrollableFrame(general)
        gen_scroll.pack(fill=tk.BOTH, expand=True)
        fields = [
            ("Public domain (https://…)", base_var),
            ("CD website public folder (optional)", website_var),
            ("Local host", host_var),
            ("URL path prefix", prefix_var),
            ("MultiServer control port (reserved)", mgr_var),
            ("Demo port range start", range_start_var),
            ("Demo port range end", range_end_var),
            ("Port block step per system", step_var),
            ("Ngrok bat filename (project root)", ngrok_bat_var),
            ("Ngrok inspector port start", ngrok_inspector_var),
            ("Host CPU warn threshold %", host_cpu_warn),
            ("Host RAM warn threshold %", host_ram_warn),
            ("Demo CPU warn threshold %", demo_cpu_warn),
        ]
        for label, var in fields:
            ctk.CTkLabel(gen_scroll, text=label, text_color=COLORS["muted"]).pack(
                anchor=tk.W, pady=(6, 0)
            )
            ctk.CTkEntry(gen_scroll, textvariable=var).pack(fill=tk.X)

        ctk.CTkLabel(
            gen_scroll,
            text="Flask url_for prefix mode",
            text_color=COLORS["muted"],
        ).pack(anchor=tk.W, pady=(6, 0))
        ctk.CTkOptionMenu(
            gen_scroll,
            variable=script_name_mode_var,
            values=["never", "always", "auto"],
        ).pack(fill=tk.X)
        ctk.CTkLabel(
            gen_scroll,
            text=(
                "never: Staff/login links use /staff (domain root). "
                "always: links use /demo/<slug>/staff (subpath-only hosting)."
            ),
            text_color=COLORS["muted"],
            wraplength=560,
            justify=tk.LEFT,
        ).pack(anchor=tk.W, pady=(0, 6))

        ctk.CTkLabel(
            gen_scroll,
            text="Host mode",
            font=ctk.CTkFont(size=14, weight="bold"),
        ).pack(anchor=tk.W, pady=(16, 4))
        ctk.CTkCheckBox(
            gen_scroll,
            text="Host mode (dedicate PC to MultiServer)",
            variable=host_mode_var,
        ).pack(anchor=tk.W, pady=2)
        ctk.CTkLabel(
            gen_scroll,
            text=(
                "Closes other user apps; keeps Windows, Explorer, network, "
                "MultiServer, and running demos. Requires admin for best results."
            ),
            text_color=COLORS["muted"],
            wraplength=560,
            justify=tk.LEFT,
        ).pack(anchor=tk.W, pady=(0, 6))
        ctk.CTkCheckBox(
            gen_scroll,
            text="Also stop optional heavy services (SysMain / Windows Search)",
            variable=host_mode_svc_var,
        ).pack(anchor=tk.W, pady=2)

        # Mini / Support tab
        mini_url = tk.StringVar(value=mini.get("mini_base_url") or DEFAULT_MINI_BASE_URL)
        company = tk.StringVar(value=mini.get("company_name") or "")
        public_override = tk.StringVar(value=mini.get("public_base_url") or "")
        auto_upd = tk.BooleanVar(value=bool(mini.get("mini_auto_update_enabled")))
        bind_public = tk.BooleanVar(value=bool(mini.get("bind_public")))
        status_var = tk.StringVar(
            value=f"Status: {mini.get('mini_connection_status') or 'disconnected'}"
        )
        resolved = resolve_public_base_url(
            {**mini, "public_base_url": public_override.get()},
            manager_port=manager_port(s),
            base_domain=s.get("base_domain"),
        )
        resolved_var = tk.StringVar(
            value=f"Callback URL: {resolved['url']}  ({resolved['source']})"
        )

        ctk.CTkLabel(
            support,
            text="Computer Dynamics · Mini integration",
            font=ctk.CTkFont(size=14, weight="bold"),
        ).pack(anchor=tk.W, pady=(4, 8))
        for label, var in (
            ("Mini dashboard URL", mini_url),
            ("Company name", company),
        ):
            ctk.CTkLabel(support, text=label, text_color=COLORS["muted"]).pack(anchor=tk.W)
            ctk.CTkEntry(support, textvariable=var).pack(fill=tk.X, pady=(0, 6))

        ctk.CTkLabel(
            support,
            textvariable=resolved_var,
            text_color=COLORS["accent"],
            wraplength=560,
            justify=tk.LEFT,
        ).pack(anchor=tk.W, pady=(4, 2))
        ctk.CTkLabel(
            support,
            text=(
                "Uses Settings → Public domain (CD domain), like CRM. "
                "Optional override only if needed:"
            ),
            text_color=COLORS["muted"],
            wraplength=560,
            justify=tk.LEFT,
        ).pack(anchor=tk.W)
        ctk.CTkEntry(support, textvariable=public_override, placeholder_text="optional").pack(
            fill=tk.X, pady=(0, 6)
        )

        def refresh_resolved_label(*_args) -> None:
            r = resolve_public_base_url(
                {
                    **self.store.mini,
                    "mini_base_url": mini_url.get().strip(),
                    "public_base_url": public_override.get().strip(),
                },
                manager_port=manager_port(self.store.settings),
                base_domain=self.store.settings.get("base_domain"),
            )
            resolved_var.set(f"Callback URL: {r['url']}  ({r['source']})")

        public_override.trace_add("write", refresh_resolved_label)
        mini_url.trace_add("write", refresh_resolved_label)

        ctk.CTkCheckBox(
            support,
            text="Listen on all interfaces (0.0.0.0) for control API",
            variable=bind_public,
        ).pack(anchor=tk.W, pady=4)
        ctk.CTkCheckBox(
            support, text="Auto update from Mini Update Library", variable=auto_upd
        ).pack(anchor=tk.W, pady=4)
        ctk.CTkLabel(support, textvariable=status_var, text_color=COLORS["accent"]).pack(
            anchor=tk.W, pady=6
        )

        err_label = ctk.CTkLabel(
            support,
            text=mini.get("mini_last_update_error")
            or mini.get("mini_last_sync_error")
            or "",
            text_color=COLORS["danger"],
            wraplength=560,
            justify=tk.LEFT,
        )
        err_label.pack(anchor=tk.W)

        def persist_mini_fields() -> dict:
            patch = {
                "mini_base_url": mini_url.get().strip() or DEFAULT_MINI_BASE_URL,
                "company_name": company.get().strip(),
                "public_base_url": public_override.get().strip().rstrip("/"),
                "mini_auto_update_enabled": bool(auto_upd.get()),
                "bind_public": bool(bind_public.get()),
            }
            return self.store.save_mini(patch)

        def do_connect() -> None:
            try:
                m = persist_mini_fields()
                register_with_mini(
                    m,
                    self.store.replace_mini,
                    manager_port=manager_port(self.store.settings),
                    base_domain=self.store.settings.get("base_domain"),
                )
                refresh_resolved_label()
                status_var.set(
                    f"Status: {self.store.mini.get('mini_connection_status')} — accept on Mini"
                )
                src = self.store.mini.get("_resolved_public_source") or ""
                url = self.store.mini.get("_resolved_public_url") or ""
                self._log(f"Registered with Mini using {url} ({src}).")
                messagebox.showinfo(
                    "Mini",
                    f"Registered using callback URL:\n{url}\n({src})\n\n"
                    "On Mini → External Systems → Connected Systems → Accept.",
                    parent=win,
                )
            except Exception as exc:
                err_label.configure(text=str(exc))
                messagebox.showerror("Mini", str(exc), parent=win)

        def do_refresh() -> None:
            try:
                persist_mini_fields()
                refresh_connection(self.store.mini, self.store.replace_mini)
                status_var.set(f"Status: {self.store.mini.get('mini_connection_status')}")
                err_label.configure(text=self.store.mini.get("mini_last_sync_error") or "")
            except Exception as exc:
                err_label.configure(text=str(exc))
                messagebox.showerror("Mini", str(exc), parent=win)

        def do_check() -> None:
            try:
                persist_mini_fields()
                result = check_for_updates(self.store.mini, self.store.replace_mini)
                avail = result.get("available")
                self._pending_update = avail
                if not avail:
                    messagebox.showinfo(
                        "Updates",
                        f"No newer update. Current v{result.get('current_version')}",
                        parent=win,
                    )
                else:
                    messagebox.showinfo(
                        "Updates",
                        f"Update available: v{avail.get('version')}\n"
                        f"{avail.get('title') or ''}\n\nClick Apply update to install.",
                        parent=win,
                    )
            except Exception as exc:
                err_label.configure(text=str(exc))
                messagebox.showerror("Updates", str(exc), parent=win)

        def do_apply_remote() -> None:
            def work() -> None:
                try:
                    persist_mini_fields()
                    entry = None
                    if self._pending_update and self._pending_update.get("entry_id"):
                        entry = {
                            "id": self._pending_update["entry_id"],
                            "version": self._pending_update.get("version"),
                            "title": self._pending_update.get("title"),
                        }
                    result = apply_remote_update(
                        self.store.mini,
                        self.store.replace_mini,
                        install_root=self.install_root,
                        preserves_path=_preserves_path(self.install_root),
                        entry=entry,
                    )
                    msg = (
                        f"Applied v{result.get('version')}"
                        if result.get("applied")
                        else result.get("message", "Done")
                    )
                    self.root.after(
                        0,
                        lambda: (
                            self._log(msg),
                            messagebox.showinfo(
                                "Updates",
                                msg
                                + "\n\nRestart MultiServer if code modules changed.",
                                parent=win,
                            ),
                        ),
                    )
                except Exception as exc:
                    self.root.after(
                        0, lambda: messagebox.showerror("Updates", str(exc), parent=win)
                    )

            threading.Thread(target=work, daemon=True).start()

        def do_manual() -> None:
            path = filedialog.askdirectory(
                title="Select deploy package folder (YYYY-MM-DD-vX.Y.Z or payload)"
            )
            if not path:
                return
            try:
                result = apply_local_deploy_folder(
                    Path(path),
                    self.install_root,
                    preserves_path=_preserves_path(self.install_root),
                )
                self._log(
                    f"Manual update applied ({result.get('copied_file_count')} files)."
                )
                messagebox.showinfo(
                    "Manual update",
                    f"Copied {result.get('copied_file_count')} files "
                    f"(skipped {result.get('skipped_file_count')}).\n"
                    "Restart MultiServer to load new code.",
                    parent=win,
                )
            except Exception as exc:
                messagebox.showerror("Manual update", str(exc), parent=win)

        btn_row = ctk.CTkFrame(support, fg_color="transparent")
        btn_row.pack(fill=tk.X, pady=8)
        for text, cmd in (
            ("Connect", do_connect),
            ("Refresh", do_refresh),
            ("Check updates", do_check),
            ("Apply update", do_apply_remote),
            ("Manual folder…", do_manual),
        ):
            ctk.CTkButton(btn_row, text=text, width=110, command=cmd).pack(
                side=tk.LEFT, padx=3
            )

        applied = mini.get("applied_updates") or []
        if applied:
            hist = "\n".join(
                f"• v{a.get('version')} @ {a.get('applied_at', '')[:19]}"
                for a in applied[:8]
            )
            ctk.CTkLabel(
                support,
                text="Recently applied:\n" + hist,
                justify=tk.LEFT,
                text_color=COLORS["muted"],
            ).pack(anchor=tk.W, pady=8)

        def save_general() -> None:
            try:
                new_mgr = int(mgr_var.get())
                rs = int(range_start_var.get())
                re_ = int(range_end_var.get())
                st = int(step_var.get())
                ngrok_inspector = int(ngrok_inspector_var.get())
                hcw = float(host_cpu_warn.get())
                hrw = float(host_ram_warn.get())
                dcw = float(demo_cpu_warn.get())
            except ValueError:
                messagebox.showerror(
                    "Settings", "Ports and thresholds must be numbers.", parent=win
                )
                return

            want_host = bool(host_mode_var.get())
            was_host = bool(self.store.settings.get("host_mode_enabled"))
            confirmed = bool(self.store.settings.get("host_mode_confirmed"))

            if want_host and not was_host:
                if not self._enable_host_mode():
                    host_mode_var.set(False)
                    want_host = False
                else:
                    confirmed = True
                    # Elevation may have saved and scheduled exit
                    if self.store.settings.get("host_mode_enabled") and not is_elevated():
                        # Relaunch path already persisted host_mode_enabled
                        win.destroy()
                        return

            if was_host and not want_host:
                try:
                    reset_priorities(self.processes)
                except Exception:
                    pass
                self._log("Host mode OFF — priority reset; closed apps stay closed.")

            confirmed = confirmed or bool(self.store.settings.get("host_mode_confirmed"))

            self.store.data["settings"] = {
                "base_domain": base_var.get().strip(),
                "website_public_dir": website_var.get().strip(),
                "host": host_var.get().strip() or "localhost",
                "url_path_prefix": prefix_var.get().strip() or "/demo",
                "flask_script_name_mode": (
                    script_name_mode_var.get().strip().lower() or "never"
                ),
                "manager_port": new_mgr,
                "demo_port_range_start": rs,
                "demo_port_range_end": re_,
                "port_block_step": st,
                "ngrok_bat_name": ngrok_bat_var.get().strip() or "start-ngrok.bat",
                "ngrok_inspector_port_start": ngrok_inspector,
                "host_cpu_warn": hcw,
                "host_ram_warn": hrw,
                "demo_cpu_warn": dcw,
                "host_mode_enabled": want_host,
                "host_mode_stop_services": bool(host_mode_svc_var.get()),
                "host_mode_confirmed": confirmed,
            }
            persist_mini_fields()
            self.store.save()
            self.status_server.stop()
            self.status_server.port = new_mgr
            self.status_server.host = (
                "0.0.0.0" if self.store.mini.get("bind_public") else "127.0.0.1"
            )
            self.status_server.mini_context = self._mini_ctx
            self._start_status_server()
            self._refresh_list(refresh_detail=True)
            if want_host:
                self.root.after(300, lambda: self._host_mode_tick(force=True))
                self.statusbar.configure(text="Host mode ON")
            win.destroy()

        ctk.CTkButton(win, text="Save & close", command=save_general).pack(
            anchor=tk.E, padx=12, pady=(0, 12)
        )

    def _sync_website(self) -> None:
        from .website_sync import sync_to_website
        from .paths_workspace import default_website_public_dir

        path = (self.store.settings.get("website_public_dir") or "").strip()
        if not path:
            path = filedialog.askdirectory(
                title="Select Computer Dynamics website public folder",
                initialdir=str(default_website_public_dir().parent),
            )
            if not path:
                return
            self.store.data["settings"]["website_public_dir"] = path
            self.store.save()
        self.store.load()
        ok, msg = sync_to_website(
            Path(path),
            self.store.settings,
            self.store.systems,
        )
        self._log(msg if ok else f"Sync failed: {msg}")
        if ok:
            messagebox.showinfo(
                "Website synced",
                f"{msg}\n\n"
                "Files written:\n"
                "  • demos-manifest.json\n"
                "  • demo-pages.json\n"
                "  • js/multiserver-demos.js\n\n"
                "Product pages with the script will show “Open Live Demo”.",
            )

    def _export_manifest(self) -> None:
        path = filedialog.asksaveasfilename(
            title="Export demo manifest for your website",
            defaultextension=".json",
            filetypes=[("JSON", "*.json")],
            initialfile="demos-manifest.json",
        )
        if not path:
            return
        manifest = export_manifest_json(
            self.store.settings,
            self.store.systems,
            running_check=lambda sid: self.processes.status_text(
                self.store.get_system(sid) or {"id": sid, "demo_port": 0}
            ),
        )
        Path(path).write_text(manifest, encoding="utf-8")
        self._log(f"Exported manifest: {path}")
        messagebox.showinfo("Export", f"Saved:\n{path}")

    def _show_proxy(self) -> None:
        win = ctk.CTkToplevel(self.root)
        win.title("Reverse proxy snippets")
        win.geometry("720x480")
        nb = ctk.CTkTabview(win)
        nb.pack(fill=tk.BOTH, expand=True, padx=8, pady=8)
        for label, text in (
            ("Caddy (snippet)", caddy_snippet(self.store.settings, self.store.systems)),
            (
                "Caddy (full Caddyfile)",
                caddy_full_config(self.store.settings, self.store.systems),
            ),
            ("nginx", nginx_snippet(self.store.settings, self.store.systems)),
        ):
            tab = nb.add(label)
            box = ctk.CTkTextbox(tab, font=ctk.CTkFont(family="Consolas", size=11))
            box.pack(fill=tk.BOTH, expand=True)
            box.insert("end", text)

    def _on_close(self) -> None:
        if self._status_job:
            self.root.after_cancel(self._status_job)
        if self._host_mode_job:
            self.root.after_cancel(self._host_mode_job)
        self.status_server.stop()
        if self.processes._running:
            if messagebox.askyesno(
                "Quit",
                "Stop all running demos before exit?",
            ):
                self.processes.stop_all()
        self.root.destroy()

    def run(self) -> None:
        self.root.mainloop()


def run_app(config_path: Path | None = None) -> None:
    root_dir = Path(__file__).resolve().parent.parent
    cfg = config_path or root_dir / "config.json"
    logs = root_dir / "logs"
    app = MultiServerApp(cfg, logs)
    app.run()
