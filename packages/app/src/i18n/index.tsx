import { useCallback, useMemo } from "react";
import { useStore } from "../lib/store";
import type { Locale } from "../lib/types";
import { en, type MessageKey, type Messages } from "./en";
import { es } from "./es";

const dictionaries: Record<Locale, Messages> = { en, es };

export type Vars = Record<string, string | number>;

/** Keys that have `_one` / `_other` plural forms, without the suffix. */
export type PluralKey = {
  [K in MessageKey]: K extends `${infer Base}_one` ? Base : never;
}[MessageKey];

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] === undefined ? `{${name}}` : String(vars[name]),
  );
}

export function translate(locale: Locale, key: MessageKey, vars?: Vars): string {
  return interpolate(dictionaries[locale][key] ?? en[key], vars);
}

export function translatePlural(
  locale: Locale,
  key: PluralKey,
  count: number,
  vars?: Vars,
): string {
  const rule = new Intl.PluralRules(locale === "es" ? "es" : "en").select(count);
  const full = `${key}_${rule === "one" ? "one" : "other"}` as MessageKey;
  return translate(locale, full, { count, ...vars });
}

export function detectLocale(): Locale {
  return typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("es")
    ? "es"
    : "en";
}

export interface Translator {
  locale: Locale;
  t: (key: MessageKey, vars?: Vars) => string;
  tp: (key: PluralKey, count: number, vars?: Vars) => string;
}

export function useT(): Translator {
  const { data } = useStore();
  const locale = data.profile?.locale ?? detectLocale();
  const t = useCallback((key: MessageKey, vars?: Vars) => translate(locale, key, vars), [locale]);
  const tp = useCallback(
    (key: PluralKey, count: number, vars?: Vars) => translatePlural(locale, key, count, vars),
    [locale],
  );
  return useMemo(() => ({ locale, t, tp }), [locale, t, tp]);
}

export type { MessageKey };
