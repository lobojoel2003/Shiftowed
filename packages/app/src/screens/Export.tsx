import { FileJson, FileSpreadsheet, FileText, Share2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Page } from "../components/Layout";
import { useToast } from "../components/Toast";
import { useT } from "../i18n";
import { createBackup } from "../lib/backup";
import { findingsToCsv } from "../lib/exportCsv";
import { downloadBlob, fileStamp, shareFile } from "../lib/files";
import { formatMoney } from "../lib/format";
import { periodContaining, todayIn } from "../lib/payPeriod";
import { useStore } from "../lib/store";
import { periodLabel } from "./Owed";

export function Export() {
  const tr = useT();
  const { t, tp, locale } = tr;
  const { data, jurisdiction, evaluation } = useStore();
  const toast = useToast();
  const [scope, setScope] = useState<"period" | "all">("period");
  const [screenshots, setScreenshots] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const tz = jurisdiction?.timeZone ?? "America/New_York";
  const period = data.profile ? periodContaining(todayIn(tz), data.profile.payPeriod) : undefined;
  const range = scope === "period" ? period : undefined;
  const findings = useMemo(
    () =>
      (evaluation?.findings ?? []).filter(
        (f) => !range || (f.shiftDate >= range.start && f.shiftDate <= range.end),
      ),
    [evaluation, range],
  );
  const total = findings.reduce((s, f) => s + f.cents, 0);
  const hasImages = data.versions.some((v) => v.imageId);

  if (!jurisdiction || !evaluation) return null;
  const stamp = fileStamp(tz);
  const base = `shiftowed-evidence-${jurisdiction.id}-${stamp}`;

  const run = async (kind: string, fn: () => Promise<void>) => {
    setBusy(kind);
    try {
      await fn();
    } catch (err) {
      toast.show(t("export.failed", { message: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(null);
    }
  };

  const pdf = async () => {
    const { buildEvidencePdf } = await import("../lib/exportPdf");
    return buildEvidencePdf({
      data,
      jurisdiction,
      evaluation,
      ...(range ? { range } : {}),
      includeScreenshots: screenshots && hasImages,
    });
  };

  const canShare = typeof navigator.canShare === "function";

  return (
    <Page back={{ name: "owed" }} title={t("export.title")}>
      <p className="muted">{t("export.lead")}</p>

      <section className="card stack">
        <h2>{t("export.range")}</h2>
        <div className="segmented" role="group" aria-label={t("export.range")}>
          <button
            type="button"
            aria-pressed={scope === "period"}
            onClick={() => setScope("period")}
          >
            {period ? t("export.range.period", { period: periodLabel(period, locale) }) : ""}
          </button>
          <button type="button" aria-pressed={scope === "all"} onClick={() => setScope("all")}>
            {t("export.range.all")}
          </button>
        </div>
        {hasImages && (
          <label className="row">
            <input
              type="checkbox"
              checked={screenshots}
              onChange={(e) => setScreenshots(e.target.checked)}
              style={{ width: 20, minHeight: 20, height: 20, accentColor: "var(--brand)" }}
            />
            {t("export.screenshots")}
          </label>
        )}
        <p className="faint" data-testid="export-summary">
          {tp("export.summary", findings.length, { amount: formatMoney(total, locale) })}
        </p>
      </section>

      <div className="stack">
        <button
          className="btn primary block"
          type="button"
          disabled={busy !== null}
          data-testid="export-pdf"
          onClick={() =>
            run("pdf", async () => {
              downloadBlob(await pdf(), `${base}.pdf`);
              toast.show(t("export.done"));
            })
          }
        >
          <FileText size={18} aria-hidden />{" "}
          {busy === "pdf" ? t("common.loading") : t("export.pdf")}
        </button>
        {canShare && (
          <button
            className="btn block"
            type="button"
            disabled={busy !== null}
            onClick={() =>
              run("share", async () => {
                const blob = await pdf();
                if (!(await shareFile(blob, `${base}.pdf`, t("export.title"))))
                  downloadBlob(blob, `${base}.pdf`);
              })
            }
          >
            <Share2 size={18} aria-hidden /> {t("export.share")}
          </button>
        )}
        <div className="actions">
          <button
            className="btn"
            type="button"
            disabled={busy !== null}
            data-testid="export-csv"
            onClick={() =>
              run("csv", async () => {
                const csv = findingsToCsv(findings, jurisdiction);
                downloadBlob(
                  new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }),
                  `${base}.csv`,
                );
                toast.show(t("export.done"));
              })
            }
          >
            <FileSpreadsheet size={18} aria-hidden /> {t("export.csv")}
          </button>
          <button
            className="btn"
            type="button"
            disabled={busy !== null}
            onClick={() =>
              run("json", async () => {
                const backup = await createBackup(data, true);
                downloadBlob(
                  new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
                  `shiftowed-backup-${stamp}.json`,
                );
                toast.show(t("export.done"));
              })
            }
          >
            <FileJson size={18} aria-hidden /> {t("export.json")}
          </button>
        </div>
      </div>
      <p className="footer-note">{t("common.notLegalAdvice")}</p>
    </Page>
  );
}
