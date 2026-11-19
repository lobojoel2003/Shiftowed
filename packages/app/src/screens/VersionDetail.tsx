import { ShieldAlert, ShieldCheck, Trash2, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { Page } from "../components/Layout";
import { useToast } from "../components/Toast";
import { useT } from "../i18n";
import type { MessageKey } from "../i18n/en";
import { getImage } from "../lib/db";
import { formatDate, formatInstant, formatShiftTimes } from "../lib/format";
import { verifyChain } from "../lib/hash";
import { href, navigate } from "../lib/router";
import { useStore } from "../lib/store";

export function VersionDetail({ id }: { id: string }) {
  const { t, locale } = useT();
  const { data, jurisdiction, actions } = useStore();
  const toast = useToast();
  const version = data.versions.find((v) => v.id === id);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [intact, setIntact] = useState<boolean | null>(null);
  const tz = jurisdiction?.timeZone ?? "America/New_York";

  useEffect(() => {
    let url: string | null = null;
    if (version?.imageId) {
      void getImage(version.imageId).then((img) => {
        if (img) {
          url = URL.createObjectURL(img.blob);
          setImageUrl(url);
        }
      });
    }
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [version?.imageId]);

  useEffect(() => {
    void verifyChain(data.versions).then(setIntact);
  }, [data.versions]);

  if (!version) {
    return (
      <Page back={{ name: "schedule" }}>
        <div className="card empty">
          <p>{t("detail.notFound")}</p>
        </div>
      </Page>
    );
  }

  const remove = async () => {
    if (!window.confirm(t("version.deleteConfirm", { n: version.number }))) return;
    await actions.deleteVersion(version.id);
    toast.show(t("version.deleted"));
    navigate({ name: "schedule" }, { replace: true });
  };

  return (
    <Page back={{ name: "schedule" }} title={t("version.title", { n: version.number })}>
      <section className="card">
        <dl className="kv">
          <dt>{t("version.posted")}</dt>
          <dd>{formatInstant(version.postedAt, tz, locale)}</dd>
          <dt>{t("version.captured")}</dt>
          <dd>{formatInstant(version.capturedAt, tz, locale)}</dd>
          <dt>{t("version.covers")}</dt>
          <dd>
            {formatDate(version.periodStart, locale)} – {formatDate(version.periodEnd, locale)}
          </dd>
          <dt>{t("version.source")}</dt>
          <dd>{t(`schedule.source.${version.source}` as MessageKey)}</dd>
          {version.note && (
            <>
              <dt>{t("version.note")}</dt>
              <dd>{version.note}</dd>
            </>
          )}
        </dl>
      </section>

      <h2 className="section-title">
        {t("version.shifts")} <span>{version.shifts.length}</span>
      </h2>
      <div className="list">
        {version.shifts.length === 0 && <div className="list-item faint">{t("schedule.off")}</div>}
        {[...version.shifts]
          .sort((a, b) => a.start.localeCompare(b.start))
          .map((s) => (
            <div className="list-item" key={s.id}>
              <span className="grow">
                <strong>{formatDate(s.start.slice(0, 10), locale)}</strong>
                <span className="muted"> · {formatShiftTimes(s.start, s.end, locale)}</span>
                {s.label && <span className="faint"> · {s.label}</span>}
              </span>
            </div>
          ))}
      </div>

      {imageUrl && (
        <>
          <h2 className="section-title">{t("version.screenshot")}</h2>
          <img className="preview-img" src={imageUrl} alt={t("version.screenshot")} />
        </>
      )}

      {version.ocrText && (
        <details className="card disclosure">
          <summary>{t("version.ocrText")}</summary>
          <pre className="mono" style={{ whiteSpace: "pre-wrap", marginTop: 10 }}>
            {version.ocrText}
          </pre>
        </details>
      )}

      <section className="card stack">
        <div className="row">
          {intact ? (
            <ShieldCheck size={20} color="var(--brand)" aria-hidden />
          ) : (
            <ShieldAlert size={20} color="var(--danger)" aria-hidden />
          )}
          <span className="grow" style={{ fontSize: "0.9rem" }}>
            {intact === null
              ? t("common.loading")
              : intact
                ? t("version.integrity.ok")
                : t("version.integrity.bad")}
          </span>
        </div>
        <div>
          <div className="faint">{t("version.hash")}</div>
          <div className="mono" data-testid="version-hash">
            {version.hash}
          </div>
        </div>
        <div>
          <div className="faint">{t("version.prevHash")}</div>
          <div className="mono">{version.prevHash}</div>
        </div>
        {version.imageHash && (
          <div>
            <div className="faint">{t("version.imageHash")}</div>
            <div className="mono">{version.imageHash}</div>
          </div>
        )}
      </section>

      <div className="actions">
        <a className="btn" href={href({ name: "add", mode: "type", versionId: version.id })}>
          <Pencil size={18} aria-hidden />
          {t("version.edit")}
        </a>
        <button className="btn danger" type="button" onClick={() => void remove()}>
          <Trash2 size={18} aria-hidden />
          {t("common.delete")}
        </button>
      </div>
    </Page>
  );
}
