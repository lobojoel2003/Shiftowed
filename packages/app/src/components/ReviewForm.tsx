import { addDays, localToInstant, shiftHours, type Shift } from "@shiftowed/rules";
import { AlertTriangle, CalendarRange, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useT } from "../i18n";
import { newId } from "../lib/ids";
import { formatDate, formatHours, formatMoney, nowLocalInput } from "../lib/format";
import { toLocalTimes } from "../lib/parseSchedule";
import { useStore, type NewVersionInput } from "../lib/store";
import { FindingCard } from "./FindingCard";

export interface DraftShift {
  id: string;
  date: string;
  /** HH:mm */
  start: string;
  /** HH:mm */
  end: string;
  label?: string;
  low?: boolean;
}

export interface ReviewValue {
  periodStart: string;
  periodEnd: string;
  postedLocal: string;
  shifts: DraftShift[];
  note: string;
}

export function draftFromShift(s: Shift): DraftShift {
  return {
    id: s.id,
    date: s.start.slice(0, 10),
    start: s.start.slice(11, 16),
    end: s.end.slice(11, 16),
    ...(s.label ? { label: s.label } : {}),
  };
}

export function shiftFromDraft(d: DraftShift): Shift {
  const times = toLocalTimes({
    date: d.date,
    start: d.start,
    end: d.end,
    overnight: d.end <= d.start,
  });
  return { id: d.id, ...times, ...(d.label ? { label: d.label } : {}) };
}

function datesIn(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end && out.length < 62; d = addDays(d, 1)) out.push(d);
  return out;
}

export function validateReview(
  v: ReviewValue,
):
  | "review.error.periodOrder"
  | "review.error.order"
  | "review.error.period"
  | "review.error.posted"
  | null {
  if (!v.periodStart || !v.periodEnd || v.periodEnd < v.periodStart)
    return "review.error.periodOrder";
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v.postedLocal)) return "review.error.posted";
  for (const s of v.shifts) {
    if (!s.start || !s.end || s.start === s.end) return "review.error.order";
    if (s.date < v.periodStart || s.date > v.periodEnd) return "review.error.period";
  }
  return null;
}

/**
 * Edit a schedule version: dates covered, when it was posted, and the shifts.
 * Shows a live preview of what the update changes and what it's worth.
 */
