import { expect, test, type Browser } from "@playwright/test";
import { addDays, mondayOf, onboard, todayIn } from "./helpers";

/** Render a schedule that looks like a scheduling app and return a PNG. */
async function scheduleScreenshot(browser: Browser, monday: string): Promise<Buffer> {
  const page = await browser.newPage({
    viewport: { width: 420, height: 640 },
    deviceScaleFactor: 2,
  });
  const fmt = (d: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(new Date(`${d}T00:00:00Z`));
  const rows: [string, string][] = [
    [fmt(monday), "9:00 AM - 5:00 PM"],
    [fmt(addDays(monday, 1)), "OFF"],
    [fmt(addDays(monday, 2)), "4:00 PM - 10:30 PM"],
    [fmt(addDays(monday, 4)), "11:00 AM - 7:00 PM"],
  ];
  await page.setContent(`<!doctype html><body style="font-family:Arial,sans-serif;margin:0;padding:24px;background:#fff;color:#111">
    <h2 style="margin:0 0 16px">My Shifts</h2>
    ${rows
      .map(
        ([d, t]) => `<div style="padding:12px 0;border-bottom:1px solid #ddd">
          <div style="font-weight:bold;font-size:20px">${d}</div>
          <div style="font-size:20px;margin-top:4px">${t}</div></div>`,
      )
      .join("")}
  </body>`);
  const png = await page.screenshot();
  await page.close();
  return png;
}

test("reads a schedule screenshot on the device", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const monday = mondayOf(todayIn());
  await onboard(page, "Seattle, Washington", "20", monday);
  const png = await scheduleScreenshot(browser, monday);

  await page.goto("/#/add/scan");
  await page
    .getByTestId("screenshot-input")
    .setInputFiles({ name: "schedule.png", mimeType: "image/png", buffer: png });
  await expect(page.getByTestId("shift-editor")).toBeVisible({ timeout: 90_000 });

  const shifts = page.getByTestId("draft-shift");
  await expect(shifts).toHaveCount(3);
  const times = await shifts.evaluateAll((els) =>
    els.map((el) =>
      Array.from(el.querySelectorAll("input"))
        .map((i) => (i as HTMLInputElement).value)
        .join("-"),
    ),
  );
  expect(times).toEqual(["09:00-17:00", "16:00-22:30", "11:00-19:00"]);
  await expect(page.getByTestId("period-start")).toHaveValue(monday);

  await page.getByTestId("save-version").click();
  await page.getByRole("link", { name: "Schedule", exact: true }).click();
  await page.getByRole("link", { name: /Version #1/ }).click();
  await expect(page.getByText("Screenshot fingerprint")).toBeVisible();
  await expect(page.getByAltText("Screenshot")).toBeVisible();
});
