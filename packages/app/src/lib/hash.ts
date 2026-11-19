import type { StoredVersion } from "./types";

export const GENESIS_HASH = "0".repeat(64);

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(data: string | ArrayBuffer | Uint8Array): Promise<string> {
  const bytes =
    typeof data === "string"
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data);
  return hex(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
}

export async function sha256Blob(blob: Blob): Promise<string> {
  return sha256Hex(await blob.arrayBuffer());
}

/** Stable JSON: object keys sorted, no whitespace. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/** The fields of a version that its hash covers. */
export function hashedContent(v: Omit<StoredVersion, "hash" | "prevHash">): unknown {
  return {
    id: v.id,
    number: v.number,
    postedAt: v.postedAt,
    capturedAt: v.capturedAt,
    periodStart: v.periodStart,
    periodEnd: v.periodEnd,
    source: v.source,
    shifts: v.shifts.map((s) => ({ id: s.id, start: s.start, end: s.end, label: s.label })),
    imageHash: v.imageHash,
    note: v.note,
  };
}

export async function hashVersion(
  v: Omit<StoredVersion, "hash" | "prevHash">,
  prevHash: string,
): Promise<string> {
  return sha256Hex(`${prevHash}\n${canonicalJson(hashedContent(v))}`);
}

/**
 * Recompute the hash chain in capture order. Versions must already be sorted by
 * `number`. Returns new objects; the input is not modified.
 */
export async function rechain(versions: StoredVersion[]): Promise<StoredVersion[]> {
  const out: StoredVersion[] = [];
  let prev = GENESIS_HASH;
  for (const v of versions) {
    const hash = await hashVersion(v, prev);
    out.push({ ...v, prevHash: prev, hash });
    prev = hash;
  }
  return out;
}

/** Check that each version's hash matches its content and links to the one before. */
export async function verifyChain(versions: StoredVersion[]): Promise<boolean> {
  let prev = GENESIS_HASH;
  for (const v of versions) {
    if (v.prevHash !== prev) return false;
    if ((await hashVersion(v, prev)) !== v.hash) return false;
    prev = v.hash;
  }
  return true;
}
