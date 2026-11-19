import { RULES_VERSION } from "@shiftowed/rules";
import { Download, ExternalLink, HardDriveDownload, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { parseRate, PayPeriodFields, RateField } from "../components/Fields";
import { Page } from "../components/Layout";
import { useToast } from "../components/Toast";
import { useT } from "../i18n";
import { createBackup, parseBackup } from "../lib/backup";
import { BUILD } from "../lib/buildInfo";
import { requestPersistence } from "../lib/db";
import { downloadBlob, fileStamp } from "../lib/files";
import { prepareOcr } from "../lib/ocr";
import { navigate } from "../lib/router";
import { useStore } from "../lib/store";
import type { Locale } from "../lib/types";

const REPO = "https://github.com/lobojoel2003/Shiftowed";

export function Settings() {
  const { t } = useT();
  const { data, actions, jurisdiction } = useStore();
  const toast = useToast();
  const profile = data.profile!;
  const [rate, setRate] = useState(profile.hourlyRate?.toString() ?? "");
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [ocrState, setOcrState] = useState<"idle" | "loading" | "ready">("idle");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void requestPersistence().then(setPersisted);
  }, []);

  const saveRate = async () => {
    const hourlyRate = parseRate(rate);
    if (hourlyRate === profile.hourlyRate) return;
    await actions.saveProfile(
      hourlyRate === undefined ? { hourlyRate: undefined } : { hourlyRate },
    );
    toast.show(t("settings.saved"));
  };

  const textField = (key: "workerName" | "employer" | "workplace", label: string) => (
    <label className="field">
      <span>{label}</span>
      <input
        type="text"
        defaultValue={profile[key] ?? ""}
        maxLength={80}
        onBlur={async (e) => {
          const v = e.target.value.trim();
          if (v === (profile[key] ?? "")) return;
          await actions.saveProfile({ [key]: v || undefined });
          toast.show(t("settings.saved"));
        }}
      />
    </label>
  );

  return (
    <Page>
      <div className="page-title">
        <h1>{t("settings.title")}</h1>
      </div>

      <section className="card stack">
        <h2>{t("settings.pay")}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void saveRate();
          }}
        >
          <RateField value={rate} onChange={setRate} />
          <input type="submit" hidden />
        </form>
        <div className="row" style={{ justifyContent: "flex-end", marginTop: -4 }}>
          <button
            className="btn small"
            type="button"
            onClick={() => void saveRate()}
            data-testid="save-rate"
          >
            {t("common.save")}
          </button>
        </div>
        <PayPeriodFields
          value={profile.payPeriod}
          onChange={async (payPeriod) => {
            await actions.saveProfile({ payPeriod });
          }}
        />
      </section>

      <section className="card stack">
        <div>
          <h2>{t("settings.you")}</h2>
          <p className="faint" style={{ marginTop: 4 }}>
            {t("settings.youHint")}
          </p>
        </div>
        {textField("workerName", t("settings.name"))}
        {textField("employer", t("settings.employer"))}
        {textField("workplace", t("settings.workplace"))}
      </section>

      <section className="card stack">
        <h2>{t("settings.language")}</h2>
        <div className="segmented" role="group" aria-label={t("settings.language")}>
          {(
            [
              ["en", "English"],
              ["es", "Español"],
            ] as [Locale, string][]
          ).map(([code, label]) => (
            <button
              key={code}
              type="button"
              lang={code}
              aria-pressed={profile.locale === code}
              onClick={() => void actions.saveProfile({ locale: code })}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="card stack">
        <h2>{t("settings.offline")}</h2>
        <p className="muted" style={{ fontSize: "0.92rem" }}>
          {ocrState === "ready" ? t("settings.offlineReady") : t("settings.offlineBody")}
        </p>
        {ocrState !== "ready" && (
          <button
            className="btn small"
            type="button"
            disabled={ocrState === "loading"}
            style={{ alignSelf: "flex-start" }}
            onClick={async () => {
              setOcrState("loading");
              try {
                await prepareOcr();
                setOcrState("ready");
              } catch (err) {
                setOcrState("idle");
                toast.show(
                  t("error.generic", { message: err instanceof Error ? err.message : String(err) }),
                );
              }
            }}
          >
            <HardDriveDownload size={16} aria-hidden />{" "}
            {ocrState === "loading" ? t("common.loading") : t("settings.offlineButton")}
          </button>
        )}
      </section>

      <section className="card stack">
        <h2>{t("settings.data")}</h2>
        <p className="faint">{persisted ? t("settings.persisted") : t("settings.notPersisted")}</p>
        <div className="actions">
          <button
            className="btn"
            type="button"
            onClick={async () => {
              const backup = await createBackup(data, true);
              downloadBlob(
                new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
                `shiftowed-backup-${fileStamp(jurisdiction?.timeZone ?? "UTC")}.json`,
              );
            }}
          >
            <Download size={18} aria-hidden /> {t("settings.backup")}
          </button>
          <button className="btn" type="button" onClick={() => fileRef.current?.click()}>
            <Upload size={18} aria-hidden /> {t("settings.restore")}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label={t("settings.restore")}
          tabIndex={-1}
          data-testid="restore-input"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              const parsed = parseBackup(await file.text());
              if (!window.confirm(t("settings.restoreConfirm"))) return;
              await actions.replaceAll(parsed.data, parsed.images);
              toast.show(t("settings.restored"));
            } catch {
              toast.show(t("settings.restoreFailed"));
            }
          }}
        />
        <button
          className="btn danger"
          type="button"
          onClick={async () => {
            if (!window.confirm(t("settings.clearConfirm"))) return;
            await actions.clearAll();
            toast.show(t("settings.cleared"));
            navigate({ name: "welcome" }, { replace: true });
          }}
        >
          <Trash2 size={18} aria-hidden /> {t("settings.clear")}
        </button>
      </section>

      <section className="card stack">
        <h2>{t("settings.about")}</h2>
        <dl className="kv" data-testid="build-info">
          <dt>{t("settings.version")}</dt>
          <dd>v{BUILD.version}</dd>
          <dt>{t("settings.build")}</dt>
          <dd>{BUILD.build}</dd>
          <dt>{t("settings.commit")}</dt>
          <dd className="mono">{BUILD.commit}</dd>
          <dt>{t("settings.rules")}</dt>
          <dd>v{RULES_VERSION}</dd>
          <dt>{t("settings.license")}</dt>
          <dd>{t("settings.licenseBody")}</dd>
        </dl>
        <p className="faint">{t("settings.privacy")}</p>
        <a
          className="btn small"
          href={REPO}
          target="_blank"
          rel="noreferrer noopener"
          style={{ alignSelf: "flex-start" }}
        >
          {t("settings.source")} <ExternalLink size={14} aria-hidden />
        </a>
      </section>
    </Page>
  );
}
