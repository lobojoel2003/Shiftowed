import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { addDays, mondayOf, onboard, todayIn } from "./helpers";

test("a Seattle worker records a schedule, a cut shift, and exports evidence", async ({ page }) => {
  const monday = mondayOf(todayIn());
  await onboard(page, "Seattle, Washington", "20", monday);
  await expect(page.getByTestId("period-total")).toHaveText("$0.00");

  // 1. Type in the posted schedule (posted 20 days ahead, so it is on time).
  await page.getByRole("link", { name: "Add schedule" }).first().click();
  await page.getByRole("link", { name: /Type it in/ }).click();
  await page.getByTestId("period-start").fill(monday);
  await page.getByTestId("period-end").fill(addDays(monday, 6));
  await page.getByTestId("posted-at").fill(`${addDays(monday, -20)}T10:00`);

  const days = page.getByTestId("shift-editor").locator(".editor-day");
  await days.nth(0).getByRole("button", { name: "Add shift" }).click(); // Mon 9-5 (default)
  await days.nth(2).getByRole("button", { name: "Add shift" }).click(); // Wed
  await days.nth(2).getByLabel("Start").fill("16:00");
  await days.nth(2).getByLabel("End").fill("23:00");
  await days.nth(3).getByRole("button", { name: "Add shift" }).click(); // Thu
  await days.nth(3).getByLabel("Start").fill("07:00");
  await days.nth(3).getByLabel("End").fill("13:00");
  await expect(page.getByTestId("draft-shift")).toHaveCount(3);
  await page.getByTestId("save-version").click();

  // Wednesday 11 PM to Thursday 7 AM is 8 hours of rest: 2 hours inside the
  // 10-hour window at half-time extra on $20 = $20.
  await expect(page.getByTestId("period-total")).toHaveText("$20.00");

  // 2. Monday's shift is cut to 1 PM, announced the evening before.
  await page.getByRole("link", { name: "Schedule", exact: true }).click();
  await page.locator(".shift-pill").first().click();
  await page.getByRole("button", { name: "Sent home early or hours cut" }).click();
  await page.getByTestId("change-end").fill("13:00");
  await page.getByLabel("When were you told?").fill(`${addDays(monday, -1)}T18:00`);
  await page.getByTestId("save-change").click();

  // 4 lost hours x half-time x $20 = $40, plus the $20 rest premium.
  await expect(page.getByTestId("period-total")).toHaveText("$60.00");
  await expect(page.getByTestId("finding")).toHaveCount(2);

  // 3. The citation is right there, and an exception removes the premium.
  await page.getByRole("link", { name: "Hours cut" }).click();
  await expect(page.getByText("SMC 14.22.050.A.2").first()).toBeVisible();
  await page.getByLabel("I asked for this change").check();
  await page.getByRole("link", { name: "Back" }).click();
  await expect(page.getByTestId("period-total")).toHaveText("$20.00");

  // 4. Export the evidence.
  await page.getByRole("button", { name: "Export evidence" }).click();
  await expect(page.getByTestId("export-summary")).toContainText("$20.00");
  const [csvDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-csv").click(),
  ]);
  const csv = await readFile((await csvDownload.path())!, "utf8");
  expect(csv).toContain("shift_date,type,change");
  expect(csv).toContain("SMC 14.22.035.B");
  expect(csv).toContain("excepted");

  const [pdfDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("export-pdf").click(),
  ]);
  expect(pdfDownload.suggestedFilename()).toMatch(
    /^shiftowed-evidence-us-wa-seattle-\d{4}-\d{2}-\d{2}\.pdf$/,
  );
  const pdf = await readFile((await pdfDownload.path())!);
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.length).toBeGreaterThan(5_000);
});

test("main screens have no serious accessibility violations", async ({ page }) => {
  await onboard(page, "Oregon (statewide)", "18", mondayOf(todayIn()));
  for (const hash of ["#/owed", "#/schedule", "#/add", "#/law", "#/settings"]) {
    await page.goto(`/${hash}`);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, `${hash}: ${serious.map((v) => `${v.id}: ${v.help}`).join("; ")}`).toEqual([]);
  }
});

test("Spanish interface", async ({ page }) => {
  await onboard(page, "Oregon (statewide)", "18", mondayOf(todayIn()));
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Español" }).click();
  await expect(page.getByRole("heading", { name: "Ajustes" })).toBeVisible();
  await page.getByRole("link", { name: "Me deben", exact: true }).click();
  await expect(page.getByText("Te deben", { exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
});

test("build number and version are shown", async ({ page }) => {
  await onboard(page, "Oregon (statewide)", "18", mondayOf(todayIn()));
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByTestId("build-info")).toContainText(/v\d+\.\d+\.\d+/);
});

test("no screen scrolls sideways, in English or Spanish", async ({ page }) => {
  await onboard(page, "Oregon (statewide)", "18", mondayOf(todayIn()));
  for (const language of ["English", "Español"]) {
    await page.goto("/#/settings");
    await page.getByRole("button", { name: language }).click();
    for (const hash of [
      "#/owed",
      "#/schedule",
      "#/add",
      "#/add/type",
      "#/add/scan",
      "#/law",
      "#/settings",
      "#/export",
    ]) {
      await page.goto(`/${hash}`);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${language} ${hash}`).toBeLessThanOrEqual(0);
    }
  }
});

test("sample data shows every NYC premium tier", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore with sample data" }).click();
  await expect(page.getByTestId("period-total")).toHaveText("$250.00");
  await expect(page.getByTestId("finding")).toHaveCount(6);
  await page.getByRole("link", { name: "Shift cancelled" }).click();
  await expect(page.getByText("NYC Admin. Code § 20-1222(a)(4)").first()).toBeVisible();
  await expect(page.getByText(/counted to the first day of the work schedule/)).toBeVisible();
});
