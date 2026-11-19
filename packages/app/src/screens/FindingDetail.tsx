import { localToInstant, type Finding, type Jurisdiction, type Shift } from "@shiftowed/rules";
import { ChevronRight, Info, Pencil } from "lucide-react";
import { useId, useState } from "react";
import { Citation } from "../components/Citation";
import { amountText, FindingSummary } from "../components/FindingCard";
import { FindingIcon } from "../components/FindingIcon";
import { Page } from "../components/Layout";
import { useToast } from "../components/Toast";
import { useT, type Translator } from "../i18n";
import {
  applicableExceptions,
  findingTitle,
  findingTone,
  hoursLabel,
  noticeText,
} from "../lib/describe";
import {
  formatDate,
  formatHours,
  formatInstant,
  formatMoney,
  formatShiftTimes,
  formatTime,
} from "../lib/format";
import { href } from "../lib/router";
import { useStore } from "../lib/store";

function Timeline({ before, after, tr }: { before?: Shift; after?: Shift; tr: Translator }) {
  const shifts = [before, after].filter((s): s is Shift => Boolean(s));
  const toMin = (local: string) => localToInstant(local, "UTC") / 60_000;
  const lo = Math.min(...shifts.map((s) => toMin(s.start))) - 60;
  const hi = Math.max(...shifts.map((s) => toMin(s.end))) + 60;
  const pos = (s: Shift) => ({
    left: `${((toMin(s.start) - lo) / (hi - lo)) * 100}%`,
    width: `${((toMin(s.end) - toMin(s.start)) / (hi - lo)) * 100}%`,
  });
  const first = shifts[0]!;
  const last = shifts[shifts.length - 1]!;
  return (
    <div className="timeline" aria-hidden>
      <div className="track" style={{ top: 0 }} />
      <div className="track" style={{ top: 26 }} />
      {before && (
        <div className="seg before" style={{ top: 0, ...pos(before) }}>
          {formatShiftTimes(before.start, before.end, tr.locale)}
        </div>
      )}
      {after && (
        <div className="seg after" style={{ top: 26, ...pos(after) }}>
          {formatShiftTimes(after.start, after.end, tr.locale)}
        </div>
      )}
      <div className="ticks">
        <span>{formatTime(first.start, tr.locale)}</span>
        <span>{formatTime(last.end, tr.locale)}</span>
      </div>
    </div>
  );
}

function ShiftRows({ finding, tr }: { finding: Finding; tr: Translator }) {
  const { t, locale } = tr;
  const c = finding.change!;
  const row = (label: string, s: Shift | undefined, struck: boolean) => (
    <div className="row" style={{ justifyContent: "space-between" }}>
      <span className="faint">{label}</span>
      <span style={{ fontWeight: 600, textDecoration: struck ? "line-through" : undefined }}>
        {s
          ? `${formatDate(s.start.slice(0, 10), locale)} · ${formatShiftTimes(s.start, s.end, locale)}`
          : "—"}
      </span>
    </div>
  );
  return (
    <div className="stack" style={{ gap: 6 }}>
      {row(t("detail.before"), c.before, Boolean(c.before))}
      {row(t("detail.after"), c.after, false)}
      {c.before && c.after && c.before.start.slice(0, 10) === c.after.start.slice(0, 10) && (
        <Timeline before={c.before} after={c.after} tr={tr} />
      )}
    </div>
  );
}

function ExceptionPicker({
  finding,
  jurisdiction,
}: {
  finding: Finding;
  jurisdiction: Jurisdiction;
}) {
  const tr = useT();
  const { t } = tr;
  const { data, actions } = useStore();
  const toast = useToast();
  const name = useId();
  const options = applicableExceptions(finding, jurisdiction);
  // Update the radio immediately; the save happens in the background.
  const [selected, setSelected] = useState(data.exceptions[finding.key] ?? "");
  if (options.length === 0) return null;
  const choose = async (id: string) => {
    setSelected(id);
    await actions.setException(finding.key, id || null);
    toast.show(t("detail.exception.saved"));
  };
  return (
    <section className="card stack" aria-labelledby={`${name}-title`}>
      <div>
        <h2 id={`${name}-title`}>{t("detail.exception.title")}</h2>
        <p className="muted" style={{ fontSize: "0.92rem", marginTop: 4 }}>
          {t("detail.exception.lead")}
        </p>
      </div>
      <label className="choice">
        <input
          type="radio"
          name={name}
          checked={selected === ""}
          onChange={() => void choose("")}
        />
        <span>{t("detail.exception.none")}</span>
      </label>
      {options.map((e) => (
        <label className="choice" key={e.id}>
          <input
            type="radio"
            name={name}
            checked={selected === e.id}
            onChange={() => void choose(e.id)}
          />
          <span>
            <strong>{e.label}</strong>
            <span className="faint" style={{ display: "block", margin: "2px 0 6px" }}>
              {e.description}
            </span>
            <Citation citation={e.citation} />
          </span>
        </label>
      ))}
    </section>
  );
}

