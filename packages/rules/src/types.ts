/**
 * Shared types for the Shiftowed rules library.
 *
 * A *jurisdiction* file describes one Fair Workweek law as data: how much notice
 * the employer must give, which schedule changes trigger predictability pay, how
 * much is owed, and the legal citation for every number.
 *
 * A *schedule version* is a timestamped snapshot of a worker's schedule for a
 * date range. The engine compares versions, classifies each change, and prices it
 * using the jurisdiction's rules.
 */

/** How a shift changed between two schedule versions. */
export type ChangeKind =
  /** A shift that was not on the schedule before. */
  | "add"
  /** An existing shift got longer (it may also have moved). */
  | "extend"
  /** An existing shift moved to a different time or date with the same length. */
  | "move"
  /** An existing shift got shorter (it may also have moved). */
  | "reduce"
  /** An existing shift was removed. */
  | "cancel";

export const CHANGE_KINDS: readonly ChangeKind[] = ["add", "extend", "move", "reduce", "cancel"];

/** A pointer to the legal text that supports a number. */
export interface Citation {
  /** Human-readable cite, e.g. "NYC Admin. Code § 20-1222(a)(1)". */
  code: string;
  /** Link to the official text (code library, statute, or agency rule). */
  url: string;
  /** Short quote or paraphrase of the operative language. */
  quote?: string;
}

/** How a premium is computed. All money is in US dollars. */
export type Amount =
  /** A fixed amount per change or per instance. */
  | { type: "flat"; dollars: number }
  /**
   * A number of hours at the worker's regular rate, e.g. "one hour of pay".
   * With `prorateAddedHours`, adding less than `hours` of work pays only the
   * time added (Seattle's rule for additions under an hour).
   */
  | { type: "hoursOfPay"; hours: number; prorateAddedHours?: boolean }
  /** `multiplier` x regular rate x hours the worker lost, e.g. "half-time for hours not worked". */
  | { type: "perLostHour"; multiplier: number }
  /** Hours of pay that depend on the length of the affected shift. Tiers are checked in order. */
  | { type: "hoursOfPayByShiftLength"; tiers: ShiftLengthTier[] }
  /**
   * The smaller of `maxHours` and either the scheduled shift's length
   * (`of: "shift"`) or the hours cut (`of: "lost"`), paid at the regular rate.
   * E.g. Berkeley: "four hours or the number of cancelled or reduced hours,
   * whichever is less".
   */
  | { type: "hoursOfPayUpTo"; maxHours: number; of: "shift" | "lost" }
  /**
   * Extra `multiplier` x regular rate for each hour worked inside the rest window.
   * Time-and-a-half is `0.5`, because the base hour is already paid as wages.
   */
  | { type: "perRestHour"; multiplier: number };

export interface ShiftLengthTier {
  /** Applies when the affected shift is at most this many hours long. Omit for the last tier. */
  maxShiftHours?: number;
  hours: number;
}

/**
 * Notice window in hours, measured from when the change was communicated to the
 * start of the affected shift. `minHours` is inclusive and `maxHours` is
 * exclusive, so `{ minHours: 168, maxHours: 336 }` means "at least 7 days but
 * less than 14 days". Either bound may be omitted.
 */
export interface NoticeWindow {
  minHours?: number;
  maxHours?: number;
  /**
   * What notice is measured to. `"shift"` (default): the start of the affected
   * shift. `"schedule"`: 12:00 a.m. on the first day of the work schedule that
   * contains the shift, as NYC's rules do and as laws keyed to a posting
   * deadline ("14 days before the first day of the schedule") imply.
   */
  to?: NoticeReference;
}

export type NoticeReference = "shift" | "schedule";

/** A predictability-pay rule for schedule changes. */
export interface ChangePremiumRule {
  id: string;
  /**
   * Rules that share a group are alternatives: the first matching rule in a group
   * wins. Rules in different groups stack.
   */
  group: string;
  /** Short plain-language description, e.g. "Hours cut with less than 7 days' notice". */
  label: string;
  /** Change kinds this rule applies to. */
  on: ChangeKind[];
  notice: NoticeWindow;
  /**
   * Smallest change, in whole minutes, that triggers this rule. Laws often
   * ignore small adjustments (e.g. "more than 15 minutes" is 16). See
   * `ScheduleChange.changeMinutes` for how a change is measured.
   */
  minChangeMinutes?: number;
  amount: Amount;
  /** Ids of exceptions (from the jurisdiction's `exceptions`) that waive this rule. */
  exceptions?: string[];
  citation: Citation;
}

