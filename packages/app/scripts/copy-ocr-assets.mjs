#!/usr/bin/env node
/**
 * Copy the Tesseract OCR worker, WASM core and English language data into
 * public/ocr so the app serves them itself. Nothing is fetched from a CDN, and
 * screenshots never leave the device.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "public", "ocr");
mkdirSync(out, { recursive: true });

const tesseractDir = dirname(require.resolve("tesseract.js/package.json"));
const coreDir = dirname(require.resolve("tesseract.js-core/package.json"));
const langDir = dirname(require.resolve("@tesseract.js-data/eng/package.json"));

const files = [
  [join(tesseractDir, "dist", "worker.min.js"), "worker.min.js"],
  // LSTM-only builds (with the WASM embedded) are all the default OCR engine mode
  // needs. The worker picks one at runtime based on the browser's SIMD support.
  ...["tesseract-core-lstm", "tesseract-core-simd-lstm", "tesseract-core-relaxedsimd-lstm"].map(
    (name) => [join(coreDir, `${name}.wasm.js`), `${name}.wasm.js`],
  ),
  [join(langDir, "4.0.0_best_int", "eng.traineddata.gz"), "eng.traineddata.gz"],
];

let copied = 0;
for (const [from, to] of files) {
  const dest = join(out, to);
  if (existsSync(dest) && statSync(dest).size === statSync(from).size) continue;
  copyFileSync(from, dest);
  copied++;
}
console.log(
  `OCR assets ready in public/ocr (${copied} copied, ${files.length - copied} up to date)`,
);
