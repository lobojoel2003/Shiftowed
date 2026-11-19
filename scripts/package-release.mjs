#!/usr/bin/env node
/**
 * Build the release/ folder: the PWA as a zip, the rules library tarball, the
 * rules data as a zip, and SHA256SUMS.txt. Run after `npm run build`.
 *   node scripts/package-release.mjs v1.0.0
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { root } from "./workspace.mjs";

const tag = process.argv[2];
if (!tag) {
  console.error("Usage: package-release.mjs v1.2.3");
  process.exit(1);
}
const version = tag.replace(/^v/, "");
const out = join(root, "release");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const dist = join(root, "packages/app/dist");
if (!existsSync(join(dist, "index.html"))) {
  console.error("packages/app/dist is missing. Run `npm run build` first.");
  process.exit(1);
}

const zip = (cwd, file, ...paths) =>
  execFileSync("zip", ["-qr", "-X", join(out, file), ...paths], { cwd, stdio: "inherit" });

// 1. The installable web app.
zip(dist, `shiftowed-pwa-${tag}.zip`, ".");

// 2. The rules library as an npm tarball.
execFileSync("npm", ["pack", "-w", "@shiftowed/rules", "--pack-destination", out], {
  cwd: root,
  stdio: "inherit",
});

// 3. The rules as plain open data.
const data = join(out, `shiftowed-rules-data-${tag}`);
mkdirSync(data);
cpSync(join(root, "packages/rules/rules"), join(data, "rules"), { recursive: true });
cpSync(join(root, "packages/rules/schema"), join(data, "schema"), { recursive: true });
cpSync(join(root, "packages/rules/LICENSE"), join(data, "LICENSE"));
writeFileSync(
  join(data, "README.md"),
  `# Shiftowed rules data ${tag}\n\nOne JSON file per Fair Workweek law, validated against schema/jurisdiction.schema.json. MIT licensed.\nSee https://github.com/lobojoel2003/Shiftowed/tree/${tag}/packages/rules\n`,
);
zip(out, `shiftowed-rules-data-${tag}.zip`, `shiftowed-rules-data-${tag}`);
rmSync(data, { recursive: true });

// 4. Checksums.
const files = readdirSync(out)
  .filter((f) => /\.(zip|tgz)$/.test(f))
  .sort();
const sums = files.map(
  (f) =>
    `${createHash("sha256")
      .update(readFileSync(join(out, f)))
      .digest("hex")}  ${f}`,
);
writeFileSync(join(out, "SHA256SUMS.txt"), `${sums.join("\n")}\n`);

console.log(`release/ for ${version}:\n${sums.join("\n")}`);
