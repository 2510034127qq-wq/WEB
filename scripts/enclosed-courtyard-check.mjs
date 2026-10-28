import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { newState, newPiece, STATIONS } from "../src/simulation/model.ts";

const prefix = process.env.QA_PREFIX || "enclosed-current",
  checks = [],
  errors = [],
  requests = [];
const browser = await chromium.launch({
  channel: "chrome",
  headless: process.env.QA_HEADED !== "1",
});
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  serviceWorkers: "allow",
});
context.on("request", (r) => requests.push(r.url()));
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
function check(name, passed) {
  checks.push({ name, passed: !!passed });
  assert(passed, name);
}
async function fixture(state) {
  await page.locator('[data-act="settings"]').click();
  const download = page.waitForEvent("download");
  await page
    .locator("#import")
    .setInputFiles({
      name: "enclosed-fixture.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(state)),
    });
  await download;
  await page.waitForFunction(() => window.__YAOHUO__.view().modal === "");
  await page.waitForTimeout(1800);
}
const read = () =>
  page.evaluate(() => ({
    state: window.__YAOHUO__.snapshot(),
    view: window.__YAOHUO__.view(),
    stats: window.__YAOHUO__.stats(),
  }));
let report = {};
try {
  await page.goto(process.env.QA_URL || "http://127.0.0.1:5191/");
  await page.waitForFunction(() => window.__YAOHUO__, null, {
    timeout: 120000,
  });
  await page.locator("#start").click();
  const meshes = await page.evaluate(() => ({
    gate: window.__YAOHUO__.inspectMeshes("closed_gate_"),
    forest: window.__YAOHUO__.inspectMeshes("woodland"),
  }));
  check("closed gate loads all four material groups", meshes.gate.length === 4);
  check("exterior woodland is absent", meshes.forest.length === 0);
  check(
    "forest and terrain assets are never requested",
    !requests.some((u) =>
      /woodland-pine|\/terrain\/|\/vegetation\/|\/scans\/(fern_02|grass_|shrub_03|tree_stump_01)/.test(
        u,
      ),
    ),
  );
  const s = newState();
  s.player = [2.15, 1.65, 6.7];
  s.yaw = Math.PI;
  await fixture(s);
  await page.keyboard.down("KeyW");
  await page.keyboard.down("ShiftLeft");
  await page.waitForTimeout(2800);
  await page.keyboard.up("KeyW");
  await page.keyboard.up("ShiftLeft");
  const blocked = await read();
  check(
    "closed gate blocks walking and running",
    blocked.state.player[2] > 7.1 && blocked.state.player[2] < 7.6,
  );
  check(
    "player remains on the courtyard floor",
    blocked.state.player[1] > 1.5 && blocked.state.player[1] < 1.8,
  );
  await page.screenshot({ path: `qa/${prefix}-collision.png` });
  const legacy = newState();
  legacy.player = [0, 1.65, 12.5];
  await fixture(legacy);
  const restored = await read();
  check(
    "legacy exterior saves restore inside the side aisle",
    Math.abs(restored.state.player[0] - 2.15) < 0.1 &&
      restored.state.player[2] < 7.4,
  );
  const packed = newState(),
    p = newPiece("vase", 1),
    display = STATIONS.find((s) => s.id === "display");
  Object.assign(p, {
    stage: "packed",
    location: "display",
    position: display.pos,
    name: "闭院回归留影",
  });
  packed.pieces = [p];
  packed.activeId = p.id;
  packed.player = display.approach;
  await fixture(packed);
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(2000);
  await page.locator("#work details summary").click();
  const photo = page.waitForEvent("download");
  await page.locator('[data-act="photo"]').click();
  const downloaded = await photo;
  const photoPath = `qa/${prefix}-photo.png`;
  await downloaded.saveAs(photoPath);
  const bytes = await fs.readFile(photoPath);
  check(
    "photo export captures the unpreserved framebuffer",
    bytes.length > 100000 &&
      bytes.readUInt32BE(16) === 1920 &&
      bytes.readUInt32BE(20) === 1080,
  );
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.waitForFunction(
    async () => {
      const keys = (await caches.keys()).filter((k) => k.startsWith("yaohuo-"));
      if (keys.length !== 1) return false;
      const cache = await caches.open(keys[0]);
      const assets = performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .filter((u) => new URL(u).pathname.startsWith("/assets/"));
      return (
        await Promise.all(assets.map((u) => cache.match(new URL(u).pathname)))
      ).every(Boolean);
    },
    null,
    { timeout: 30000 },
  );
  report.cache = await page.evaluate(async () => {
    const key = (await caches.keys()).find((k) => k.startsWith("yaohuo-")),
      cache = await caches.open(key),
      keys = await cache.keys();
    return {
      name: key,
      entries: keys.length,
      forest: keys.some((r) =>
        /woodland-pine|\/terrain\/|\/vegetation\//.test(r.url),
      ),
    };
  });
  check(
    "offline cache contains no removed exterior assets",
    !report.cache.forest,
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => document.querySelector("#save-status").textContent.includes("已保存"),
    null,
    { timeout: 10000 },
  );
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.__YAOHUO__, null, {
    timeout: 120000,
  });
  await page.locator("#start").click();
  const offline = await read();
  check(
    "offline reload restores the saved ceramic",
    offline.state.pieces.some((q) => q.id === p.id),
  );
  check(
    "offline reload restores the closed gate",
    await page.evaluate(
      () => window.__YAOHUO__.inspectMeshes("closed_gate_").length === 4,
    ),
  );
  await page.screenshot({ path: `qa/${prefix}-offline.png` });
  report = { ...report, blocked, restored, offline, photoBytes: bytes.length };
} catch (e) {
  errors.push(e.stack);
  process.exitCode = 1;
} finally {
  await context.setOffline(false);
  await browser.close();
  await fs.writeFile(
    `qa/${prefix}.json`,
    JSON.stringify(
      {
        checks,
        errors,
        ...report,
        requestedFiles: [...new Set(requests.map((u) => new URL(u).pathname))],
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      { checks, errors, cache: report.cache, photoBytes: report.photoBytes },
      null,
      2,
    ),
  );
}
if (errors.length) process.exitCode = 1;
