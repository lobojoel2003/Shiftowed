#!/usr/bin/env node
/**
 * Bump every package to the next version and move the CHANGELOG "Unreleased"
 * section under it. Prints the new version.
 *   node scripts/bump-version.mjs patch|minor|major|prerelease|1.4.0
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PACKAGE_FILES, readJson, root, SEMVER, writeJson } from "./workspace.mjs";

const arg = process.argv[2] ?? "patch";
const current = readJson("package.json").version;
const m = SEMVER.exec(current);
if (!m) throw new Error(`Current version ${current} is not semver`);
let [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
const pre = m[4];

let next;
if (SEMVER.test(arg)) next = arg;
else if (arg === "major") next = `${major + 1}.0.0`;
else if (arg === "minor") next = `${major}.${minor + 1}.0`;
else if (arg === "patch")
  next = pre ? `${major}.${minor}.${patch}` : `${major}.${minor}.${patch + 1}`;
else if (arg === "prerelease") {
  const n = pre?.startsWith("rc.") ? Number(pre.slice(3)) + 1 : 0;
  next = pre ? `${major}.${minor}.${patch}-rc.${n}` : `${major}.${minor}.${patch + 1}-rc.0`;
} else {
  console.error(
    `Unknown bump "${arg}". Use patch, minor, major, prerelease or an explicit version.`,
  );
  process.exit(1);
}

for (const file of PACKAGE_FILES) {
  const pkg = readJson(file);
  pkg.version = next;
  if (pkg.dependencies?.["@shiftowed/rules"]) pkg.dependencies["@shiftowed/rules"] = next;
  writeJson(file, pkg);
}

const changelogPath = join(root, "CHANGELOG.md");
const changelog = readFileSync(changelogPath, "utf8");
const today = new Date().toISOString().slice(0, 10);
const repo = "https://github.com/lobojoel2003/Shiftowed";
let updated = changelog.replace("## [Unreleased]", `## [Unreleased]\n\n## [${next}] - ${today}`);
updated = updated.replace(
  /^\[Unreleased\]: .*$/m,
  `[Unreleased]: ${repo}/compare/v${next}...HEAD\n[${next}]: ${repo}/compare/v${current}...v${next}`,
);
writeFileSync(changelogPath, updated);
console.log(next);
