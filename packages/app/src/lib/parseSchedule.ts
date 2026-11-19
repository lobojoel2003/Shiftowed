/**
 * Turn text read from a schedule screenshot into shifts.
 *
 * Scheduling apps lay schedules out in two broad ways:
 *
 *   List:  "Mon, Nov 17"            Grid:  "Mon 11/17  Tue 11/18  Wed 11/19"
 *          "9:00 AM - 5:00 PM"             "9a-5p      OFF        4p-10p"
 *
 * The parser walks the text line by line, remembers the most recent date, and
 * pairs each time range with a date. For grids it uses word positions from the
 * OCR engine (when available) to line times up under their column header.
 *
 * It never guesses silently: anything ambiguous is marked low confidence so the
 * review screen can highlight it.
 */
import { addDays } from "@shiftowed/rules";

export interface OcrWord {
  text: string;
  x0: number;
  x1: number;
}

export interface OcrLine {
  text: string;
  words?: OcrWord[];
}

export interface ParsedShift {
  date: string;
  /** HH:mm, 24-hour. */
  start: string;
  /** HH:mm, 24-hour. */
  end: string;
  /** True when the shift ends after midnight. */
  overnight: boolean;
  label?: string;
  confidence: "high" | "low";
  source: string;
}

export interface ParseResult {
  shifts: ParsedShift[];
  periodStart?: string;
  periodEnd?: string;
  warnings: string[];
}

export interface ParseOptions {
  /** The date the screenshot was taken or the schedule was received (YYYY-MM-DD). */
  referenceDate: string;
}

/* ------------------------------------------------------------------------ */
/* Tokens                                                                   */
/* ------------------------------------------------------------------------ */

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};
const MONTH_RE =
  "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

const WEEKDAYS: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  weds: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};
const WEEKDAY_RE =
  /\b(sunday|sun|monday|mon|tuesday|tues|tue|wednesday|weds|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat)\b\.?/gi;

const OFF_RE =
  /\b(off|day off|not scheduled|rest day|no shift|unavailable)\b|(?:^|\s)(?:--|—)(?=\s|$)/gi;

interface DateToken {
  index: number;
  length: number;
  month: number;
  day: number;
  year?: number;
  /** Second date of a range like "Nov 17-23" or "11/17 - 11/23". */
  rangeEnd?: { month: number; day: number; year?: number };
}

interface TimeRange {
  index: number;
  length: number;
  start: { h: number; m: number; suffix?: "a" | "p"; padded: boolean };
  end: { h: number; m: number; suffix?: "a" | "p"; padded: boolean };
}

function normalizeLine(raw: string): string {
  return (
    raw
      .replace(/[\u2010-\u2015\u2212]/g, "-")
      .replace(/\s+/g, " ")
      // OCR often reads 0 as O and 1 as l or I inside times.
      .replace(/(?<=\d)[Oo]|[Oo](?=\d)/g, "0")
      .replace(/(?<![A-Za-z])[lI|](?=\d[:.]\d)/g, "1")
      .replace(/(?<=\d)[lI](?=[:.]\d)/g, "1")
      // "9 : 30" -> "9:30" (but leave "Nov 22: 10pm" alone)
      .replace(/(\d)\s+:\s*(\d{2})/g, "$1:$2")
      .trim()
  );
}

function suffixOf(raw: string | undefined): "a" | "p" | undefined {
  if (!raw) return undefined;
  const c = raw.toLowerCase()[0];
  return c === "a" ? "a" : c === "p" ? "p" : undefined;
}

const TIME = String.raw`(\d{1,2})(?:[:.](\d{2}))?\s?((?:a|p)\.?(?:m\.?)?)?`;
const RANGE_RE = new RegExp(
  String.raw`(?<![\d/:.$])${TIME}(?![\d])(\s*(?:-|to|until|till|til)\s*|\s+)${TIME}(?![a-z\d])`,
  "gi",
);

