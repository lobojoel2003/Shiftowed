/**
 * Time helpers. Shift times are local wall-clock strings (`YYYY-MM-DDTHH:mm`)
 * in a jurisdiction's IANA time zone. These helpers turn them into instants
 * without any dependency, using `Intl.DateTimeFormat`, and handle DST.
 */

const HOUR_MS = 3_600_000;
const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Offset of `timeZone` from UTC at instant `utcMs`, in ms (e.g. -5h for New York in winter). */
export function zoneOffsetMs(timeZone: string, utcMs: number): number {
  const parts = formatterFor(timeZone).formatToParts(new Date(utcMs));
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    return part ? Number(part.value) : 0;
  };
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** True for a valid `YYYY-MM-DDTHH:mm` string. */
export function isLocalDateTime(value: string): boolean {
  const m = LOCAL_RE.exec(value);
  if (!m) return false;
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d &&
    h >= 0 &&
    h <= 23 &&
    mi >= 0 &&
    mi <= 59
  );
}

/** True for a valid `YYYY-MM-DD` string. */
export function isDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/**
 * Convert a local wall-clock time in `timeZone` to an instant (ms since epoch).
 * Times that fall in a spring-forward gap resolve to the later offset; times in
 * a fall-back overlap resolve to the first occurrence.
 */
export function localToInstant(local: string, timeZone: string): number {
  const m = LOCAL_RE.exec(local);
  if (!m || !isLocalDateTime(local)) {
    throw new RangeError(`Invalid local date-time "${local}". Expected YYYY-MM-DDTHH:mm.`);
  }
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  // Guess with the offset at the naive instant, then correct once.
  const first = naive - zoneOffsetMs(timeZone, naive);
  const second = naive - zoneOffsetMs(timeZone, first);
  if (first === second) return first;
  // Around a DST transition the two guesses differ. Keep the ones that really
  // show `local` on a wall clock in this zone.
  const valid = [first, second].filter((t) => t + zoneOffsetMs(timeZone, t) === naive);
  // Fall-back overlap: both are valid, so take the first occurrence.
  // Spring-forward gap: neither is valid, so move forward past the gap.
  return valid.length > 0 ? Math.min(...valid) : Math.max(first, second);
}

/** Start of a calendar day in `timeZone`, as an instant. */
export function startOfDayInstant(date: string, timeZone: string): number {
  if (!isDate(date)) throw new RangeError(`Invalid date "${date}". Expected YYYY-MM-DD.`);
  return localToInstant(`${date}T00:00`, timeZone);
}

/** Calendar date of a local date-time string. */
export function dateOf(local: string): string {
  return local.slice(0, 10);
}

/** Add `days` to a `YYYY-MM-DD` date. */
export function addDays(date: string, days: number): string {
  const m = DATE_RE.exec(date);
  if (!m) throw new RangeError(`Invalid date "${date}"`);
  const [, y, mo, d] = m.map(Number) as [number, number, number, number];
  const t = new Date(Date.UTC(y, mo - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (`b - a`). */
export function daysBetween(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  return Math.round((tb - ta) / 86_400_000);
}

/** Parse an ISO 8601 instant (must include `Z` or an offset). */
export function parseInstant(iso: string): number {
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(iso)) {
    throw new RangeError(`Instant "${iso}" must include a time zone offset or Z.`);
  }
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new RangeError(`Invalid instant "${iso}"`);
  return t;
}

/** Length of a shift in hours, DST-aware. */
export function shiftHours(start: string, end: string, timeZone: string): number {
  return (localToInstant(end, timeZone) - localToInstant(start, timeZone)) / HOUR_MS;
}

export function msToHours(ms: number): number {
  return ms / HOUR_MS;
}

export const HOURS = HOUR_MS;
