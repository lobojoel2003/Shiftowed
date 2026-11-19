import { addDays, buildTimeline, shiftHours, type Shift } from "@shiftowed/rules";
import { Camera, ChevronRight, Keyboard, PencilLine, Sparkles, Upload, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { Page } from "../components/Layout";
import { useT } from "../i18n";
import type { MessageKey } from "../i18n/en";
import { formatDate, formatHours, formatInstant, formatShiftTimes } from "../lib/format";
import { mondayOf, todayIn } from "../lib/payPeriod";
import { href } from "../lib/router";
import { useStore } from "../lib/store";
import type { VersionSource } from "../lib/types";

const SOURCE_ICON: Record<VersionSource, typeof Camera> = {
  ocr: Camera,
  manual: Keyboard,
  change: Zap,
  import: Upload,
  demo: Sparkles,
};

export function useCurrentSchedule(): { shifts: Shift[]; covered: Set<string> } {
  const { data, jurisdiction } = useStore();
  return useMemo(() => {
    const covered = new Set<string>();
    for (const v of data.versions) {
      for (let d = v.periodStart; d <= v.periodEnd; d = addDays(d, 1)) covered.add(d);
    }
    if (!jurisdiction) return { shifts: [], covered };
    try {
      return { shifts: buildTimeline(data.versions, jurisdiction.timeZone).current, covered };
    } catch {
      return { shifts: [], covered };
    }
  }, [data.versions, jurisdiction]);
}

export function Schedule() {
  const { t, tp, locale } = useT();
  const { data, jurisdiction } = useStore();
  const { shifts, covered } = useCurrentSchedule();
  const [showPast, setShowPast] = useState(false);
  const tz = jurisdiction?.timeZone ?? "America/New_York";
  const thisWeek = mondayOf(todayIn(tz));

  const weeks = useMemo(() => {
    const dates = [...covered].sort();
    const map = new Map<string, string[]>();
    for (const d of dates) {
      const w = mondayOf(d);
      map.set(w, [...(map.get(w) ?? []), d]);
    }
    return [...map.entries()];
  }, [covered]);
  const visible = weeks.filter(([w]) => showPast || w >= thisWeek);
  const hiddenCount = weeks.length - visible.length;

  return (
    <Page>
      <div className="page-title">
        <h1>{t("schedule.title")}</h1>
        <p className="muted">{t("schedule.lead")}</p>
      </div>

      {weeks.length === 0 ? (
        <div className="card empty">
          <div className="art">
            <PencilLine size={32} aria-hidden />
          </div>
          <h2>{t("schedule.empty.title")}</h2>
          <p>{t("schedule.empty.body")}</p>
          <a className="btn primary" href={href({ name: "add" })} style={{ marginTop: 16 }}>
            {t("owed.addSchedule")}
          </a>
        </div>
      ) : (
        <>
          {hiddenCount > 0 && (
            <button
              className="btn ghost small"
              type="button"
              onClick={() => setShowPast(!showPast)}
            >
              {showPast ? t("schedule.hidePast") : t("schedule.showPast")}
            </button>
          )}
          {visible.map(([week, dates]) => (
            <section key={week} className="stack" style={{ gap: 8 }}>
              <h2 className="section-title">
                {t("schedule.week", {
                  date: formatDate(week, locale, { month: "long", day: "numeric" }),
                })}
                <span>
                  {formatHours(
                    shifts
                      .filter((s) => dates.includes(s.start.slice(0, 10)))
                      .reduce((sum, s) => sum + shiftHours(s.start, s.end, tz), 0),
                    locale,
                  )}
                </span>
              </h2>
              <div className="list">
                {dates.map((date) => {
                  const day = shifts.filter((s) => s.start.startsWith(date));
                  return (
                    <div className="day-group" key={date} data-testid="schedule-day">
                      <div className="day-head">
                        <span>
                          {formatDate(date, locale, {
                            weekday: "long",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                      {day.length === 0 && <div className="off">{t("schedule.off")}</div>}
                      {day.map((s) => (
                        <a
                          key={s.id}
                          className="shift-pill"
                          href={href({ name: "add", mode: "change", shiftId: s.id })}
                        >
                          <span className="bar" />
                          <span className="grow">
                            <span className="time">{formatShiftTimes(s.start, s.end, locale)}</span>
                            {s.label && <span className="faint"> · {s.label}</span>}
                          </span>
                          <span className="faint">
                            {formatHours(shiftHours(s.start, s.end, tz), locale)}
                          </span>
                          <ChevronRight className="chev" size={16} aria-hidden />
                        </a>
                      ))}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      )}

      {data.versions.length > 0 && (
        <>
          <h2 className="section-title">
            {t("schedule.history")} <span>{data.versions.length}</span>
          </h2>
          <div className="list">
            {[...data.versions].reverse().map((v) => {
              const Icon = SOURCE_ICON[v.source];
              return (
                <a className="list-item" key={v.id} href={href({ name: "version", id: v.id })}>
                  <span className="lead">
                    <Icon size={18} aria-hidden />
                  </span>
                  <span className="grow">
                    <strong>{t("schedule.version", { n: v.number })}</strong>
                    <span className="faint">
                      {" "}
                      · {t(`schedule.source.${v.source}` as MessageKey)}
                    </span>
                    {v.editedAt && <span className="faint"> · {t("schedule.edited")}</span>}
                    <span className="faint" style={{ display: "block" }}>
                      {tp("schedule.versionMeta", v.shifts.length, {
                        posted: formatInstant(v.postedAt, tz, locale),
                      })}
                    </span>
                  </span>
                  <ChevronRight className="chev" size={18} aria-hidden />
                </a>
              );
            })}
          </div>
        </>
      )}
    </Page>
  );
}
