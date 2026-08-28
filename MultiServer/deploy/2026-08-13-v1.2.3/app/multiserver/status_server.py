"""Lightweight HTTP server on the manager port for manifest, health, Mini, resources."""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Callable
from urllib.parse import urlparse

try:
    from multiserver import __version__ as MULTISERVER_VERSION
except ImportError:
    from . import __version__ as MULTISERVER_VERSION


class _Handler(BaseHTTPRequestHandler):
    get_manifest: Callable[[], str] = lambda: "{}"
    mini_context = None  # MiniRouteContext | None
    bind_host: str = "127.0.0.1"

    def log_message(self, format: str, *args) -> None:
        pass  # quiet

    def _send(self, code: int, body: str, content_type: str = "application/json") -> None:
        data = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
        self.wfile.write(data)

    def _send_json(self, code: int, payload: dict) -> None:
        self._send(code, json.dumps(payload))

    def do_OPTIONS(self) -> None:
        self._send(204, "")

    def _read_body(self) -> bytes:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return b""
        return self.rfile.read(length)

    def _dispatch(self, method: str) -> None:
        path = urlparse(self.path).path
        if _Handler.mini_context is not None:
            from .mini_routes import handle_mini_request

            body = self._read_body() if method == "POST" else b""
            handled = handle_mini_request(
                method,
                path,
                body,
                _Handler.mini_context,
                headers=dict(self.headers.items()) if self.headers else None,
            )
            if handled is not None:
                code, payload = handled
                self._send_json(code, payload)
                return

        if method == "GET":
            if path in ("/", "/health"):
                self._send_json(
                    200,
                    {
                        "status": "ok",
                        "service": "MultiServer",
                        "version": MULTISERVER_VERSION,
                    },
                )
                return
            if path in ("/demos-manifest.json", "/manifest.json"):
                self._send(200, self.get_manifest())
                return

        self._send_json(
            404,
            {
                "error": "not_found",
                "endpoints": [
                    "/health",
                    "/demos-manifest.json",
                    "/resources.json",
                    "/api/integrations/mini/health",
                    "/api/integrations/mini/connection-status",
                    "/api/integrations/mini/apply-update",
                    "/api/integrations/mini/integration-kit/apply-update",
                ],
            },
        )

    def do_GET(self) -> None:
        self._dispatch("GET")

    def do_POST(self) -> None:
        self._dispatch("POST")


class StatusServer:
    def __init__(
        self,
        port: int,
        manifest_provider: Callable[[], str],
        *,
        host: str = "127.0.0.1",
        mini_context=None,
    ) -> None:
        self.port = port
        self.host = host
        self._manifest_provider = manifest_provider
        self.mini_context = mini_context
        self._httpd: ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None

    def start(self) -> tuple[bool, str]:
        if self._httpd:
            return True, f"Already listening on {self.host}:{self.port}"

        _Handler.get_manifest = self._manifest_provider
        _Handler.mini_context = self.mini_context
        _Handler.bind_host = self.host
        try:
            self._httpd = ThreadingHTTPServer((self.host, self.port), _Handler)
        except OSError as exc:
            return False, f"Could not bind manager port {self.port}: {exc}"

        self._thread = threading.Thread(target=self._httpd.serve_forever, daemon=True)
        self._thread.start()
        return True, f"Control API: http://{self.host}:{self.port}/demos-manifest.json"

    def stop(self) -> None:
        if self._httpd:
            self._httpd.shutdown()
            self._httpd = None
        self._thread = None

    def reconfigure(self, *, host: str | None = None, mini_context=None) -> None:
        if host is not None:
            self.host = host
        if mini_context is not None:
            self.mini_context = mini_context
            _Handler.mini_context = mini_context
