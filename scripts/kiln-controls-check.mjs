import fs from "node:fs/promises";
import * as THREE from "three";
import { chromium } from "@playwright/test";
import { newState, newPiece } from "../src/simulation/model.ts";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
const errors = [],
  checks = [],
  observations = [];
page.on("pageerror", (e) => errors.push(e.message));
const read = () =>
  page.evaluate(() => ({
    state: window.__YAOHUO__.snapshot(),
    view: window.__YAOHUO__.view(),
  }));
const wait = (ms) => page.waitForTimeout(ms);
const assert = (condition, name, evidence) => {
  checks.push({ name, passed: !!condition, evidence });
  if (!condition) throw new Error(name + ": " + JSON.stringify(evidence));
};
async function camera() {
  const { view } = await read();
  const c = new THREE.PerspectiveCamera(view.cameraFov, 1440 / 900, 0.03, 80);
  c.position.fromArray(view.camera);
  c.quaternion.fromArray(view.cameraQuaternion);
  c.updateMatrixWorld();
  return c;
}
const screen = (camera, point) => {
  const ndc = new THREE.Vector3(...point).project(camera);
  return { x: (ndc.x + 1) * 720, y: (1 - ndc.y) * 450 };
};
async function drag(name, start, target, during) {
  const c = await camera();
  const normal = c.getWorldDirection(new THREE.Vector3());
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
    normal,
    new THREE.Vector3(...start),
  );
  const endpoint = plane.projectPoint(
    new THREE.Vector3(...target),
    new THREE.Vector3(),
  );
  const from = screen(c, start),
    to = screen(c, endpoint.toArray());
  const inputTarget = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return element
      ? { tag: element.tagName, id: element.id, className: element.className }
      : null;
  }, from);
  observations.push({
    action: name,
    from,
    to,
    sourceWorld: start,
    targetWorld: target,
    inputTarget,
  });
  assert(
    from.x > 0 && from.x < 1440 && from.y > 0 && from.y < 900,
    name + " source is on screen",
    from,
  );
  assert(
    inputTarget?.tag === "CANVAS",
    name + " is not intercepted by UI",
    inputTarget,
  );
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  if (during) await during();
  await page.mouse.move(to.x, to.y, { steps: 30 });
  await page.mouse.up();
  await wait(80);
  return read();
}
let report;
try {
  await page.goto(process.env.QA_URL || "http://127.0.0.1:5190/");
  await page.waitForFunction(() => window.__YAOHUO__, null, { timeout: 90000 });
  await page.locator("#start").click();
  const fixture = newState(),
    p = newPiece("bowl", 1);
  p.stage = "dry";
  p.location = "kiln";
  p.position = [5.9, 0.45, 4.65];
  p.opened = true;
  p.preparation = p.trimmed = 1;
  p.moisture = 0.02;
  p.air = 0.04;
  p.purity = 0.97;
  p.footClean = true;
  p.glaze.fill(0.68);
  p.history.push(
    "QA documented fixture: dry glazed piece at the kiln; subsequent controls use actual pointer and keyboard events.",
  );
  fixture.pieces = [p];
  fixture.activeId = p.id;
  fixture.player = [6, 1.65, 2.75];
  fixture.yaw = Math.PI;
  fixture.settings.assist = true;
  await page.locator('[data-act="settings"]').click();
  const backup = page.waitForEvent("download");
  await page.locator("#import").setInputFiles({
    name: "kiln-controls-dry-fixture.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await backup;
  await page.waitForFunction(() => window.__YAOHUO__.view().modal === "");
  await page.keyboard.press("KeyE");
  await page.waitForFunction(() => window.__YAOHUO__.view().focus === "kiln");
  await wait(1200);
  const initial = await read();
  assert(
    initial.state.pieces[0].stage === "dry",
    "public import supplies dry un-loaded piece",
    initial.state.pieces[0].stage,
  );
  // A press/release in place must not load the piece; release at the mouth must.
  // The bricks are now raised onto a stool within the normal workbench view.
  const sealPoint = screen(await camera(), [6.95, 0.69, 3.5]);
  assert(
    sealPoint.y < 900,
    "brick upper surface is visibly reachable",
    sealPoint,
  );
  await page.mouse.click(sealPoint.x, sealPoint.y);
  const pressedOnly = await read();
  assert(
    pressedOnly.state.pieces[0].stage === "dry",
    "clicking brick alone does not load",
    pressedOnly.state.pieces[0].stage,
  );
  const loaded = await drag(
    "seal brick to kiln mouth",
    [6.95, 0.69, 3.5],
    [6, 1.05, 3.8],
    async () => {
      const value = await read();
      assert(
        value.state.pieces[0].stage === "dry",
        "holding brick before travel does not load",
        value.state.pieces[0].stage,
      );
    },
  );
  assert(
    loaded.state.pieces[0].stage === "loaded",
    "brick release at mouth loads the same piece",
    loaded.state.pieces[0].stage,
  );
  await page.screenshot({ path: "qa/kiln-controls-loaded.png" });
  const lit = await drag(
    "tinder to fire mouth",
    [5.18, 0.442, 3.74],
    [6, 0.55, 3.8],
  );
  assert(
    lit.state.kiln.phase === "firing",
    "actual tinder drag ignites kiln",
    lit.state.kiln,
  );
  const beforeDraft = await read();
  const manual = await drag(
    "move physical damper",
    [6.94, 0.69, 3.72],
    [6.82, 0.69, 3.72],
  );
  assert(
    manual.state.kiln.assisted === false &&
      Math.abs(manual.state.kiln.draft - beforeDraft.state.kiln.draft) > 0.15,
    "damper drag changes draft and disengages assistance",
    { before: beforeDraft.state.kiln, after: manual.state.kiln },
  );
  await wait(350);
  const persistedDraft = await read();
  assert(
    Math.abs(persistedDraft.state.kiln.draft - manual.state.kiln.draft) < 0.001,
    "manual draft survives subsequent simulation frames",
    persistedDraft.state.kiln.draft,
  );
  const beforeFuel = await read();
  const fuelled = await drag(
    "firewood into mouth",
    [5.06, 0.54, 3.43],
    [6, 0.55, 3.8],
  );
  assert(
    fuelled.state.kiln.fuel - beforeFuel.state.kiln.fuel > 0.25,
    "wood release adds fuel while time continues",
    { before: beforeFuel.state.kiln.fuel, after: fuelled.state.kiln.fuel },
  );
  await page.screenshot({ path: "qa/kiln-controls-firing.png" });
  const beforeWait = await read();
  await page.keyboard.down("KeyR");
  await wait(2200);
  await page.keyboard.up("KeyR");
  const heated = await read();
  assert(
    heated.state.kiln.temperature > beforeWait.state.kiln.temperature + 30 &&
      heated.state.kiln.elapsed > beforeWait.state.kiln.elapsed + 10,
    "R advances actual kiln heat and elapsed time",
    { before: beforeWait.state.kiln, after: heated.state.kiln },
  );
  await page.keyboard.press("KeyC");
  await wait(120);
  const cooling = await read();
  assert(
    cooling.state.kiln.phase === "cooling",
    "C stops firing and enters natural cooling",
    cooling.state.kiln,
  );
  await page.screenshot({ path: "qa/kiln-controls-cooling.png" });
  assert(!errors.length, "no uncaught runtime errors", errors);
  report = {
    passed: true,
    timestamp: new Date().toISOString(),
    method:
      "Dry-piece fixture imported via public settings/import UI. After import all operations are real mouse drags or keyboard events; __YAOHUO__ used only for read-only state and camera projection.",
    limitation:
      "Does not test the preceding craft stages or complete high-temperature firing/cooling. No audio claim.",
    checks,
    observations,
    final: cooling.state,
    errors,
  };
} catch (error) {
  try {
    await page.screenshot({ path: "qa/kiln-controls-failure.png" });
  } catch {}
  report = {
    passed: false,
    error: error.stack,
    checks,
    observations,
    errors,
    snapshot: await read().catch(() => null),
  };
} finally {
  await fs.writeFile(
    "qa/kiln-controls-check.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify(
      { passed: report.passed, error: report.error, checks },
      null,
      2,
    ),
  );
  await browser.close();
}
if (!report.passed) process.exitCode = 1;
