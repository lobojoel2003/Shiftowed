/**
 * Scenario tests: one realistic schedule history per law, with the premium the
 * law's text says is owed. When a law changes, update its scenario.
 */
import { describe, expect, it } from "vitest";
import { evaluate } from "../src/engine.js";
import { getJurisdiction } from "../src/jurisdictions.js";
import { localToInstant } from "../src/time.js";
import type { Jurisdiction, ScheduleVersion, Shift } from "../src/types.js";

function law(id: string): Jurisdiction {
  const j = getJurisdiction(id);
  if (!j) throw new Error(`missing ${id}`);
  return j;
}

/** ISO instant for a local wall-clock time in the law's zone. */
const at = (j: Jurisdiction, local: string) =>
  new Date(localToInstant(local, j.timeZone)).toISOString();
const shift = (id: string, start: string, end: string): Shift => ({ id, start, end });

/** Baseline: Mon 9-5, Wed 4-11 PM, Thu 7 AM-1 PM in the week of Mon 2026-11-16, posted a month ahead. */
function baseline(j: Jurisdiction): ScheduleVersion {
  return {
    id: "v1",
    postedAt: at(j, "2026-10-15T10:00"),
    periodStart: "2026-11-16",
    periodEnd: "2026-11-22",
    shifts: [
      shift("mon", "2026-11-16T09:00", "2026-11-16T17:00"),
      shift("wed", "2026-11-18T16:00", "2026-11-18T23:00"),
      shift("thu", "2026-11-19T07:00", "2026-11-19T13:00"),
    ],
  };
}

function update(
  j: Jurisdiction,
  postedLocal: string,
  day: string,
  shifts: Shift[],
): ScheduleVersion {
  return { id: "v2", postedAt: at(j, postedLocal), periodStart: day, periodEnd: day, shifts };
}

const ownedFor = (j: Jurisdiction, versions: ScheduleVersion[], rate = 20) => {
  const r = evaluate(j, versions, { hourlyRate: rate });
  return Object.fromEntries(r.findings.map((f) => [f.change?.kind ?? f.type, f.cents]));
};

describe("Oregon (ORS 653.455, 653.442)", () => {
  const j = law("us-or-oregon");
  it("cut 4 hours with 2 days' notice: half-time for hours lost", () => {
    const owed = ownedFor(j, [
      baseline(j),
      update(j, "2026-11-14T09:00", "2026-11-16", [
        shift("m", "2026-11-16T09:00", "2026-11-16T13:00"),
      ]),
    ]);
    expect(owed.reduce).toBe(4000); // 0.5 x $20 x 4h
  });
  it("30-minute adjustments are exempt, 31 minutes is not", () => {
    const small = ownedFor(j, [
      baseline(j),
      update(j, "2026-11-14T09:00", "2026-11-16", [
        shift("m", "2026-11-16T09:30", "2026-11-16T17:30"),
      ]),
    ]);
    expect(small.move).toBe(0);
    const big = ownedFor(j, [
      baseline(j),
      update(j, "2026-11-14T09:00", "2026-11-16", [
        shift("m", "2026-11-16T09:31", "2026-11-16T17:31"),
      ]),
    ]);
    expect(big.move).toBe(2000); // one hour of pay
  });
  it("8 hours between Wednesday close and Thursday open: time and a half inside the window", () => {
    expect(ownedFor(j, [baseline(j)]).rest).toBe(2000); // 0.5 x $20 x 2h
  });
});

describe("Seattle (SMC 14.22)", () => {
  const j = law("us-wa-seattle");
  it("shift cancelled the day before: half-time for every scheduled hour", () => {
    const owed = ownedFor(j, [baseline(j), update(j, "2026-11-15T12:00", "2026-11-16", [])]);
    expect(owed.cancel).toBe(8000); // 0.5 x $20 x 8h
  });
  it("30 minutes added: pro-rated to 30 minutes of pay", () => {
    const owed = ownedFor(j, [
      baseline(j),
      update(j, "2026-11-10T12:00", "2026-11-16", [
        shift("m", "2026-11-16T09:00", "2026-11-16T17:30"),
      ]),
    ]);
    expect(owed.extend).toBe(1000);
  });
  it("15-minute changes owe nothing", () => {
    const owed = ownedFor(j, [
      baseline(j),
      update(j, "2026-11-10T12:00", "2026-11-16", [
        shift("m", "2026-11-16T09:00", "2026-11-16T16:45"),
      ]),
    ]);
    expect(owed.reduce).toBe(0);
  });
});

