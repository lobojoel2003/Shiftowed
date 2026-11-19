import { describe, expect, it } from "vitest";
import {
  evaluate,
  findRestInstances,
  formatCents,
  priceAmount,
  totalBetween,
} from "../src/engine.js";
import { s, TEST_LAW, v } from "./fixtures.js";

// Monday 2026-11-16, 9 AM to 5 PM in New York (14:00Z to 22:00Z).
const shift = s("2026-11-16T09:00", "2026-11-16T17:00", "mon");
const base = v("v1", "2026-10-01T12:00:00Z", "2026-11-16", "2026-11-16", [shift]);

/** A second version posted `daysBefore` days before the shift's start. */
function changed(daysBefore: number, shifts: (typeof shift)[]) {
  const posted = new Date(Date.UTC(2026, 10, 16, 14) - daysBefore * 86_400_000).toISOString();
  return v("v2", posted, "2026-11-16", "2026-11-16", shifts);
}

describe("formatCents", () => {
  it("formats dollars", () => {
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(1850)).toBe("$18.50");
    expect(formatCents(123456)).toBe("$1,234.56");
    expect(formatCents(-500)).toBe("-$5.00");
  });
});

describe("priceAmount", () => {
  it("prices every amount type", () => {
    expect(priceAmount({ type: "flat", dollars: 45 }, 0, undefined)).toEqual({
      cents: 4500,
      formula: "$45.00 flat",
    });
    expect(priceAmount({ type: "hoursOfPay", hours: 1 }, 0, 18.5)).toMatchObject({ cents: 1850 });
    expect(priceAmount({ type: "hoursOfPay", hours: 1 }, 0, undefined)).toMatchObject({
      cents: null,
    });
    expect(priceAmount({ type: "perLostHour", multiplier: 0.5 }, 4, 20)).toMatchObject({
      cents: 4000,
    });
    expect(priceAmount({ type: "perRestHour", multiplier: 0.5 }, 2, 20).formula).toMatch(
      /rest window/,
    );
    const tiers = {
      type: "hoursOfPayByShiftLength" as const,
      tiers: [{ maxShiftHours: 4, hours: 2 }, { hours: 4 }],
    };
    expect(priceAmount(tiers, 4, 10)).toMatchObject({ cents: 2000 });
    expect(priceAmount(tiers, 8, 10)).toMatchObject({ cents: 4000 });
  });

  it("pro-rates small additions when the law says so", () => {
    const a = { type: "hoursOfPay" as const, hours: 1, prorateAddedHours: true };
    expect(priceAmount(a, 0.5, 20)).toMatchObject({ cents: 1000 });
    expect(priceAmount(a, 3, 20)).toMatchObject({ cents: 2000 });
    expect(priceAmount(a, 0, 20)).toMatchObject({ cents: 2000 });
  });
});

describe("evaluate: notice tiers", () => {
  it("charges nothing with 14+ days' notice", () => {
    const r = evaluate(TEST_LAW, [base, changed(15, [])], { hourlyRate: 20 });
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ status: "no-premium", cents: 0 });
    expect(r.findings[0]!.citation?.code).toBe("TC 1");
  });

  it("uses the 7-13 day tier", () => {
    const r = evaluate(TEST_LAW, [base, changed(10, [])], { hourlyRate: 20 });
    expect(r.findings[0]).toMatchObject({ status: "owed", cents: 2000 });
    expect(r.findings[0]!.lines.map((l) => l.ruleId)).toEqual(["cut-7-14"]);
  });

  it("treats exactly 7 days as the 7-13 day tier (lower bound inclusive)", () => {
    const r = evaluate(TEST_LAW, [base, changed(7, [])], { hourlyRate: 20 });
    expect(r.findings[0]!.lines[0]!.ruleId).toBe("cut-7-14");
    expect(evaluate(TEST_LAW, [base, changed(14, [])]).findings[0]!.status).toBe("no-premium");
  });

  it("stacks rules from different groups", () => {
    const r = evaluate(TEST_LAW, [base, changed(0.5, [])], { hourlyRate: 20 });
    // Cancelled 12 hours ahead: half-time for 8 lost hours ($80) + 4 hours of pay ($80).
    expect(r.findings[0]!.lines.map((l) => [l.ruleId, l.cents])).toEqual([
      ["cut-lt7", 8000],
      ["cut-lt24", 8000],
    ]);
    expect(r.totalCents).toBe(16000);
  });

  it("asks for the hourly rate when a premium depends on it", () => {
    const r = evaluate(TEST_LAW, [
      base,
      changed(3, [{ ...shift, id: "m2", end: "2026-11-16T19:00" }]),
    ]);
    expect(r.findings[0]).toMatchObject({ status: "needs-rate", cents: 0 });
    expect(r.needsRate).toBe(true);
  });
});

