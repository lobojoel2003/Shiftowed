/**
 * The evidence log: a dated PDF a worker can bring to a labor agency or worker
 * center. It lists every finding with its citation, every schedule version with
 * its SHA-256 fingerprint, and the app's audit trail. Built on the device with
 * jsPDF, which is only loaded when the worker exports.
 */
import type { Evaluation, Finding, Jurisdiction } from "@shiftowed/rules";
import { BUILD } from "./buildInfo";
import { getImage } from "./db";
import type { AppData, StoredVersion } from "./types";

export interface PdfOptions {
  data: AppData;
  jurisdiction: Jurisdiction;
  evaluation: Evaluation;
  /** Inclusive date range, or undefined for everything. */
  range?: { start: string; end: string };
  includeScreenshots: boolean;
  now?: Date;
}

const PAGE_W = 612;
const PAGE_H = 792;
const M = 48;
const W = PAGE_W - M * 2;
const BRAND: [number, number, number] = [11, 110, 91];
const INK: [number, number, number] = [20, 33, 29];
const MUTED: [number, number, number] = [96, 112, 106];
const RULE: [number, number, number] = [214, 224, 220];

/** Standard PDF fonts only cover WinAnsi; map everything else to safe text. */
export function pdfText(s: string): string {
  return (
    s
      .replace(/[\u00a0\u2000-\u200b\u202f\u205f]/g, " ")
      .replace(/[\u2010-\u2015\u2212]/g, "-")
      .replace(/\u2192/g, "->")
      .replace(/\u2026/g, "...")
      // Tabs and newlines pass through; anything outside WinAnsi becomes "?".
      .replace(/[^\t\n\r\u0020-\u007e\u00a1-\u00ff\u2018\u2019\u201c\u201d\u2022\u20ac]/g, "?")
  );
}

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function inTz(iso: string, timeZone: string): string {
  return pdfText(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(iso)),
  );
}

