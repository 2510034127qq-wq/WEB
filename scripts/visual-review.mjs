import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
process.env.PLAYWRIGHT_BROWSERS_PATH = fileURLToPath(
  new URL("../.tmp/playwright", import.meta.url),
);
const { chromium } = await import("@playwright/test");
await fs.mkdir("qa/review", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: "qa/video", size: { width: 1440, height: 900 } },
});
const page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const act = (name) => page.locator(`[data-act="${name}"]`).click();
const shot = (name) => page.screenshot({ path: `qa/review/${name}-v04.png` });
const source = JSON.parse(
  await fs.readFile("qa/exports/workshop.json", "utf8"),
);
async function replay(station, stage, form = "bowl") {
  const s = structuredClone(source),
    p = s.pieces.find((q) => q.form === form);
  s.activeId = p.id;
  s.held = null;
  s.yaw = 0;
  const positions = {
      wheel: [0, 0.78, -5.6],
      paint: [5.4, 0.96, -5.6],
      glaze: [7.2, 0.95, -0.2],
      kiln: [5.9, 0.45, 4.65],
      display: [0, 0.96, 5.8],
    },
    approaches = {
      wheel: [0, 1.65, -3.9],
      paint: [5.4, 1.65, -3.8],
      glaze: [5.6, 1.65, -0.2],
      kiln: [6, 1.65, 2.75],
      display: [0, 1.65, 3.7],
    };
  p.location = station;
  p.position = positions[station];
  p.stage = stage;
  s.player = approaches[station];
  if (!["fired", "packed"].includes(stage)) {
    p.shrink = 1;
    p.glaze.fill(0);
    p.footClean = false;
  }
  if (stage === "thrown") {
    p.marks = [];
    p.moisture = 0.65;
  }
  if (station === "kiln") {
    p.heat = 0;
    s.kiln = {
      phase: "firing",
      temperature: 1040,
      fuel: 0.65,
      draft: 0.52,
      elapsed: 38,
      curve: [
        [0, 24],
        [38, 1040],
      ],
      assisted: true,
    };
  }
  await act("settings");
  const download = page.waitForEvent("download");
  await page
    .locator("#import")
    .setInputFiles({
      name: "documented-visual-replay.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(s)),
    });
  await download;
  await page.waitForFunction(() => window.__YAOHUO__.view().modal === "");
  await page.waitForTimeout(300);
  await page.keyboard.press("KeyE");
  await page.waitForFunction(
    (id) => window.__YAOHUO__.view().focus === id,
    station,
  );
  await page.waitForTimeout(1100);
}
try {
  await page.goto(process.env.QA_URL || "http://127.0.0.1:4173/");
  await page.waitForFunction(() => window.__YAOHUO__, null, { timeout: 60000 });
  await shot("01-intro");
  await page.locator("#start").click();
  await page.waitForTimeout(900);
  await shot("02-courtyard");
  await replay("wheel", "thrown");
  await shot("03-wet-clay-replay");
  const b = await page.evaluate(() => window.__YAOHUO__.view().pieceBounds);
  await page.mouse.move(b.x + b.w * 0.65, b.y + b.h * 0.6);
  await page.mouse.down();
  await page.mouse.move(b.x + b.w * 0.65 + 24, b.y + b.h * 0.6, { steps: 24 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  await replay("paint", "painted");
  const p = await page.evaluate(() => window.__YAOHUO__.view().pieceBounds);
  await page.mouse.move(p.x + p.w * 0.57, p.y + p.h * 0.76);
  await page.waitForTimeout(300);
  await shot("04-paint-replay");
  await page.mouse.wheel(0, 100);
  await page.waitForTimeout(600);
  await replay("glaze", "painted");
  const button = await page.locator('[data-hold="dip"]').boundingBox();
  await page.mouse.move(button.x + 50, button.y + 20);
  await page.mouse.down();
  await page.waitForTimeout(250);
  await shot("05-dip-lift-replay");
  await page.waitForTimeout(900);
  await shot("06-dip-submerged-replay");
  await page.mouse.up();
  await page.waitForTimeout(900);
  await replay("kiln", "loaded");
  await shot("07-kiln-replay");
  await page.waitForTimeout(1200);
  await replay("display", "fired", "vase");
  await shot("08-porcelain-replay");
  await act("rotate-right");
  await page.waitForTimeout(500);
  await act("pack");
  await page.waitForTimeout(2300);
  await shot("09-wrap-replay");
  await page.waitForTimeout(900);
  await act("unwrap");
  await act("collection");
  await shot("10-collection");
  await fs.writeFile(
    "qa/visual-review.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        browser: browser.version(),
        viewport: "1440 x 900",
        method:
          "Public JSON import of replay fixtures derived from the successful full playthrough. Stages and camera position are set for visual inspection only. This is not the full-loop acceptance test.",
        errors,
      },
      null,
      2,
    ),
  );
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("PASS final visual replay");
} finally {
  const video = page.video();
  await context.close();
  if (video) await video.saveAs("qa/review/visual-replay-v04.webm");
  await browser.close();
}
