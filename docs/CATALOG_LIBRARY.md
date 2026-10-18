# Catalog Library (CD + Mini + POS)

Operators manage POS **module ZIP catalogs** and **shared product catalog federation** from Computer Dynamics → Mini dock → **Library** → **Catalog Library**.

## Module catalog

- Add/remove folders of `*.zip` modules (default: `E:\POS System\server\modules`).
- **Sync** rescans ZIPs into Mini’s module store (`runtime/library/module_entries.json`).
- **Per-store module profiles** limit which ZIP sources each accepted POS connection sees in **Module Store → Install**.

POS end users still install modules from **Module Management → Module Store**; CD is the admin surface.

## Shared product catalog

Standalone POS systems (Mini integration, accepted connection) can:

- **Share product catalog** — push barcodes, images, and prices as signals to Mini.
- **Receive shared hints** — apply consensus barcodes/images locally; show **recommended price** in inventory edit (optional **Apply**).

**Share toggle (POS ↔ CD):** Both surfaces control the same Mini connection flag (`share_products` / `receive_hints`). Mini is the source of truth. Turning it on in **CD Catalog Library → POS connections** updates Mini; POS picks it up on the next `GET /api/mini-integration` (Support panel load or Refresh). Turning it on in **POS Support** saves locally and pushes to Mini; CD sees it when connections are reloaded.

Federation policy (consensus mode, enable/disable) is edited under **Shared product catalog** in Catalog Library.

**Defaults:** Catalog federation is **disabled** until an operator enables it in Catalog Library. The Old Bakery starter JSON is **not** imported automatically — use **Import starter catalog** when you want that baseline.

**Starter images:** Bundled under `data/pos-catalog-media/` and served by CD at `/api/pos-catalog-media/file/{filename}?kind=image`. Catalog copy for Mini/CD import: `data/pos-starter-catalog/default-product-catalog.json` (CD image URLs). Refresh from POS with `node scripts/sync-starter-catalog-media.js` in the POS repo.

**Federation catalog image search (CD web):** `GET /api/pos-catalog-media/search-options` — POS does not need to be running. Configure **Settings → Integrations → Federation image search** (Brave subscription token, or Google API key + Search Engine ID). Env fallbacks: `BRAVE_SEARCH_API_KEY`, or `GOOGLE_API_KEY` + `GOOGLE_SEARCH_ENGINE_ID`. Picked images are saved under `data/pos-catalog-media/`.

**CD as source of truth (symlinks):** Catalog rows may keep POS-style paths (`/uploads/products/…`). CD resolves the file name from either that path or `/api/pos-catalog-media/file/…`, then serves bytes from `data/pos-catalog-media/` **or** `data/pos-catalog-uploads/products/` (junction/symlink to POS uploads). See `data/pos-catalog-uploads/README.md` and `scripts/link-pos-catalog-uploads.ps1`. Optional env: `POS_CATALOG_MEDIA_ROOT`, `POS_CATALOG_UPLOADS_ROOT`.

### Consensus

| Mode | Behavior |
|------|----------|
| At least 2 stores | Two or more sharing stores must report the same barcode/image before canonical updates |
| Majority | More than half of sharing stores |
| Custom minimum | Uses `min_agree_count` from policy |

Prices are never written automatically on POS — only a recommended median across sharing stores.

### Canonical list (CD UI)

- Default **sort**: federation activity (push count, sharing stores, last federated time). **Filter settings** (saved in browser): active in federation, all products, pending consensus, overrides, image presence, starter baseline.
- Shows product image, barcode, recommended price, federation usage line, and **consensus badges** (synced, pending, split, CD override, starter baseline).
- **Edit on CD** posts overrides to Mini (`POST .../pos-catalog/canonical/{catalog_key}/override`) for name, barcode, and image URL. Overrides flow to POS on the next catalog sync (unless a store pinned a custom image/barcode).
- **Clear CD overrides** returns barcode/image to store consensus per policy.

## APIs (Mini)

Proxied from CD via `/api/mini/library/...`:

- `GET/POST /api/library/modules/sources`, `POST .../sync`
- `GET/POST /api/library/modules/profiles`
- `GET/POST /api/library/pos-catalog/policy`
- `GET /api/library/pos-catalog/connections`, `POST .../connections/{id}`
- `GET /api/library/pos-catalog/canonical`, `POST .../recompute`
- POS (integration token): `POST /api/library/pos-catalog/push`, `GET /api/library/pos-catalog/pull`

Restart Mini after upgrading Mini host code.