function NoticeCard({ finding, jurisdiction }: { finding: Finding; jurisdiction: Jurisdiction }) {
  const tr = useT();
  const { t, locale } = tr;
  const tz = jurisdiction.timeZone;
  const change = finding.change!;
  const toSchedule = finding.notice?.to === "schedule";
  const hours = finding.notice?.hours ?? change.noticeHours;
  return (
    <section className="card stack">
      <h2>{t("detail.notice.title")}</h2>
      <p>
        {toSchedule
          ? t("detail.notice.bodySchedule", {
              posted: formatInstant(change.postedAt, tz, locale),
              start: formatDate(change.scheduleStart, locale, {
                weekday: "long",
                month: "short",
                day: "numeric",
              }),
            })
          : t("detail.notice.body", {
              posted: formatInstant(change.postedAt, tz, locale),
              start: formatInstant(new Date(change.affectedStartMs).toISOString(), tz, locale),
            })}{" "}
        <strong>
          {hours < 0
            ? t(toSchedule ? "detail.notice.lateSchedule" : "detail.notice.late", {
                notice: noticeText(-hours, tr),
              })
            : t("detail.notice.amount", { notice: noticeText(hours, tr) })}
        </strong>
      </p>
      {toSchedule && (
        <p className="faint">{t("detail.notice.scheduleNote", { law: jurisdiction.shortName })}</p>
      )}
      <p className="muted">
        {t("detail.notice.required", {
          law: jurisdiction.shortName,
          label: jurisdiction.advanceNotice.label,
        })}{" "}
        <Citation citation={jurisdiction.advanceNotice.citation} />
      </p>
    </section>
  );
}

