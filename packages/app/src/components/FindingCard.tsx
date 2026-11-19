import type { Finding, Jurisdiction, Shift } from "@shiftowed/rules";
import { ArrowRight } from "lucide-react";
import { useT, type Translator } from "../i18n";
import type { MessageKey } from "../i18n/en";
import { findingTitle, findingTone, noticeText } from "../lib/describe";
import {
  formatDate,
  formatHours,
  formatInstant,
  formatMoney,
  formatShiftTimes,
  formatTime,
} from "../lib/format";
import { href } from "../lib/router";
import { Citation } from "./Citation";
import { FindingIcon } from "./FindingIcon";

export function shiftLine(s: Shift, locale: Translator["locale"]): string {
  return `${formatDate(s.start.slice(0, 10), locale)} · ${formatShiftTimes(s.start, s.end, locale)}`;
}

export function FindingSummary({ finding, tr }: { finding: Finding; tr: Translator }) {
  const { locale } = tr;
  if (finding.type === "change" && finding.change) {
    const { before, after } = finding.change;
    if (before && after) {
      const sameDay = before.start.slice(0, 10) === after.start.slice(0, 10);
      return (
        <span>
          {sameDay ? formatDate(before.start.slice(0, 10), locale) + " · " : ""}
          <s>
            {sameDay
              ? formatShiftTimes(before.start, before.end, locale)
              : shiftLine(before, locale)}
          </s>{" "}
          <ArrowRight size={12} aria-label="to" style={{ verticalAlign: "-1px" }} />{" "}
          {sameDay ? formatShiftTimes(after.start, after.end, locale) : shiftLine(after, locale)}
        </span>
      );
    }
    const s = (after ?? before)!;
    return <span>{before && !after ? <s>{shiftLine(s, locale)}</s> : shiftLine(s, locale)}</span>;
  }
  if (finding.type === "rest" && finding.rest) {
    const { first, second } = finding.rest;
    return (
      <span>
        {formatDate(first.end.slice(0, 10), locale, { weekday: "short" })}{" "}
        {formatTime(first.end, locale)}{" "}
        <ArrowRight size={12} aria-label="to" style={{ verticalAlign: "-1px" }} />{" "}
        {formatDate(second.start.slice(0, 10), locale, { weekday: "short" })}{" "}
        {formatTime(second.start, locale)}
      </span>
    );
  }
  if (finding.latePosting) {
    return (
      <span>
        {formatDate(finding.latePosting.firstNewDate, locale, {
          weekday: "long",
          month: "short",
          day: "numeric",
        })}
      </span>
    );
  }
  return null;
}

export function amountText(f: Finding, tr: Translator): string {
  if (f.status === "owed") return formatMoney(f.cents, tr.locale);
  return tr.t(`finding.status.${f.status}` as MessageKey);
}

export function FindingCard({
  finding,
  jurisdiction,
  linked = true,
}: {
  finding: Finding;
  jurisdiction: Jurisdiction;
  linked?: boolean;
}) {
  const tr = useT();
  const { t, locale } = tr;
  const tone = findingTone(finding);
  const dim = finding.status === "no-premium" || finding.status === "excepted";
  const citation = finding.lines[0]?.citation ?? finding.citation;

  const noticeMeta = (hours: number) =>
    hours < 0 ? t("finding.noNotice") : t("finding.notice", { notice: noticeText(hours, tr) });
  let meta: string | null = null;
  if (finding.change) {
    meta = `${t("finding.told", {
      when: formatInstant(finding.change.postedAt, jurisdiction.timeZone, locale),
    })} · ${noticeMeta(finding.notice?.hours ?? finding.change.noticeHours)}`;
  } else if (finding.rest) {
    meta = t("finding.restGap", { gap: formatHours(finding.rest.gapHours, locale) });
  } else if (finding.latePosting) {
    meta = noticeMeta(finding.latePosting.noticeHours);
  }

  return (
    <article
      className={`finding tone-${tone}${dim ? " dim" : ""}`}
      data-testid="finding"
      data-status={finding.status}
    >
      <div className="icon">
        <FindingIcon finding={finding} />
      </div>
      <div style={{ minWidth: 0 }}>
        {linked ? (
          <a className="title stretch" href={href({ name: "finding", key: finding.key })}>
            {findingTitle(finding, tr)}
          </a>
        ) : (
          <span className="title">{findingTitle(finding, tr)}</span>
        )}
        <div className="sub">
          <FindingSummary finding={finding} tr={tr} />
        </div>
        <div className="meta">
          {meta && <span>{meta}</span>}
          {citation && !dim && <Citation citation={citation} />}
        </div>
      </div>
      <div className={`amount${finding.status === "owed" ? " money" : ""}`}>
        {amountText(finding, tr)}
      </div>
    </article>
  );
}