describe("Los Angeles city retail (LAMC 185.06, 185.08)", () => {
  const j = law("us-ca-los-angeles");
  it("rest premium covers the whole second shift", () => {
    expect(ownedFor(j, [baseline(j)]).rest).toBe(6000); // 0.5 x $20 x 6h
  });
  it("new shift added after posting: one hour of pay", () => {
    const owed = ownedFor(j, [
      baseline(j),
      update(j, "2026-11-12T12:00", "2026-11-21", [
        shift("sat", "2026-11-21T10:00", "2026-11-21T16:00"),
      ]),
    ]);
    expect(owed.add).toBe(2000);
  });
});

describe("Los Angeles County retail (County Code 8.102)", () => {
  const j = law("us-ca-los-angeles-county");
  it("cuts of 15 minutes owe nothing; 16 minutes owe half-time", () => {
    const fifteen = ownedFor(j, [
      baseline(j),
      update(j, "2026-11-14T09:00", "2026-11-16", [
        shift("m", "2026-11-16T09:00", "2026-11-16T16:45"),
      ]),
    ]);
    expect(fifteen.reduce).toBe(0);
    const sixteen = ownedFor(j, [
      baseline(j),
      update(j, "2026-11-14T09:00", "2026-11-16", [
        shift("m", "2026-11-16T09:00", "2026-11-16T16:44"),
      ]),
    ]);
    expect(sixteen.reduce).toBe(Math.round(0.5 * 2000 * (16 / 60)));
  });
});

describe("NYC fast food (Admin. Code § 20-1222, § 20-1231; 6 RCNY § 7-622)", () => {
  const j = law("us-ny-nyc-fast-food");
  const cut = (posted: string) =>
    ownedFor(j, [
      baseline(j),
      update(j, posted, "2026-11-19", [shift("t", "2026-11-19T07:00", "2026-11-19T11:00")]),
    ]);

  it("prices cuts by notice to the first day of the schedule: $20, $45, $75", () => {
    // The schedule starts Monday 2026-11-16 at 12:00 a.m.
    expect(cut("2026-11-06T09:00").reduce).toBe(2000); // 9.6 days before the schedule starts
    expect(cut("2026-11-12T09:00").reduce).toBe(4500); // 3.6 days
    expect(cut("2026-11-15T09:00").reduce).toBe(7500); // the day before the schedule starts
    expect(cut("2026-11-17T09:00").reduce).toBe(7500); // the schedule already started
  });

  it("prices additions and moves at $10 and $15", () => {
    const add = (posted: string) =>
      ownedFor(j, [
        baseline(j),
        update(j, posted, "2026-11-21", [shift("sat", "2026-11-21T10:00", "2026-11-21T16:00")]),
      ]);
    expect(add("2026-11-06T09:00").add).toBe(1000);
    expect(add("2026-11-12T09:00").add).toBe(1500);
  });

  it("ignores changes of 15 minutes or less", () => {
    expect(
      ownedFor(j, [
        baseline(j),
        update(j, "2026-11-12T09:00", "2026-11-19", [
          shift("t", "2026-11-19T07:15", "2026-11-19T13:00"),
        ]),
      ]).reduce,
    ).toBe(0);
  });

  it("pays $100 for a clopening (8 hours between Wednesday close and Thursday open)", () => {
    expect(ownedFor(j, [baseline(j)]).rest).toBe(10000);
  });
});

describe("NYC retail (Admin. Code § 20-1251)", () => {
  const j = law("us-ny-nyc-retail");
  it("flags a cancellation within 72 hours as a violation, with no premium", () => {
    const r = evaluate(j, [baseline(j), update(j, "2026-11-18T09:00", "2026-11-19", [])], {
      hourlyRate: 20,
    });
    expect(r.findings.find((f) => f.type === "change")).toMatchObject({
      status: "violation",
      cents: 0,
    });
    const early = evaluate(j, [baseline(j), update(j, "2026-11-12T09:00", "2026-11-19", [])]);
    expect(early.findings.find((f) => f.type === "change")!.status).toBe("no-premium");
  });
});

describe("Philadelphia (Phila. Code § 9-4603, § 9-4604)", () => {
  const j = law("us-pa-philadelphia");
  it("pays half-time for lost hours after the posting deadline", () => {
    expect(
      ownedFor(j, [
        baseline(j),
        update(j, "2026-11-12T09:00", "2026-11-16", [
          shift("m", "2026-11-16T09:00", "2026-11-16T13:00"),
        ]),
      ]).reduce,
    ).toBe(4000);
  });
  it("exempts changes of 20 minutes or less, and changes in the first day after the deadline", () => {
    expect(
      ownedFor(j, [
        baseline(j),
        update(j, "2026-11-12T09:00", "2026-11-16", [
          shift("m", "2026-11-16T09:00", "2026-11-16T16:40"),
        ]),
      ]).reduce,
    ).toBe(0);
    // 13.5 days before the schedule starts: within 24 hours after the 14-day deadline.
    expect(ownedFor(j, [baseline(j), update(j, "2026-11-02T12:00", "2026-11-16", [])]).cancel).toBe(
      0,
    );
    expect(ownedFor(j, [baseline(j), update(j, "2026-11-03T12:00", "2026-11-16", [])]).cancel).toBe(
      8000,
    );
  });
  it("pays $40 when shifts are less than 9 hours apart", () => {
    expect(ownedFor(j, [baseline(j)]).rest).toBe(4000);
  });
});

