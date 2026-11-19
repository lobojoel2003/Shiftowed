#!/usr/bin/env node
/**
 * Render the SVG logo into the PNG icons a PWA needs, using the Playwright
 * Chromium that the e2e tests already depend on. Run: npm run icons
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(join(root, "packages/app/public/favicon.svg"), "utf8");
const toData = (text) => `data:image/svg+xml;base64,${Buffer.from(text).toString("base64")}`;
const svgData = toData(svg);
// Full-bleed icons draw their own background, so drop the rounded tile.
const markData = toData(svg.replace(/<rect width="512" height="512"[^>]*\/>/, ""));

/** @type {{ file: string; size: number; inset: number; bleed: boolean }[]} */
const targets = [
  { file: "packages/app/public/icons/icon-192.png", size: 192, inset: 0, bleed: false },
  { file: "packages/app/public/icons/icon-512.png", size: 512, inset: 0, bleed: false },
  // Maskable icons need a full-bleed background with the mark inside the safe zone.
  { file: "packages/app/public/icons/maskable-512.png", size: 512, inset: 0.1, bleed: true },
  { file: "packages/app/public/icons/apple-touch-icon.png", size: 180, inset: 0.02, bleed: true },
  { file: "docs/images/logo.png", size: 256, inset: 0, bleed: false },
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const t of targets) {
  const pad = Math.round(t.size * t.inset);
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(`<!doctype html><html><body style="margin:0;width:${t.size}px;height:${t.size}px;
    background:${t.bleed ? "linear-gradient(135deg,#13a07f,#075446)" : "transparent"};display:grid;place-items:center">
    <img src="${t.bleed ? markData : svgData}" style="width:${t.size - pad * 2}px;height:${t.size - pad * 2}px"></body></html>`);
  const png = await page.screenshot({ omitBackground: !t.bleed, type: "png" });
  writeFileSync(join(root, t.file), png);
  console.log(`wrote ${t.file}`);
}
await browser.close();
