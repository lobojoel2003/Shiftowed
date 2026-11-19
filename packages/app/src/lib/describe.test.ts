import { evaluate, getJurisdiction, JURISDICTIONS } from "@shiftowed/rules";
import { describe, expect, it } from "vitest";
import { translate, translatePlural, type Translator } from "../i18n";
import type { Locale } from "./types";
import {
  applicableExceptions,
  describeAmount,
  describeKinds,
  describeWindow,
  findingTitle,
  findingTone,
  hoursLabel,
  noticeText,
} from "./describe";
import {
  formatDate,
  formatHours,
  formatMoney,
  formatShiftTimes,
  intlLocale,
  noticeParts,
  nowLocalInput,
} from "./format";

const tr = (locale: Locale): Translator => ({
  locale,
  t: (k, v) => translate(locale, k, v),
  tp: (k, n, v) => translatePlural(locale, k, n, v),
});
const en = tr("en");
const es = tr("es");

describe("format", () => {
  it("formats money, dates and times per locale", () => {
    expect(formatMoney(25000, "en")).toBe("$250.00");
    expect(formatMoney(1850, "es")).toMatch(/18[.,]50/);
    expect(formatDate("2026-11-19", "en")).toBe("Thu, Nov 19");
    expect(formatShiftTimes("2026-11-19T09:00", "2026-11-19T17:30", "en").replace(/\s/g, " ")).toBe(
      "9:00 AM – 5:30 PM",
    );
    expect(formatHours(7.5, "en")).toBe("7.5 h");
    expect(intlLocale("es")).toBe("es-US");
    expect(noticeParts(50)).toEqual({ days: 2, hours: 2, negative: false });
    expect(nowLocalInput("America/New_York", new Date("2026-11-19T14:05:00Z"))).toBe(
      "2026-11-19T09:05",
    );
  });
});

describe("describe", () => {
  it("writes notice in words, in both languages", () => {
    expect(noticeText(50, en)).toBe("2 days, 2 hours");
    expect(noticeText(48, en)).toBe("2 days");
    expect(noticeText(5, en)).toBe("5 hours");
    expect(noticeText(0.2, en)).toBe("under an hour");
    expect(noticeText(-3, en)).toBe("after the shift started");
    expect(noticeText(25, es)).toBe("1 día y 1 hora");
    expect(hoursLabel(336, en)).toBe("14 days");
    expect(hoursLabel(72, en)).toBe("72 hours");
    expect(hoursLabel(312, en)).toBe("13 days");
    expect(hoursLabel(30, en)).toBe("30 hours");
  });

  it("describes every rule in every jurisdiction without placeholders", () => {
    for (const j of JURISDICTIONS) {
      for (const t of [en, es]) {
        for (const r of j.premiums) {
          const text = `${describeAmount(r.amount, t)} ${describeWindow(r.notice, t, r.minChangeMinutes)} ${describeKinds(r, t)}`;
          expect(text, j.id).not.toMatch(/[{}]/);
        }
        for (const r of j.rest ?? []) {
          expect(
            describeAmount(r.amount, t, { secondShift: r.premiumHours === "secondShift" }),
          ).not.toMatch(/[{}]/);
        }
      }
    }
  });

  it("names, colors and lists exceptions for findings", () => {
    const j = getJurisdiction("us-wa-seattle")!;
    const r = evaluate(
      j,
      [
        {
          id: "v1",
          postedAt: "2026-11-01T17:00:00Z",
          periodStart: "2026-11-16",
          periodEnd: "2026-11-17",
          shifts: [
            { id: "a", start: "2026-11-16T15:00", end: "2026-11-16T23:00" },
            { id: "b", start: "2026-11-17T06:00", end: "2026-11-17T12:00" },
          ],
        },
        {
          id: "v2",
          postedAt: "2026-11-15T17:00:00Z",
          periodStart: "2026-11-16",
          periodEnd: "2026-11-16",
          shifts: [],
        },
      ],
      { hourlyRate: 20 },
    );
    const cancel = r.findings.find((f) => f.type === "change")!;
    expect(findingTitle(cancel, en)).toBe("Shift cancelled");
    expect(findingTitle(cancel, es)).toBe("Turno cancelado");
    expect(findingTone(cancel)).toBe("cut");
    expect(applicableExceptions(cancel, j).map((e) => e.id)).toContain("employee-requested");
    expect(applicableExceptions(cancel, j).map((e) => e.id)).not.toContain("mass-communication");
    expect(describeWindow({ maxHours: 24 }, en)).toBe("less than 24 hours");
    expect(describeWindow({ minHours: 168, maxHours: 336 }, en)).toBe("7 days to under 14 days");
    expect(describeWindow({ minHours: 24 }, en, 16)).toBe("24 hours or more · changes over 15 min");
    expect(describeWindow({}, en)).toBe("after the deadline");
  });
});
