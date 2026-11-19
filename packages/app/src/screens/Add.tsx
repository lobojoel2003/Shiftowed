import { addDays, localToInstant, type Shift } from "@shiftowed/rules";
import { Camera, ChevronRight, ImageUp, Keyboard, Loader2, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FindingCard } from "../components/FindingCard";
import { Page } from "../components/Layout";
import {
  draftFromShift,
  ReviewForm,
  shiftFromDraft,
  type DraftShift,
  type ReviewValue,
} from "../components/ReviewForm";
import { useToast } from "../components/Toast";
import { useT } from "../i18n";
import { newId } from "../lib/ids";
import { formatDate, formatShiftTimes, nowLocalInput } from "../lib/format";
import { recognizeSchedule, type OcrProgress } from "../lib/ocr";
import { parseScheduleText } from "../lib/parseSchedule";
import { mondayOf, todayIn } from "../lib/payPeriod";
import { href, navigate, type Route } from "../lib/router";
import { useStore, type NewVersionInput } from "../lib/store";
import type { VersionSource } from "../lib/types";
import { useCurrentSchedule } from "./Schedule";

function useTz(): string {
  return useStore().jurisdiction?.timeZone ?? "America/New_York";
}

function useSaveVersion() {
  const { actions, preview } = useStore();
  const toast = useToast();
  const { tp, t } = useT();
  const tz = useTz();
  return useCallback(
    async (
      value: ReviewValue,
      source: VersionSource,
      extra: Partial<NewVersionInput> = {},
      editId?: string,
    ) => {
      const input: NewVersionInput = {
        postedAt: new Date(localToInstant(value.postedLocal, tz)).toISOString(),
        periodStart: value.periodStart,
        periodEnd: value.periodEnd,
        shifts: value.shifts.map(shiftFromDraft),
        source,
        ...(value.note.trim() ? { note: value.note.trim() } : {}),
        ...extra,
      };
      const changes =
        preview(editId ? { ...input, replacingId: editId } : input)?.findings.filter(
          (f) => f.key.startsWith("preview:") && f.type === "change",
        ).length ?? 0;
      if (editId) {
        await actions.updateVersion(editId, {
          postedAt: input.postedAt,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          shifts: input.shifts,
          ...(input.note ? { note: input.note } : {}),
        });
      } else {
        await actions.addVersion(input);
      }
      toast.show(changes > 0 ? tp("review.saved", changes) : t("review.savedNone"));
      navigate({ name: "owed" });
    },
    [actions, preview, toast, tp, t, tz],
  );
}

function defaultPeriod(
  baseline: Shift[],
  tz: string,
  latest?: { periodStart: string; periodEnd: string },
) {
  if (latest) return { start: latest.periodStart, end: latest.periodEnd };
  const monday = mondayOf(todayIn(tz));
  return { start: monday, end: addDays(monday, 13) };
}

function draftsFor(baseline: Shift[], start: string, end: string): DraftShift[] {
  return baseline
    .filter((s) => s.start.slice(0, 10) >= start && s.start.slice(0, 10) <= end)
    .map((s) => ({ ...draftFromShift(s), id: newId("s") }));
}

/* ------------------------------------------------------------------------ */

function Chooser() {
  const { t } = useT();
  const { data } = useStore();
  const options = [
    {
      route: { name: "add", mode: "scan" } as Route,
      Icon: Camera,
      tone: "tone-add",
      title: t("add.scan.title"),
      body: t("add.scan.body"),
    },
    {
      route: { name: "add", mode: "type" } as Route,
      Icon: Keyboard,
      tone: "tone-move",
      title: t("add.type.title"),
      body: t("add.type.body"),
    },
  ];
  if (data.versions.length > 0) {
    options.push({
      route: { name: "add", mode: "change" },
      Icon: Zap,
      tone: "tone-cut",
      title: t("add.change.title"),
      body: t("add.change.body"),
    });
  }
  return (
    <Page>
      <div className="page-title">
        <h1>{t("add.title")}</h1>
        <p className="muted">{t("add.lead")}</p>
      </div>
      <div className="stack">
        {options.map(({ route, Icon, tone, title, body }) => (
          <a key={title} className={`big-option ${tone}`} href={href(route)}>
            <span className="art icon">
              <Icon size={26} aria-hidden />
            </span>
            <span className="grow">
              <strong style={{ fontSize: "1.05rem" }}>{title}</strong>
              <span
                className="muted"
                style={{ display: "block", fontSize: "0.9rem", marginTop: 2 }}
              >
                {body}
              </span>
            </span>
            <ChevronRight className="chev" size={20} aria-hidden />
          </a>
        ))}
      </div>
      <p className="footer-note">{t("welcome.privacy")}</p>
    </Page>
  );
}

