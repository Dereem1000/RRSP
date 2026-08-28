"""Port reservation, allocation, and conflict detection for MultiServer."""

from __future__ import annotations

import socket
from typing import Any

# MultiServer control API (manifest / health) — never assign to demos
DEFAULT_MANAGER_PORT = 5674

# Each demo gets a block in this range (avoids 3000, 5000, 6001, etc.)
DEFAULT_DEMO_PORT_RANGE_START = 8100
DEFAULT_DEMO_PORT_RANGE_END = 8990
DEFAULT_PORT_BLOCK_STEP = 10

# Typical app defaults — used as hints only, not assigned when auto-allocating
COMMON_APP_PORTS = frozenset(
    {3000, 3001, 3002, 5173, 5000, 5001, 5002, 6000, 6001, 8080, 8443}
)


class PortAllocationError(RuntimeError):
    pass


def manager_port(settings: dict | None = None) -> int:
    return int((settings or {}).get("manager_port") or DEFAULT_MANAGER_PORT)


def port_range(settings: dict | None = None) -> tuple[int, int, int]:
    s = settings or {}
    start = int(s.get("demo_port_range_start") or DEFAULT_DEMO_PORT_RANGE_START)
    end = int(s.get("demo_port_range_end") or DEFAULT_DEMO_PORT_RANGE_END)
    step = int(s.get("port_block_step") or DEFAULT_PORT_BLOCK_STEP)
    return start, end, step


def reserved_ports(settings: dict | None = None) -> set[int]:
    mp = manager_port(settings)
    return {mp, DEFAULT_MANAGER_PORT}


def ports_for_system(system: dict) -> set[int]:
    out: set[int] = set()
    for key in ("client_port", "server_port", "demo_port"):
        val = system.get(key)
        if val:
            out.add(int(val))
    for val in system.get("extra_ports") or []:
        if val:
            out.add(int(val))
    return out


def used_ports_by_systems(
    systems: list[dict], exclude_id: str | None = None
) -> dict[int, str]:
    """Map port -> system id that owns it (duplicate keys keep first)."""
    mapping: dict[int, str] = {}
    for sys in systems:
        if exclude_id and sys.get("id") == exclude_id:
            continue
        for port in ports_for_system(sys):
            if port not in mapping:
                mapping[port] = sys.get("id") or sys.get("name") or "?"
    return mapping


