/**
 * Sample data so people (and screenshots) can explore Shiftowed without typing a
 * schedule. Dates are relative to today, so the sample always looks current.
 *
 * Two weekly schedules are posted on time. Under NYC's fast food rules, where
 * notice is counted to the first day of the work schedule, the later changes
 * produce: a cut with 7-13 days' notice ($20), an added shift with 7-13 days'
 * notice ($10), a cancellation with under 7 days' notice ($45), a cut after
 * the schedule began ($75), a clopening ($100), and one change to next week
 * made with enough notice ($0). Total: $250.
 */
import { addDays, getJurisdiction, localToInstant, type Shift } from "@shiftowed/rules";
import { newId } from "./ids";
import { todayIn } from "./payPeriod";
import type { Actions, NewVersionInput } from "./store";

export const DEMO_JURISDICTION = "us-ny-nyc-fast-food";
export const DEMO_TOTAL_CENTS = 25_000;

function shift(date: string, start: string, end: string, label?: string): Shift {
  const endDate = end <= start ? addDays(date, 1) : date;
  return {
    id: newId("s"),
    start: `${date}T${start}`,
    end: `${endDate}T${end}`,
    ...(label ? { label } : {}),
  };
}

export function buildDemo(today: string, timeZone: string): NewVersionInput[] {
  // Day 0 starts this week's schedule and the pay period; today is day 3.
  const d = (n: number): string => addDays(today, n - 3);
  const at = (day: number, time: string): string =>
    new Date(localToInstant(`${d(day)}T${time}`, timeZone)).toISOString();

  const week1: Shift[] = [
    shift(d(0), "09:00", "15:00", "Register"),
    shift(d(2), "16:00", "23:00", "Grill"),
    shift(d(3), "16:00", "23:00", "Grill"),
    shift(d(4), "11:00", "19:00", "Register"),
    shift(d(5), "16:00", "22:00", "Drive-thru"),
  ];
  const week2: Shift[] = [
    shift(d(7), "09:00", "15:00", "Register"),
    shift(d(9), "12:00", "20:00", "Grill"),
    shift(d(12), "15:00", "23:00", "Close"),
    shift(d(13), "07:00", "12:00", "Open"),
  ];
  const on = (list: Shift[], day: number): Shift => list.find((s) => s.start.startsWith(d(day)))!;

  const v1: NewVersionInput = {
    postedAt: at(-28, "10:00"),
    periodStart: d(0),
    periodEnd: d(6),
    shifts: week1,
    source: "demo",
    note: "This week's schedule, posted in the app",
  };
  const v2: NewVersionInput = {
    postedAt: at(-24, "10:00"),
    periodStart: d(7),
    periodEnd: d(13),
    shifts: week2,
    source: "demo",
    note: "Next week's schedule, posted in the app",
  };

  // Ten days before this week starts: Saturday cut short, a Tuesday opening
  // added, and next Sunday's opening moved an hour later.
  const v3: NewVersionInput = {
    postedAt: at(-10, "15:20"),
    periodStart: d(0),
    periodEnd: d(13),
    shifts: [
      ...week1.map((s) => (s === on(week1, 5) ? { ...s, end: `${d(5)}T20:00` } : s)),
      shift(d(1), "07:00", "13:00", "Open"),
      ...week2.map((s) =>
        s === on(week2, 13) ? { ...s, start: `${d(13)}T08:00`, end: `${d(13)}T13:00` } : s,
      ),
    ],
    source: "demo",
    note: "Manager updated the schedule",
  };

  // Two days before the week starts: Friday's shift cancelled by text.
  const v4: NewVersionInput = {
    postedAt: at(-2, "18:45"),
    periodStart: d(4),
    periodEnd: d(4),
    shifts: [],
    source: "demo",
    note: "Text from manager: don't come in Friday",
  };

  // Yesterday evening: today's closing shift cut to end at 7 PM.
  const v5: NewVersionInput = {
    postedAt: at(2, "20:10"),
    periodStart: d(3),
    periodEnd: d(3),
    shifts: [{ ...on(week1, 3), end: `${d(3)}T19:00` }],
    source: "demo",
    note: "Told my shift is cut to 7 PM",
  };

  return [v1, v2, v3, v4, v5];
}

export async function loadDemo(actions: Actions): Promise<void> {
  const jurisdiction = getJurisdiction(DEMO_JURISDICTION);
  if (!jurisdiction) throw new Error(`Missing ${DEMO_JURISDICTION} rules`);
  const today = todayIn(jurisdiction.timeZone);
  await actions.clearAll();
  await actions.saveProfile({
    jurisdictionId: jurisdiction.id,
    hourlyRate: 18.5,
    payPeriod: { kind: "biweekly", anchor: addDays(today, -3) },
    workerName: "Sample Worker",
    employer: "Sample Burger Co.",
    workplace: "Store #214, Queens",
    onboarded: true,
    demo: true,
  });
  for (const version of buildDemo(today, jurisdiction.timeZone)) {
    await actions.addVersion({ ...version, capturedAt: version.postedAt });
  }
}
