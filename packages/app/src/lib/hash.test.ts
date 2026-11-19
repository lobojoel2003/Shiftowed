import { describe, expect, it } from "vitest";
import { canonicalJson, GENESIS_HASH, hashVersion, rechain, sha256Hex, verifyChain } from "./hash";
import type { StoredVersion } from "./types";

function version(n: number, shifts = 1): StoredVersion {
  return {
    id: `v${n}`,
    number: n,
    postedAt: "2026-11-01T12:00:00.000Z",
    capturedAt: "2026-11-01T12:05:00.000Z",
    periodStart: "2026-11-16",
    periodEnd: "2026-11-22",
    source: "manual",
    shifts: Array.from({ length: shifts }, (_, i) => ({
      id: `s${i}`,
      start: "2026-11-16T09:00",
      end: "2026-11-16T17:00",
    })),
    hash: "",
    prevHash: "",
  };
}

describe("hashing", () => {
  it("computes SHA-256", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("serialises canonically", () => {
    expect(canonicalJson({ b: 1, a: [true, null, "x"], c: undefined })).toBe(
      '{"a":[true,null,"x"],"b":1}',
    );
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });

  it("chains versions and detects tampering", async () => {
    const chained = await rechain([version(1), version(2, 2)]);
    expect(chained[0]!.prevHash).toBe(GENESIS_HASH);
    expect(chained[1]!.prevHash).toBe(chained[0]!.hash);
    expect(await verifyChain(chained)).toBe(true);

    const tampered = chained.map((v, i) =>
      i === 0 ? { ...v, postedAt: "2026-11-10T12:00:00.000Z" } : v,
    );
    expect(await verifyChain(tampered)).toBe(false);
    const relinked = chained.map((v, i) => (i === 1 ? { ...v, prevHash: GENESIS_HASH } : v));
    expect(await verifyChain(relinked)).toBe(false);
  });

  it("depends on the previous hash", async () => {
    const v = version(1);
    expect(await hashVersion(v, GENESIS_HASH)).not.toBe(await hashVersion(v, "f".repeat(64)));
  });
});
