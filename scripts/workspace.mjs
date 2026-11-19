/** Shared helpers for repository scripts. */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Every package.json whose version moves in lockstep. */
export const PACKAGE_FILES = [
  "package.json",
  "packages/rules/package.json",
  "packages/app/package.json",
];

export function readJson(rel) {
  return JSON.parse(readFileSync(join(root, rel), "utf8"));
}

export function writeJson(rel, data) {
  writeFileSync(join(root, rel), `${JSON.stringify(data, null, 2)}\n`);
}

export const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
