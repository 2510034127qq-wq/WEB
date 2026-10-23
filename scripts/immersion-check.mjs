import fs from "node:fs/promises";
import assert from "node:assert/strict";
import * as THREE from "three";
import { chromium } from "@playwright/test";

// Documented station fixtures enter through the same public JSON importer as a
// user backup. Every change under test is then made with real pointer/key input.
const base = process.env.QA_URL || "http://127.0.0.1:5190/";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const errors = [],
  results = [],
  fixtures = [];
const failedRequests = [];
page.on("requestfailed", (request) =>
  failedRequests.push({ url: request.url(), failure: request.failure() }),
);
page.on("response", (response) => {
  if (response.status() >= 400)
    failedRequests.push({ url: response.url(), status: response.status() });
});
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", async (message) => {
  if (message.type() === "error") {
    errors.push(message.text());
    for (const arg of message.args()) {
      const detail = await arg
        .evaluate((value) =>
          value instanceof Event
            ? {
                type: value.type,
                target: value.target?.src,
                tag: value.target?.tagName,
              }
            : null,
        )
        .catch(() => null);
      if (detail) {
        errors.push(detail);
        console.error("RESOURCE EVENT", JSON.stringify(detail));
      }
    }
  }
});
const source = JSON.parse(
  await fs.readFile("qa/exports/workshop.json", "utf8"),
);
const positions = {
  clay: [-5.6, 0.94, -5.6],
  wheel: [0, 0.78, -5.6],
  paint: [5.4, 0.96, -5.6],
  glaze: [7.2, 0.95, -0.2],
  display: [0, 0.96, 5.8],
  kiln: [6, 0.88, 5.5],
};
const approaches = {
  clay: [-5.6, 1.65, -3.8],
  wheel: [0, 1.65, -3.9],
  paint: [5.4, 1.65, -3.8],
  glaze: [5.6, 1.65, -0.2],
  display: [0, 1.65, 3.7],
  kiln: [6, 1.65, 2.75],
};
const read = () => page.evaluate(() => window.__YAOHUO__.snapshot());
const view = () => page.evaluate(() => window.__YAOHUO__.view());
const piece = async () => {
  const state = await read();
  return state.pieces.find((item) => item.id === state.activeId);
};
const shot = (name) => page.screenshot({ path: `qa/immersion-${name}.png` });
const act = (name) => page.locator(`[data-act="${name}"]`).click();
const mean = (values) => values.reduce((sum, n) => sum + n, 0) / values.length;
const sleep = (ms) => page.waitForTimeout(ms);
async function point(x = 0.65, y = 0.65) {
  const b = (await view()).pieceBounds;
  assert(b && b.w > 0 && b.h > 0, "active vessel has visible bounds");
  const result = { x: b.x + b.w * x, y: b.y + b.h * y };
  assert(
    result.x >= 0 && result.x < 1440 && result.y >= 0 && result.y < 900,
    "vessel target is inside viewport",
  );
  return result;
}
async function drag(
  start,
  end,
  { button = "left", steps = 20, hold = 0 } = {},
) {
  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button });
  await page.mouse.move(end.x, end.y, { steps });
  if (hold) await sleep(hold);
  await page.mouse.up({ button });
}
async function worldPoint(position, station) {
  const v = await view(),
    p = await piece();
  const camera = new THREE.PerspectiveCamera(
    v.cameraFov || (station === "glaze" ? 52 : 54),
    1440 / 900,
    0.035,
    90,
  );
  camera.position.fromArray(v.camera);
  if (v.cameraQuaternion) camera.quaternion.fromArray(v.cameraQuaternion);
  else
    camera.lookAt(
      new THREE.Vector3(...positions[station]).add(
        new THREE.Vector3(0, p.height * 0.55, 0),
      ),
    );
  camera.updateMatrixWorld();
  const projected = new THREE.Vector3(...position).project(camera);
  return { x: (projected.x + 1) * 720, y: (1 - projected.y) * 450 };
}
async function footRow() {
  return page.evaluate(() => {
    const diagnostic = window.__YAOHUO__,
      b = diagnostic.view().pieceBounds;
    const rows = [];
    for (let yi = 50; yi <= 98; yi++) {
      const y = b.y + (b.h * yi) / 100,
        hits = [];
      for (let xi = 28; xi <= 72; xi += 2) {
        const x = b.x + (b.w * xi) / 100,
          hit = diagnostic.hitPiece(x, y);
        if (
          hit &&
          hit.surface === "outer" &&
          hit.uv[1] > 0.015 &&
          hit.uv[1] < 0.2
        )
          hits.push(x);
      }
      if (hits.length > 3)
        rows.push({
          y,
          left: Math.min(...hits),
          right: Math.max(...hits),
          hits: hits.length,
        });
    }
    rows.sort((a, b) => b.hits - a.hits);
    return rows[0] || null;
  });
}
async function replay(station, stage, overrides = {}) {
  const state = structuredClone(source),
    p = structuredClone(state.pieces.find((p) => p.form === "bowl"));
  state.pieces = [p];
  state.activeId = p.id;
  state.held = null;
  state.player = approaches[station];
  state.yaw = 0;
  state.kiln = {
    phase: "idle",
    temperature: 24,
    fuel: 0,
    draft: 0.5,
    elapsed: 0,
    curve: [],
    assisted: false,
  };
  state.settings.sound = false;
  state.settings.quality = "high";
  Object.assign(
    p,
    {
      stage,
      location: station,
      position: positions[station],
      shrink: 1,
      footClean: false,
      trimmed: 0,
      stress: 0,
      defects: [],
      heat: 0,
      peak: 0,
    },
    overrides,
  );
  if (!["fired", "packed"].includes(stage)) p.glaze.fill(0);
  if (["raw", "prepared"].includes(stage))
    Object.assign(
      p,
      {
        radius: Array.from(
          { length: 48 },
          (_, i) => 0.095 + Math.sin((i / 47) * Math.PI) * 0.015,
        ),
        height: 0.16,
        thickness: Array(48).fill(0.016),
        opened: false,
        preparation: stage === "prepared" ? 1 : 0,
        moisture: 0.7,
        purity: 0.75,
        air: 0.65,
        marks: [],
      },
      overrides,
    );
  if (["thrown", "leather", "trimmed"].includes(stage)) {
    p.marks = [];
    p.opened = true;
  }
  if (stage === "leather") p.moisture = 0.3;
  const v = await view();
  if (v.focus) await page.keyboard.press("Escape");
  if ((await view()).modal) await act("close-modal");
  await act("settings");
  const download = page.waitForEvent("download");
  await page.locator("#import").setInputFiles({
    name: `immersion-fixture-${station}-${stage}.json`,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(state)),
  });
  await download;
  await page.waitForFunction(() => window.__YAOHUO__.view().modal === "");
  await sleep(200);
  await page.keyboard.press("KeyE");
  await page.waitForFunction(
    (id) => window.__YAOHUO__.view().focus === id,
    station,
    { timeout: 6000 },
  );
  await sleep(1600);
  fixtures.push({
    station,
    stage,
    overrides,
    method:
      "Public settings JSON import, then E to work. No diagnostic state mutation.",
  });
  assert.equal(
    await page.locator('#work input[type="range"]').count(),
    0,
    "work interface contains no slider",
  );
  assert.equal(
    await page.locator("#work [data-hold]").count(),
    0,
    "work interface contains no timed-process button",
  );
  return p;
}
async function test(name, body) {
  if (
    process.env.QA_TESTS &&
    !process.env.QA_TESTS.split(",").includes(name.slice(0, 2))
  )
    return;
  console.log("CHECK", name);
  try {
    const detail = await body();
    results.push({ name, passed: true, detail });
    console.log("PASS", name);
  } catch (error) {
    results.push({
      name,
      passed: false,
      error: error.message,
      view: await view().catch(() => null),
      piece: await piece().catch(() => null),
    });
    console.error("FAIL", name, error.message);
  } finally {
    await page.mouse.up().catch(() => {});
    await page.mouse.up({ button: "right" }).catch(() => {});
    await shot(name).catch(() => {});
  }
}
try {
  await page.goto(base);
  await page.waitForFunction(() => window.__YAOHUO__, null, { timeout: 60000 });
  await page.locator("#start").click();
  await sleep(700);
  await test("01-knead-contact", async () => {
    await replay("clay", "raw");
    const before = await piece();
    await sleep(1100);
    assert.equal(
      (await piece()).preparation,
      before.preparation,
      "standing idle must not prepare clay",
    );
    const a = await point(0.5, 0.55);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await sleep(1300);
    await page.mouse.up();
    assert.equal(
      (await piece()).preparation,
      before.preparation,
      "stationary pressed hand must not prepare clay",
    );
    const b = (await view()).pieceBounds;
    for (let i = 0; i < 12 && (await piece()).stage === "raw"; i++) {
      await drag(
        { x: b.x + b.w * 0.3, y: b.y + b.h * 0.57 },
        { x: b.x + b.w * 0.72, y: b.y + b.h * 0.61 },
      );
      await drag(
        { x: b.x + b.w * 0.7, y: b.y + b.h * 0.6 },
        { x: b.x + b.w * 0.31, y: b.y + b.h * 0.56 },
      );
    }
    const after = await piece();
    assert(
      after.preparation > before.preparation,
      "moving on clay must prepare it",
    );
    return {
      idlePreparation: before.preparation,
      afterDrag: after.preparation,
      stage: after.stage,
    };
  });
  await test("02-wheel-open-shape-brake", async () => {
    await replay("wheel", "prepared");
    await page.keyboard.press("Space");
    await sleep(400);
    assert.equal(
      (await piece()).opened,
      false,
      "spinning alone must not open clay",
    );
    const b = (await view()).pieceBounds;
    for (let i = 0; i < 5 && !(await piece()).opened; i++)
      await drag(
        { x: b.x + b.w * 0.5, y: b.y + b.h * 0.25 },
        { x: b.x + b.w * 0.5, y: b.y + b.h * 0.78 },
        { steps: 28 },
      );
    assert.equal(
      (await piece()).opened,
      true,
      "downward clay-contact strokes must open the clay",
    );
    const before = await piece();
    const a = await point(0.6, 0.65);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await sleep(700);
    await page.mouse.up();
    assert.deepEqual(
      (await piece()).radius,
      before.radius,
      "stationary shaping contact must not deform",
    );
    await page.keyboard.press("Space");
    for (let i = 0; i < 3; i++) {
      const p = await point(0.57, 0.65);
      await drag(p, { x: p.x + 17, y: p.y });
    }
    const shaped = await piece();
    assert.notDeepEqual(
      shaped.radius,
      before.radius,
      "lateral moving hand must change actual profile",
    );
    await page.keyboard.press("KeyB");
    const stopped = await piece();
    const q = await point(0.6, 0.65);
    await drag(q, { x: q.x + 18, y: q.y });
    assert.deepEqual(
      (await piece()).radius,
      stopped.radius,
      "braked wheel must not reshape",
    );
    return { opened: true, radiusChanged: true, brakePreventedChange: true };
  });
  await test("03-trim-requires-contact", async () => {
    await replay("wheel", "leather");
    await page.keyboard.press("Space");
    const before = await piece();
    await sleep(1300);
    assert.deepEqual(
      (await piece()).thickness,
      before.thickness,
      "spinning without knife contact must not trim",
    );
    const a = await point(0.53, 0.53);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await sleep(1600);
    await page.mouse.up();
    const after = await piece();
    assert(
      mean(after.thickness) < mean(before.thickness),
      "knife contact with rotating ceramic must remove material",
    );
    const off = await point(0.53, 0.53);
    await page.mouse.move(off.x, off.y);
    await page.mouse.down();
    await page.mouse.move(1250, 250, { steps: 5 });
    const absent = await piece();
    await sleep(1100);
    await page.mouse.up();
    assert.deepEqual(
      (await piece()).thickness,
      absent.thickness,
      "leaving the actual surface must stop trimming",
    );
    return {
      beforeMean: mean(before.thickness),
      afterMean: mean(after.thickness),
      noContactStopped: true,
    };
  });
  await test("04-paint-stroke", async () => {
    await replay("paint", "trimmed");
    const before = await piece();
    const a = await point(0.6, 0.7);
    await drag(a, { x: a.x + 22, y: a.y - 5 }, { steps: 16 });
    const after = await piece();
    assert(
      after.marks.length > before.marks.length,
      "real surface drag paints marks",
    );
    await sleep(900);
    assert.equal(
      (await piece()).marks.length,
      after.marks.length,
      "released brush adds no marks",
    );
    return { addedMarks: after.marks.length - before.marks.length };
  });
  await test("05-glaze-depth-foot", async () => {
    await replay("glaze", "painted");
    const before = await piece();
    await sleep(1000);
    assert.equal(
      mean((await piece()).glaze),
      0,
      "standing at vat cannot apply glaze",
    );
    const a = await point(0.6, 0.55);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x, a.y + 240, { steps: 24 });
    await sleep(3100);
    await shot("05-submerged");
    const dipped = await piece();
    assert(
      mean(dipped.glaze) > 0,
      "physical downward drag and immersion must apply glaze",
    );
    await page.mouse.move(a.x, a.y, { steps: 24 });
    await page.mouse.up();
    await sleep(900);
    const lifted = await piece();
    await sleep(900);
    assert.deepEqual(
      (await piece()).glaze,
      lifted.glaze,
      "lifting clear stops glaze accumulation",
    );
    const row = await footRow();
    assert(row, "an exposed outer foot surface must be ray reachable");
    await page.mouse.move(row.left + 2, row.y);
    await page.mouse.down({ button: "right" });
    for (let i = 0; i < 8 && !(await piece()).footClean; i++) {
      await page.mouse.move(row.right - 2, row.y, { steps: 14 });
      await page.mouse.move(row.left + 2, row.y, { steps: 14 });
    }
    await page.mouse.up({ button: "right" });
    const cleaned = await piece();
    assert.equal(
      cleaned.footClean,
      true,
      "actual right-button foot rubbing cleans the foot",
    );
    return {
      beforeMean: mean(before.glaze),
      dippedMean: mean(dipped.glaze),
      footClean: cleaned.footClean,
    };
  });
  await test("06-paper-fold", async () => {
    await replay("display", "fired");
    const start = await worldPoint([-0.45, 0.97, 5.65], "display");
    assert(
      start.x > 0 && start.x < 1440 && start.y > 0 && start.y < 900,
      "actual paper is reachable in focused view",
    );
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await sleep(1000);
    await page.mouse.up();
    assert.equal(
      (await piece()).stage,
      "fired",
      "holding stationary paper must not auto-pack",
    );
    const end = await worldPoint([0.18, 1.11, 5.8], "display");
    await drag(start, end, { steps: 40 });
    await sleep(700);
    assert.equal(
      (await piece()).stage,
      "packed",
      "paper pulled over ceramic must finish wrapping",
    );
    return { start, end, stage: (await piece()).stage };
  });
  await test("07-save-reload", async () => {
    await replay("paint", "trimmed");
    const a = await point(0.6, 0.7);
    await drag(a, { x: a.x + 24, y: a.y - 8 });
    const before = await piece();
    assert(before.marks.length > 0);
    await sleep(4500);
    await page.reload();
    await page.waitForFunction(() => window.__YAOHUO__, null, {
      timeout: 60000,
    });
    const after = await piece();
    assert.equal(after.id, before.id);
    assert.deepEqual(after.marks, before.marks);
    await page.locator("#start").click();
    return { id: after.id, marks: after.marks.length };
  });
  await test("08-wheel-hand-turn", async () => {
    await replay("wheel", "prepared");
    await page.keyboard.press("KeyB");
    await sleep(250);
    const path = [];
    for (let i = 0; i <= 20; i++) {
      const angle = -0.7 + (i * 1.4) / 20;
      path.push(
        await worldPoint(
          [Math.sin(angle) * 0.31, 0.78, -5.6 + Math.cos(angle) * 0.31],
          "wheel",
        ),
      );
    }
    await page.mouse.move(path[0].x, path[0].y);
    await page.mouse.down();
    for (const point of path.slice(1)) await page.mouse.move(point.x, point.y);
    await page.mouse.up();
    await sleep(200);
    const status = await page.locator("#hand-status").innerText();
    const rpm = Number(status.match(/轮速\s+(\d+)/)?.[1]);
    assert(
      rpm > 0,
      "dragging the actual wheel disk must start rotation without a key or button",
    );
    assert.equal(
      (await piece()).opened,
      false,
      "turning the disk does not open the clay",
    );
    return {
      rpm,
      pathPoints: path.length,
      mechanism: "real projected disk arc, no Space key",
    };
  });
} catch (error) {
  results.push({
    name: "startup-or-run",
    passed: false,
    error: error.message,
    body: await page
      .locator("body")
      .innerText()
      .catch(() => ""),
    failedRequests,
  });
  await shot("startup-failure").catch(() => {});
} finally {
  const report = {
    date: new Date().toISOString(),
    browser: browser.version(),
    url: base,
    viewport: "1440 x 900",
    method:
      "Real Chrome pointer/key input following documented public JSON station fixtures. Read-only __YAOHUO__ used solely for assertions/camera projection. This is interaction regression coverage, not a full production chain playthrough.",
    fixtures,
    results,
    errors,
    failedRequests,
  };
  await fs.writeFile(
    process.env.QA_REPORT || "qa/immersion-check.json",
    JSON.stringify(report, null, 2),
  );
  await browser.close();
}
const failures = results.filter((result) => !result.passed);
console.log(
  JSON.stringify(
    {
      passed: results.length - failures.length,
      failed: failures.length,
      errors,
    },
    null,
    2,
  ),
);
if (failures.length || errors.length) process.exitCode = 1;
