import fs from "node:fs/promises";
import assert from "node:assert/strict";
import * as THREE from "three";
import { chromium } from "@playwright/test";
import { newPiece, newState, STATIONS } from "../src/simulation/model.ts";

const prefix = process.env.QA_PREFIX || "sculpt-motion-current",
  baseline = !!process.env.QA_BASELINE;
const recording = !!process.env.QA_RECORD;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  serviceWorkers: "block",
  ...(recording
    ? {
        recordVideo: {
          dir: `qa/${prefix}-video`,
          size: { width: 1920, height: 1080 },
        },
      }
    : {}),
});
const page = await context.newPage(),
  errors = [],
  checks = [],
  observations = [],
  measurements = [];
page.on("pageerror", (e) => errors.push(e.message));
const inspect = () =>
  page.evaluate(() => ({
    state: window.__YAOHUO__.snapshot(),
    view: window.__YAOHUO__.view(),
    stats: window.__YAOHUO__.stats(),
  }));
function check(name, passed) {
  checks.push({ name, passed: !!passed });
  if (!baseline) assert(passed, name);
}
function timingCheck(name, passed) {
  if (recording)
    checks.push({
      name,
      skipped: true,
      reason: "Video encoding is excluded from timing acceptance",
    });
  else check(name, passed);
}
async function fixture() {
  const s = newState(),
    p = newPiece("vase", 1),
    station = STATIONS.find((s) => s.id === "wheel");
  Object.assign(p, {
    stage: "thrown",
    opened: true,
    preparation: 1,
    air: 0.04,
    location: "wheel",
    position: station.pos,
    radius: Array.from(
      { length: 48 },
      (_, i) => 0.076 + 0.012 * Math.sin((i / 47) * Math.PI) - (0.025 * i) / 47,
    ),
  });
  s.pieces = [p];
  s.activeId = p.id;
  s.player = station.approach;
  await page.locator('[data-act="settings"]').click();
  const download = page.waitForEvent("download");
  await page.locator("#import").setInputFiles({
    name: "sculpt-start.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(s)),
  });
  await download;
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(2400);
}
async function contact(v, side = 1) {
  const { state, view } = await inspect(),
    p = state.pieces[0];
  const camera = new THREE.PerspectiveCamera(
    view.cameraFov,
    1920 / 1080,
    0.035,
    180,
  );
  camera.position.fromArray(view.camera);
  camera.quaternion.fromArray(view.cameraQuaternion);
  camera.updateMatrixWorld();
  const right = new THREE.Vector3(1, 0, 0)
    .applyQuaternion(camera.quaternion)
    .setY(0)
    .normalize();
  const r = p.radius[Math.round(v * 47)],
    world = new THREE.Vector3(...p.position).addScaledVector(
      right,
      r * side * 1.06,
    );
  world.y += 0.012 + p.height * v;
  world.project(camera);
  const projected = { x: (world.x + 1) * 960, y: (1 - world.y) * 540 };
  return page.evaluate(
    ({ v, side, projected }) => {
      const d = window.__YAOHUO__;
      let best = null;
      for (const dy of [0, -5, 5, -10, 10])
        for (let n = 0; n < 70; n += 3) {
          const x = projected.x - side * n,
            y = projected.y + dy,
            hit = d.hitPiece(x, y);
          if (hit?.surface === "outer") {
            const ix = x - side * 7,
              h = d.hitPiece(ix, y) || hit,
              error = Math.abs(h.uv[1] - v);
            if (!best || error < best.error) best = { x: ix, y, hit: h, error };
            break;
          }
        }
      return best;
    },
    { v, side, projected },
  );
}
function scale(view, point) {
  const camera = new THREE.PerspectiveCamera(
    view.cameraFov,
    1920 / 1080,
    0.035,
    180,
  );
  camera.position.fromArray(view.camera);
  camera.quaternion.fromArray(view.cameraQuaternion);
  camera.updateMatrixWorld();
  const depth = Math.abs(
    new THREE.Vector3(...point).applyMatrix4(camera.matrixWorldInverse).z,
  );
  return (
    (2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5))) / 1080
  );
}
async function beginProbe(v) {
  await page.evaluate((v) => {
    const row = v * 47,
      low = Math.min(46, Math.floor(row)),
      f = row - low;
    const radius = () => {
      const p = window.__YAOHUO__.snapshot().pieces[0];
      return p.radius[low] * (1 - f) + p.radius[low + 1] * f;
    };
    const probe = { active: true, frames: [], events: [] };
    window.__sculptProbe = probe;
    const event = (e) => {
      if (probe.active)
        probe.events.push({
          type: e.type,
          t: e.timeStamp,
          x: e.clientX,
          y: e.clientY,
          r: radius(),
        });
    };
    window.addEventListener("pointermove", event);
    window.addEventListener("pointerup", event);
    probe.dispose = () => {
      window.removeEventListener("pointermove", event);
      window.removeEventListener("pointerup", event);
    };
    function frame(t) {
      if (!probe.active) return;
      probe.frames.push({ t, r: radius() });
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }, v);
}
async function endProbe(name) {
  const data = await page.evaluate(() => {
    const p = window.__sculptProbe;
    p.active = false;
    p.dispose();
    return { frames: p.frames, events: p.events };
  });
  const intervals = data.frames.slice(1).map((f, i) => f.t - data.frames[i].t),
    sorted = [...intervals].sort((a, b) => a - b);
  const result = {
    name,
    ...data,
    fps: 1000 / (intervals.reduce((a, b) => a + b, 0) / intervals.length),
    p95: sorted[Math.floor(sorted.length * 0.95)],
    over33ms: intervals.filter((x) => x > 33.5).length,
  };
  measurements.push(result);
  return result;
}
async function drag(from, points, duration = 1000, onSegment = async () => {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  let x = from.x,
    y = from.y;
  let segment = 0;
  for (const [dx, dy] of points) {
    const nx = from.x + dx,
      ny = from.y + dy,
      n = 30;
    for (let i = 1; i <= n; i++) {
      await page.mouse.move(x + ((nx - x) * i) / n, y + ((ny - y) * i) / n);
      await page.waitForTimeout(duration / points.length / n);
    }
    x = nx;
    y = ny;
    await onSegment(segment++);
  }
  await page.mouse.up();
  await page.waitForTimeout(200);
}
let video;
try {
  await page.goto(process.env.QA_URL || "http://127.0.0.1:5191/");
  await page.waitForFunction(() => window.__YAOHUO__, null, {
    timeout: 120000,
  });
  await page.locator("#start").click();
  observations.push(
    await page.evaluate(() => {
      const gl = document.querySelector("#world canvas").getContext("webgl2");
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      return {
        ua: navigator.userAgent,
        gpu: ext
          ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
        viewport: [innerWidth, innerHeight],
        dpr: devicePixelRatio,
        scripts: [...document.scripts].map((s) => s.src),
      };
    }),
  );
  await fixture();
  await page.screenshot({ path: `qa/${prefix}-start.png` });
  const before = await inspect(),
    c = await contact(0.36),
    mpp = scale(before.view, c.hit.point);
  assert(c, "Visible wall contact");
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await beginProbe(c.hit.uv[1]);
  await page.waitForTimeout(350);
  await page.mouse.move(c.x + 188, c.y);
  await page.waitForTimeout(350);
  await page.mouse.up();
  await page.waitForTimeout(250);
  const probe = await endProbe("step response"),
    initial = probe.frames[0].r,
    final = probe.frames.at(-1).r,
    move = probe.events.find((e) => e.type === "pointermove");
  const gain = (final - initial) / (188 * mpp),
    first95 = probe.frames.find(
      (f) => f.t >= move.t && f.r >= initial + (final - initial) * 0.95,
    );
  const latency95 = first95 ? first95.t - move.t : null;
  observations.push({
    phase: "gain",
    gain,
    latency95,
    metresPerPixel: mpp,
    before,
    after: await inspect(),
  });
  check(
    "visible radial gain follows reference 0.156 within 0.025",
    Math.abs(gain - 0.156) < 0.025,
  );
  timingCheck(
    "95 percent of the target arrives within 55 ms",
    latency95 !== null && latency95 >= 0 && latency95 <= 55,
  );
  const release = probe.events.find((e) => e.type === "pointerup"),
    previous = probe.frames.filter((f) => f.t <= release.t).at(-1);
  check(
    "pointer release never changes geometry between animation frames",
    Math.abs(release.r - previous.r) < 1e-9,
  );
  await page.screenshot({ path: `qa/${prefix}-response.png` });
  if (!baseline) {
    await page.keyboard.press("Control+KeyZ");
    await page.waitForTimeout(200);
    const quick = await contact(0.36);
    await page.mouse.move(quick.x, quick.y);
    await page.mouse.down();
    await beginProbe(quick.hit.uv[1]);
    await page.waitForTimeout(40);
    await page.mouse.move(quick.x + 100, quick.y);
    await page.mouse.up();
    await page.waitForTimeout(220);
    const quickProbe = await endProbe("release while moving");
    const quickRelease = quickProbe.events.find((e) => e.type === "pointerup");
    const quickPrevious = quickProbe.frames
      .filter((f) => f.t <= quickRelease.t)
      .at(-1);
    check(
      "immediate release settles through animation frames without a snap",
      Math.abs(quickRelease.r - quickPrevious.r) < 1e-9,
    );
    await page.keyboard.press("Control+KeyZ");
    await page.waitForTimeout(150);
    const rim = await contact(0.98);
    const old = (await inspect()).state.pieces[0].height;
    await drag(rim, [[0, -340]], 1100);
    const lifted = await inspect();
    check(
      "rim pull changes height continuously",
      lifted.state.pieces[0].height > old + 0.07,
    );
    await page.screenshot({ path: `qa/${prefix}-lifted.png` });
    const belly = await contact(0.34);
    await beginProbe(belly.hit.uv[1]);
    await drag(
      belly,
      [
        [360, 0],
        [440, 0],
        [380, 0],
      ],
      1700,
    );
    await page.waitForTimeout(1000);
    const continuous = await endProbe("continuous sculpt");
    timingCheck("continuous sculpt remains above 55 FPS", continuous.fps > 55);
    timingCheck(
      "continuous sculpt P95 remains below 25 ms",
      continuous.p95 < 25,
    );
    const shaped = await inspect();
    check(
      "geometry remains allocated",
      shaped.view.pieceGeometry === before.view.pieceGeometry,
    );
    check(
      "sculpt never uploads a paint texture",
      shaped.view.ceramicUpdates.texture === before.view.ceramicUpdates.texture,
    );
    await page.screenshot({ path: `qa/${prefix}-belly.png` });
    const neck = await contact(0.73),
      neckBefore = await inspect();
    let horizontal;
    await drag(
      neck,
      [
        [-250, 0],
        [-250, -90],
        [-250, -115],
      ],
      1500,
      async (index) => {
        if (index === 0) {
          await page.waitForTimeout(120);
          horizontal = await inspect();
        }
      },
    );
    const swept = await inspect();
    observations.push({
      phase: "sweep",
      contact: neck,
      before: neckBefore,
      horizontal,
      after: swept,
    });
    check(
      "one captured drag shapes higher rows as contact rises",
      swept.state.pieces[0].radius[42] <
        horizontal.state.pieces[0].radius[42] - 0.004,
    );
    await page.screenshot({ path: `qa/${prefix}-sweep.png` });
    const outside = await contact(0.42);
    const saved = (await inspect()).state.pieces[0].radius;
    await drag({ x: outside.x + 18, y: outside.y }, [[100, 0]], 500);
    check(
      "grabs just outside the visible silhouette",
      (await inspect()).state.pieces[0].radius.some(
        (r, i) => Math.abs(r - saved[i]) > 0.001,
      ),
    );
    await page.keyboard.press("Control+KeyZ");
    await page.waitForTimeout(150);
    check(
      "undo restores the pre-stroke profile",
      (await inspect()).state.pieces[0].radius.every((r, i) => r === saved[i]),
    );
    const polish = await contact(0.45);
    await page.keyboard.down("Shift");
    await drag(
      polish,
      [
        [0, -85],
        [30, -130],
      ],
      850,
    );
    await page.keyboard.up("Shift");
    await page.screenshot({ path: `qa/${prefix}-finished.png` });
    observations.push({ phase: "finished", ...(await inspect()) });
    await page.waitForTimeout(600);
  }
} catch (e) {
  errors.push(e.stack);
  process.exitCode = 1;
} finally {
  if (recording) video = await page.video().path();
  await page.close();
  await context.close();
  await browser.close();
  if (video) {
    await fs.copyFile(video, `qa/${prefix}.webm`);
    video = `qa/${prefix}.webm`;
  }
  await fs.writeFile(
    `qa/${prefix}.json`,
    JSON.stringify(
      {
        baseline,
        recording,
        errors,
        checks,
        observations,
        measurements,
        video,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      {
        errors,
        checks,
        metrics: observations
          .filter((o) => o.phase === "gain")
          .map(({ before, after, ...o }) => o),
        frames: measurements.map(({ events, frames, ...m }) => m),
        video,
      },
      null,
      2,
    ),
  );
}
if (errors.length || (!baseline && checks.some((c) => c.passed === false)))
  process.exitCode = 1;
