import type { Finding, Jurisdiction } from "@shiftowed/rules";

function cell(v: string | number | undefined | null): string {
  const s = v === undefined || v === null ? "" : String(v);
  // Neutralise spreadsheet formulas and quote when needed.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const CSV_COLUMNS = [
  "shift_date",
  "type",
  "change",
  "before_start",
  "before_end",
  "after_start",
  "after_end",
  "employer_notified_at",
  "notice_hours",
  "notice_measured_to",
  "status",
  "amount_usd",
  "rule",
  "formula",
  "citation",
  "citation_url",
  "exception",
  "jurisdiction",
] as const;

export function findingsToCsv(findings: readonly Finding[], j: Jurisdiction): string {
  const rows: string[][] = [];
  for (const f of findings) {
    const base = {
      shift_date: f.shiftDate,
      type: f.type,
      change: f.change?.kind ?? (f.type === "rest" ? "short-rest" : "late-posting"),
      before_start: f.change?.before?.start ?? f.rest?.first.start ?? "",
      before_end: f.change?.before?.end ?? f.rest?.first.end ?? "",
      after_start: f.change?.after?.start ?? f.rest?.second.start ?? "",
      after_end: f.change?.after?.end ?? f.rest?.second.end ?? "",
      employer_notified_at: f.change?.postedAt ?? "",
      notice_hours: f.notice?.hours ?? f.latePosting?.noticeHours ?? "",
      notice_measured_to: f.notice
        ? f.notice.to === "schedule"
          ? "schedule-start"
          : "shift-start"
        : "",
      status: f.status,
      exception: f.exception?.label ?? "",
      jurisdiction: j.id,
    };
    const lines = f.lines.length
      ? f.lines
      : [
          {
            label: f.violation?.label ?? "",
            cents: 0,
            formula: "",
            citation: f.citation ?? { code: "", url: "" },
          },
        ];
    for (const line of lines) {
      const row: Record<(typeof CSV_COLUMNS)[number], string | number> = {
        ...base,
        amount_usd:
          f.status === "owed" && line.cents !== null ? (line.cents / 100).toFixed(2) : "0.00",
        rule: line.label,
        formula: line.formula,
        citation: line.citation.code,
        citation_url: line.citation.url,
      };
      rows.push(CSV_COLUMNS.map((c) => cell(row[c])));
    }
  }
  return [CSV_COLUMNS.join(","), ...rows.map((r) => r.join(","))].join("\r\n") + "\r\n";
}