function findTimeRanges(text: string): TimeRange[] {
  const out: TimeRange[] = [];
  for (const m of text.matchAll(RANGE_RE)) {
    const [whole, h1, m1, s1, sep, h2, m2, s2] = m;
    const start = {
      h: Number(h1),
      m: Number(m1 ?? 0),
      suffix: suffixOf(s1),
      padded: /^0\d/.test(h1 ?? ""),
    };
    const end = {
      h: Number(h2),
      m: Number(m2 ?? 0),
      suffix: suffixOf(s2),
      padded: /^0\d/.test(h2 ?? ""),
    };
    if (start.h > 24 || end.h > 24 || start.m > 59 || end.m > 59) continue;
    if ((start.suffix && start.h > 12) || (end.suffix && end.h > 12)) continue;
    // OCR often drops the dash: "9:00 AM 5:00 PM" is a range only when both
    // sides clearly look like times.
    if (sep !== undefined && sep.trim() === "" && !((m1 || s1) && (m2 || s2))) continue;
    // Bare "1-2" with no colon or am/pm is too ambiguous to be a shift on its own.
    const hasEvidence = Boolean(
      m1 || m2 || start.suffix || end.suffix || start.h > 12 || end.h > 12,
    );
    if (!hasEvidence && !/^\s*\d{1,2}\s*-\s*\d{1,2}\s*$/.test(whole)) continue;
    out.push({ index: m.index, length: whole.length, start, end });
  }
  return out;
}

