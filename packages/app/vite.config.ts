/// <reference types="vitest/config" />
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
};

function gitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

/**
 * Strict Content-Security-Policy for production builds. Everything, including
 * the OCR engine, is served from this origin; WebAssembly needs
 * 'wasm-unsafe-eval' and the OCR worker starts from a blob: URL.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' blob:",
  "worker-src 'self' blob:",
  "connect-src 'self' blob: data:",
  "img-src 'self' blob: data:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

function contentSecurityPolicy(): Plugin {
  return {
    name: "shiftowed-csp",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

const base = process.env.BASE_PATH ?? "/";
const buildInfo = {
  version: pkg.version,
  build: process.env.BUILD_NUMBER ?? process.env.GITHUB_RUN_NUMBER ?? "dev",
  commit: gitSha(),
  date: new Date().toISOString(),
  channel: process.env.RELEASE_CHANNEL ?? (process.env.CI ? "ci" : "local"),
};

export default defineConfig({
  base,
  define: {
    __BUILD_INFO__: JSON.stringify(buildInfo),
  },
  resolve: {
    alias: {
      "@shiftowed/rules": fileURLToPath(new URL("../rules/src/index.ts", import.meta.url)),
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
  plugins: [
    react(),
    contentSecurityPolicy(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["favicon.svg", "icons/apple-touch-icon.png", "robots.txt"],
      manifest: {
        id: base,
        name: "Shiftowed: Fair Workweek pay calculator",
        short_name: "Shiftowed",
        description:
          "Track schedule changes and see the predictability pay your employer owes you under Fair Workweek laws. Private, offline, with a citation next to every dollar.",
        lang: "en",
        start_url: base,
        scope: base,
        display: "standalone",
        orientation: "portrait",
        background_color: "#f6f8f7",
        theme_color: "#0b6e5b",
        categories: ["finance", "productivity", "utilities"],
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        shortcuts: [
          {
            name: "Add a schedule",
            url: `${base}#/add`,
            icons: [{ src: "icons/icon-192.png", sizes: "192x192" }],
          },
          {
            name: "What I'm owed",
            url: `${base}#/owed`,
            icons: [{ src: "icons/icon-192.png", sizes: "192x192" }],
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest,json}"],
        // jsPDF's optional HTML and SVG renderers are never used, so don't precache them.
        globIgnores: ["ocr/**", "**/html2canvas-*.js", "**/purify.es-*.js", "**/index.es-*.js"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // OCR engine and language data: big, so cached the first time they are used.
            urlPattern: ({ url }) => url.pathname.includes("/ocr/"),
            handler: "CacheFirst",
            options: {
              cacheName: "shiftowed-ocr",
              expiration: { maxEntries: 20 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/ocr.ts", "src/lib/exportPdf.ts", "src/lib/pwa.ts"],
      reporter: ["text", "lcov", "json-summary"],
    },
  },
});
