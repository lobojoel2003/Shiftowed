import { JURISDICTIONS, type Jurisdiction } from "@shiftowed/rules";
import { useId } from "react";
import { useT } from "../i18n";
import type { MessageKey } from "../i18n/en";
import type { PayPeriodConfig, PayPeriodKind } from "../lib/types";

const KINDS: PayPeriodKind[] = ["weekly", "biweekly", "semimonthly", "monthly"];

export function PayPeriodFields({
  value,
  onChange,
}: {
  value: PayPeriodConfig;
  onChange: (v: PayPeriodConfig) => void;
}) {
  const { t } = useT();
  const anchorId = useId();
  return (
    <div className="stack">
      <div className="segmented" role="group" aria-label={t("onboarding.period.title")}>
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={value.kind === k}
            onClick={() => onChange({ ...value, kind: k })}
          >
            {t(`payPeriod.${k}` as MessageKey)}
          </button>
        ))}
      </div>
      {(value.kind === "weekly" || value.kind === "biweekly") && (
        <div className="field">
          <label htmlFor={anchorId}>{t("payPeriod.anchor")}</label>
          <input
            id={anchorId}
            type="date"
            value={value.anchor}
            onChange={(e) => e.target.value && onChange({ ...value, anchor: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

export function RateField({
  value,
  onChange,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  const { t } = useT();
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{t("rate.label")}</label>
      <div className="input-prefix">
        <span aria-hidden>$</span>
        <input
          id={id}
          inputMode="decimal"
          type="number"
          min="0"
          step="0.01"
          placeholder="18.00"
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      <span className="hint">{t("rate.hint")}</span>
    </div>
  );
}

/** Parse a rate input; undefined for blank or invalid. */
export function parseRate(value: string): number | undefined {
  const n = Number(value);
  return value.trim() !== "" && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : undefined;
}

function groupByState(list: readonly Jurisdiction[]): [string, Jurisdiction[]][] {
  const names: Record<string, string> = {
    CA: "California",
    IL: "Illinois",
    NY: "New York",
    OR: "Oregon",
    PA: "Pennsylvania",
    WA: "Washington",
  };
  const groups = new Map<string, Jurisdiction[]>();
  for (const j of list) {
    const key = names[j.region.state] ?? j.region.state;
    groups.set(key, [...(groups.get(key) ?? []), j]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function JurisdictionPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const name = useId();
  return (
    <div className="stack">
      {groupByState(JURISDICTIONS.filter((j) => j.status === "in-force")).map(([state, list]) => (
        <fieldset key={state} className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="section-title" style={{ marginBottom: 8 }}>
            {state}
          </legend>
          {list.map((j) => (
            <label className="choice" key={j.id}>
              <input
                type="radio"
                name={name}
                value={j.id}
                checked={value === j.id}
                onChange={() => onChange(j.id)}
              />
              <span>
                <strong>{j.name}</strong>
                <span className="faint" style={{ display: "block", marginTop: 2 }}>
                  {j.law} · {j.coverage.employerThreshold}
                </span>
                <span className="faint" style={{ display: "block", marginTop: 4 }}>
                  {j.coverage.industries.join(", ")}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}