function findDates(text: string): DateToken[] {
  const out: DateToken[] = [];
  const taken: [number, number][] = [];
  const free = (i: number, len: number): boolean => !taken.some(([a, b]) => i < b && i + len > a);
  const push = (t: DateToken): void => {
    if (!free(t.index, t.length)) return;
    if (t.month < 1 || t.month > 12 || t.day < 1 || t.day > 31) return;
    taken.push([t.index, t.index + t.length]);
    out.push(t);
  };
  const year = (y: string | undefined): number | undefined =>
    y === undefined ? undefined : y.length === 2 ? 2000 + Number(y) : Number(y);

  // 2026-11-17
  for (const m of text.matchAll(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g)) {
    push({
      index: m.index,
      length: m[0].length,
      year: Number(m[1]),
      month: Number(m[2]),
      day: Number(m[3]),
    });
  }
  // Nov 17, Nov 17th 2026, Nov 17-23, Nov 17 - Nov 23
  const monthDay = new RegExp(
    String.raw`\b${MONTH_RE}\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+(20\d{2}))?(?:\s*-\s*(?:${MONTH_RE}\.?\s+)?(\d{1,2})(?![:\d])(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?)?`,
    "gi",
  );
  for (const m of text.matchAll(monthDay)) {
    const month = MONTHS[m[1]!.toLowerCase()] ?? 0;
    const t: DateToken = {
      index: m.index,
      length: m[0].length,
      month,
      day: Number(m[2]),
      year: year(m[3]),
    };
    if (m[5]) {
      const endMonth = m[4] ? (MONTHS[m[4].toLowerCase()] ?? month) : month;
      t.rangeEnd = { month: endMonth, day: Number(m[5]), year: year(m[6]) ?? t.year };
    }
    push(t);
  }
  // 17 Nov, 17th November 2026
  const dayMonth = new RegExp(
    String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+${MONTH_RE}\b\.?(?:,?\s+(20\d{2}))?`,
    "gi",
  );
  for (const m of text.matchAll(dayMonth)) {
    push({
      index: m.index,
      length: m[0].length,
      day: Number(m[1]),
      month: MONTHS[m[2]!.toLowerCase()] ?? 0,
      year: year(m[3]),
    });
  }
  // 11/17, 11/17/26, 11/17/2026, 11/17 - 11/23
  for (const m of text.matchAll(
    /(?<![\d/])(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?(?:\s*-\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?)?(?![\d/])/g,
  )) {
    const t: DateToken = {
      index: m.index,
      length: m[0].length,
      month: Number(m[1]),
      day: Number(m[2]),
      year: year(m[3]),
    };
    if (m[4] && m[5])
      t.rangeEnd = { month: Number(m[4]), day: Number(m[5]), year: year(m[6]) ?? t.year };
    push(t);
  }
  return out.sort((a, b) => a.index - b.index);
}

function findWeekdays(text: string): { index: number; length: number; dow: number }[] {
  return [...text.matchAll(WEEKDAY_RE)].map((m) => ({
    index: m.index,
    length: m[0].length,
    dow: WEEKDAYS[m[1]!.toLowerCase()] ?? 0,
  }));
}

/* ------------------------------------------------------------------------ */
/* Resolution                                                               */
/* ------------------------------------------------------------------------ */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDate(y: number, m: number, d: number): string | undefined {
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return undefined;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Pick the year that puts month/day closest to the reference date. */
function resolveDate(
  month: number,
  day: number,
  year: number | undefined,
  ref: string,
): string | undefined {
  if (year !== undefined) return isoDate(year, month, day);
  const refYear = Number(ref.slice(0, 4));
  const refMs = Date.parse(`${ref}T00:00:00Z`);
  let best: string | undefined;
  let bestDist = Infinity;
  for (const y of [refYear - 1, refYear, refYear + 1]) {
    const iso = isoDate(y, month, day);
    if (!iso) continue;
    const dist = Math.abs(Date.parse(`${iso}T00:00:00Z`) - refMs);
    if (dist < bestDist) {
      best = iso;
      bestDist = dist;
    }
  }
  return best;
}

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** The first date on or after `anchor` that falls on `dow`. */
function resolveWeekday(dow: number, anchor: string): string {
  const diff = (dow - weekdayOf(anchor) + 7) % 7;
  return addDays(anchor, diff);
}

function mondayOf(date: string): string {
  return addDays(date, -((weekdayOf(date) + 6) % 7));
}

function toMinutes(h: number, m: number, suffix: "a" | "p" | undefined): number {
  let hour = h % 24;
  if (suffix === "p" && hour < 12) hour += 12;
  if (suffix === "a" && hour === 12) hour = 0;
  return hour * 60 + m;
}

function hhmm(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

const MAX_SHIFT_MIN = 16 * 60;

function duration(start: number, end: number): number {
  return end > start ? end - start : end + 1440 - start;
}

/**
 * Resolve a time range to 24-hour minutes.
 * @param clock24 True when the document as a whole uses a 24-hour clock.
 */
function resolveRange(
  r: TimeRange,
  clock24: boolean,
): { start: number; end: number; confident: boolean } | undefined {
  const { start: s, end: e } = r;
  let startMin: number;
  let endMin: number;
  let confident = true;

  if (s.suffix && e.suffix) {
    startMin = toMinutes(s.h, s.m, s.suffix);
    endMin = toMinutes(e.h, e.m, e.suffix);
  } else if (e.suffix) {
    endMin = toMinutes(e.h, e.m, e.suffix);
    const same = toMinutes(s.h, s.m, e.suffix);
    const other = toMinutes(s.h, s.m, e.suffix === "a" ? "p" : "a");
    startMin = duration(same, endMin) <= MAX_SHIFT_MIN && same < endMin ? same : other;
  } else if (s.suffix) {
    startMin = toMinutes(s.h, s.m, s.suffix);
    const same = toMinutes(e.h, e.m, s.suffix);
    const other = toMinutes(e.h, e.m, s.suffix === "a" ? "p" : "a");
    endMin = same > startMin ? same : other;
  } else if (clock24 || s.h > 12 || e.h > 12 || s.padded || e.padded || s.h === 0 || e.h === 0) {
    startMin = toMinutes(s.h, s.m, undefined);
    endMin = toMinutes(e.h, e.m, undefined);
    confident = clock24 || s.h > 12 || e.h > 12 || s.padded || e.padded;
  } else {
    // No am/pm anywhere: assume a daytime start and the shortest sensible shift.
    confident = false;
    startMin = toMinutes(s.h, s.m, s.h >= 5 && s.h <= 11 ? "a" : "p");
    const candidates = [toMinutes(e.h, e.m, "a"), toMinutes(e.h, e.m, "p")];
    endMin = candidates.sort((a, b) => duration(startMin, a) - duration(startMin, b))[0]!;
  }

  const len = duration(startMin, endMin);
  if (len === 0 || len > MAX_SHIFT_MIN) return undefined;
  return { start: startMin, end: endMin, confident };
}

/* ------------------------------------------------------------------------ */
/* Parser                                                                   */
/* ------------------------------------------------------------------------ */

const LABEL_STOP =
  /\b(shift|shifts|total|hours?|hrs?|week|schedule|scheduled|published|posted|my|unpaid|paid|break|meal)\b/gi;

function extractLabel(text: string, spans: [number, number][]): string | undefined {
  let rest = "";
  let i = 0;
  for (const [a, b] of [...spans].sort((x, y) => x[0] - y[0])) {
    if (a > i) rest += text.slice(i, a);
    rest += " ";
    i = Math.max(i, b);
  }
  rest += text.slice(i);
  rest = rest
    .replace(WEEKDAY_RE, " ")
    .replace(/\b\d+(\.\d+)?\s*(h|hr|hrs|hours?)\b/gi, " ")
    .replace(LABEL_STOP, " ")
    .replace(/[^A-Za-z&/' -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (rest.length < 3 || rest.length > 32 || !/[A-Za-z]{3}/.test(rest)) return undefined;
  return rest;
}

interface Cell {
  index: number;
  kind: "range" | "off";
  range?: TimeRange;
}

/** Character offset of each word when a line is rebuilt as words joined by spaces. */
function wordOffsets(words: OcrWord[]): { start: number; end: number; x: number }[] {
  let at = 0;
  return words.map((w) => {
    const start = at;
    at += w.text.length + 1;
    return { start, end: start + w.text.length, x: (w.x0 + w.x1) / 2 };
  });
}

function xAt(
  offsets: { start: number; end: number; x: number }[] | undefined,
  index: number,
): number | undefined {
  if (!offsets) return undefined;
  const hit =
    offsets.find((o) => index >= o.start && index < o.end) ?? offsets.find((o) => o.start >= index);
  return hit?.x;
}

export function parseScheduleText(input: string | OcrLine[], options: ParseOptions): ParseResult {
  const ref = options.referenceDate;
  const rawLines: OcrLine[] =
    typeof input === "string" ? input.split(/\r?\n/).map((text) => ({ text })) : input;

  const lines = rawLines
    .map((l) => {
      const text = normalizeLine(l.words?.length ? l.words.map((w) => w.text).join(" ") : l.text);
      return { text, offsets: l.words?.length ? wordOffsets(l.words) : undefined };
    })
    .filter((l) => l.text.length > 0);

  // Pass 1: document-level facts.
  let clock24 = false;
  let periodStart: string | undefined;
  let periodEnd: string | undefined;
  let firstExplicit: string | undefined;
  for (const { text } of lines) {
    for (const r of findTimeRanges(text)) {
      if (!r.start.suffix && !r.end.suffix && (r.start.h > 12 || r.end.h > 12)) clock24 = true;
    }
    for (const d of findDates(text)) {
      const date = resolveDate(d.month, d.day, d.year, ref);
      if (!date) continue;
      firstExplicit ??= date;
      if (d.rangeEnd && !periodStart) {
        const end = resolveDate(d.rangeEnd.month, d.rangeEnd.day, d.rangeEnd.year, date);
        if (end && end >= date) {
          periodStart = date;
          periodEnd = end;
        }
      }
    }
  }
  const weekAnchor = periodStart ?? (firstExplicit ? mondayOf(firstExplicit) : mondayOf(ref));

  // Pass 2: walk lines.
  const shifts: ParsedShift[] = [];
  const warnings: string[] = [];
  let currentDate: string | undefined;
  let header: { date: string; x?: number }[] | undefined;

  const add = (
    date: string,
    r: TimeRange,
    source: string,
    label: string | undefined,
    sure: boolean,
  ): void => {
    const resolved = resolveRange(r, clock24);
    if (!resolved) {
      warnings.push(`Skipped "${source}": the times don't look like a shift.`);
      return;
    }
    shifts.push({
      date,
      start: hhmm(resolved.start),
      end: hhmm(resolved.end),
      overnight: resolved.end <= resolved.start,
      ...(label ? { label } : {}),
      confidence: resolved.confident && sure ? "high" : "low",
      source,
    });
  };

  for (const { text, offsets } of lines) {
    const dates = findDates(text);
    const dateSpans: [number, number][] = dates.map((d) => [d.index, d.index + d.length]);
    let stripped = text;
    for (const [a, b] of dateSpans)
      stripped = stripped.slice(0, a) + " ".repeat(b - a) + stripped.slice(b);
    const ranges = findTimeRanges(stripped);
    const weekdays = findWeekdays(stripped).filter(
      (w) => !ranges.some((r) => w.index >= r.index && w.index < r.index + r.length),
    );
    const offs = [...stripped.matchAll(OFF_RE)].map((m) => ({
      index: m.index,
      kind: "off" as const,
    }));

    // A date range with no times is a period header ("Nov 17 - Nov 23").
    if (ranges.length === 0 && dates.length === 1 && dates[0]!.rangeEnd) continue;

    // Several dates or weekday names with no times: the header row of a grid.
    const columnTokens =
      dates.length >= 2
        ? dates.map((d) => ({ date: resolveDate(d.month, d.day, d.year, ref), index: d.index }))
        : weekdays.length >= 2
          ? weekdays.map((w) => ({ date: resolveWeekday(w.dow, weekAnchor), index: w.index }))
          : [];
    if (ranges.length === 0 && columnTokens.length >= 2) {
      header = columnTokens
        .filter((c): c is { date: string; index: number } => c.date !== undefined)
        .map((c) => {
          const x = xAt(offsets, c.index);
          return x === undefined ? { date: c.date } : { date: c.date, x };
        });
      continue;
    }

    // A row of times under a grid header.
    if (
      header &&
      dates.length === 0 &&
      weekdays.length === 0 &&
      ranges.length >= 1 &&
      (ranges.length + offs.length >= 2 || header.some((h) => h.x !== undefined))
    ) {
      const cells: Cell[] = [
        ...ranges.map((r) => ({ index: r.index, kind: "range" as const, range: r })),
        ...offs.map((o) => ({ index: o.index, kind: "off" as const })),
      ].sort((a, b) => a.index - b.index);
      const byPosition = header.every((h) => h.x !== undefined) && offsets !== undefined;
      cells.forEach((cell, i) => {
        if (cell.kind !== "range" || !cell.range) return;
        let target: string | undefined;
        let sure = true;
        if (byPosition) {
          const x = xAt(offsets, cell.index)!;
          target = header!.reduce((best, h) =>
            Math.abs(h.x! - x) < Math.abs(best.x! - x) ? h : best,
          ).date;
        } else if (cells.length === header!.length) {
          target = header![i]!.date;
        } else {
          target = header![i]?.date;
          sure = false;
        }
        if (target) add(target, cell.range, text, undefined, sure);
        else warnings.push(`Couldn't match "${text}" to a day.`);
      });
      continue;
    }

    // Otherwise: one date (or weekday) on the line sets the current day.
    if (dates.length >= 1) {
      const d = dates[0]!;
      currentDate = resolveDate(d.month, d.day, d.year, ref) ?? currentDate;
      header = undefined;
    } else if (weekdays.length >= 1) {
      currentDate = resolveWeekday(weekdays[0]!.dow, weekAnchor);
      header = undefined;
    }

    if (ranges.length > 0) {
      if (!currentDate) {
        warnings.push(`Found times "${text}" but no date before them.`);
        continue;
      }
      const spans: [number, number][] = [
        ...dateSpans,
        ...ranges.map((r): [number, number] => [r.index, r.index + r.length]),
      ];
      const label = ranges.length === 1 ? extractLabel(text, spans) : undefined;
      const fromWeekdayOnly =
        dates.length === 0 && weekdays.length > 0 && !periodStart && !firstExplicit;
      for (const r of ranges) add(currentDate, r, text, label, !fromWeekdayOnly);
    }
  }

  // De-duplicate and sort.
  const seen = new Set<string>();
  const unique = shifts.filter((s) => {
    const k = `${s.date} ${s.start} ${s.end}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  unique.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));

  const shiftDates = unique.map((s) => s.date);
  const minDate = shiftDates[0];
  const maxDate = shiftDates[shiftDates.length - 1];
  const start = periodStart && (!minDate || periodStart <= minDate) ? periodStart : minDate;
  const end = periodEnd && (!maxDate || periodEnd >= maxDate) ? periodEnd : maxDate;

  if (unique.length === 0)
    warnings.push("No shifts found. Try a clearer screenshot or type them in.");
  return {
    shifts: unique,
    ...(start ? { periodStart: start } : {}),
    ...(end ? { periodEnd: end } : {}),
    warnings,
  };
}

/** Convert a parsed shift into local start/end date-times. */
export function toLocalTimes(s: Pick<ParsedShift, "date" | "start" | "end" | "overnight">): {
  start: string;
  end: string;
} {
  return {
    start: `${s.date}T${s.start}`,
    end: `${s.overnight ? addDays(s.date, 1) : s.date}T${s.end}`,
  };
}
