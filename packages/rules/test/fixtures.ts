import type { Jurisdiction, ScheduleVersion, Shift } from "../src/types.js";

const cite = (code: string) => ({ code, url: "https://example.org/law" });

/** A made-up law that exercises every rule type. Not a real jurisdiction. */
export const TEST_LAW: Jurisdiction = {
  id: "us-xx-testville",
  name: "Testville",
  shortName: "Testville",
  law: "Testville Fair Workweek",
  region: { country: "US", state: "XX" },
  timeZone: "America/New_York",
  currency: "USD",
  status: "in-force",
  effective: "2020-01-01",
  lastVerified: "2026-11-19",
  coverage: { summary: "Everyone in Testville.", industries: ["All"], employerThreshold: "1+" },
  advanceNotice: { hours: 336, label: "14 days", citation: cite("TC 1") },
  premiums: [
    {
      id: "add-7-14",
      group: "change",
      label: "Add, 7-13 days",
      on: ["add", "extend", "move"],
      notice: { minHours: 168, maxHours: 336 },
      amount: { type: "flat", dollars: 10 },
      exceptions: ["asked"],
      citation: cite("TC 2(a)"),
    },
    {
      id: "add-lt7",
      group: "change",
      label: "Add, <7 days",
      on: ["add", "extend", "move"],
      notice: { maxHours: 168 },
      amount: { type: "hoursOfPay", hours: 1 },
      exceptions: ["asked"],
      citation: cite("TC 2(b)"),
    },
    {
      id: "cut-7-14",
      group: "change",
      label: "Cut, 7-13 days",
      on: ["reduce", "cancel"],
      notice: { minHours: 168, maxHours: 336 },
      amount: { type: "flat", dollars: 20 },
      exceptions: ["asked"],
      citation: cite("TC 2(c)"),
    },
    {
      id: "cut-lt7",
      group: "change",
      label: "Cut, <7 days",
      on: ["reduce", "cancel"],
      notice: { maxHours: 168 },
      minChangeMinutes: 16,
      amount: { type: "perLostHour", multiplier: 0.5 },
      exceptions: ["asked", "storm"],
      citation: cite("TC 2(d)"),
    },
    {
      id: "cut-lt24",
      group: "last-minute",
      label: "Cut, <24 hours",
      on: ["reduce", "cancel"],
      notice: { maxHours: 24 },
      amount: {
        type: "hoursOfPayByShiftLength",
        tiers: [{ maxShiftHours: 4, hours: 2 }, { hours: 4 }],
      },
      exceptions: ["asked"],
      citation: cite("TC 2(e)"),
    },
  ],
  prohibitions: [
    {
      id: "no-move-lt72",
      label: "No moves inside 72 hours",
      on: ["move"],
      notice: { maxHours: 72 },
      exceptions: ["asked"],
      citation: cite("TC 3"),
    },
  ],
  rest: [
    {
      id: "rest",
      label: "Rest < 10h",
      minRestHours: 10,
      amount: { type: "perRestHour", multiplier: 0.5 },
      citation: cite("TC 4"),
    },
  ],
  exceptions: [
    { id: "asked", label: "I asked", description: "Employee asked.", citation: cite("TC 5(a)") },
    { id: "storm", label: "Storm", description: "Act of nature.", citation: cite("TC 5(b)") },
  ],
  enforcement: { agency: "Testville Labor", url: "https://example.org" },
  sources: [{ title: "Code", url: "https://example.org" }],
};

let n = 0;
export function s(start: string, end: string, id?: string): Shift {
  return { id: id ?? `s${++n}`, start, end };
}

export function v(
  id: string,
  postedAt: string,
  periodStart: string,
  periodEnd: string,
  shifts: Shift[],
): ScheduleVersion {
  return { id, postedAt, periodStart, periodEnd, shifts };
}
