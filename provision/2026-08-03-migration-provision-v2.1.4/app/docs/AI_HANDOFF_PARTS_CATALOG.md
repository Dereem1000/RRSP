# Parts Catalog Handoff

## Status (integrated into source)

Integrated from Trae worktree `ok-i-commited-to-git-already-TNhWPT` into this repo.

Verification completed here:

- `npx tsc --noEmit -p apps/web/tsconfig.json` — passes (exit 0)
- Parts-specific files report no TypeScript errors
- `@cd-v2/portal-services` typecheck still fails on **pre-existing** unrelated errors in `clients.ts`, `mini-cd-actions.server.ts`, `mini-cd-logs.ts`, `mini-dock.ts`, `users.ts` (not Parts Catalog)

Small hardening applied during integration:

- Catalog search no longer matches supplier business names
- GET `/msp/parts-catalog` redacts supplier names on buyer-facing catalog and outgoing request payloads

Manual role-flow testing in a running app is still recommended (see test plan below).

## Goal

Add a new portal page for cataloging parts across multiple businesses:

- Businesses use the existing `client` login role
- Businesses can add their own stock listings
- The platform combines stock into one catalog view per item name
- Technicians and businesses can request parts from the shared catalog
- Supplier routing stays hidden from the buyer
- Supplier notifications happen inside the platform

## Product Decisions Already Confirmed

- Use the existing `client` role for businesses
- Merge catalog items primarily by name match
- Allow both technicians and businesses to place requests
- Keep the request flow simple for now
- Buyers should not need to know which business is supplying the part

## What Was Added

### 1. Shared Parts Data Layer

File: `apps/web/src/lib/parts-catalog.ts`

This file currently does all of the heavy lifting:

- Creates schema on demand for:
  - `parts_inventory`
  - `parts_requests`
- Normalizes item names for grouping
- Lists merged catalog items
- Lists a client business's own stock
- Lists request history for the current viewer
- Creates stock listings
- Updates stock listings
- Soft deletes stock listings
- Creates hidden supplier requests and decrements available stock
- Sends platform notices to supplier clients and staff

### 2. Portal Service Handlers

Added handlers:

- `packages/portal-services/src/handlers/msp/parts-catalog.ts`
- `packages/portal-services/src/handlers/msp/parts-catalog__listings.ts`
- `packages/portal-services/src/handlers/msp/parts-catalog__listings__id.ts`
- `packages/portal-services/src/handlers/msp/parts-catalog__requests.ts`

Current endpoint shape:

- `GET /msp/parts-catalog`
  - returns merged catalog
  - returns current client's own inventory when logged in as `client`
  - returns outgoing requests for current viewer
  - returns incoming requests for current client business
- `POST /msp/parts-catalog/listings`
  - create stock listing
  - client-only
- `PUT /msp/parts-catalog/listings/:id`
  - update stock listing
  - client-only
- `DELETE /msp/parts-catalog/listings/:id`
  - delete stock listing
  - client-only
- `POST /msp/parts-catalog/requests`
  - create platform-routed parts request
  - admin / technician / client

### 3. Portal UI

Added files:

- `apps/web/src/app/(portal)/parts/page.tsx`
- `apps/web/src/components/parts/PartsCatalogPageClient.tsx`

Current UI includes:

- tabbed layout: Marketplace, My Stock (clients) / Our Stock (admin & technician), Outgoing, Incoming
- marketplace catalog cards with search
- request modal
- stock management for client businesses and Computer Dynamics staff stock
- stock listing table
- outgoing / incoming request views on their own tabs
- URL `?tab=` persistence via `useUrlTab`

### 4. Navigation Wiring

Updated:

- `apps/web/src/lib/portal-nav.ts`
- `packages/portal-services/src/registry.ts`

This adds the new `/parts` page to the portal nav and registers the new API routes in the portal-services dispatcher.

## Files Changed

- `apps/web/src/lib/parts-catalog.ts`
- `apps/web/src/components/parts/PartsCatalogPageClient.tsx`
- `apps/web/src/app/(portal)/parts/page.tsx`
- `apps/web/src/lib/portal-nav.ts`
- `packages/portal-services/src/handlers/msp/parts-catalog.ts`
- `packages/portal-services/src/handlers/msp/parts-catalog__listings.ts`
- `packages/portal-services/src/handlers/msp/parts-catalog__listings__id.ts`
- `packages/portal-services/src/handlers/msp/parts-catalog__requests.ts`
- `packages/portal-services/src/registry.ts`
- `docs/AI_HANDOFF_PARTS_CATALOG.md`

## Important Notes For The Next AI

### Highest Priority Next Steps

1. Start the app and manually test:
   - client can add stock
   - client can edit stock
   - client can delete stock
   - technician can view catalog
   - technician can request part
   - client can request part
   - supplier notices appear for the supplier client
2. Confirm `/parts` shows in the sidebar for all intended roles.
3. Confirm the new handler imports in `registry.ts` do not break the portal route dispatcher.

## Likely Follow-Up Issues To Check

### Request Grouping

`parts_requests` stores one row per supplier allocation.

Implication:

- a single buyer request can become multiple rows when stock is split across suppliers
- the UI currently groups outgoing requests by `requestNumber`
- incoming requests are still shown as per-supplier rows, which is okay for suppliers

Double-check that this behavior is acceptable.

### Search/Grouping Logic

Catalog grouping is based on normalized item name only.

This matches the user’s preference, but it may over-group parts with similar names.

Possible future improvement:

- use fuzzy-but-safer matching rules
- include optional part number when available

### Query Limit Before Grouping

`listCatalogItems()` currently limits raw inventory rows before grouping.

If the database grows large, this may undercount grouped catalog totals.

Possible fix:

- apply pagination after grouping
- or fetch all matching rows first

### Hidden Supplier Rule

The supplier is hidden in the main catalog and outgoing request UI. Buyer-facing API responses also redact supplier display names.

Verify there is no accidental client-side exposure after final testing (catalog listings still include opaque `clientId` for counting uniqueness).

### Request Lifecycle

This MVP creates requests and notifies suppliers, but it does **not** yet include:

- accept / reject request actions
- fulfilled / shipped workflow
- conversion into the existing `orders` flow

If the next AI continues, a good next phase is:

- supplier action buttons
- request status transitions
- optional bridge into existing orders/tickets

## Suggested Manual Test Plan

### As Client Business A

- log in as a client-linked business
- open `/parts`
- add a stock listing
- confirm it appears in "Your Stock"
- confirm it appears in the shared catalog

### As Technician

- log in as technician
- open `/parts`
- search for the newly added item
- submit a request
- confirm request appears in outgoing requests

### As Client Business A Again

- refresh notices / page
- confirm incoming request shows up
- confirm supplier-facing request details look correct

### As Client Business B

- add the same item name with different quantity/price
- confirm the catalog merges stock into one catalog card
- confirm stock totals update correctly

## If You Need To Continue The Build

Recommended order:

1. run the web app and test all role flows
2. tighten UI polish
3. add request status actions
4. decide whether requests should stay separate or integrate with `orders`
