/**
 * @shiftowed/rules
 *
 * Fair Workweek laws as open data, and an engine that turns a worker's schedule
 * history into predictability-pay findings with a citation for every dollar.
 *
 * @example
 * ```ts
 * import { evaluate, getJurisdiction } from "@shiftowed/rules";
 *
 * const nyc = getJurisdiction("us-ny-nyc-fast-food")!;
 * const result = evaluate(nyc, versions, { hourlyRate: 18 });
 * console.log(result.totalCents); // e.g. 4500 for a $45 premium
 * ```
 *
 * @license MIT
 */
export * from "./types.js";
export {
  addDays,
  dateOf,
  daysBetween,
  isDate,
  isLocalDateTime,
  localToInstant,
  parseInstant,
  shiftHours,
  startOfDayInstant,
} from "./time.js";
export { buildTimeline, matchShifts, sortVersions, type TimelineResult } from "./diff.js";
export {
  evaluate,
  findRestInstances,
  formatCents,
  matchingRules,
  noticeFor,
  priceAmount,
  priceChange,
  priceRest,
  totalBetween,
  withinNotice,
} from "./engine.js";
export { checkJurisdiction } from "./validate.js";
export { JURISDICTIONS, getJurisdiction, RULES_VERSION } from "./jurisdictions.js";
