import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import os from "node:os";
process.env.PLAYWRIGHT_BROWSERS_PATH = fileURLToPath(
  new URL("../.tmp/playwright", import.meta.url),
);
const { chromium, expect } = await import("@playwright/test");
const revision = process.env.QA_REVISION || "v03";
const base = process.env.QA_URL || "http://127.0.0.1:5173/";
await fs.mkdir("qa/exports", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  recordVideo: { dir: "qa/video", size: { width: 1440, height: 900 } },
});
const page = await context.newPage(),
  errors = [],
  steps = [],
  exports = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const read = () => page.evaluate(() => window.__YAOHUO__.snapshot());
const piece = async () => {
  const s = await read();
  return s.pieces.find((p) => p.id === s.activeId);
};
const log = (x) => {
  steps.push(x);
  console.log(x);
};
const shot = (name) => page.screenshot({ path: `qa/${name}-${revision}.png` });
async function act(name) {
  await page.locator(`[data-act="${name}"]`).click();
}
async function travel(id) {
  await act("map");
  await act("go-" + id);
  await page.waitForFunction(() => window.__YAOHUO__.view().nav === 0, null, {
    timeout: 30000,
  });
  await page.keyboard.press("KeyE");
  await page.waitForFunction(
    (id) => window.__YAOHUO__.view().focus === id,
    id,
    { timeout: 5000 },
  );
  await page.waitForTimeout(1100);
  log("Reached " + id);
}
async function hold(name, condition, timeout = 30000) {
  const el = page.locator(`[data-hold="${name}"]`),
    b = await el.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  try {
    await page.waitForFunction(condition, null, { timeout });
  } finally {
    await page.mouse.up();
  }
}
async function stage(value) {
  await page.waitForFunction(
    (v) => {
      const s = window.__YAOHUO__.snapshot();
      return s.pieces.find((p) => p.id === s.activeId)?.stage === v;
    },
    value,
    { timeout: 30000 },
  );
}
async function range(id, value) {
  const el = page.locator("#" + id),
    min = Number(await el.getAttribute("min")),
    step = Number(await el.getAttribute("step"));
  await el.focus();
  await el.press("Home");
  for (let i = 0; i < Math.round((value - min) / step); i++)
    await el.press("ArrowRight");
  await el.blur();
}
async function point(x, y) {
  const b = await page.evaluate(() => window.__YAOHUO__.view().pieceBounds);
  if (!b) throw new Error("Missing visible piece");
  return { x: b.x + b.w * x, y: b.y + b.h * y };
}
async function clickPiece(x, y) {
  const pt = await point(x, y);
  await page.mouse.click(pt.x, pt.y);
}
async function dragPiece(x, y, dx) {
  const pt = await point(x, y);
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down();
  await page.mouse.move(pt.x + dx, pt.y, { steps: 16 });
  await page.mouse.up();
}
async function saveDownload(action, file) {
  const downloadPromise = page.waitForEvent("download");
  await act(action);
  const d = await downloadPromise,
    path = "qa/exports/" + file;
  await d.saveAs(path);
  const buffer = await fs.readFile(path);
  exports.push({ file, path, bytes: buffer.length });
  return buffer;
}
async function ready() {
  await page.waitForFunction(() => window.__YAOHUO__, null, { timeout: 60000 });
}
async function setRadius(ring, direction, count) {
  await range("trim-ring", ring);
  for (let n = 0; n < count; n++) await act("shape-" + direction);
}
try {
  await page.goto(base);
  await ready();
  await shot("01-intro");
  await page.locator("#start").click();
  await page.waitForTimeout(1500);
  await shot("02-courtyard");
  const initial = (await read()).player;
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(850);
  await page.keyboard.up("KeyW");
  expect((await read()).player[2]).toBeLessThan(initial[2] - 0.8);
  log("WASD moves the collision-driven character");
  await page.locator("#world canvas").click({ position: { x: 700, y: 500 } });
  await page.waitForFunction(() => !!document.pointerLockElement);
  await page.keyboard.press("KeyM");
  await page.waitForFunction(() => !document.pointerLockElement);
  await act("close-modal");
  await page.waitForFunction(() => !!document.pointerLockElement);
  await page.keyboard.press("KeyM");
  await act("go-supply");
  await page.waitForFunction(() => window.__YAOHUO__.view().nav === 0);
  await page.keyboard.press("KeyE");
  log("Pointer lock releases and restores across the map");
  const completed = [];
  for (const form of ["bowl", "vase"]) {
    if (form === "vase") await travel("supply");
    await act("form-" + form);
    await act("new");
    await travel("clay");
    await hold("prepare", () => {
      const s = window.__YAOHUO__.snapshot();
      return s.pieces.find((p) => p.id === s.activeId).stage === "prepared";
    });
    await act("take");
    await travel("wheel");
    await act("open");
    await page.waitForTimeout(700);
    await shot(`03-${form}-wheel-before`);
    const before = await piece();
    await dragPiece(0.65, 0.6, form === "bowl" ? 42 : 28);
    expect((await piece()).radius).not.toEqual(before.radius);
    await act("undo-shape");
    expect((await piece()).radius).toEqual(before.radius);
    await dragPiece(0.65, 0.6, form === "bowl" ? 42 : 28);
    await range("height", form === "bowl" ? 0.13 : 0.31);
    await page.locator("#work details summary").click();
    if (form === "bowl") {
      await setRadius(47, "out", 10);
      await setRadius(34, "out", 6);
      await setRadius(3, "in", 5);
    } else {
      await setRadius(45, "in", 10);
      await setRadius(28, "out", 5);
      await setRadius(8, "out", 3);
    }
    for (let i = 0; i < 6; i++) await act("smooth");
    await page.waitForTimeout(400);
    await shot(`04-${form}-wheel-shaped`);
    const shaped = await piece();
    expect(shaped.id).toBe(before.id);
    log(
      `${form}: actual geometry changed, undo restored it, no preset substitution`,
    );
    await act("take");
    await travel("rack");
    await hold("wait", () => {
      const s = window.__YAOHUO__.snapshot();
      return s.pieces.find((p) => p.id === s.activeId).stage === "leather";
    });
    await act("take");
    await travel("wheel");
    await range("trim-ring", 3);
    await hold("trim", () => {
      const s = window.__YAOHUO__.snapshot();
      return s.pieces.find((p) => p.id === s.activeId).stage === "trimmed";
    });
    expect((await piece()).thickness).not.toEqual(shaped.thickness);
    await act("take");
    await travel("paint");
    await act("tool-leaf");
    for (const [x, y] of [
      [0.38, 0.65],
      [0.5, 0.68],
      [0.63, 0.65],
    ])
      await clickPiece(x, y);
    await act("tool-flower");
    await clickPiece(0.52, 0.77);
    await act("tool-band");
    await clickPiece(0.5, 0.51);
    await clickPiece(0.5, 0.89);
    await act("tool-brush");
    const start = await point(0.4, 0.73),
      end = await point(0.6, 0.8);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 18 });
    await page.mouse.up();
    await act("rotate-right");
    await page.waitForTimeout(200);
    await shot(`05-${form}-painted`);
    const painted = await piece();
    expect(painted.marks.length).toBeGreaterThan(6);
    if (form === "bowl") {
      await act("settings");
      await act("save");
      await page.reload();
      await ready();
      expect((await piece()).marks).toEqual(painted.marks);
      expect((await piece()).radius).toEqual(painted.radius);
      await page.locator("#start").click();
      await travel("paint");
      log(
        "Intermediate painted-stage IndexedDB reload preserved geometry and strokes",
      );
    }
    await act("take");
    await travel("glaze");
    const dipButton = await page.locator('[data-hold="dip"]').boundingBox();
    await page.mouse.move(dipButton.x + 50, dipButton.y + 20);
    await page.mouse.down();
    await page.waitForTimeout(240);
    await shot(`06-${form}-dipping`);
    await page.waitForFunction(() => {
      const s = window.__YAOHUO__.snapshot(),
        p = s.pieces.find((p) => p.id === s.activeId);
      return p.glaze.reduce((a, b) => a + b, 0) / 192 >= 0.65;
    });
    await page.mouse.up();
    await act("clean-foot");
    await act("take");
    await travel("rack");
    await hold("wait", () => {
      const s = window.__YAOHUO__.snapshot();
      return s.pieces.find((p) => p.id === s.activeId).stage === "dry";
    });
    await act("take");
    await travel("kiln");
    await act("load");
    await act("light");
    await hold(
      "wait",
      () => window.__YAOHUO__.snapshot().kiln.temperature > 1050,
    );
    await shot(`07-${form}-kiln-fire`);
    await hold(
      "wait",
      () => {
        const s = window.__YAOHUO__.snapshot();
        return s.pieces.find((p) => p.id === s.activeId).stage === "fired";
      },
      45000,
    );
    await stage("fired");
    expect((await piece()).defects.some((x) => x.startsWith("过火"))).toBe(
      false,
    );
    await act("take");
    await travel("display");
    await page.waitForTimeout(500);
    await shot(`08-${form}-porcelain`);
    const glb = await saveDownload("export-glb", `${form}.glb`);
    expect(glb.toString("ascii", 0, 4)).toBe("glTF");
    expect(glb.readUInt32LE(8)).toBe(glb.length);
    const gltf = JSON.parse(
      glb.toString("utf8", 20, 20 + glb.readUInt32LE(12)).trim(),
    );
    expect(gltf.images.length).toBeGreaterThan(0);
    expect(gltf.meshes.length).toBeGreaterThan(0);
    expect(gltf.nodes.some((n) => n.extras?.history?.length > 5)).toBe(true);
    const png = await saveDownload("photo", `${form}.png`);
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    log(`${form}: embedded-texture GLB and rendered PNG exported`);
    await act("pack");
    await page.waitForTimeout(1800);
    await shot(`09-${form}-wrapping`);
    await stage("packed");
    await act("unwrap");
    await shot(`10-${form}-collected`);
    const final = await piece();
    expect(final.id).toBe(before.id);
    expect(final.marks).toEqual(painted.marks);
    completed.push(final);
    log(
      `${form}: full craft loop complete, score ${final.score}, ${final.defects.length} defects`,
    );
  }
  expect(completed[0].radius).not.toEqual(completed[1].radius);
  expect(completed[0].height).not.toEqual(completed[1].height);
  await act("collection");
  await shot("11-collection");
  await act("close-modal");
  await act("settings");
  const backup = await saveDownload("backup", "workshop.json");
  await act("save");
  const saved = await read();
  await page.reload();
  await ready();
  const restored = await read();
  expect(restored.pieces).toEqual(saved.pieces);
  await page.locator("#start").click();
  await act("settings");
  await page
    .locator("#import")
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":99}'),
    });
  await expect(page.locator("#toast")).toContainText("导入失败");
  expect((await read()).pieces).toEqual(saved.pieces);
  const safetyBackup = page.waitForEvent("download");
  await page
    .locator("#import")
    .setInputFiles({
      name: "workshop.json",
      mimeType: "application/json",
      buffer: backup,
    });
  await (await safetyBackup).saveAs("qa/exports/pre-import.json");
  await page.waitForFunction(() => window.__YAOHUO__.view().modal === "");
  expect((await read()).pieces).toEqual(saved.pieces);
  log(
    "Backup import and malformed-file rejection preserve the original workshop",
  );
  await act("settings");
  await act("bind-forward");
  await page.keyboard.press("KeyI");
  expect((await read()).settings.bindings.forward).toBe("KeyI");
  await act("bind-forward");
  await page.keyboard.press("KeyW");
  await page.setViewportSize({ width: 390, height: 844 });
  await shot("12-settings-narrow");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await act("close-modal");
  await page.evaluate(() => {
    const gl = document.querySelector("#world canvas").getContext("webgl2");
    const ext = gl.getExtension("WEBGL_lose_context");
    ext.loseContext();
    setTimeout(() => ext.restoreContext(), 900);
  });
  await page.waitForTimeout(1600);
  await ready();
  expect((await read()).pieces.map((p) => p.id)).toEqual(
    saved.pieces.map((p) => p.id),
  );
  log("Graphics context loss restored the saved collection");
  const report = {
    date: new Date().toISOString(),
    revision,
    base,
    browser: browser.version(),
    cpu: os.cpus()[0].model,
    viewport: "1440 x 900",
    quality: "high",
    recording: true,
    steps,
    errors,
    exports,
    pieces: completed,
    stats: await page.evaluate(() => window.__YAOHUO__.stats()),
  };
  await fs.writeFile("qa/playtest.json", JSON.stringify(report, null, 2));
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("PASS");
} catch (e) {
  await page.screenshot({ path: "qa/failure.png" }).catch(() => {});
  await fs.writeFile(
    "qa/failure.json",
    JSON.stringify(
      {
        message: e.message,
        errors,
        steps,
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