/* ------------------------------------------------------------------------ */

function ScanFlow() {
  const { t, tp } = useT();
  const toast = useToast();
  const tz = useTz();
  const { data } = useStore();
  const { shifts: baseline } = useCurrentSchedule();
  const save = useSaveVersion();
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [stage, setStage] = useState<"pick" | "reading" | "review">("pick");
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [ocrText, setOcrText] = useState("");
  const [value, setValue] = useState<ReviewValue | null>(null);
  const [screenshotTime, setScreenshotTime] = useState<string | undefined>();
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => void (imageUrl && URL.revokeObjectURL(imageUrl)), [imageUrl]);

  const start = useCallback(
    async (f: File) => {
      setFile(f);
      setImageUrl(URL.createObjectURL(f));
      setStage("reading");
      setProgress(null);
      const shotTime =
        f.lastModified && Math.abs(Date.now() - f.lastModified) < 1000 * 60 * 60 * 24 * 120
          ? nowLocalInput(tz, new Date(f.lastModified))
          : undefined;
      setScreenshotTime(shotTime);
      const fallback = defaultPeriod(baseline, tz);
      try {
        const result = await recognizeSchedule(f, setProgress);
        const parsed = parseScheduleText(result.lines, {
          referenceDate: (shotTime ?? nowLocalInput(tz)).slice(0, 10),
        });
        setOcrText(result.text);
        const drafts: DraftShift[] = parsed.shifts.map((s) => ({
          id: newId("s"),
          date: s.date,
          start: s.start,
          end: s.end,
          ...(s.label ? { label: s.label } : {}),
          ...(s.confidence === "low" ? { low: true } : {}),
        }));
        setValue({
          periodStart: parsed.periodStart ?? fallback.start,
          periodEnd: parsed.periodEnd ?? fallback.end,
          postedLocal: nowLocalInput(tz),
          shifts: drafts,
          note: "",
        });
        toast.show(
          drafts.length > 0 ? tp("add.ocrFound", drafts.length) : t("add.ocrNone"),
          undefined,
          5000,
        );
      } catch (err) {
        console.error(err);
        toast.show(t("add.ocrFailed"), undefined, 6000);
        setValue({
          periodStart: fallback.start,
          periodEnd: fallback.end,
          postedLocal: nowLocalInput(tz),
          shifts: [],
          note: "",
        });
      }
      setStage("review");
    },
    [baseline, t, tp, toast, tz],
  );

  useEffect(() => {
    if (stage !== "pick") return;
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/"));
      if (item) void start(item);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [stage, start]);

  const percent =
    progress?.status === "recognizing text"
      ? Math.round(progress.progress * 100)
      : progress
        ? Math.round(progress.progress * 30)
        : 5;

  return (
    <Page back={{ name: "add" }} title={t("add.scan.title")}>
      {stage === "pick" && (
        <div
          className={`dropzone${over ? " over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = [...e.dataTransfer.files].find((x) => x.type.startsWith("image/"));
            if (f) void start(f);
          }}
        >
          <div className="empty" style={{ padding: 8 }}>
            <div className="art">
              <ImageUp size={34} aria-hidden />
            </div>
            <p>{t("add.drop")}</p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label={t("add.choose")}
            tabIndex={-1}
            data-testid="screenshot-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void start(f);
            }}
          />
          <button className="btn primary" type="button" onClick={() => inputRef.current?.click()}>
            <Camera size={18} aria-hidden /> {t("add.choose")}
          </button>
          <p className="footer-note">{t("add.scan.body")}</p>
        </div>
      )}

      {stage === "reading" && (
        <div className="card stack" aria-busy="true">
          {imageUrl && <img className="preview-img" src={imageUrl} alt="" />}
          <div className="row">
            <Loader2 size={18} className="spin" aria-hidden />
            <strong>{t("add.reading")}</strong>
          </div>
          <div
            className="progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div style={{ width: `${percent}%` }} />
          </div>
          <p className="faint">
            {progress?.status === "recognizing text"
              ? t("add.ocr.recognizing")
              : t("add.ocr.loading")}
          </p>
        </div>
      )}

      {stage === "review" && value && (
        <>
          {imageUrl && (
            <details className="card disclosure">
              <summary>
                {t("version.screenshot")} <ChevronRight className="chev" size={16} aria-hidden />
              </summary>
              <img
                className="preview-img"
                src={imageUrl}
                alt={t("version.screenshot")}
                style={{ marginTop: 10 }}
              />
              <button
                className="btn small"
                type="button"
                style={{ marginTop: 10 }}
                onClick={() => {
                  setStage("pick");
                  setValue(null);
                }}
              >
                {t("add.retake")}
              </button>
            </details>
          )}
          <ReviewForm
            value={value}
            onChange={setValue}
            baseline={baseline}
            {...(screenshotTime ? { screenshotTime } : {})}
            previewInput={{ source: "ocr" }}
            submitLabel={t("review.save")}
            busy={busy}
            onSubmit={async () => {
              setBusy(true);
              try {
                await save(value, "ocr", {
                  ...(file ? { image: file, imageName: file.name } : {}),
                  ...(ocrText ? { ocrText } : {}),
                });
              } finally {
                setBusy(false);
              }
            }}
          />
        </>
      )}
      {data.versions.length === 0 && stage === "pick" && <p className="faint">{t("add.lead")}</p>}
    </Page>
  );
}

/* ------------------------------------------------------------------------ */

function TypeFlow({ versionId }: { versionId?: string }) {
  const { t } = useT();
  const tz = useTz();
  const { data } = useStore();
  const { shifts: baseline } = useCurrentSchedule();
  const save = useSaveVersion();
  const editing = versionId ? data.versions.find((v) => v.id === versionId) : undefined;
  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState<ReviewValue>(() => {
    if (editing) {
      return {
        periodStart: editing.periodStart,
        periodEnd: editing.periodEnd,
        postedLocal: nowLocalInput(tz, new Date(editing.postedAt)),
        shifts: editing.shifts.map(draftFromShift),
        note: editing.note ?? "",
      };
    }
    // Start from the most recent full schedule, not a one-day quick change.
    const latest = [...data.versions]
      .reverse()
      .find((v) => v.periodEnd >= addDays(v.periodStart, 6));
    const p = defaultPeriod(baseline, tz, latest);
    return {
      periodStart: p.start,
      periodEnd: p.end,
      postedLocal: nowLocalInput(tz),
      shifts: draftsFor(baseline, p.start, p.end),
      note: "",
    };
  });

  return (
    <Page
      back={editing ? { name: "version", id: editing.id } : { name: "add" }}
      title={editing ? t("version.title", { n: editing.number }) : t("add.type.title")}
    >
      <ReviewForm
        value={value}
        onChange={setValue}
        baseline={baseline}
        previewInput={{
          source: editing?.source ?? "manual",
          ...(editing ? { replacingId: editing.id } : {}),
        }}
        submitLabel={editing ? t("common.save") : t("review.save")}
        busy={busy}
        onSubmit={async () => {
          setBusy(true);
          try {
            await save(value, editing?.source ?? "manual", {}, editing?.id);
          } finally {
            setBusy(false);
          }
        }}
      />
    </Page>
  );
}

/* ------------------------------------------------------------------------ */

type ChangeKind = "cancel" | "cut" | "extend" | "move" | "add";

function plusHours(hhmm: string, hours: number): string {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  const total = (((h * 60 + m + Math.round(hours * 60)) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function QuickChange({ shiftId }: { shiftId?: string }) {
  const tr = useT();
  const { t, locale } = tr;
  const tz = useTz();
  const { jurisdiction, preview } = useStore();
  const { shifts: baseline } = useCurrentSchedule();
  const save = useSaveVersion();
  const today = todayIn(tz);
  const upcoming = baseline.filter((s) => s.end.slice(0, 10) >= addDays(today, -1));
  const [selected, setSelected] = useState<string | undefined>(shiftId ?? upcoming[0]?.id);
  const shift = baseline.find((s) => s.id === selected);
  const [kind, setKind] = useState<ChangeKind>(shift ? "cut" : "add");
  const [date, setDate] = useState(shift?.start.slice(0, 10) ?? today);
  const [start, setStart] = useState(shift?.start.slice(11, 16) ?? "09:00");
  const [end, setEnd] = useState(shift ? plusHours(shift.end.slice(11, 16), -2) : "17:00");
  const [told, setTold] = useState(nowLocalInput(tz));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const pickKind = (k: ChangeKind) => {
    setKind(k);
    if (!shift) return;
    const s0 = shift.start.slice(11, 16);
    const e0 = shift.end.slice(11, 16);
    setDate(shift.start.slice(0, 10));
    if (k === "cut") {
      setStart(s0);
      setEnd(plusHours(e0, -2));
    } else if (k === "extend") {
      setStart(s0);
      setEnd(plusHours(e0, 2));
    } else if (k === "move") {
      setStart(plusHours(s0, 2));
      setEnd(plusHours(e0, 2));
    } else if (k === "add") {
      setDate(addDays(shift.start.slice(0, 10), 1));
      setStart(s0);
      setEnd(e0);
    }
  };

  const pickShift = (id: string) => {
    setSelected(id);
    const s = baseline.find((x) => x.id === id);
    if (s) {
      setDate(s.start.slice(0, 10));
      setStart(s.start.slice(11, 16));
      setEnd(plusHours(s.end.slice(11, 16), -2));
      setKind("cut");
    }
  };

  const value: ReviewValue | null = useMemo(() => {
    if (kind !== "add" && !shift) return null;
    const oldDate = shift?.start.slice(0, 10);
    const dates = [date, ...(kind !== "add" && oldDate ? [oldDate] : [])].sort();
    const periodStart = dates[0]!;
    const periodEnd = dates[dates.length - 1]!;
    const kept = draftsFor(baseline, periodStart, periodEnd).filter(
      (d) =>
        !(
          kind !== "add" &&
          shift &&
          d.date === oldDate &&
          d.start === shift.start.slice(11, 16) &&
          d.end === shift.end.slice(11, 16)
        ),
    );
    const changed: DraftShift[] =
      kind === "cancel"
        ? []
        : [
            {
              id: newId("s"),
              date,
              start,
              end,
              ...(shift?.label && kind !== "add" ? { label: shift.label } : {}),
            },
          ];
    return { periodStart, periodEnd, postedLocal: told, shifts: [...kept, ...changed], note };
  }, [kind, shift, date, start, end, told, note, baseline]);

  const findings = useMemo(() => {
    if (!value || !value.postedLocal || !start || !end || start === end) return [];
    try {
      const ev = preview({
        postedAt: new Date(localToInstant(value.postedLocal, tz)).toISOString(),
        periodStart: value.periodStart,
        periodEnd: value.periodEnd,
        shifts: value.shifts.map(shiftFromDraft),
        source: "change",
      });
      return ev?.findings.filter((f) => f.key.startsWith("preview:") && f.type === "change") ?? [];
    } catch {
      return [];
    }
  }, [value, preview, tz, start, end]);

  const kinds: { id: ChangeKind; label: string; needsShift: boolean }[] = [
    { id: "cut", label: t("change.kind.cut"), needsShift: true },
    { id: "cancel", label: t("change.kind.cancel"), needsShift: true },
    { id: "extend", label: t("change.kind.extend"), needsShift: true },
    { id: "move", label: t("change.kind.move"), needsShift: true },
    { id: "add", label: t("change.kind.add"), needsShift: false },
  ];

  return (
    <Page back={{ name: "schedule" }} title={t("add.change.title")}>
      {upcoming.length > 0 ? (
        <section className="card stack">
          <label className="field">
            <span>{t("change.pickShift")}</span>
            <select
              value={selected ?? ""}
              onChange={(e) => pickShift(e.target.value)}
              data-testid="change-shift"
            >
              {upcoming.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatDate(s.start.slice(0, 10), locale)} ·{" "}
                  {formatShiftTimes(s.start, s.end, locale)}
                </option>
              ))}
            </select>
          </label>
        </section>
      ) : (
        <p className="notice-box info">{t("change.noShifts")}</p>
      )}

      <section className="stack" role="radiogroup" aria-label={t("change.title")}>
        <h2 className="section-title">{t("change.title")}</h2>
        {kinds
          .filter((k) => !k.needsShift || shift)
          .map((k) => (
            <button
              key={k.id}
              type="button"
              className="choice"
              aria-pressed={kind === k.id}
              onClick={() => pickKind(k.id)}
            >
              <strong>{k.label}</strong>
            </button>
          ))}
      </section>

      {kind !== "cancel" && (
        <section className="card stack">
          <h2>{t("change.newTimes")}</h2>
          {(kind === "add" || kind === "move") && (
            <label className="field">
              <span>{t("change.date")}</span>
              <input
                type="date"
                value={date}
                onChange={(e) => e.target.value && setDate(e.target.value)}
              />
            </label>
          )}
          <div className="editor-shift" style={{ gridTemplateColumns: "1fr auto 1fr" }}>
            <input
              type="time"
              aria-label={t("review.start")}
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
            <span className="to">{t("review.to.word")}</span>
            <input
              type="time"
              aria-label={t("review.end")}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              data-testid="change-end"
            />
          </div>
        </section>
      )}

      <section className="card stack">
        <label className="field">
          <span>{t("change.when")}</span>
          <input type="datetime-local" value={told} onChange={(e) => setTold(e.target.value)} />
          <span className="hint">{t("review.postedHint")}</span>
        </label>
        <label className="field">
          <span>{t("review.note")}</span>
          <input
            type="text"
            value={note}
            placeholder={t("review.notePlaceholder")}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
          />
        </label>
      </section>

      {findings.length > 0 && jurisdiction && (
        <section className="stack" aria-live="polite">
          <h2 className="section-title">{t("review.preview")}</h2>
          {findings.map((f) => (
            <FindingCard key={f.key} finding={f} jurisdiction={jurisdiction} linked={false} />
          ))}
        </section>
      )}

      <button
        className="btn primary block"
        type="button"
        disabled={
          busy || !value || (kind !== "cancel" && (!start || !end || start === end)) || !told
        }
        data-testid="save-change"
        onClick={async () => {
          if (!value) return;
          setBusy(true);
          try {
            await save(value, "change");
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("change.save")}
      </button>
    </Page>
  );
}

/* ------------------------------------------------------------------------ */

export function Add({ route }: { route: Extract<Route, { name: "add" }> }) {
  switch (route.mode) {
    case "scan":
      return <ScanFlow />;
    case "type":
      return (
        <TypeFlow
          {...(route.versionId ? { versionId: route.versionId } : {})}
          key={route.versionId ?? "new"}
        />
      );
    case "change":
      return (
        <QuickChange
          {...(route.shiftId ? { shiftId: route.shiftId } : {})}
          key={route.shiftId ?? "pick"}
        />
      );
    default:
      return <Chooser />;
  }
}