describe("evaluate: thresholds, exceptions, prohibitions", () => {
  it("ignores cuts below the rule's minimum change", () => {
    const tiny = changed(3, [{ ...shift, id: "m2", end: "2026-11-16T16:50" }]);
    expect(evaluate(TEST_LAW, [base, tiny], { hourlyRate: 20 }).findings[0]!.status).toBe(
      "no-premium",
    );
    const bigger = changed(3, [{ ...shift, id: "m2", end: "2026-11-16T16:44" }]);
    expect(evaluate(TEST_LAW, [base, bigger], { hourlyRate: 20 }).findings[0]!.status).toBe("owed");
  });

  it("waives premiums for a selected exception", () => {
    const versions = [base, changed(10, [])];
    const key = evaluate(TEST_LAW, versions).findings[0]!.key;
    const r = evaluate(TEST_LAW, versions, { hourlyRate: 20, exceptions: { [key]: "asked" } });
    expect(r.findings[0]).toMatchObject({ status: "excepted", cents: 0 });
    expect(r.findings[0]!.exception?.id).toBe("asked");
    expect(r.totalCents).toBe(0);
  });

  it("only removes the lines an exception covers", () => {
    const versions = [base, changed(0.5, [])];
    const key = evaluate(TEST_LAW, versions).findings[0]!.key;
    const r = evaluate(TEST_LAW, versions, { hourlyRate: 20, exceptions: { [key]: "storm" } });
    expect(r.findings[0]).toMatchObject({ status: "owed", cents: 8000 });
    expect(r.findings[0]!.lines.map((l) => l.ruleId)).toEqual(["cut-lt24"]);
  });

  it("ignores unknown exception ids", () => {
    const versions = [base, changed(10, [])];
    const key = evaluate(TEST_LAW, versions).findings[0]!.key;
    expect(
      evaluate(TEST_LAW, versions, { exceptions: { [key]: "nope" } }).findings[0]!.status,
    ).toBe("owed");
  });

  it("reports prohibited changes that earn no premium as violations", () => {
    const law = { ...TEST_LAW, premiums: [] };
    const moved = changed(2, [
      { ...shift, id: "m2", start: "2026-11-16T10:00", end: "2026-11-16T18:00" },
    ]);
    const r = evaluate(law, [base, moved]);
    expect(r.findings[0]).toMatchObject({
      status: "violation",
      violation: { ruleId: "no-move-lt72" },
    });
    const key = r.findings[0]!.key;
    expect(
      evaluate(law, [base, moved], { exceptions: { [key]: "asked" } }).findings[0]!.status,
    ).toBe("excepted");
    expect(
      evaluate(law, [
        base,
        changed(5, [{ ...shift, id: "m3", start: "2026-11-16T10:00", end: "2026-11-16T18:00" }]),
      ]).findings[0]!.status,
    ).toBe("no-premium");
  });
});

describe("rest between shifts", () => {
  const rule = TEST_LAW.rest![0]!;
  const close = s("2026-11-16T15:00", "2026-11-16T23:00", "close");
  const open = s("2026-11-17T06:00", "2026-11-17T14:00", "open");

  it("finds short rests and the hours inside the window", () => {
    const [r] = findRestInstances(rule, [open, close], "America/New_York");
    expect(r).toMatchObject({
      gapHours: 7,
      hoursInWindow: 3,
      secondShiftHours: 8,
      shiftDate: "2026-11-17",
    });
  });

  it("ignores split shifts on the same day unless asked", () => {
    const a = s("2026-11-16T06:00", "2026-11-16T10:00");
    const b = s("2026-11-16T15:00", "2026-11-16T19:00");
    expect(findRestInstances(rule, [a, b], "America/New_York")).toEqual([]);
    expect(
      findRestInstances({ ...rule, includeSameDayShifts: true }, [a, b], "America/New_York"),
    ).toHaveLength(1);
  });

  it("can require consecutive calendar days", () => {
    const late = s("2026-11-16T20:00", "2026-11-17T02:00");
    const early = s("2026-11-17T08:00", "2026-11-17T12:00");
    const r = { ...rule, consecutiveDaysOnly: true };
    expect(findRestInstances(r, [late, early], "America/New_York")).toHaveLength(1);
    expect(
      findRestInstances(r, [close, s("2026-11-18T06:00", "2026-11-18T08:00")], "America/New_York"),
    ).toEqual([]);
  });

  it("prices the window or the whole second shift", () => {
    const versions = [v("v1", "2026-10-01T00:00:00Z", "2026-11-16", "2026-11-17", [close, open])];
    const window = evaluate(TEST_LAW, versions, { hourlyRate: 20 }).findings.find(
      (f) => f.type === "rest",
    )!;
    expect(window.cents).toBe(3000); // 0.5 x $20 x 3h
    const law = { ...TEST_LAW, rest: [{ ...rule, premiumHours: "secondShift" as const }] };
    const whole = evaluate(law, versions, { hourlyRate: 20 }).findings.find(
      (f) => f.type === "rest",
    )!;
    expect(whole.cents).toBe(8000); // 0.5 x $20 x 8h
    expect(whole.lines[0]!.formula).toMatch(/second shift/);
  });

  it("skips overlapping shifts", () => {
    const a = s("2026-11-16T09:00", "2026-11-16T17:00");
    const b = s("2026-11-16T16:00", "2026-11-17T01:00");
    expect(
      findRestInstances({ ...rule, includeSameDayShifts: true }, [a, b], "America/New_York"),
    ).toEqual([]);
  });
});

describe("late postings and totals", () => {
  it("adds a violation finding for late schedules", () => {
    const late = v("v1", "2026-11-12T12:00:00Z", "2026-11-16", "2026-11-16", [shift]);
    const r = evaluate(TEST_LAW, [late]);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ type: "late-posting", status: "violation", cents: 0 });
  });

  it("totals by date range", () => {
    const r = evaluate(TEST_LAW, [base, changed(10, [])], { hourlyRate: 20 });
    expect(totalBetween(r.findings, "2026-11-16", "2026-11-22")).toBe(2000);
    expect(totalBetween(r.findings, "2026-11-23", "2026-11-29")).toBe(0);
  });
});
