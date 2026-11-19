import { Blob as NodeBlob } from "node:buffer";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { createBackup, parseBackup } from "./backup";
import { clearAll, closeDb } from "./db";
import { verifyChain } from "./hash";
import { StoreProvider, useStore } from "./store";

const wrapper = ({ children }: { children: ReactNode }) => (
  <StoreProvider>{children}</StoreProvider>
);

async function setup() {
  const hook = renderHook(() => useStore(), { wrapper });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  return hook;
}

const week = {
  periodStart: "2026-11-16",
  periodEnd: "2026-11-22",
  source: "manual" as const,
};

beforeEach(async () => {
  await clearAll();
  await closeDb();
});

describe("store", () => {
  it("saves a profile and evaluates schedule changes", async () => {
    const { result } = await setup();
    await act(async () => {
      await result.current.actions.saveProfile({
        jurisdictionId: "us-wa-seattle",
        hourlyRate: 20,
        payPeriod: { kind: "weekly", anchor: "2026-11-16" },
        onboarded: true,
      });
    });
    expect(result.current.jurisdiction?.id).toBe("us-wa-seattle");

    await act(async () => {
      await result.current.actions.addVersion({
        ...week,
        postedAt: "2026-11-01T17:00:00.000Z",
        shifts: [{ id: "a", start: "2026-11-16T09:00", end: "2026-11-16T17:00" }],
      });
      await result.current.actions.addVersion({
        ...week,
        periodEnd: "2026-11-16",
        postedAt: "2026-11-15T17:00:00.000Z",
        shifts: [],
      });
    });

    expect(result.current.data.versions.map((v) => v.number)).toEqual([1, 2]);
    expect(await verifyChain(result.current.data.versions)).toBe(true);
    // Cancelled 8-hour shift: half-time x $20 x 8h.
    expect(result.current.evaluation?.totalCents).toBe(8000);
    expect(result.current.data.audit.map((a) => a.action)).toContain("version.created");
  });

  it("previews a draft without saving it", async () => {
    const { result } = await setup();
    await act(async () => {
      await result.current.actions.saveProfile({
        jurisdictionId: "us-wa-seattle",
        hourlyRate: 20,
        onboarded: true,
      });
      await result.current.actions.addVersion({
        ...week,
        postedAt: "2026-11-01T17:00:00.000Z",
        shifts: [{ id: "a", start: "2026-11-16T09:00", end: "2026-11-16T17:00" }],
      });
    });
    const draft = result.current.preview({
      ...week,
      postedAt: "2026-11-15T17:00:00.000Z",
      shifts: [],
    });
    expect(draft?.findings.filter((f) => f.key.startsWith("preview:"))).toHaveLength(1);
    expect(result.current.data.versions).toHaveLength(1);
  });

  it("edits and deletes versions, re-chaining hashes", async () => {
    const { result } = await setup();
    await act(async () => {
      await result.current.actions.saveProfile({ jurisdictionId: "us-or-oregon", onboarded: true });
      await result.current.actions.addVersion({
        ...week,
        postedAt: "2026-11-01T17:00:00.000Z",
        shifts: [],
      });
      await result.current.actions.addVersion({
        ...week,
        postedAt: "2026-11-02T17:00:00.000Z",
        shifts: [],
      });
    });
    const [first, second] = result.current.data.versions;
    await act(async () => {
      await result.current.actions.updateVersion(first!.id, { note: "fixed a typo" });
    });
    const edited = result.current.data.versions[0]!;
    expect(edited.editedAt).toBeDefined();
    expect(edited.hash).not.toBe(first!.hash);
    expect(result.current.data.versions[1]!.prevHash).toBe(edited.hash);
    expect(await verifyChain(result.current.data.versions)).toBe(true);

    await act(async () => {
      await result.current.actions.deleteVersion(first!.id);
    });
    expect(result.current.data.versions.map((v) => v.id)).toEqual([second!.id]);
    expect(await verifyChain(result.current.data.versions)).toBe(true);
    expect(result.current.data.audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(["version.edited", "version.deleted"]),
    );
  });

  it("records exceptions", async () => {
    const { result } = await setup();
    await act(async () => {
      await result.current.actions.saveProfile({
        jurisdictionId: "us-wa-seattle",
        hourlyRate: 20,
        onboarded: true,
      });
      await result.current.actions.addVersion({
        ...week,
        postedAt: "2026-11-01T17:00:00.000Z",
        shifts: [{ id: "a", start: "2026-11-16T09:00", end: "2026-11-16T17:00" }],
      });
      await result.current.actions.addVersion({
        ...week,
        periodEnd: "2026-11-16",
        postedAt: "2026-11-15T17:00:00.000Z",
        shifts: [],
      });
    });
    const key = result.current.evaluation!.findings[0]!.key;
    await act(async () => {
      await result.current.actions.setException(key, "employee-requested");
    });
    expect(result.current.evaluation!.findings[0]!.status).toBe("excepted");
    expect(result.current.evaluation!.totalCents).toBe(0);
    await act(async () => {
      await result.current.actions.setException(key, null);
    });
    expect(result.current.evaluation!.totalCents).toBe(8000);
  });

  it("backs up and restores everything, including images", async () => {
    const { result } = await setup();
    // Browsers store Blobs in IndexedDB natively. Under jsdom, fake-indexeddb can
    // only clone Node's own Blob, so use that here.
    const image = new NodeBlob([new Uint8Array([137, 80, 78, 71])], {
      type: "image/png",
    }) as unknown as Blob;
    await act(async () => {
      await result.current.actions.saveProfile({
        jurisdictionId: "us-wa-seattle",
        onboarded: true,
        workerName: "Ana",
      });
      await result.current.actions.addVersion({
        ...week,
        postedAt: "2026-11-01T17:00:00.000Z",
        shifts: [],
        image,
        ocrText: "Mon 9-5",
      });
    });
    const v = result.current.data.versions[0]!;
    expect(v.imageHash).toMatch(/^[0-9a-f]{64}$/);

    const backup = await createBackup(result.current.data, true);
    expect(backup.images).toHaveLength(1);
    const parsed = parseBackup(JSON.stringify(backup));

    await act(async () => {
      await result.current.actions.clearAll();
    });
    expect(result.current.data.versions).toHaveLength(0);

    await act(async () => {
      await result.current.actions.replaceAll(parsed.data, parsed.images);
    });
    expect(result.current.data.profile?.workerName).toBe("Ana");
    expect(result.current.data.versions[0]!.hash).toBe(v.hash);
    expect(result.current.data.audit.at(-1)?.action).toBe("data.imported");
  });

  it("rejects files that are not backups", () => {
    expect(() => parseBackup("{}")).toThrow(/Not a Shiftowed backup/);
    expect(() =>
      parseBackup(
        JSON.stringify({ format: "shiftowed-backup", version: 1, data: { versions: [{ id: 1 }] } }),
      ),
    ).toThrow(/invalid schedules/);
  });
});
