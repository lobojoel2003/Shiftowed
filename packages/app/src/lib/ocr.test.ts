import { describe, expect, it } from "vitest";
import { wordsToRows } from "./ocr";

describe("wordsToRows", () => {
  it("keeps a small dash on the same row as the times around it", () => {
    const rows = wordsToRows([
      { text: "9:00", x0: 0, x1: 40, y0: 100, y1: 120 },
      { text: "AM", x0: 45, x1: 70, y0: 100, y1: 120 },
      { text: "-", x0: 76, x1: 82, y0: 109, y1: 111 },
      { text: "5:00", x0: 88, x1: 128, y0: 100, y1: 120 },
      { text: "PM", x0: 133, x1: 158, y0: 100, y1: 120 },
      { text: "Mon,", x0: 0, x1: 40, y0: 60, y1: 80 },
      { text: "Nov", x0: 45, x1: 75, y0: 60, y1: 80 },
      { text: "16", x0: 80, x1: 98, y0: 60, y1: 80 },
    ]);
    expect(rows.map((r) => r.text)).toEqual(["Mon, Nov 16", "9:00 AM - 5:00 PM"]);
    expect(rows[1]!.words![2]).toEqual({ text: "-", x0: 76, x1: 82 });
  });

  it("puts grid columns back on one row, left to right", () => {
    const rows = wordsToRows([
      { text: "Tue", x0: 200, x1: 230, y0: 10, y1: 30 },
      { text: "Mon", x0: 10, x1: 40, y0: 12, y1: 31 },
      { text: "4p-10p", x0: 200, x1: 260, y0: 50, y1: 70 },
      { text: "9a-5p", x0: 10, x1: 60, y0: 51, y1: 69 },
    ]);
    expect(rows.map((r) => r.text)).toEqual(["Mon Tue", "9a-5p 4p-10p"]);
  });
});
