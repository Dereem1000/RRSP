/**
 * Computer Dynamics website — Open Live Demo (MultiServer)
 * Loads /demos-manifest.json (synced from MultiServer control API or public/).
 */
(function (global) {
  const MANIFEST_URL = "/demos-manifest.json";
  const PAGES_URL = "/demo-pages.json";

  /** Old bookmark slugs → canonical slug in demos-manifest.json */
  const LEGACY_SLUG_ALIASES = {
    "lawfirm-deployment-20260416-004524-demo": "lawfirm",
    "restaurant-deployment-20260422-094910": "repair-restaurant",
  };

  const CDDemos = {
    manifest: null,
    pageSlugs: null,
    manifestError: null,

    async load() {
      if (this.manifest) return this.manifest;
      this.manifestError = null;
      try {
        const [mRes, pRes] = await Promise.all([
          fetch(MANIFEST_URL, { cache: "no-store" }),
          fetch(PAGES_URL, { cache: "no-store" }).catch(() => null),
        ]);
        if (mRes.ok) {
          this.manifest = await mRes.json();
        } else {
          this.manifestError = `Could not load ${MANIFEST_URL} (HTTP ${mRes.status}).`;
        }
        if (pRes && pRes.ok) this.pageSlugs = await pRes.json();
      } catch (e) {
        this.manifestError = `Could not load ${MANIFEST_URL}: ${e.message || e}`;
        console.warn("[CDDemos] Could not load manifest:", e);
      }
      return this.manifest;
    },

    slugForCurrentPage() {
      const fromBody = document.body && document.body.dataset.demoSlug;
      if (fromBody) return fromBody.trim();

      const parts = location.pathname.split("/").filter(Boolean);
      if (parts[0] === "demo" && parts[1]) {
        const pathSlug = LEGACY_SLUG_ALIASES[parts[1]] || parts[1];
        return this.manifest ? this.resolveSlug(pathSlug) : pathSlug;
      }

      const page = parts[parts.length - 1] || "";
      if (page.endsWith(".html") && this.pageSlugs && this.pageSlugs[page]) {
        return this.pageSlugs[page];
      }
      return "";
    },

    resolveSlug(slug) {
      const demos = this.manifest && this.manifest.demos;
      if (!demos || !slug) return slug;
      if (demos.some((d) => d.slug === slug)) return slug;
      const legacy = LEGACY_SLUG_ALIASES[slug];
      if (legacy && demos.some((d) => d.slug === legacy)) return legacy;
      const alias = slug.toLowerCase();
      const keywords = [];
      if (alias.includes("restaurant")) keywords.push("restaurant");
      if (alias.includes("lawfirm")) keywords.push("lawfirm");
      if (alias.includes("pos")) keywords.push("pos");
      const match = demos.find((d) => {
        const s = (d.slug || "").toLowerCase();
        if (s === alias || s.includes(alias) || alias.includes(s)) return true;
        return keywords.some((kw) => s.includes(kw));
      });
      return match ? match.slug : slug;
    },

    find(slug) {
      const demos = this.manifest && this.manifest.demos;
      if (!demos || !slug) return null;
      const resolved = this.resolveSlug(slug);
      return demos.find((d) => d.slug === resolved) || null;
    },

    demoPublicPath(demo) {
      const prefix = (this.manifest.url_path_prefix || "/demo").replace(/\/$/, "");
      return `${prefix}/${demo.slug}/`;
    },

    getUrl(slug) {
      const demo = this.find(slug);
      if (!demo) return null;

      const demoPath = this.demoPublicPath(demo);
      const host = location.hostname.toLowerCase();
      const port = location.port || "";
      const onDirectDemoPort = /^81\d{2}$/.test(port);

      if (host === "localhost" || host === "127.0.0.1") {
        if (!onDirectDemoPort) {
          return `${location.origin}${demoPath}`;
        }
        return demo.local_url || `http://${host}:${demo.demo_port || 8100}/`;
      }

      const base = (this.manifest.base_domain || `${location.protocol}//${location.host}`)
        .replace(/\/$/, "");
      return `${base}${demoPath}`;
    },

    isAvailable(slug) {
      return Boolean(this.getUrl(slug));
    },

    open(slug) {
      const url = this.getUrl(slug);
      if (!url) {
        const demos = (this.manifest && this.manifest.demos) || [];
        if (!demos.length) {
          alert(
            this.manifestError ||
              "No demos in manifest. In MultiServer click Sync website (writes public/demos-manifest.json), then refresh this page."
          );
        } else if (!this.find(slug)) {
          alert(
            `Demo "${slug}" is not in MultiServer (configured: ${demos.map((d) => d.slug).join(", ")}). ` +
              "Sync website in MultiServer or set the system slug to match demo-pages.json."
          );
        } else {
          alert(
            "Live demo is not running. In MultiServer click Start on this system, then try Open Live Demo again."
          );
        }
        return;
      }

      const normalize = (u) => (u || "").replace(/\/$/, "").toLowerCase();
      if (normalize(url) === normalize(location.href)) {
        alert(
          "This demo path is not proxied to MultiServer yet. " +
            "On the server: Sync website, restart the CD app, and add /demo/lawfirm/ to Caddy (see MultiServer/deploy/Caddyfile)."
        );
        return;
      }

      window.open(url, "_blank", "noopener,noreferrer");
    },

    injectButton(slug, options) {
      const opts = options || {};
      let anchor = opts.anchor;
      if (!slug) return;

      if (document.getElementById("cd-live-demo-btn")) return;

      // Prefer a dedicated slot so we never replace Request Demo / WhatsApp / Learn More links.
      const slot =
        document.getElementById("openLiveDemoAnchor") ||
        document.querySelector(".cd-live-demo-slot");
      if (slot) {
        anchor = slot;
      }
      if (!anchor) return;

      const btn = document.createElement("a");
      btn.id = "cd-live-demo-btn";
      btn.href = "#";
      btn.className = opts.className || "cd-live-demo-btn";
      btn.innerHTML =
        (opts.icon !== false
          ? '<i class="fas fa-play-circle" style="margin-right:8px"></i>'
          : "") + (opts.label || "Open Live Demo");
      btn.style.marginLeft = opts.marginLeft || "12px";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        CDDemos.open(slug);
      });

      if (slot) {
        slot.appendChild(btn);
      } else {
        anchor.parentNode.insertBefore(btn, anchor.nextSibling);
      }
    },

    async initFromPage() {
      await this.load();
      const slug = this.slugForCurrentPage();
      if (!slug) return;

      // Only attach to explicit demo slots — never hijack .demo-btn (Request Demo / WhatsApp).
      const anchor =
        document.getElementById("openLiveDemoAnchor") ||
        document.querySelector(".cd-live-demo-slot") ||
        document.getElementById("viewDemoBtn") ||
        document.querySelector(".demo-button[data-live-demo]");
      if (anchor) {
        this.injectButton(slug, { anchor: anchor });
      }
    },
  };

  global.CDDemos = CDDemos;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => CDDemos.initFromPage());
  } else {
    CDDemos.initFromPage();
  }
})(typeof window !== "undefined" ? window : globalThis);
