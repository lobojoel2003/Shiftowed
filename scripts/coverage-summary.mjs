#!/usr/bin/env node
/** Print a Markdown coverage table from the packages' json-summary reports. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { root } from "./workspace.mjs";

const rows = [];
for (const pkg of ["rules", "app"]) {
  const file = join(root, "packages", pkg, "coverage", "coverage-summary.json");
  if (!existsSync(file)) continue;
  const { total } = JSON.parse(readFileSync(file, "utf8"));
  const pct = (k) => `${total[k].pct.toFixed(1)}%`;
  rows.push(
    `| ${pkg} | ${pct("lines")} | ${pct("statements")} | ${pct("functions")} | ${pct("branches")} |`,
  );
}
console.log(
  [
    "### Test coverage",
    "",
    "| Package | Lines | Statements | Functions | Branches |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n"),
);
