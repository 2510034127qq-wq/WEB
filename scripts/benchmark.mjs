import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [],
  errors = [],
  base = process.env.QA_URL || "http://127.0.0.1:4173/";
for (const quality of process.env.QA_QUALITIES?.split(',')||["high", "low"]) {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  const start = performance.now();
  await page.goto(base);
  await page.waitForFunction(() => window.__YAOHUO__, null, { timeout: 120000 });
  const readyMs = Math.round(performance.now() - start);
  const device = await page.evaluate(() => {
    const gl = document.querySelector("canvas").getContext("webgl2"),
      info = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      gpu: info
        ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER),
      ua: navigator.userAgent,
      transferBytes: performance
        .getEntriesByType("resource")
        .reduce((n, e) => n + e.transferSize, 0),
    };
  });
  await page.locator("#start").click();
  await page.locator('[data-act="settings"]').click();
  await page.locator("#quality").selectOption(quality);
  await page.locator('[data-act="close-modal"]').click();
  await page.waitForTimeout(2000);
  const measurement = page.evaluate(
    () =>
      new Promise((resolve) => {
        const frames = [];
        let last = 0,
          begin = 0;
        function sample(now) {
          if (!begin) begin = now;
          if (last) frames.push(now - last);
          last = now;
          if (now - begin < 12000) requestAnimationFrame(sample);
          else resolve(frames);
        }
        requestAnimationFrame(sample);
      }),
  );
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(1800);
  await page.keyboard.up("KeyW");
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(1600);
  await page.keyboard.up("KeyD");
  await page.mouse.move(900, 500);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(1250, 540, { steps: 100 });
  await page.mouse.up({ button: "right" });
  await page.waitForTimeout(1500);
  await page.mouse.move(950, 500);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(600, 460, { steps: 100 });
  await page.mouse.up({ button: "right" });
  await page.keyboard.down("KeyS");
  await page.waitForTimeout(1500);
  await page.keyboard.up("KeyS");
  const frames = await measurement,
    sorted = [...frames].sort((a, b) => a - b),
    at = (p) => sorted[Math.floor((sorted.length - 1) * p)],
    avg = frames.reduce((a, b) => a + b, 0) / frames.length;
  await page.screenshot({ path: `qa/${process.env.QA_PREFIX||'1080p-v03'}-${quality}.png` });
  results.push({
    quality,
    readyMs,
    ...device,
    samples: frames.length,
    averageFps: +(1000 / avg).toFixed(2),
    medianFrameMs: +at(0.5).toFixed(2),
    p95FrameMs: +at(0.95).toFixed(2),
    p99FrameMs: +at(0.99).toFixed(2),
    over33msPercent: +(
      (frames.filter((v) => v > 33.4).length / frames.length) *
      100
    ).toFixed(2),
    framesMs:frames,
    stats: await page.evaluate(() => window.__YAOHUO__.stats()),
  });
  await context.close();
}
await fs.writeFile(
  process.env.QA_REPORT||"qa/performance.json",
  JSON.stringify(
    {
      date: new Date().toISOString(),
      browser: browser.version(),
      cpu: os.cpus()[0].model,
      memoryGiB: Math.round(os.totalmem() / 2 ** 30),
      resolution: "1920 x 1080",
      pixelRatio: 1,
      recording: false,
      method:
        "Fresh Chrome context per quality, local HTTP, two-second warmup, 12-second identical WASD/right-drag route; no video capture.",
      errors,
      results,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(results, null, 2));
await browser.close();
if (errors.length) process.exitCode = 1;
