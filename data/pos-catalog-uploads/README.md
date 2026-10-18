# POS product uploads (optional symlink)

CD serves catalog images from:

1. `data/pos-catalog-media/` — canonical copies (recommended for production)
2. `data/pos-catalog-uploads/products/` — optional **junction/symlink** to a POS `server/uploads/products` tree

Catalog JSON may use either URL shape; the CD app maps both to `/api/pos-catalog-media/file/{filename}`:

- `/api/pos-catalog-media/file/product-….jpg`
- `/uploads/products/product-….jpg`

## Windows junction (no admin for directory junction)

```cmd
mkdir "F:\Computer Dynamics System v2\data\pos-catalog-uploads"
mklink /J "F:\Computer Dynamics System v2\data\pos-catalog-uploads\products" "E:\POS System\server\uploads\products"
```

Or run `scripts/link-pos-catalog-uploads.ps1` from the monorepo root.

## Environment overrides

| Variable | Purpose |
|----------|---------|
| `POS_CATALOG_MEDIA_ROOT` | Replace `data/pos-catalog-media` (can point at a symlinked folder) |
| `POS_CATALOG_UPLOADS_ROOT` | Replace `data/pos-catalog-uploads/products` (direct path to POS uploads) |
| `POS_SYSTEM_ROOT` | POS install root; also searches `server/uploads/products` for images |
| `POS_CATALOG_EXTRA_MEDIA_DIRS` | Extra image folders (`;`-separated) |
| `POS_CATALOG_IMAGE_PROXY_BASES` | Public POS base URLs (comma-separated); CD fetches `{base}/uploads/products/{file}` when disk miss |

When Mini is docked, CD also tries each federated POS connection `crm_base_url` as a proxy base (cached 60s).

Node `fs.readFile` follows symlinks on Windows when the target file exists.
