/**
 * Schedule diffing.
 *
 * Versions are applied in `postedAt` order to a running timeline. Each version
 * replaces the timeline's shifts inside its own date range, so posting next
 * week's schedule never "cancels" this week's shifts. Inside the overlap, shifts
 * are matched old-to-new and every difference becomes a `ScheduleChange`.
 */
import { addDays, dateOf, HOURS, localToInstant, parseInstant, startOfDayInstant } from "./time.js";
import type { ChangeKind, LatePosting, ScheduleChange, ScheduleVersion, Shift } from "./types.js";

/** Changes shorter than this (in hours) are treated as no change in length. */
const EPSILON_HOURS = 1 / 60;
/** A cancelled shift and an added shift of equal length this many days apart count as one move. */
const MOVE_WINDOW_DAYS = 6;

interface TimedShift {
  shift: Shift;
  versionId: string;
  startMs: number;
  endMs: number;
  date: string;
}

export interface TimelineResult {
  changes: ScheduleChange[];
  latePostings: LatePosting[];
  /** The schedule as it stands after the last version. */
  current: Shift[];
}

function timed(shift: Shift, versionId: string, timeZone: string): TimedShift {
  const startMs = localToInstant(shift.start, timeZone);
  const endMs = localToInstant(shift.end, timeZone);
  if (endMs <= startMs) {
    throw new RangeError(
      `Shift ${shift.id} ends before it starts (${shift.start} to ${shift.end}).`,
    );
  }
  return { shift, versionId, startMs, endMs, date: dateOf(shift.start) };
}

function hoursOf(t: TimedShift): number {
  return (t.endMs - t.startMs) / HOURS;
}

function overlapMs(a: TimedShift, b: TimedShift): number {
  return Math.max(0, Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs));
}

