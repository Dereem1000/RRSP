"""Host and per-system resource sampling via psutil."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

try:
    import psutil
except ImportError:
    psutil = None  # type: ignore


@dataclass
class SystemResources:
    system_id: str
    cpu_percent: float = 0.0
    ram_bytes: int = 0
    ram_percent_of_host: float = 0.0
    process_count: int = 0
    warn: bool = False

    @property
    def ram_mb(self) -> float:
        return self.ram_bytes / (1024 * 1024)


@dataclass
class HostSnapshot:
    cpu_percent: float = 0.0
    ram_used: int = 0
    ram_total: int = 0
    ram_percent: float = 0.0
    disk_percent: float | None = None
    demos_cpu: float = 0.0
    demos_ram: int = 0
    systems: dict[str, SystemResources] = field(default_factory=dict)
    host_warn: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "cpu_percent": round(self.cpu_percent, 1),
            "ram_used": self.ram_used,
            "ram_total": self.ram_total,
            "ram_percent": round(self.ram_percent, 1),
            "disk_percent": (
                round(self.disk_percent, 1) if self.disk_percent is not None else None
            ),
            "demos_cpu": round(self.demos_cpu, 1),
            "demos_ram": self.demos_ram,
            "host_warn": self.host_warn,
            "systems": {
                sid: {
                    "cpu_percent": round(s.cpu_percent, 1),
                    "ram_bytes": s.ram_bytes,
                    "ram_mb": round(s.ram_mb, 1),
                    "ram_percent_of_host": round(s.ram_percent_of_host, 2),
                    "process_count": s.process_count,
                    "warn": s.warn,
                    "cpu_share_of_demos": (
                        round(100.0 * s.cpu_percent / self.demos_cpu, 1)
                        if self.demos_cpu > 0.05
                        else 0.0
                    ),
                    "ram_share_of_demos": (
                        round(100.0 * s.ram_bytes / self.demos_ram, 1)
                        if self.demos_ram > 0
                        else 0.0
                    ),
                }
                for sid, s in self.systems.items()
            },
        }


def _tree_pids(root_pid: int) -> list[int]:
    if not psutil:
        return []
    pids = [root_pid]
    try:
        parent = psutil.Process(root_pid)
        for child in parent.children(recursive=True):
            pids.append(child.pid)
    except (psutil.Error, OSError):
        pass
    return pids


def _collect_tree_procs(root_pids: list[int]) -> list[Any]:
    if not psutil or not root_pids:
        return []
    seen: set[int] = set()
    procs: list[Any] = []
    for root in root_pids:
        if not root:
            continue
        for pid in _tree_pids(int(root)):
            if pid in seen:
                continue
            seen.add(pid)
            try:
                procs.append(psutil.Process(pid))
            except (psutil.Error, OSError):
                continue
    return procs


def sample_process_tree(
    root_pids: list[int], *, already_warmed: bool = False
) -> tuple[float, int, int]:
    """Return (cpu_percent of host capacity, rss_bytes, process_count).

    Process.cpu_percent(interval=None) returns 0 on the first call per pid.
    When already_warmed is False, warm counters then sleep briefly before reading.
    """
    if not psutil or not root_pids:
        return 0.0, 0, 0
    procs = _collect_tree_procs(root_pids)
    if not procs:
        return 0.0, 0, 0

    if not already_warmed:
        for proc in procs:
            try:
                proc.cpu_percent(interval=None)
            except (psutil.Error, OSError):
                pass
        time.sleep(0.12)

    cpu_raw = 0.0
    rss = 0
    count = 0
    for proc in procs:
        try:
            cpu_raw += float(proc.cpu_percent(interval=None))
            rss += int(proc.memory_info().rss)
            count += 1
        except (psutil.Error, OSError):
            continue
    cores = max(psutil.cpu_count(logical=True) or 1, 1)
    # cpu_percent per process is already "% of one core"; sum / cores ≈ % of host.
    return cpu_raw / cores, rss, count


class ResourceMonitor:
    """Sample host + owned process trees. Safe to call from a worker thread."""

    def __init__(self) -> None:
        self._proc_cpu_warmed: set[int] = set()
        if psutil:
            try:
                # Prime system-wide counter (first call is always 0).
                psutil.cpu_percent(interval=None)
            except Exception:
                pass

    def sample(
        self,
        system_roots: dict[str, list[int]],
        *,
        host_cpu_warn: float = 85.0,
        host_ram_warn: float = 90.0,
        demo_cpu_warn: float = 50.0,
    ) -> HostSnapshot:
        snap = HostSnapshot()
        if not psutil:
            return snap

        try:
            # Blocking interval avoids the chronic 0% from interval=None alone.
            snap.cpu_percent = float(psutil.cpu_percent(interval=0.15))
            mem = psutil.virtual_memory()
            snap.ram_used = int(mem.used)
            snap.ram_total = int(mem.total)
            snap.ram_percent = float(mem.percent)
        except Exception:
            return snap

        try:
            snap.disk_percent = float(psutil.disk_usage("C:\\").percent)
        except Exception:
            try:
                snap.disk_percent = float(psutil.disk_usage("/").percent)
            except Exception:
                snap.disk_percent = None

        # Warm demo PID CPU counters, then read after a short interval.
        warm_targets: list[Any] = []
        for roots in system_roots.values():
            warm_targets.extend(_collect_tree_procs(roots))
        if warm_targets:
            for proc in warm_targets:
                try:
                    proc.cpu_percent(interval=None)
                    self._proc_cpu_warmed.add(proc.pid)
                except (psutil.Error, OSError):
                    pass
            # Brief window so non-blocking Process.cpu_percent reads are meaningful.
            time.sleep(0.12)

        demos_cpu = 0.0
        demos_ram = 0
        for sid, roots in system_roots.items():
            cpu, rss, count = sample_process_tree(roots, already_warmed=True)
            warn = cpu >= demo_cpu_warn
            entry = SystemResources(
                system_id=sid,
                cpu_percent=cpu,
                ram_bytes=rss,
                ram_percent_of_host=(
                    (100.0 * rss / snap.ram_total) if snap.ram_total else 0.0
                ),
                process_count=count,
                warn=warn,
            )
            snap.systems[sid] = entry
            demos_cpu += cpu
            demos_ram += rss

        snap.demos_cpu = demos_cpu
        snap.demos_ram = demos_ram
        snap.host_warn = (
            snap.cpu_percent >= host_cpu_warn or snap.ram_percent >= host_ram_warn
        )
        return snap


def format_bytes(n: int) -> str:
    if n >= 1024**3:
        return f"{n / (1024**3):.1f} GB"
    if n >= 1024**2:
        return f"{n / (1024**2):.0f} MB"
    if n >= 1024:
        return f"{n / 1024:.0f} KB"
    return f"{n} B"


def format_cpu(pct: float) -> str:
    """Readable CPU % — avoid rounding 0.4% down to a stuck-looking 0%."""
    if pct < 0:
        pct = 0.0
    if pct < 10:
        return f"{pct:.1f}%"
    return f"{pct:.0f}%"
