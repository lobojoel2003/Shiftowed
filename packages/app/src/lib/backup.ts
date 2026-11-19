/**
 * Full backups: everything in the app as one JSON file the worker controls.
 */
import { BUILD } from "./buildInfo";
import { allImages } from "./db";
import { base64ToBlob, blobToBase64 } from "./files";
import type { AppData, AuditEvent, Profile, StoredVersion } from "./types";

export const BACKUP_FORMAT = "shiftowed-backup";

export interface BackupImage {
  id: string;
  type: string;
  name?: string;
  base64: string;
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  app: { version: string; build: string; commit: string };
  data: AppData;
  images: BackupImage[];
}

export async function createBackup(data: AppData, includeImages = true): Promise<BackupFile> {
  const images: BackupImage[] = [];
  if (includeImages) {
    for (const img of await allImages()) {
      images.push({
        id: img.id,
        type: img.type,
        ...(img.name ? { name: img.name } : {}),
        base64: await blobToBase64(img.blob),
      });
    }
  }
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    app: { version: BUILD.version, build: BUILD.build, commit: BUILD.commit },
    data,
    images,
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isVersion(v: unknown): v is StoredVersion {
  return (
    isObject(v) &&
    typeof v.id === "string" &&
    typeof v.number === "number" &&
    typeof v.postedAt === "string" &&
    typeof v.periodStart === "string" &&
    typeof v.periodEnd === "string" &&
    Array.isArray(v.shifts) &&
    v.shifts.every(
      (s) =>
        isObject(s) &&
        typeof s.id === "string" &&
        typeof s.start === "string" &&
        typeof s.end === "string",
    )
  );
}

/** Parse and sanity-check a backup file. Throws on anything unexpected. */
export function parseBackup(text: string): {
  data: AppData;
  images: { id: string; blob: Blob; type: string }[];
} {
  const raw: unknown = JSON.parse(text);
  if (!isObject(raw) || raw.format !== BACKUP_FORMAT || raw.version !== 1 || !isObject(raw.data)) {
    throw new Error("Not a Shiftowed backup");
  }
  const d = raw.data;
  if (!Array.isArray(d.versions) || !d.versions.every(isVersion))
    throw new Error("Backup has invalid schedules");
  const profile =
    isObject(d.profile) && typeof d.profile.jurisdictionId === "string"
      ? (d.profile as unknown as Profile)
      : null;
  const exceptions = isObject(d.exceptions)
    ? Object.fromEntries(
        Object.entries(d.exceptions).filter((e): e is [string, string] => typeof e[1] === "string"),
      )
    : {};
  const audit = Array.isArray(d.audit)
    ? (d.audit.filter(
        (e) => isObject(e) && typeof e.id === "string" && typeof e.at === "string",
      ) as AuditEvent[])
    : [];
  const images = Array.isArray(raw.images)
    ? raw.images
        .filter(
          (i): i is BackupImage =>
            isObject(i) && typeof i.id === "string" && typeof i.base64 === "string",
        )
        .map((i) => ({
          id: i.id,
          type: i.type || "image/png",
          blob: base64ToBlob(i.base64, i.type || "image/png"),
        }))
    : [];
  return { data: { profile, versions: d.versions as StoredVersion[], exceptions, audit }, images };
}
