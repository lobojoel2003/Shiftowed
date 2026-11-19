import type { Locale } from "./types";

export function intlLocale(locale: Locale): string {
  return locale === "es" ? "es-US" : "en-US";
}

const moneyFormatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(cents: number, locale: Locale): string {
  const key = intlLocale(locale);
  let f = moneyFormatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(key, { style: "currency", currency: "USD" });
    moneyFormatters.set(key, f);
  }
  return f.format(cents / 100);
}

/** Format a calendar date (YYYY-MM-DD) without time-zone drift. */
export function formatDate(
  date: string,
  locale: Locale,
  opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" },
): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { ...opts, timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

/** Format the time part of a local date-time (YYYY-MM-DDTHH:mm). */
export function formatTime(local: string, locale: Locale): string {
  const [h, m] = local.slice(11, 16).split(":").map(Number) as [number, number];
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2000, 0, 1, h, m)));
}

/** "9:00 AM – 5:00 PM" */
export function formatShiftTimes(start: string, end: string, locale: Locale): string {
  return `${formatTime(start, locale)} – ${formatTime(end, locale)}`;
}

/** Format an instant in a time zone, e.g. "Thu, Nov 20, 3:14 PM". */
export function formatInstant(
  iso: string,
  timeZone: string,
  locale: Locale,
  opts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  },
): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { ...opts, timeZone }).format(new Date(iso));
}

export function formatHours(hours: number, locale: Locale): string {
  const n = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 2 }).format(hours);
  return `${n} h`;
}

/** Split hours of notice into days and hours for display. */
export function noticeParts(hours: number): { days: number; hours: number; negative: boolean } {
  const negative = hours < 0;
  const abs = Math.abs(hours);
  const days = Math.floor(abs / 24);
  return { days, hours: Math.round(abs - days * 24), negative };
}

/** Current instant as a `datetime-local` input value in a time zone. */
export function nowLocalInput(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Convert a `datetime-local` value in a time zone to an ISO instant. */
export function localInputToIso(value: string, toInstant: (local: string) => number): string {
  return new Date(toInstant(value)).toISOString();
}
