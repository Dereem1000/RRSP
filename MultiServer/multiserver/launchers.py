"""Platform-specific commands to start nodejs-split demos (client + server)."""

from __future__ import annotations

import json
import sys
from pathlib import Path


def _available_scripts(project_dir: Path) -> set[str]:
    pkg_path = project_dir / "package.json"
    if not pkg_path.is_file():
        return set()
    try:
        pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return set()
    scripts = pkg.get("scripts") or {}
    if not isinstance(scripts, dict):
        return set()
    return {str(name).strip() for name in scripts.keys() if str(name).strip()}


def _pick_script(project_dir: Path, *preferred: str) -> str | None:
    scripts = _available_scripts(project_dir)
    for name in preferred:
        if name in scripts:
            return name
    return None


def prepare_vite_multiserver_config(
    client_dir: Path,
    client_port: int,
    server_port: int,
    *,
    public_base_path: str | None = None,
) -> Path:
    """Vite config for dev: correct UI port, API proxy, optional /demo/<slug>/ base."""
    path = client_dir / "vite.config.multiserver.mts"
    base = ""
    api_proxy = ""
    redirect_plugin = ""
    if public_base_path:
        p = public_base_path.rstrip("/")
        base_path = f"{p}/"
        base = f'  base: "{base_path}",\n'
        api_proxy = (
            f'      "{p}/api": {{\n'
            f'        target: "http://127.0.0.1:{server_port}",\n'
            "        changeOrigin: true,\n"
            f'        rewrite: (path) => path.replace(new RegExp("^{p}"), ""),\n'
            "      },\n"
        )
        redirect_plugin = f"""
function redirectRootToBase() {{
  const base = "{base_path}";
  return {{
    name: "redirect-root-to-base",
    configureServer(server) {{
      server.middlewares.use((req, res, next) => {{
        if (req.url === "/" || req.url === "") {{
          res.writeHead(302, {{ Location: base }});
          res.end();
          return;
        }}
        next();
      }});
    }},
  }};
}}
"""
    path.write_text(
        (
            'import { defineConfig } from "vite";\n'
            'import react from "@vitejs/plugin-react";\n'
            f"{redirect_plugin}"
            "\n"
            "export default defineConfig({\n"
            f"{base}"
            "  plugins: [react()"
            + (", redirectRootToBase()]," if public_base_path else "],")
            + "\n"
            "  server: {\n"
            '    host: "127.0.0.1",\n'
            f"    port: {client_port},\n"
            "    strictPort: true,\n"
            "    proxy: {\n"
            f"{api_proxy}"
            '      "/api": {\n'
            f'        target: "http://127.0.0.1:{server_port}",\n'
            "        changeOrigin: true,\n"
            "      },\n"
            "    },\n"
            "  },\n"
            "});\n"
        ),
        encoding="utf-8",
    )
    return path


def _write_run_client_bat(
    client_dir: Path,
    client_port: int,
    server_port: int,
    path: Path,
    *,
    public_base_path: str | None = None,
    public_api_path: str | None = None,
) -> None:
    client_dir = client_dir.resolve()
    lines = ["@echo off", f'cd /d "{client_dir}"', "set BROWSER=none"]

    if (client_dir / "vite.config.ts").exists() or (client_dir / "vite.config.js").exists():
        cfg = prepare_vite_multiserver_config(
            client_dir,
            client_port,
            server_port,
            public_base_path=public_base_path,
        )
        lines.append(f'call npm run dev -- --config "{cfg}" --strictPort')
    else:
        pkg_path = client_dir / "package.json"
        use_cra = False
        if pkg_path.exists():
            try:
                pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
                deps = {
                    **(pkg.get("dependencies") or {}),
                    **(pkg.get("devDependencies") or {}),
                }
                use_cra = "react-scripts" in deps
            except json.JSONDecodeError:
                pass
        if use_cra:
            lines.append(f"set PORT={client_port}")
            lines.append("call npm start")
        else:
            lines.append(f"call npm run dev -- --port {client_port}")

    path.write_text("\r\n".join(lines) + "\r\n", encoding="utf-8")


