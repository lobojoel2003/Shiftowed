import { evaluate, getJurisdiction } from "@shiftowed/rules";
import { describe, expect, it } from "vitest";
import { CSV_COLUMNS, findingsToCsv } from "./exportCsv";

describe("findingsToCsv", () => {
  const seattle = getJurisdiction("us-wa-seattle")!;
  const versions = [
    {
      id: "v1",
      postedAt: "2026-11-01T17:00:00Z",
      periodStart: "2026-11-16",
      periodEnd: "2026-11-16",
      shifts: [
        { id: "a", start: "2026-11-16T09:00", end: "2026-11-16T17:00", label: "=HYPERLINK(evil)" },
      ],
    },
    {
      id: "v2",
      postedAt: "2026-11-15T03:30:00Z",
      periodStart: "2026-11-16",
      periodEnd: "2026-11-16",
      shifts: [{ id: "a2", start: "2026-11-16T09:00", end: "2026-11-16T13:00" }],
    },
  ];

  it("writes one row per premium with citations", () => {
    const { findings } = evaluate(seattle, versions, { hourlyRate: 20 });
    const csv = findingsToCsv(findings, seattle);
    const [header, row] = csv.trim().split("\r\n");
    expect(header).toBe(CSV_COLUMNS.join(","));
    expect(row).toContain("2026-11-16,change,reduce");
    expect(row).toContain(",owed,40.00,");
    expect(row).toContain("SMC 14.22.050.A.2");
    expect(row).toContain("us-wa-seattle");
  });

  it("quotes commas and neutralises formulas", () => {
    const { findings } = evaluate(seattle, versions, { hourlyRate: 20 });
    const withFormula = findings.map((f) => ({
      ...f,
      exception: { id: "x", label: "=cmd, run", description: "", citation: { code: "", url: "" } },
    }));
    const csv = findingsToCsv(withFormula, seattle);
    expect(csv).toContain(`"'=cmd, run"`);
  });
});
