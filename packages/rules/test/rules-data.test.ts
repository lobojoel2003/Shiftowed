/**
 * Every rules file must match the JSON Schema, pass semantic checks, and be in
 * the registry. This is what `npm run validate:rules` runs in CI.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { JURISDICTIONS, RULES_VERSION } from "../src/jurisdictions.js";
import type { Jurisdiction } from "../src/types.js";
import { checkJurisdiction } from "../src/validate.js";
import { TEST_LAW } from "./fixtures.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schema = JSON.parse(readFileSync(join(root, "schema", "jurisdiction.schema.json"), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(schema);
const files = readdirSync(join(root, "rules")).filter((f) => f.endsWith(".json"));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

describe("rules data", () => {
  it("has at least one jurisdiction and a matching version", () => {
    expect(files.length).toBeGreaterThan(0);
    expect(RULES_VERSION).toBe(pkg.version);
  });

  it("registers every file", () => {
    expect(JURISDICTIONS.map((j) => `${j.id}.json`).sort()).toEqual([...files].sort());
  });

  describe.each(files)("%s", (file) => {
    const data = JSON.parse(readFileSync(join(root, "rules", file), "utf8")) as Jurisdiction;

    it("matches the JSON Schema", () => {
      const ok = validate(data);
      expect(validate.errors ?? [], JSON.stringify(validate.errors, null, 2)).toEqual([]);
      expect(ok).toBe(true);
    });

    it("passes semantic checks", () => {
      expect(checkJurisdiction(data)).toEqual([]);
    });

    it("is named after its id", () => {
      expect(file).toBe(`${data.id}.json`);
    });

    it("cites a source for every number", () => {
      for (const rule of [...data.premiums, ...(data.rest ?? []), ...(data.prohibitions ?? [])]) {
        expect(rule.citation.code.length).toBeGreaterThan(2);
        expect(rule.citation.url).toMatch(/^https:\/\//);
      }
    });
  });
});

describe("checkJurisdiction", () => {
  it("accepts the test fixture", () => {
    expect(checkJurisdiction(TEST_LAW)).toEqual([]);
  });

  it("catches common mistakes", () => {
    const bad: Jurisdiction = {
      ...TEST_LAW,
      timeZone: "Mars/Olympus_Mons",
      lastVerified: "2026-02-30",
      exceptions: [...TEST_LAW.exceptions, TEST_LAW.exceptions[0]!],
      premiums: [
        { ...TEST_LAW.premiums[0]!, notice: { minHours: 10, maxHours: 5 }, exceptions: ["ghost"] },
        { ...TEST_LAW.premiums[0]!, notice: { maxHours: 500 } },
        { ...TEST_LAW.premiums[3]!, id: "lost-on-add", on: ["add"] },
        {
          ...TEST_LAW.premiums[3]!,
          id: "rest-in-change",
          amount: { type: "perRestHour", multiplier: 0.5 },
        },
        {
          ...TEST_LAW.premiums[4]!,
          id: "tiers",
          amount: { type: "hoursOfPayByShiftLength", tiers: [{ maxShiftHours: 4, hours: 2 }] },
        },
      ],
      rest: [{ ...TEST_LAW.rest![0]!, amount: { type: "hoursOfPay", hours: 1 } }],
    };
    const problems = checkJurisdiction(bad).join("\n");
    expect(problems).toMatch(/unknown time zone/);
    expect(problems).toMatch(/lastVerified/);
    expect(problems).toMatch(/duplicate exception/);
    expect(problems).toMatch(/empty notice window/);
    expect(problems).toMatch(/unknown exception "ghost"/);
    expect(problems).toMatch(/duplicate rule id/);
    expect(problems).toMatch(/before the advance-notice deadline/);
    expect(problems).toMatch(/prices lost hours/);
    expect(problems).toMatch(/perRestHour/);
    expect(problems).toMatch(/final tier/);
    expect(problems).toMatch(/flat or perRestHour/);
  });
});
