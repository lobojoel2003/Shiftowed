import { expect, type Page } from "@playwright/test";

export const TZ = "America/Los_Angeles";

export function todayIn(tz = TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function mondayOf(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((dow + 6) % 7));
}

/** Finish onboarding for a jurisdiction with an hourly rate and weekly pay periods. */
export async function onboard(
  page: Page,
  lawName: string,
  rate: string,
  weekStart: string,
): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByText(lawName, { exact: true }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Regular hourly rate").fill(rate);
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Weekly" }).click();
  await page.getByLabel("First day of a recent pay period").fill(weekStart);
  await page.getByRole("button", { name: "Start tracking" }).click();
  await expect(page.getByText("You're owed", { exact: true })).toBeVisible();
}
