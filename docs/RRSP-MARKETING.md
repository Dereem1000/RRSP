# RRSP — Marketing Feature Guide

> **Repair Report Service Platform (RRSP)** — a business portal for repair organizations to manage operations, customers, inventory, billing, and point of sale under your corporate identity.

---

## One-line pitch

**RRSP delivers a professional, branded business portal** for repair organizations — operations, customers, supply chain, accounting, and retail checkout in one secure platform.

---

## Who it's for

| Audience | Why RRSP fits |
|----------|----------------|
| **Computer & mobile repair shops** | Track repair jobs, customers, parts, and counter sales in one place |
| **Multi-tech shops** | Staff logins with role labels and per-module access |
| **Shops selling parts & services** | POS, inventory, invoices, and quotes tied to your customers |

Ideal for repair work — intake, bench work, parts, and checkout — without juggling separate tools.

---

## Platform highlights

### Everything in one place

- Tickets, customers, orders, parts, accounting, and POS live in one portal.
- One login for owners and staff — no switching between apps.

### Corporate identity & secure access

- Configure your **legal business name, logo, address, phone, and website** in organization settings.
- Employees experience **your brand** across the portal — a consistent, client-ready presentation.
- **Dedicated employee portal URL** (`/login/shop/{yourbusiness}`) — distribute one secure link to authorized personnel.
- Optional **business email (SMTP)** so service communications, invoices, and notifications are sent **from your organization**.

### Access tiers

| Role | Access model |
|------|----------------|
| **Business administrator (owner)** | Full platform administration — branding, workforce, email, licensed modules |
| **Authorized employees** | Role-based employee portal — assigned modules only, no administrative controls |
| **End customers** | Managed in your CRM — **no self-service customer portal** at this time |

Administrators use the primary business portal login. Employees use your **white-label employee portal**. Platform attribution remains minimal and unobtrusive for employee sessions.

### Shop modules

RRMS is built from optional shop modules. Your menu shows only the ones you use:

| Module | What it does |
|--------|----------------|
| **Shop tickets** | Repair job tracking — open, in progress, resolved |
| **Customers** | Profiles, billing, notes, communication history |
| **Shop orders** | Parts and materials orders for customer jobs |
| **Shop parts** | Inventory, **parts marketplace** — request parts and list stock to sell |
| **Shop accounting** | Invoices and quotes |
| **Shop POS** | Counter sales, inventory, checkout |

### Modular menus

- Your portal menu shows only the modules you use — no clutter.

### Workforce & governance

- Business owners are designated **Administrator** in the portal.
- Enable **employee portal access** from Business Information settings.
- **Employee portal URL** is available for copy and distribution from Business Information and Workforce tabs.
- Employee credentials follow `username@businessidentifier` on your **dedicated employee sign-in page**.
- **Workforce management:** provision users, assign role titles, and grant module-level permissions.
- Employees access **only authorized business functions** — no vendor administration or platform-level settings.
- **Inventory governance:** product catalog and stock adjustments are **administrator-only**; authorized employees may process sales at point of sale.

### Demo mode

- **Demo mode** for training and walkthroughs without touching live shop data.

### Mobile-friendly POS

- Shop POS is optimized for touch: grid/list product views, keypad, safe-area padding on phones.
- Keypad and pay controls stay fully usable on small screens.

---

## Module features

### 1. Shop tickets

**Repair job tracking**

- Create and manage repair tickets linked to customers.
- Status workflow: open, in progress, resolved (with breakdown charts on the dashboard).
- Stats: total, open, in progress, resolved.
- Create tickets on behalf of customers at the counter.
- Recent tickets table and status breakdown on the shop home dashboard.
- Ticket notifications can use your SMTP when configured.

**Best for:** intake desks, bench techs, and status updates customers care about.

---

### 2. Customers

**Customer records (shop CRM — not a customer portal)**

- Full customer profiles with contact details, billing info, contract details, service level, notes, and communication history.
- Quick actions from a profile: create a ticket, order, or accounting entry (when those modules are enabled).
- Customer picker across tickets, orders, and accounting.
- **End customers do not get portal logins** — your team manages records on their behalf.

