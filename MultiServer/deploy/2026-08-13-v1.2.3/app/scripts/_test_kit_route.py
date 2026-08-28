from pathlib import Path
import json
from multiserver.mini_routes import handle_mini_request, MiniRouteContext, INTEGRATION_KIT_VERSION

mini = {
    "mini_connection_token": "t",
    "mini_api_token": "api",
    "mini_connection_status": "accepted",
    "company_name": "CD",
}
ctx = MiniRouteContext(
    get_mini=lambda: mini,
    save_mini=lambda m: None,
    install_root=Path("."),
    preserves_path=None,
)
print("health", handle_mini_request("GET", "/api/integrations/mini/health", b"", ctx))
probe_body = json.dumps({"entry_id": "__route_probe__"}).encode()
print(
    "probe",
    handle_mini_request(
        "POST",
        "/api/integrations/mini/integration-kit/apply-update",
        probe_body,
        ctx,
        headers={"Authorization": "Bearer api"},
    ),
)
kit_body = json.dumps({"entry_id": "abc"}).encode()
print(
    "kit",
    handle_mini_request(
        "POST",
        "/api/integrations/mini/integration-kit/apply-update",
        kit_body,
        ctx,
        headers={"Authorization": "Bearer api"},
    ),
)
print("ver", INTEGRATION_KIT_VERSION)
