/**
 * On-device storage in IndexedDB. Nothing here ever leaves the device unless the
 * worker exports it.
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { AppData, AuditEvent, Profile, StoredImage, StoredVersion } from "./types";

const DB_NAME = "shiftowed";
const DB_VERSION = 1;

interface ShiftowedDB extends DBSchema {
  kv: { key: string; value: unknown };
  versions: { key: string; value: StoredVersion; indexes: { byNumber: number } };
  images: { key: string; value: StoredImage };
  audit: { key: string; value: AuditEvent; indexes: { byAt: string } };
}

let dbPromise: Promise<IDBPDatabase<ShiftowedDB>> | null = null;

export function db(): Promise<IDBPDatabase<ShiftowedDB>> {
  dbPromise ??= openDB<ShiftowedDB>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      database.createObjectStore("kv");
      const versions = database.createObjectStore("versions", { keyPath: "id" });
      versions.createIndex("byNumber", "number", { unique: false });
      database.createObjectStore("images", { keyPath: "id" });
      const audit = database.createObjectStore("audit", { keyPath: "id" });
      audit.createIndex("byAt", "at", { unique: false });
    },
  });
  return dbPromise;
}

/** For tests: forget the cached connection. */
export async function closeDb(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
}

export async function loadAll(): Promise<AppData> {
  const d = await db();
  const [profile, versions, exceptions, audit] = await Promise.all([
    d.get("kv", "profile") as Promise<Profile | undefined>,
    d.getAllFromIndex("versions", "byNumber"),
    d.get("kv", "exceptions") as Promise<Record<string, string> | undefined>,
    d.getAllFromIndex("audit", "byAt"),
  ]);
  return { profile: profile ?? null, versions, exceptions: exceptions ?? {}, audit };
}

export async function getProfile(): Promise<Profile | undefined> {
  return (await db()).get("kv", "profile") as Promise<Profile | undefined>;
}

export async function getVersions(): Promise<StoredVersion[]> {
  return (await db()).getAllFromIndex("versions", "byNumber");
}

export async function getExceptions(): Promise<Record<string, string>> {
  return ((await (await db()).get("kv", "exceptions")) as Record<string, string> | undefined) ?? {};
}

export async function saveProfile(profile: Profile): Promise<void> {
  await (await db()).put("kv", profile, "profile");
}

export async function saveExceptions(exceptions: Record<string, string>): Promise<void> {
  await (await db()).put("kv", exceptions, "exceptions");
}

/** Replace all versions in one transaction (used after re-chaining hashes). */
export async function saveVersions(versions: StoredVersion[]): Promise<void> {
  const tx = (await db()).transaction("versions", "readwrite");
  await tx.store.clear();
  for (const v of versions) await tx.store.put(v);
  await tx.done;
}

export async function addAudit(event: AuditEvent): Promise<void> {
  await (await db()).put("audit", event);
}

export async function saveImage(image: StoredImage): Promise<void> {
  await (await db()).put("images", image);
}

export async function getImage(id: string): Promise<StoredImage | undefined> {
  return (await db()).get("images", id);
}

export async function deleteImage(id: string): Promise<void> {
  await (await db()).delete("images", id);
}

export async function allImages(): Promise<StoredImage[]> {
  return (await db()).getAll("images");
}

export async function clearAll(): Promise<void> {
  const d = await db();
  const tx = d.transaction(["kv", "versions", "images", "audit"], "readwrite");
  await Promise.all([
    tx.objectStore("kv").clear(),
    tx.objectStore("versions").clear(),
    tx.objectStore("images").clear(),
    tx.objectStore("audit").clear(),
  ]);
  await tx.done;
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