export function ReviewForm({
  value,
  onChange,
  baseline,
  screenshotTime,
  previewInput,
  submitLabel,
  busy,
  onSubmit,
}: {
  value: ReviewValue;
  onChange: (v: ReviewValue) => void;
  /** Current schedule, used to fill newly added dates. */
  baseline: Shift[];
  /** `datetime-local` value for the screenshot's timestamp, if known. */
  screenshotTime?: string;
  previewInput: Omit<NewVersionInput, "postedAt" | "periodStart" | "periodEnd" | "shifts"> & {
    /** When editing an existing version, its id (it is left out of the preview). */
    replacingId?: string;
  };
  submitLabel: string;
  busy: boolean;
  onSubmit: () => void;
}) {
  const tr = useT();
  const { t, locale } = tr;
  const { jurisdiction, preview, data } = useStore();
  const tz = jurisdiction?.timeZone ?? "America/New_York";
  const [touched, setTouched] = useState(false);
  const error = validateReview(value);
  const dates = datesIn(value.periodStart, value.periodEnd);

  const setPeriod = (periodStart: string, periodEnd: string) => {
    if (!periodStart || !periodEnd) return;
    const before = new Set(datesIn(value.periodStart, value.periodEnd));
    const added = datesIn(periodStart, periodEnd).filter((d) => !before.has(d));
    const fill = baseline
      .filter((s) => added.includes(s.start.slice(0, 10)))
      .map((s) => ({ ...draftFromShift(s), id: newId("s") }));
    onChange({ ...value, periodStart, periodEnd, shifts: [...value.shifts, ...fill] });
  };

  const shiftWeek = (days: number) =>
    onChange({
      ...value,
      periodStart: addDays(value.periodStart, days),
      periodEnd: addDays(value.periodEnd, days),
      shifts: value.shifts.map((s) => ({ ...s, date: addDays(s.date, days) })),
    });

  const update = (id: string, patch: Partial<DraftShift>) =>
    onChange({
      ...value,
      shifts: value.shifts.map((s) => (s.id === id ? { ...s, ...patch, low: false } : s)),
    });

  const remove = (id: string) =>
    onChange({ ...value, shifts: value.shifts.filter((s) => s.id !== id) });

  const add = (date: string) => {
    const last =
      [...value.shifts].reverse().find((s) => s.date === date) ??
      value.shifts[value.shifts.length - 1];
    onChange({
      ...value,
      shifts: [
        ...value.shifts,
        { id: newId("s"), date, start: last?.start ?? "09:00", end: last?.end ?? "17:00" },
      ],
    });
  };

  const draftPreview = useMemo(() => {
    if (error) return null;
    try {
      const evaluation = preview({
        ...previewInput,
        postedAt: new Date(localToInstant(value.postedLocal, tz)).toISOString(),
        periodStart: value.periodStart,
        periodEnd: value.periodEnd,
        shifts: value.shifts.map(shiftFromDraft),
      });
      if (!evaluation) return null;
      const own = evaluation.findings.filter((f) => f.key.startsWith("preview:"));
      const covered = new Set<string>();
      for (const v of data.versions) {
        if (v.id === previewInput.replacingId) continue;
        for (const d of datesIn(v.periodStart, v.periodEnd)) covered.add(d);
      }
      const isNew = datesIn(value.periodStart, value.periodEnd).every((d) => !covered.has(d));
      return { findings: own, total: own.reduce((s, f) => s + f.cents, 0), isNew };
    } catch {
      return null;
    }
  }, [error, preview, previewInput, tz, value, data.versions]);

  const hasLow = value.shifts.some((s) => s.low);

  return (
    <form
      className="stack"
      style={{ gap: 16 }}
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (!error) onSubmit();
      }}
      noValidate
    >
      <section className="card stack">
        <div className="row">
          <CalendarRange size={18} aria-hidden />
          <h2 className="grow">{t("review.period")}</h2>
        </div>
        <div className="row">
          <label className="field grow">
            <span>{t("review.from")}</span>
            <input
              type="date"
              value={value.periodStart}
              onChange={(e) =>
                setPeriod(
                  e.target.value,
                  value.periodEnd < e.target.value ? e.target.value : value.periodEnd,
                )
              }
              data-testid="period-start"
            />
          </label>
          <label className="field grow">
            <span>{t("review.to")}</span>
            <input
              type="date"
              value={value.periodEnd}
              min={value.periodStart}
              onChange={(e) => setPeriod(value.periodStart, e.target.value)}
              data-testid="period-end"
            />
          </label>
        </div>
        <p className="faint">{t("review.periodHint")}</p>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <button className="btn small" type="button" onClick={() => shiftWeek(-7)}>
            <ChevronLeft size={16} aria-hidden /> {t("review.weekEarlier")}
          </button>
          <button className="btn small" type="button" onClick={() => shiftWeek(7)}>
            {t("review.weekLater")} <ChevronRight size={16} aria-hidden />
          </button>
        </div>
      </section>

      <section className="card stack">
        <label className="field">
          <span>{t("review.posted")}</span>
          <input
            type="datetime-local"
            value={value.postedLocal}
            onChange={(e) => onChange({ ...value, postedLocal: e.target.value })}
            data-testid="posted-at"
          />
          <span className="hint">{t("review.postedHint")}</span>
        </label>
        <div className="row wrap">
          <button
            className="btn small"
            type="button"
            onClick={() => onChange({ ...value, postedLocal: nowLocalInput(tz) })}
          >
            {t("review.now")}
          </button>
          {screenshotTime && (
            <button
              className="btn small"
              type="button"
              onClick={() => onChange({ ...value, postedLocal: screenshotTime })}
            >
              {t("review.screenshotTime")}
            </button>
          )}
        </div>
      </section>

      <h2 className="section-title">{t("review.title")}</h2>
      {hasLow && (
        <div className="notice-box" role="note">
          <AlertTriangle size={18} aria-hidden />
          <span>{t("review.lowConfidence")}</span>
        </div>
      )}
      <div className="list" data-testid="shift-editor">
        {dates.map((date) => {
          const day = value.shifts.filter((s) => s.date === date);
          return (
            <div className="editor-day" key={date}>
              <div className="day-head">
                <span>
                  {formatDate(date, locale, { weekday: "long", month: "short", day: "numeric" })}
                </span>
                {day.length === 0 && <span className="faint">{t("schedule.off")}</span>}
              </div>
              {day.map((s) => (
                <div
                  className={`editor-shift${s.low ? " low" : ""}`}
                  key={s.id}
                  data-testid="draft-shift"
                >
                  <input
                    type="time"
                    aria-label={t("review.start")}
                    value={s.start}
                    onChange={(e) => update(s.id, { start: e.target.value })}
                  />
                  <span className="to">{t("review.to.word")}</span>
                  <input
                    type="time"
                    aria-label={t("review.end")}
                    value={s.end}
                    onChange={(e) => update(s.id, { end: e.target.value })}
                  />
                  <button
                    className="icon-btn"
                    type="button"
                    aria-label={t("review.remove")}
                    onClick={() => remove(s.id)}
                  >
                    <X size={18} aria-hidden />
                  </button>
                  {s.start && s.end && s.start !== s.end && (
                    <span className="faint diff">
                      {formatHours(
                        shiftHours(shiftFromDraft(s).start, shiftFromDraft(s).end, tz),
                        locale,
                      )}
                      {s.end <= s.start ? ` · ${t("review.overnight")}` : ""}
                      {s.label ? ` · ${s.label}` : ""}
                    </span>
                  )}
                </div>
              ))}
              <button className="btn ghost small add-shift" type="button" onClick={() => add(date)}>
                <Plus size={16} aria-hidden /> {t("review.addShift")}
              </button>
            </div>
          );
        })}
      </div>

      <label className="field">
        <span>{t("review.note")}</span>
        <input
          type="text"
          value={value.note}
          placeholder={t("review.notePlaceholder")}
          onChange={(e) => onChange({ ...value, note: e.target.value })}
          maxLength={200}
        />
      </label>

      {draftPreview && (
        <section className="stack" aria-live="polite" data-testid="review-preview">
          <h2 className="section-title">
            {t("review.preview")}
            {draftPreview.total > 0 && (
              <span className="money">{formatMoney(draftPreview.total, locale)}</span>
            )}
          </h2>
          {draftPreview.findings.length === 0 ? (
            <p className="card flat muted">
              {draftPreview.isNew ? t("review.preview.first") : t("review.preview.none")}
            </p>
          ) : (
            draftPreview.findings.map((f) => (
              <FindingCard key={f.key} finding={f} jurisdiction={jurisdiction!} linked={false} />
            ))
          )}
          {draftPreview.isNew && draftPreview.findings.length > 0 && (
            <p className="faint">{t("review.preview.first")}</p>
          )}
        </section>
      )}

      {touched && error && (
        <div className="notice-box danger" role="alert">
          <AlertTriangle size={18} aria-hidden />
          <span>{t(error)}</span>
        </div>
      )}

      <button
        className="btn primary block"
        type="submit"
        disabled={busy}
        data-testid="save-version"
      >
        {submitLabel}
      </button>
    </form>
  );
}
