import { addDays, daysBetween } from "@shiftowed/rules";
import type { PayPeriodConfig } from "./types";

export interface Period {
  start: string;
  end: string;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** The pay period that contains `date` (YYYY-MM-DD). */
export function periodContaining(date: string, config: PayPeriodConfig): Period {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  switch (config.kind) {
    case "weekly":
    case "biweekly": {
      const length = config.kind === "weekly" ? 7 : 14;
      const offset = daysBetween(config.anchor, date);
      const index = Math.floor(offset / length);
      const start = addDays(config.anchor, index * length);
      return { start, end: addDays(start, length - 1) };
    }
    case "semimonthly":
      return d <= 15
        ? { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-15` }
        : { start: `${y}-${pad(m)}-16`, end: `${y}-${pad(m)}-${pad(lastDayOfMonth(y, m))}` };
    case "monthly":
      return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(lastDayOfMonth(y, m))}` };
  }
}

/** The period `steps` periods after (or before, if negative) `period`. */
export function shiftPeriod(period: Period, steps: number, config: PayPeriodConfig): Period {
  let p = period;
  const dir = Math.sign(steps);
  for (let i = 0; i < Math.abs(steps); i++) {
    p = periodContaining(dir > 0 ? addDays(p.end, 1) : addDays(p.start, -1), config);
  }
  return p;
}

/** Today's date (YYYY-MM-DD) in a time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts;
}

/** Monday on or before `date`. */
export function mondayOf(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(date, -((dow + 6) % 7));
}
