#!/usr/bin/env node
/**
 * Regenerate the README screenshots from the app's sample data.
 *   npm run build && npm run screenshots
 * Starts `vite preview`, loads the sample data and captures each screen at 2x.
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { root } from "./workspace.mjs";

const PORT = 4180;
const BASE = `http://localhost:${PORT}`;
const out = join(root, "docs", "images");
mkdirSync(out, { recursive: true });

const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
  cwd: join(root, "packages", "app"),
  stdio: "ignore",
});

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("preview server did not start");
}

try {
  await waitForServer();
  const browser = await chromium.launch();

  for (const scheme of ["light", "dark"]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      colorScheme: scheme,
      locale: "en-US",
      timezoneId: "America/New_York",
    });
    const page = await context.newPage();
    const shot = async (name, opts = {}) => {
      await page.waitForTimeout(350);
      await page.screenshot({
        path: join(out, `${name}${scheme === "dark" ? "-dark" : ""}.png`),
        ...opts,
      });
      console.log(`docs/images/${name}${scheme === "dark" ? "-dark" : ""}.png`);
    };

    await page.goto(BASE);
    if (scheme === "light") await shot("welcome");
    await page.getByRole("button", { name: "Explore with sample data" }).click();
    await page.getByTestId("period-total").waitFor();
    await shot("owed");

    if (scheme === "light") {
      await page.getByRole("link", { name: "Shift cancelled" }).first().click();
      await page.getByText("How much notice you got").waitFor();
      await shot("finding");

      await page.goto(`${BASE}/#/schedule`);
      await shot("schedule");

      await page.goto(`${BASE}/#/add`);
      await shot("add");

      await page.goto(`${BASE}/#/add/type`);
      await page.getByTestId("shift-editor").waitFor();
      await shot("review");

      await page.goto(`${BASE}/#/law`);
      await shot("law");

      await page.goto(`${BASE}/#/export`);
      await shot("export");
    }
    await context.close();
  }

  // Evidence PDF preview (needs pdftoppm from poppler-utils; skipped otherwise).
  {
    const context = await browser.newContext({
      acceptDownloads: true,
      timezoneId: "America/New_York",
    });
    const page = await context.newPage();
    await page.goto(BASE);
    await page.getByRole("button", { name: "Explore with sample data" }).click();
    await page.getByTestId("period-total").waitFor();
    await page.goto(`${BASE}/#/export`);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("export-pdf").click(),
    ]);
    const pdf = join(tmpdir(), "shiftowed-evidence-sample.pdf");
    await download.saveAs(pdf);
    try {
      execFileSync("pdftoppm", [
        "-r",
        "110",
        "-png",
        "-f",
        "1",
        "-l",
        "1",
        "-singlefile",
        pdf,
        join(out, "evidence-pdf"),
      ]);
      console.log("docs/images/evidence-pdf.png");
    } catch {
      console.warn("pdftoppm not found; skipped docs/images/evidence-pdf.png");
    }
    await context.close();
  }

  // Banner: logo, tagline and three screens. Also used as the GitHub social preview.
  {
    const img = (name) =>
      `data:image/png;base64,${readFileSync(join(out, `${name}.png`)).toString("base64")}`;
    const logo = `data:image/svg+xml;base64,${readFileSync(join(root, "packages/app/public/favicon.svg")).toString("base64")}`;
    const page = await browser.newPage({
      viewport: { width: 1280, height: 640 },
      deviceScaleFactor: 2,
    });
    await page.setContent(`<!doctype html><html><body style="margin:0;width:1280px;height:640px;overflow:hidden;
      font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;
      background:radial-gradient(900px 500px at 0% 0%,#1bb38d 0%,transparent 60%),linear-gradient(135deg,#0b6e5b,#064236);color:#fff">
      <div style="position:absolute;left:72px;top:150px;width:470px">
        <div style="display:flex;align-items:center;gap:18px"><img src="${logo}" width="76" height="76" style="border-radius:20px;box-shadow:0 10px 30px rgba(0,0,0,.25)">
        <div style="font-size:56px;font-weight:800;letter-spacing:-1.5px">Shiftowed</div></div>
        <div style="font-size:30px;font-weight:700;line-height:1.25;margin-top:28px">Get paid for every last-minute schedule change.</div>
        <div style="font-size:19px;line-height:1.5;margin-top:18px;opacity:.88">Fair Workweek predictability pay for hourly workers. Snap your schedule, track every change, export dated evidence. A citation next to every dollar.</div>
        <div style="display:flex;gap:10px;margin-top:26px;flex-wrap:wrap">${[
          "12 laws",
          "On-device OCR",
          "Offline PWA",
          "English + Español",
        ]
          .map(
            (t) =>
              `<span style="background:rgba(255,255,255,.16);padding:7px 14px;border-radius:999px;font-weight:650;font-size:15px">${t}</span>`,
          )
          .join("")}</div>
      </div>
      ${[
        ["owed", 568, 78, -4],
        ["finding", 798, 44, 0],
        ["law", 1022, 78, 4],
      ]
        .map(
          ([
            name,
            x,
            y,
            rot,
          ]) => `<img src="${img(name)}" style="position:absolute;left:${x}px;top:${y}px;width:226px;border-radius:28px;
            border:7px solid #0d1f1a;box-shadow:0 24px 60px rgba(0,0,0,.4);transform:rotate(${rot}deg)">`,
        )
        .join("")}
    </body></html>`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(out, "banner.png") });
    console.log("docs/images/banner.png");
    // 1280x640 and under 1 MB, for Settings > General > Social preview on GitHub.
    const banner = `data:image/png;base64,${readFileSync(join(out, "banner.png")).toString("base64")}`;
    const small = await browser.newPage({
      viewport: { width: 1280, height: 640 },
      deviceScaleFactor: 1,
    });
    await small.setContent(
      `<body style="margin:0"><img src="${banner}" width="1280" height="640"></body>`,
    );
    await small.screenshot({ path: join(out, "social-preview.jpg"), type: "jpeg", quality: 90 });
    await small.close();
    console.log("docs/images/social-preview.jpg");
    await page.close();
  }
  await browser.close();
} finally {
  server.kill();
}
