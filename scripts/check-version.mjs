#!/usr/bin/env node
/** Fail unless a tag like v1.2.3 matches every package.json version. */
import { PACKAGE_FILES, readJson } from "./workspace.mjs";

const tag = process.argv[2];
if (!tag || !/^v\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(tag)) {
  console.error(`Usage: check-version.mjs v1.2.3 (got "${tag ?? ""}")`);
  process.exit(1);
}
const expected = tag.slice(1);
let ok = true;
for (const file of PACKAGE_FILES) {
  const { version } = readJson(file);
  if (version !== expected) {
    console.error(`${file} is ${version}, expected ${expected}`);
    ok = false;
  }
}
const app = readJson("packages/app/package.json");
if (app.dependencies["@shiftowed/rules"] !== expected) {
  console.error(
    `packages/app depends on @shiftowed/rules ${app.dependencies["@shiftowed/rules"]}, expected ${expected}`,
  );
  ok = false;
}
if (!ok) process.exit(1);
console.log(`All packages are at ${expected}.`);