function day(date: string): string {
  return pdfText(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${date}T00:00:00Z`)),
  );
}

function clock(local: string): string {
  const [h, m] = local.slice(11, 16).split(":").map(Number) as [number, number];
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function shiftText(s: { start: string; end: string }): string {
  return `${day(s.start.slice(0, 10))}, ${clock(s.start)} - ${clock(s.end)}`;
}

function notice(hours: number): string {
  const abs = Math.abs(hours);
  const d = Math.floor(abs / 24);
  const h = Math.round(abs - d * 24);
  const text = d > 0 ? `${d}d ${h}h` : `${Math.round(abs * 10) / 10}h`;
  return hours < 0 ? `-${text}` : text;
}

const KIND: Record<string, string> = {
  add: "Shift added",
  extend: "Hours added",
  move: "Shift moved",
  reduce: "Hours cut",
  cancel: "Shift cancelled",
};

function describe(f: Finding): { title: string; detail: string } {
  if (f.type === "rest" && f.rest) {
    return {
      title: `Short rest (${Math.round(f.rest.gapHours * 100) / 100} h between shifts)`,
      detail: `${shiftText(f.rest.first)} -> ${shiftText(f.rest.second)}`,
    };
  }
  if (f.type === "late-posting" && f.latePosting) {
    return {
      title: "Schedule posted late",
      detail: `Posted ${notice(f.latePosting.noticeHours)} before ${day(f.latePosting.firstNewDate)} (${Math.round(f.latePosting.requiredHours / 24)} days required)`,
    };
  }
  const c = f.change!;
  const before = c.before ? shiftText(c.before) : "";
  const after = c.after ? shiftText(c.after) : "";
  return {
    title: KIND[c.kind] ?? c.kind,
    detail:
      c.before && c.after
        ? `${before} -> ${after}`
        : c.before
          ? `Removed: ${before}`
          : `Added: ${after}`,
  };
}

function statusText(f: Finding): string {
  switch (f.status) {
    case "owed":
      return money(f.cents);
    case "needs-rate":
      return "Rate needed";
    case "excepted":
      return "Exception";
    case "no-premium":
      return "$0.00";
    case "violation":
      return "Violation";
  }
}

async function imageDataUrl(blob: Blob): Promise<{ url: string; w: number; h: number } | null> {
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return { url: canvas.toDataURL("image/jpeg", 0.85), w: canvas.width, h: canvas.height };
  } catch {
    return null;
  }
}

export async function buildEvidencePdf(opts: PdfOptions): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const { data, jurisdiction: j, evaluation, range, includeScreenshots } = opts;
  const now = opts.now ?? new Date();
  const tz = j.timeZone;
  const profile = data.profile;
  const findings = evaluation.findings.filter(
    (f) => !range || (f.shiftDate >= range.start && f.shiftDate <= range.end),
  );
  const total = findings.reduce((s, f) => s + f.cents, 0);
  const versions: StoredVersion[] = range
    ? data.versions.filter((v) => v.periodEnd >= range.start && v.periodStart <= range.end)
    : data.versions;

  const doc = new jsPDF({ unit: "pt", format: "letter", compress: true });
  doc.setProperties({
    title: "Shiftowed evidence log",
    subject: `${j.name}: schedule changes and predictability pay`,
    creator: `Shiftowed ${BUILD.version} (build ${BUILD.build})`,
    keywords: "fair workweek, predictability pay, evidence",
  });
  let y = M;

  const color = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
  const font = (style: "normal" | "bold", size: number) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
  };
  const ensure = (h: number) => {
    if (y + h > PAGE_H - M - 18) {
      doc.addPage();
      y = M;
    }
  };
  const lines = (text: string, width: number): string[] =>
    doc.splitTextToSize(pdfText(text), width) as string[];
  const para = (
    text: string,
    size = 10,
    style: "normal" | "bold" = "normal",
    c = INK,
    width = W,
  ) => {
    font(style, size);
    color(c);
    const ls = lines(text, width);
    ensure(ls.length * size * 1.3);
    doc.text(ls, M, y + size);
    y += ls.length * size * 1.3;
  };
  const heading = (text: string) => {
    ensure(40);
    y += 14;
    font("bold", 13);
    color(BRAND);
    doc.text(pdfText(text), M, y + 13);
    y += 20;
    doc.setDrawColor(...RULE);
    doc.line(M, y, M + W, y);
    y += 8;
  };

  // Header band
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, PAGE_W, 86, "F");
  font("bold", 22);
  doc.setTextColor(255, 255, 255);
  doc.text("Shiftowed evidence log", M, 44);
  font("normal", 11);
  doc.text(pdfText(`${j.name}: ${j.law}`), M, 64);
  y = 106;

  // Details
  const meta: [string, string][] = [
    ["Worker", profile?.workerName || "(not provided)"],
    ["Employer", profile?.employer || "(not provided)"],
    ["Location", profile?.workplace || "(not provided)"],
    [
      "Hourly rate used",
      profile?.hourlyRate ? `$${profile.hourlyRate.toFixed(2)}` : "(not provided)",
    ],
    [
      "Period covered",
      range ? `${day(range.start)} to ${day(range.end)}` : "All recorded schedules",
    ],
    ["Generated", `${inTz(now.toISOString(), tz)} (${now.toISOString()})`],
    ["Rules", `${j.id}, last checked ${j.lastVerified}`],
    ["App", `Shiftowed v${BUILD.version}, build ${BUILD.build}, commit ${BUILD.commit}`],
  ];
  for (const [k, v] of meta) {
    font("bold", 9.5);
    color(MUTED);
    doc.text(pdfText(k), M, y + 10);
    font("normal", 9.5);
    color(INK);
    const ls = lines(v, W - 120);
    doc.text(ls, M + 120, y + 10);
    y += Math.max(1, ls.length) * 13;
  }

  // Summary box
  y += 10;
  ensure(70);
  doc.setFillColor(236, 247, 243);
  doc.setDrawColor(...RULE);
  doc.roundedRect(M, y, W, 62, 8, 8, "FD");
  font("normal", 10);
  color(MUTED);
  doc.text("Total predictability pay calculated", M + 16, y + 22);
  font("bold", 24);
  color(BRAND);
  doc.text(money(total), M + 16, y + 50);
  const counts = {
    owed: findings.filter((f) => f.status === "owed").length,
    violation: findings.filter((f) => f.status === "violation").length,
    excepted: findings.filter((f) => f.status === "excepted").length,
    none: findings.filter((f) => f.status === "no-premium").length,
  };
  font("normal", 9.5);
  color(INK);
  const summary = [
    `${counts.owed} premium${counts.owed === 1 ? "" : "s"} owed`,
    `${counts.violation} violation${counts.violation === 1 ? "" : "s"} without automatic pay`,
    `${counts.excepted} marked as an exception`,
    `${counts.none} change${counts.none === 1 ? "" : "s"} with enough notice`,
  ];
  summary.forEach((s, i) => doc.text(s, M + W / 2, y + 18 + i * 12.5));
  y += 74;

  para(
    `Notice is measured from when the employer communicated each schedule version, in ${tz}, to the start of the ` +
      `affected shift, or, where marked *, to 12:00 a.m. on the first day of the work schedule, as the cited rule ` +
      `requires. A negative figure means the change came after that point. ${j.name} requires schedules ` +
      `${j.advanceNotice.label} in advance (${j.advanceNotice.citation.code}).`,
    9,
    "normal",
    MUTED,
  );

  // Findings table
  heading("Findings");
  const cols = [
    { label: "Shift date", w: 74 },
    { label: "What happened", w: 214 },
    { label: "Notice given", w: 70 },
    { label: "Owed", w: 62 },
    { label: "Citation", w: W - 74 - 214 - 70 - 62 },
  ];
  const tableHead = () => {
    font("bold", 8.5);
    color(MUTED);
    let x = M;
    for (const c of cols) {
      doc.text(c.label.toUpperCase(), x, y + 9);
      x += c.w;
    }
    y += 16;
  };
  tableHead();
  if (findings.length === 0)
    para("No schedule changes were found for this period.", 10, "normal", MUTED);
  for (const f of findings) {
    const d = describe(f);
    const detailLines = [
      ...lines(d.title, cols[1]!.w - 8).map((t) => ({ t, bold: true })),
      ...lines(d.detail, cols[1]!.w - 8).map((t) => ({ t, bold: false })),
      ...f.lines
        .flatMap((l) => lines(`${l.label}: ${l.formula}`, cols[1]!.w - 8))
        .map((t) => ({ t, bold: false })),
      ...(f.change
        ? lines(`Employer notified: ${inTz(f.change.postedAt, tz)}`, cols[1]!.w - 8).map((t) => ({
            t,
            bold: false,
          }))
        : []),
      ...(f.exception
        ? lines(`Exception claimed: ${f.exception.label}`, cols[1]!.w - 8).map((t) => ({
            t,
            bold: false,
          }))
        : []),
      ...(f.violation
        ? lines(f.violation.label, cols[1]!.w - 8).map((t) => ({ t, bold: false }))
        : []),
    ];
    const cites = (
      f.lines.length ? f.lines.map((l) => l.citation.code) : f.citation ? [f.citation.code] : []
    ).flatMap((c) => lines(c, cols[4]!.w - 4));
    const rowH = Math.max(detailLines.length, cites.length, 1) * 11 + 10;
    if (y + rowH > PAGE_H - M - 18) {
      doc.addPage();
      y = M;
      tableHead();
    }
    doc.setDrawColor(...RULE);
    doc.line(M, y, M + W, y);
    let x = M;
    font("normal", 8.5);
    color(INK);
    doc.text(day(f.shiftDate), x, y + 12);
    x += cols[0]!.w;
    detailLines.forEach((l, i) => {
      font(l.bold ? "bold" : "normal", 8.5);
      color(l.bold ? INK : MUTED);
      doc.text(l.t, x, y + 12 + i * 11);
    });
    x += cols[1]!.w;
    font("normal", 8.5);
    color(INK);
    doc.text(
      f.change
        ? notice(f.notice?.hours ?? f.change.noticeHours) + (f.notice?.to === "schedule" ? "*" : "")
        : f.latePosting
          ? notice(f.latePosting.noticeHours)
          : "-",
      x,
      y + 12,
    );
    x += cols[2]!.w;
    font("bold", 9);
    color(f.status === "owed" ? BRAND : MUTED);
    doc.text(statusText(f), x, y + 12);
    x += cols[3]!.w;
    font("normal", 8);
    color(MUTED);
    cites.forEach((c, i) => doc.text(c, x, y + 12 + i * 11));
    y += rowH;
  }
  doc.setDrawColor(...RULE);
  doc.line(M, y, M + W, y);
  y += 6;

  // Citations with links
  const cited = new Map<string, string>();
  for (const f of findings) {
    for (const l of f.lines) cited.set(l.citation.code, l.citation.url);
    if (f.citation) cited.set(f.citation.code, f.citation.url);
  }
  if (cited.size > 0) {
    heading("Sources cited");
    for (const [code, url] of cited) {
      ensure(24);
      font("bold", 9);
      color(INK);
      doc.text(pdfText(code), M, y + 10);
      font("normal", 8.5);
      color(BRAND);
      const ls = lines(url, W - 10);
      doc.textWithLink(ls[0] ?? url, M, y + 22, { url });
      y += 28;
    }
  }

  // Versions
  heading("Schedule versions (as received)");
  para(
    "Each version is fingerprinted with SHA-256 over its content and the previous fingerprint, so any later change to an earlier version breaks the chain.",
    9,
    "normal",
    MUTED,
  );
  y += 4;
  for (const v of versions) {
    const shiftLines = [...v.shifts]
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((s) => `${shiftText(s)}${s.label ? ` (${s.label})` : ""}`);
    const body = [
      `Employer posted/sent: ${inTz(v.postedAt, tz)}`,
      `Saved in Shiftowed: ${inTz(v.capturedAt, tz)}${v.editedAt ? `; edited ${inTz(v.editedAt, tz)}` : ""}`,
      `Covers: ${day(v.periodStart)} to ${day(v.periodEnd)}; source: ${v.source}${v.note ? `; note: ${v.note}` : ""}`,
      `SHA-256: ${v.hash}`,
      ...(v.imageHash ? [`Screenshot SHA-256: ${v.imageHash}`] : []),
      ...(shiftLines.length ? shiftLines.map((s) => `  - ${s}`) : ["  - No shifts (all days off)"]),
    ].flatMap((t) => lines(t, W - 12));
    ensure(18 + body.length * 11.5);
    font("bold", 10.5);
    color(INK);
    doc.text(`Version #${v.number}`, M, y + 11);
    y += 16;
    font("normal", 8.5);
    color(MUTED);
    body.forEach((t, i) => doc.text(t, M + 8, y + 9 + i * 11.5));
    y += body.length * 11.5 + 8;
  }

  // Audit log
  if (data.audit.length > 0) {
    heading("Activity log");
    for (const e of data.audit) {
      const ls = lines(`${inTz(e.at, tz)}  ${e.action}  ${e.detail}`, W);
      ensure(ls.length * 11);
      font("normal", 8);
      color(MUTED);
      doc.text(ls, M, y + 9);
      y += ls.length * 11;
    }
  }

  // Screenshots
  if (includeScreenshots) {
    for (const v of versions) {
      if (!v.imageId) continue;
      const img = await getImage(v.imageId);
      const prepared = img ? await imageDataUrl(img.blob) : null;
      if (!prepared) continue;
      doc.addPage();
      y = M;
      font("bold", 12);
      color(BRAND);
      doc.text(`Screenshot for version #${v.number}`, M, y + 12);
      font("normal", 8.5);
      color(MUTED);
      doc.text(
        pdfText(
          `Posted ${inTz(v.postedAt, tz)}. SHA-256 of original file: ${v.imageHash ?? "n/a"}`,
        ),
        M,
        y + 28,
        {
          maxWidth: W,
        },
      );
      const maxH = PAGE_H - M * 2 - 60;
      const scale = Math.min(W / prepared.w, maxH / prepared.h);
      doc.addImage(prepared.url, "JPEG", M, y + 48, prepared.w * scale, prepared.h * scale);
    }
  }

  // Footers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    font("normal", 7.5);
    color(MUTED);
    doc.text(
      pdfText(
        `Shiftowed v${BUILD.version} (build ${BUILD.build}). A calculator, not legal advice. Verify with the cited law.`,
      ),
      M,
      PAGE_H - 26,
    );
    doc.text(`Page ${i} of ${pages}`, PAGE_W - M, PAGE_H - 26, { align: "right" });
  }

  return doc.output("blob");
}