def write_multiserver_launcher(
    working: Path,
    client_port: int,
    server_port: int,
    *,
    public_base_path: str | None = None,
    public_api_path: str | None = None,
) -> Path:
    """
    Write .multiserver/*.bat launchers (no fragile nested quotes).
    Returns path to main launch.bat to execute.
    """
    working = working.resolve()
    server_dir = (working / "server").resolve()
    client_dir = (working / "client").resolve()
    ms_dir = working / ".multiserver"
    ms_dir.mkdir(exist_ok=True)

    server_bat = ms_dir / "run-server.bat"
    client_bat = ms_dir / "run-client.bat"
    launch_bat = ms_dir / "launch.bat"

    server_working = server_dir if (server_dir / "package.json").is_file() else working
    server_script = _pick_script(server_working, "dev", "start") or "dev"
    server_bat.write_text(
        f"@echo off\r\n"
        f'cd /d "{server_working}"\r\n'
        f"set PORT={server_port}\r\n"
        f"call npm run {server_script}\r\n",
        encoding="utf-8",
    )

    has_client = (client_dir / "package.json").is_file()
    if not has_client:
        launch_bat.write_text(
            f"@echo off\r\n"
            f'cd /d "{working}"\r\n'
            f'call "{server_bat}"\r\n',
            encoding="utf-8",
        )
        return launch_bat

    _write_run_client_bat(
        client_dir,
        client_port,
        server_port,
        client_bat,
        public_base_path=public_base_path,
        public_api_path=public_api_path,
    )

    conc = working / "node_modules" / ".bin" / "concurrently.cmd"
    if conc.is_file():
        # Paths with spaces must run via cmd /c "..." or concurrently splits at spaces
        server_invoke = f'cmd /c \\"{server_bat}\\"'
        client_invoke = f'cmd /c \\"{client_bat}\\"'
        launch_bat.write_text(
            f"@echo off\r\n"
            f'cd /d "{working}"\r\n'
            f'call "{conc}" -n server,client -c blue,green '
            f'"{server_invoke}" "{client_invoke}"\r\n',
            encoding="utf-8",
        )
    else:
        launch_bat.write_text(
            f"@echo off\r\n"
            f'cd /d "{working}"\r\n'
            f'start "multiserver-server" /MIN cmd /c "{server_bat}"\r\n'
            f'start "multiserver-client" /MIN cmd /c "{client_bat}"\r\n'
            f"echo MultiServer demo running. Close this window to stop.\r\n"
            f":wait\r\n"
            f"ping 127.0.0.1 -n 3601 >nul\r\n"
            f"goto wait\r\n",
            encoding="utf-8",
        )

    return launch_bat


def has_cra_production_build(working: Path) -> bool:
    """Pre-built React app in client/build (API-only Express at root/server)."""
    working = working.resolve()
    return (working / "client" / "build" / "index.html").is_file() and (
        (working / "server" / "index.js").is_file()
        or (working / "package.json").is_file()
    )


def write_cra_build_launcher(
    working: Path,
    client_port: int,
    server_port: int,
) -> Path:
    """
    POS-style deployment: serve client/build on client_port, API on server_port.
    Root `npm start` is API-only and does not serve the CRA bundle at /.
    """
    working = working.resolve()
    build_dir = (working / "client" / "build").resolve()
    ms_dir = working / ".multiserver"
    ms_dir.mkdir(exist_ok=True)

    server_bat = ms_dir / "run-pos-api.bat"
    client_bat = ms_dir / "run-pos-ui.bat"
    launch_bat = ms_dir / "launch.bat"

    server_dir = working / "server"
    if (server_dir / "index.js").is_file():
        server_lines = [
            "@echo off",
            f'cd /d "{server_dir}"',
            f"set PORT={server_port}",
            "set MULTISERVER=1",
            "node index.js",
        ]
    else:
        server_lines = [
            "@echo off",
            f'cd /d "{working}"',
            f"set PORT={server_port}",
            "set MULTISERVER=1",
            "call npm run start",
        ]
    server_bat.write_text("\r\n".join(server_lines) + "\r\n", encoding="utf-8")

    client_bat.write_text(
        "\r\n".join(
            [
                "@echo off",
                f'cd /d "{working}"',
                "set BROWSER=none",
                f'call npx --yes serve@14 -s "{build_dir}" -l {client_port}',
            ]
        )
        + "\r\n",
        encoding="utf-8",
    )

    conc = working / "node_modules" / ".bin" / "concurrently.cmd"
    if conc.is_file():
        server_invoke = f'cmd /c \\"{server_bat}\\"'
        client_invoke = f'cmd /c \\"{client_bat}\\"'
        launch_bat.write_text(
            f"@echo off\r\n"
            f'cd /d "{working}"\r\n'
            f'call "{conc}" -n api,ui -c blue,green '
            f'"{server_invoke}" "{client_invoke}"\r\n',
            encoding="utf-8",
        )
    else:
        launch_bat.write_text(
            f"@echo off\r\n"
            f'cd /d "{working}"\r\n'
            f'start "pos-api" /MIN cmd /c "{server_bat}"\r\n'
            f'start "pos-ui" /MIN cmd /c "{client_bat}"\r\n'
            f"echo POS demo: UI :{client_port}  API :{server_port}\r\n"
            f":wait\r\n"
            f"ping 127.0.0.1 -n 3601 >nul\r\n"
            f"goto wait\r\n",
            encoding="utf-8",
        )

    return launch_bat


def build_nodejs_split_command(
    working: Path,
    client_port: int,
    server_port: int,
    *,
    public_base_path: str | None = None,
    public_api_path: str | None = None,
) -> list[str]:
    launch_bat = write_multiserver_launcher(
        working,
        client_port,
        server_port,
        public_base_path=public_base_path,
        public_api_path=public_api_path,
    )
    if sys.platform == "win32":
        return ["cmd", "/c", str(launch_bat)]
    # Unix fallback
    working = working.resolve()
    server_dir = working / "server"
    client_dir = working / "client"
    server_target = server_dir if (server_dir / "package.json").is_file() else working
    server_script = _pick_script(server_target, "dev", "start") or "dev"
    server_cmd = f'cd "{server_target}" && PORT={server_port} npm run {server_script}'
    if (client_dir / "package.json").is_file():
        client_cmd = f'cd "{client_dir}" && npm run dev -- --port {client_port}'
    else:
        client_cmd = 'echo "No standalone client package found; using server-only startup."'
    return [
        "sh",
        "-c",
        f'npx concurrently -n server,client "{server_cmd}" "{client_cmd}"',
    ]