export function FindingDetail({ findingKey }: { findingKey: string }) {
  const tr = useT();
  const { t, locale } = tr;
  const { evaluation, jurisdiction, data } = useStore();
  const finding = evaluation?.findings.find((f) => f.key === findingKey);

  if (!jurisdiction || !finding) {
    return (
      <Page back={{ name: "owed" }}>
        <div className="card empty">
          <p>{t("detail.notFound")}</p>
        </div>
      </Page>
    );
  }

  const tone = findingTone(finding);
  const version = finding.change
    ? data.versions.find((v) => v.id === finding.change!.versionId)
    : finding.latePosting
      ? data.versions.find((v) => v.id === finding.latePosting!.versionId)
      : undefined;

  return (
    <Page back={{ name: "owed" }} title={findingTitle(finding, tr)}>
      <section className={`card tone-${tone}`}>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div className="detail-icon">
            <FindingIcon finding={finding} size={24} />
          </div>
          <div className="grow">
            <h1 style={{ fontSize: "1.25rem" }}>{findingTitle(finding, tr)}</h1>
            {!finding.change && (
              <p className="muted" style={{ fontSize: "0.92rem", marginTop: 2 }}>
                <FindingSummary finding={finding} tr={tr} />
              </p>
            )}
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              className={finding.status === "owed" ? "money detail-amount" : `badge tone-${tone}`}
            >
              {amountText(finding, tr)}
            </div>
          </div>
        </div>
        {finding.change && (
          <div style={{ marginTop: 14 }}>
            <ShiftRows finding={finding} tr={tr} />
          </div>
        )}
      </section>

      {finding.change && <NoticeCard finding={finding} jurisdiction={jurisdiction} />}

      {finding.rest && (
        <section className="card stack">
          <h2>{t("finding.rest")}</h2>
          <p>
            {t("detail.rest.body", {
              end: `${formatDate(finding.rest.first.end.slice(0, 10), locale)} ${formatTime(finding.rest.first.end, locale)}`,
              start: `${formatDate(finding.rest.second.start.slice(0, 10), locale)} ${formatTime(finding.rest.second.start, locale)}`,
              gap: formatHours(finding.rest.gapHours, locale),
              law: jurisdiction.shortName,
              min: hoursLabel(
                (jurisdiction.rest ?? []).find((r) => finding.lines[0]?.ruleId === r.id)
                  ?.minRestHours ?? 10,
                tr,
              ),
            })}
          </p>
        </section>
      )}

      {finding.latePosting && (
        <section className="card stack">
          <h2>{t("finding.late")}</h2>
          <p>
            {t("detail.late.body", {
              notice: noticeText(finding.latePosting.noticeHours, tr),
              date: formatDate(finding.latePosting.firstNewDate, locale, {
                weekday: "long",
                month: "long",
                day: "numeric",
              }),
              law: jurisdiction.shortName,
              label: jurisdiction.advanceNotice.label,
            })}
          </p>
          <Citation citation={jurisdiction.advanceNotice.citation} />
        </section>
      )}

      {finding.lines.length > 0 && finding.status !== "excepted" && (
        <section className="card stack">
          <h2>{t("detail.owed")}</h2>
          {finding.lines.map((line) => (
            <div key={line.ruleId} className="stack" style={{ gap: 6 }}>
              <div className="row" style={{ alignItems: "flex-start" }}>
                <div className="grow">
                  <strong>{line.label}</strong>
                  <div className="faint">{line.formula}</div>
                </div>
                <div className="money" style={{ fontWeight: 800 }}>
                  {line.cents === null ? "—" : formatMoney(line.cents, locale)}
                </div>
              </div>
              <div>
                <Citation citation={line.citation} />
              </div>
              {line.citation.quote && (
                <details className="disclosure">
                  <summary className="faint">
                    {t("detail.keyLanguage")}{" "}
                    <ChevronRight className="chev" size={16} aria-hidden />
                  </summary>
                  <blockquote className="quote">{line.citation.quote}</blockquote>
                </details>
              )}
            </div>
          ))}
          {finding.lines.length > 1 && (
            <div
              className="row"
              style={{
                justifyContent: "space-between",
                borderTop: "1px solid var(--border)",
                paddingTop: 10,
              }}
            >
              <strong>{t("detail.total")}</strong>
              <strong className="money">{formatMoney(finding.cents, locale)}</strong>
            </div>
          )}
          {finding.status === "needs-rate" && (
            <div className="notice-box">
              <Info size={18} aria-hidden />
              <span className="grow">{t("detail.rateMissing")}</span>
              <a className="btn small" href={href({ name: "settings" })}>
                {t("owed.addRate")}
              </a>
            </div>
          )}
        </section>
      )}

      {finding.status === "no-premium" && finding.type === "change" && (
        <section className="card stack">
          <h2>{t("detail.noPremium.title")}</h2>
          <p className="muted">{t("detail.noPremium.body", { law: jurisdiction.shortName })}</p>
        </section>
      )}

      {finding.status === "violation" && finding.violation && (
        <section className="card stack">
          <h2>{t("detail.violation.title")}</h2>
          <p>{t("detail.violation.body", { rule: finding.violation.label })}</p>
          {finding.citation && <Citation citation={finding.citation} />}
        </section>
      )}

      {(finding.status === "owed" ||
        finding.status === "needs-rate" ||
        finding.status === "excepted" ||
        finding.status === "violation") && (
        <ExceptionPicker finding={finding} jurisdiction={jurisdiction} />
      )}

      {version && (
        <a
          className="list-item card flat"
          href={href({ name: "version", id: version.id })}
          style={{ borderRadius: 16 }}
        >
          <span className="lead">
            <Pencil size={18} aria-hidden />
          </span>
          <span className="grow">{t("detail.editVersion", { n: version.number })}</span>
          <ChevronRight className="chev" size={18} aria-hidden />
        </a>
      )}

      <p className="footer-note">{t("common.notLegalAdvice")}</p>
    </Page>
  );
}
