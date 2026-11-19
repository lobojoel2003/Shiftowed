/**
 * App state: loads everything from IndexedDB once, keeps it in memory, and
 * writes through on every change. The evaluation (what the worker is owed) is
 * derived from the data, never stored.
 */
import {
  evaluate,
  getJurisdiction,
  type Evaluation,
  type Jurisdiction,
  type Shift,
} from "@shiftowed/rules";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as store from "./db";
import { GENESIS_HASH, hashVersion, rechain, sha256Blob } from "./hash";
import { newId } from "./ids";
import type {
  AppData,
  AuditAction,
  AuditEvent,
  Profile,
  StoredVersion,
  VersionSource,
} from "./types";

export interface NewVersionInput {
  postedAt: string;
  periodStart: string;
  periodEnd: string;
  shifts: Shift[];
  source: VersionSource;
  note?: string;
  image?: Blob;
  imageName?: string;
  ocrText?: string;
  /** Override the capture time (used by demo data and imports). */
  capturedAt?: string;
}

export interface Actions {
  saveProfile(patch: Partial<Profile>): Promise<Profile>;
  addVersion(input: NewVersionInput): Promise<StoredVersion>;
  updateVersion(
    id: string,
    patch: Partial<
      Pick<StoredVersion, "postedAt" | "periodStart" | "periodEnd" | "shifts" | "note">
    >,
  ): Promise<void>;
  deleteVersion(id: string): Promise<void>;
  setException(findingKey: string, exceptionId: string | null): Promise<void>;
  replaceAll(data: AppData, images?: { id: string; blob: Blob; type: string }[]): Promise<void>;
  clearAll(): Promise<void>;
}

export interface StoreValue {
  ready: boolean;
  data: AppData;
  jurisdiction: Jurisdiction | undefined;
  evaluation: Evaluation | null;
  evaluationError: string | null;
  actions: Actions;
  /**
   * Evaluate as if `extra` were saved, without saving it. With `replacingId`,
   * the draft stands in for that existing version (used when editing).
   */
  preview(extra: NewVersionInput & { replacingId?: string }): Evaluation | null;
}

const EMPTY: AppData = { profile: null, versions: [], exceptions: {}, audit: [] };

const StoreContext = createContext<StoreValue | null>(null);

