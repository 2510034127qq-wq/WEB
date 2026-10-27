import fs from "node:fs/promises";
import { chromium } from "@playwright/test";
import { STATIONS } from "../src/simulation/model.ts";
const prefix = process.env.QA_PREFIX || "paint-current";
const browser = await chromium.launch({ channel: "chrome", headless: true }),
  context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    serviceWorkers: "block",
  }),
  page = await context.newPage(),
  errors = [],
  results = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://127.0.0.1:5191/");
  await page.waitForFunction(() => window.__YAOHUO__, null, {
    timeout: 120000,
  });
  await page.locator("#start").click();
  const report = JSON.parse(
      await fs.readFile(
        process.env.QA_REFERENCE || "qa/reference-r44.json",
        "utf8",
      ),
    ),
    s = report.observations.find((o) => o.phase === "sculpt").after.state,
    p = s.pieces[0];
  Object.assign(p, {
    stage: "trimmed",
    location: "paint",
    position: STATIONS.find((s) => s.id === "paint").pos,
  });
  s.player = STATIONS.find((s) => s.id === "paint").approach;
  await page.locator('[data-act="settings"]').click();
  const dl = page.waitForEvent("download");
  await page
    .locator("#import")
    .setInputFiles({
      name: "paint.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(s)),
    });
  await dl;
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(2500);
  const c = await page.locator("#paint-map").boundingBox(),
    cdp = await context.newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.start");
  for (const mode of ["idle", "painting"]) {
    const frames = page.evaluate(
      () =>
        new Promise((resolve) => {
          const a = [];
          let start = 0,
            last = 0;
          function f(t) {
            if (!start) start = t;
            if (last) a.push(t - last);
            last = t;
            if (t - start < 7000) requestAnimationFrame(f);
            else resolve(a);
          }
          requestAnimationFrame(f);
        }),
    );
    if (mode === "painting")
      for (let j = 0; j < 4; j++) {
        await page.mouse.move(c.x + 40, c.y + 80 + j * 70);
        await page.mouse.down();
        for (let i = 0; i < 65; i++) {
          await page.mouse.move(
            c.x + 40 + i * 4.5,
            c.y + 80 + j * 70 + Math.sin(i / 10) * 10,
          );
          await page.waitForTimeout(16);
        }
        await page.mouse.up();
      }
    const a = await frames,
      sorted = [...a].sort((a, b) => a - b),
      mean = a.reduce((a, b) => a + b, 0) / a.length;
    results.push({
      mode,
      fps: 1000 / mean,
      p95: sorted[Math.floor(sorted.length * 0.95)],
      frames: a,
    });
    console.log(mode, 1000 / mean, sorted[Math.floor(sorted.length * 0.95)]);
  }
  const { profile } = await cdp.send("Profiler.stop");
  const nodes = new Map(profile.nodes.map((n) => [n.id, n])),
    costs = new Map();
  profile.samples.forEach((id, i) => {
    const n = nodes.get(id),
      name = n.callFrame.functionName + " " + n.callFrame.url;
    costs.set(name, (costs.get(name) || 0) + profile.timeDeltas[i] / 1000);
  });
  results.push({ cpuTop: [...costs].sort((a, b) => b[1] - a[1]).slice(0, 20) });
  await page.screenshot({ path: `qa/${prefix}.png` });
} catch (e) {
  errors.push(e.stack);
  process.exitCode = 1;
} finally {
  await browser.close();
  await fs.writeFile(
    `qa/${prefix}.json`,
    JSON.stringify({ errors, results }, null, 2),
  );
  console.log(JSON.stringify({ errors, cpu: results.at(-1) }, null, 2));
}
