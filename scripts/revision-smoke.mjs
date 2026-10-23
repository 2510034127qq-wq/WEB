import fs from "node:fs/promises";
import { chromium } from "@playwright/test";

const base = process.env.QA_URL || "http://127.0.0.1:5173/";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const checks = [],
  runtimeErrors = [],
  failedRequests = [],
  responses = [];
let phase = "online-start";
page.on("pageerror", (error) =>
  runtimeErrors.push({ phase, message: error.message }),
);
page.on("requestfailed", (request) =>
  failedRequests.push({
    phase,
    url: request.url(),
    reason: request.failure()?.errorText,
  }),
);
page.on("response", (response) =>
  responses.push({
    phase,
    url: response.url(),
    status: response.status(),
    fromServiceWorker: response.fromServiceWorker(),
  }),
);
const read = () => page.evaluate(() => window.__YAOHUO__.snapshot());
const ready = () =>
  page.waitForFunction(() => window.__YAOHUO__, null, { timeout: 90000 });
const act = (name) => page.locator(`[data-act="${name}"]`).click();
const assert = (condition, name, evidence) => {
  checks.push({ name, passed: !!condition, evidence });
  if (!condition) throw new Error(name + ": " + JSON.stringify(evidence));
};
const planarDistance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
let report;
try {
  await page.goto(base);
  await ready();
  const version = await page.locator(".edition").innerText();
  assert(
    version.includes("v1.1.0-preview.1"),
    "production intro displays the new preview version",
    version,
  );
  const scripts = await page
    .locator("script[src]")
    .evaluateAll((nodes) => nodes.map((node) => node.src));
  assert(
    scripts.some((url) => /\/assets\/index-[^/]+\.js$/.test(url)),
    "serving a compiled production entry, not Vite dev source",
    scripts,
  );
  const assets = [
    "/assets/fab/hanging-pottery.glb",
    "/assets/fab/firewood-pile.glb",
    "/assets/environment/courtyard-sky-2k.hdr",
  ];
  const loadedAssets = assets.map((path) => ({
    path,
    responses: responses.filter(
      (response) => new URL(response.url).pathname === path,
    ),
  }));
  assert(
    loadedAssets.every((asset) =>
      asset.responses.some((response) => response.status === 200),
    ),
    "both Fab GLBs and the HDR were actually requested successfully",
    loadedAssets,
  );
  await page.locator("#start").click();
  await page.waitForTimeout(350);
  assert(
    await page
      .locator("#intro")
      .evaluate((element) => element.classList.contains("hidden")),
    "start enters the interactive workshop",
    true,
  );
  await act("journal");
  const journal = await page.locator(".modal").innerText();
  const links = await page
    .locator(".modal a")
    .evaluateAll((nodes) =>
      nodes.map((node) => ({ text: node.textContent, href: node.href })),
    );
  const pottery = links.find(
    (link) =>
      link.href ===
      "https://www.fab.com/listings/f19a85c6-1938-4a95-8ecc-ee7bc72767d8",
  );
  const firewood = links.find(
    (link) =>
      link.href ===
      "https://www.fab.com/listings/81a65096-1e1b-4133-9c69-3acf87398248",
  );
  const cc = links.find(
    (link) => link.href === "https://creativecommons.org/licenses/by/4.0/",
  );
  assert(
    pottery?.text.includes("Glowbox3D") &&
      firewood?.text.includes("sixonetwo") &&
      cc &&
      journal.includes("比例调整"),
    "journal credits both Fab authors, source pages and CC BY 4.0 with modification disclosure",
    { pottery, firewood, cc },
  );
  await act("close-modal");
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(600);
  await page.keyboard.up("KeyW");
  await page.waitForTimeout(500);
  await act("settings");
  const beforeBinding = await read();
  await act("bind-interact");
  for (const key of ["KeyF", "KeyB", "KeyC", "KeyR", "KeyZ"]) {
    await page.keyboard.press(key);
    assert(
      (await read()).settings.bindings.interact ===
        beforeBinding.settings.bindings.interact,
      `fixed gesture key ${key} cannot be assigned to interact`,
      (await read()).settings.bindings,
    );
  }
  await page.keyboard.press("KeyG");
  assert(
    (await read()).settings.bindings.interact === "KeyG",
    "an unused non-reserved key G can be assigned",
    (await read()).settings.bindings,
  );
  await act("bind-interact");
  await page.keyboard.press("KeyE");
  assert(
    (await read()).settings.bindings.interact === "KeyE",
    "interact can be restored to E",
    (await read()).settings.bindings,
  );
  const saved = await read();
  await act("save");
  await page.waitForTimeout(300);
  const cache = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const keys = await caches.keys();
    const current = keys.find((key) => key.startsWith("yaohuo-"));
    return {
      keys,
      entries: current
        ? (await (await caches.open(current)).keys()).map(
            (request) => new URL(request.url).pathname,
          )
        : [],
    };
  });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, {
    timeout: 30000,
  });
  assert(
    assets.every((asset) => cache.entries.includes(asset)),
    "service worker pre-caches both Fab meshes and HDR",
    cache,
  );
  phase = "online-reload";
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready();
  const restored = await read();
  assert(
    planarDistance(saved.player, restored.player) < 0.005 &&
      restored.settings.bindings.interact === "KeyE",
    "manual save survives a normal reload",
    {
      savedPlayer: saved.player,
      restoredPlayer: restored.player,
      bindings: restored.settings.bindings,
    },
  );
  phase = "offline-reload";
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready();
  const offline = await read();
  await page.locator("#start").click();
  await act("journal");
  assert(
    planarDistance(saved.player, offline.player) < 0.005 &&
      (await page.locator(".modal").innerText()).includes("Glowbox3D"),
    "offline restart loads saved workshop and in-game asset credits",
    { player: offline.player, bob: offline.settings.bob },
  );
  const httpFailures = responses.filter((response) => response.status >= 400);
  assert(
    runtimeErrors.length === 0,
    "no uncaught runtime errors across initial, reload and offline sessions",
    runtimeErrors,
  );
  assert(
    failedRequests.length === 0 && httpFailures.length === 0,
    "no failed network requests or HTTP error responses",
    { failedRequests, httpFailures },
  );
  report = {
    passed: true,
    timestamp: new Date().toISOString(),
    base,
    browser: browser.version(),
    viewport: { width: 1440, height: 900 },
    method:
      "Fresh independent Chrome context; production entry, actual asset request tracking, public UI credits and keybinding controls, IndexedDB save/reload and service-worker offline restart. No game state mutation through diagnostics.",
    limitations:
      "Focused production smoke only; does not repeat craft gesture QA or make a photorealism acceptance claim.",
    checks,
    responseCount: responses.length,
    loadedAssets,
    runtimeErrors,
    failedRequests,
    scripts,
    cache,
  };
} catch (error) {
  report = {
    passed: false,
    timestamp: new Date().toISOString(),
    base,
    error: error.stack,
    checks,
    runtimeErrors,
    failedRequests,
    responses,
  };
} finally {
  await fs.writeFile("qa/revision-smoke.json", JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        passed: report.passed,
        error: report.error,
        checks: checks.map((check) => ({
          name: check.name,
          passed: check.passed,
        })),
        runtimeErrors,
        failedRequests,
      },
      null,
      2,
    ),
  );
  await context.close();
  await browser.close();
}
if (!report.passed) process.exitCode = 1;