function inPeriod(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

/** Sort versions by when they were posted (stable for equal timestamps). */
export function sortVersions(versions: readonly ScheduleVersion[]): ScheduleVersion[] {
  return versions
    .map((v, i) => ({ v, i, t: parseInstant(v.postedAt) }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map((x) => x.v);
}

interface Pair {
  before: TimedShift;
  after: TimedShift;
}

/**
 * Match shifts from the old state (`prev`) to the new version (`next`).
 * Order of preference: identical times, overlapping times (largest overlap
 * first), same start date, then equal-length shifts within a few days (a move).
 */
export function matchShifts(
  prev: TimedShift[],
  next: TimedShift[],
): { pairs: Pair[]; removed: TimedShift[]; added: TimedShift[]; unchanged: Pair[] } {
  const prevLeft = new Set(prev);
  const nextLeft = new Set(next);
  const unchanged: Pair[] = [];
  const pairs: Pair[] = [];

  const take = (before: TimedShift, after: TimedShift, into: Pair[]): void => {
    prevLeft.delete(before);
    nextLeft.delete(after);
    into.push({ before, after });
  };

  // 1. Identical start and end.
  for (const p of prev) {
    for (const n of nextLeft) {
      if (p.startMs === n.startMs && p.endMs === n.endMs) {
        take(p, n, unchanged);
        break;
      }
    }
  }

  // 2. Overlapping shifts, greedily by largest overlap.
  const overlaps: { p: TimedShift; n: TimedShift; ms: number }[] = [];
  for (const p of prevLeft) {
    for (const n of nextLeft) {
      const ms = overlapMs(p, n);
      if (ms > 0) overlaps.push({ p, n, ms });
    }
  }
  overlaps.sort((a, b) => b.ms - a.ms || a.p.startMs - b.p.startMs);
  for (const o of overlaps) {
    if (prevLeft.has(o.p) && nextLeft.has(o.n)) take(o.p, o.n, pairs);
  }

  // 3. Same start date, closest start time first.
  const sameDay: { p: TimedShift; n: TimedShift; d: number }[] = [];
  for (const p of prevLeft) {
    for (const n of nextLeft) {
      if (p.date === n.date) sameDay.push({ p, n, d: Math.abs(p.startMs - n.startMs) });
    }
  }
  sameDay.sort((a, b) => a.d - b.d);
  for (const o of sameDay) {
    if (prevLeft.has(o.p) && nextLeft.has(o.n)) take(o.p, o.n, pairs);
  }

  // 4. Equal-length shifts moved to a nearby day.
  const moved: { p: TimedShift; n: TimedShift; d: number }[] = [];
  for (const p of prevLeft) {
    for (const n of nextLeft) {
      const sameLength = Math.abs(hoursOf(p) - hoursOf(n)) < EPSILON_HOURS;
      const days = Math.abs(n.startMs - p.startMs) / (24 * HOURS);
      if (sameLength && days <= MOVE_WINDOW_DAYS) moved.push({ p, n, d: days });
    }
  }
  moved.sort((a, b) => a.d - b.d);
  for (const o of moved) {
    if (prevLeft.has(o.p) && nextLeft.has(o.n)) take(o.p, o.n, pairs);
  }

  return { pairs, removed: [...prevLeft], added: [...nextLeft], unchanged };
}

function classify(before: TimedShift, after: TimedShift): ChangeKind {
  const delta = hoursOf(after) - hoursOf(before);
  if (delta > EPSILON_HOURS) return "extend";
  if (delta < -EPSILON_HOURS) return "reduce";
  return "move";
}

function makeChange(
  version: ScheduleVersion,
  postedMs: number,
  kind: ChangeKind,
  before: TimedShift | undefined,
  after: TimedShift | undefined,
  scheduleStartOf: (date: string) => string,
  timeZone: string,
): ScheduleChange {
  const starts = [before?.startMs, after?.startMs].filter((x): x is number => x !== undefined);
  const affectedStartMs = Math.min(...starts);
  const beforeHours = before ? hoursOf(before) : 0;
  const afterHours = after ? hoursOf(after) : 0;
  const hoursDelta = afterHours - beforeHours;
  const changeMinutes =
    before && after
      ? Math.max(Math.abs(after.startMs - before.startMs), Math.abs(after.endMs - before.endMs)) /
        60_000
      : (before ?? after)!.endMs / 60_000 - (before ?? after)!.startMs / 60_000;
  // Attribute to the date of the shift the worker was originally counting on, if any.
  const shiftDate = (before ?? after)!.date;
  const scheduleStart = [before?.date, after?.date]
    .filter((d): d is string => d !== undefined)
    .map(scheduleStartOf)
    .sort()[0]!;
  const scheduleStartMs = startOfDayInstant(scheduleStart, timeZone);
  return {
    key: `${version.id}:${before?.shift.id ?? "-"}>${after?.shift.id ?? "-"}`,
    versionId: version.id,
    previousVersionId: before?.versionId ?? version.id,
    kind,
    ...(before ? { before: before.shift } : {}),
    ...(after ? { after: after.shift } : {}),
    hoursDelta: round4(hoursDelta),
    shiftHours: round4(kind === "reduce" || kind === "cancel" ? beforeHours : afterHours),
    changeMinutes: Math.round(changeMinutes),
    noticeHours: round4((affectedStartMs - postedMs) / HOURS),
    scheduleStart,
    scheduleNoticeHours: round4((scheduleStartMs - postedMs) / HOURS),
    affectedStartMs,
    shiftDate,
    postedAt: version.postedAt,
  };
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/**
 * Apply versions in order and collect every change.
 *
 * @param advanceNoticeHours If given, a newly covered date range posted with
 *   less notice than this is reported as a late posting.
 */
export function buildTimeline(
  versions: readonly ScheduleVersion[],
  timeZone: string,
  advanceNoticeHours?: number,
): TimelineResult {
  let state: TimedShift[] = [];
  const covered = new Set<string>();
  /** Date -> first day of the work schedule that first posted it. */
  const scheduleStarts = new Map<string, string>();
  const scheduleStartOf = (date: string): string => scheduleStarts.get(date) ?? date;
  const changes: ScheduleChange[] = [];
  const latePostings: LatePosting[] = [];

  for (const version of sortVersions(versions)) {
    if (version.periodEnd < version.periodStart) {
      throw new RangeError(`Version ${version.id} has periodEnd before periodStart.`);
    }
    const postedMs = parseInstant(version.postedAt);
    const ids = new Set<string>();
    const next = version.shifts.map((s) => {
      if (ids.has(s.id))
        throw new RangeError(`Duplicate shift id ${s.id} in version ${version.id}`);
      ids.add(s.id);
      const t = timed(s, version.id, timeZone);
      if (!inPeriod(t.date, version.periodStart, version.periodEnd)) {
        throw new RangeError(
          `Shift ${s.id} starts on ${t.date}, outside version ${version.id} (${version.periodStart} to ${version.periodEnd}).`,
        );
      }
      return t;
    });

    // Dates in this version's range that no earlier version covered are new postings.
    const newDates: string[] = [];
    for (let d = version.periodStart; d <= version.periodEnd; d = addDays(d, 1)) {
      if (!covered.has(d)) newDates.push(d);
    }
    const isNew = (date: string): boolean => newDates.includes(date);

    const prevInRange = state.filter(
      (t) => inPeriod(t.date, version.periodStart, version.periodEnd) && !isNew(t.date),
    );
    const nextOld = next.filter((t) => !isNew(t.date));
    const { pairs, removed, added } = matchShifts(prevInRange, nextOld);

    const change = (kind: ChangeKind, before?: TimedShift, after?: TimedShift): ScheduleChange =>
      makeChange(version, postedMs, kind, before, after, scheduleStartOf, timeZone);
    for (const p of pairs) changes.push(change(classify(p.before, p.after), p.before, p.after));
    for (const r of removed) changes.push(change("cancel", r, undefined));
    for (const a of added) changes.push(change("add", undefined, a));

    if (advanceNoticeHours !== undefined && newDates.length > 0) {
      const firstNewDate = newDates[0]!;
      const noticeHours = (startOfDayInstant(firstNewDate, timeZone) - postedMs) / HOURS;
      if (noticeHours < advanceNoticeHours) {
        latePostings.push({
          key: `${version.id}:late`,
          versionId: version.id,
          firstNewDate,
          noticeHours: round4(noticeHours),
          requiredHours: advanceNoticeHours,
        });
      }
    }

    state = [
      ...state.filter((t) => !inPeriod(t.date, version.periodStart, version.periodEnd)),
      ...next,
    ];
    for (const d of newDates) {
      covered.add(d);
      scheduleStarts.set(d, newDates[0]!);
    }
  }

  state.sort((a, b) => a.startMs - b.startMs);
  changes.sort((a, b) => a.affectedStartMs - b.affectedStartMs || a.key.localeCompare(b.key));
  return { changes, latePostings, current: state.map((t) => t.shift) };
}

export { timed as toTimedShift };
export type { TimedShift };
