/**
 * The pricing engine: turns schedule versions into findings, each with an
 * amount, a plain-language formula and a citation.
 */
import { buildTimeline, toTimedShift } from "./diff.js";
import { HOURS } from "./time.js";
import type {
  Amount,
  ChangePremiumRule,
  EvaluateOptions,
  Evaluation,
  ExceptionDef,
  Finding,
  Jurisdiction,
  NoticeWindow,
  PremiumLine,
  RestInstance,
  RestRule,
  ScheduleChange,
  ScheduleVersion,
  Shift,
} from "./types.js";

/** Format cents as US dollars, e.g. 1850 -> "$18.50". */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, "0")}`;
}

function formatHours(h: number): string {
  const rounded = Math.round(h * 100) / 100;
  return `${rounded} ${rounded === 1 ? "hour" : "hours"}`;
}

function formatMultiplier(m: number): string {
  return `${Math.round(m * 1000) / 1000}`;
}

/** The notice a window looks at for a change: to the shift, or to the schedule's first day. */
export function noticeFor(window: NoticeWindow, change: ScheduleChange): number {
  return window.to === "schedule" ? change.scheduleNoticeHours : change.noticeHours;
}

export function withinNotice(rule: { notice: NoticeWindow }, noticeHours: number): boolean {
  const { minHours, maxHours } = rule.notice;
  if (minHours !== undefined && noticeHours < minHours) return false;
  if (maxHours !== undefined && noticeHours >= maxHours) return false;
  return true;
}

interface Priced {
  cents: number | null;
  formula: string;
}

/**
 * Price an amount.
 *
 * @param hours For `perLostHour` the hours lost, for `perRestHour` the hours
 *   inside the rest window, and for `hoursOfPayByShiftLength` the shift length.
 */
export function priceAmount(amount: Amount, hours: number, hourlyRate: number | undefined): Priced {
  const rateCents =
    hourlyRate !== undefined && hourlyRate > 0 ? Math.round(hourlyRate * 100) : undefined;
  const rateText = rateCents !== undefined ? formatCents(rateCents) : "your hourly rate";
  switch (amount.type) {
    case "flat":
      return {
        cents: Math.round(amount.dollars * 100),
        formula: `${formatCents(amount.dollars * 100)} flat`,
      };
    case "hoursOfPay": {
      const paid =
        amount.prorateAddedHours && hours > 0 && hours < amount.hours ? hours : amount.hours;
      return {
        cents: rateCents === undefined ? null : Math.round(rateCents * paid),
        formula:
          paid === amount.hours
            ? `${formatHours(paid)} of pay x ${rateText}`
            : `${formatHours(paid)} of pay x ${rateText} (pro-rated for the time added)`,
      };
    }
    case "perLostHour":
      return {
        cents: rateCents === undefined ? null : Math.round(rateCents * amount.multiplier * hours),
        formula: `${formatMultiplier(amount.multiplier)} x ${rateText} x ${formatHours(hours)} not worked`,
      };
    case "perRestHour":
      return {
        cents: rateCents === undefined ? null : Math.round(rateCents * amount.multiplier * hours),
        formula: `extra ${formatMultiplier(amount.multiplier)} x ${rateText} x ${formatHours(hours)} inside the rest window`,
      };
    case "hoursOfPayUpTo": {
      const paid = Math.min(amount.maxHours, Math.max(0, hours));
      const basis = amount.of === "lost" ? "hours cut" : "shift length";
      return {
        cents: rateCents === undefined ? null : Math.round(rateCents * paid),
        formula: `${formatHours(paid)} of pay x ${rateText} (${basis}, up to ${amount.maxHours})`,
      };
    }
    case "hoursOfPayByShiftLength": {
      const tier =
        amount.tiers.find((t) => t.maxShiftHours === undefined || hours <= t.maxShiftHours) ??
        amount.tiers[amount.tiers.length - 1];
      if (!tier) return { cents: 0, formula: "no tier" };
      const shiftText =
        tier.maxShiftHours !== undefined
          ? `shift of ${formatHours(hours)} (up to ${tier.maxShiftHours})`
          : `shift of ${formatHours(hours)}`;
      return {
        cents: rateCents === undefined ? null : Math.round(rateCents * tier.hours),
        formula: `${formatHours(tier.hours)} of pay x ${rateText} (${shiftText})`,
      };
    }
  }
}

/** Pick the rules that apply to a change: the first match in each group. */
export function matchingRules(
  jurisdiction: Jurisdiction,
  change: ScheduleChange,
): ChangePremiumRule[] {
  const seen = new Set<string>();
  const out: ChangePremiumRule[] = [];
  for (const rule of jurisdiction.premiums) {
    if (seen.has(rule.group)) continue;
    if (!rule.on.includes(change.kind)) continue;
    if (!withinNotice(rule, noticeFor(rule.notice, change))) continue;
    if (rule.minChangeMinutes !== undefined && change.changeMinutes < rule.minChangeMinutes)
      continue;
    seen.add(rule.group);
    out.push(rule);
  }
  return out;
}

function hoursForAmount(amount: Amount, change: ScheduleChange): number {
  switch (amount.type) {
    case "hoursOfPay":
      return Math.max(0, change.hoursDelta);
    case "perLostHour":
      return Math.max(0, -change.hoursDelta);
    case "hoursOfPayByShiftLength":
      return change.shiftHours;
    case "hoursOfPayUpTo":
      return amount.of === "lost" ? Math.max(0, -change.hoursDelta) : change.shiftHours;
    default:
      return 0;
  }
}

function findException(
  jurisdiction: Jurisdiction,
  id: string | undefined,
): ExceptionDef | undefined {
  if (!id) return undefined;
  return jurisdiction.exceptions.find((e) => e.id === id);
}

function finalize(
  base: Omit<Finding, "status" | "cents" | "exception">,
  jurisdiction: Jurisdiction,
  selected: string | undefined,
): Finding {
  const lines = base.lines;
  if (lines.length === 0) {
    return { ...base, status: "no-premium", cents: 0 };
  }
  const exception = findException(jurisdiction, selected);
  if (exception && lines.every((l) => l.exceptions.includes(exception.id))) {
    return { ...base, status: "excepted", cents: 0, exception };
  }
  // An exception that waives only some lines removes just those lines.
  const kept = exception ? lines.filter((l) => !l.exceptions.includes(exception.id)) : lines;
  const missingRate = kept.some((l) => l.cents === null);
  const cents = kept.reduce((sum, l) => sum + (l.cents ?? 0), 0);
  return {
    ...base,
    lines: kept,
    status: missingRate ? "needs-rate" : "owed",
    cents,
    ...(exception && kept.length !== lines.length ? { exception } : {}),
  };
}

/** Price one schedule change. */
export function priceChange(
  jurisdiction: Jurisdiction,
  change: ScheduleChange,
  options: EvaluateOptions = {},
): Finding {
  const selected = options.exceptions?.[change.key];
  const rules = matchingRules(jurisdiction, change);
  const lines: PremiumLine[] = rules.map((rule) => {
    const priced = priceAmount(
      rule.amount,
      hoursForAmount(rule.amount, change),
      options.hourlyRate,
    );
    return {
      ruleId: rule.id,
      label: rule.label,
      cents: priced.cents,
      formula: priced.formula,
      citation: rule.citation,
      exceptions: rule.exceptions ?? [],
    };
  });
  const prohibition =
    lines.length === 0
      ? (jurisdiction.prohibitions ?? []).find(
          (p) =>
            p.on.includes(change.kind) &&
            withinNotice(p, noticeFor(p.notice, change)) &&
            (p.minChangeMinutes === undefined || change.changeMinutes >= p.minChangeMinutes),
        )
      : undefined;

  // Report the notice the way the deciding rule measures it.
  const window =
    rules[0]?.notice ??
    prohibition?.notice ??
    jurisdiction.premiums.find((r) => r.on.includes(change.kind))?.notice ??
    jurisdiction.prohibitions?.find((r) => r.on.includes(change.kind))?.notice;
  const notice = { hours: noticeFor(window ?? {}, change), to: window?.to ?? "shift" } as const;

  if (prohibition) {
    const exception = findException(jurisdiction, selected);
    const base = {
      key: change.key,
      type: "change" as const,
      shiftDate: change.shiftDate,
      change,
      notice,
      lines: [],
      cents: 0,
      citation: prohibition.citation,
    };
    if (exception && (prohibition.exceptions ?? []).includes(exception.id)) {
      return { ...base, status: "excepted", exception };
    }
    return {
      ...base,
      status: "violation",
      violation: { ruleId: prohibition.id, label: prohibition.label },
    };
  }
  return finalize(
    {
      key: change.key,
      type: "change",
      shiftDate: change.shiftDate,
      change,
      notice,
      lines,
      ...(lines.length === 0 ? { citation: jurisdiction.advanceNotice.citation } : {}),
    },
    jurisdiction,
    selected,
  );
}

/** Find pairs of consecutive shifts with less rest than `rule.minRestHours`. */
export function findRestInstances(
  rule: RestRule,
  shifts: readonly Shift[],
  timeZone: string,
): RestInstance[] {
  const timedShifts = shifts
    .map((s) => toTimedShift(s, "", timeZone))
    .sort((a, b) => a.startMs - b.startMs);
  const out: RestInstance[] = [];
  for (let i = 1; i < timedShifts.length; i++) {
    const first = timedShifts[i - 1]!;
    const second = timedShifts[i]!;
    const gapMs = second.startMs - first.endMs;
    if (gapMs < 0) continue; // overlapping shifts are a data problem, not a rest violation
    const gapHours = gapMs / HOURS;
    if (gapHours >= rule.minRestHours) continue;
    if (rule.consecutiveDaysOnly) {
      const nextDay = new Date(`${first.date}T00:00:00Z`);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      if (second.date !== nextDay.toISOString().slice(0, 10)) continue;
    }
    // Two shifts that start on the same day are a split shift, not rest between shifts.
    if (!rule.includeSameDayShifts && first.date === second.date) continue;
    const windowEnd = first.endMs + rule.minRestHours * HOURS;
    const hoursInWindow = Math.max(0, Math.min(second.endMs, windowEnd) - second.startMs) / HOURS;
    const secondShiftHours = (second.endMs - second.startMs) / HOURS;
    out.push({
      key: `rest:${rule.id}:${first.shift.id}>${second.shift.id}`,
      first: first.shift,
      second: second.shift,
      gapHours: Math.round(gapHours * 10_000) / 10_000,
      hoursInWindow: Math.round(hoursInWindow * 10_000) / 10_000,
      secondShiftHours: Math.round(secondShiftHours * 10_000) / 10_000,
      shiftDate: second.date,
    });
  }
  return out;
}

/** Price one rest-between-shifts instance. */
export function priceRest(
  jurisdiction: Jurisdiction,
  rule: RestRule,
  instance: RestInstance,
  options: EvaluateOptions = {},
): Finding {
  const hours =
    rule.premiumHours === "secondShift" ? instance.secondShiftHours : instance.hoursInWindow;
  const priced = priceAmount(rule.amount, hours, options.hourlyRate);
  const formula =
    rule.amount.type === "perRestHour" && rule.premiumHours === "secondShift"
      ? priced.formula.replace("inside the rest window", "of the second shift")
      : priced.formula;
  return finalize(
    {
      key: instance.key,
      type: "rest",
      shiftDate: instance.shiftDate,
      rest: instance,
      lines: [
        {
          ruleId: rule.id,
          label: rule.label,
          cents: priced.cents,
          formula,
          citation: rule.citation,
          exceptions: rule.exceptions ?? [],
        },
      ],
    },
    jurisdiction,
    options.exceptions?.[instance.key],
  );
}

/**
 * Evaluate a worker's schedule history under one jurisdiction.
 *
 * Returns every detected change (including ones that gave enough notice, so the
 * worker can see why nothing is owed), every rest-between-shifts premium on the
 * current schedule, and every late posting.
 */
export function evaluate(
  jurisdiction: Jurisdiction,
  versions: readonly ScheduleVersion[],
  options: EvaluateOptions = {},
): Evaluation {
  const timeline = buildTimeline(versions, jurisdiction.timeZone, jurisdiction.advanceNotice.hours);
  const findings: Finding[] = timeline.changes.map((c) => priceChange(jurisdiction, c, options));

  for (const rule of jurisdiction.rest ?? []) {
    for (const instance of findRestInstances(rule, timeline.current, jurisdiction.timeZone)) {
      findings.push(priceRest(jurisdiction, rule, instance, options));
    }
  }

  for (const late of timeline.latePostings) {
    findings.push({
      key: late.key,
      type: "late-posting",
      status: "violation",
      shiftDate: late.firstNewDate,
      latePosting: late,
      lines: [],
      cents: 0,
      citation: jurisdiction.advanceNotice.citation,
    });
  }

  findings.sort((a, b) => a.shiftDate.localeCompare(b.shiftDate) || a.key.localeCompare(b.key));
  return {
    jurisdictionId: jurisdiction.id,
    findings,
    totalCents: findings.reduce((s, f) => s + f.cents, 0),
    needsRate: findings.some((f) => f.status === "needs-rate"),
  };
}

/** Sum the cents owed for findings whose shift date is in `[start, end]` (inclusive dates). */
export function totalBetween(findings: readonly Finding[], start: string, end: string): number {
  return findings
    .filter((f) => f.shiftDate >= start && f.shiftDate <= end)
    .reduce((s, f) => s + f.cents, 0);
}