function auditEvent(action: AuditAction, detail: string, versionId?: string): AuditEvent {
  return {
    id: newId("a"),
    at: new Date().toISOString(),
    action,
    detail,
    ...(versionId ? { versionId } : {}),
  };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function defaultProfile(jurisdictionId: string, today: string): Profile {
  return {
    jurisdictionId,
    payPeriod: { kind: "biweekly", anchor: today },
    locale: navigator.language?.toLowerCase().startsWith("es") ? "es" : "en",
    onboarded: false,
    createdAt: new Date().toISOString(),
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    store
      .loadAll()
      .then((loaded) => {
        if (alive) setData(loaded);
      })
      .catch((err: unknown) => {
        console.error("Could not load saved data", err);
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const log = useCallback(async (event: AuditEvent) => {
    await store.addAudit(event);
    setData((d) => ({ ...d, audit: [...d.audit, event] }));
  }, []);

  const saveProfile = useCallback(
    async (patch: Partial<Profile>) => {
      const current =
        (await store.getProfile()) ?? defaultProfile(patch.jurisdictionId ?? "", todayIso());
      const next: Profile = { ...current, ...patch };
      await store.saveProfile(next);
      setData((d) => ({ ...d, profile: next }));
      await log(auditEvent("profile.updated", Object.keys(patch).join(", ")));
      return next;
    },
    [log],
  );

  const addVersion = useCallback(
    async (input: NewVersionInput) => {
      const versions = await store.getVersions();
      const last = versions[versions.length - 1];
      let imageId: string | undefined;
      let imageHash: string | undefined;
      if (input.image) {
        imageId = newId("img");
        imageHash = await sha256Blob(input.image);
        await store.saveImage({
          id: imageId,
          blob: input.image,
          type: input.image.type || "image/png",
          ...(input.imageName ? { name: input.imageName } : {}),
          createdAt: new Date().toISOString(),
        });
      }
      const base: Omit<StoredVersion, "hash" | "prevHash"> = {
        id: newId("v"),
        number: (last?.number ?? 0) + 1,
        capturedAt: input.capturedAt ?? new Date().toISOString(),
        postedAt: input.postedAt,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        shifts: input.shifts,
        source: input.source,
        ...(input.note ? { note: input.note } : {}),
        ...(imageId ? { imageId } : {}),
        ...(imageHash ? { imageHash } : {}),
        ...(input.ocrText ? { ocrText: input.ocrText } : {}),
      };
      const prevHash = last?.hash ?? GENESIS_HASH;
      const version: StoredVersion = { ...base, prevHash, hash: await hashVersion(base, prevHash) };
      await store.saveVersions([...versions, version]);
      setData((d) => ({ ...d, versions: [...d.versions, version] }));
      await log(
        auditEvent(
          "version.created",
          `Schedule #${version.number}: ${version.shifts.length} shifts, ${version.periodStart} to ${version.periodEnd}`,
          version.id,
        ),
      );
      return version;
    },
    [log],
  );

  const updateVersion = useCallback<Actions["updateVersion"]>(
    async (id, patch) => {
      const versions = await store.getVersions();
      const edited = versions.map((v) =>
        v.id === id ? { ...v, ...patch, editedAt: new Date().toISOString() } : v,
      );
      const chained = await rechain(edited);
      await store.saveVersions(chained);
      setData((d) => ({ ...d, versions: chained }));
      const v = chained.find((x) => x.id === id);
      await log(
        auditEvent(
          "version.edited",
          `Schedule #${v?.number ?? "?"} edited: ${Object.keys(patch).join(", ")}`,
          id,
        ),
      );
    },
    [log],
  );

  const deleteVersion = useCallback(
    async (id: string) => {
      const versions = await store.getVersions();
      const target = versions.find((v) => v.id === id);
      const remaining = versions.filter((v) => v.id !== id);
      const chained = await rechain(remaining);
      await store.saveVersions(chained);
      if (target?.imageId) await store.deleteImage(target.imageId);
      setData((d) => ({ ...d, versions: chained }));
      await log(auditEvent("version.deleted", `Schedule #${target?.number ?? "?"} deleted`, id));
    },
    [log],
  );

  const setException = useCallback(
    async (findingKey: string, exceptionId: string | null) => {
      const next = { ...(await store.getExceptions()) };
      if (exceptionId) next[findingKey] = exceptionId;
      else delete next[findingKey];
      await store.saveExceptions(next);
      setData((d) => ({ ...d, exceptions: next }));
      await log(
        auditEvent(
          exceptionId ? "exception.set" : "exception.cleared",
          exceptionId ? `${findingKey}: ${exceptionId}` : findingKey,
        ),
      );
    },
    [log],
  );

  const replaceAll = useCallback<Actions["replaceAll"]>(async (next, images = []) => {
    await store.clearAll();
    if (next.profile) await store.saveProfile(next.profile);
    const chained = await rechain([...next.versions].sort((a, b) => a.number - b.number));
    await store.saveVersions(chained);
    await store.saveExceptions(next.exceptions);
    for (const e of next.audit) await store.addAudit(e);
    for (const img of images) {
      await store.saveImage({ ...img, createdAt: new Date().toISOString() });
    }
    const event = auditEvent("data.imported", `${chained.length} schedules imported`);
    await store.addAudit(event);
    setData({ ...next, versions: chained, audit: [...next.audit, event] });
  }, []);

  const clearAll = useCallback(async () => {
    await store.clearAll();
    setData(EMPTY);
  }, []);

  const jurisdiction = data.profile ? getJurisdiction(data.profile.jurisdictionId) : undefined;
  const hourlyRate = data.profile?.hourlyRate;

  const { evaluation, evaluationError } = useMemo(() => {
    if (!jurisdiction) return { evaluation: null, evaluationError: null };
    try {
      return {
        evaluation: evaluate(jurisdiction, data.versions, {
          ...(hourlyRate !== undefined ? { hourlyRate } : {}),
          exceptions: data.exceptions,
        }),
        evaluationError: null,
      };
    } catch (err) {
      return {
        evaluation: null,
        evaluationError: err instanceof Error ? err.message : String(err),
      };
    }
  }, [jurisdiction, data.versions, data.exceptions, hourlyRate]);

  const preview = useCallback(
    (extra: NewVersionInput & { replacingId?: string }): Evaluation | null => {
      if (!jurisdiction) return null;
      const draft: StoredVersion = {
        id: "preview",
        number: Number.MAX_SAFE_INTEGER,
        capturedAt: new Date().toISOString(),
        postedAt: extra.postedAt,
        periodStart: extra.periodStart,
        periodEnd: extra.periodEnd,
        shifts: extra.shifts,
        source: extra.source,
        hash: "",
        prevHash: "",
      };
      try {
        const others = data.versions.filter((v) => v.id !== extra.replacingId);
        return evaluate(jurisdiction, [...others, draft], {
          ...(hourlyRate !== undefined ? { hourlyRate } : {}),
          exceptions: data.exceptions,
        });
      } catch {
        return null;
      }
    },
    [jurisdiction, data.versions, data.exceptions, hourlyRate],
  );

  const actions = useMemo<Actions>(
    () => ({
      saveProfile,
      addVersion,
      updateVersion,
      deleteVersion,
      setException,
      replaceAll,
      clearAll,
    }),
    [saveProfile, addVersion, updateVersion, deleteVersion, setException, replaceAll, clearAll],
  );

  const value = useMemo<StoreValue>(
    () => ({ ready, data, jurisdiction, evaluation, evaluationError, actions, preview }),
    [ready, data, jurisdiction, evaluation, evaluationError, actions, preview],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore must be used inside <StoreProvider>");
  return value;
}
