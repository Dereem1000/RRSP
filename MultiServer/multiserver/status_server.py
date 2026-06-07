"""Lightweight HTTP server on the manager port (default 5674) for manifest + health."""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Callable

from .ports import DEFAULT_MANAGER_PORT

try:
    from multiserver import __version__ as MULTISERVER_VERSION
except ImportError:
    from . import __version__ as MULTISERVER_VERSION


class _Handler(BaseHTTPRequestHandler):
    get_manifest: Callable[[], str] = lambda: "{}"

    def log_message(self, format: str, *args) -> None:
        pass  # quiet

    def _send(self, code: int, body: str, content_type: str = "application/json") -> None:
        data = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0]
        if path in ("/", "/health"):
            self._send(
                200,
                json.dumps(
                    {
                        "status": "ok",
                        "service": "MultiServer",
                        "version": MULTISERVER_VERSION,
                    }
                ),
            )
        elif path in ("/demos-manifest.json", "/manifest.json"):
            self._send(200, self.get_manifest())
        else:
            self._send(
                404,
                json.dumps(
                    {
                        "error": "not_found",
                        "endpoints": ["/health", "/demos-manifest.json"],
                    }
                ),
            )


class StatusServer:
    def __init__(self, port: int, manifest_provider: Callable[[], str]) -> None:
        self.port = port
        self._manifest_provider = manifest_provider
        self._httpd: ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None

    def start(self) -> tuple[bool, str]:
        if self._httpd:
            return True, f"Already listening on port {self.port}"

        _Handler.get_manifest = self._manifest_provider
        try:
            self._httpd = ThreadingHTTPServer(("127.0.0.1", self.port), _Handler)
        except OSError as exc:
            return False, f"Could not bind manager port {self.port}: {exc}"

        self._thread = threading.Thread(target=self._httpd.serve_forever, daemon=True)
        self._thread.start()
        return True, f"Control API: http://127.0.0.1:{self.port}/demos-manifest.json"

    def stop(self) -> None:
        if self._httpd:
            self._httpd.shutdown()
            self._httpd = None
        self._thread = None
