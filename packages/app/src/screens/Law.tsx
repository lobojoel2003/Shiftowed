import { ExternalLink, Phone, Scale } from "lucide-react";
import { useState } from "react";
import { Citation } from "../components/Citation";
import { JurisdictionPicker } from "../components/Fields";
import { Page } from "../components/Layout";
import { useToast } from "../components/Toast";
import { useT } from "../i18n";
import { describeAmount, describeKinds, describeWindow, hoursLabel } from "../lib/describe";
import { formatDate } from "../lib/format";
import { useStore } from "../lib/store";

const REPO = "https://github.com/lobojoel2003/Shiftowed";

export function Law() {
  const tr = useT();
  const { t, locale } = tr;
  const { jurisdiction: j, actions } = useStore();
  const toast = useToast();
  const [picking, setPicking] = useState(false);

  if (!j) return null;

  if (picking) {
    return (
      <Page>
        <div className="page-title">
          <h1>{t("onboarding.law.title")}</h1>
          <p className="muted">{t("onboarding.law.lead")}</p>
        </div>
        <JurisdictionPicker
          value={j.id}
          onChange={async (id) => {
            await actions.saveProfile({ jurisdictionId: id });
            setPicking(false);
            toast.show(t("settings.saved"));
          }}
        />
        <button className="btn block" type="button" onClick={() => setPicking(false)}>
          {t("common.cancel")}
        </button>
      </Page>
    );
  }

  return (
    <Page>
      <section className="card stack">
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div
            className="detail-icon"
            style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
          >
            <Scale size={24} aria-hidden />
          </div>
          <div className="grow">
            <h1 style={{ fontSize: "1.3rem" }}>{j.name}</h1>
            <p className="muted" style={{ marginTop: 2 }}>
              {j.law}
            </p>
          </div>
        </div>
        <div className="faint stack" style={{ gap: 2 }}>
          <span>
            {t("law.effective", {
              date: formatDate(j.effective, locale, {
                year: "numeric",
                month: "short",
                day: "numeric",
              }),
            })}
          </span>
          <span>
            {t("law.verified", {
              date: formatDate(j.lastVerified, locale, {
                year: "numeric",
                month: "short",
                day: "numeric",
              }),
            })}
          </span>
        </div>
        <button
          className="btn small"
          type="button"
          onClick={() => setPicking(true)}
          style={{ alignSelf: "flex-start" }}
        >
          {t("law.change")}
        </button>
      </section>

      <section className="card stack">
        <h2>{t("law.notice")}</h2>
        <p>{t("law.noticeBody", { label: j.advanceNotice.label })}</p>
        <Citation citation={j.advanceNotice.citation} />
      </section>

      {j.premiums.length > 0 && (
        <section className="card stack">
          <h2>{t("law.premiums")}</h2>
          <table className="rules">
            <thead>
              <tr>
                <th scope="col">{t("law.change.col")}</th>
                <th scope="col">{t("law.amount.col")}</th>
              </tr>
            </thead>
            <tbody>
              {j.premiums.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.label}</strong>
                    <div className="faint" style={{ marginTop: 2 }}>
                      {describeKinds(r, tr)} · {describeWindow(r.notice, tr, r.minChangeMinutes)}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <Citation citation={r.citation} />
                    </div>
                  </td>
                  <td style={{ fontWeight: 650 }}>{describeAmount(r.amount, tr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {(j.prohibitions ?? []).length > 0 && (
        <section className="card stack">
          <h2>{t("law.prohibitions")}</h2>
          {(j.prohibitions ?? []).map((p) => (
            <div key={p.id} className="stack" style={{ gap: 4 }}>
              <strong>{p.label}</strong>
              <span className="faint">
                {describeKinds(p, tr)} · {describeWindow(p.notice, tr)}
              </span>
              <Citation citation={p.citation} />
            </div>
          ))}
        </section>
      )}

      {(j.rest ?? []).map((r) => (
        <section className="card stack" key={r.id}>
          <h2>{t("law.rest")}</h2>
          <p>
            {t("law.restBody", { hours: hoursLabel(r.minRestHours, tr) })}{" "}
            <strong>
              {describeAmount(r.amount, tr, { secondShift: r.premiumHours === "secondShift" })}
            </strong>
          </p>
          <Citation citation={r.citation} />
        </section>
      ))}

      {j.exceptions.length > 0 && (
        <section className="card stack">
          <h2>{t("law.exceptions")}</h2>
          {j.exceptions.map((e) => (
            <div key={e.id} className="stack" style={{ gap: 4 }}>
              <strong>{e.label}</strong>
              <span className="faint">{e.description}</span>
              <Citation citation={e.citation} />
            </div>
          ))}
        </section>
      )}

      <section className="card stack">
        <h2>{t("law.coverage")}</h2>
        <p>{j.coverage.summary}</p>
        <dl className="kv">
          <dt>{t("law.employerSize")}</dt>
          <dd>{j.coverage.employerThreshold}</dd>
          <dt>{t("law.industries")}</dt>
          <dd>{j.coverage.industries.join(", ")}</dd>
        </dl>
        {j.coverage.employees && (
          <p className="faint">
            <strong>{t("law.employees")}:</strong> {j.coverage.employees}
          </p>
        )}
        {j.coverage.notes?.map((n) => (
          <p className="faint" key={n}>
            {n}
          </p>
        ))}
      </section>

      {(j.otherRights ?? []).length > 0 && (
        <section className="card stack">
          <h2>{t("law.other")}</h2>
          {(j.otherRights ?? []).map((r) => (
            <div key={r.label} className="row" style={{ alignItems: "flex-start" }}>
              <span className="grow">{r.label}</span>
              <Citation citation={r.citation} />
            </div>
          ))}
        </section>
      )}

      <section className="card stack">
        <h2>{t("law.help")}</h2>
        <p className="muted">{j.enforcement.agency}</p>
        <div className="row wrap">
          {j.enforcement.complaintUrl && (
            <a
              className="btn primary small"
              href={j.enforcement.complaintUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              {t("law.file")} <ExternalLink size={14} aria-hidden />
            </a>
          )}
          {j.enforcement.phone && (
            <a className="btn small" href={`tel:${j.enforcement.phone.replace(/[^\d+]/g, "")}`}>
              <Phone size={14} aria-hidden /> {t("law.call", { phone: j.enforcement.phone })}
            </a>
          )}
          <a
            className="btn small"
            href={j.enforcement.url}
            target="_blank"
            rel="noreferrer noopener"
          >
            {t("law.agency")} <ExternalLink size={14} aria-hidden />
          </a>
        </div>
      </section>

      {(j.notes ?? []).length > 0 && (
        <section className="card stack">
          <h2>{t("law.notes")}</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }} className="stack">
            {(j.notes ?? []).map((n) => (
              <li key={n} className="muted" style={{ fontSize: "0.92rem" }}>
                {n}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card stack">
        <h2>{t("law.sources")}</h2>
        <ul style={{ margin: 0, paddingLeft: 18 }} className="stack">
          {j.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer noopener">
                {s.title}
              </a>
            </li>
          ))}
        </ul>
        <p className="faint">
          {t("law.openData")}{" "}
          <a
            href={`${REPO}/blob/main/packages/rules/rules/${j.id}.json`}
            target="_blank"
            rel="noreferrer noopener"
          >
            {j.id}.json
          </a>
        </p>
      </section>

      <p className="footer-note">{t("common.notLegalAdvice")}</p>
    </Page>
  );
}
