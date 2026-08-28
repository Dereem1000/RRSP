# RRMS Visibility Tiers

Operator guide for who sees **Computer Dynamics (CD)** branding vs **shop-only** branding in the RRMS (RRSP) portal.

---

## User hierarchy

```
Computer Dynamics Platform
├── CD Staff (admin / technician)
│   └── Full MSP portal — clients, tickets, MSP, licenses, settings
│
└── MSP Clients (companies that license RRMS from CD)
    ├── RRMS License Client (shop owner)
    │   ├── Knows CD — license, support, hybrid dashboard
    │   ├── Business branding + SMTP + staff management
    │   └── Signs in at /login (standard MSP portal)
    │
    ├── Shop Staff (sub-users)
    │   ├── Login: localuser@shopslug
    │   ├── Branded sign-in: /login/shop/{shopslug}
    │   ├── RRMS modules only (/rrsp/*) — no CD routes
    │   └── Subtle “Powered by Computer Dynamics” badge only
    │
    └── Shop Customers (CRM in /rrsp/clients)
        └── No portal login today — records only
```

---

## Visibility tiers

| Tier | Who | Knows CD? | Sign-in | Portal experience |
|------|-----|-----------|---------|-------------------|
| **1 — CD Platform** | Admin, technician | Yes | `/login` | Full MSP portal |
| **2 — RRMS license client** | Shop owner | Yes | `/login` | Shop modules + optional CD support nav |
| **3 — Shop-facing** | Shop staff | No* | `/login/shop/{slug}` | Shop brand, RRMS only |
| **3 — Shop-facing** | End customers | No | N/A (no portal) | CRM records only |

\*Staff may see the small **Powered by Computer Dynamics** badge (intentional — subtle attribution for future referrals).

---

## Shop staff setup (owner checklist)

1. **Business info** — Set company name, logo, address, phone (Profile → Business info).
2. **Enable staff login** — Turn on **Allow my staff to login** on the Business info tab.
3. **Share staff URL** — Copy the **Staff sign-in page** link shown on Business info and Staff tabs:
   - Format: `https://your-domain/login/shop/{shopslug}`
   - Example: `https://www.example.com/login/shop/solomonindustries`
4. **Create staff** — Staff tab: add users, role labels, and per-module page access.
5. **Credentials** — Staff sign in as `username@shopslug` (e.g. `jane@solomonindustries`).
6. **Optional SMTP** — Configure shop email so tickets/invoices send from your business address.

---

## What staff see vs owners

| Surface | Shop owner | Shop staff |
|---------|------------|------------|
| Login page | CD MSP portal (`/login`) | Shop-branded (`/login/shop/{slug}`) |
| Sidebar label | MSP Portal (+ shop logo when set) | Shop company name |
| Navigation | CD support + RRMS modules | RRMS modules only |
| Dashboard | Hybrid CD + shop | `/rrsp` shop home only |
| Profile settings | Full (branding, staff, SMTP) | Account basics only |
| Powered-by badge | When custom logo set | Always (subtle CD mark) |
| Logout destination | `/login` | `/login/shop/{slug}` |

---

## Public API (shop login lookup)

`GET /api/public/rrsp/shop-login?slug={shopslug}`

Returns shop branding for valid, staff-enabled shops. No internal IDs. Returns 404 if slug is unknown or staff login is disabled.

---

## Future: end-customer portal

Shop **customers** (device owners in `/rrsp/clients`) do not have logins today. When built, they should use **Tier 3** only:

- Shop-branded login (same pattern as staff URL)
- Ticket status, invoices, messages — scoped to that customer
- No CD routes, no MSP terminology
- Optional powered-by badge policy TBD with owner

---

## Related docs

- [RRSP Marketing Feature Guide](./RRSP-MARKETING.md) — product positioning and modules
