import { JURISDICTIONS } from "@shiftowed/rules";
import { BadgeCheck, Camera, FileClock, Lock } from "lucide-react";
import { useState } from "react";
import { JurisdictionPicker, parseRate, PayPeriodFields, RateField } from "../components/Fields";
import { useToast } from "../components/Toast";
import { useT } from "../i18n";
import { loadDemo } from "../lib/demo";
import { mondayOf, todayIn } from "../lib/payPeriod";
import { navigate } from "../lib/router";
import { useStore } from "../lib/store";
import type { PayPeriodConfig } from "../lib/types";

const logo = `${import.meta.env.BASE_URL}favicon.svg`;

export function Welcome() {
  const { t } = useT();
  const { actions, data } = useStore();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [jurisdictionId, setJurisdictionId] = useState(data.profile?.jurisdictionId ?? "");
  const [rate, setRate] = useState(data.profile?.hourlyRate?.toString() ?? "");
  const tz = JURISDICTIONS.find((j) => j.id === jurisdictionId)?.timeZone ?? "America/New_York";
  const [period, setPeriod] = useState<PayPeriodConfig>(
    data.profile?.payPeriod ?? { kind: "biweekly", anchor: mondayOf(todayIn(tz)) },
  );
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    setBusy(true);
    try {
      const hourlyRate = parseRate(rate);
      await actions.saveProfile({
        jurisdictionId,
        payPeriod: period,
        onboarded: true,
        ...(hourlyRate !== undefined ? { hourlyRate } : {}),
      });
      navigate({ name: "owed" }, { replace: true });
    } finally {
      setBusy(false);
    }
  };

  const demo = async () => {
    setBusy(true);
    try {
      await loadDemo(actions);
      navigate({ name: "owed" }, { replace: true });
    } catch (err) {
      toast.show(t("error.generic", { message: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(false);
    }
  };

  if (step === 0) {
    return (
      <main className="content no-tabs" id="main">
        <div className="welcome-hero">
          <img src={logo} alt="" width={88} height={88} />
          <h1>{t("app.name")}</h1>
          <p className="muted" style={{ marginTop: 8, fontSize: "1.05rem" }}>
            {t("app.tagline")}
          </p>
        </div>
        <p className="muted" style={{ textAlign: "center" }}>
          {t("welcome.lead")}
        </p>
        <div className="card stack" style={{ gap: 16 }}>
          {(
            [
              [Camera, "welcome.f1.title", "welcome.f1.body"],
              [FileClock, "welcome.f2.title", "welcome.f2.body"],
              [BadgeCheck, "welcome.f3.title", "welcome.f3.body"],
            ] as const
          ).map(([Icon, title, body]) => (
            <div className="feature" key={title}>
              <div className="art">
                <Icon size={20} aria-hidden />
              </div>
              <div>
                <h3>{t(title)}</h3>
                <p className="muted" style={{ fontSize: "0.92rem", marginTop: 2 }}>
                  {t(body)}
                </p>
              </div>
            </div>
          ))}
        </div>
        <button className="btn primary block" type="button" onClick={() => setStep(1)}>
          {t("welcome.start")}
        </button>
        <button className="btn ghost block" type="button" onClick={demo} disabled={busy}>
          {t("welcome.demo")}
        </button>
        <p className="footer-note row" style={{ justifyContent: "center" }}>
          <Lock size={14} aria-hidden /> {t("welcome.privacy")}
        </p>
      </main>
    );
  }

  const total = 3;
  return (
    <main className="content no-tabs" id="main">
      <div className="steps" aria-label={t("onboarding.step", { n: step, total })}>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} aria-current={i + 1 === step ? "step" : undefined} />
        ))}
      </div>

      {step === 1 && (
        <>
          <div className="page-title">
            <h1>{t("onboarding.law.title")}</h1>
            <p className="muted">{t("onboarding.law.lead")}</p>
          </div>
          <JurisdictionPicker value={jurisdictionId} onChange={setJurisdictionId} />
          <p className="faint">{t("onboarding.law.notListed")}</p>
        </>
      )}

      {step === 2 && (
        <>
          <div className="page-title">
            <h1>{t("onboarding.rate.title")}</h1>
            <p className="muted">{t("onboarding.rate.lead")}</p>
          </div>
          <div className="card">
            <RateField value={rate} onChange={setRate} autoFocus />
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <div className="page-title">
            <h1>{t("onboarding.period.title")}</h1>
            <p className="muted">{t("onboarding.period.lead")}</p>
          </div>
          <div className="card">
            <PayPeriodFields value={period} onChange={setPeriod} />
          </div>
        </>
      )}

      <div className="actions" style={{ marginTop: "auto" }}>
        <button className="btn" type="button" onClick={() => setStep(step - 1)}>
          {t("common.back")}
        </button>
        {step < total ? (
          <button
            className="btn primary"
            type="button"
            onClick={() => setStep(step + 1)}
            disabled={!jurisdictionId}
          >
            {step === 2 && !parseRate(rate) ? t("common.skip") : t("common.next")}
          </button>
        ) : (
          <button className="btn primary" type="button" onClick={finish} disabled={busy}>
            {t("onboarding.finish")}
          </button>
        )}
      </div>
    </main>
  );
}
