#!/usr/bin/env node
/**
 * Print the CHANGELOG.md section for a version (Keep a Changelog format).
 *   node scripts/release-notes.mjs v1.0.0
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { root } from "./workspace.mjs";

const tag = process.argv[2];
if (!tag) {
  console.error("Usage: release-notes.mjs v1.2.3");
  process.exit(1);
}
const version = tag.replace(/^v/, "");
const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
const lines = changelog.split("\n");
const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
if (start === -1) {
  console.error(`CHANGELOG.md has no "## [${version}]" section.`);
  process.exit(1);
}
let end = lines.findIndex((l, i) => i > start && /^## \[/.test(l));
if (end === -1) end = lines.length;
const body = lines
  .slice(start + 1, end)
  .filter((l) => !/^\[[^\]]+\]: /.test(l))
  .join("\n")
  .trim();

const repo = "https://github.com/lobojoel2003/Shiftowed";
console.log(`${body}

---

### Install

- **Use the app:** open the hosted PWA, or download \`shiftowed-pwa-${tag}.zip\`, unzip it and serve the folder from any static host. Add it to your home screen to install it.
- **Rules library:** \`npm install @shiftowed/rules@${version}\`, or use \`shiftowed-rules-${version}.tgz\` below.
- **Rules data only:** \`shiftowed-rules-data-${tag}.zip\` has one JSON file per law plus the JSON Schema.

Verify downloads with \`sha256sum -c SHA256SUMS.txt\`.

Full changelog: ${repo}/blob/${tag}/CHANGELOG.md`);
