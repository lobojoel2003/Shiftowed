import type { Finding } from "@shiftowed/rules";
import { CalendarPlus, ChevronLeft, ChevronRight, FileDown, Info, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { FindingCard } from "../components/FindingCard";
import { Page } from "../components/Layout";
import { useToast } from "../components/Toast";
import { useT } from "../i18n";
import { formatDate, formatMoney } from "../lib/format";
import { periodContaining, shiftPeriod, todayIn, type Period } from "../lib/payPeriod";
import { href, navigate } from "../lib/router";
import { useStore } from "../lib/store";

export function periodLabel(p: Period, locale: "en" | "es"): string {
  const sameYear = p.start.slice(0, 4) === p.end.slice(0, 4);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${formatDate(p.start, locale, opts)} – ${formatDate(p.end, locale, sameYear ? opts : { ...opts, year: "numeric" })}`;
}

function inPeriod(f: Finding, p: Period): boolean {
  return f.shiftDate >= p.start && f.shiftDate <= p.end;
}

export function Owed() {
  const tr = useT();
  const { t, tp, locale } = tr;
  const { data, jurisdiction, evaluation, evaluationError, actions } = useStore();
  const toast = useToast();
  const profile = data.profile!;
  const today = todayIn(jurisdiction?.timeZone ?? "America/New_York");
  const current = periodContaining(today, profile.payPeriod);
  const [offset, setOffset] = useState(0);
  const period = offset === 0 ? current : shiftPeriod(current, offset, profile.payPeriod);

  const findings = useMemo(
    () => (evaluation?.findings ?? []).filter((f) => inPeriod(f, period)),
    [evaluation, period],
  );
  const total = findings.reduce((s, f) => s + f.cents, 0);
  const changes = findings.filter(
    (f) => f.type === "change" && (f.status === "owed" || f.status === "needs-rate"),
  ).length;
  const rests = findings.filter((f) => f.type === "rest" && f.status !== "excepted").length;
  const violations = findings.filter((f) => f.status === "violation").length;
  const needsRate = findings.filter((f) => f.status === "needs-rate").length;

  if (!jurisdiction) return null;

  const clearDemo = async () => {
    await actions.clearAll();
    navigate({ name: "welcome" }, { replace: true });
  };

  return (
    <Page>
      {profile.demo && (
        <div className="notice-box info" role="note">
          <Sparkles size={18} aria-hidden />
          <div className="grow">
            {t("owed.demoBanner")}{" "}
            <button
              className="btn ghost small"
              type="button"
              onClick={clearDemo}
              style={{ padding: 0, minHeight: 0 }}
            >
              {t("owed.clearDemo")}
            </button>
          </div>
        </div>
      )}

      <section className="hero" aria-labelledby="owed-label">
        <div className="label" id="owed-label">
          {t("owed.label")}
        </div>
        <div className="amount money" aria-live="polite" data-testid="period-total">
          {formatMoney(total, locale)}
        </div>
        <div className="period">
          <button
            type="button"
            onClick={() => setOffset(offset - 1)}
            aria-label={t("owed.prevPeriod")}
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
          <div className="period-label">{periodLabel(period, locale)}</div>
          <button
            type="button"
            onClick={() => setOffset(offset + 1)}
            aria-label={t("owed.nextPeriod")}
            disabled={offset >= 1}
          >
            <ChevronRight size={18} aria-hidden />
          </button>
        </div>
        {(changes > 0 || rests > 0 || violations > 0) && (
          <div className="chips">
            {changes > 0 && <span>{tp("owed.chip.changes", changes)}</span>}
            {rests > 0 && <span>{tp("owed.chip.rest", rests)}</span>}
            {violations > 0 && <span>{tp("owed.chip.violations", violations)}</span>}
          </div>
        )}
        {evaluation && evaluation.totalCents !== total && (
          <div className="alltime">
            {t("owed.allTime", { amount: formatMoney(evaluation.totalCents, locale) })}
          </div>
        )}
      </section>

      {evaluationError && (
        <div className="notice-box danger" role="alert">
          <Info size={18} aria-hidden />
          <span>{t("error.eval", { message: evaluationError })}</span>
        </div>
      )}

      {needsRate > 0 && (
        <div className="notice-box" role="note">
          <Info size={18} aria-hidden />
          <span className="grow">{tp("owed.needsRate", needsRate)}</span>
          <a className="btn small" href={href({ name: "settings" })}>
            {t("owed.addRate")}
          </a>
        </div>
      )}

      <div className="actions">
        <a className="btn primary" href={href({ name: "add" })}>
          <CalendarPlus size={18} aria-hidden />
          {t("owed.addSchedule")}
        </a>
        <button
          className="btn"
          type="button"
          onClick={() =>
            data.versions.length ? navigate({ name: "export" }) : toast.show(t("export.empty"))
          }
        >
          <FileDown size={18} aria-hidden />
          {t("owed.export")}
        </button>
      </div>

      {data.versions.length === 0 ? (
        <div className="card empty">
          <div className="art">
            <CalendarPlus size={34} aria-hidden />
          </div>
          <h2>{t("owed.empty.title")}</h2>
          <p>{t("owed.empty.body")}</p>
        </div>
      ) : findings.length === 0 ? (
        <div className="card empty">
          <h2>{t("owed.emptyPeriod.title")}</h2>
          <p>{t("owed.emptyPeriod.body")}</p>
        </div>
      ) : (
        <>
          <h2 className="section-title">{t("owed.whatHappened")}</h2>
          <div className="stack" data-testid="findings">
            {findings.map((f) => (
              <FindingCard key={f.key} finding={f} jurisdiction={jurisdiction} />
            ))}
          </div>
        </>
      )}

      <p className="footer-note">{t("common.notLegalAdvice")}</p>
    </Page>
  );
}