**Best for:** walk-in and repeat customers — your CRM for the repair shop.

---

### 3. Shop orders

**Orders for work and materials**

- List and create orders tied to customers.
- Admin view with customer picker and optional cost fields.

**Best for:** parts orders, job materials, and work linked to a specific repair.

---

### 4. Shop parts & marketplace

**Inventory plus a shared parts marketplace**

RRMS Shop Parts is a key differentiator: you track your own stock **and** request or sell parts through the marketplace.

**Track your inventory**

- **My Stock** tab: create listings with part numbers, brands, quantities, prices, and how much is available to sell.
- Control sellable quantity separately from stock reserved for your bench.

**Sell from your stock**

- List available quantity on the **Marketplace** so other shops can request your parts through the platform.
- **Incoming** tab: fulfill orders and mark ready for Computer Dynamics collection.
- Quotes, online payment, and cash-on-delivery where supported; seller payout when buyers pay.
- **Computer Dynamics handles logistics** — collection from sellers and delivery to buyers. Shops do not self-pickup.

**Buy what you need**

- **Marketplace** tab: search for the part you need (your own listings are excluded).
- Compare price, availability, and distance — then send a request.
- **Outgoing** tab: track your buy requests from pending through delivery to your shop.
- **History** tab: completed trades, routes, and billing status.

**After the trade**

- Add received parts straight back into **My Stock**.
- Marketplace-listed parts can surface in **Shop POS** when marked available for sale.

**Best for:** shops that stock parts, need emergency sourcing, or want to monetize surplus inventory without a separate marketplace app.

---

### 5. Shop accounting

**Invoices and quotes**

- Create and manage invoices and quotes for customers.
- Integrated with shop POS — completed sales link straight to the invoice.
- Header quick actions for common accounting tasks.

**Best for:** repair invoices, deposits, and formal quotes — branded when your email is configured.

---

### 6. Shop POS

**Counter sales for products and parts**

- **Sell** view: search products, grid/list layout, add products, cart, keypad for price and quantity.
- **Inventory** view: manage your POS product catalog and parts stock (**shop admin only**).
- Staff with POS access can **checkout at the counter**; only the **owner (Admin)** can add, edit, remove products, or adjust stock.
- Sells POS products and parts stock when available.
- Completes sales with invoice number and amount; jump to the invoice after checkout.
- Touch-optimized for phones and tablets at the counter.

**Best for:** accessories, quick parts sales, and front-desk checkout alongside repair tickets.

---

## Shop dashboard

The shop home gives owners and permitted staff a single entry point:

- Module cards for every enabled area (tickets, orders, parts, customers, accounting, POS).
- Ticket metrics when the tickets module is on: total, open, resolved.
- Recent tickets table and status breakdown chart.
- Staff users see a simplified view: *“Quick links to the shop areas you can access.”*

---

## Onboarding

Before full access, shop owners complete **contact details**:

- Address  
- Email  
- Phone  

A profile prompt on login blocks shop features until complete (staff accounts are exempt). This keeps invoices, tickets, and branded emails tied to valid contact data.

---

## Marketing angles

- *“Run your bench and your counter in one login.”*
- *“Your logo, your customers, your invoices.”*
- *“Give techs access to tickets only; keep accounting admin-only.”*
- *“Menus show only what your shop uses — tickets today, more areas when you need them.”*
- *“Train new staff in demo mode before they touch live jobs.”*
- *“Catalog, stock, and sell parts from one portal.”*
- *“Online portal — no separate server to maintain.”*
- *“Staff permissions built in — right access for every role.”*
- *“Share one employee sign-in link — your logo on the page, not your vendor’s.”*
- *“Source hard-to-find parts through the marketplace, then sell yours when you have surplus.”*
- *“Manage shop stock in My Stock — list whatever you want to sell on the marketplace without a separate inventory system.”*
- *“Staff ring up sales at the counter; you stay in control of catalog and stock.”*

### Shop Parts & Marketplace (dedicated landing)

Use these when promoting the marketplace on its own — repair-shop owners who care about parts first, not full platform evaluation. Landing page: `/rrms-marketplace.html`.