/**
 * A change the law forbids outright (instead of, or in addition to, pricing it).
 * Matching changes that earn no premium are reported as violations.
 */
export interface ChangeProhibition {
  id: string;
  label: string;
  on: ChangeKind[];
  notice: NoticeWindow;
  /** Smallest change, in whole minutes, that counts. */
  minChangeMinutes?: number;
  exceptions?: string[];
  citation: Citation;
}

/** A premium for too little rest between shifts ("clopening"). */
export interface RestRule {
  id: string;
  label: string;
  /** A gap shorter than this many hours between two shifts triggers the rule. */
  minRestHours: number;
  /** Only count shifts that start on consecutive calendar days (NYC's clopening definition). */
  consecutiveDaysOnly?: boolean;
  /**
   * Also count two shifts that start on the same calendar day (a split shift).
   * Off by default: most laws measure rest between one day's shift and the next.
   */
  includeSameDayShifts?: boolean;
  /**
   * Which hours a `perRestHour` premium covers: only the hours of the second
   * shift inside the rest window (default), or the whole second shift.
   */
  premiumHours?: "window" | "secondShift";
  amount: Amount;
  exceptions?: string[];
  citation: Citation;
}

/** A situation in which the law says no premium is owed. */
export interface ExceptionDef {
  id: string;
  label: string;
  description: string;
  citation: Citation;
}

export interface Coverage {
  /** One-paragraph summary of who is covered. */
  summary: string;
  industries: string[];
  /** Employer size test, e.g. "500+ employees worldwide". */
  employerThreshold: string;
  /** Which employees are covered, e.g. wage caps or exclusions. */
  employees?: string;
  notes?: string[];
}

export interface Enforcement {
  agency: string;
  url: string;
  complaintUrl?: string;
  phone?: string;
}

export interface Source {
  title: string;
  url: string;
}

export interface OtherRight {
  label: string;
  citation: Citation;
}

/** One Fair Workweek law, as stored in `rules/<id>.json`. */
export interface Jurisdiction {
  $schema?: string;
  /** Stable id, e.g. "us-ny-nyc-fast-food". Matches the file name. */
  id: string;
  /** Display name, e.g. "New York City: Fast Food". */
  name: string;
  /** Very short name for tight spaces, e.g. "NYC Fast Food". */
  shortName: string;
  /** Official name of the law. */
  law: string;
  region: {
    country: "US";
    /** Two-letter state code. */
    state: string;
    city?: string;
    county?: string;
  };
  /** IANA time zone used to interpret local shift times. */
  timeZone: string;
  currency: "USD";
  status: "in-force" | "pending" | "repealed";
  /** Date the current version of the rules took effect (YYYY-MM-DD). */
  effective: string;
  /** Date a maintainer last checked these rules against the primary source (YYYY-MM-DD). */
  lastVerified: string;
  coverage: Coverage;
  advanceNotice: {
    /** How far ahead the schedule must be posted, in hours (14 days = 336). */
    hours: number;
    label: string;
    citation: Citation;
  };
  premiums: ChangePremiumRule[];
  /** Changes that are prohibited regardless of premium pay. */
  prohibitions?: ChangeProhibition[];
  rest?: RestRule[];
  exceptions: ExceptionDef[];
  otherRights?: OtherRight[];
  enforcement: Enforcement;
  sources: Source[];
  /** Caveats about how this file simplifies the law. */
  notes?: string[];
}

/* ------------------------------------------------------------------------ */
/* Schedules                                                                */
/* ------------------------------------------------------------------------ */

/**
 * A scheduled shift. Times are *local wall-clock* times in the jurisdiction's
 * time zone, formatted `YYYY-MM-DDTHH:mm`. A shift that crosses midnight has an
 * `end` on the next day.
 */
export interface Shift {
  /** Stable id. Must be unique within a version. */
  id: string;
  start: string;
  end: string;
  /** Optional note: role, station, location. */
  label?: string;
}

/**
 * A snapshot of the schedule for a date range, as the worker received it.
 */
