"""Tkinter GUI for MultiServer."""

from __future__ import annotations

import json
import threading
import tkinter as tk
import webbrowser
from pathlib import Path
from tkinter import filedialog, messagebox, scrolledtext, ttk

from .config import ConfigStore, DEFAULT_SYSTEM
from . import __version__
from .detectors import STACK_TYPES, analyze_working_dir, validate_working_dir
from .ports import (
    PortAllocationError,
    allocate_ports,
    manager_port,
    reassign_all_systems,
    validate_system_ports,
)
from .ngrok import find_project_ngrok_bat, ngrok_status_line, parse_ngrok_port_from_bat
from .process_manager import ProcessManager
from .status_server import StatusServer
from .urls import (
    caddy_snippet,
    demo_local_url,
    demo_public_url,
    export_manifest_json,
    nginx_snippet,
)


class SystemDialog(tk.Toplevel):
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
        self.geometry("620x580")
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

        frame = ttk.Frame(self, padding=12)
        frame.pack(fill=tk.BOTH, expand=True)

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

        for row, (label, key) in enumerate(rows):
            ttk.Label(frame, text=label).grid(row=row, column=0, sticky=tk.W, pady=3)
            if key == "working_dir":
                sub = ttk.Frame(frame)
                sub.grid(row=row, column=1, sticky=tk.EW, pady=3)
                entry = ttk.Entry(sub, textvariable=self.vars[key], width=48)
                entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
                ttk.Button(sub, text="Browse…", command=self._browse).pack(side=tk.LEFT, padx=(6, 0))
                ttk.Button(sub, text="Auto-detect", command=self._autodetect).pack(
                    side=tk.LEFT, padx=(6, 0)
                )
                ttk.Button(sub, text="Assign ports", command=self._assign_ports).pack(
                    side=tk.LEFT, padx=(6, 0)
                )
            elif key == "type":
                ttk.Combobox(
                    frame,
                    textvariable=self.vars[key],
                    values=STACK_TYPES,
                    state="readonly",
                    width=46,
                ).grid(row=row, column=1, sticky=tk.EW, pady=3)
            elif key == "notes":
                ttk.Entry(frame, textvariable=self.vars[key], width=50).grid(
                    row=row, column=1, sticky=tk.EW, pady=3
                )
            elif key == "ngrok_bat":
                sub = ttk.Frame(frame)
                sub.grid(row=row, column=1, sticky=tk.EW, pady=3)
                entry = ttk.Entry(sub, textvariable=self.vars[key], width=48)
                entry.pack(side=tk.LEFT, fill=tk.X, expand=True)
                ttk.Button(sub, text="Browse…", command=self._browse_ngrok_bat).pack(
                    side=tk.LEFT, padx=(6, 0)
                )
            else:
                ttk.Entry(frame, textvariable=self.vars[key], width=50).grid(
                    row=row, column=1, sticky=tk.EW, pady=3
                )

        ngrok_row = len(rows)
        ngrok_frame = ttk.Frame(frame)
        ngrok_frame.grid(row=ngrok_row, column=0, columnspan=2, sticky=tk.W, pady=(6, 0))
        ttk.Checkbutton(
            ngrok_frame,
            text="Start ngrok tunnel with this system",
            variable=self.ngrok_enabled,
        ).pack(anchor=tk.W)
        self.ngrok_hint = ttk.Label(
            ngrok_frame,
            text="",
            wraplength=540,
            foreground="#555",
        )
        self.ngrok_hint.pack(anchor=tk.W, pady=(4, 0))

        frame.columnconfigure(1, weight=1)

        hint = ttk.Label(
            frame,
            text=(
                "Project folder = app root (e.g. …\\repair_workspace\\…\\working OR E:\\AutoM.System). "
                "Auto-detect assigns unique ports in 8100+ "
                f"(control API on port {manager_port(self.settings)})."
            ),
            wraplength=560,
            foreground="#555",
        )
        hint.grid(row=ngrok_row + 1, column=0, columnspan=2, sticky=tk.W, pady=(10, 0))

        btns = ttk.Frame(self, padding=(12, 0, 12, 12))
        btns.pack(fill=tk.X)
        ttk.Button(btns, text="Cancel", command=self.destroy).pack(side=tk.RIGHT, padx=4)
        ttk.Button(btns, text="Save", command=self._save).pack(side=tk.RIGHT)

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
            f"Looks for {bat_name} in the project root (Settings → global filename). "
            "MultiServer tunnels the demo port above — not hardcoded ports in project bats."
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
                    f"Found {found.name} (tunnels port {wrong} on its own); "
                    f"MultiServer will use demo port {demo_int} instead."
                )
            else:
                parts.append(f"Found {found.name}.")
        elif custom:
            parts.append(f"Custom script: {custom}")
        else:
            parts.append("No project ngrok script found — built-in ngrok http <demo port> is used.")
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
            f"(not used — avoids clashes with other demos)."
        )
        if msg != "OK":
            messagebox.showinfo("Auto-detect", msg + extra, parent=self)
        else:
            messagebox.showinfo(
                "Auto-detect",
                f"Assigned demo ports {info['demo_port']} / {info['server_port']}.{extra}",
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
        self.config_path = config_path
        self.store = ConfigStore(config_path)
        self.root = tk.Tk()
        self.root.title(f"MultiServer v{__version__} — Demo Host Manager")
        self.root.geometry("1100x700")
        self.root.minsize(900, 600)

        self.processes = ProcessManager(log_dir, on_log=self._on_process_log)
        self.status_server = StatusServer(
            manager_port(self.store.settings),
            manifest_provider=self._live_manifest_json,
        )
        self._status_job: str | None = None
        self._selected_id: str | None = None
        self._refreshing = False
        self._status_cache: dict[str, str] = {}
        self._poll_inflight = False

        self._build_ui()
        self._refresh_list(refresh_detail=True)
        self._schedule_status_poll()
        self._start_status_server()

        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def _live_manifest_json(self) -> str:
        try:
            mtime = self.store.path.stat().st_mtime
            if mtime != getattr(self, "_config_mtime", None):
                self._config_mtime = mtime
                self.store.load()
                self._refresh_tree()
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

    def _start_status_server(self) -> None:
        ok, msg = self.status_server.start()
        self._log(msg if ok else f"WARNING: {msg}")
        mp = manager_port(self.store.settings)
        self.statusbar.configure(
            text=f"Control API: http://127.0.0.1:{mp}/demos-manifest.json"
        )

    def _build_ui(self) -> None:
        style = ttk.Style()
        if "vista" in style.theme_names():
            style.theme_use("vista")

        toolbar = ttk.Frame(self.root, padding=8)
        toolbar.pack(fill=tk.X)

        ttk.Button(toolbar, text="Add system", command=self._add_system).pack(side=tk.LEFT, padx=2)
        ttk.Button(toolbar, text="Edit", command=self._edit_system).pack(side=tk.LEFT, padx=2)
        ttk.Button(toolbar, text="Remove", command=self._remove_system).pack(side=tk.LEFT, padx=2)
        ttk.Separator(toolbar, orient=tk.VERTICAL).pack(side=tk.LEFT, fill=tk.Y, padx=8)
        ttk.Button(toolbar, text="Start", command=self._start_selected).pack(side=tk.LEFT, padx=2)
        ttk.Button(toolbar, text="Stop", command=self._stop_selected).pack(side=tk.LEFT, padx=2)
        ttk.Button(toolbar, text="Start all", command=self._start_all).pack(side=tk.LEFT, padx=2)
        ttk.Button(toolbar, text="Stop all", command=self._stop_all).pack(side=tk.LEFT, padx=2)
        ttk.Separator(toolbar, orient=tk.VERTICAL).pack(side=tk.LEFT, fill=tk.Y, padx=8)
        ttk.Button(toolbar, text="Open demo", command=self._open_demo).pack(side=tk.LEFT, padx=2)
        ttk.Button(toolbar, text="Copy public URL", command=self._copy_public_url).pack(
            side=tk.LEFT, padx=2
        )
        ttk.Button(toolbar, text="Settings", command=self._edit_settings).pack(side=tk.LEFT, padx=2)
        ttk.Button(toolbar, text="Export manifest", command=self._export_manifest).pack(
            side=tk.LEFT, padx=2
        )
        ttk.Button(toolbar, text="Proxy snippets", command=self._show_proxy).pack(
            side=tk.LEFT, padx=2
        )
        ttk.Button(toolbar, text="Reassign all ports", command=self._reassign_all_ports).pack(
            side=tk.LEFT, padx=2
        )
        ttk.Button(toolbar, text="Sync website", command=self._sync_website).pack(
            side=tk.LEFT, padx=2
        )

        paned = ttk.Panedwindow(self.root, orient=tk.HORIZONTAL)
        paned.pack(fill=tk.BOTH, expand=True, padx=8, pady=(0, 8))

        left = ttk.Frame(paned, padding=4)
        paned.add(left, weight=1)

        cols = ("name", "slug", "status", "demo_port", "local_url")
        self.tree = ttk.Treeview(left, columns=cols, show="headings", height=20)
        self.tree.heading("name", text="System")
        self.tree.heading("slug", text="Slug")
        self.tree.heading("status", text="Status")
        self.tree.heading("demo_port", text="Port")
        self.tree.heading("local_url", text="Local URL")
        self.tree.column("name", width=140)
        self.tree.column("slug", width=100)
        self.tree.column("status", width=90)
        self.tree.column("demo_port", width=55)
        self.tree.column("local_url", width=220)
        self.tree.pack(fill=tk.BOTH, expand=True)
        self.tree.bind("<<TreeviewSelect>>", self._on_select)

        right = ttk.Frame(paned, padding=4)
        paned.add(right, weight=2)

        self.detail = scrolledtext.ScrolledText(right, height=12, wrap=tk.WORD, font=("Consolas", 10))
        self.detail.pack(fill=tk.BOTH, expand=False)
        self.detail.configure(state=tk.DISABLED)

        ttk.Label(right, text="Log").pack(anchor=tk.W, pady=(8, 0))
        self.log = scrolledtext.ScrolledText(right, height=16, wrap=tk.WORD, font=("Consolas", 9))
        self.log.pack(fill=tk.BOTH, expand=True)

        self.statusbar = ttk.Label(
            self.root,
            text=f"Ready — MultiServer v{__version__}",
            relief=tk.SUNKEN,
            anchor=tk.W,
            padding=4,
        )
        self.statusbar.pack(fill=tk.X)

    def _log(self, message: str) -> None:
        self.log.insert(tk.END, message + "\n")
        self.log.see(tk.END)

    def _on_process_log(self, system_id: str, message: str) -> None:
        sys = self.store.get_system(system_id)
        name = sys["name"] if sys else system_id[:8]
        self.root.after(0, lambda: self._log(f"[{name}] {message}"))

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

    def _tree_values(self, sys: dict, host: str) -> tuple:
        settings = self.store.settings
        return (
            sys["name"],
            sys.get("slug", ""),
            self._status_for_system(sys, host),
            sys.get("demo_port", ""),
            demo_local_url(settings, sys),
        )

    def _update_detail(self) -> None:
        sys = self._selected_system()
        self.detail.configure(state=tk.NORMAL)
        self.detail.delete("1.0", tk.END)
        if not sys:
            self.detail.configure(state=tk.DISABLED)
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
                    lines.append(f"Ngrok script: {found.name} (auto, demo port used)")
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
        lines.extend([
            f"Status: {self._status_for_system(sys, host)}",
            f"MultiServer API: http://127.0.0.1:{manager_port(settings)}/demos-manifest.json",
            "",
            f"Local demo:  {demo_local_url(settings, sys)}",
            f"Public demo: {demo_public_url(settings, sys)}",
            "",
            "Website: use public URL for “Open demo” buttons, or load demos-manifest.json.",
        ])
        port_issues = validate_system_ports(
            sys, self.store.systems, settings, check_bind=False
        )
        if port_issues:
            lines.extend(["", "Port checks:"])
            lines.extend(f"  • {i}" for i in port_issues[:6])
        if sys.get("notes"):
            lines.extend(["", f"Notes: {sys['notes']}"])
        self.detail.insert(tk.END, "\n".join(lines))
        self.detail.configure(state=tk.DISABLED)

    def _refresh_list(self, *, refresh_detail: bool = False) -> None:
        """Rebuild or update the system list without flicker."""
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

        if refresh_detail:
            self._update_detail()

    def _schedule_status_poll(self) -> None:
        self._poll_status_async()
        self._status_job = self.root.after(5000, self._schedule_status_poll)

    def _poll_status_async(self) -> None:
        if self._poll_inflight or not self.store.systems:
            return
        self._poll_inflight = True
        systems = list(self.store.systems)
        settings = self.store.settings
        host = settings.get("host", "127.0.0.1")
        if host in ("localhost", "0.0.0.0"):
            probe_host = "127.0.0.1"
        else:
            probe_host = host

        def work() -> None:
            updates: dict[str, tuple] = {}
            cache: dict[str, str] = {}
            for sys in systems:
                status = self.processes.status_text(sys, probe_host)
                cache[sys["id"]] = status
                display = self._status_for_system_from_cache(sys, status, settings)
                updates[sys["id"]] = (
                    sys["name"],
                    sys.get("slug", ""),
                    display,
                    sys.get("demo_port", ""),
                    demo_local_url(settings, sys),
                )
            self.root.after(0, lambda: self._apply_status_updates(updates, cache))

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
        self, updates: dict[str, tuple], cache: dict[str, str]
    ) -> None:
        self._poll_inflight = False
        self._status_cache.update(cache)
        if not updates:
            return
        self._refreshing = True
        try:
            for iid, values in updates.items():
                if self.tree.exists(iid) and self.tree.item(iid, "values") != values:
                    self.tree.item(iid, values=values)
        finally:
            self._refreshing = False

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
            self.root.after(0, lambda: self._log(msg))
            if ok:
                ports = self.processes.wait_for_ports(sys["id"], timeout=120)
                up = [p for p, v in ports.items() if v]

                def report_ports() -> None:
                    if up:
                        self._log(f"Ports ready: {up}")
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
                        self._log(msg)
                    if sys.get("ngrok_enabled"):
                        threading.Thread(
                            target=lambda: self._start_and_open_ngrok(sys),
                            daemon=True,
                        ).start()
                    elif up:
                        self.root.after(
                            0,
                            lambda: self._open_local_demo(sys),
                        )

                self.root.after(0, report_ports)
            self.root.after(0, self._refresh_list)

        threading.Thread(target=run, daemon=True).start()

    def _open_local_demo(self, sys: dict) -> None:
        url = demo_local_url(self.store.settings, sys)
        webbrowser.open(url)
        self._log(f"Opened {url}")

    def _start_and_open_ngrok(self, sys: dict) -> None:
        if not sys.get("ngrok_enabled"):
            return
        ok, msg = self.processes.ensure_ngrok_started(
            sys["id"], sys, settings=self.store.settings
        )
        if msg and msg != "Ngrok already running.":
            self.root.after(0, lambda: self._log(msg))
        public = self.processes.wait_for_ngrok_public_url(sys["id"], timeout=120.0)
        if public:
            self.root.after(0, lambda: self._open_ngrok_url(sys, public))
            return
        detail = "Ngrok public URL not ready after 120s."
        inspector = self.processes.ngrok_inspector_port(sys["id"])
        if inspector:
            detail += f" Check inspector http://127.0.0.1:{inspector}"
        self.root.after(0, lambda: self._log(detail))

    def _open_ngrok_url(self, sys: dict, url: str) -> None:
        webbrowser.open(url)
        self._log(f"Opened ngrok URL: {url}")
        self._refresh_list(refresh_detail=True)

    def _stop_selected(self) -> None:
        sys = self._selected_system()
        if not sys:
            return
        ok, msg = self.processes.stop(sys["id"])
        self._log(msg)
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
                self._log(f"Opened ngrok URL: {public}")
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
        win = tk.Toplevel(self.root)
        win.title("Global settings")
        win.geometry("560x460")
        win.transient(self.root)
        win.grab_set()

        base_var = tk.StringVar(value=s.get("base_domain", ""))
        host_var = tk.StringVar(value=s.get("host", "localhost"))
        prefix_var = tk.StringVar(value=s.get("url_path_prefix", "/demo"))
        mgr_var = tk.StringVar(value=str(s.get("manager_port", 5674)))
        range_start_var = tk.StringVar(value=str(s.get("demo_port_range_start", 8100)))
        range_end_var = tk.StringVar(value=str(s.get("demo_port_range_end", 8990)))
        step_var = tk.StringVar(value=str(s.get("port_block_step", 10)))
        website_var = tk.StringVar(value=s.get("website_public_dir", ""))
        ngrok_bat_var = tk.StringVar(value=s.get("ngrok_bat_name", "start-ngrok.bat"))
        ngrok_inspector_var = tk.StringVar(
            value=str(s.get("ngrok_inspector_port_start", 4040))
        )

        f = ttk.Frame(win, padding=12)
        f.pack(fill=tk.BOTH, expand=True)
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
        ]
        for label, var in fields:
            ttk.Label(f, text=label).pack(anchor=tk.W)
            ttk.Entry(f, textvariable=var, width=55).pack(fill=tk.X, pady=(0, 6))

        def save() -> None:
            try:
                new_mgr = int(mgr_var.get())
                rs = int(range_start_var.get())
                re = int(range_end_var.get())
                st = int(step_var.get())
                ngrok_inspector = int(ngrok_inspector_var.get())
            except ValueError:
                messagebox.showerror("Settings", "Ports and range must be numbers.", parent=win)
                return
            self.store.data["settings"] = {
                "base_domain": base_var.get().strip(),
                "website_public_dir": website_var.get().strip(),
                "host": host_var.get().strip() or "localhost",
                "url_path_prefix": prefix_var.get().strip() or "/demo",
                "manager_port": new_mgr,
                "demo_port_range_start": rs,
                "demo_port_range_end": re,
                "port_block_step": st,
                "ngrok_bat_name": ngrok_bat_var.get().strip() or "start-ngrok.bat",
                "ngrok_inspector_port_start": ngrok_inspector,
            }
            self.store.save()
            self.status_server.stop()
            self.status_server.port = new_mgr
            self._start_status_server()
            self._refresh_list(refresh_detail=True)
            win.destroy()

        ttk.Button(f, text="Save", command=save).pack(anchor=tk.E, pady=8)

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
        win = tk.Toplevel(self.root)
        win.title("Reverse proxy snippets")
        win.geometry("720x480")
        nb = ttk.Notebook(win)
        nb.pack(fill=tk.BOTH, expand=True, padx=8, pady=8)
        from .urls import caddy_full_config

        for label, text in (
            ("Caddy (snippet)", caddy_snippet(self.store.settings, self.store.systems)),
            (
                "Caddy (full Caddyfile)",
                caddy_full_config(self.store.settings, self.store.systems),
            ),
            ("nginx", nginx_snippet(self.store.settings, self.store.systems)),
        ):
            tab = ttk.Frame(nb)
            nb.add(tab, text=label)
            box = scrolledtext.ScrolledText(tab, font=("Consolas", 9))
            box.pack(fill=tk.BOTH, expand=True)
            box.insert(tk.END, text)

    def _on_close(self) -> None:
        if self._status_job:
            self.root.after_cancel(self._status_job)
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
