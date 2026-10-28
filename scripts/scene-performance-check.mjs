import fs from "node:fs/promises";
import { chromium } from "@playwright/test";
import { newState, newPiece, STATIONS } from "../src/simulation/model.ts";

const prefix = process.env.QA_PREFIX || "scene-perf-current";
const viewport = {
  width: Number(process.env.QA_WIDTH || 2560),
  height: Number(process.env.QA_HEIGHT || 1600),
};
const dpr = Number(process.env.QA_DPR || 1),
  seconds = Number(process.env.QA_SECONDS || 7);
const browser = await chromium.launch({
  channel: "chrome",
  headless: process.env.QA_HEADED !== "1",
});
const context = await browser.newContext({
  viewport,
  deviceScaleFactor: dpr,
  serviceWorkers: "block",
});
const page = await context.newPage(),
  errors = [],
  results = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
let device;
try {
  await page.goto(process.env.QA_URL || "http://127.0.0.1:5191/");
  await page.waitForFunction(() => window.__YAOHUO__, null, {
    timeout: 120000,
  });
  await page.locator("#start").click();
  device = await page.evaluate(() => {
    const gl = document.querySelector("#world canvas").getContext("webgl2"),
      ext = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      ua: navigator.userAgent,
      gpu: ext
        ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER),
      viewport: [innerWidth, innerHeight],
      dpr: devicePixelRatio,
      scripts: [...document.scripts].map((s) => s.src),
    };
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Profiler.enable");
  for (const name of (
    process.env.QA_SCENES || "courtyard,gate,wheel,glaze"
  ).split(",")) {
    const s = newState();
    s.settings.quality = "high";
    s.player = name === "gate" ? [2.15, 1.65, 6.7] : [0, 1.65, 1.4];
    s.yaw = name === "gate" ? 2.2 : 0;
    const station = STATIONS.find((s) => s.id === name);
    if (station) {
      const p = newPiece("vase", 1);
      Object.assign(p, {
        stage: name === "glaze" ? "painted" : "thrown",
        opened: true,
        preparation: 1,
        air: 0.04,
        location: name,
        position: station.pos,
      });
      s.pieces = [p];
      s.activeId = p.id;
      s.player = station.approach;
    }
    await page.locator('[data-act="settings"]').click();
    const download = page.waitForEvent("download");
    await page
      .locator("#import")
      .setInputFiles({
        name: "performance-fixture.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(s)),
      });
    await download;
    if (station) await page.keyboard.press("KeyE");
    await page.waitForTimeout(3500);
    const view = await page.evaluate(() => window.__YAOHUO__.view());
    if (view.camera[1] < 0.5)
      throw new Error(`Invalid ${name} fixture: camera below ground`);
    const largeMeshes = await page.evaluate(() =>
      window.__YAOHUO__
        .inspectMeshes("")
        .sort((a, b) => b.vertices * b.instances - a.vertices * a.instances)
        .slice(0, 24)
        .map((m) => ({
          name: m.name,
          vertices: m.vertices,
          instances: m.instances,
          position: m.position,
        })),
    );
    await cdp.send("Profiler.start");
    const start = await page.evaluate(() => window.__YAOHUO__.stats());
    const frames = await page.evaluate(
      (seconds) =>
        new Promise((resolve) => {
          const frames = [];
          let begin = 0,
            last = 0;
          function sample(t) {
            if (!begin) begin = t;
            if (last) frames.push(t - last);
            last = t;
            if (t - begin < seconds * 1000) requestAnimationFrame(sample);
            else resolve(frames);
          }
          requestAnimationFrame(sample);
        }),
      seconds,
    );
    const { profile } = await cdp.send("Profiler.stop");
    const nodes = new Map(profile.nodes.map((n) => [n.id, n])),
      costs = new Map();
    profile.samples?.forEach((id, i) => {
      const f = nodes.get(id).callFrame,
        key = `${f.functionName || "(anonymous)"} @ ${f.url}:${f.lineNumber + 1}`;
      costs.set(key, (costs.get(key) || 0) + (profile.timeDeltas[i] || 0));
    });
    const sorted = [...frames].sort((a, b) => a - b),
      avg = frames.reduce((a, b) => a + b, 0) / frames.length;
    const result = {
      name,
      start,
      end: await page.evaluate(() => window.__YAOHUO__.stats()),
      fps: 1000 / avg,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      over33ms: frames.filter((t) => t > 33.5).length,
      frames,
      cpuTop: [...costs]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 16)
        .map(([name, micros]) => ({ name, ms: micros / 1000 })),
    };
    result.view = view;
    result.largeMeshes = largeMeshes;
    results.push(result);
    await page.screenshot({ path: `qa/${prefix}-${name}.png` });
    await fs.writeFile(
      `.tmp/${prefix}-${name}.cpuprofile`,
      JSON.stringify(profile),
    );
    console.log(
      JSON.stringify(
        {
          ...result,
          frames: undefined,
          largeMeshes: undefined,
          view: undefined,
        },
        null,
        2,
      ),
    );
    if (station) await page.keyboard.press("Escape");
  }
} catch (e) {
  errors.push(e.stack);
  process.exitCode = 1;
} finally {
  await fs.writeFile(
    `qa/${prefix}.json`,
    JSON.stringify(
      {
        device,
        recording: false,
        method:
          "Public JSON fixtures; same stationary views at requested CSS viewport and DPR; Chrome CPU profiler; native display resolution 2560x1600. No video encoding.",
        errors,
        results,
      },
      null,
      2,
    ),
  );
  await browser.close();
}
if (errors.length) {
  console.error(errors);
  process.exitCode = 1;
}