export interface ScheduleVersion {
  id: string;
  /**
   * When the employer posted or communicated this version, as an ISO 8601
   * instant (with offset or Z). Notice is measured from here.
   */
  postedAt: string;
  /** First calendar day this version covers (YYYY-MM-DD), inclusive. */
  periodStart: string;
  /** Last calendar day this version covers (YYYY-MM-DD), inclusive. */
  periodEnd: string;
  shifts: Shift[];
}

/** A change between two versions, before pricing. */
export interface ScheduleChange {
  /** Stable key, built from the version id and shift ids. */
  key: string;
  versionId: string;
  /** The version the change was compared against (the earlier state of that shift). */
  previousVersionId: string;
  kind: ChangeKind;
  before?: Shift;
  after?: Shift;
  /** Positive when hours were added, negative when hours were lost. */
  hoursDelta: number;
  /** Length of the affected shift in hours (the original shift for cuts, the new one otherwise). */
  shiftHours: number;
  /**
   * Size of the change in minutes: the whole shift for adds and cancellations,
   * otherwise the larger of the start-time and end-time movement.
   */
  changeMinutes: number;
  /** Hours from `postedAt` to the start of the affected shift. Negative if it had already started. */
  noticeHours: number;
  /**
   * First day (YYYY-MM-DD) of the work schedule that contains the affected
   * shift: the first new date of the version that first posted that date.
   */
  scheduleStart: string;
  /** Hours from `postedAt` to 12:00 a.m. on `scheduleStart`. Negative once the schedule has begun. */
  scheduleNoticeHours: number;
  /** Instant (ms since epoch) of the earliest start among before/after. */
  affectedStartMs: number;
  /** Calendar date (YYYY-MM-DD) used to assign the change to a pay period. */
  shiftDate: string;
  postedAt: string;
}

export interface RestInstance {
  key: string;
  first: Shift;
  second: Shift;
  /** Hours between the end of the first shift and the start of the second. */
  gapHours: number;
  /** Hours of the second shift that fall inside the rest window. */
  hoursInWindow: number;
  /** Length of the second shift in hours. */
  secondShiftHours: number;
  shiftDate: string;
}

export interface LatePosting {
  key: string;
  versionId: string;
  /** First date of the newly posted period. */
  firstNewDate: string;
  /** Hours of notice actually given before that date began. */
  noticeHours: number;
  requiredHours: number;
}

export type FindingStatus =
  /** A premium is owed. */
  | "owed"
  /** A premium would be owed, but the worker's regular rate is needed to compute it. */
  | "needs-rate"
  /** The worker marked this change as falling under an exception. */
  | "excepted"
  /** The change gave enough notice, so no premium is owed. */
  | "no-premium"
  /** A violation without an automatic premium (e.g. a late schedule). Worth reporting. */
  | "violation";

export interface PremiumLine {
  ruleId: string;
  label: string;
  /** Amount in cents, or null if the regular rate is missing. */
  cents: number | null;
  /** Plain-language formula, e.g. "1 hour x $18.50". */
  formula: string;
  citation: Citation;
  exceptions: string[];
}

export interface Finding {
  key: string;
  type: "change" | "rest" | "late-posting";
  status: FindingStatus;
  shiftDate: string;
  change?: ScheduleChange;
  rest?: RestInstance;
  latePosting?: LatePosting;
  /** Premiums that apply (empty for "no-premium" and "violation"). */
  lines: PremiumLine[];
  /** Sum of `lines` in cents (0 when excepted or when the rate is missing). */
  cents: number;
  /** Exception the worker selected, if any. */
  exception?: ExceptionDef;
  /** Citation for "violation" and "no-premium" findings. */
  citation?: Citation;
  /** For "violation" findings from a prohibition: what was violated. */
  violation?: { ruleId: string; label: string };
  /** For change findings: the notice that decided the outcome, and what it was measured to. */
  notice?: { hours: number; to: NoticeReference };
}

export interface EvaluateOptions {
  /** The worker's regular hourly rate in dollars. Needed for hours-of-pay premiums. */
  hourlyRate?: number;
  /** Exceptions the worker selected, keyed by finding key. */
  exceptions?: Record<string, string>;
}

export interface Evaluation {
  jurisdictionId: string;
  findings: Finding[];
  /** Total owed in cents across all findings. */
  totalCents: number;
  /** True when at least one premium needs the hourly rate. */
  needsRate: boolean;
}
