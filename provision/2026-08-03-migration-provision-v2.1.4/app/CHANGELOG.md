# Changelog

All notable changes to Computer Dynamics System v2 are documented here.

## [2.1.4] - 2026-08-02

### Added
- **Security events UI** — browse and filter security events in Settings → Security, with IP drill-down and block actions
- **License API routes** — public `/api/license/validate`, `/status`, and `/info` proxied to Flask with guard logging
- **RRSP / POS / parts portal** — shop POS, parts catalog, and RRSP-scoped portal routes and APIs
- **Marketing image overrides** — editable marketing assets with API and editor script
- **Medical records marketing page** — demo HTML and screenshot assets

### Fixed
- **License validate empty body** — invalid or empty JSON on `/api/license/validate` returns **400** instead of **500** (no more false `license_validate_failed` alerts)
- **Security events hydration** — nested `<button>` in event rows replaced with accessible span control for IP filter
- **Security worker** — pauses DB during demo/file replace; purges loopback from permanent block list
- **Service stop scripts** — kill concurrently supervisors before port clear; wait for API `status=live`

### Changed
- Protected file integrity catalog bumped to **2.1.4** (API guard, alerts, auth handlers)
- Express API health wait checks `status=live` before declaring ready

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
