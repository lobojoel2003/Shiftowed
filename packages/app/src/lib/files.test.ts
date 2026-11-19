import { describe, expect, it } from "vitest";
import { base64ToBlob, blobToBase64, fileStamp } from "./files";
import { pdfText } from "./exportPdf";

describe("files", () => {
  it("round-trips base64", async () => {
    const blob = new Blob([new Uint8Array([0, 1, 2, 250, 255])], { type: "image/png" });
    const b64 = await blobToBase64(blob);
    const back = base64ToBlob(b64, "image/png");
    expect(new Uint8Array(await back.arrayBuffer())).toEqual(new Uint8Array([0, 1, 2, 250, 255]));
    expect(back.type).toBe("image/png");
  });

  it("stamps file names by local date", () => {
    expect(fileStamp("America/Los_Angeles", new Date("2026-11-20T03:00:00Z"))).toBe("2026-11-19");
  });

  it("keeps PDF text inside the standard font's character set", () => {
    const narrowSpace = String.fromCharCode(0x202f);
    const enDash = String.fromCharCode(0x2013);
    const arrow = String.fromCharCode(0x2192);
    const emoji = String.fromCodePoint(0x1f600);
    expect(pdfText(`3:14${narrowSpace}PM ${enDash} 5 PM ${arrow} done ${emoji}`)).toBe(
      "3:14 PM - 5 PM -> done ??",
    );
    expect(pdfText("Español ñ")).toBe("Español ñ");
  });
});
