import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
process.env.PLAYWRIGHT_BROWSERS_PATH = fileURLToPath(
  new URL("../.tmp/playwright", import.meta.url),
);
const { chromium } = await import("@playwright/test");
const base = process.env.QA_URL || "http://127.0.0.1:5190/";
const output = fileURLToPath(new URL("../qa/", import.meta.url));
const prefix = process.env.QA_PREFIX || "walk";
await fs.mkdir(output + "walk-video", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  recordVideo: {
    dir: output + "walk-video",
    size: { width: 1440, height: 900 },
  },
});
const page = await context.newPage();
const errors = [],
  stages = [],
  frames = [];
let recordingStart = 0,
  reloaded = false,
  sampling = true;
page.on("pageerror", (e) => errors.push(e.message));
page.on("framenavigated", (frame) => {
  if (recordingStart && frame === page.mainFrame()) reloaded = true;
});
const read = () =>
  page.evaluate(() => ({
    time: performance.now(),
    player: window.__YAOHUO__.snapshot().player,
    bob: window.__YAOHUO__.snapshot().settings.bob,
    exposure:window.__YAOHUO__.stats().exposure,
    ...window.__YAOHUO__.view(),
  }));
const mark = async (label) => {
  const state = await read();
  stages.push({ label, ...state });
  return state;
};
const wait = (ms) => page.waitForTimeout(ms);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
async function aim(target) {
  const current = await read();
  const yaw = Math.atan2(
    -(target[0] - current.player[0]),
    -(target[2] - current.player[2]),
  );
  const angle = Math.atan2(
    Math.sin(current.look.yaw - yaw),
    Math.cos(current.look.yaw - yaw),
  );
  await page.mouse.move(720, 450);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(720 + angle / 0.002, 450, { steps: 24 });
  await page.mouse.up({ button: "right" });
}
let result;
try {
  await page.goto(base);
  await page.waitForFunction(() => window.__YAOHUO__, null, { timeout: 120000 });
  await page.locator("#start").click();
  recordingStart = performance.now();
  const sample = (async () => {
    while (sampling) {
      try {
        frames.push(await read());
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  })();
  await wait(400);
  const first = await mark("fresh-start");
  await page.keyboard.down("KeyW");
  await mark("walk-start");
  await wait(1800);
  await page.keyboard.up("KeyW");
  const released = await mark("walk-release");
  await wait(700);
  const settled = await mark("stop-settled");
  await wait(650);
  const stopped = await mark("stop-stable");
  await page.screenshot({ path: output + prefix + "-standing.png" });
  await page.keyboard.down("KeyD");
  await mark("strafe-start");
  await wait(850);
  await page.keyboard.up("KeyD");
  await wait(350);
  await mark("strafe-end");
  await page.mouse.move(720, 450);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(960, 450, { steps: 24 });
  await page.mouse.up({ button: "right" });
  await mark("right-drag-turn");
  await wait(250);
  await page.keyboard.down("ControlLeft");
  await wait(650);
  const crouched = await mark("crouched");
  await page.screenshot({ path: output + prefix + "-crouched.png" });
  await page.keyboard.up("ControlLeft");
  await wait(650);
  const standing = await mark("stood-up");
  await aim([0, 0, -5.6]);
  await page.keyboard.down("ShiftLeft");
  await page.keyboard.down("KeyW");
  await mark("run-toward-wheel");
  await wait(2000);
  // The approach is diagonal; turn to face the obstacle head-on so legitimate
  // wall sliding is not mistaken for failed collision or forward creep.
  const contactPosition = await read();
  await aim([contactPosition.player[0], 0, contactPosition.player[2] - 3]);
  await wait(350);
  const obstacleFirst = await mark("held-forward-at-obstacle");
  await wait(650);
  const obstacleLast = await mark("still-held-at-obstacle");
  await page.keyboard.up("KeyW");
  await page.keyboard.up("ShiftLeft");
  await wait(550);
  const finalFirst = await mark("final-settled");
  await wait(650);
  const finalLast = await mark("final-stable");
  // Record an actual bright-to-sheltered-to-bright transition. The small meter
  // must be judged during movement, not only after a static view has settled.
  await page.locator('[data-act="map"]').click();
  await page.locator('[data-act="go-supply"]').click();
  await page.waitForFunction(()=>window.__YAOHUO__.view().nav===0,null,{timeout:60000});
  await page.keyboard.press('KeyE');await wait(3500);
  await mark('supply-exposure-settled');
  await page.screenshot({path:output+prefix+'-sheltered.png'});
  await page.keyboard.press('Escape');await aim([0,0,0]);
  await page.keyboard.down('KeyW');await wait(1800);await page.keyboard.up('KeyW');
  await wait(3000);await mark('courtyard-exposure-settled');
  await page.screenshot({path:output+prefix+'-daylight.png'});
  sampling = false;
  await sample;
  const walking = frames.filter(
    (f) =>
      f.time > stages.find((s) => s.label === "walk-start").time + 500 &&
      f.time < released.time,
  );
  const y = walking.map((f) => f.camera[1] - f.player[1]);
  const stationary = frames.filter(
    (f) => f.time >= settled.time && f.time <= stopped.time,
  );
  const cameraHeight = stationary.map((f) => f.camera[1]);
  const checks = {
    defaultBobEnabled: first.bob === true,
    forwardTravelMetres: dist(first.player, released.player),
    inertialStopMetres: dist(released.player, settled.player),
    settledPlayerDriftMetres: dist(settled.player, stopped.player),
    crouchCameraDropMetres: standing.camera[1] - crouched.camera[1],
    walkingCameraVerticalRangeMetres: Math.max(...y) - Math.min(...y),
    restingCameraBreathingRangeMetres:
      Math.max(...cameraHeight) - Math.min(...cameraHeight),
    blockedPlayerTravelMetres: dist(obstacleFirst.player, obstacleLast.player),
    finalPlayerDriftMetres: dist(finalFirst.player, finalLast.player),
    recordedInputSeconds: (performance.now() - recordingStart) / 1000,
  };
  const passed =
    !reloaded &&
    !errors.length &&
    checks.defaultBobEnabled &&
    checks.forwardTravelMetres > 1.5 &&
    checks.forwardTravelMetres < 3 &&
    checks.inertialStopMetres > 0.02 &&
    checks.inertialStopMetres < 0.25 &&
    checks.settledPlayerDriftMetres < 0.005 &&
    checks.finalPlayerDriftMetres < 0.005 &&
    checks.crouchCameraDropMetres > 0.4 &&
    checks.crouchCameraDropMetres < 0.52 &&
    checks.walkingCameraVerticalRangeMetres > 0.004 &&
    checks.walkingCameraVerticalRangeMetres < 0.06 &&
    checks.blockedPlayerTravelMetres < 0.03;
  result = {
    timestamp: new Date().toISOString(),
    url: base,
    viewport: { width: 1440, height: 900 },
    method:
      "Fresh browser context; real keyboard, right-button mouse and public workshop-map navigation; includes entering the supply bay and walking back to daylight. Only read-only camera/player/exposure diagnostics. No save import, state writes or test movement hooks.",
    limitations:
      "No audio recording or listening assessment. Collision confirms stopped translation; footstep event suppression is separately covered by unit tests. This is a locomotion check, not the full craft loop.",
    passed,
    reloaded,
    errors,
    checks,
    stages,
    samples: frames,
  };
} catch (error) {
  sampling = false;
  result = {
    passed: false,
    error: error.stack,
    errors,
    reloaded,
    stages,
    samples: frames,
  };
} finally {
  sampling = false;
  const video = page.video();
  const actionDuration=recordingStart?(performance.now()-recordingStart)/1000:0;
  await context.close();
  const raw = await video.path();
  const ffmpeg = fileURLToPath(
    new URL("../.tmp/playwright/ffmpeg-1013/ffmpeg-win64.exe", import.meta.url),
  );
  const info = spawnSync(ffmpeg, ["-i", raw], {
    encoding: "utf8",
    windowsHide: true,
  });
  const match = info.stderr?.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
  const duration = match ? +match[1] * 3600 + +match[2] * 60 + +match[3] : 0;
  const reviewDuration=Math.min(duration,Math.max(14.5,actionDuration+1));
  if (duration > reviewDuration) {
    const trim = spawnSync(
      ffmpeg,
      [
        "-ss",
        String(Math.max(0, duration - reviewDuration)),
        "-i",
        raw,
        "-t",
        String(reviewDuration),
        "-c:v",
        "libvpx-vp9",
        "-deadline",
        "realtime",
        "-cpu-used",
        "6",
        "-b:v",
        "0",
        "-crf",
        "24",
        "-y",
        output + prefix + "-review.webm",
      ],
      { encoding: "utf8", windowsHide: true },
    );
    if (trim.status !== 0) throw new Error(trim.stderr);
  } else await fs.copyFile(raw, output + prefix + "-review.webm");
  const deliveredProbe = spawnSync(
    ffmpeg,
    ["-i", output + prefix + "-review.webm"],
    {
      encoding: "utf8",
      windowsHide: true,
    },
  );
  const deliveredMatch = deliveredProbe.stderr?.match(
    /Duration: (\d+):(\d+):(\d+\.\d+)/,
  );
  const deliveredDuration = deliveredMatch
    ? +deliveredMatch[1] * 3600 + +deliveredMatch[2] * 60 + +deliveredMatch[3]
    : 0;
  result.video = {
    raw,
    delivered: `qa/${prefix}-review.webm`,
    rawDurationSeconds: duration,
    deliveredDurationSeconds: deliveredDuration,
    trimmedLoadingLeadIn: duration > reviewDuration,
  };
  await fs.writeFile(
    process.env.QA_REPORT||output + "walk-check.json",
    JSON.stringify(result, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        passed: result.passed,
        error: result.error,
        checks: result.checks,
        video: result.video,
        errors,
      },
      null,
      2,
    ),
  );
  await browser.close();
}
if (!result.passed) process.exitCode = 1;
