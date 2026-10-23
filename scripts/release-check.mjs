import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
const base = process.env.QA_URL || "http://127.0.0.1:4173/";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage(),
  errors = [],
  checks = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const read = () => page.evaluate(() => window.__YAOHUO__.snapshot());
const act = (name) => page.locator(`[data-act="${name}"]`).click();
const ready = () =>
  page.waitForFunction(() => window.__YAOHUO__, null, { timeout: 60000 });
async function route(id, enter = true) {
  await act("map");
  await act("go-" + id);
  await page.waitForFunction(() => window.__YAOHUO__.view().nav === 0, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(900);
  if (enter) {
    await page.keyboard.press("KeyE");
    await page.waitForFunction(
      (id) => window.__YAOHUO__.view().focus === id,
      id,
    );
    await page.waitForTimeout(1000);
  }
}
async function aim(target) {
  for (let i = 0; i < 8; i++) {
    const v = await page.evaluate(() => window.__YAOHUO__.view()),
      dx = target[0] - v.camera[0],
      dy = target[1] - v.camera[1],
      dz = target[2] - v.camera[2],
      yaw = Math.atan2(-dx, -dz),
      pitch = Math.atan2(dy, Math.hypot(dx, dz));
    let delta = v.look.yaw - yaw;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    const mx = Math.max(-420, Math.min(420, delta / 0.002)),
      my = Math.max(-260, Math.min(260, (v.look.pitch - pitch) / 0.002));
    if (Math.abs(mx) + Math.abs(my) < 0.3) break;
    await page.mouse.move(720, 440);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(720 + mx, 440 + my, { steps: 8 });
    await page.mouse.up({ button: "right" });
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(350);
}
async function importData(data) {
  await act("settings");
  const download = page.waitForEvent("download");
  await page
    .locator("#import")
    .setInputFiles({
      name: "visual-replay.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(data)),
    });
  await download;
  await page.waitForFunction(() => window.__YAOHUO__.view().modal === "");
}
try {
  await page.goto(base);
  await ready();
  await page.locator("#start").click();
  await route("paint", false);
  await aim((await read()).props.brush);
  await page.keyboard.press("KeyE");
  expect((await read()).held).toBe("brush");
  checks.push("Actual ray-selected brush pickup");
  const player = (await read()).player;
  await aim([player[0] + 0.4, 0, player[2] - 0.5]);
  await page.keyboard.press("KeyQ");
  await page.waitForTimeout(1200);
  const dropped = (await read()).props.brush;
  expect((await read()).held).toBe(null);
  expect(dropped[1]).toBeLessThan(0.08);
  await page.screenshot({ path: "qa/13-prop-drop-v04.png" });
  await act("settings");
  await act("save");
  await page.reload();
  await ready();
  const restored = (await read()).props.brush;
  expect(Math.hypot(...restored.map((n, i) => n - dropped[i]))).toBeLessThan(
    0.03,
  );
  await page.locator("#start").click();
  checks.push("Dropped rigid-body tool settles on ground and survives reload");
  const pos = (await read()).player;
  await aim([pos[0], pos[1], pos[2] - 2]);
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(2700);
  await page.keyboard.up("KeyW");
  expect((await read()).player[2]).toBeGreaterThan(-4.9);
  checks.push("Character cannot walk through the painting workbench");
  const backup = JSON.parse(
    await fs.readFile("qa/exports/workshop.json", "utf8"),
  );
  await importData(backup);
  await act("collection");
  const vase = backup.pieces.find((p) => p.form === "vase");
  await act("view-" + vase.id);
  await page.waitForFunction(() => window.__YAOHUO__.view().nav === 0, null, {
    timeout: 30000,
  });
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(1300);
  await page.screenshot({ path: "qa/14-vase-porcelain-v04.png" });
  await act("collection");
  await page.screenshot({ path: "qa/15-collection-v04.png" });
  await act("close-modal");
  // Targeted visual replay fixtures use the public backup-import feature. These
  // views are labelled as replay; full-process evidence is playtest-v02.mjs.
  const replay = structuredClone(backup),
    p = replay.pieces.find((p) => p.form === "bowl");
  replay.activeId = p.id;
  replay.held = null;
  p.shrink = 1;
  p.stage = "painted";
  p.location = "paint";
  p.position = [5.4, 0.96, -5.6];
  await importData(replay);
  await route("paint");
  const bounds = await page.evaluate(
    () => window.__YAOHUO__.view().pieceBounds,
  );
  await page.mouse.move(bounds.x + bounds.w * 0.56, bounds.y + bounds.h * 0.78);
  await page.waitForTimeout(500);
  await page.screenshot({ path: "qa/16-paint-contact-replay-v04.png" });
  p.location = "glaze";
  p.position = [7.2, 0.95, -0.2];
  p.glaze.fill(0);
  await importData(replay);
  await route("glaze");
  const dip = await page.locator('[data-hold="dip"]').boundingBox();
  await page.mouse.move(dip.x + 50, dip.y + 20);
  await page.mouse.down();
  await page.waitForTimeout(280);
  await page.screenshot({ path: "qa/17-glaze-contact-replay-v04.png" });
  await page.mouse.up();
  p.stage = "loaded";
  p.location = "kiln";
  p.position = [5.9, 0.45, 4.65];
  p.heat = 0;
  replay.kiln = {
    phase: "firing",
    temperature: 1050,
    fuel: 0.65,
    draft: 0.52,
    elapsed: 38,
    curve: [
      [0, 24],
      [38, 1050],
    ],
    assisted: true,
  };
  await importData(replay);
  await route("kiln");
  await page.screenshot({ path: "qa/18-kiln-replay-v04.png" });
  checks.push(
    "Final paint, dipping and kiln views reviewed through imported replay fixtures",
  );
  await importData(backup);
  await act("settings");
  await act("save");
  await act("close-modal");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {
    timeout: 30000,
  });
  const cache = await page.evaluate(async () => ({
    keys: await caches.keys(),
    entries: (
      await (
        await caches.open(
          (await caches.keys()).find((k) => k.startsWith("yaohuo-")),
        )
      ).keys()
    ).length,
  }));
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready();
  expect((await read()).pieces.map((p) => p.id)).toEqual(
    backup.pieces.map((p) => p.id),
  );
  await page.locator("#start").click();
  await act("collection");
  await page.screenshot({ path: "qa/19-offline-collection-v04.png" });
  checks.push(
    "Production service-worker cache loads the whole game offline and restores IndexedDB",
  );
  await fs.writeFile(
    "qa/release-check.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        base,
        browser: browser.version(),
        checks,
        errors,
        cache,
        dropped,
        restored,
        visualReplay: true,
      },
      null,
      2,
    ),
  );
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("PASS " + checks.join("; "));
} catch (e) {
  await page.screenshot({ path: "qa/release-failure.png" }).catch(() => {});
  await fs.writeFile(
    "qa/release-failure.json",
    JSON.stringify(
      {
        message: e.message,
        errors,
        checks,
        state: await read().catch(() => null),
        view: await page
          .evaluate(() => window.__YAOHUO__?.view())
          .catch(() => null),
      },
      null,
      2,
    ),
  );
  console.error(e);
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