**Hero hook**

- *“Find the parts you need. Sell the parts you don't.”*
- *“Request the part you need — Computer Dynamics delivers to your shop.”*
- *“No self-pickup — we handle collection and delivery.”*
- *“Buy and sell spare parts, surplus stock, and hard-to-find components through the marketplace.”*

**Need a part? (buy path)**

- *“Search → Compare → Request → Delivery.”*
- *“Search the marketplace — compare price, availability, and distance.”*
- *“Send a request and track delivery to your shop.”*
- *“Emergency sourcing without arranging your own collection.”*
- *“Hard-to-find screen? Request it through the marketplace and track fulfillment.”*

**Have extra stock? (sell path)**

- *“List → Get Discovered → Sell → Get Paid.”*
- *“Turn surplus inventory into revenue instead of dead stock.”*
- *“Control how much is for sale vs reserved for your bench.”*
- *“Mark orders ready — Computer Dynamics collects from your shop and delivers to the buyer.”*
- *“Fulfill incoming orders and get paid when the buyer completes payment.”*
- *“Listed parts can also sell at your counter through Shop POS.”*

**My Stock → Marketplace (inventory + listing)**

- *“Manage your stock once — list anything from My Stock on the marketplace in a few clicks.”*
- *“Your inventory and marketplace listings live together — part numbers, brands, quantity, and price already in one place.”*
- *“Choose what's reserved for the bench and what's for sale; listing pulls from the stock you're already tracking.”*
- *“No duplicate catalog — sell straight from the shelf stock you already manage.”*
- *“Received a part from a buy request? Add it back into My Stock and list it when you're ready.”*

**Trust & fit**

- *“Built for repair shops — parts, screens, batteries, boards through a marketplace made for bench work.”*
- *“Compare distance on available options — choose parts that reach your shop sooner when a job is urgent.”*
- *“Computer Dynamics handles logistics — shops request and fulfill; CD collects and delivers.”*
- *“My Stock, Marketplace, Outgoing, Incoming, and History in one Shop Parts module.”*
- *“Verified RRMS marketplace — request through the platform, not open public classifieds.”*

**Part of RRMS (when they ask “is this separate?”)**

- *“Shop Parts & Marketplace — a module inside RRMS, not another app to manage.”*
- *“Run tickets, customers, orders, accounting, and POS in the same portal.”*
- *“Marketplace access comes with RRMS shop onboarding.”*

**Calls to action (marketplace page)**

- **Join the marketplace:** Request RRMS portal access for your repair shop (`Join the Marketplace` / `?join=1`).
- **See how it works:** Walk through Marketplace, My Stock, Outgoing, and Incoming on the landing page.
- **Try it:** Open the live RRMS demo and explore Shop Parts.
- **Full platform:** Link to `/rrms-learn-more.html` for owners evaluating all RRMS modules.

---

## Shop modules

| Module | Highlights |
|--------|------------|
| Shop tickets | Status workflow, dashboard stats, intake creation |
| Customers | CRM profiles, quick actions, communication history |
| Shop orders | Customer-linked parts and materials orders |
| Shop parts | Stock, catalog, requests, fulfillment |
| Shop accounting | Invoices, quotes, POS integration |
| Shop POS | Counter sales, admin-only inventory, mobile-friendly checkout |

---

## Platform features

| Feature | |
|---------|---|
| Custom corporate branding (logo, business profile) | ✅ |
| White-label employee portal (`/login/shop/{slug}`) | ✅ |
| Business email (SMTP) | ✅ |
| Workforce accounts + module-level permissions | ✅ |
| Administrator-only inventory management | ✅ |
| Demo mode | ✅ |
| Mobile-friendly POS | ✅ |

---

## For operators

See **[RRMS Visibility Tiers](./RRMS-VISIBILITY.md)** for the full user hierarchy, staff login URLs, and who sees CD vs shop branding.

---

## Calls to action

- **Get started:** Request RRMS portal activation for your repair shop.
- **Try it:** Use demo mode for a safe walkthrough before going live.
- **Questions:** Contact us for pricing, module options, and onboarding.