def is_port_bindable(port: int, host: str = "127.0.0.1") -> bool:
    """True if nothing is listening on this port (we can bind it)."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind((host, port))
            return True
    except OSError:
        return False


def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    return not is_port_bindable(port, host)


def find_duplicate_assignments(
    systems: list[dict], exclude_id: str | None = None
) -> list[str]:
    """Two configured systems using the same port."""
    seen: dict[int, str] = {}
    issues: list[str] = []
    for sys in systems:
        if exclude_id and sys.get("id") == exclude_id:
            continue
        name = sys.get("name") or sys.get("id", "?")[:8]
        for port in ports_for_system(sys):
            if port in seen:
                issues.append(
                    f"Port {port} used by both '{seen[port]}' and '{name}'."
                )
            else:
                seen[port] = name
    return issues


def validate_system_ports(
    system: dict,
    systems: list[dict],
    settings: dict | None = None,
    host: str = "127.0.0.1",
    check_bind: bool = True,
) -> list[str]:
    """Return human-readable problems (empty = OK)."""
    issues: list[str] = []
    sid = system.get("id")
    name = system.get("name") or "System"
    reserved = reserved_ports(settings)

    for port in ports_for_system(system):
        if port in reserved:
            issues.append(
                f"{name}: port {port} is reserved for MultiServer (control API on "
                f"{manager_port(settings)})."
            )
        if port in COMMON_APP_PORTS:
            issues.append(
                f"{name}: port {port} is a common default (3000/5000/6001…) — "
                "another app may clash; use auto-assign."
            )

    for msg in find_duplicate_assignments(systems):
        if name in msg:
            issues.append(msg)

    used = used_ports_by_systems(systems, exclude_id=sid)
    for port in ports_for_system(system):
        owner = used.get(port)
        if owner:
            issues.append(f"Port {port} already assigned to another system.")

    if check_bind:
        for port in ports_for_system(system):
            if not is_port_bindable(port, host):
                issues.append(
                    f"Port {port} is already in use on {host} (another process)."
                )

    return issues


def _ports_needed(stack: str, preferred: dict | None = None) -> tuple[int, ...]:
    if stack == "nodejs-split":
        return (0, 1)  # client at base, server at base+1
    if stack == "pm2-ecosystem" and (preferred or {}).get("vault_port"):
        return (0, 1)  # API at base, master-vault at base+1
    return (0,)  # single-port stacks: nextjs, nextjs-dist, python-flask, custom


def allocate_ports(
    systems: list[dict],
    settings: dict | None = None,
    stack: str = "custom",
    exclude_id: str | None = None,
    preferred: dict | None = None,
    host: str = "127.0.0.1",
) -> dict[str, Any]:
    """
    Assign non-clashing ports from the high demo range.
    `preferred` holds detected app defaults (for notes only).
    """
    start, end, step = port_range(settings)
    reserved = reserved_ports(settings)
    used = set(used_ports_by_systems(systems, exclude_id).keys()) | reserved
    pref = preferred or {}

    needs_vault = stack == "pm2-ecosystem" and pref.get("vault_port")

    for base in range(start, end, step):
        if stack == "nodejs-split":
            client_p, server_p = base, base + 1
            block = (client_p, server_p)
            extra_ports: list[int] = []
        elif needs_vault:
            client_p = server_p = demo_p = base
            vault_p = base + 1
            block = (client_p, vault_p)
            extra_ports = [vault_p]
        else:
            client_p = server_p = demo_p = base
            block = (base,)
            extra_ports = []

        if any(p in used for p in block):
            continue
        if any(not is_port_bindable(p, host) for p in block):
            continue

        demo_p = client_p
        notes = ""
        if pref:
            hints = []
            for label, key in (
                ("detected UI", "client_port"),
                ("detected API", "server_port"),
            ):
                if pref.get(key) and pref.get(key) not in block:
                    hints.append(f"{label}={pref[key]}")
            if needs_vault and pref.get("vault_port") and pref.get("vault_port") not in block:
                hints.append(f"detected vault={pref['vault_port']}")
            if hints:
                port_label = f"{demo_p}"
                if needs_vault:
                    port_label = f"{demo_p} (API) + {vault_p} (vault)"
                notes = (
                    f"App defaults: {', '.join(hints)}. "
                    f"MultiServer assigned {port_label} to avoid clashes."
                )

        return {
            "client_port": client_p,
            "server_port": server_p,
            "demo_port": demo_p,
            "extra_ports": extra_ports,
            "notes": notes,
        }

    raise PortAllocationError(
        f"No free port block between {start} and {end} (step {step}). "
        "Stop other demos or raise demo_port_range_end in Settings."
    )


def reassign_all_systems(
    systems: list[dict], settings: dict | None = None
) -> list[dict]:
    """Re-allocate ports for every system (stable order)."""
    updated: list[dict] = []
    for sys in systems:
        stack = sys.get("type") or "auto"
        if stack == "auto":
            from .detectors import detect_stack
            from pathlib import Path

            stack = detect_stack(Path(sys.get("working_dir", "")))
        alloc = allocate_ports(updated, settings, stack=stack, exclude_id=None)
        merged = {**sys, **alloc}
        if alloc.get("notes"):
            old_notes = (sys.get("notes") or "").strip()
            merged["notes"] = (old_notes + "\n" + alloc["notes"]).strip()
        updated.append(merged)
    return updated
