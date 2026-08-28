/**
 * MultiServer demo reverse proxy for the Computer Dynamics Express site.
 * Routes /demo/<slug>/… to localhost demo ports (same rules as deploy/Caddyfile).
 */
const fs = require("fs");
const http = require("http");
const path = require("path");
const {
  createProxyMiddleware,
  responseInterceptor,
} = require("http-proxy-middleware");

const LEGACY_SLUG_REDIRECTS = {
  "lawfirm-deployment-20260416-004524-demo": "lawfirm",
};

function loadManifestFromFile(publicDir) {
  const manifestPath = path.join(publicDir, "demos-manifest.json");
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (err) {
    console.warn("[MultiServer] demos-manifest.json unreadable:", err.message);
    return null;
  }
}

function attachLegacyDemoRedirects(app, prefix) {
  for (const [oldSlug, newSlug] of Object.entries(LEGACY_SLUG_REDIRECTS)) {
    const fromPrefix = `${prefix}/${oldSlug}`;
    const toPrefix = `${prefix}/${newSlug}`;
    app.use((req, res, next) => {
      const p = req.path || "";
      if (p === fromPrefix || p.startsWith(`${fromPrefix}/`)) {
        const rest = p.slice(fromPrefix.length) || "/";
        const target = `${toPrefix}${rest.startsWith("/") ? rest : `/${rest}`}`;
        return res.redirect(301, target);
      }
      next();
    });
    console.log(`[MultiServer] Redirect ${fromPrefix} -> ${toPrefix}`);
  }
}

function attachMultiServerManifestProxy(app, options = {}) {
  const managerPort = options.managerPort || 5674;
  const publicDir = options.publicDir;
  const target = `http://127.0.0.1:${managerPort}`;

  app.use(
    createProxyMiddleware({
      target,
      changeOrigin: true,
      // v3: mount path is not forwarded; pathFilter keeps /demos-manifest.json on upstream
      pathFilter: "/demos-manifest.json",
      on: {
        error: (err, req, res) => {
          if (!res.headersSent) {
            const cached = publicDir && loadManifestFromFile(publicDir);
            if (cached) {
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify(cached));
              return;
            }
            res.status(502).send("MultiServer control API unavailable.");
          }
        },
      },
    })
  );
  console.log(
    `[MultiServer] Manifest proxy /demos-manifest.json -> ${target}/demos-manifest.json`
  );
}

function stripDemoPrefix(pathname, uiPrefix) {
  if (pathname === uiPrefix) return "/";
  if (pathname.startsWith(`${uiPrefix}/`)) {
    const rest = pathname.slice(uiPrefix.length);
    return rest.startsWith("/") ? rest : `/${rest}`;
  }
  return pathname;
}

