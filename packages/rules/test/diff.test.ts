import { describe, expect, it } from "vitest";
import { buildTimeline } from "../src/diff.js";
import { s, v } from "./fixtures.js";

const NY = "America/New_York";

describe("buildTimeline", () => {
  const mon = s("2026-11-16T09:00", "2026-11-16T17:00", "mon");
  const wed = s("2026-11-18T16:00", "2026-11-18T22:00", "wed");
  const fri = s("2026-11-20T11:00", "2026-11-20T19:00", "fri");
  const v1 = v("v1", "2026-11-01T12:00:00Z", "2026-11-16", "2026-11-22", [mon, wed, fri]);

  it("treats the first posting of a date range as a baseline", () => {
    const r = buildTimeline([v1], NY);
    expect(r.changes).toEqual([]);
    expect(r.current.map((x) => x.id)).toEqual(["mon", "wed", "fri"]);
  });

  it("classifies cut, extend, move, cancel and add", () => {
    const v2 = v("v2", "2026-11-14T12:00:00Z", "2026-11-16", "2026-11-22", [
      { ...mon, id: "mon2", end: "2026-11-16T13:00" }, // reduce by 4h
      { ...wed, id: "wed2", end: "2026-11-19T00:00" }, // extend by 2h
      s("2026-11-21T09:00", "2026-11-21T15:00", "sat"), // add
    ]);
    const r = buildTimeline([v1, v2], NY);
    const kinds = Object.fromEntries(r.changes.map((c) => [c.before?.id ?? c.after?.id, c.kind]));
    expect(kinds).toEqual({ mon: "reduce", wed: "extend", fri: "cancel", sat: "add" });
    const monChange = r.changes.find((c) => c.before?.id === "mon")!;
    expect(monChange.hoursDelta).toBe(-4);
    expect(monChange.changeMinutes).toBe(240);
    expect(monChange.shiftHours).toBe(8);
    expect(monChange.previousVersionId).toBe("v1");
    expect(monChange.key).toBe("v2:mon>mon2");
  });

  it("pairs an equal-length shift moved to another day as one move", () => {
    const moved = { ...fri, id: "sat", start: "2026-11-21T11:00", end: "2026-11-21T19:00" };
    const v2 = v("v2", "2026-11-14T12:00:00Z", "2026-11-16", "2026-11-22", [mon, wed, moved]);
    const r = buildTimeline([v1, v2], NY);
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0]).toMatchObject({ kind: "move", hoursDelta: 0 });
    // Notice is measured to the earlier of the two starts.
    expect(r.changes[0]!.affectedStartMs).toBe(Date.UTC(2026, 10, 20, 16));
  });

  it("does not cancel shifts outside a later version's date range", () => {
    const nextWeek = v("v2", "2026-11-08T12:00:00Z", "2026-11-23", "2026-11-29", [
      s("2026-11-23T09:00", "2026-11-23T17:00"),
    ]);
    const r = buildTimeline([v1, nextWeek], NY);
    expect(r.changes).toEqual([]);
    expect(r.current).toHaveLength(4);
  });

  it("orders versions by when they were posted, not by array order", () => {
    const v2 = v("v2", "2026-11-14T12:00:00Z", "2026-11-20", "2026-11-20", []);
    const r = buildTimeline([v2, v1], NY);
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0]!.kind).toBe("cancel");
  });

  it("measures notice and goes negative after the shift starts", () => {
    const sentHome = v("v2", "2026-11-16T19:00:00Z", "2026-11-16", "2026-11-16", [
      { ...mon, id: "m2", end: "2026-11-16T15:00" },
    ]);
    const r = buildTimeline([v1, sentHome], NY);
    expect(r.changes[0]!.noticeHours).toBe(-5); // started 14:00Z, told 19:00Z
  });

  it("reports late postings for newly covered dates", () => {
    const late = v("v1", "2026-11-10T12:00:00Z", "2026-11-16", "2026-11-22", [mon]);
    const r = buildTimeline([late], NY, 336);
    expect(r.latePostings).toHaveLength(1);
    expect(r.latePostings[0]).toMatchObject({ firstNewDate: "2026-11-16", requiredHours: 336 });
    expect(r.latePostings[0]!.noticeHours).toBe(137); // Nov 10 12:00Z -> Nov 16 05:00Z
    expect(buildTimeline([v1], NY, 336).latePostings).toEqual([]);
  });

  it("validates its input", () => {
    expect(() =>
      buildTimeline([v("x", "2026-11-01T00:00:00Z", "2026-11-22", "2026-11-16", [])], NY),
    ).toThrow(/periodEnd/);
    expect(() =>
      buildTimeline(
        [
          v("x", "2026-11-01T00:00:00Z", "2026-11-16", "2026-11-16", [
            s("2026-11-17T09:00", "2026-11-17T10:00"),
          ]),
        ],
        NY,
      ),
    ).toThrow(/outside/);
    expect(() =>
      buildTimeline(
        [
          v("x", "2026-11-01T00:00:00Z", "2026-11-16", "2026-11-16", [
            s("2026-11-16T09:00", "2026-11-16T08:00"),
          ]),
        ],
        NY,
      ),
    ).toThrow(/ends before/);
    const dup = s("2026-11-16T09:00", "2026-11-16T10:00", "dup");
    expect(() =>
      buildTimeline([v("x", "2026-11-01T00:00:00Z", "2026-11-16", "2026-11-16", [dup, dup])], NY),
    ).toThrow(/Duplicate/);
  });
});
