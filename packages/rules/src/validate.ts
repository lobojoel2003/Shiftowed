/**
 * Semantic checks for jurisdiction files, beyond what the JSON Schema can say.
 * Returns a list of human-readable problems (empty when the file is sound).
 */
import { isDate } from "./time.js";
import type { Jurisdiction } from "./types.js";

export function checkJurisdiction(j: Jurisdiction): string[] {
  const problems: string[] = [];
  const where = (msg: string): void => {
    problems.push(`${j.id}: ${msg}`);
  };

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: j.timeZone });
  } catch {
    where(`unknown time zone "${j.timeZone}"`);
  }
  for (const [field, value] of [
    ["effective", j.effective],
    ["lastVerified", j.lastVerified],
  ] as const) {
    if (!isDate(value)) where(`${field} "${value}" is not a real date`);
  }

  const exceptionIds = new Set(j.exceptions.map((e) => e.id));
  if (exceptionIds.size !== j.exceptions.length) where("duplicate exception ids");

  const ruleIds = new Set<string>();
  const check = (id: string, exceptions: string[] | undefined): void => {
    if (ruleIds.has(id)) where(`duplicate rule id "${id}"`);
    ruleIds.add(id);
    for (const e of exceptions ?? []) {
      if (!exceptionIds.has(e)) where(`rule "${id}" references unknown exception "${e}"`);
    }
  };

  for (const rule of j.premiums) {
    check(rule.id, rule.exceptions);
    const { minHours, maxHours } = rule.notice;
    if (minHours !== undefined && maxHours !== undefined && minHours >= maxHours) {
      where(`rule "${rule.id}" has an empty notice window (${minHours} to ${maxHours})`);
    }
    if (maxHours !== undefined && maxHours > j.advanceNotice.hours) {
      where(`rule "${rule.id}" charges for changes made before the advance-notice deadline`);
    }
    if (
      rule.amount.type === "perLostHour" &&
      rule.on.some((k) => k !== "reduce" && k !== "cancel")
    ) {
      where(`rule "${rule.id}" prices lost hours but applies to changes that add hours`);
    }
    if (
      rule.amount.type === "hoursOfPayUpTo" &&
      rule.amount.of === "lost" &&
      rule.on.some((k) => k !== "reduce" && k !== "cancel")
    ) {
      where(`rule "${rule.id}" caps pay by hours cut but applies to changes that add hours`);
    }
    if (rule.amount.type === "perRestHour") {
      where(`rule "${rule.id}" uses perRestHour, which only makes sense in a rest rule`);
    }
    if (rule.amount.type === "hoursOfPayByShiftLength") {
      const tiers = rule.amount.tiers;
      const last = tiers[tiers.length - 1];
      if (last?.maxShiftHours !== undefined) {
        where(`rule "${rule.id}" shift-length tiers need a final tier without maxShiftHours`);
      }
    }
  }
  for (const rule of j.prohibitions ?? []) {
    check(rule.id, rule.exceptions);
  }
  for (const rule of j.rest ?? []) {
    check(rule.id, rule.exceptions);
    if (rule.amount.type !== "flat" && rule.amount.type !== "perRestHour") {
      where(`rest rule "${rule.id}" must use a flat or perRestHour amount`);
    }
  }
  return problems;
}