/** Vite builds use root-absolute /index.* assets; rewrite for /demo/<slug>/ hosting. */
function rewriteDemoHtmlAssets(html, uiPrefix) {
  if (!html || !html.includes("<html")) {
    return html;
  }
  let out = html.replace(
    /<!-- multiserver-demo-patch -->[\s\S]*?<\/script>\s*/gi,
    "<!-- multiserver-demo-patch: path-prefixed assets -->\n"
  );
  out = out.replace(
    /(\s(?:src|href)=["'])\/(index\.[^"']+)["']/gi,
    `$1${uiPrefix}/$2"`
  );
  out = out.replace(/(\shref=["'])\/vite\.svg["']/gi, `$1${uiPrefix}/vite.svg"`);
  return out;
}

/** Allow Cloudflare Web Analytics when the site is behind Cloudflare (optional beacon). */
function relaxDemoCspOnResponse(proxyRes, res) {
  const csp = proxyRes.headers["content-security-policy"];
  if (!csp || typeof csp !== "string" || !res.setHeader) {
    return;
  }
  if (csp.includes("static.cloudflareinsights.com")) {
    return;
  }
  res.setHeader(
    "content-security-policy",
    csp
      .replace(
        /script-src ([^;]+)/,
        "script-src $1 https://static.cloudflareinsights.com"
      )
      .replace(
        /connect-src ([^;]+)/,
        "connect-src $1 https://cloudflareinsights.com"
      )
  );
}

function rewriteLocationHeader(location, uiPrefix) {
  if (!location || typeof location !== "string") return location;
  if (
    location.startsWith("http://") ||
    location.startsWith("https://") ||
    location.startsWith(uiPrefix)
  ) {
    return location;
  }
  if (location.startsWith("/")) {
    if (location === "/") return `${uiPrefix}/`;
    return `${uiPrefix}${location}`;
  }
  return location;
}

function registerDemoProxies(app, manifest) {
  if (!manifest || !Array.isArray(manifest.demos) || manifest.demos.length === 0) {
    return false;
  }

  const prefix = (manifest.url_path_prefix || "/demo").replace(/\/$/, "");
  const host = "127.0.0.1";

  attachLegacyDemoRedirects(app, prefix);

  for (const demo of manifest.demos) {
    const slug = (demo.slug || "").trim();
    if (!slug) continue;

    const clientPort = Number(demo.client_port || demo.demo_port);
    const serverPort = Number(demo.server_port || clientPort);
    if (!clientPort) continue;

    const uiPrefix = `${prefix}/${slug}`;
    const apiPrefix = `${uiPrefix}/api`;
    const isSplitApi = serverPort && serverPort !== clientPort;

    if (isSplitApi) {
      app.use(
        createProxyMiddleware({
          target: `http://${host}:${serverPort}`,
          changeOrigin: true,
          ws: true,
          pathFilter: (pathname) =>
            pathname === apiPrefix || pathname.startsWith(`${apiPrefix}/`),
          pathRewrite: (pathname) => {
            const rest = pathname.slice(apiPrefix.length) || "/";
            return `/api${rest.startsWith("/") ? rest : `/${rest}`}`;
          },
          on: {
            error: (err, req, res) => {
              console.error(
                `[MultiServer] API proxy ${apiPrefix} -> :${serverPort}:`,
                err.message
              );
              if (!res.headersSent) {
                res
                  .status(502)
                  .send(`Demo API unavailable (${slug}). Start it in MultiServer.`);
              }
            },
          },
        })
      );
      console.log(
        `[MultiServer] Proxy ${apiPrefix} -> ${host}:${serverPort} (/api…)`
      );
    }

    const uiProxyOpts = {
      target: `http://${host}:${clientPort}`,
      changeOrigin: true,
      ws: true,
      pathFilter: (pathname) => {
        const isUi =
          pathname === uiPrefix || pathname.startsWith(`${uiPrefix}/`);
        if (!isUi) return false;
        if (isSplitApi) {
          return !(
            pathname === apiPrefix || pathname.startsWith(`${apiPrefix}/`)
          );
        }
        return true;
      },
      on: {
        error: (err, req, res) => {
          console.error(
            `[MultiServer] UI proxy ${uiPrefix} -> :${clientPort}:`,
            err.message
          );
          if (!res.headersSent) {
            res
              .status(502)
              .send(`Demo unavailable (${slug}). Start it in MultiServer, then refresh.`);
          }
        },
      },
    };
    if (!isSplitApi) {
      uiProxyOpts.pathRewrite = (pathname) =>
        stripDemoPrefix(pathname, uiPrefix);
      uiProxyOpts.selfHandleResponse = true;
      uiProxyOpts.on.proxyRes = responseInterceptor(
        async (responseBuffer, proxyRes, req, res) => {
          // Avoid stale demo bundles at Cloudflare/browser (was max-age=14400 on JS).
          res.setHeader(
            "Cache-Control",
            "no-store, no-cache, must-revalidate, proxy-revalidate"
          );
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");

          const loc = proxyRes.headers["location"];
          if (loc) {
            res.setHeader(
              "location",
              rewriteLocationHeader(loc, uiPrefix)
            );
          }
          const ct = proxyRes.headers["content-type"] || "";
          if (!ct.includes("text/html")) {
            return responseBuffer;
          }
          relaxDemoCspOnResponse(proxyRes, res);
          return rewriteDemoHtmlAssets(
            responseBuffer.toString("utf8"),
            uiPrefix
          );
        }
      );
    }
    app.use(createProxyMiddleware(uiProxyOpts));
    console.log(`[MultiServer] Proxy ${uiPrefix} -> ${host}:${clientPort}`);
  }

  return true;
}

function fetchManifestFromManager(managerPort) {
  return new Promise((resolve) => {
    const req = http.get(
      `http://127.0.0.1:${managerPort}/demos-manifest.json`,
      { timeout: 2000 },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(null);
          return;
        }
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

function attachDemoProxy(app, publicDirOrOptions) {
  const options =
    typeof publicDirOrOptions === "object" && publicDirOrOptions !== null
      ? publicDirOrOptions
      : { publicDir: publicDirOrOptions, managerPort: 5674 };
  const publicDir = options.publicDir;
  const managerPort = options.managerPort || 5674;

  if (!publicDir) {
    console.warn("[MultiServer] Demo proxy: no publicDir configured");
    return false;
  }

  const manifest = loadManifestFromFile(publicDir);
  if (registerDemoProxies(app, manifest)) {
    return true;
  }

  fetchManifestFromManager(managerPort).then((live) => {
    if (live && registerDemoProxies(app, live)) {
      console.log("[MultiServer] Demo routes registered from control API");
    }
  });
  return false;
}

module.exports = {
  attachDemoProxy,
  attachMultiServerManifestProxy,
  loadManifest: loadManifestFromFile,
  LEGACY_SLUG_REDIRECTS,
};
