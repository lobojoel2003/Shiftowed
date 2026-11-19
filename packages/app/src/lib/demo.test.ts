import { evaluate, getJurisdiction } from "@shiftowed/rules";
import { describe, expect, it } from "vitest";
import { buildDemo, DEMO_JURISDICTION, DEMO_TOTAL_CENTS } from "./demo";

describe("sample data", () => {
  it("produces every NYC tier and totals $250", () => {
    const j = getJurisdiction(DEMO_JURISDICTION)!;
    const versions = buildDemo("2026-11-19", j.timeZone).map((v, i) => ({ ...v, id: `v${i + 1}` }));
    const r = evaluate(j, versions, { hourlyRate: 18.5 });
    const summary = r.findings.map((f) => [f.change?.kind ?? f.type, f.status, f.cents]);
    expect(summary).toEqual(
      expect.arrayContaining([
        ["add", "owed", 1000],
        ["reduce", "owed", 2000],
        ["cancel", "owed", 4500],
        ["reduce", "owed", 7500],
        ["rest", "owed", 10000],
        ["move", "no-premium", 0],
      ]),
    );
    expect(r.findings).toHaveLength(6);
    expect(r.totalCents).toBe(DEMO_TOTAL_CENTS);
  });

  it("never dates a posting in the future", () => {
    const versions = buildDemo("2026-11-19", "America/New_York");
    const tomorrow = Date.parse("2026-11-20T05:00:00Z");
    for (const v of versions) expect(Date.parse(v.postedAt)).toBeLessThan(tomorrow);
  });
});
