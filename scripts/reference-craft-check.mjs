import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { newState, newPiece, STATIONS } from "../src/simulation/model.ts";
const prefix = process.env.QA_PREFIX || "reference-current";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  serviceWorkers: "block",
  ...(process.env.QA_RECORD
    ? { recordVideo: { dir: `qa/${prefix}-video` } }
    : {}),
});
const page = await context.newPage(),
  errors = [],
  checks = [],
  measurements = [],
  observations = [];
page.on("pageerror", (e) => errors.push(e.message));
const inspect = () =>
  page.evaluate(() => ({
    state: window.__YAOHUO__.snapshot(),
    view: window.__YAOHUO__.view(),
    stats: window.__YAOHUO__.stats(),
  }));
function check(name, passed) {
  checks.push({ name, passed: !!passed });
  assert(passed, name);
}
async function fixture(state, station) {
  state.player = STATIONS.find((s) => s.id === station).approach;
  await page.locator('[data-act="settings"]').click();
  const dl = page.waitForEvent("download");
  await page
    .locator("#import")
    .setInputFiles({
      name: "reference-fixture.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(state)),
    });
  await dl;
  await page.waitForFunction(() => window.__YAOHUO__.view().modal === "");
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(2600);
}
async function frames(name, action) {
  const recording = page.evaluate(
    () =>
      new Promise((resolve) => {
        const samples = [];
        let last = 0,
          start = 0;
        function frame(t) {
          if (!start) start = t;
          if (last) samples.push(t - last);
          last = t;
          if (t - start < 6500) requestAnimationFrame(frame);
          else resolve(samples);
        }
        requestAnimationFrame(frame);
      }),
  );
  await action();
  const values = await recording,
    sorted = [...values].sort((a, b) => a - b),
    mean = values.reduce((a, b) => a + b, 0) / values.length;
  measurements.push({
    name,
    averageFps: 1000 / mean,
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    over33ms: values.filter((v) => v > 33.5).length / values.length,
    frames: values,
  });
  console.log(
    name,
    JSON.stringify(measurements.at(-1), (k, v) =>
      k === "frames" ? undefined : v,
    ),
  );
}
try {
  await page.goto(process.env.QA_URL || "http://127.0.0.1:5191/");
  await page.waitForFunction(() => window.__YAOHUO__, null, {
    timeout: 120000,
  });
  await page.locator("#start").click();
  observations.push(
    await page.evaluate(() => {
      const gl = document.querySelector("#world canvas").getContext("webgl2"),
        ext = gl.getExtension("WEBGL_debug_renderer_info");
      return {
        ua: navigator.userAgent,
        gpu: ext
          ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
      };
    }),
  );
  const state = newState(),
    p = newPiece("vase", 1);
  Object.assign(p, {
    height: 0.24,
    stage: "thrown",
    opened: true,
    preparation: 1,
    air: 0.04,
    location: "wheel",
    position: STATIONS.find((s) => s.id === "wheel").pos,
  });
  state.pieces = [p];
  state.activeId = p.id;
  await fixture(state, "wheel");
  await frames("wheel idle", () => page.waitForTimeout(6500));
  const before = await inspect(),
    b = before.view.pieceBounds;
  const point = await page.evaluate(() => {
    const d = window.__YAOHUO__,
      b = d.view().pieceBounds;
    for (const u of [0.8, 0.7, 0.6]) {
      const x = b.x + b.w * u,
        y = b.y + b.h * 0.6;
      if (d.hitPiece(x, y)) return { x, y };
    }
  });
  assert(point);
  await frames("continuous sculpt", async () => {
    for (let n = 0; n < 3; n++) {
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      for (let i = 1; i <= 35; i++) {
        await page.mouse.move(
          point.x + Math.sin((i / 35) * Math.PI) * 95,
          point.y,
        );
        await page.waitForTimeout(16);
      }
      await page.mouse.up();
    }
  });
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 85, point.y, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const after = await inspect();
  observations.push({ phase: "sculpt", before, after });
  check(
    "mouse reshapes the same vessel",
    after.state.pieces[0].radius.some(
      (r, i) => r !== before.state.pieces[0].radius[i],
    ),
  );
  check(
    "sculpt retains GPU geometry allocation",
    before.view.pieceGeometry === after.view.pieceGeometry,
  );
  check(
    "sculpt does not repaint texture",
    before.view.ceramicUpdates.texture === after.view.ceramicUpdates.texture,
  );
  await page.screenshot({ path: `qa/${prefix}-sculpt.png` });
  // Start a fresh rim grab after the side stroke, including travel outside mesh.
  const rim = await page.evaluate(() => {
    const d = window.__YAOHUO__,
      b = d.view().pieceBounds;
    for (const v of [0.05, 0.1, 0.15])
      for (const u of [0.5, 0.7, 0.3]) {
        const x = b.x + b.w * u,
          y = b.y + b.h * v;
        if (d.hitPiece(x, y)) return { x, y };
      }
  });
  assert(rim);
  const oldHeight = after.state.pieces[0].height;
  await page.mouse.move(rim.x, rim.y);
  await page.mouse.down();
  await page.mouse.move(rim.x, rim.y - 100, { steps: 30 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  let shaped = await inspect();
  check(
    "rim drag lifts height past the old silhouette",
    shaped.state.pieces[0].height > oldHeight + 0.02,
  );
  await page.screenshot({ path: `qa/${prefix}-rim.png` });
  const neck = await page.evaluate(() => {
    const d = window.__YAOHUO__,
      b = d.view().pieceBounds;
    let best = null;
    for (let v = 0.08; v < 0.55; v += 0.025)
      for (const u of [0.7, 0.75, 0.8]) {
        const x = b.x + b.w * u,
          y = b.y + b.h * v,
          h = d.hitPiece(x, y);
        if (h && (!best || Math.abs(h.uv[1] - 0.78) < best.error))
          best = { x, y, error: Math.abs(h.uv[1] - 0.78) };
      }
    return best;
  });
  await page.mouse.move(neck.x, neck.y);
  await page.mouse.down();
  await page.mouse.move(neck.x - 75, neck.y, { steps: 35 });
  await page.mouse.up();
  await page.locator('[data-act="handle-2"]').click();
  await page.waitForTimeout(400);
  shaped = await inspect();
  check(
    "attaches paired ears to the authored shape",
    shaped.state.pieces[0].handles === 2,
  );
  await page.screenshot({ path: `qa/${prefix}-handles.png` });
  const paintedState = shaped.state,
    pp = paintedState.pieces[0];
  Object.assign(pp, {
    stage: "trimmed",
    trimmed: 1,
    moisture: 0.25,
    location: "paint",
    position: STATIONS.find((s) => s.id === "paint").pos,
  });
  await fixture(paintedState, "paint");
  const paintBefore = await inspect();
  const canvas = page.locator("#paint-map"),
    r = await canvas.boundingBox(),
    at = (u, v) => ({ x: r.x + r.width * u, y: r.y + r.height * v });
  await page.locator('[data-paint-tool="fill"]').click();
  await page.locator('[data-paint-color="#173f78"]').click();
  await page.locator('[data-paint-tool="stroke"]').click();
  await page.locator('[data-paint-color="#315ea0"]').click();
  await frames("canvas live painting", async () => {
    for (let j = 0; j < 4; j++) {
      const a = at(0.15, 0.2 + j * 0.15),
        z = at(0.85, 0.25 + j * 0.15);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(z.x, z.y, { steps: 55 });
      await page.mouse.up();
      await page.waitForTimeout(250);
    }
  });
  check(
    "brush ink does not expose inactive transform controls",
    await page.locator('[data-paint-action="rotate"]').isDisabled(),
  );
  await page.locator('[data-paint-tool="band"]').click();
  await page.locator('[data-paint-color="#c4a552"]').click();
  for (const v of [0.18, 0.8]) {
    const q = at(0.5, v);
    await page.mouse.click(q.x, q.y);
  }
  await page.locator('[data-paint-action="copy"]').click();
  let bands = (await inspect()).state.pieces[0].decoration.layers.filter(
    (l) => l.kind === "band",
  );
  check(
    "copied bands are placed at a different height",
    bands.length === 3 && bands[1].v !== bands[2].v,
  );
  await page.locator('[data-paint-action="undo"]').click();
  await page.locator('[data-paint-tool="flower"]').click();
  let q = at(0.7, 0.5);
  await page.mouse.click(q.x, q.y);
  await page.locator('[data-paint-action="larger"]').click();
  await page.locator('[data-paint-action="rotate"]').click();
  await page.locator('[data-paint-tool="text"]').click();
  await page.locator("#paint-text").fill("福");
  q = at(0.42, 0.52);
  await page.mouse.click(q.x, q.y);
  await page.waitForTimeout(500);
  let decorated = await inspect();
  check(
    "canvas stores editable paint, bands, motifs and text",
    new Set(decorated.state.pieces[0].decoration.layers.map((l) => l.kind))
      .size === 4,
  );
  check(
    "painting leaves geometry allocated",
    decorated.view.pieceGeometry === paintBefore.view.pieceGeometry,
  );
  await page.screenshot({ path: `qa/${prefix}-paint.png` });
  // Move and undo an editable layer through the visible controls.
  const layerBefore = structuredClone(
    decorated.state.pieces[0].decoration.layers.at(-1),
  );
  await page.locator('[data-paint-action="larger"]').click();
  await page.waitForTimeout(100);
  check(
    "layer resize changes saved artwork",
    (await inspect()).state.pieces[0].decoration.layers.at(-1).width >
      layerBefore.width,
  );
  await page.locator('[data-paint-action="undo"]').click();
  await page.waitForTimeout(100);
  decorated = await inspect();
  check(
    "layer undo restores artwork",
    decorated.state.pieces[0].decoration.layers.at(-1).width ===
      layerBefore.width,
  );
  const backup = page.waitForEvent("download");
  await page.locator('[data-act="settings"]').click();
  await page.locator('[data-act="backup"]').click();
  const saved = await backup;
  await saved.saveAs(`qa/${prefix}-workshop.json`);
  await page.locator('[data-act="close-modal"]').click();
  check(
    "exported backup retains editable layers",
    JSON.parse(await fs.readFile(`qa/${prefix}-workshop.json`, "utf8"))
      .pieces[0].decoration.layers.length ===
      decorated.state.pieces[0].decoration.layers.length,
  );
  // Import/export uses the actual decorated piece; only drying/glazing is fixture setup.
  const firedState = decorated.state,
    fp = firedState.pieces[0];
  Object.assign(fp, {
    stage: "dry",
    location: "kiln",
    position: STATIONS.find((s) => s.id === "kiln").pos,
    footClean: true,
    glaze: Array(192).fill(0.68),
    moisture: 0.02,
  });
  await fixture(firedState, "kiln");
  await page.locator("#fire-start").click();
  await page.waitForTimeout(1800);
  const up = await page.locator("#fire-up").boundingBox();
  await page.mouse.move(up.x + up.width / 2, up.y + up.height / 2);
  await page.mouse.down();
  await page.waitForFunction(
    () => window.__YAOHUO__.snapshot().kiln.temperature >= 1260,
    null,
    { timeout: 45000 },
  );
  await page.mouse.up();
  await frames("kiln target hold", () => page.waitForTimeout(6500));
  await page.screenshot({ path: `qa/${prefix}-kiln.png` });
  await page.waitForFunction(
    () => window.__YAOHUO__.snapshot().pieces[0].heat >= 11,
    null,
    { timeout: 30000 },
  );
  const hot = await inspect();
  check(
    "released heating holds target temperature",
    hot.state.kiln.temperature >= 1220 && hot.state.kiln.temperature < 1330,
  );
  await page.locator("#fire-finish").click();
  await page.keyboard.down("KeyR");
  await page.waitForFunction(
    () => window.__YAOHUO__.snapshot().pieces[0].stage === "fired",
    null,
    { timeout: 45000 },
  );
  await page.keyboard.up("KeyR");
  const finished = await inspect();
  check(
    "controlled firing completes same painted vessel",
    finished.state.pieces[0].id === p.id &&
      finished.state.pieces[0].decoration.layers.length ===
        fp.decoration.layers.length,
  );
  check(
    "controlled firing produces no defects",
    finished.state.pieces[0].defects.length === 0,
  );
  await page.screenshot({ path: `qa/${prefix}-fired.png` });
  observations.push({ phase: "fired", ...finished });
  const displayState = finished.state,
    dp = displayState.pieces[0];
  dp.location = "display";
  dp.position = STATIONS.find((s) => s.id === "display").pos;
  await fixture(displayState, "display");
  await page.locator("#work summary").click();
  const glb = page.waitForEvent("download");
  await page.locator('[data-act="export-glb"]').click();
  const exportFile = await glb;
  await exportFile.saveAs(`qa/${prefix}-vessel.glb`);
  const bytes = await fs.readFile(`qa/${prefix}-vessel.glb`);
  check(
    "exports a binary glTF with real vessel geometry",
    bytes.readUInt32LE(0) === 0x46546c67 && bytes.length > 100000,
  );
  const { NodeIO } = await import("@gltf-transform/core"),
    { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
  const doc = await new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .read(`qa/${prefix}-vessel.glb`);
  check(
    "GLB includes body, both ears and an embedded painted texture",
    doc.getRoot().listMeshes().length === 3 &&
      doc
        .getRoot()
        .listTextures()
        .some((t) => t.getImage()?.length > 10000),
  );
  await page.screenshot({ path: `qa/${prefix}-display.png` });
  await page.setViewportSize({ width: 1366, height: 768 });
  const smallState = structuredClone(decorated.state);
  smallState.pieces[0].stage = "painted";
  smallState.pieces[0].location = "paint";
  smallState.pieces[0].position = STATIONS.find((s) => s.id === "paint").pos;
  await fixture(smallState, "paint");
  const panel = await page.locator("#paint-studio").boundingBox();
  check(
    "painting editor fits a laptop Chrome viewport",
    panel.x >= 0 && panel.y + panel.height <= 768,
  );
  await page.screenshot({ path: `qa/${prefix}-laptop.png` });
} catch (e) {
  errors.push(e.stack);
  process.exitCode = 1;
} finally {
  await page.close();
  await context.close();
  await browser.close();
  await fs.writeFile(
    `qa/${prefix}.json`,
    JSON.stringify({ errors, checks, measurements, observations }, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        errors,
        checks,
        measurements: measurements.map(({ frames, ...m }) => m),
      },
      null,
      2,
    ),
  );
}
if (errors.length || checks.some((c) => !c.passed)) process.exitCode = 1;
