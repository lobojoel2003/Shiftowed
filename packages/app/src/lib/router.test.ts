import { describe, expect, it } from "vitest";
import { href, parseHash, type Route } from "./router";

describe("router", () => {
  it("round-trips every route", () => {
    const routes: Route[] = [
      { name: "owed" },
      { name: "schedule" },
      { name: "welcome" },
      { name: "add" },
      { name: "add", mode: "scan" },
      { name: "add", mode: "change", shiftId: "s_1" },
      { name: "add", mode: "type", versionId: "v_9" },
      { name: "finding", key: "v2:a>b" },
      { name: "version", id: "v_1" },
      { name: "law" },
      { name: "settings" },
      { name: "export" },
    ];
    for (const r of routes) expect(parseHash(href(r))).toEqual(r);
  });

  it("falls back to the owed screen", () => {
    expect(parseHash("")).toEqual({ name: "owed" });
    expect(parseHash("#/nope")).toEqual({ name: "owed" });
    expect(parseHash("#/add/bogus")).toEqual({ name: "add" });
  });
});
