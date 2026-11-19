/**
 * Plain-language descriptions of findings and rules, shared by the screens and
 * the evidence exports.
 */
import type {
  Amount,
  ChangePremiumRule,
  Finding,
  Jurisdiction,
  NoticeWindow,
} from "@shiftowed/rules";
import type { Translator } from "../i18n";
import type { MessageKey } from "../i18n/en";
import { formatMoney, noticeParts } from "./format";

export type Tone = "cut" | "add" | "move" | "rest" | "late" | "ok";

export function findingTone(f: Finding): Tone {
  if (f.status === "no-premium" || f.status === "excepted") return "ok";
  if (f.type === "rest") return "rest";
  if (f.type === "late-posting" || f.status === "violation") return "late";
  switch (f.change?.kind) {
    case "reduce":
    case "cancel":
      return "cut";
    case "move":
      return "move";
    default:
      return "add";
  }
}

export function findingTitle(f: Finding, { t }: Translator): string {
  if (f.type === "rest") return t("finding.rest");
  if (f.type === "late-posting") return t("finding.late");
  return t(`finding.${f.change!.kind}` as MessageKey);
}

/** "2 days, 3 hours", "5 hours", "under an hour", or "after the shift started". */
export function noticeText(hours: number, { t, tp }: Translator): string {
  const p = noticeParts(hours);
  if (p.negative && hours < -0.01) return t("notice.after");
  if (p.days === 0 && p.hours === 0) return t("notice.underHour");
  if (p.days === 0) return tp("common.hours", p.hours);
  if (p.hours === 0) return tp("common.days", p.days);
  return t("notice.daysHours", {
    days: tp("common.days", p.days),
    hours: tp("common.hours", p.hours),
  });
}

/** Hours the way laws say them: "24 hours", "72 hours", "7 days", "14 days". */
export function hoursLabel(hours: number, tr: Translator): string {
  if (hours >= 168 && hours % 24 === 0) return tr.tp("common.days", hours / 24);
  return tr.tp("common.hours", hours);
}

export function describeWindow(w: NoticeWindow, tr: Translator, minChangeMinutes?: number): string {
  let text: string;
  if (w.minHours !== undefined && w.maxHours !== undefined) {
    text = tr.t("window.between", {
      min: hoursLabel(w.minHours, tr),
      max: hoursLabel(w.maxHours, tr),
    });
  } else if (w.maxHours !== undefined) {
    text = tr.t("window.lt", { max: hoursLabel(w.maxHours, tr) });
  } else if (w.minHours !== undefined) {
    text = tr.t("window.gte", { min: hoursLabel(w.minHours, tr) });
  } else {
    text = tr.t("window.any");
  }
  if (minChangeMinutes && minChangeMinutes > 1) {
    text += ` · ${tr.t("window.minChange", { minutes: minChangeMinutes - 1 })}`;
  }
  return text;
}

function multiplier(n: number, locale: Translator["locale"]): string {
  return new Intl.NumberFormat(locale === "es" ? "es-US" : "en-US", {
    maximumFractionDigits: 3,
  }).format(n);
}

export function describeAmount(
  a: Amount,
  tr: Translator,
  opts: { secondShift?: boolean } = {},
): string {
  switch (a.type) {
    case "flat":
      return tr.t("amount.flat", { amount: formatMoney(Math.round(a.dollars * 100), tr.locale) });
    case "hoursOfPay": {
      const base = tr.tp("amount.hoursOfPay", a.hours);
      return a.prorateAddedHours ? `${base} ${tr.t("amount.prorated")}` : base;
    }
    case "perLostHour":
      return tr.t("amount.perLostHour", { multiplier: multiplier(a.multiplier, tr.locale) });
    case "perRestHour":
      return tr.t(opts.secondShift ? "amount.perRestHourShift" : "amount.perRestHour", {
        multiplier: multiplier(a.multiplier, tr.locale),
      });
    case "hoursOfPayUpTo":
      return tr.t(a.of === "lost" ? "amount.upTo.lost" : "amount.upTo.shift", {
        max: tr.tp("common.hours", a.maxHours),
      });
    case "hoursOfPayByShiftLength":
      return a.tiers
        .map((tier) =>
          tier.maxShiftHours === undefined
            ? tr.t("amount.tierLast", { hours: tr.tp("common.hours", tier.hours) })
            : tr.t("amount.tier", {
                hours: tr.tp("common.hours", tier.hours),
                max: tr.tp("common.hours", tier.maxShiftHours),
              }),
        )
        .join("; ");
  }
}

export function describeKinds(rule: Pick<ChangePremiumRule, "on">, tr: Translator): string {
  return rule.on.map((k) => tr.t(`kind.${k}` as MessageKey)).join(", ");
}

/** Exceptions that could waive at least one premium line of a finding. */
export function applicableExceptions(f: Finding, j: Jurisdiction) {
  const ids = new Set<string>();
  if (f.type === "change" && f.change) {
    for (const rule of j.premiums) {
      if (rule.on.includes(f.change.kind)) for (const e of rule.exceptions ?? []) ids.add(e);
    }
    for (const p of j.prohibitions ?? []) {
      if (p.on.includes(f.change.kind)) for (const e of p.exceptions ?? []) ids.add(e);
    }
  }
  if (f.type === "rest") {
    for (const rule of j.rest ?? []) for (const e of rule.exceptions ?? []) ids.add(e);
  }
  return j.exceptions.filter((e) => ids.has(e.id));
}
