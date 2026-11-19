import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  isDate,
  isLocalDateTime,
  localToInstant,
  parseInstant,
  shiftHours,
  startOfDayInstant,
} from "../src/time.js";

const NY = "America/New_York";

describe("localToInstant", () => {
  it("converts standard and daylight time", () => {
    expect(new Date(localToInstant("2026-11-19T09:00", NY)).toISOString()).toBe(
      "2026-11-19T14:00:00.000Z",
    );
    expect(new Date(localToInstant("2026-07-01T09:00", NY)).toISOString()).toBe(
      "2026-07-01T13:00:00.000Z",
    );
    expect(new Date(localToInstant("2026-11-19T09:00", "America/Los_Angeles")).toISOString()).toBe(
      "2026-11-19T17:00:00.000Z",
    );
  });

  it("moves nonexistent spring-forward times past the gap", () => {
    expect(new Date(localToInstant("2026-03-08T02:30", NY)).toISOString()).toBe(
      "2026-03-08T07:30:00.000Z",
    );
  });

  it("picks the first occurrence of repeated fall-back times", () => {
    expect(new Date(localToInstant("2026-11-01T01:30", NY)).toISOString()).toBe(
      "2026-11-01T05:30:00.000Z",
    );
  });

  it("rejects malformed input", () => {
    expect(() => localToInstant("2026-02-30T09:00", NY)).toThrow(RangeError);
    expect(() => localToInstant("9am", NY)).toThrow(RangeError);
  });
});

describe("shiftHours", () => {
  it("is DST-aware for overnight shifts", () => {
    expect(shiftHours("2026-03-07T22:00", "2026-03-08T06:00", NY)).toBe(7);
    expect(shiftHours("2026-10-31T22:00", "2026-11-01T06:00", NY)).toBe(9);
    expect(shiftHours("2026-11-19T09:00", "2026-11-19T17:30", NY)).toBe(8.5);
  });
});

describe("date helpers", () => {
  it("validates", () => {
    expect(isDate("2028-02-29")).toBe(true);
    expect(isDate("2026-02-29")).toBe(false);
    expect(isLocalDateTime("2026-11-19T23:59")).toBe(true);
    expect(isLocalDateTime("2026-11-19T24:00")).toBe(false);
  });

  it("does calendar math", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-11-01", "2026-11-19")).toBe(18);
    expect(() => addDays("nope", 1)).toThrow(RangeError);
  });

  it("finds the start of a local day", () => {
    expect(new Date(startOfDayInstant("2026-11-19", NY)).toISOString()).toBe(
      "2026-11-19T05:00:00.000Z",
    );
    expect(() => startOfDayInstant("2026-13-01", NY)).toThrow(RangeError);
  });

  it("requires an offset on instants", () => {
    expect(parseInstant("2026-11-19T14:00:00Z")).toBe(Date.UTC(2026, 10, 19, 14));
    expect(parseInstant("2026-11-19T09:00:00-05:00")).toBe(Date.UTC(2026, 10, 19, 14));
    expect(() => parseInstant("2026-11-19T14:00:00")).toThrow(RangeError);
    expect(() => parseInstant("garbageZ")).toThrow(RangeError);
  });
});
