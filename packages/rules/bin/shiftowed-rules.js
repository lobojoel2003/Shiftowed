#!/usr/bin/env node
/**
 * shiftowed-rules: evaluate a schedule history against a Fair Workweek law.
 *
 *   shiftowed-rules list
 *   shiftowed-rules show <jurisdiction-id>
 *   shiftowed-rules evaluate <jurisdiction-id> <versions.json> [--rate 18.50] [--json]
 *
 * versions.json is an array of { id, postedAt, periodStart, periodEnd, shifts: [{ id, start, end }] }.
 * @license MIT
 */
import { readFileSync } from "node:fs";
import {
  evaluate,
  formatCents,
  getJurisdiction,
  JURISDICTIONS,
  RULES_VERSION,
} from "../dist/src/index.js";

// Exit quietly when output is piped into something that stops reading (e.g. `| head`).
process.stdout.on("error", (err) => {
  if (err.code === "EPIPE") process.exit(0);
  throw err;
});

const [, , command, ...rest] = process.argv;
const flag = (name) => {
  const i = rest.indexOf(`--${name}`);
  return i === -1 ? undefined : (rest[i + 1] ?? "");
};
const has = (name) => rest.includes(`--${name}`);

function fail(message) {
  process.stderr.write(`shiftowed-rules: ${message}\n`);
  process.exit(1);
}

function need(id) {
  const j = getJurisdiction(id ?? "");
  if (!j) fail(`unknown jurisdiction "${id ?? ""}". Run "shiftowed-rules list".`);
  return j;
}

switch (command) {
  case "list":
    for (const j of JURISDICTIONS) process.stdout.write(`${j.id.padEnd(28)} ${j.name}\n`);
    break;
  case "show":
    process.stdout.write(`${JSON.stringify(need(rest[0]), null, 2)}\n`);
    break;
  case "evaluate": {
    const j = need(rest[0]);
    if (!rest[1]) fail("missing versions file");
    let versions;
    try {
      versions = JSON.parse(readFileSync(rest[1], "utf8"));
    } catch (err) {
      fail(`could not read ${rest[1]}: ${err.message}`);
    }
    const rate = flag("rate") === undefined ? undefined : Number(flag("rate"));
    if (rate !== undefined && !(rate > 0)) fail("--rate must be a positive number");
    const result = evaluate(j, versions, rate === undefined ? {} : { hourlyRate: rate });
    if (has("json")) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      break;
    }
    for (const f of result.findings) {
      const what = f.change?.kind ?? f.type;
      const amount = f.status === "owed" ? formatCents(f.cents) : f.status;
      const cite = f.lines.map((l) => l.citation.code).join("; ") || f.citation?.code || "";
      process.stdout.write(`${f.shiftDate}  ${what.padEnd(12)} ${amount.padStart(12)}  ${cite}\n`);
    }
    process.stdout.write(
      `\nTotal owed: ${formatCents(result.totalCents)}${result.needsRate ? " (pass --rate for hourly premiums)" : ""}\n`,
    );
    break;
  }
  case "--version":
  case "-v":
    process.stdout.write(`${RULES_VERSION}\n`);
    break;
  default:
    process.stdout.write(
      [
        `shiftowed-rules ${RULES_VERSION}`,
        "",
        "Usage:",
        "  shiftowed-rules list",
        "  shiftowed-rules show <jurisdiction-id>",
        "  shiftowed-rules evaluate <jurisdiction-id> <versions.json> [--rate 18.50] [--json]",
        "",
      ].join("\n"),
    );
    if (command && command !== "help" && command !== "--help") process.exit(1);
}
