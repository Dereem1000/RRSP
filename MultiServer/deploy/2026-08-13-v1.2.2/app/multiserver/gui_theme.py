"""Visual theme helpers for MultiServer CustomTkinter UI."""

from __future__ import annotations

import customtkinter as ctk

COLORS = {
    "bg": "#0f1419",
    "panel": "#1a2332",
    "panel2": "#243044",
    "border": "#2d3a4f",
    "text": "#e7eef8",
    "muted": "#8b9bb4",
    "accent": "#3d8bfd",
    "accent_hover": "#5ba0ff",
    "ok": "#3ecf8e",
    "warn": "#f0b429",
    "danger": "#f07178",
    "chip_run": "#1e3d32",
    "chip_stop": "#3a2a2a",
}


def apply_app_theme() -> None:
    ctk.set_appearance_mode("dark")
    ctk.set_default_color_theme("dark-blue")


def status_color(status: str, *, warn: bool = False) -> str:
    if warn:
        return COLORS["warn"]
    s = (status or "").lower()
    if "running" in s or "ngrok" in s:
        return COLORS["ok"]
    if "port" in s or "start" in s:
        return COLORS["warn"]
    if "error" in s or "fail" in s:
        return COLORS["danger"]
    return COLORS["muted"]


def load_level_color(pct: float, warn_at: float = 85.0) -> str:
    if pct >= warn_at:
        return COLORS["danger"]
    if pct >= warn_at * 0.75:
        return COLORS["warn"]
    return COLORS["ok"]
