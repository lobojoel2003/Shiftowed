import { describe, expect, it } from "vitest";
import { parseScheduleText, toLocalTimes } from "./parseSchedule";

const ref = { referenceDate: "2026-11-19" };

describe("parseScheduleText: list layouts", () => {
  it("reads a day-per-line list with am/pm times", () => {
    const text = `My Schedule
Nov 16 - Nov 22
Mon, Nov 16
9:00 AM - 5:00 PM  Cashier
Tue, Nov 17
OFF
Wed, Nov 18
4:00 PM – 10:30 PM  Grill
Sat, Nov 21
11:00 AM - 7:00 PM`;
    const r = parseScheduleText(text, ref);
    expect(r.shifts.map((s) => [s.date, s.start, s.end])).toEqual([
      ["2026-11-16", "09:00", "17:00"],
      ["2026-11-18", "16:00", "22:30"],
      ["2026-11-21", "11:00", "19:00"],
    ]);
    expect(r.periodStart).toBe("2026-11-16");
    expect(r.periodEnd).toBe("2026-11-22");
    expect(r.shifts[0]!.label).toBe("Cashier");
    expect(r.shifts[1]!.label).toBe("Grill");
    expect(r.shifts.every((s) => s.confidence === "high")).toBe(true);
  });

  it("reads dates and times on the same line, compact suffixes", () => {
    const r = parseScheduleText("Thu 11/20 9a-5:30p\nFri 11/21 10am to 2pm", ref);
    expect(r.shifts.map((s) => [s.date, s.start, s.end])).toEqual([
      ["2026-11-20", "09:00", "17:30"],
      ["2026-11-21", "10:00", "14:00"],
    ]);
  });

  it("infers am/pm from one side of the range", () => {
    const r = parseScheduleText("Nov 20: 9-5pm\nNov 21: 1-9pm\nNov 22: 10pm-6", ref);
    expect(r.shifts.map((s) => [s.start, s.end, s.overnight])).toEqual([
      ["09:00", "17:00", false],
      ["13:00", "21:00", false],
      ["22:00", "06:00", true],
    ]);
  });

  it("handles 24-hour clocks and ISO dates", () => {
    const r = parseScheduleText("2026-11-24  07:00 - 15:30\n2026-11-25  14:00-22:00", ref);
    expect(r.shifts.map((s) => [s.date, s.start, s.end])).toEqual([
      ["2026-11-24", "07:00", "15:30"],
      ["2026-11-25", "14:00", "22:00"],
    ]);
    expect(r.shifts.every((s) => s.confidence === "high")).toBe(true);
  });

  it("marks bare ranges like 9-5 as low confidence", () => {
    const r = parseScheduleText("Nov 20\n9-5", ref);
    expect(r.shifts).toHaveLength(1);
    expect(r.shifts[0]).toMatchObject({ start: "09:00", end: "17:00", confidence: "low" });
  });

  it("fixes common OCR misreads (O for 0, l for 1)", () => {
    const r = parseScheduleText("Nov 20  l0:3O AM - 6:OO PM", ref);
    expect(r.shifts[0]).toMatchObject({ start: "10:30", end: "18:00" });
  });

  it("resolves the year closest to the reference date", () => {
    const r = parseScheduleText("Jan 2\n8:00 AM - 4:00 PM", { referenceDate: "2026-12-28" });
    expect(r.shifts[0]!.date).toBe("2027-01-02");
  });

  it("resolves weekday-only schedules against the period header", () => {
    const r = parseScheduleText(
      "Week of Nov 23 - Nov 29\nMonday 9:00am-5:00pm\nFriday 12:00pm-8:00pm",
      ref,
    );
    expect(r.shifts.map((s) => s.date)).toEqual(["2026-11-23", "2026-11-27"]);
  });

  it("warns when times have no date", () => {
    const r = parseScheduleText("9:00 AM - 5:00 PM", ref);
    expect(r.shifts).toHaveLength(0);
    expect(r.warnings.join(" ")).toMatch(/no date/);
  });

  it("does not mistake a date range for a shift", () => {
    const r = parseScheduleText("11/16 - 11/22\nMon 11/16 9:00 AM - 1:00 PM", ref);
    expect(r.shifts).toHaveLength(1);
    expect(r.periodStart).toBe("2026-11-16");
  });
});

describe("parseScheduleText: grid layouts", () => {
  it("zips a header row of dates with a row of times", () => {
    const text = "Mon 11/16 Tue 11/17 Wed 11/18 Thu 11/19\n9a-5p OFF 4p-10p 9a-1p";
    const r = parseScheduleText(text, ref);
    expect(r.shifts.map((s) => [s.date, s.start, s.end])).toEqual([
      ["2026-11-16", "09:00", "17:00"],
      ["2026-11-18", "16:00", "22:00"],
      ["2026-11-19", "09:00", "13:00"],
    ]);
  });

  it("uses word positions to line up columns", () => {
    const header = ["Mon", "11/16", "Tue", "11/17", "Wed", "11/18"].map((text, i) => ({
      text,
      x0: Math.floor(i / 2) * 100 + (i % 2) * 40,
      x1: Math.floor(i / 2) * 100 + (i % 2) * 40 + 35,
    }));
    // A time under Wednesday only; the row has no OFF markers.
    const row = [{ text: "4:00pm-10:00pm", x0: 200, x1: 270 }];
    const r = parseScheduleText(
      [
        { text: "", words: header },
        { text: "", words: row },
      ],
      ref,
    );
    expect(r.shifts.map((s) => s.date)).toEqual(["2026-11-18"]);
  });
});

describe("toLocalTimes", () => {
  it("rolls overnight shifts into the next day", () => {
    expect(
      toLocalTimes({ date: "2026-11-30", start: "22:00", end: "06:00", overnight: true }),
    ).toEqual({
      start: "2026-11-30T22:00",
      end: "2026-12-01T06:00",
    });
  });
});

describe("parseScheduleText: OCR quirks", () => {
  it("accepts ranges whose dash was dropped", () => {
    const r = parseScheduleText("Mon, Nov 16\n9:00 AM 5:00 PM\nWed, Nov 18\n4:00 PM 10:30 PM", ref);
    expect(r.shifts.map((s) => [s.date, s.start, s.end])).toEqual([
      ["2026-11-16", "09:00", "17:00"],
      ["2026-11-18", "16:00", "22:30"],
    ]);
  });

  it("does not join unrelated numbers without a dash", () => {
    const r = parseScheduleText("Nov 20\nStore 12 3 people", ref);
    expect(r.shifts).toHaveLength(0);
  });
});
