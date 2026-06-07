import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /** Client distributions ship compiled `.next` only — do not emit browser source maps. */
  productionBrowserSourceMaps: false,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  /** Transpile react-pdf only; `pdfjs-dist` ships a prebuilt `pdf.mjs` bundle — transpiling it can break webpack. */
  transpilePackages: ["react-pdf"],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "pdfjs-dist": path.join(__dirname, "node_modules", "pdfjs-dist"),
    };
    config.module.rules.push({
      test: /[/\\]pdfjs-dist[/\\]build[/\\]pdf\.mjs$/,
      type: "javascript/auto",
      resolve: { fullySpecified: false },
    });
    return config;
  },
  serverExternalPackages: ["better-sqlite3", "tesseract.js"],
  experimental: {
    typedRoutes: false,
    /** Custom `webpack` disables the worker by default; without it, server pages manifest can stay empty on some Windows builds. */
    webpackBuildWorker: true,
  },
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/favicon.svg" }];
  },
};

export default nextConfig;
