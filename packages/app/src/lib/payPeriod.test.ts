import { describe, expect, it } from "vitest";
import { mondayOf, periodContaining, shiftPeriod, todayIn } from "./payPeriod";

describe("pay periods", () => {
  it("handles weekly and biweekly periods from an anchor", () => {
    expect(periodContaining("2026-11-19", { kind: "weekly", anchor: "2026-11-16" })).toEqual({
      start: "2026-11-16",
      end: "2026-11-22",
    });
    expect(periodContaining("2026-11-19", { kind: "biweekly", anchor: "2026-11-02" })).toEqual({
      start: "2026-11-16",
      end: "2026-11-29",
    });
    // Dates before the anchor still land in the right period.
    expect(periodContaining("2026-10-30", { kind: "biweekly", anchor: "2026-11-02" })).toEqual({
      start: "2026-10-19",
      end: "2026-11-01",
    });
  });

  it("handles semimonthly and monthly periods", () => {
    expect(periodContaining("2026-11-15", { kind: "semimonthly", anchor: "" })).toEqual({
      start: "2026-11-01",
      end: "2026-11-15",
    });
    expect(periodContaining("2026-02-20", { kind: "semimonthly", anchor: "" })).toEqual({
      start: "2026-02-16",
      end: "2026-02-28",
    });
    expect(periodContaining("2028-02-20", { kind: "monthly", anchor: "" })).toEqual({
      start: "2028-02-01",
      end: "2028-02-29",
    });
  });

  it("steps forward and back", () => {
    const cfg = { kind: "semimonthly" as const, anchor: "" };
    const p = periodContaining("2026-11-19", cfg);
    expect(shiftPeriod(p, 1, cfg)).toEqual({ start: "2026-12-01", end: "2026-12-15" });
    expect(shiftPeriod(p, -2, cfg)).toEqual({ start: "2026-10-16", end: "2026-10-31" });
    expect(shiftPeriod(p, 0, cfg)).toEqual(p);
  });

  it("knows today in a time zone and finds Mondays", () => {
    const late = new Date("2026-11-20T03:00:00Z"); // still Nov 19 in Los Angeles
    expect(todayIn("America/Los_Angeles", late)).toBe("2026-11-19");
    expect(todayIn("America/New_York", late)).toBe("2026-11-19");
    expect(todayIn("Europe/London", late)).toBe("2026-11-20");
    expect(mondayOf("2026-11-19")).toBe("2026-11-16");
    expect(mondayOf("2026-11-16")).toBe("2026-11-16");
    expect(mondayOf("2026-11-22")).toBe("2026-11-16");
  });
});