describe("Chicago (Mun. Code § 6-110-050, § 6-110-070)", () => {
  const j = law("us-il-chicago");
  it("pays one hour for a cut with more than 24 hours' notice", () => {
    expect(
      ownedFor(j, [
        baseline(j),
        update(j, "2026-11-12T09:00", "2026-11-16", [
          shift("m", "2026-11-16T09:00", "2026-11-16T13:00"),
        ]),
      ]).reduce,
    ).toBe(2000);
  });
  it("pays half-time for lost hours with less than 24 hours' notice", () => {
    expect(
      ownedFor(j, [
        baseline(j),
        update(j, "2026-11-16T07:00", "2026-11-16", [
          shift("m", "2026-11-16T09:00", "2026-11-16T13:00"),
        ]),
      ]).reduce,
    ).toBe(4000);
  });
  it("pays 1.25x for the whole shift after short rest (extra quarter-time shown)", () => {
    expect(ownedFor(j, [baseline(j)]).rest).toBe(3000); // 0.25 x $20 x 6h
  });
});

describe("San Francisco formula retail (L.E.C. § 42.4(c))", () => {
  const j = law("us-ca-san-francisco");
  it("owes nothing for changes 7 or more days ahead", () => {
    expect(ownedFor(j, [baseline(j), update(j, "2026-11-08T09:00", "2026-11-16", [])]).cancel).toBe(
      0,
    );
  });
  it("pays 1 hour with 1-6 days' notice", () => {
    expect(ownedFor(j, [baseline(j), update(j, "2026-11-13T09:00", "2026-11-16", [])]).cancel).toBe(
      2000,
    );
  });
  it("pays 4 hours for a long shift and 2 for a short one with under 24 hours' notice", () => {
    expect(ownedFor(j, [baseline(j), update(j, "2026-11-16T07:00", "2026-11-16", [])]).cancel).toBe(
      8000,
    );
    const short: ScheduleVersion = {
      ...baseline(j),
      shifts: [shift("short", "2026-11-17T09:00", "2026-11-17T13:00")],
    };
    expect(ownedFor(j, [short, update(j, "2026-11-17T07:00", "2026-11-17", [])]).cancel).toBe(4000);
  });
});

describe("Emeryville, Berkeley, Evanston (capped short-notice cuts)", () => {
  it("Emeryville: 1 hour inside 14 days; under 24 hours, a cut pays the shift's hours up to 4", () => {
    const j = law("us-ca-emeryville");
    expect(ownedFor(j, [baseline(j), update(j, "2026-11-10T09:00", "2026-11-16", [])]).cancel).toBe(
      2000,
    );
    expect(
      ownedFor(j, [
        baseline(j),
        update(j, "2026-11-16T07:00", "2026-11-16", [
          shift("m", "2026-11-16T09:00", "2026-11-16T16:00"),
        ]),
      ]).reduce,
    ).toBe(8000);
    expect(ownedFor(j, [baseline(j)]).rest).toBe(3000); // 0.5 x $20 x 3h inside the 11-hour window
  });
  it("Berkeley: under 24 hours, a cut pays the hours cut, up to 4", () => {
    const j = law("us-ca-berkeley");
    expect(
      ownedFor(j, [
        baseline(j),
        update(j, "2026-11-16T07:00", "2026-11-16", [
          shift("m", "2026-11-16T09:00", "2026-11-16T16:00"),
        ]),
      ]).reduce,
    ).toBe(2000);
    expect(
      ownedFor(j, [
        baseline(j),
        update(j, "2026-11-16T07:00", "2026-11-16", [
          shift("m", "2026-11-16T09:00", "2026-11-16T16:50"),
        ]),
      ]).reduce,
    ).toBe(0);
  });
  it("Evanston: under 24 hours, a cut pays the shift's hours up to 4", () => {
    const j = law("us-il-evanston");
    expect(ownedFor(j, [baseline(j), update(j, "2026-11-16T07:00", "2026-11-16", [])]).cancel).toBe(
      8000,
    );
  });
});
