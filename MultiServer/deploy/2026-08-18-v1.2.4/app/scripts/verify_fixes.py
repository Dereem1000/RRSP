"""Smoke checks after MultiServer Mini/config fixes."""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from multiserver import __version__
from multiserver.config import ConfigStore
from multiserver.mini_kit_version import load_kit_version
from multiserver.mini_routes import MiniRouteContext, handle_mini_request
from multiserver.process_manager import ProcessManager


def main() -> None:
    kit = load_kit_version(ROOT)
    assert kit["version"], "kit version missing"
    assert kit["version"] != "python-native"

    cfg = Path(tempfile.mkdtemp()) / "config.json"
    store = ConfigStore(cfg)
    for name in ("mini", "save_mini", "replace_mini"):
        assert hasattr(store, name), f"missing ConfigStore.{name}"

    store.save_mini(
        {
            "company_name": "Computer Dynamics",
            "mini_base_url": "https://mini.computerdynamicstt.com",
            "mini_api_token": "api",
            "mini_connection_token": "tok",
        }
    )

    pm = ProcessManager(Path(tempfile.mkdtemp()))
    assert pm.all_root_pids() == {}

    mini = dict(store.mini)
    ctx = MiniRouteContext(
        get_mini=lambda: mini,
        save_mini=lambda m: mini.update(m),
        install_root=ROOT,
        preserves_path=None,
    )

    code, body = handle_mini_request("GET", "/api/integrations/mini/health", b"", ctx)
    assert code == 200
    assert body.get("system_key") == "multiserver"
    assert body.get("integration_kit_version") == kit["version"], body

    probe_body = json.dumps({"entry_id": "__route_probe__"}).encode()
    code, body = handle_mini_request(
        "POST",
        "/api/integrations/mini/integration-kit/apply-update",
        probe_body,
        ctx,
        headers={"Authorization": "Bearer api"},
    )
    assert code == 200 and body.get("probe") is True, body

    import multiserver.gui  # noqa: F401

    print(f"verify_fixes ok (MultiServer {__version__}, kit {kit['version']})")


if __name__ == "__main__":
    main()
