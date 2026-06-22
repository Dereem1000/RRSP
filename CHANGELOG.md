# Changelog

All notable changes to Computer Dynamics System v2 are documented here.

## [2.1.1] - 2026-06-22

### Added
- **Mini companion in CD** — floating dock on portal pages shows Mini's thoughts, requests, assistance, and growth narrative from the docked Mini instance
- **`/mini` dashboard** — Companion panel with kind badges; Growth section (memories, skills, lessons, notes + deltas)
- **Mini integration APIs** — proxy routes under `/api/mini/*` (chat, chat-feed, dashboard, status, library, external systems)
- **Mini dock settings** — configure install path, local URL, and connection in Settings → Integrations
- Shared UI helpers in `apps/web/src/lib/mini-companion-ui.ts`

### Changed
- `PortalShell` mounts `MiniAssistantDock` when Mini is docked and connected
- `PortalSidebar` shows Mini nav link for admins when dock is active
- Chat feed polling surfaces unread companion + system notification badges on the floating launcher
